import { api, apiBlob, ApiError, tokens } from "@/lib/api-client";
import { apiConfig } from "@/lib/api-config";

/**
 * Support on the web — the ADX app's `mobile/shared/features/support/*`
 * over the same `/support` routes: tickets (TKT-…), feedback (FB-…, a ticket
 * wearing `kind: 'FEEDBACK'`), the periodic "Rate your experience" (a
 * feedback ticket with a `rating` column and `tags`), and live chat — the
 * same ticket wearing `channel: 'LIVE_CHAT'`, streamed over
 * `GET /support/tickets/:id/events` (SSE).
 *
 * The browser's `EventSource` cannot set a bearer header, so the stream is
 * read with `fetch` and the header, the way the phones' SSE library does,
 * and parsed here (`parseSse`) — no second auth door, no library.
 */

export type TicketKind = "ISSUE" | "FEEDBACK";
export type TicketStatus = "OPEN" | "WAITING" | "CLOSED";
export type IssueCategory = "APP_BUG" | "ORDER" | "PAYMENT" | "LISTING" | "ACCOUNT" | "ACCESS" | "OTHER";
export type FeedbackCategory = "IDEA" | "PROBLEM" | "CONTENT";

/** The categories on Report an issue — the app's five, and the two the desk also takes. */
export const ISSUE_CATEGORIES: { id: IssueCategory; label: string }[] = [
    { id: "APP_BUG", label: "App or website bug" },
    { id: "ORDER", label: "Order issue" },
    { id: "PAYMENT", label: "Payment" },
    { id: "LISTING", label: "Listing" },
    { id: "ACCOUNT", label: "Account" },
    { id: "ACCESS", label: "Agent access" },
    { id: "OTHER", label: "Something else" },
];

/** The chips on Suggest a feature. */
export const FEEDBACK_CATEGORIES: { id: FeedbackCategory; label: string }[] = [
    { id: "IDEA", label: "Idea" },
    { id: "PROBLEM", label: "Problem" },
    { id: "CONTENT", label: "Content issue" },
];

export interface TicketMessage {
    id: string;
    ticketId: string;
    authorId: string;
    authorName: string;
    message: string;
    createdAt: string;
    internal?: boolean;
    kind?: "TEXT" | "ATTACHMENT" | "SYSTEM";
    attachmentFileId?: string | null;
    attachmentName?: string | null;
    seenAt?: string | null;
}

export interface SupportTicket {
    id: string;
    userId: string;
    kind: TicketKind;
    displayId: string | null;
    title: string;
    description: string;
    category: string;
    status: TicketStatus;
    priority?: string | null;
    relatedOrderId: string | null;
    attachmentUrls: string[];
    rating?: number | null;
    tags?: string[];
    assignedAgentId?: string | null;
    createdAt: string;
    updatedAt: string;
    messages?: TicketMessage[];
    channel?: "TICKET" | "LIVE_CHAT";
    requesterSeenAt?: string | null;
    agentSeenAt?: string | null;
    firstResponseAt?: string | null;
    lastMessageAt?: string | null;
    assignedAdmin?: { id: string; name: string | null } | null;
}

export type TicketThread = SupportTicket & { messages: TicketMessage[] };

export interface NewTicket {
    kind?: TicketKind;
    rating?: number;
    tags?: string[];
    title?: string;
    description: string;
    category: IssueCategory | FeedbackCategory;
    relatedOrderId?: string;
    attachmentUrls?: string[];
}

/** What a ticket or feedback may carry, per the app. */
export const MAX_ATTACHMENTS = 5;
/** `support.liveChat.attachmentMaxMb` — refused here before the round trip. */
export const ATTACHMENT_MAX_MB = 10;

/* ------------------------------------------------------------------ */
/* Live chat                                                           */
/* ------------------------------------------------------------------ */

export type EntitlementReason = "PUBLISHER_SUBSCRIPTION" | "ADVERTISER_PACKAGE" | "NOT_SUBSCRIBED" | "NOT_A_SUBSCRIBER_ROLE" | "PLAN_EXCLUDED" | "FEATURE_OFF";

export interface LiveStatus {
    entitled: boolean;
    reason: EntitlementReason;
    plan: { name: string; tier: string } | null;
    upsell: { title: string; href: string };
    online: boolean;
    expectedWaitSec: number | null;
    withinHours: boolean;
    nextOpening: string | null;
    nextOpeningLabel: string | null;
    firstResponseTargetSec: number;
}

export interface LiveStartResult {
    ticketId: string;
    displayId: string | null;
    channel: "LIVE_CHAT" | "TICKET";
    continued: boolean;
    assignedAdmin: { id: string; name: string | null } | null;
    fallback?: "TICKET";
    nextOpening?: string | null;
}

export type StreamEvent =
    | {
          type: "message";
          id: string;
          authorId: string;
          authorName: string;
          kind: "TEXT" | "ATTACHMENT" | "SYSTEM";
          message: string;
          attachment: { fileId: string; name: string } | null;
          internal: boolean;
          mine: boolean;
          createdAt: string;
      }
    | { type: "typing"; who: "requester" | "agent"; typing: boolean }
    | { type: "seen"; who: "requester" | "agent"; at: string }
    | { type: "status"; status: string; channel: string }
    | { type: "assigned"; name: string | null; adminUserId: string | null };

export const STREAM_EVENTS = ["message", "typing", "seen", "status", "assigned"] as const;

export const TYPING_THROTTLE_MS = 2_000;
export const TYPING_IDLE_MS = 6_000;
export const TYPING_CLEAR_DEBOUNCE_MS = 500;
export const STREAM_BACKOFF_MS = { first: 1_000, cap: 15_000 } as const;
export const STREAM_UNAUTHORISED_LIMIT = 2;

export const LINK_LINE = { reconnecting: "Reconnecting…", failed: "Could not reconnect — refresh to retry" } as const;

export function reconnectDelay(failures: number): number {
    return Math.min(STREAM_BACKOFF_MS.cap, STREAM_BACKOFF_MS.first * 2 ** Math.max(0, failures - 1));
}

export const supportService = {
    tickets: (opts: { status?: TicketStatus; kind?: TicketKind } = {}) => {
        const params = new URLSearchParams();
        if (opts.status) params.set("status", opts.status);
        if (opts.kind) params.set("kind", opts.kind);
        params.set("limit", "100");
        return api.get<SupportTicket[]>(`/support/tickets?${params.toString()}`);
    },
    ticket: (id: string) => api.get<TicketThread>(`/support/tickets/${encodeURIComponent(id)}`),
    create: (body: NewTicket) => api.post<SupportTicket>("/support/tickets", body),
    /** A reply; `attachmentFileId` names a SUPPORT_ATTACHMENT upload, and the text may be empty when a file rides alone. */
    reply: (id: string, message: string, attachmentFileId?: string) =>
        api.post<TicketMessage>(`/support/tickets/${encodeURIComponent(id)}/reply`, { message, ...(attachmentFileId ? { attachmentFileId } : {}) }),
    setStatus: (id: string, status: "OPEN" | "CLOSED") => api.patch<SupportTicket>(`/support/tickets/${encodeURIComponent(id)}/status`, { status }),
    /** A support attachment is private: `POST /upload` under SUPPORT_ATTACHMENT, read back through `/files/:id`. */
    upload: (file: File) => {
        const form = new FormData();
        form.append("file", file, file.name);
        form.append("purpose", "SUPPORT_ATTACHMENT");
        return api.post<{ id: string; url: string }>("/upload", form);
    },
    file: (fileId: string) => apiBlob(`/files/${encodeURIComponent(fileId)}`),

    /* Live chat. */
    liveStatus: () => api.get<LiveStatus>("/support/live/status"),
    liveStart: (body: { message: string; relatedOrderId?: string; attachmentFileId?: string }) => api.post<LiveStartResult>("/support/live/start", body),
    typing: (id: string, typing: boolean) => api.post<{ typing: boolean; published: boolean }>(`/support/tickets/${encodeURIComponent(id)}/typing`, { typing }),
    seen: (id: string) => api.post<{ requesterSeenAt: string | null; agentSeenAt: string | null }>(`/support/tickets/${encodeURIComponent(id)}/seen`, {}),
    streamUrl: (id: string, lastEventId?: string | null) =>
        `${apiConfig.baseUrl}/support/tickets/${encodeURIComponent(id)}/events${lastEventId ? `?lastEventId=${encodeURIComponent(lastEventId)}` : ""}`,
};

/* ------------------------------------------------------------------ */
/* The stream                                                          */
/* ------------------------------------------------------------------ */

export interface SseFrame {
    event: string;
    data: string;
    id: string | null;
}

/**
 * Splits what the socket has sent so far into whole frames and the tail
 * still being written — the SSE wire format: fields per line, a blank line
 * ends a frame, `:` starts a comment (the server's heartbeat).
 */
export function parseSse(buffer: string): { frames: SseFrame[]; rest: string } {
    const normalised = buffer.replace(/\r\n?/g, "\n");
    const blocks = normalised.split("\n\n");
    const rest = blocks.pop() ?? "";
    const frames: SseFrame[] = [];
    for (const block of blocks) {
        let event = "message";
        const data: string[] = [];
        let id: string | null = null;
        for (const line of block.split("\n")) {
            if (!line || line.startsWith(":")) continue;
            const colon = line.indexOf(":");
            const field = colon === -1 ? line : line.slice(0, colon);
            const value = colon === -1 ? "" : line.slice(colon + 1).replace(/^ /, "");
            if (field === "event") event = value;
            else if (field === "data") data.push(value);
            else if (field === "id") id = value;
        }
        if (data.length) frames.push({ event, data: data.join("\n"), id });
    }
    return { frames, rest };
}

export type StreamOutcome = { kind: "closed" } | { kind: "error"; status: number | null };

/**
 * Opens the stream with the bearer and hands each named event to `onEvent`
 * until the socket ends or `signal` aborts. Answers how it ended, so the
 * caller can back off and reopen, or stop after two 401s.
 */
export async function openStream(
    url: string,
    lastEventId: string | null,
    handlers: { onOpen: () => void; onEvent: (event: StreamEvent) => void },
    signal: AbortSignal,
    fetcher: typeof fetch = fetch
): Promise<StreamOutcome> {
    const headers: Record<string, string> = { Accept: "text/event-stream" };
    const token = tokens.access;
    if (token) headers.Authorization = `Bearer ${token}`;
    if (lastEventId) headers["Last-Event-ID"] = lastEventId;
    let response: Response;
    try {
        response = await fetcher(url, { headers, signal, cache: "no-store" });
    } catch {
        return signal.aborted ? { kind: "closed" } : { kind: "error", status: null };
    }
    if (!response.ok || !response.body) return { kind: "error", status: response.status };
    handlers.onOpen();
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    try {
        for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const parsed = parseSse(buffer);
            buffer = parsed.rest;
            for (const frame of parsed.frames) {
                if (!(STREAM_EVENTS as readonly string[]).includes(frame.event)) continue;
                try {
                    handlers.onEvent(JSON.parse(frame.data) as StreamEvent);
                } catch {
                    /* A half-written frame is not worth a banner; the next one lands. */
                }
            }
        }
    } catch {
        return signal.aborted ? { kind: "closed" } : { kind: "error", status: null };
    }
    return signal.aborted ? { kind: "closed" } : { kind: "error", status: null };
}

/* ------------------------------------------------------------------ */
/* The chat, as the page holds it                                      */
/* ------------------------------------------------------------------ */

export interface ChatMessage {
    id: string;
    authorId: string;
    authorName: string;
    mine: boolean;
    kind: "TEXT" | "ATTACHMENT" | "SYSTEM";
    message: string;
    attachment: { fileId: string; name: string } | null;
    createdAt: string;
    seenAt: string | null;
}

export function chatMessageOf(message: TicketMessage, ticket: Pick<SupportTicket, "userId">): ChatMessage {
    return {
        id: message.id,
        authorId: message.authorId,
        authorName: message.authorName,
        mine: message.kind !== "SYSTEM" && message.authorId === ticket.userId,
        kind: message.kind ?? "TEXT",
        message: message.message,
        attachment: message.attachmentFileId ? { fileId: message.attachmentFileId, name: message.attachmentName ?? "Attachment" } : null,
        createdAt: message.createdAt,
        seenAt: message.seenAt ?? null,
    };
}

export function chatMessageOfEvent(event: Extract<StreamEvent, { type: "message" }>): ChatMessage {
    return {
        id: event.id,
        authorId: event.authorId,
        authorName: event.authorName,
        mine: event.kind !== "SYSTEM" && event.mine,
        kind: event.kind,
        message: event.message,
        attachment: event.attachment,
        createdAt: event.createdAt,
        seenAt: null,
    };
}

/** Adds a message to the thread, oldest first, and never twice — the id is the identity. */
export function withMessage(messages: readonly ChatMessage[], next: ChatMessage): ChatMessage[] {
    const at = messages.findIndex((message) => message.id === next.id);
    const merged = at >= 0 ? messages.map((message, index) => (index === at ? { ...message, ...next } : message)) : [...messages, next];
    return merged.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
}

/** One tick for sent, two once the desk has read it. */
export function seenTick(message: ChatMessage, agentSeenAt: string | null): "sent" | "seen" | null {
    if (!message.mine || message.kind === "SYSTEM") return null;
    if (message.seenAt) return "seen";
    if (agentSeenAt && new Date(agentSeenAt).getTime() >= new Date(message.createdAt).getTime()) return "seen";
    return "sent";
}

/** Where the stream resumes: the newest message's instant in milliseconds, the server's event id. */
export function lastEventId(ticket: Pick<TicketThread, "lastMessageAt" | "messages"> | null): string | null {
    if (!ticket) return null;
    const newest = ticket.messages?.reduce<number>((at, message) => Math.max(at, new Date(message.createdAt).getTime()), 0) ?? 0;
    const stamped = ticket.lastMessageAt ? new Date(ticket.lastMessageAt).getTime() : 0;
    const at = Math.max(newest, stamped);
    return at > 0 ? String(at) : null;
}

export function isLiveChat(ticket: Pick<SupportTicket, "channel"> | null | undefined): boolean {
    return ticket?.channel === "LIVE_CHAT";
}

/** Whether the live pace is over: ops converted the chat to a ticket, or the desk closed it. */
export function liveEnded(ticket: Pick<SupportTicket, "channel" | "status"> | null): "CONVERTED" | "CLOSED" | null {
    if (!ticket) return null;
    if (ticket.status === "CLOSED") return "CLOSED";
    if (ticket.channel === "TICKET") return "CONVERTED";
    return null;
}

export const ENDED_PRESENCE: Record<"CONVERTED" | "CLOSED", string> = { CONVERTED: "Moved to a ticket — we reply there", CLOSED: "This chat has ended" };

export const ENDED_NOTE: Record<"CONVERTED" | "CLOSED", string> = {
    CONVERTED: "This conversation is now a ticket. ADX will reply on the thread.",
    CLOSED: "ADX Support marked this resolved. Reply if it is not.",
};

/** "4:05 PM". */
export function shortTime(iso: string): string {
    const at = new Date(iso);
    if (Number.isNaN(at.getTime())) return "";
    const hours = at.getHours();
    return `${hours % 12 === 0 ? 12 : hours % 12}:${String(at.getMinutes()).padStart(2, "0")} ${hours < 12 ? "AM" : "PM"}`;
}

/** The line under the chat's title: the pace while the desk is on, the next opening when it is not. */
export function presenceLine(status: LiveStatus | null, ended: "CONVERTED" | "CLOSED" | null = null): string {
    if (ended) return ENDED_PRESENCE[ended];
    if (!status) return "Checking the desk…";
    if (status.online) {
        const minutes = Math.max(1, Math.round(status.firstResponseTargetSec / 60));
        return `Typically replies in under ${minutes} ${minutes === 1 ? "minute" : "minutes"}`;
    }
    if (status.nextOpeningLabel) return `Offline until ${status.nextOpeningLabel}`;
    if (status.nextOpening) return `Offline until ${shortTime(status.nextOpening)}`;
    return "Offline — ADX will reply on this ticket";
}

/** The promise printed when a message landed as a ticket instead of a chat. */
export function fallbackLine(nextOpening: string | null | undefined): string {
    return nextOpening ? `Nobody is on live chat. ADX opens again at ${shortTime(nextOpening)} and will reply on this ticket.` : "Nobody is on live chat. ADX will reply on this ticket.";
}

/** A SYSTEM line as the server sends it; an ISO instant from an older server becomes the local clock. */
export function systemLine(text: string): string {
    return text.replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z/g, (match) => shortTime(match));
}

/** Whether the help page draws an upsell card: only somebody who could pay is shown a door. */
export function showsUpsell(status: LiveStatus | null): boolean {
    if (!status || status.entitled) return false;
    return status.reason === "NOT_SUBSCRIBED" || status.reason === "PLAN_EXCLUDED";
}

export function upsellLine(status: LiveStatus): string {
    return status.plan ? `Live chat is part of the ${status.plan.name} plan` : status.upsell.title;
}

/** Where the upsell goes on the web: the side's plans page, never a phone-only route. */
export function upsellHref(party: "ADVERTISER" | "PUBLISHER" | "PRINT_PARTNER"): string | null {
    if (party === "ADVERTISER") return "/advertiser/plans";
    if (party === "PUBLISHER") return "/publisher/subscription";
    return null;
}

export function isImageAttachment(name: string): boolean {
    return /\.(jpe?g|png|webp|heic|gif)$/i.test(name);
}

/** The day label over a run of messages: Today, Yesterday, then "05 Jul". */
export function dayBadge(iso: string, now: Date = new Date()): string {
    const when = new Date(iso);
    const startOf = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
    const days = Math.round((startOf(now) - startOf(when)) / 86_400_000);
    if (days <= 0) return "Today";
    if (days === 1) return "Yesterday";
    const label = `${String(when.getDate()).padStart(2, "0")} ${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][when.getMonth()]}`;
    return when.getFullYear() === now.getFullYear() ? label : `${label} ${when.getFullYear()}`;
}

/** The 403 NOT_ENTITLED a start answers for somebody without a plan that includes chat. */
export function notEntitled(caught: unknown): boolean {
    return caught instanceof ApiError && caught.status === 403 && caught.code === "NOT_ENTITLED";
}

/* ------------------------------------------------------------------ */
/* Tickets, feedback, rating                                           */
/* ------------------------------------------------------------------ */

export function ticketReference(ticket: Pick<SupportTicket, "id" | "displayId">): string {
    return ticket.displayId ?? `#${ticket.id.slice(-4).toUpperCase()}`;
}

export function categoryLabel(category: string): string {
    const known = [...ISSUE_CATEGORIES, ...FEEDBACK_CATEGORIES].find((entry) => entry.id === category);
    return known?.label ?? category.charAt(0) + category.slice(1).toLowerCase().replace(/_/g, " ");
}

export function statusLabel(status: TicketStatus): { label: string; tone: "neutral" | "warning" | "success" } {
    if (status === "WAITING") return { label: "Waiting on you", tone: "warning" };
    if (status === "CLOSED") return { label: "Resolved", tone: "success" };
    return { label: "Open", tone: "neutral" };
}

/** The messages a thread draws: never an internal note. */
export function visibleMessages(messages: readonly TicketMessage[]): TicketMessage[] {
    return messages.filter((message) => !message.internal);
}

/** Open first, then newest first. */
export function orderTickets<T extends Pick<SupportTicket, "status" | "updatedAt">>(tickets: readonly T[]): T[] {
    return [...tickets].sort((a, b) => (a.status === "CLOSED" ? 1 : 0) - (b.status === "CLOSED" ? 1 : 0) || b.updatedAt.localeCompare(a.updatedAt));
}

export function issueProblem(description: string): string | null {
    const text = description.trim();
    if (!text) return "Tell us what happened.";
    if (text.length < 10) return "A few more words help ADX act on it.";
    return null;
}

export function feedbackProblem(text: string): string | null {
    const body = text.trim();
    if (!body) return "Tell us a little more first.";
    if (body.length < 10) return "A few more words help ADX act on it.";
    return null;
}

export const STAR_WORDS = ["", "Poor", "Not great", "Fine", "Good", "Excellent"] as const;
export const wordFor = (stars: number): string => STAR_WORDS[Math.max(0, Math.min(5, stars))] ?? "";

/** The chips on Rate your experience — short, because they are stored as written. */
export const STOOD_OUT = ["Orders", "App speed", "Payouts", "Support"] as const;

/** What the rating ticket says when the person rated but wrote nothing. */
export function describeRating(stars: number, tags: readonly string[], note: string): string {
    const written = note.trim();
    if (written) return written;
    const about = tags.length ? ` What stood out: ${tags.join(", ").toLowerCase()}.` : "";
    return `Rated ${stars} of 5 — ${wordFor(stars).toLowerCase()}.${about}`;
}

/** The body the rating sends: a FEEDBACK ticket carrying the score as a column. */
export function ratingTicket(stars: number, tags: readonly string[], note: string): NewTicket {
    return { kind: "FEEDBACK", category: "IDEA", description: describeRating(stars, tags, note), rating: stars, tags: [...tags] };
}

/** "Max 10 MB" — refused before the upload. */
export function attachmentProblem(file: { size: number }): string | null {
    return file.size > ATTACHMENT_MAX_MB * 1024 * 1024 ? `Attachments go up to ${ATTACHMENT_MAX_MB} MB.` : null;
}

/** "12 Sep, 4:05 pm". */
export function dateTime(iso: string | null | undefined): string {
    if (!iso) return "";
    const at = new Date(iso);
    if (Number.isNaN(at.getTime())) return "";
    return at.toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
}

/** The private file behind a URL the backend minted (`…/files/:id`), or null for a public URL. */
export function fileIdFromUrl(url: string | null | undefined): string | null {
    if (!url) return null;
    const match = /\/files\/([A-Za-z0-9_-]+)(?:[?#]|$)/.exec(url);
    return match ? match[1]! : null;
}
