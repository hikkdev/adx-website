import { api } from "@/lib/api-client";
import { shortDate, type Tone, type WalletSnapshot } from "@/services/advertiser-workspace";

/**
 * The advertiser's wallet, read from the routes that hold it — the web's
 * copy of the app's billing layer (`mobile/user-app/src/features/advertiser/
 * billing/billing-api.ts`, `money.ts`, `transactions-screen.tsx`,
 * `refund-requests-screen.tsx`).
 *
 * An advertiser's wallet hangs off the advertiser record, so every read is
 * under `/advertisers/:id/wallet…` — `/payouts/wallet` is the earning side's
 * and answers 404 for an advertiser. There is no top-up call here on purpose:
 * `POST /advertisers/:id/wallet/top-up` is ADMIN-only (ADX records a transfer
 * or a cheque that reached it), and raising a refund request is ADMIN-only
 * too, so a client method for either would always answer 403. What is here
 * is the balance, the statement (by cursor — it is written to while it is
 * read), the recorded top-ups, and the account's own refund requests.
 *
 * Money arrives as a decimal string and is never put through `Number()`:
 * a statement is what the account was actually charged, to the paisa.
 */

export type Money = string;

export type { WalletSnapshot } from "@/services/advertiser-workspace";

/** Every kind of line the wallet can carry — the column is shared with the earning side. */
export type WalletEntryType =
    | "TOPUP"
    | "CAMPAIGN_DEBIT"
    | "PACKAGE_DEBIT"
    | "GOODWILL_CREDIT"
    | "REFUND"
    | "ADJUSTMENT"
    | "EARNING"
    | "BONUS"
    | "REFERRAL"
    | "PAYOUT"
    | "PENALTY"
    | "EXPIRY"
    /** LM-1: a display ad or a sponsored listing, paid from the wallet. */
    | "PROMOTION_DEBIT";

export interface WalletEntry {
    id: string;
    walletId: string;
    type: WalletEntryType;
    /** Signed: credits positive, debits negative. */
    amount: Money;
    /** The balance after this line — the goodwill balance on a goodwill line, the settled one otherwise. */
    balanceAfter: Money;
    isGoodwill: boolean;
    campaignId: string | null;
    orderId: string | null;
    holdId: string | null;
    /** The package sale id on a plan charge; a bank reference on a credit. */
    reference: string | null;
    note: string | null;
    createdAt: string;
}

export interface Statement {
    rows: WalletEntry[];
    nextCursor: string | null;
}

/** How many lines one page of the statement asks for (the app's page). */
export const STATEMENT_PAGE_SIZE = 25;

export type TopUpMethod = "BANK_TRANSFER" | "CHEQUE" | "GATEWAY";

/** A transfer, a cheque or a gateway settlement ADX recorded against the wallet. */
export interface TopUp {
    id: string;
    walletId: string;
    amount: Money;
    method: TopUpMethod;
    utr: string | null;
    /** The day the money reached ADX, not the day it was typed in. */
    receivedAt: string;
    paymentId: string | null;
    note: string | null;
    walletEntryId: string | null;
    reconciledAt: string | null;
    createdAt: string;
}

export interface TopUpPage {
    rows: TopUp[];
    nextCursor: string | null;
}

export type RefundDestination = "WALLET_CREDIT" | "BANK_TRANSFER" | "ORIGINAL_METHOD";
export type RefundRequestStatus = "PENDING" | "APPROVED" | "REJECTED" | "WITHDRAWN" | "PAID" | "FAILED";

export interface RefundRequest {
    id: string;
    walletId: string;
    amount: Money;
    reason: string;
    /** Why, in the raiser's words. */
    note: string;
    status: RefundRequestStatus;
    destination: RefundDestination;
    /** The advertiser's recorded agreement to a cash-out. */
    consentNote: string | null;
    payoutMethodId: string | null;
    rail: string | null;
    railReference: string | null;
    paidAt: string | null;
    decidedAt: string | null;
    decisionNote: string | null;
    ticketId: string | null;
    createdAt: string;
    updatedAt: string;
}

export interface RefundRequestPage {
    items: RefundRequest[];
    total: number;
    counts?: Record<string, number>;
}

const base = (advertiserId: string) => `/advertisers/${encodeURIComponent(advertiserId)}/wallet`;

function cursorQuery(query: { cursor?: string | null; limit?: number } = {}): string {
    const params = new URLSearchParams();
    params.set("limit", String(query.limit ?? STATEMENT_PAGE_SIZE));
    if (query.cursor) params.set("cursor", query.cursor);
    return params.toString();
}

export const walletService = {
    /** The balance. The wallet is created on first read, so a new account sees zeroes, not a 404. */
    wallet: (advertiserId: string) => api.get<WalletSnapshot>(base(advertiserId)),
    /** The statement, newest first, by cursor. */
    statement: (advertiserId: string, query: { cursor?: string | null; limit?: number } = {}) => api.get<Statement>(`${base(advertiserId)}/statement?${cursorQuery(query)}`),
    /** The top-ups ADX recorded, newest received first. */
    topUps: (advertiserId: string, query: { cursor?: string | null; limit?: number } = {}) => api.get<TopUpPage>(`${base(advertiserId)}/top-ups?${cursorQuery(query)}`),
    /** E6: the account's own refund requests, newest first. */
    refundRequests: (advertiserId: string, query: { status?: RefundRequestStatus; page?: number; pageSize?: number } = {}) => {
        const params = new URLSearchParams();
        if (query.status) params.set("status", query.status);
        if (query.page) params.set("page", String(query.page));
        if (query.pageSize) params.set("pageSize", String(query.pageSize));
        const qs = params.toString();
        return api.get<RefundRequestPage>(`${base(advertiserId)}/refund-requests${qs ? `?${qs}` : ""}`);
    },
};

/* ------------------------------------------------------------------ */
/* Money, read as text                                                 */
/* ------------------------------------------------------------------ */

function groupIndian(digits: string): string {
    if (digits.length <= 3) return digits;
    const last3 = digits.slice(-3);
    const rest = digits.slice(0, -3);
    return `${rest.replace(/\B(?=(\d{2})+(?!\d))/g, ",")},${last3}`;
}

function parts(amount: Money | null | undefined): { negative: boolean; whole: string; fraction: string } | null {
    if (typeof amount !== "string") return null;
    const match = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(amount.trim());
    if (!match) return null;
    const [, sign, whole, fraction = ""] = match;
    return { negative: sign === "-", whole: whole!.replace(/^0+(?=\d)/, ""), fraction: fraction.padEnd(2, "0") };
}

/** "₹12,500.00" — to the paisa, unsigned (the caller draws the sign); "—" for anything that is not money. */
export function inr(amount: Money | null | undefined): string {
    const value = parts(amount);
    if (!value) return "—";
    return `₹${groupIndian(value.whole)}.${value.fraction}`;
}

/** True for "0", "0.00", "-0.00". */
export function isZero(amount: Money | null | undefined): boolean {
    const value = parts(amount);
    return value !== null && /^0+$/.test(value.whole) && value.fraction === "00";
}

/** Money leaving the wallet. */
export function isDebit(amount: Money | null | undefined): boolean {
    const value = parts(amount);
    return value !== null && value.negative && !isZero(amount);
}

/** "+₹2,000.00" / "−₹2,000.00" — a statement line, signed so the column reads down. */
export function signedInr(amount: Money): string {
    if (parts(amount) === null) return "—";
    return `${isDebit(amount) ? "−" : "+"}${inr(amount)}`;
}

/** Paise as an integer, for a comparison only — never for arithmetic that is printed. Null when not money. */
export function toPaise(amount: Money | null | undefined): number | null {
    const value = parts(amount);
    if (!value) return null;
    const paise = Number(`${value.whole}${value.fraction}`);
    if (!Number.isSafeInteger(paise)) return null;
    return value.negative ? -paise : paise;
}

/** "9 Sep 2026" — the workspace's one date format. */
export const entryDate = (iso: string | null | undefined): string => shortDate(iso);

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** The month a line belongs to, for the statement's group headings. */
export function entryMonth(iso: string): string {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return "Undated";
    return `${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}

/* ------------------------------------------------------------------ */
/* The statement                                                       */
/* ------------------------------------------------------------------ */

export const ENTRY_LABEL: Record<WalletEntryType, string> = {
    TOPUP: "Money added",
    CAMPAIGN_DEBIT: "Campaign payment",
    PACKAGE_DEBIT: "Plan payment",
    GOODWILL_CREDIT: "ADX credit",
    REFUND: "Refund",
    ADJUSTMENT: "Adjustment by ADX",
    EARNING: "Earning",
    BONUS: "Bonus",
    REFERRAL: "Referral",
    PAYOUT: "Paid out",
    PENALTY: "Penalty",
    EXPIRY: "Credit expired",
    PROMOTION_DEBIT: "Advertising on ADX",
};

export type StatementChip = "ALL" | "PAYMENTS" | "REFUNDS" | "CREDITS" | "INVOICES";

/**
 * The app's chips. The advertiser statement has no `?type=`, so a chip
 * narrows the lines already read and "Load more" reads the next page
 * whatever chip is in force. Invoices is the documents, not a filter.
 */
export const STATEMENT_CHIPS: { value: StatementChip; label: string; types: readonly WalletEntryType[] }[] = [
    { value: "ALL", label: "All", types: [] },
    { value: "PAYMENTS", label: "Payments", types: ["CAMPAIGN_DEBIT", "PACKAGE_DEBIT", "PROMOTION_DEBIT"] },
    { value: "REFUNDS", label: "Refunds", types: ["REFUND"] },
    { value: "CREDITS", label: "Credits", types: ["TOPUP", "GOODWILL_CREDIT", "ADJUSTMENT", "EXPIRY"] },
    { value: "INVOICES", label: "Invoices", types: [] },
];

export function statementChip(value: string | null | undefined): StatementChip {
    return STATEMENT_CHIPS.some((chip) => chip.value === value) ? (value as StatementChip) : "ALL";
}

/** The lines a chip keeps. All and Invoices keep every line. */
export function chipEntries(chip: StatementChip, entries: readonly WalletEntry[]): WalletEntry[] {
    const types = STATEMENT_CHIPS.find((entry) => entry.value === chip)?.types ?? [];
    if (types.length === 0) return [...entries];
    return entries.filter((entry) => types.includes(entry.type));
}

/** A charge that took goodwill is "ADX credits used"; everything else by its kind. */
export function entryHeading(entry: Pick<WalletEntry, "type" | "isGoodwill" | "amount">): string {
    if (entry.isGoodwill && isDebit(entry.amount)) return "ADX credits used";
    return ENTRY_LABEL[entry.type] ?? entry.type;
}

/** The source line: the campaign, the plan's note, or nothing. */
export function entrySource(entry: Pick<WalletEntry, "type" | "note">, campaignName?: string): string | null {
    if (entry.type === "CAMPAIGN_DEBIT") return campaignName ?? null;
    if (entry.type === "REFUND" || entry.type === "TOPUP") return null;
    const written = entry.note?.trim() ?? "";
    return written === "" ? null : written;
}

/** The top-up behind a TOPUP line: by the entry id, then by the UTR the line carries as its reference. */
export function topUpFor(entry: Pick<WalletEntry, "id" | "type" | "reference">, topUps: readonly TopUp[]): TopUp | null {
    if (entry.type !== "TOPUP") return null;
    const byId = topUps.find((row) => row.walletEntryId === entry.id);
    if (byId) return byId;
    if (entry.reference) return topUps.find((row) => row.utr === entry.reference) ?? null;
    return null;
}

export const TOPUP_METHOD: Record<TopUpMethod, string> = {
    BANK_TRANSFER: "Bank transfer",
    CHEQUE: "Cheque",
    GATEWAY: "Online payment",
};

/** "Bank transfer · UTR HDFCN… · received 27 Mar 2026". */
export function topUpDetail(topUp: Pick<TopUp, "method" | "utr" | "paymentId" | "receivedAt">): string {
    const reference = topUp.utr ? `${topUp.method === "CHEQUE" ? "Cheque" : "UTR"} ${topUp.utr}` : topUp.paymentId ? `Ref ${topUp.paymentId}` : null;
    return [TOPUP_METHOD[topUp.method] ?? topUp.method, reference, `received ${entryDate(topUp.receivedAt)}`].filter(Boolean).join(" · ");
}

export type RefundOutcome = { destination: "BANK_TRANSFER" | "WALLET_CREDIT"; status: "WITH_FINANCE" | "FAILED" | "CREDITED" };

/**
 * What a REFUND line means, from what the wallet wrote on it: a debit when a
 * bank-transfer refund is approved (finance owes it), a credit noted
 * "Refund <id> failed:" when the transfer bounced back, and a plain credit
 * when a refund landed on the wallet.
 */
export function refundOutcome(entry: Pick<WalletEntry, "type" | "amount" | "note">): RefundOutcome | null {
    if (entry.type !== "REFUND") return null;
    if (isDebit(entry.amount)) return { destination: "BANK_TRANSFER", status: "WITH_FINANCE" };
    if (/^Refund\s+\S+\s+failed:/i.test(entry.note ?? "")) return { destination: "BANK_TRANSFER", status: "FAILED" };
    return { destination: "WALLET_CREDIT", status: "CREDITED" };
}

const REFUND_DETAIL: Record<RefundOutcome["status"], string> = {
    WITH_FINANCE: "To your bank account · with ADX finance",
    FAILED: "Bank transfer failed · returned to your wallet",
    CREDITED: "Credited to your wallet",
};

const REFUND_LINE_STATUS: Record<RefundOutcome["status"], { label: string; tone: Tone }> = {
    WITH_FINANCE: { label: "With finance", tone: "info" },
    FAILED: { label: "Returned", tone: "danger" },
    CREDITED: { label: "Credited", tone: "success" },
};

/** The second line under the heading, when the row has one. */
export function entryDetail(entry: Pick<WalletEntry, "type" | "amount" | "note" | "campaignId">, topUp: TopUp | null): string | null {
    if (topUp) return topUpDetail(topUp);
    const refund = refundOutcome(entry);
    if (!refund) return null;
    if (entry.campaignId && refund.status === "CREDITED") return "Campaign refund · credited to your wallet";
    return REFUND_DETAIL[refund.status];
}

/** The word for where a line stands: a refund's outcome, or "Applied" on goodwill spent. */
export function entryStatus(entry: Pick<WalletEntry, "type" | "amount" | "note" | "isGoodwill">): { label: string; tone: Tone } | null {
    const refund = refundOutcome(entry);
    if (refund) return REFUND_LINE_STATUS[refund.status];
    if (entry.isGoodwill && isDebit(entry.amount)) return { label: "Applied", tone: "neutral" };
    return null;
}

/** Consecutive runs of one month; the statement arrives newest first. */
export function byMonth<T extends { createdAt: string }>(rows: readonly T[]): { month: string; rows: T[] }[] {
    const groups: { month: string; rows: T[] }[] = [];
    for (const row of rows) {
        const month = entryMonth(row.createdAt);
        const last = groups[groups.length - 1];
        if (last && last.month === month) last.rows.push(row);
        else groups.push({ month, rows: [row] });
    }
    return groups;
}

/** Appends a page to the lines already read, dropping any line the cursor handed back twice. */
export function appendPage<T extends { id: string }>(current: readonly T[], next: readonly T[]): T[] {
    const seen = new Set(current.map((row) => row.id));
    return [...current, ...next.filter((row) => !seen.has(row.id))];
}

/* ------------------------------------------------------------------ */
/* Refund requests                                                     */
/* ------------------------------------------------------------------ */

export const REFUND_DESTINATION: Record<RefundDestination, string> = {
    WALLET_CREDIT: "To your wallet",
    BANK_TRANSFER: "To your bank account",
    ORIGINAL_METHOD: "Back to the way you paid",
};

export const REFUND_REQUEST_STATUS: Record<RefundRequestStatus, { label: string; tone: Tone }> = {
    PENDING: { label: "With finance", tone: "info" },
    APPROVED: { label: "Approved", tone: "info" },
    REJECTED: { label: "Refused", tone: "danger" },
    WITHDRAWN: { label: "Withdrawn", tone: "neutral" },
    PAID: { label: "Paid", tone: "success" },
    FAILED: { label: "Failed", tone: "danger" },
};

export function refundRequestStatus(status: string): { label: string; tone: Tone } {
    return REFUND_REQUEST_STATUS[status as RefundRequestStatus] ?? { label: status.toLowerCase().replace(/_/g, " "), tone: "neutral" };
}

const REFUND_REASON: Record<string, string> = {
    NO_SUITABLE_ALTERNATIVE: "No suitable alternative site",
    PUBLISHER_WITHDREW: "The publisher withdrew",
    ADVERTISER_LEAVING: "Closing the account",
    OTHER: "Other",
};

export function refundReasonLabel(reason: string): string {
    return REFUND_REASON[reason] ?? reason.toLowerCase().replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
}

/** "3 requests · 1 with finance" — the line under the heading. */
export function refundRequestsSummary(rows: readonly Pick<RefundRequest, "status">[], total?: number): string {
    const count = total ?? rows.length;
    if (count === 0) return "No refund requests on this account";
    const head = `${count} request${count === 1 ? "" : "s"}`;
    const open = rows.filter((row) => row.status === "PENDING" || row.status === "APPROVED").length;
    return open > 0 ? `${head} · ${open} open` : head;
}

/** The one line a paid or referenced request prints under its note. */
export function refundPaidLine(row: Pick<RefundRequest, "paidAt" | "railReference">): string | null {
    if (row.paidAt) return `Paid ${entryDate(row.paidAt)}${row.railReference ? ` · ref ${row.railReference}` : ""}`;
    if (row.railReference) return `Reference ${row.railReference}`;
    return null;
}

/* ------------------------------------------------------------------ */
/* Payment methods                                                     */
/* ------------------------------------------------------------------ */

/** Q111, in one sentence: there are no saved instruments on ADX. */
export const PAYMENT_METHODS_DECISION =
    "There are no saved cards or UPI handles on ADX: a card or UPI payment goes through the gateway's own page and pays the campaign or plan through your wallet, so there is nothing here to add, make primary or remove.";
