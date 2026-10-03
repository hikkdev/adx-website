import { api } from "@/lib/api-client";

/**
 * Disputes on the web — the ADX app's `mobile/shared/features/disputes/*`
 * over the same `/disputes` routes. A case is raised against an order,
 * never against a typed name: the server reads the parties off it. It is
 * visible to the raiser, the other party and ADX. A decision that credits
 * money records the credit for ADX finance to release — nothing that moves
 * money is automatic — and the pages say so rather than promising it.
 */

export type DisputeStatus = "OPEN" | "UNDER_REVIEW" | "AWAITING_RESPONSE" | "ESCALATED" | "RESOLVED" | "REJECTED";
export type DisputeReason = "PROOF_REJECTED" | "PAYOUT_ISSUE" | "DAMAGE" | "WRONG_LOCATION" | "OTHER";
export type DisputeParty = "PUBLISHER" | "ADVERTISER" | "AGENT" | "ADX";
export type DisputeOutcome = "REINSTALL" | "PARTIAL_CREDIT" | "FULL_CREDIT" | "NO_FAULT";
export type DisputeCreditStatus = "NONE" | "PENDING" | "RELEASED";
/** The list's three chips — the server's six statuses projected. */
export type DisputeState = "OPEN" | "UNDER_REVIEW" | "RESOLVED";
export type EvidenceKind = "IMG" | "PDF" | "OTHER";

/** The five "what went wrong" chips, in the app's order. */
export const DISPUTE_REASONS: { id: DisputeReason; label: string }[] = [
    { id: "PROOF_REJECTED", label: "Proof rejected" },
    { id: "PAYOUT_ISSUE", label: "Payout issue" },
    { id: "DAMAGE", label: "Damage" },
    { id: "WRONG_LOCATION", label: "Wrong location" },
    { id: "OTHER", label: "Other" },
];

export const MAX_DISPUTE_EVIDENCE = 5;
/** The server's floor on a case's detail. */
export const DETAIL_MIN = 10;

export interface DisputeOrder {
    id: string;
    status: string;
    campaignName: string | null;
    listing: { id: string; title: string; address: string; city: string | null } | null;
}

export interface DisputeMessage {
    id: string;
    disputeId: string;
    authorUserId: string;
    authorName: string;
    isFromOps: boolean;
    body: string;
    createdAt: string;
}

export interface DisputeEvidence {
    id: string;
    disputeId: string;
    uploadedByUserId: string;
    url: string;
    kind: EvidenceKind;
    fileName: string | null;
    uploadedAt: string;
}

export interface Dispute {
    id: string;
    displayId: string;
    raisedByUserId: string;
    raisedAs: DisputeParty;
    againstParty: DisputeParty;
    againstUserId: string | null;
    orderId: string | null;
    listingId: string | null;
    reason: DisputeReason;
    detail: string;
    expectedResolution: string | null;
    amountClaimed: string | null;
    status: DisputeStatus;
    statusNote: string | null;
    slaDueAt: string | null;
    reviewStartedAt: string | null;
    escalatedAt: string | null;
    resolvedAt: string | null;
    outcome: DisputeOutcome | null;
    resolutionNote: string | null;
    creditedAmount: string | null;
    creditStatus: DisputeCreditStatus;
    creditReleasedAt: string | null;
    reopenUntil: string | null;
    resolutionRating?: number | null;
    resolutionRatingNote?: string | null;
    resolutionRatedAt?: string | null;
    reinstallMilestoneId?: string | null;
    reinstallStatus?: string | null;
    reinstallPending?: boolean;
    createdAt: string;
    updatedAt: string;
    order: DisputeOrder | null;
    agentState?: DisputeState;
    messageCount?: number;
    evidenceCount?: number;
}

export type DisputeDetail = Dispute & {
    raisedBy: { id: string; name: string | null };
    messages: DisputeMessage[];
    evidence: DisputeEvidence[];
};

export interface MyDisputes {
    disputes: Dispute[];
    counts: { open: number; underReview: number; resolved: number };
}

export interface EvidenceItem {
    url: string;
    kind?: EvidenceKind;
    fileName?: string;
}

export interface NewDispute {
    orderId: string;
    reason: DisputeReason;
    detail: string;
    expectedResolution?: string;
    evidence?: EvidenceItem[];
}

export type OrderPersona = "publisher" | "advertiser";

/** An order as `GET /orders/my` returns it for either side — enough for the Against card. */
export interface DisputableOrder {
    id: string;
    displayId?: string | null;
    status: string;
    campaignName: string | null;
    createdAt?: string;
    listing?: { id?: string; title: string; address?: string; city?: string | null } | null;
}

export const disputesService = {
    mine: () => api.get<MyDisputes>("/disputes/my"),
    get: (id: string) => api.get<DisputeDetail>(`/disputes/${encodeURIComponent(id)}`),
    raise: (body: NewDispute) => api.post<Dispute>("/disputes", body),
    message: (id: string, body: string) => api.post<DisputeMessage>(`/disputes/${encodeURIComponent(id)}/messages`, { body }),
    evidence: (id: string, item: EvidenceItem) => api.post<DisputeEvidence>(`/disputes/${encodeURIComponent(id)}/evidence`, item),
    reopen: (id: string) => api.post<Dispute>(`/disputes/${encodeURIComponent(id)}/reopen`, {}),
    /** The raiser's 1–5 score of how ADX handled a decided case — once; the server answers 409 to a second. */
    rate: (id: string, body: { rating: number; note?: string }) => api.post<Dispute>(`/disputes/${encodeURIComponent(id)}/rate`, body),
    orders: (as: OrderPersona) => api.get<{ items: DisputableOrder[] }>(`/orders/my?as=${as}&pageSize=100`).then((page) => page.items ?? []),
    /** Evidence is a private file (`DISPUTE_EVIDENCE`) — read back only through `/files/:id`. */
    upload: (file: File) => {
        const form = new FormData();
        form.append("file", file, file.name);
        form.append("purpose", "DISPUTE_EVIDENCE");
        return api.post<{ id: string; url: string }>("/upload", form);
    },
};

/* ------------------------------------------------------------------ */
/* Pure helpers                                                        */
/* ------------------------------------------------------------------ */

export function stateOf(status: DisputeStatus): DisputeState {
    if (status === "OPEN") return "OPEN";
    if (status === "RESOLVED" || status === "REJECTED") return "RESOLVED";
    return "UNDER_REVIEW";
}

export const isClosed = (status: DisputeStatus): boolean => status === "RESOLVED" || status === "REJECTED";

export const STATE_LABEL: Record<DisputeState, string> = { OPEN: "Open", UNDER_REVIEW: "Under review", RESOLVED: "Resolved" };

export type DisputeFilter = "ALL" | DisputeState;

export const DISPUTE_FILTERS: { id: DisputeFilter; label: string }[] = [
    { id: "ALL", label: "All" },
    { id: "OPEN", label: "Open" },
    { id: "UNDER_REVIEW", label: "Under review" },
    { id: "RESOLVED", label: "Resolved" },
];

export function matchesFilter(dispute: Pick<Dispute, "status">, filter: DisputeFilter): boolean {
    return filter === "ALL" || stateOf(dispute.status) === filter;
}

export function matchesSearch(dispute: Pick<Dispute, "displayId" | "detail" | "reason" | "order">, query: string): boolean {
    const needle = query.trim().toLowerCase();
    if (!needle) return true;
    const hay = [dispute.displayId, dispute.detail, reasonLabel(dispute.reason), dispute.order?.listing?.title ?? "", dispute.order?.campaignName ?? ""].join(" ").toLowerCase();
    return hay.includes(needle);
}

export function reasonLabel(reason: DisputeReason | string): string {
    return DISPUTE_REASONS.find((entry) => entry.id === reason)?.label ?? String(reason).toLowerCase().replace(/_/g, " ");
}

export function outcomeLabel(outcome: DisputeOutcome | null): string {
    switch (outcome) {
        case "REINSTALL":
            return "Reinstall approved";
        case "PARTIAL_CREDIT":
            return "Partial credit";
        case "FULL_CREDIT":
            return "Full credit";
        case "NO_FAULT":
            return "No fault found";
        default:
            return "Decision pending";
    }
}

/** "ORDER #A3F1" — the tail of the id, the way the app prints an order. */
export const shortOrder = (orderId: string): string => `ORDER #${orderId.slice(-4).toUpperCase()}`;

/** The stage tag: what the order was doing when the case was raised. */
export function orderTag(status: string): string {
    switch (status) {
        case "SLOT_PROPOSED":
        case "SLOT_CONFIRMED":
        case "IN_PROGRESS":
        case "PENDING_OTP":
        case "PENDING_APPROVAL":
        case "SELF_INSTALL":
            return "Installation";
        case "PENDING_PRINT":
        case "PENDING_AGENT":
            return "Print";
        case "COMPLETED":
            return "Completed";
        case "CANCELLED":
            return "Cancelled";
        default:
            return "Booking";
    }
}

/** Why the raise form would be refused before it is sent. */
export function raiseProblem(input: { orderId: string | null; detail: string }): string | null {
    if (!input.orderId) return "Choose the order this is about.";
    if (input.detail.trim().length < DETAIL_MIN) return "Describe what happened in a few more words.";
    return null;
}

/** The body `POST /disputes` gets from the form. */
export function raiseBody(input: { orderId: string; reason: DisputeReason; detail: string; expected: string; evidence: { url: string; fileName: string; kind: EvidenceKind }[] }): NewDispute {
    return {
        orderId: input.orderId,
        reason: input.reason,
        detail: input.detail.trim(),
        ...(input.expected.trim() ? { expectedResolution: input.expected.trim() } : {}),
        evidence: input.evidence.map((item) => ({ url: item.url, kind: item.kind, fileName: item.fileName })),
    };
}

/** What kind of evidence a file is, by its type or its name. */
export function evidenceKindOf(file: { type?: string; name: string }): EvidenceKind {
    if ((file.type ?? "").startsWith("image/") || /\.(png|jpe?g|webp|gif|heic)$/i.test(file.name)) return "IMG";
    if (file.type === "application/pdf" || /\.pdf$/i.test(file.name)) return "PDF";
    return "OTHER";
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "08 Jul". */
export function shortDate(iso: string | null | undefined): string {
    if (!iso) return "";
    const at = new Date(iso);
    if (Number.isNaN(at.getTime())) return "";
    return `${String(at.getDate()).padStart(2, "0")} ${MONTHS[at.getMonth()]}`;
}

/** "8:10 AM". */
export function timeOf(iso: string): string {
    const when = new Date(iso);
    const hours = when.getHours();
    return `${hours % 12 === 0 ? 12 : hours % 12}:${String(when.getMinutes()).padStart(2, "0")} ${hours < 12 ? "AM" : "PM"}`;
}

/** "2 days ago". */
export function agoLabel(iso: string, now: Date = new Date()): string {
    const minutes = Math.max(0, Math.floor((now.getTime() - new Date(iso).getTime()) / 60_000));
    if (minutes < 60) return minutes <= 1 ? "just now" : `${minutes} min ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return hours === 1 ? "1 hour ago" : `${hours} hours ago`;
    const days = Math.floor(hours / 24);
    if (days < 30) return days === 1 ? "1 day ago" : `${days} days ago`;
    return shortDate(iso);
}

/** "₹450" — a decimal string as the app prints a credit. */
export function rupeesOf(amount: string): string {
    const value = Number(amount);
    if (!Number.isFinite(value)) return `₹${amount}`;
    return `₹${value.toLocaleString("en-IN", { minimumFractionDigits: value % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;
}

/** The row's foot: what happened last on the left, what the person can do on the right. */
export function cardFoot(dispute: Dispute, now: Date = new Date()): { left: string; right: string; tone: "action" | "money" | "muted" } {
    const state = stateOf(dispute.status);
    if (state === "OPEN") return { left: `Raised ${agoLabel(dispute.createdAt, now)}`, right: "Add evidence", tone: "action" };
    if (state === "UNDER_REVIEW") return { left: `Ops assigned ${shortDate(dispute.reviewStartedAt ?? dispute.updatedAt)}`, right: "View case", tone: "action" };
    const closed = `Closed ${shortDate(dispute.resolvedAt ?? dispute.updatedAt)}`;
    if (dispute.creditedAmount) {
        return dispute.creditStatus === "RELEASED"
            ? { left: closed, right: `${rupeesOf(dispute.creditedAmount)} refunded`, tone: "money" }
            : { left: closed, right: `${rupeesOf(dispute.creditedAmount)} approved`, tone: "money" };
    }
    return { left: closed, right: outcomeLabel(dispute.outcome), tone: "muted" };
}

export type TimelineRow = { label: string; value: string; done: boolean; current: boolean };

/** The three-row case timeline: where the case is, the decision, the close. */
export function timelineOf(dispute: Pick<Dispute, "status" | "createdAt" | "reviewStartedAt" | "resolvedAt" | "escalatedAt">): TimelineRow[] {
    const decided = isClosed(dispute.status);
    const first: TimelineRow =
        dispute.status === "OPEN"
            ? { label: "Raised", value: shortDate(dispute.createdAt), done: true, current: true }
            : dispute.status === "AWAITING_RESPONSE"
              ? { label: "Evidence requested", value: shortDate(dispute.reviewStartedAt ?? dispute.createdAt), done: true, current: true }
              : dispute.status === "ESCALATED"
                ? { label: "Escalated", value: shortDate(dispute.escalatedAt ?? dispute.reviewStartedAt ?? dispute.createdAt), done: true, current: true }
                : { label: "Under review", value: shortDate(dispute.reviewStartedAt ?? dispute.createdAt), done: true, current: !decided };
    return [
        { ...first, current: !decided },
        { label: "Decision", value: decided && dispute.resolvedAt ? shortDate(dispute.resolvedAt) : "Pending", done: decided, current: false },
        { label: "Resolved", value: decided && dispute.resolvedAt ? shortDate(dispute.resolvedAt) : "", done: decided, current: decided },
    ];
}

export type ConversationTurn = {
    id: string;
    kind: "message" | "evidence";
    mine: boolean;
    fromOps: boolean;
    author: string;
    body: string;
    url: string | null;
    fileKind?: EvidenceKind;
    at: string;
};

/** The thread and the evidence, one conversation in time order. */
export function conversationOf(dispute: DisputeDetail, meUserId: string | undefined): ConversationTurn[] {
    const turns: ConversationTurn[] = [
        ...dispute.messages.map((message) => ({
            id: message.id,
            kind: "message" as const,
            mine: message.authorUserId === meUserId,
            fromOps: message.isFromOps,
            author: message.isFromOps ? message.authorName : message.authorUserId === meUserId ? "You" : message.authorName,
            body: message.body,
            url: null,
            at: message.createdAt,
        })),
        ...dispute.evidence.map((item) => ({
            id: item.id,
            kind: "evidence" as const,
            mine: item.uploadedByUserId === meUserId,
            fromOps: false,
            author: item.uploadedByUserId === meUserId ? "You" : item.uploadedByUserId === dispute.raisedByUserId ? (dispute.raisedBy.name ?? "Raiser") : "Other party",
            body: item.fileName ?? "Attachment",
            url: item.url,
            fileKind: item.kind,
            at: item.uploadedAt,
        })),
    ];
    turns.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
    return turns;
}

/** Whether the raiser may still score a decided case. */
export function canRate(dispute: Pick<Dispute, "status" | "resolutionRating">): boolean {
    return isClosed(dispute.status) && (dispute.resolutionRating ?? null) === null;
}

/** Whether the raiser may still reopen a decided case. */
export function canReopen(dispute: Pick<Dispute, "status" | "reopenUntil">, now: Date = new Date()): boolean {
    return isClosed(dispute.status) && !!dispute.reopenUntil && new Date(dispute.reopenUntil).getTime() > now.getTime();
}

/** The re-install row's words: a REINSTALL decision raises a visit, and the case reads pending until it is done. */
export function reinstallLine(dispute: Pick<Dispute, "outcome" | "reinstallPending" | "reinstallStatus" | "reinstallMilestoneId">): string | null {
    if (dispute.outcome !== "REINSTALL" && !dispute.reinstallMilestoneId) return null;
    if (dispute.reinstallPending) return "Re-install pending";
    if (dispute.reinstallStatus === "SKIPPED") return "Re-install visit skipped";
    if (dispute.reinstallStatus === "COMPLETED") return "Re-installed";
    return dispute.reinstallMilestoneId ? "Re-install pending" : null;
}

/** What the resolved card says under the title. A credit is "approved" until finance releases it. */
export function resolvedSummary(dispute: Pick<Dispute, "outcome" | "resolutionNote" | "creditedAmount" | "creditStatus">): string {
    const note = dispute.resolutionNote?.trim() || `${outcomeLabel(dispute.outcome)}.`;
    const lead = note.endsWith(".") ? note : `${note}.`;
    if (!dispute.creditedAmount) return lead;
    return dispute.creditStatus === "RELEASED"
        ? `${lead} ${rupeesOf(dispute.creditedAmount)} credited to your wallet.`
        : `${lead} ${rupeesOf(dispute.creditedAmount)} credit approved — ADX finance releases it to your wallet.`;
}

/** The reopen window, in words. */
export function reopenLine(dispute: Pick<Dispute, "status" | "reopenUntil">, now: Date = new Date()): string {
    if (!dispute.reopenUntil) return "Reopen window closed";
    return canReopen(dispute, now) ? `Reopen window open until ${shortDate(dispute.reopenUntil)}` : `Reopen window closed ${shortDate(dispute.reopenUntil)}`;
}

export const STAR_WORDS = ["", "Poor", "Not great", "Fine", "Good", "Excellent"] as const;
