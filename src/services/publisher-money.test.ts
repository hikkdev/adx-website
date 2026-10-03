import { beforeEach, describe, expect, it, vi } from "vitest";

const calls: { method: string; path: string; body?: unknown }[] = [];
let answer: unknown = [];
vi.mock("@/lib/api-client", async (original) => {
    const real = await original<typeof import("@/lib/api-client")>();
    const record = (method: string) =>
        vi.fn(async (path: string, body?: unknown) => {
            calls.push(body === undefined ? { method, path } : { method, path, body });
            return answer;
        });
    return { ...real, api: { get: record("GET"), post: record("POST") } };
});

import {
    belowMinimumLine,
    canRaiseInvoice,
    capReason,
    chipTypes,
    defaultMethodId,
    entriesQuery,
    hasMore,
    invoiceAmountFor,
    invoiceRows,
    isCredit,
    monthOf,
    monthStatements,
    periodLabel,
    publisherMoney,
    signedAmount,
    statementYears,
    verifiedMethods,
    withdrawProblem,
} from "./publisher-money";
import type { EarningsDay, PayoutMethod } from "./publisher-workspace";

beforeEach(() => {
    calls.length = 0;
    answer = [];
});

const day = (id: string, forDate: string, gross: string, commission: string, tax: string, net: string): EarningsDay => ({
    id,
    forDate,
    listing: { id: "l1", title: "Whitefield billboard", city: "Bengaluru" },
    gross,
    commission,
    taxWithheld: tax,
    net,
    clearsAt: forDate,
    cleared: true,
});

const method = (id: string, status: PayoutMethod["status"], isDefault = false): PayoutMethod => ({
    id,
    type: "BANK",
    accountHolder: "Asha",
    bankName: "HDFC Bank",
    accountNumberMasked: "••••4821",
    ifscCode: "HDFC0001234",
    upiVpa: null,
    isDefault,
    status,
    verifiedVia: null,
    verifiedAt: null,
    rejectionReason: null,
    createdAt: "2026-09-01T00:00:00.000Z",
});

describe("the ledger", () => {
    it("builds the query the server splits", () => {
        expect(entriesQuery()).toBe("?limit=50");
        expect(entriesQuery({ limit: 25, cursor: "we 1", type: chipTypes("PAYMENTS") })).toBe("?limit=25&cursor=we%201&type=EARNING,BONUS,REFERRAL");
        expect(chipTypes("ALL")).toEqual([]);
        expect(chipTypes("nope")).toEqual([]);
    });
    it("tells a credit from a debit by the sign the server sent", () => {
        expect(isCredit({ amount: "1250.00" })).toBe(true);
        expect(isCredit({ amount: "-500.00" })).toBe(false);
        expect(signedAmount({ amount: "1250.5" })).toBe("+₹1,250.50");
        expect(signedAmount({ amount: "-500.00" })).toBe("−₹500.00");
        expect(monthOf("2026-09-14T08:00:00.000Z")).toBe("September 2026");
        expect(hasMore([1, 2], 2)).toBe(true);
        expect(hasMore([1], 2)).toBe(false);
    });
    it("pages the entries with the cursor", async () => {
        await publisherMoney.entries({ limit: 50, cursor: "e9", type: ["PAYOUT"] });
        expect(calls).toEqual([{ method: "GET", path: "/payouts/wallet/entries?limit=50&cursor=e9&type=PAYOUT" }]);
    });
});

describe("the monthly breakdown", () => {
    const days = [
        day("a", "2026-09-30T00:00:00.000Z", "8333.33", "1249.99", "83.33", "7000.01"),
        day("b", "2026-09-01T00:00:00.000Z", "8333.33", "1249.99", "83.33", "7000.01"),
        day("c", "2026-10-01T00:00:00.000Z", "8333.34", "1250.01", "83.34", "6999.99"),
        day("d", "2025-12-31T00:00:00.000Z", "100.00", "15.00", "1.00", "84.00"),
    ];
    it("groups the days by month in UTC and adds them in paise, newest first", () => {
        const months = monthStatements(days);
        expect(months.map((m) => m.key)).toEqual(["2026-10", "2026-09", "2025-12"]);
        const september = months[1]!;
        expect(september.label).toBe("September 2026");
        expect(september.gross).toBe("16666.66");
        expect(september.commission).toBe("2499.98");
        expect(september.taxWithheld).toBe("166.66");
        expect(september.net).toBe("14000.02");
        expect(september.days.map((d) => d.id)).toEqual(["a", "b"]);
        expect(statementYears(months)).toEqual([2025, 2026]);
    });
    it("keeps a month that only has a payment advice, with no figures", () => {
        const months = monthStatements(days.slice(0, 1), [{ period: "2026-08" }, { period: "2026-09" }]);
        expect(months.map((m) => [m.key, m.gross])).toEqual([
            ["2026-09", "8333.33"],
            ["2026-08", null],
        ]);
        expect(periodLabel("2026-08")).toBe("August 2026");
        expect(periodLabel("bad")).toBe("bad");
    });
    it("refuses to total a column with a day it cannot read", () => {
        const months = monthStatements([day("x", "2026-09-02T00:00:00.000Z", "abc", "1.00", "0.00", "1.00"), day("y", "2026-09-03T00:00:00.000Z", "10.00", "1.00", "0.00", "9.00")]);
        expect(months[0]!.gross).toBeNull();
        expect(months[0]!.net).toBe("10.00");
    });
});

describe("the invoice to ADX", () => {
    it("prefills what was credited plus the TDS, and allows a second go only after a rejection", () => {
        expect(invoiceAmountFor({ net: "14000.02", taxWithheld: "166.66" })).toBe("14166.68");
        expect(invoiceAmountFor({ net: null, taxWithheld: null })).toBeNull();
        expect(canRaiseInvoice(null)).toBe(true);
        expect(canRaiseInvoice({ status: "REJECTED" })).toBe(true);
        expect(canRaiseInvoice({ status: "UPLOADED" })).toBe(false);
        expect(canRaiseInvoice({ status: "MATCHED" })).toBe(false);
    });
    it("reads a bare list or a page", () => {
        expect(invoiceRows([{ id: "i1" }])).toHaveLength(1);
        expect(invoiceRows({ items: [{ id: "i1" }, { id: "i2" }] })).toHaveLength(2);
        expect(invoiceRows(null)).toEqual([]);
    });
    it("uploads the PDF as INVOICE, then files it for the period", async () => {
        await publisherMoney.invoices();
        await publisherMoney.uploadInvoiceFile(new File(["%PDF"], "sept.pdf", { type: "application/pdf" }));
        await publisherMoney.uploadInvoice({ period: "2026-09", fileId: "f1", gstin: "29ABCDE1234F1Z5", amount: "14166.68" });
        expect(calls[0]).toEqual({ method: "GET", path: "/publishers/me/invoices" });
        expect(calls[1]!.path).toBe("/upload");
        const form = calls[1]!.body as FormData;
        expect(form.get("purpose")).toBe("INVOICE");
        expect((form.get("file") as File).name).toBe("sept.pdf");
        expect(calls[2]).toEqual({ method: "POST", path: "/publishers/me/invoices", body: { period: "2026-09", fileId: "f1", gstin: "29ABCDE1234F1Z5", amount: "14166.68" } });
    });
});

describe("withdrawing", () => {
    const allowance = {
        minimum: "500.00",
        remainingToday: "5000.00",
        dailyCap: "10000.00",
        usedToday: "5000.00",
        withdrawable: "3000.00",
        pendingClearance: "4800.00",
        maximum: "3000.00",
        monthsOnPlatform: 4,
        nextRung: { months: 6, cap: "25000.00" },
        party: { kind: "PUBLISHER", name: "Asha Media", sizeBand: "SMALL_AGENCY" },
    };
    it("applies the server's three refusals in the server's order", () => {
        expect(withdrawProblem(allowance, "")).toBeNull();
        expect(withdrawProblem(allowance, "0")).toBe("Enter an amount to withdraw.");
        expect(withdrawProblem(allowance, "100")).toBe("The smallest withdrawal is ₹500.");
        expect(withdrawProblem(allowance, "6000")).toContain("over today's limit");
        expect(withdrawProblem(allowance, "4000")).toBe("Only ₹3,000 has cleared. ₹4,800 is still inside its clearing window.");
        expect(withdrawProblem(allowance, "2500")).toBeNull();
    });
    it("says why nothing can go out today", () => {
        expect(belowMinimumLine(allowance)).toBeNull();
        expect(belowMinimumLine({ ...allowance, maximum: "200.00", remainingToday: "200.00" })).toContain("next withdrawal is tomorrow");
        expect(belowMinimumLine({ ...allowance, maximum: "200.00", withdrawable: "200.00" })).toContain("under the ₹500 minimum");
    });
    it("names the rung and the next one", () => {
        expect(capReason(allowance)).toBe("Caps go by who you are and how long you have been on ADX. You are a small agency, 4 months on ADX. At 6 months it becomes ₹25,000 a day.");
        expect(capReason({ monthsOnPlatform: 0, nextRung: null, party: null })).toContain("less than a month on ADX. That is the top rung.");
    });
    it("offers only methods ADX has checked, the default first", () => {
        const methods = [method("a", "PENDING_VERIFICATION", true), method("b", "VERIFIED"), method("c", "VERIFIED", false)];
        expect(verifiedMethods(methods).map((m) => m.id)).toEqual(["b", "c"]);
        expect(defaultMethodId(methods)).toBe("b");
        expect(defaultMethodId([method("x", "VERIFIED"), method("y", "VERIFIED", true)])).toBe("y");
        expect(defaultMethodId([method("a", "REJECTED")])).toBeNull();
    });
});
