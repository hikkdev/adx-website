import { afterEach, describe, expect, it, vi } from "vitest";
import {
    canRate,
    canReopen,
    cardFoot,
    conversationOf,
    disputesService,
    evidenceKindOf,
    isClosed,
    matchesFilter,
    matchesSearch,
    orderTag,
    outcomeLabel,
    raiseBody,
    raiseProblem,
    reasonLabel,
    reinstallLine,
    reopenLine,
    resolvedSummary,
    rupeesOf,
    shortOrder,
    stateOf,
    timelineOf,
    type Dispute,
    type DisputeDetail,
} from "./disputes";

type Call = { url: string; init: RequestInit };

function stubFetch(answer: unknown): Call[] {
    const calls: Call[] = [];
    vi.stubGlobal(
        "fetch",
        vi.fn(async (url: string, init: RequestInit) => {
            calls.push({ url, init });
            return new Response(JSON.stringify({ success: true, data: answer }), { status: 200, headers: { "Content-Type": "application/json" } });
        })
    );
    return calls;
}

afterEach(() => {
    vi.unstubAllGlobals();
});

const dispute = (over: Partial<Dispute> = {}): Dispute => ({
    id: "d1",
    displayId: "DSP-1042",
    raisedByUserId: "me",
    raisedAs: "ADVERTISER",
    againstParty: "PUBLISHER",
    againstUserId: "pub",
    orderId: "ord_abcd1234",
    listingId: "l1",
    reason: "DAMAGE",
    detail: "The vinyl is torn at the corner",
    expectedResolution: null,
    amountClaimed: null,
    status: "OPEN",
    statusNote: null,
    slaDueAt: null,
    reviewStartedAt: null,
    escalatedAt: null,
    resolvedAt: null,
    outcome: null,
    resolutionNote: null,
    creditedAmount: null,
    creditStatus: "NONE",
    creditReleasedAt: null,
    reopenUntil: null,
    createdAt: "2026-09-20T10:00:00.000Z",
    updatedAt: "2026-09-20T10:00:00.000Z",
    order: { id: "ord_abcd1234", status: "IN_PROGRESS", campaignName: "Diwali", listing: { id: "l1", title: "Whitefield billboard", address: "x", city: "Bengaluru" } },
    ...over,
});

describe("where a case stands", () => {
    it("projects six statuses onto three", () => {
        expect(stateOf("OPEN")).toBe("OPEN");
        expect(stateOf("AWAITING_RESPONSE")).toBe("UNDER_REVIEW");
        expect(stateOf("ESCALATED")).toBe("UNDER_REVIEW");
        expect(stateOf("REJECTED")).toBe("RESOLVED");
        expect(isClosed("RESOLVED")).toBe(true);
        expect(matchesFilter(dispute({ status: "UNDER_REVIEW" }), "UNDER_REVIEW")).toBe(true);
        expect(matchesFilter(dispute(), "RESOLVED")).toBe(false);
        expect(matchesFilter(dispute(), "ALL")).toBe(true);
    });

    it("searches the number, the words, the reason and the space", () => {
        expect(matchesSearch(dispute(), "dsp-1042")).toBe(true);
        expect(matchesSearch(dispute(), "torn")).toBe(true);
        expect(matchesSearch(dispute(), "damage")).toBe(true);
        expect(matchesSearch(dispute(), "whitefield")).toBe(true);
        expect(matchesSearch(dispute(), "payout")).toBe(false);
    });

    it("names the order, its stage and the reason", () => {
        expect(shortOrder("ord_abcd1234")).toBe("ORDER #1234");
        expect(orderTag("PENDING_PRINT")).toBe("Print");
        expect(orderTag("SLOT_CONFIRMED")).toBe("Installation");
        expect(orderTag("PENDING_PUBLISHER")).toBe("Booking");
        expect(reasonLabel("WRONG_LOCATION")).toBe("Wrong location");
        expect(outcomeLabel(null)).toBe("Decision pending");
    });

    it("says what happened last and what the person can do", () => {
        const now = new Date("2026-09-22T10:00:00.000Z");
        expect(cardFoot(dispute(), now)).toEqual({ left: "Raised 2 days ago", right: "Add evidence", tone: "action" });
        expect(cardFoot(dispute({ status: "UNDER_REVIEW", reviewStartedAt: "2026-09-21T10:00:00.000Z" }), now).left).toBe("Ops assigned 21 Sep");
        expect(cardFoot(dispute({ status: "RESOLVED", resolvedAt: "2026-09-21T10:00:00.000Z", creditedAmount: "450.00", creditStatus: "PENDING" }), now)).toEqual({ left: "Closed 21 Sep", right: "₹450 approved", tone: "money" });
        expect(cardFoot(dispute({ status: "RESOLVED", resolvedAt: "2026-09-21T10:00:00.000Z", creditedAmount: "450.50", creditStatus: "RELEASED" }), now).right).toBe("₹450.50 refunded");
        expect(rupeesOf("125000")).toBe("₹1,25,000");
    });

    it("draws the three-row timeline", () => {
        expect(timelineOf(dispute()).map((r) => [r.label, r.current])).toEqual([
            ["Raised", true],
            ["Decision", false],
            ["Resolved", false],
        ]);
        const decided = timelineOf(dispute({ status: "RESOLVED", reviewStartedAt: "2026-09-21T00:00:00Z", resolvedAt: "2026-09-22T00:00:00Z" }));
        expect(decided[0]!.label).toBe("Under review");
        expect(decided[2]).toMatchObject({ label: "Resolved", done: true, current: true });
    });
});

describe("the decided case", () => {
    const now = new Date("2026-09-25T00:00:00.000Z");

    it("rates once, and reopens while the window is open", () => {
        expect(canRate(dispute({ status: "RESOLVED" }))).toBe(true);
        expect(canRate(dispute({ status: "RESOLVED", resolutionRating: 4 }))).toBe(false);
        expect(canRate(dispute())).toBe(false);
        expect(canReopen(dispute({ status: "RESOLVED", reopenUntil: "2026-09-30T00:00:00Z" }), now)).toBe(true);
        expect(canReopen(dispute({ status: "RESOLVED", reopenUntil: "2026-09-20T00:00:00Z" }), now)).toBe(false);
        expect(reopenLine(dispute({ status: "RESOLVED", reopenUntil: "2026-09-30T00:00:00Z" }), now)).toBe("Reopen window open until 30 Sep");
        expect(reopenLine(dispute({ status: "RESOLVED" }), now)).toBe("Reopen window closed");
    });

    it("says a credit is approved until finance releases it", () => {
        expect(resolvedSummary(dispute({ outcome: "PARTIAL_CREDIT", creditedAmount: "450", creditStatus: "PENDING" }))).toBe("Partial credit. ₹450 credit approved — ADX finance releases it to your wallet.");
        expect(resolvedSummary(dispute({ outcome: "FULL_CREDIT", resolutionNote: "Proof was valid", creditedAmount: "900", creditStatus: "RELEASED" }))).toBe("Proof was valid. ₹900 credited to your wallet.");
        expect(resolvedSummary(dispute({ outcome: "NO_FAULT" }))).toBe("No fault found.");
    });

    it("follows a re-install to its end", () => {
        expect(reinstallLine(dispute({ outcome: "NO_FAULT" }))).toBeNull();
        expect(reinstallLine(dispute({ outcome: "REINSTALL", reinstallPending: true }))).toBe("Re-install pending");
        expect(reinstallLine(dispute({ outcome: "REINSTALL", reinstallStatus: "COMPLETED" }))).toBe("Re-installed");
        expect(reinstallLine(dispute({ outcome: "REINSTALL", reinstallStatus: "SKIPPED" }))).toBe("Re-install visit skipped");
    });
});

describe("the conversation and the raise", () => {
    it("merges messages and evidence in time order, named from the reader's side", () => {
        const detail: DisputeDetail = {
            ...dispute(),
            raisedBy: { id: "me", name: "Asha" },
            messages: [
                { id: "m1", disputeId: "d1", authorUserId: "ops", authorName: "Priya", isFromOps: true, body: "Looking into it", createdAt: "2026-09-21T10:00:00Z" },
                { id: "m2", disputeId: "d1", authorUserId: "pub", authorName: "Ravi", isFromOps: false, body: "It was fine", createdAt: "2026-09-21T12:00:00Z" },
            ],
            evidence: [{ id: "e1", disputeId: "d1", uploadedByUserId: "me", url: "http://x/files/f1", kind: "IMG", fileName: "torn.jpg", uploadedAt: "2026-09-21T11:00:00Z" }],
        };
        const turns = conversationOf(detail, "me");
        expect(turns.map((t) => [t.id, t.author, t.mine])).toEqual([
            ["m1", "Priya", false],
            ["e1", "You", true],
            ["m2", "Ravi", false],
        ]);
        expect(conversationOf(detail, "pub").find((t) => t.id === "e1")?.author).toBe("Asha");
    });

    it("checks the form and builds the body", () => {
        expect(raiseProblem({ orderId: null, detail: "long enough text" })).toBe("Choose the order this is about.");
        expect(raiseProblem({ orderId: "o", detail: "short" })).toMatch(/few more words/);
        expect(raiseProblem({ orderId: "o", detail: "The vinyl is torn" })).toBeNull();
        expect(raiseBody({ orderId: "o", reason: "DAMAGE", detail: " torn ", expected: " ", evidence: [{ url: "u", fileName: "a.pdf", kind: "PDF" }] })).toEqual({
            orderId: "o",
            reason: "DAMAGE",
            detail: "torn",
            evidence: [{ url: "u", kind: "PDF", fileName: "a.pdf" }],
        });
        expect(raiseBody({ orderId: "o", reason: "OTHER", detail: "x", expected: "Refund", evidence: [] }).expectedResolution).toBe("Refund");
        expect(evidenceKindOf({ type: "image/png", name: "a.png" })).toBe("IMG");
        expect(evidenceKindOf({ type: "", name: "receipt.PDF" })).toBe("PDF");
        expect(evidenceKindOf({ type: "text/plain", name: "a.txt" })).toBe("OTHER");
    });

    it("reads and writes over the dispute routes", async () => {
        const calls = stubFetch({ items: [{ id: "o1" }] });
        await expect(disputesService.orders("advertiser")).resolves.toEqual([{ id: "o1" }]);
        await disputesService.mine();
        await disputesService.message("d1", "More detail");
        await disputesService.evidence("d1", { url: "u", kind: "IMG", fileName: "a.jpg" });
        await disputesService.reopen("d1");
        await disputesService.rate("d1", { rating: 4 });
        expect(calls.map((c) => `${c.init.method} ${c.url.replace(/^.*\/api\/v1/, "")}`)).toEqual([
            "GET /orders/my?as=advertiser&pageSize=100",
            "GET /disputes/my",
            "POST /disputes/d1/messages",
            "POST /disputes/d1/evidence",
            "POST /disputes/d1/reopen",
            "POST /disputes/d1/rate",
        ]);
        expect(JSON.parse(String(calls[2]!.init.body))).toEqual({ body: "More detail" });
        expect(JSON.parse(String(calls[5]!.init.body))).toEqual({ rating: 4 });
    });

    it("stores evidence privately", async () => {
        const calls = stubFetch({ id: "f", url: "u" });
        await disputesService.upload(new File(["x"], "torn.jpg", { type: "image/jpeg" }));
        expect((calls[0]!.init.body as FormData).get("purpose")).toBe("DISPUTE_EVIDENCE");
    });
});
