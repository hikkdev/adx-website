import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api-client";
import {
    attachmentProblem,
    categoryLabel,
    chatMessageOf,
    chatMessageOfEvent,
    dayBadge,
    describeRating,
    fallbackLine,
    feedbackProblem,
    fileIdFromUrl,
    isLiveChat,
    issueProblem,
    lastEventId,
    liveEnded,
    notEntitled,
    openStream,
    orderTickets,
    parseSse,
    presenceLine,
    ratingTicket,
    reconnectDelay,
    seenTick,
    showsUpsell,
    statusLabel,
    supportService,
    systemLine,
    ticketReference,
    upsellHref,
    upsellLine,
    visibleMessages,
    withMessage,
    type ChatMessage,
    type LiveStatus,
    type StreamEvent,
    type TicketMessage,
} from "./support";

type Call = { url: string; init: RequestInit };

function stubFetch(answer: unknown, status = 200): Call[] {
    const calls: Call[] = [];
    vi.stubGlobal(
        "fetch",
        vi.fn(async (url: string, init: RequestInit) => {
            calls.push({ url, init });
            const body = status < 400 ? { success: true, data: answer } : answer;
            return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
        })
    );
    return calls;
}

afterEach(() => {
    vi.unstubAllGlobals();
});

const status = (over: Partial<LiveStatus> = {}): LiveStatus => ({
    entitled: true,
    reason: "ADVERTISER_PACKAGE",
    plan: null,
    upsell: { title: "Live chat comes with a plan", href: "adx://plans" },
    online: true,
    expectedWaitSec: 60,
    withinHours: true,
    nextOpening: null,
    nextOpeningLabel: null,
    firstResponseTargetSec: 120,
    ...over,
});

const chat = (over: Partial<ChatMessage> = {}): ChatMessage => ({ id: "m1", authorId: "u1", authorName: "Me", mine: true, kind: "TEXT", message: "hi", attachment: null, createdAt: "2026-09-26T10:00:00.000Z", seenAt: null, ...over });

describe("the stream", () => {
    it("splits whole frames from the tail still being written, and skips comments", () => {
        const { frames, rest } = parseSse(': heartbeat\n\nevent: message\nid: 17\ndata: {"a":1}\n\nevent: typing\ndata: {"b"');
        expect(frames).toEqual([{ event: "message", data: '{"a":1}', id: "17" }]);
        expect(rest).toBe('event: typing\ndata: {"b"');
        expect(parseSse("data: one\ndata: two\n\n").frames[0]).toEqual({ event: "message", data: "one\ntwo", id: null });
        expect(parseSse("event: seen\r\ndata: {}\r\n\r\n").frames[0]!.event).toBe("seen");
    });

    it("opens with the bearer and Last-Event-ID, and hands each named event over", async () => {
        window.localStorage.setItem("adx.web.accessToken", "tok");
        const encoder = new TextEncoder();
        const body = new ReadableStream<Uint8Array>({
            start(controller) {
                controller.enqueue(encoder.encode('event: typing\ndata: {"type":"typing","who":"agent","typing":true}\n\nevent: unknown\ndata: {}\n\n'));
                controller.enqueue(encoder.encode('event: seen\ndata: {"type":"seen","who":"agent","at":"2026-09-26T10:00:00Z"}\n\n'));
                controller.close();
            },
        });
        const fetcher = vi.fn(async () => new Response(body, { status: 200 }));
        const events: StreamEvent[] = [];
        const opened = vi.fn();
        const outcome = await openStream("http://api/x/events", "1700", { onOpen: opened, onEvent: (e) => events.push(e) }, new AbortController().signal, fetcher as unknown as typeof fetch);
        const init = fetcher.mock.calls[0] as unknown as [string, RequestInit];
        expect((init[1].headers as Record<string, string>).Authorization).toBe("Bearer tok");
        expect((init[1].headers as Record<string, string>)["Last-Event-ID"]).toBe("1700");
        expect(opened).toHaveBeenCalledOnce();
        expect(events.map((e) => e.type)).toEqual(["typing", "seen"]);
        /* The socket ending on its own is an error to reconnect from. */
        expect(outcome).toEqual({ kind: "error", status: null });
        window.localStorage.removeItem("adx.web.accessToken");
    });

    it("reports a refused open with its status", async () => {
        const fetcher = vi.fn(async () => new Response("no", { status: 401 }));
        const outcome = await openStream("http://api/x", null, { onOpen: vi.fn(), onEvent: vi.fn() }, new AbortController().signal, fetcher as unknown as typeof fetch);
        expect(outcome).toEqual({ kind: "error", status: 401 });
    });

    it("backs off from a second to fifteen", () => {
        expect([1, 2, 3, 4, 5, 9].map(reconnectDelay)).toEqual([1000, 2000, 4000, 8000, 15000, 15000]);
    });
});

describe("the chat", () => {
    it("adds a message once, oldest first", () => {
        const a = chat({ id: "a", createdAt: "2026-09-26T10:00:00Z" });
        const b = chat({ id: "b", createdAt: "2026-09-26T09:00:00Z" });
        const merged = withMessage(withMessage([a], b), { ...a, message: "edited" });
        expect(merged.map((m) => m.id)).toEqual(["b", "a"]);
        expect(merged[1]!.message).toBe("edited");
    });

    it("ticks once for sent and twice once the desk has read it", () => {
        expect(seenTick(chat(), null)).toBe("sent");
        expect(seenTick(chat(), "2026-09-26T10:05:00Z")).toBe("seen");
        expect(seenTick(chat({ seenAt: "x" }), null)).toBe("seen");
        expect(seenTick(chat({ mine: false }), null)).toBeNull();
        expect(seenTick(chat({ kind: "SYSTEM" }), null)).toBeNull();
    });

    it("reads a thread row and an event into one shape", () => {
        const message: TicketMessage = { id: "m", ticketId: "t", authorId: "u1", authorName: "Me", message: "", createdAt: "x", kind: "ATTACHMENT", attachmentFileId: "f1", attachmentName: "a.pdf" };
        expect(chatMessageOf(message, { userId: "u1" })).toMatchObject({ mine: true, attachment: { fileId: "f1", name: "a.pdf" } });
        expect(chatMessageOf({ ...message, kind: "SYSTEM" }, { userId: "u1" }).mine).toBe(false);
        expect(chatMessageOfEvent({ type: "message", id: "e", authorId: "a", authorName: "Priya", kind: "TEXT", message: "hello", attachment: null, internal: false, mine: false, createdAt: "x" }).mine).toBe(false);
    });

    it("resumes from the newest message", () => {
        expect(lastEventId(null)).toBeNull();
        expect(lastEventId({ lastMessageAt: null, messages: [] })).toBeNull();
        const at = new Date("2026-09-26T10:00:00Z").getTime();
        expect(lastEventId({ lastMessageAt: "2026-09-26T09:00:00Z", messages: [{ createdAt: "2026-09-26T10:00:00Z" } as TicketMessage] })).toBe(String(at));
    });

    it("knows when the live pace is over", () => {
        expect(isLiveChat({ channel: "LIVE_CHAT" })).toBe(true);
        expect(liveEnded({ channel: "LIVE_CHAT", status: "OPEN" })).toBeNull();
        expect(liveEnded({ channel: "TICKET", status: "OPEN" })).toBe("CONVERTED");
        expect(liveEnded({ channel: "LIVE_CHAT", status: "CLOSED" })).toBe("CLOSED");
    });

    it("says how long an answer takes, or when the desk opens", () => {
        expect(presenceLine(null)).toBe("Checking the desk…");
        expect(presenceLine(status())).toBe("Typically replies in under 2 minutes");
        expect(presenceLine(status({ firstResponseTargetSec: 30 }))).toBe("Typically replies in under 1 minute");
        expect(presenceLine(status({ online: false, nextOpeningLabel: "9:00 am IST on Tue 15 Sep" }))).toBe("Offline until 9:00 am IST on Tue 15 Sep");
        expect(presenceLine(status({ online: false }))).toBe("Offline — ADX will reply on this ticket");
        expect(presenceLine(status(), "CLOSED")).toBe("This chat has ended");
        expect(fallbackLine(null)).toBe("Nobody is on live chat. ADX will reply on this ticket.");
        expect(systemLine("Opens at 2026-09-26T03:30:00.000Z.")).not.toContain("2026-09-26T");
    });

    it("offers the upsell only to somebody who could pay", () => {
        expect(showsUpsell(status())).toBe(false);
        expect(showsUpsell(status({ entitled: false, reason: "NOT_SUBSCRIBED" }))).toBe(true);
        expect(showsUpsell(status({ entitled: false, reason: "NOT_A_SUBSCRIBER_ROLE" }))).toBe(false);
        expect(showsUpsell(status({ entitled: false, reason: "FEATURE_OFF" }))).toBe(false);
        expect(upsellLine(status({ plan: { name: "Growth", tier: "G" } }))).toBe("Live chat is part of the Growth plan");
        expect(upsellHref("ADVERTISER")).toBe("/advertiser/plans");
        expect(upsellHref("PUBLISHER")).toBe("/publisher/subscription");
        expect(upsellHref("PRINT_PARTNER")).toBeNull();
        expect(notEntitled(new ApiError(403, "NOT_ENTITLED", "no"))).toBe(true);
    });

    it("draws day labels", () => {
        const now = new Date("2026-09-26T12:00:00");
        expect(dayBadge("2026-09-26T08:00:00", now)).toBe("Today");
        expect(dayBadge("2026-09-25T08:00:00", now)).toBe("Yesterday");
        expect(dayBadge("2026-07-05T08:00:00", now)).toBe("05 Jul");
        expect(dayBadge("2025-07-05T08:00:00", now)).toBe("05 Jul 2025");
    });
});

describe("tickets, feedback and the rating", () => {
    it("checks what a person wrote before it is sent", () => {
        expect(issueProblem(" ")).toBe("Tell us what happened.");
        expect(issueProblem("short")).toMatch(/few more words/);
        expect(issueProblem("The invoice total is wrong")).toBeNull();
        expect(feedbackProblem("")).toMatch(/little more/);
        expect(attachmentProblem({ size: 11 * 1024 * 1024 })).toBe("Attachments go up to 10 MB.");
        expect(attachmentProblem({ size: 1024 })).toBeNull();
    });

    it("writes the rating as a feedback ticket with the score as a column", () => {
        expect(describeRating(4, ["Orders", "App speed"], "")).toBe("Rated 4 of 5 — good. What stood out: orders, app speed.");
        expect(describeRating(2, [], " Slow payouts ")).toBe("Slow payouts");
        expect(ratingTicket(5, ["Support"], "")).toEqual({ kind: "FEEDBACK", category: "IDEA", description: "Rated 5 of 5 — excellent. What stood out: support.", rating: 5, tags: ["Support"] });
    });

    it("names and orders tickets", () => {
        expect(ticketReference({ id: "abcdef1234", displayId: null })).toBe("#1234");
        expect(ticketReference({ id: "x", displayId: "FB-0042" })).toBe("FB-0042");
        expect(categoryLabel("APP_BUG")).toBe("App or website bug");
        expect(categoryLabel("CONTENT")).toBe("Content issue");
        expect(categoryLabel("SOMETHING_NEW")).toBe("Something new");
        expect(statusLabel("WAITING")).toEqual({ label: "Waiting on you", tone: "warning" });
        const ordered = orderTickets([
            { id: "a", status: "CLOSED" as const, updatedAt: "2026-09-26" },
            { id: "b", status: "OPEN" as const, updatedAt: "2026-09-20" },
            { id: "c", status: "OPEN" as const, updatedAt: "2026-09-25" },
        ]);
        expect(ordered.map((t) => t.id)).toEqual(["c", "b", "a"]);
        expect(visibleMessages([{ internal: true } as TicketMessage, { internal: false } as TicketMessage])).toHaveLength(1);
    });

    it("finds the private file behind a URL", () => {
        expect(fileIdFromUrl("http://localhost:3000/api/v1/files/abc_123")).toBe("abc_123");
        expect(fileIdFromUrl("https://cdn.example/uploads/x.png")).toBeNull();
        expect(fileIdFromUrl(null)).toBeNull();
    });

    it("sends the request shapes the desk reads", async () => {
        const calls = stubFetch({ id: "t1" });
        await supportService.tickets({ status: "OPEN" });
        await supportService.create({ kind: "FEEDBACK", description: "More filters please", category: "IDEA", attachmentUrls: [] });
        await supportService.reply("t1", "", "file-1");
        await supportService.liveStart({ message: "Hello" });
        await supportService.typing("t1", true);
        await supportService.seen("t1");
        expect(calls.map((c) => `${c.init.method} ${c.url.replace(/^.*\/api\/v1/, "")}`)).toEqual([
            "GET /support/tickets?status=OPEN&limit=100",
            "POST /support/tickets",
            "POST /support/tickets/t1/reply",
            "POST /support/live/start",
            "POST /support/tickets/t1/typing",
            "POST /support/tickets/t1/seen",
        ]);
        expect(JSON.parse(String(calls[2]!.init.body))).toEqual({ message: "", attachmentFileId: "file-1" });
        expect(JSON.parse(String(calls[4]!.init.body))).toEqual({ typing: true });
        expect(supportService.streamUrl("t 1", "17")).toMatch(/\/support\/tickets\/t%201\/events\?lastEventId=17$/);
    });

    it("uploads an attachment privately", async () => {
        const calls = stubFetch({ id: "f1", url: "http://x/files/f1" });
        await supportService.upload(new File(["x"], "shot.png", { type: "image/png" }));
        const form = calls[0]!.init.body as FormData;
        expect(form.get("purpose")).toBe("SUPPORT_ATTACHMENT");
    });
});
