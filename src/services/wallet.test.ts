import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api-client", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-client")>();
    return { ...actual, api: { get: vi.fn(async () => ({})), post: vi.fn(async () => ({})), patch: vi.fn(async () => ({})), put: vi.fn(), delete: vi.fn() } };
});

import { api } from "@/lib/api-client";
import {
    appendPage,
    byMonth,
    chipEntries,
    entryDetail,
    entryHeading,
    entrySource,
    entryStatus,
    inr,
    isDebit,
    isZero,
    refundOutcome,
    refundPaidLine,
    refundReasonLabel,
    refundRequestStatus,
    refundRequestsSummary,
    signedInr,
    statementChip,
    toPaise,
    topUpDetail,
    topUpFor,
    walletService,
    type TopUp,
    type WalletEntry,
} from "./wallet";

const entry = (overrides: Partial<WalletEntry> = {}): WalletEntry => ({
    id: "e1",
    walletId: "w1",
    type: "CAMPAIGN_DEBIT",
    amount: "-2500",
    balanceAfter: "10000",
    isGoodwill: false,
    campaignId: null,
    orderId: null,
    holdId: null,
    reference: null,
    note: null,
    createdAt: "2026-09-12T10:00:00.000Z",
    ...overrides,
});

const topUp = (overrides: Partial<TopUp> = {}): TopUp => ({
    id: "t1",
    walletId: "w1",
    amount: "12500.00",
    method: "BANK_TRANSFER",
    utr: "HDFCN52026092512345",
    receivedAt: "2026-03-27T00:00:00.000Z",
    paymentId: null,
    note: null,
    walletEntryId: null,
    reconciledAt: null,
    createdAt: "2026-03-28T00:00:00.000Z",
    ...overrides,
});

describe("the routes", () => {
    beforeEach(() => vi.mocked(api.get).mockClear());

    it("reads the advertiser's own wallet, never the earning side's", async () => {
        await walletService.wallet("adv 1");
        expect(api.get).toHaveBeenCalledWith("/advertisers/adv%201/wallet");
    });

    it("pages the statement and the top-ups by cursor", async () => {
        await walletService.statement("a1");
        expect(api.get).toHaveBeenLastCalledWith("/advertisers/a1/wallet/statement?limit=25");
        await walletService.statement("a1", { cursor: "c-9", limit: 10 });
        expect(api.get).toHaveBeenLastCalledWith("/advertisers/a1/wallet/statement?limit=10&cursor=c-9");
        await walletService.topUps("a1", { limit: 100 });
        expect(api.get).toHaveBeenLastCalledWith("/advertisers/a1/wallet/top-ups?limit=100");
    });

    it("lists the account's refund requests on the list contract", async () => {
        await walletService.refundRequests("a1");
        expect(api.get).toHaveBeenLastCalledWith("/advertisers/a1/wallet/refund-requests");
        await walletService.refundRequests("a1", { status: "PENDING", page: 2, pageSize: 20 });
        expect(api.get).toHaveBeenLastCalledWith("/advertisers/a1/wallet/refund-requests?status=PENDING&page=2&pageSize=20");
    });
});

describe("money, read as text", () => {
    it("prints to the paisa with Indian grouping, whatever padding the server sent", () => {
        expect(inr("12500")).toBe("₹12,500.00");
        expect(inr("12500.00")).toBe("₹12,500.00");
        expect(inr("123456.5")).toBe("₹1,23,456.50");
        expect(inr("-2500.5")).toBe("₹2,500.50");
        expect(inr("0")).toBe("₹0.00");
        expect(inr("abc")).toBe("—");
        expect(inr(null)).toBe("—");
    });

    it("knows a debit, a zero and a signed line", () => {
        expect(isDebit("-1")).toBe(true);
        expect(isDebit("-0.00")).toBe(false);
        expect(isDebit("5")).toBe(false);
        expect(isZero("0.00")).toBe(true);
        expect(isZero("-0")).toBe(true);
        expect(isZero("0.01")).toBe(false);
        expect(signedInr("-2000")).toBe("−₹2,000.00");
        expect(signedInr("2000.5")).toBe("+₹2,000.50");
        expect(toPaise("-12.5")).toBe(-1250);
        expect(toPaise("x")).toBeNull();
    });
});

describe("the statement", () => {
    it("reads the chip from the address and keeps what each chip keeps", () => {
        expect(statementChip("REFUNDS")).toBe("REFUNDS");
        expect(statementChip("nonsense")).toBe("ALL");
        const rows = [entry({ id: "a" }), entry({ id: "b", type: "REFUND", amount: "100" }), entry({ id: "c", type: "TOPUP", amount: "500" }), entry({ id: "d", type: "PACKAGE_DEBIT" })];
        expect(chipEntries("ALL", rows).map((r) => r.id)).toEqual(["a", "b", "c", "d"]);
        expect(chipEntries("PAYMENTS", rows).map((r) => r.id)).toEqual(["a", "d"]);
        expect(chipEntries("REFUNDS", rows).map((r) => r.id)).toEqual(["b"]);
        expect(chipEntries("CREDITS", rows).map((r) => r.id)).toEqual(["c"]);
        expect(chipEntries("INVOICES", rows)).toHaveLength(4);
    });

    it("names a line, and says goodwill spent is ADX credits used", () => {
        expect(entryHeading(entry())).toBe("Campaign payment");
        expect(entryHeading(entry({ isGoodwill: true }))).toBe("ADX credits used");
        expect(entryHeading(entry({ type: "GOODWILL_CREDIT", amount: "200", isGoodwill: true }))).toBe("ADX credit");
        expect(entrySource(entry({ campaignId: "c1" }), "Diwali push")).toBe("Diwali push");
        expect(entrySource(entry({ type: "PACKAGE_DEBIT", note: "Growth plan — PKG-2026-1" }))).toBe("Growth plan — PKG-2026-1");
        expect(entrySource(entry({ type: "TOPUP", note: "ignored" }))).toBeNull();
    });

    it("joins a TOPUP line to its top-up by entry id, then by UTR", () => {
        const line = entry({ id: "e7", type: "TOPUP", amount: "12500", reference: "HDFCN52026092512345" });
        expect(topUpFor(line, [topUp({ id: "x", walletEntryId: "e7", utr: null })])?.id).toBe("x");
        expect(topUpFor(line, [topUp({ id: "y" })])?.id).toBe("y");
        expect(topUpFor(entry(), [topUp()])).toBeNull();
        expect(topUpDetail(topUp())).toMatch(/^Bank transfer · UTR HDFCN52026092512345 · received 27 Mar 2026$/);
        expect(topUpDetail(topUp({ method: "CHEQUE", utr: "004512" }))).toContain("Cheque 004512");
    });

    it("reads where a refund went from the sign and the note", () => {
        expect(refundOutcome(entry({ type: "REFUND", amount: "-500" }))).toEqual({ destination: "BANK_TRANSFER", status: "WITH_FINANCE" });
        expect(refundOutcome(entry({ type: "REFUND", amount: "500", note: "Refund rr_1 failed: account closed" }))).toEqual({ destination: "BANK_TRANSFER", status: "FAILED" });
        expect(refundOutcome(entry({ type: "REFUND", amount: "500" }))).toEqual({ destination: "WALLET_CREDIT", status: "CREDITED" });
        expect(refundOutcome(entry())).toBeNull();
        expect(entryDetail(entry({ type: "REFUND", amount: "500", campaignId: "c1" }), null)).toBe("Campaign refund · credited to your wallet");
        expect(entryStatus(entry({ type: "REFUND", amount: "-500" }))).toEqual({ label: "With finance", tone: "info" });
        expect(entryStatus(entry({ isGoodwill: true }))).toEqual({ label: "Applied", tone: "neutral" });
        expect(entryStatus(entry())).toBeNull();
    });

    it("groups consecutive months and appends a page without repeats", () => {
        const rows = [entry({ id: "1", createdAt: "2026-09-20T00:00:00Z" }), entry({ id: "2", createdAt: "2026-09-02T00:00:00Z" }), entry({ id: "3", createdAt: "2026-08-30T00:00:00Z" })];
        const groups = byMonth(rows);
        expect(groups.map((g) => g.rows.length)).toEqual([2, 1]);
        expect(groups[0]!.month).toMatch(/September 2026/);
        expect(appendPage(rows.slice(0, 2), rows.slice(1)).map((r) => r.id)).toEqual(["1", "2", "3"]);
    });
});

describe("refund requests", () => {
    it("words the status, the reason and the paid line", () => {
        expect(refundRequestStatus("PENDING")).toEqual({ label: "With finance", tone: "info" });
        expect(refundRequestStatus("REJECTED").label).toBe("Refused");
        expect(refundRequestStatus("SOMETHING_NEW")).toEqual({ label: "something new", tone: "neutral" });
        expect(refundReasonLabel("PUBLISHER_WITHDREW")).toBe("The publisher withdrew");
        expect(refundReasonLabel("NEW_REASON")).toBe("New reason");
        expect(refundPaidLine({ paidAt: "2026-09-10T00:00:00Z", railReference: "UTR123" })).toBe("Paid 10 Sep 2026 · ref UTR123");
        expect(refundPaidLine({ paidAt: null, railReference: "UTR123" })).toBe("Reference UTR123");
        expect(refundPaidLine({ paidAt: null, railReference: null })).toBeNull();
    });

    it("sums up the list", () => {
        expect(refundRequestsSummary([])).toBe("No refund requests on this account");
        expect(refundRequestsSummary([{ status: "PENDING" }, { status: "PAID" }])).toBe("2 requests · 1 open");
        expect(refundRequestsSummary([{ status: "PAID" }], 5)).toBe("5 requests");
    });
});
