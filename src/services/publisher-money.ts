import { api } from "@/lib/api-client";
import { compareMoney, formatMoney, isPositiveMoney, sumMoney, toApiAmount, type Allowance, type EarningsDay, type Money, type PayoutMethod, type Statement, type Tone, type WalletEntry, type WalletEntryType } from "@/services/publisher-workspace";

/**
 * The publisher's money as the ADX app's wallet draws it
 * (`mobile/user-app/src/features/publisher/wallet/*`), for the pages the
 * web did not have: the ledger with its type chips and cursor paging, the
 * monthly breakdown from the campaign-days (gross, ADX's commission, the
 * TDS, what landed), the GST invoice a registered publisher raises on ADX
 * for a month, and the withdraw rules in the order the server applies
 * them. Every rupee is a decimal string, added in whole paise.
 */

/* ------------------------------------------------------------------ */
/* The ledger                                                          */
/* ------------------------------------------------------------------ */

export interface EntriesQuery {
    limit?: number;
    /** The id of the last row already shown; the server skips past it. */
    cursor?: string;
    /** A union of entry types — a chip. Empty is every type. */
    type?: readonly WalletEntryType[];
}

/** `?limit=&cursor=&type=` — `type` is the comma list the server splits. */
export function entriesQuery(options: EntriesQuery = {}): string {
    const parts = [`limit=${options.limit ?? 50}`];
    if (options.cursor) parts.push(`cursor=${encodeURIComponent(options.cursor)}`);
    if (options.type && options.type.length > 0) parts.push(`type=${options.type.join(",")}`);
    return `?${parts.join("&")}`;
}

/**
 * The chips, each a union of entry types. There is no Commission chip: the
 * wallet is credited net of ADX's commission, so no entry would ever answer
 * it — the monthly breakdown is where the commission is.
 */
export const TRANSACTION_CHIPS: { value: string; label: string; types: readonly WalletEntryType[] }[] = [
    { value: "ALL", label: "All", types: [] },
    { value: "PAYMENTS", label: "Payments", types: ["EARNING", "BONUS", "REFERRAL"] },
    { value: "PAYOUTS", label: "Payouts", types: ["PAYOUT"] },
    { value: "REFUNDS", label: "Refunds", types: ["REFUND", "ADJUSTMENT", "GOODWILL_CREDIT"] },
];

export const chipTypes = (chip: string): readonly WalletEntryType[] => TRANSACTION_CHIPS.find((row) => row.value === chip)?.types ?? [];

/** What a ledger line is called — every type the backend can write. */
export const ENTRY_LABEL: Record<WalletEntryType, string> = {
    TOPUP: "Money added",
    CAMPAIGN_DEBIT: "Campaign spend",
    PACKAGE_DEBIT: "Plan bought",
    GOODWILL_CREDIT: "ADX credit",
    REFUND: "Refund",
    ADJUSTMENT: "Adjustment by ADX",
    EARNING: "Earnings",
    BONUS: "Bonus",
    REFERRAL: "Referral",
    PAYOUT: "Paid out to your account",
    PENALTY: "Penalty",
    EXPIRY: "Credit expired",
    PROMOTION_DEBIT: "Sponsored listing",
};

/** A credit is told from a debit by the sign the server sent — an adjustment can go either way. */
export const isCredit = (entry: Pick<WalletEntry, "amount">): boolean => isPositiveMoney(entry.amount);

/** "+₹1,250.00" for a credit, "−₹500.00" for a debit. */
export const signedAmount = (entry: Pick<WalletEntry, "amount">): string => `${isCredit(entry) ? "+" : ""}${formatMoney(entry.amount, { paise: "always" })}`;

/** "September 2026" — the month header over a run of ledger lines. */
export function monthOf(iso: string): string {
    const at = new Date(iso);
    if (Number.isNaN(at.getTime())) return "";
    return at.toLocaleDateString("en-IN", { month: "long", year: "numeric" });
}

/** Another page exists when the last one came back full — there is no total on the contract. */
export const hasMore = (page: unknown[], limit: number): boolean => page.length >= limit;

/* ------------------------------------------------------------------ */
/* The monthly breakdown                                               */
/* ------------------------------------------------------------------ */

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export interface MonthStatement {
    /** "2026-04". */
    key: string;
    /** "April 2026". */
    label: string;
    year: number;
    gross: Money | null;
    commission: Money | null;
    taxWithheld: Money | null;
    net: Money | null;
    /** The month's campaign-days, as the server sent them. */
    days: EarningsDay[];
}

/** "2026-04" → "April 2026". */
export function periodLabel(period: string): string {
    const match = /^(\d{4})-(\d{2})$/.exec(period);
    if (!match) return period;
    return `${MONTHS[Number(match[2]) - 1] ?? ""} ${match[1]}`.trim();
}

/**
 * The months, newest first, each summed from its days. A campaign-day is a
 * calendar date kept at UTC midnight, so it is read back in UTC. A column
 * that cannot be added (one day unreadable) is null, never a total with a
 * day missing from it. A month with a payment advice but no campaign-days
 * (only a payout moved) still gets its row, with no figures.
 */
export function monthStatements(days: EarningsDay[], statements: Pick<Statement, "period">[] = []): MonthStatement[] {
    const groups = new Map<string, EarningsDay[]>();
    for (const day of days) {
        const at = new Date(day.forDate);
        if (Number.isNaN(at.getTime())) continue;
        const key = `${at.getUTCFullYear()}-${String(at.getUTCMonth() + 1).padStart(2, "0")}`;
        groups.set(key, [...(groups.get(key) ?? []), day]);
    }
    for (const statement of statements) if (/^\d{4}-\d{2}$/.test(statement.period) && !groups.has(statement.period)) groups.set(statement.period, []);
    return [...groups.entries()]
        .sort(([a], [b]) => (a < b ? 1 : a > b ? -1 : 0))
        .map(([key, rows]) => ({
            key,
            label: periodLabel(key),
            year: Number(key.slice(0, 4)),
            gross: rows.length ? sumMoney(rows.map((row) => row.gross)) : null,
            commission: rows.length ? sumMoney(rows.map((row) => row.commission)) : null,
            taxWithheld: rows.length ? sumMoney(rows.map((row) => row.taxWithheld)) : null,
            net: rows.length ? sumMoney(rows.map((row) => row.net)) : null,
            days: [...rows].sort((a, b) => (a.forDate < b.forDate ? 1 : a.forDate > b.forDate ? -1 : 0)),
        }));
}

/** The years the months fall in, oldest first — the year switch. */
export const statementYears = (months: Pick<MonthStatement, "year">[]): number[] => [...new Set(months.map((month) => month.year))].sort((a, b) => a - b);

/* ------------------------------------------------------------------ */
/* The publisher's invoice to ADX                                      */
/* ------------------------------------------------------------------ */

export type PublisherInvoiceStatus = "UPLOADED" | "MATCHED" | "REJECTED";

export interface PublisherInvoice {
    id: string;
    publisherId: string;
    period: string;
    fileId: string | null;
    fileUrl: string | null;
    gstin: string | null;
    amount: Money;
    status: PublisherInvoiceStatus;
    note: string | null;
    reviewedById: string | null;
    reviewedAt: string | null;
    createdAt: string;
}

export const INVOICE_STATUS: Record<PublisherInvoiceStatus, { label: string; tone: Tone }> = {
    UPLOADED: { label: "With ADX", tone: "info" },
    MATCHED: { label: "Matched", tone: "success" },
    REJECTED: { label: "Rejected", tone: "danger" },
};

/** What the month's invoice is for before tax: what was credited, plus the TDS withheld from it. */
export const invoiceAmountFor = (month: Pick<MonthStatement, "net" | "taxWithheld">): Money | null => (month.net === null ? null : sumMoney([month.net, month.taxWithheld ?? "0.00"]));

/** One invoice per period; only a rejected one may be raised again. */
export const canRaiseInvoice = (invoice: Pick<PublisherInvoice, "status"> | null | undefined): boolean => !invoice || invoice.status === "REJECTED";

/** The answer read strictly: a bare list, or a page with `items`. */
export function invoiceRows(answer: unknown): PublisherInvoice[] {
    if (Array.isArray(answer)) return answer as PublisherInvoice[];
    const items = (answer as { items?: unknown } | null)?.items;
    return Array.isArray(items) ? (items as PublisherInvoice[]) : [];
}

/* ------------------------------------------------------------------ */
/* Withdrawing                                                         */
/* ------------------------------------------------------------------ */

export type SizeBand = "INDIVIDUAL" | "SMALL_AGENCY" | "LARGE_AGENCY";

/** The allowance as the server sends it — the workspace type plus who the party is. */
export interface FullAllowance extends Allowance {
    party?: { kind: string; name: string; sizeBand: SizeBand | string } | null;
}

const BAND_LABEL: Record<string, string> = {
    INDIVIDUAL: "an individual publisher",
    SMALL_AGENCY: "a small agency",
    LARGE_AGENCY: "a large agency",
};

/** Only a method ADX has checked can be paid to. */
export const verifiedMethods = (methods: PayoutMethod[]): PayoutMethod[] => methods.filter((method) => method.status === "VERIFIED");

/** The account the dialog opens on: the default among the checked ones, else the first. */
export const defaultMethodId = (methods: PayoutMethod[]): string | null => {
    const usable = verifiedMethods(methods);
    return usable.find((method) => method.isDefault)?.id ?? usable[0]?.id ?? null;
};

/**
 * The server's three refusals, in the server's order: the minimum, what is
 * left of today's cap, what has actually cleared. Null while nothing is
 * typed, and when the amount would go through.
 */
export function withdrawProblem(allowance: Pick<Allowance, "minimum" | "remainingToday" | "dailyCap" | "withdrawable" | "pendingClearance">, raw: string): string | null {
    if (!raw.trim()) return null;
    const amount = toApiAmount(raw);
    if (!amount || !isPositiveMoney(amount)) return "Enter an amount to withdraw.";
    if (compareMoney(amount, allowance.minimum) < 0) return `The smallest withdrawal is ${formatMoney(allowance.minimum)}.`;
    if (compareMoney(amount, allowance.remainingToday) > 0)
        return `That is over today's limit. You can withdraw ${formatMoney(allowance.remainingToday)} more today; your daily cap is ${formatMoney(allowance.dailyCap)}.`;
    if (compareMoney(amount, allowance.withdrawable) > 0) return `Only ${formatMoney(allowance.withdrawable)} has cleared. ${formatMoney(allowance.pendingClearance)} is still inside its clearing window.`;
    return null;
}

/** Why nothing can be asked for today, when the most on offer is under the minimum; null when a withdrawal is possible. */
export function belowMinimumLine(allowance: Pick<Allowance, "maximum" | "minimum" | "remainingToday" | "usedToday" | "dailyCap" | "withdrawable" | "pendingClearance">): string | null {
    if (compareMoney(allowance.maximum, allowance.minimum) >= 0) return null;
    if (compareMoney(allowance.remainingToday, allowance.minimum) < 0)
        return `You have used ${formatMoney(allowance.usedToday)} of today's ${formatMoney(allowance.dailyCap)} cap. What is left is under the ${formatMoney(allowance.minimum)} minimum, so the next withdrawal is tomorrow.`;
    return `${formatMoney(allowance.withdrawable)} has cleared, which is under the ${formatMoney(allowance.minimum)} minimum. ${formatMoney(allowance.pendingClearance)} is still inside its clearing window.`;
}

/** Why the cap is what it is: the rung the publisher is on, and the next one. */
export function capReason(allowance: Pick<FullAllowance, "monthsOnPlatform" | "nextRung" | "party">): string {
    const months = allowance.monthsOnPlatform;
    const tenure = months < 1 ? "less than a month" : `${months} month${months === 1 ? "" : "s"}`;
    const next = allowance.nextRung ? ` At ${allowance.nextRung.months} months it becomes ${formatMoney(allowance.nextRung.cap)} a day.` : " That is the top rung.";
    const band = allowance.party?.sizeBand ? BAND_LABEL[allowance.party.sizeBand] : null;
    return `Caps go by who you are and how long you have been on ADX. You are ${band ? `${band}, ` : ""}${tenure} on ADX.${next}`;
}

/* ------------------------------------------------------------------ */
/* The service                                                         */
/* ------------------------------------------------------------------ */

export const publisherMoney = {
    /** The ledger, newest first; `cursor` pages past the last row shown. */
    entries: (options: EntriesQuery = {}) => api.get<WalletEntry[]>(`/payouts/wallet/entries${entriesQuery(options)}`),
    invoices: async (): Promise<PublisherInvoice[]> => invoiceRows(await api.get<unknown>("/publishers/me/invoices")),
    /** One per period; a REJECTED one is replaced in place, anything else is a 409. */
    uploadInvoice: (body: { period: string; fileId: string; gstin?: string; amount: Money }) => api.post<PublisherInvoice>("/publishers/me/invoices", body),
    /** `POST /upload` under INVOICE — private, read back only through `/files/:id`. */
    uploadInvoiceFile: (file: File) => {
        const form = new FormData();
        form.append("file", file, file.name);
        form.append("purpose", "INVOICE");
        return api.post<{ id: string; url: string }>("/upload", form);
    },
};
