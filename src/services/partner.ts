import { api, apiBlob, ApiError } from "@/lib/api-client";
import { compareMoney, formatMoney, isPositiveMoney, sumMoney, toApiAmount, type IfscLookup, type Money, type NewMethodInput, type PayoutMethod, type Tone, type Withdrawal } from "@/services/publisher-workspace";

/**
 * PP-W (26 Sep 2026): the print partner on the web — the same routes the
 * user app's partner floor calls (`mobile/user-app/src/features/partner/
 * partner-api.ts`), every one under `/print-partners/me/*`, resolved by the
 * server to the partner behind the signed-in account (role PARTNER). A job
 * or a request that is not this partner's reads as 404, never as someone
 * else's.
 *
 * Every rupee is a decimal string and is read with the publisher's money
 * helpers; the payout method and the withdrawal are `payouts`' own shapes,
 * so the publisher's types serve here unchanged.
 */

export type PrintJobStatus = "REQUESTED" | "ACCEPTED" | "PRINTING" | "READY" | "COLLECTED" | "CANCELLED";
export type QuoteRequestStatus = "OPEN" | "AWARDED" | "CANCELLED" | "EXPIRED";
export type QuoteStatus = "SUBMITTED" | "ACCEPTED" | "REJECTED" | "WITHDRAWN";
export type PartnerKycStatus = "PENDING" | "VERIFIED" | "REJECTED" | "NEEDS_INFO";

/** The ladder the floor walks, forward only, one rung at a time. */
export const JOB_LADDER: readonly Exclude<PrintJobStatus, "CANCELLED">[] = ["REQUESTED", "ACCEPTED", "PRINTING", "READY", "COLLECTED"];

export interface RateCardRow {
    material: string;
    sizeClass?: string | null;
    unit: string;
    ratePerUnit: Money;
    minQty?: number | null;
    notes?: string | null;
}

export interface RateCardState {
    hasRateCard: boolean;
    fileId: string | null;
    /** `/api/v1/files/:id` — private; opened with the bearer. */
    fileUrl: string | null;
    updatedAt: string | null;
    rows: RateCardRow[];
}

/** `wallets.snapshot` — the shape every wallet on the platform answers. */
export interface PartnerBalances {
    walletId: string;
    balance: Money;
    goodwill: Money;
    spendable: Money;
    pendingClearance: Money;
    held: Money;
    openWithdrawals: Money;
    withdrawable: Money;
    lastActivityAt: string | null;
    frozenAt: string | null;
    frozenReason: string | null;
}

/** DS-1: what a party's own read says about one e-signed document. */
export interface SigningSlice {
    required: boolean;
    satisfied: boolean;
    status: string | null;
    requestId: string | null;
    signingUrl: string | null;
    mock: boolean;
    expiresAt: string | null;
    completedAt: string | null;
    signedFileId: string | null;
    label?: string | null;
}

/**
 * The KYC facts carried on the partner row. N3-B: `state` is one of the six
 * party states the desk's queue uses (AWAITING_DOCUMENTS, REQUESTED,
 * PENDING, NEEDS_INFO, REJECTED, VERIFIED) and `status` is null before any
 * record exists.
 */
export interface PartnerKycSummary {
    state?: string | null;
    status: PartnerKycStatus | null;
    submittedAt: string | null;
    method?: string | null;
    requestedAt: string | null;
    requestedChannel?: string | null;
}

type KycFacts = { state?: string | null; status: PartnerKycStatus | null; submittedAt: string | null; requestedAt: string | null };

/** `GET /print-partners/me` — the row, the wallet as it stands, the rate card, the service agreement. */
export interface PartnerProfile {
    id: string;
    displayId: string | null;
    userId: string;
    name: string;
    legalName: string | null;
    gstin: string | null;
    panNumber: string | null;
    contactName: string | null;
    mobile: string;
    email: string | null;
    address: string | null;
    city: string | null;
    /** The shop's state and six-digit PIN (1 Oct 2026); null until given. */
    state?: string | null;
    postalCode?: string | null;
    latitude: number | null;
    longitude: number | null;
    capabilities: string[];
    maxWidthFt: Money | null;
    turnaroundDays: number | null;
    isActive: boolean;
    activatedAt: string | null;
    /** PP-1: stamped when the shop applied itself; null for a shop the desk created. On the wire since 26 Sep 2026. */
    appliedAt?: string | null;
    verified?: boolean;
    acceptsQuoteRequests: boolean;
    rateCard: RateCardState;
    invoiceUploadFileId: string | null;
    walletId?: string | null;
    balances?: PartnerBalances | null;
    agreement?: SigningSlice;
    kycStatus?: PartnerKycStatus | null;
    kyc?: PartnerKycSummary | null;
    /** Phase D (1 Oct 2026): the legal form the shop verifies as — null until it is asked at the Digio start. One of the four a print partner may be. */
    entityType?: "INDIVIDUAL" | "SOLE_PROPRIETOR" | "COMPANY" | "LLP_PARTNERSHIP" | null;
    entityTypeStored?: boolean;
    createdAt: string;
    updatedAt: string;
}

/** PP-1: the application's details — the legal identity is writable here, and only while the application is open. */
export interface ApplicationDetailsInput {
    name?: string;
    legalName?: string | null;
    gstin?: string | null;
    panNumber?: string | null;
    contactName?: string | null;
    email?: string | null;
    address?: string | null;
    city?: string | null;
    state?: string | null;
    postalCode?: string | null;
    /** The shop's coordinates — where the agent collects from; from a pick in the address bar, never shown. */
    latitude?: number | null;
    longitude?: number | null;
    capabilities?: string[];
    turnaroundDays?: number | null;
    acceptsQuoteRequests?: boolean;
}

/** What the partner may change themselves — never the name, GSTIN, PAN or mobile. */
export interface UpdateProfileInput {
    contactName?: string | null;
    email?: string | null;
    address?: string | null;
    city?: string | null;
    state?: string | null;
    postalCode?: string | null;
    latitude?: number | null;
    longitude?: number | null;
    capabilities?: string[];
    maxWidthFt?: Money | null;
    turnaroundDays?: number | null;
    acceptsQuoteRequests?: boolean;
}

/** The order as the partner sees it — the artwork, the site, the agent who collects. */
export interface OrderForPrint {
    id: string;
    /** BK-1: BKG-DDMM-YYNN — on the partner's wire since 26 Sep 2026; null on an order older than the series. */
    displayId?: string | null;
    status: string;
    campaignName: string | null;
    startDate: string | null;
    endDate: string | null;
    artwork: { url: string | null; fileName: string | null; mimeType: string | null; widthPx: number | null; heightPx: number | null } | null;
    site: { id: string; title: string; address: string; city: string | null; latitude: number | null; longitude: number | null; size: string | null };
    agent: { id: string; name: string | null; mobile: string | null } | null;
}

export interface PrintJob {
    id: string;
    orderId: string;
    printPartnerId: string;
    status: PrintJobStatus;
    quotedCost: Money | null;
    actualCost: Money | null;
    specs: Record<string, unknown> | null;
    requestedAt: string;
    readyAt: string | null;
    collectedAt: string | null;
    costApprovedAt: string | null;
    notes: string | null;
    partnerAcceptedAt: string | null;
    partnerDeclinedAt: string | null;
    declineReason: string | null;
    awardedQuoteId: string | null;
    handoverConfirmedAt: string | null;
    handoverQrId: string | null;
    createdAt: string;
    updatedAt: string;
    /** Joined on the list and the detail; null when the order could not be read, absent on a move's answer. */
    order?: OrderForPrint | null;
}

export interface Quote {
    id: string;
    requestId: string;
    printPartnerId: string;
    amount: Money;
    turnaroundDays: number;
    note: string | null;
    status: QuoteStatus;
    submittedAt: string;
}

/** A request as the partner sees it: the specs, the deadline, and only their own quote — bids are sealed. */
export interface QuoteRequest {
    id: string;
    orderId: string;
    /** BK-1: the order's booking id (BKG-…) — on the wire since 26 Sep 2026. */
    orderDisplayId?: string | null;
    specs: Record<string, unknown>;
    city: string | null;
    deadlineAt: string;
    status: QuoteRequestStatus;
    awarded: boolean;
    reinvitedAt: string | null;
    myQuote: Quote | null;
    createdAt: string;
}

export interface QuoteInput {
    amount: Money;
    turnaroundDays: number;
    note?: string | null;
}

/** `payouts.withdrawalAllowance` — why the partner may withdraw what they may. */
export interface PartnerAllowance {
    walletId: string;
    balance: Money;
    pendingClearance: Money;
    openWithdrawals: Money;
    withdrawable: Money;
    dailyCap: Money;
    usedToday: Money;
    remainingToday: Money;
    maximum: Money;
    minimum: Money;
    monthsOnPlatform: number;
    nextRung: { months: number; cap: Money } | null;
    frozenAt: string | null;
}

/** One line of the partner's ledger. */
export interface LedgerEntry {
    id: string;
    type: string;
    amount: Money;
    balanceAfter: Money;
    orderId: string | null;
    /** BK-1: the order's booking id (BKG-…) — on the wire since 26 Sep 2026. */
    orderDisplayId?: string | null;
    reference: string | null;
    note: string | null;
    createdAt: string;
}

export interface PartnerEarnings {
    walletId: string;
    balances: PartnerBalances;
    allowance: PartnerAllowance;
    entries: LedgerEntry[];
    withdrawals: Withdrawal[];
}

/** G13-B: the four figures, Indian months, from the ledger. */
export interface PartnerEarningsSummary {
    thisMonth: Money;
    lastMonth: Money;
    pending: Money;
    paidToDate: Money;
}

export interface PartnerInvoice {
    id: string;
    filename: string;
    mimeType: string;
    sizeBytes: number;
    url: string;
    createdAt: string;
    /** YYYY-MM, or null for a file never recorded against a month. */
    month: string | null;
    recordedBy: "PARTNER" | "ADMIN" | null;
}

export interface ListPage<T> {
    items: T[];
    total: number;
    page: number;
    pageSize: number;
    counts: Record<string, number>;
}

export interface UploadedFile {
    id: string;
    url: string;
}

/** The private purposes the partner's own files go up under; the server refuses any other for these doors. */
export type PartnerUploadPurpose = "PARTNER_RATE_CARD" | "PARTNER_INVOICE";

/** The list contract's query: `status=A,B&page=&pageSize=`. */
export function listQuery(options: { status?: readonly string[]; page?: number; pageSize?: number; orderId?: string } = {}): string {
    const parts: string[] = [];
    if (options.status && options.status.length > 0) parts.push(`status=${options.status.join(",")}`);
    if (options.orderId) parts.push(`orderId=${encodeURIComponent(options.orderId)}`);
    if (options.page) parts.push(`page=${options.page}`);
    if (options.pageSize) parts.push(`pageSize=${options.pageSize}`);
    return parts.length ? `?${parts.join("&")}` : "";
}

const id = (value: string) => encodeURIComponent(value);

export const partnerService = {
    /* Me */
    me: () => api.get<PartnerProfile>("/print-partners/me"),
    updateMe: (body: UpdateProfileInput) => api.patch<PartnerProfile>("/print-partners/me", body),
    completeApplication: (body: ApplicationDetailsInput) => api.post<PartnerProfile>("/print-partners/me/application", body),
    setRateCard: (body: { fileId?: string | null; rows: RateCardRow[] }) => api.put<RateCardState>("/print-partners/me/rate-card", body),

    /* Quote requests */
    quoteRequests: (options: { status?: readonly QuoteRequestStatus[]; page?: number; pageSize?: number } = {}) => api.get<ListPage<QuoteRequest>>(`/print-partners/me/quote-requests${listQuery(options)}`),
    quoteRequest: (requestId: string) => api.get<QuoteRequest>(`/print-partners/me/quote-requests/${id(requestId)}`),
    submitQuote: (requestId: string, body: QuoteInput) => api.post<Quote>(`/print-partners/me/quote-requests/${id(requestId)}/quotes`, body),
    withdrawQuote: (requestId: string) => api.delete<Quote>(`/print-partners/me/quote-requests/${id(requestId)}/quotes`),

    /* Jobs */
    jobs: (options: { status?: readonly PrintJobStatus[]; page?: number; pageSize?: number; orderId?: string } = {}) => api.get<ListPage<PrintJob>>(`/print-partners/me/jobs${listQuery(options)}`),
    /** The shop's job behind an order — what an ORDER notice names (`?orderId=`, 26 Sep 2026); null when the order has no job here. */
    jobForOrder: async (orderId: string): Promise<PrintJob | null> => (await api.get<ListPage<PrintJob>>(`/print-partners/me/jobs${listQuery({ orderId, pageSize: 1 })}`)).items[0] ?? null,
    job: (jobId: string) => api.get<PrintJob>(`/print-partners/me/jobs/${id(jobId)}`),
    acceptJob: (jobId: string) => api.post<PrintJob>(`/print-partners/me/jobs/${id(jobId)}/accept`),
    declineJob: (jobId: string, reason: string) => api.post<PrintJob & { reopenedRequestId: string | null }>(`/print-partners/me/jobs/${id(jobId)}/decline`, { reason }),
    markPrinting: (jobId: string) => api.post<PrintJob>(`/print-partners/me/jobs/${id(jobId)}/printing`),
    markReady: (jobId: string) => api.post<PrintJob>(`/print-partners/me/jobs/${id(jobId)}/ready`),
    /** The agent's PICKUP code — scanned in the app, pasted here: the job goes COLLECTED with the scan on it. */
    handover: (jobId: string, qrToken: string) => api.post<PrintJob>(`/print-partners/me/jobs/${id(jobId)}/handover`, { qrToken: qrToken.trim() }),

    /* Money */
    earnings: (options: { limit?: number; cursor?: string } = {}) => {
        const parts = [`limit=${options.limit ?? 50}`];
        if (options.cursor) parts.push(`cursor=${encodeURIComponent(options.cursor)}`);
        return api.get<PartnerEarnings>(`/print-partners/me/earnings?${parts.join("&")}`);
    },
    earningsSummary: () => api.get<PartnerEarningsSummary>("/print-partners/me/earnings/summary"),
    requestWithdrawal: (body: { amount: Money; payoutMethodId?: string }) => api.post<Withdrawal>("/print-partners/me/withdrawals", body),
    payoutMethods: () => api.get<PayoutMethod[]>("/print-partners/me/payout-methods"),
    addPayoutMethod: (body: NewMethodInput) => api.post<PayoutMethod>("/print-partners/me/payout-methods", body),
    /** The public IFSC directory, before a bank account is added — open to every signed-in account. */
    ifsc: (code: string) => api.get<IfscLookup>(`/payouts/ifsc/${encodeURIComponent(code.trim().toUpperCase())}`),

    /* Invoices */
    uploadInvoice: (body: { fileId: string; month: string }) => api.post<{ fileId: string; month: string; url: string }>("/print-partners/me/invoices", body),
    invoices: () => api.get<PartnerInvoice[]>("/print-partners/me/invoices"),

    /** `POST /upload` — multipart, the file under `file`, the private purpose beside it. */
    upload: (file: File, purpose: PartnerUploadPurpose) => {
        const form = new FormData();
        form.append("file", file, file.name);
        form.append("purpose", purpose);
        return api.post<UploadedFile>("/upload", form);
    },
    /** A private file (`/api/v1/files/:id`) with the session's bearer. */
    file: (url: string) => apiBlob(filePath(url)),
};

/** `/api/v1/files/x` → `/files/x`, the path the client prefixes with its base; a bare id is taken as one. */
export function filePath(url: string): string {
    const trimmed = url.trim();
    if (/^https?:\/\//i.test(trimmed)) {
        const at = trimmed.indexOf("/files/");
        return at >= 0 ? trimmed.slice(at) : trimmed;
    }
    if (trimmed.startsWith("/api/v1/")) return trimmed.slice("/api/v1".length);
    if (trimmed.startsWith("/")) return trimmed;
    return `/files/${encodeURIComponent(trimmed)}`;
}

/** A URL the browser can draw as it is (a public creative), versus a path on private storage. */
export const isPrivatePath = (url: string | null | undefined): boolean => !!url && (url.startsWith("/") || /\/api\/v1\/files\//.test(url));

/* ------------------------------------------------------------------ */
/* Errors                                                              */
/* ------------------------------------------------------------------ */

/**
 * The sentence a partner page shows for a failure: the server's own, except
 * where the server's is written for the console (a switched-off feature) or
 * a code carries a clearer instruction for this side of the counter.
 */
export function partnerMessage(caught: unknown, fallback: string): string {
    if (!(caught instanceof ApiError)) return fallback;
    switch (caught.code) {
        case "FEATURE_OFF":
            return "ADX has switched this part of the print floor off for now. Try again later, or ask Help & support.";
        case "DEADLINE_PASSED":
            return "The deadline for quotes on this request has passed. ADX decides from the quotes that are in.";
        case "PICKUP_CODE_MISMATCH":
            return "That pickup code is for a different order. Ask the agent for the code of this order.";
        case "INVALID_QR":
            return "That is not an ADX pickup code. Copy the whole code from the agent's ADX app and paste it again.";
        case "NETWORK":
        case "TIMEOUT":
            return caught.message;
        default:
            return caught.message || fallback;
    }
}

/** A read whose failure carries the partner's sentence — for loaders that print `ApiError.message` as they get it. */
export async function readable<T>(promise: Promise<T>, fallback: string): Promise<T> {
    try {
        return await promise;
    } catch (caught) {
        if (caught instanceof ApiError) throw new ApiError(caught.status, caught.code, partnerMessage(caught, fallback), caught.details);
        throw new ApiError(0, "UNKNOWN", fallback);
    }
}

/** DS-2: the request a SIGNATURE_REQUIRED refusal carries, or null for any other error. */
export function signingFromError(caught: unknown): { requestId: string | null } | null {
    if (!(caught instanceof ApiError) || caught.code !== "SIGNATURE_REQUIRED") return null;
    const details = (caught.details ?? {}) as { signing?: { id?: string } | null };
    return { requestId: details.signing?.id ?? null };
}

export const signingOpen = (status: string | null | undefined): boolean => status === "REQUESTED" || status === "PARTIALLY_SIGNED";

/** A slice that wants the partner's attention: required and not satisfied. */
export const signingPending = (slice: SigningSlice | null | undefined): slice is SigningSlice => Boolean(slice && slice.required && !slice.satisfied);

/** Where the e-sign page lives, coming back to `next` once signed. */
export const signHref = (requestId: string, next: string): string => `/sign/${encodeURIComponent(requestId)}?next=${encodeURIComponent(next)}`;

/* ------------------------------------------------------------------ */
/* The account                                                         */
/* ------------------------------------------------------------------ */

/** A partner the desk has not switched on yet: an application. The desk's own creations cannot sign in until activated, so a signed-in one is always an applicant. */
export const isApplicant = (partner: Pick<PartnerProfile, "activatedAt">): boolean => !partner.activatedAt;

/** When the shop applied (`appliedAt`, PP-1) as the page prints it — "26 Sep 2026" — or null for a shop the desk created (or an older wire). */
export function appliedOn(partner: Pick<PartnerProfile, "appliedAt">): string | null {
    if (!partner.appliedAt) return null;
    const at = new Date(partner.appliedAt);
    return Number.isNaN(at.getTime()) ? null : at.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
}

/** The application's details have been sent: the shop and where it is. */
export const applicationSent = (partner: Pick<PartnerProfile, "address" | "city">): boolean => (partner.address ?? "").trim().length > 0 && (partner.city ?? "").trim().length > 0;

/** The shop name the party choice wrote is the mobile until the shop names itself. */
export function shopNameOf(partner: Pick<PartnerProfile, "name" | "mobile">): string {
    const name = (partner.name ?? "").trim();
    if (!name) return "";
    const digits = name.replace(/[^\d]/g, "");
    return digits.length >= 10 && digits === (partner.mobile ?? "").replace(/[^\d]/g, "") ? "" : name;
}

/** What the press does, as the app offers it on the application. */
export const CAPABILITIES = ["Flex banners", "Vinyl & stickers", "Foam & sunboard", "Backlit & flex-face", "Fabric & canvas", "Digital screens", "Installation"] as const;

const GSTIN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const PAN = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
/** The PIN as the backend takes it: six digits, never starting 0. */
const PIN = /^[1-9][0-9]{5}$/;
const PIN_PROBLEM = "A PIN code is six digits, like 560001.";

export interface ApplicationForm {
    name: string;
    legalName: string;
    gstin: string;
    pan: string;
    contactName: string;
    address: string;
    city: string;
    state: string;
    postalCode: string;
    /** The coordinates behind the address — set by a pick in the "Find the address" bar, never shown; what the row had until then. */
    latitude?: number | null;
    longitude?: number | null;
    turnaround: string;
    capabilities: string[];
    pricing: "QUOTES" | "RATE_CARD";
}

/** The coordinates as a body sends them: both, or nothing at all — a half pair is never sent, and they are never cleared. */
function pinBody(form: { latitude?: number | null; longitude?: number | null }): { latitude?: number; longitude?: number } {
    return typeof form.latitude === "number" && Number.isFinite(form.latitude) && typeof form.longitude === "number" && Number.isFinite(form.longitude) ? { latitude: form.latitude, longitude: form.longitude } : {};
}

export function applicationFormOf(partner: PartnerProfile): ApplicationForm {
    return {
        name: shopNameOf(partner),
        legalName: partner.legalName ?? "",
        gstin: partner.gstin ?? "",
        pan: partner.panNumber ?? "",
        contactName: partner.contactName ?? "",
        address: partner.address ?? "",
        city: partner.city ?? "",
        state: partner.state ?? "",
        postalCode: partner.postalCode ?? "",
        latitude: partner.latitude ?? null,
        longitude: partner.longitude ?? null,
        turnaround: partner.turnaroundDays === null || partner.turnaroundDays === undefined ? "" : String(partner.turnaroundDays),
        capabilities: [...(partner.capabilities ?? [])],
        pricing: partner.acceptsQuoteRequests === false ? "RATE_CARD" : "QUOTES",
    };
}

/** The application body, or the first thing wrong with the form — the server's rules said first. */
export function applicationBody(form: ApplicationForm): { body: ApplicationDetailsInput } | { problem: string } {
    const name = form.name.trim();
    const address = form.address.trim();
    const city = form.city.trim();
    if (!name || !address || !city) return { problem: "The shop name, address and city are needed." };
    if (name.length < 2) return { problem: "The shop name needs at least two characters." };
    const postalCode = form.postalCode.trim();
    if (postalCode && !PIN.test(postalCode)) return { problem: PIN_PROBLEM };
    const gstin = form.gstin.trim().toUpperCase();
    if (gstin && !GSTIN.test(gstin)) return { problem: "That does not look like a GSTIN — fifteen characters, like 29ABCDE1234F1Z5." };
    const pan = form.pan.trim().toUpperCase();
    if (pan && !PAN.test(pan)) return { problem: "That does not look like a PAN — ten characters, like ABCDE1234F." };
    const turnaround = form.turnaround.trim();
    const days = turnaround === "" ? null : Number(turnaround);
    if (days !== null && (!Number.isInteger(days) || days < 0 || days > 365)) return { problem: "The turnaround is a whole number of days, up to 365." };
    return {
        body: {
            name,
            legalName: form.legalName.trim() || null,
            gstin: gstin || null,
            panNumber: pan || null,
            contactName: form.contactName.trim() || null,
            address,
            city,
            state: form.state.trim() || null,
            postalCode: postalCode || null,
            ...pinBody(form),
            capabilities: form.capabilities.map((item) => item.trim()).filter(Boolean).slice(0, 30),
            turnaroundDays: days,
            acceptsQuoteRequests: form.pricing === "QUOTES",
        },
    };
}

export interface ProfileForm {
    contactName: string;
    email: string;
    address: string;
    city: string;
    state: string;
    postalCode: string;
    /** The coordinates behind the address the agent collects from — from a pick in the bar, never shown. */
    latitude?: number | null;
    longitude?: number | null;
    capabilities: string[];
    maxWidth: string;
    turnaround: string;
}

export function profileFormOf(partner: PartnerProfile): ProfileForm {
    return {
        contactName: partner.contactName ?? "",
        email: partner.email ?? "",
        address: partner.address ?? "",
        city: partner.city ?? "",
        state: partner.state ?? "",
        postalCode: partner.postalCode ?? "",
        latitude: partner.latitude ?? null,
        longitude: partner.longitude ?? null,
        capabilities: [...(partner.capabilities ?? [])],
        maxWidth: partner.maxWidthFt ?? "",
        turnaround: partner.turnaroundDays === null || partner.turnaroundDays === undefined ? "" : String(partner.turnaroundDays),
    };
}

/** `PATCH /print-partners/me` from the profile form, or the first thing wrong with it. */
export function profilePatch(form: ProfileForm): { body: UpdateProfileInput } | { problem: string } {
    const email = form.email.trim();
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { problem: "That email address does not look right." };
    const postalCode = form.postalCode.trim();
    if (postalCode && !PIN.test(postalCode)) return { problem: PIN_PROBLEM };
    const width = form.maxWidth.trim();
    const maxWidthFt = width === "" ? null : toApiAmount(width);
    if (width !== "" && (!maxWidthFt || !isPositiveMoney(maxWidthFt))) return { problem: "The widest print is a number of feet, like 10 or 12.5." };
    const turnaround = form.turnaround.trim();
    const days = turnaround === "" ? null : Number(turnaround);
    if (days !== null && (!Number.isInteger(days) || days < 0 || days > 365)) return { problem: "The turnaround is a whole number of days, up to 365." };
    return {
        body: {
            contactName: form.contactName.trim() || null,
            email: email || null,
            address: form.address.trim() || null,
            city: form.city.trim() || null,
            state: form.state.trim() || null,
            postalCode: postalCode || null,
            ...pinBody(form),
            capabilities: form.capabilities.map((item) => item.trim()).filter(Boolean).slice(0, 30),
            maxWidthFt,
            turnaroundDays: days,
        },
    };
}

/* ------------------------------------------------------------------ */
/* KYC standing — the words the app prints                             */
/* ------------------------------------------------------------------ */

export type KycStanding = "NONE" | "REQUESTED" | PartnerKycStatus;

export const KYC_WORDS: Record<PartnerKycStatus, { label: string; tone: Tone }> = {
    PENDING: { label: "Under review", tone: "warning" },
    VERIFIED: { label: "Verified", tone: "success" },
    REJECTED: { label: "Rejected", tone: "danger" },
    NEEDS_INFO: { label: "Needs info", tone: "danger" },
};

/** The summary to judge from: the record's facts when the row carries them, else the mirror — a bare PENDING reads as nothing yet. */
export function kycSummaryOf(partner: Pick<PartnerProfile, "kycStatus" | "kyc">): KycFacts | null {
    if (partner.kyc) return partner.kyc;
    const status = partner.kycStatus ?? null;
    if (!status || status === "PENDING") return null;
    return { status, submittedAt: null, requestedAt: null };
}

const STANDINGS: readonly KycStanding[] = ["NONE", "REQUESTED", "PENDING", "VERIFIED", "REJECTED", "NEEDS_INFO"];

export function kycStanding(summary: KycFacts | null | undefined): KycStanding {
    if (!summary) return "NONE";
    /* N3-B: the party state, when the row carries it, is the desk's own reading. */
    if (summary.state === "AWAITING_DOCUMENTS") return "NONE";
    if (summary.state && (STANDINGS as readonly string[]).includes(summary.state)) return summary.state as KycStanding;
    if (!summary.status) return summary.requestedAt ? "REQUESTED" : "NONE";
    if (summary.status === "PENDING" && !summary.submittedAt) return summary.requestedAt ? "REQUESTED" : "NONE";
    return summary.status;
}

export function kycStandingWords(standing: KycStanding): { label: string; tone: Tone } {
    if (standing === "REQUESTED") return { label: "Requested by ADX", tone: "warning" };
    return (standing !== "NONE" && KYC_WORDS[standing]) || { label: "Not started", tone: "warning" };
}

/** The home banner while the shop is not verified; null once it is, or on a server that says nothing about KYC. */
export function kycBanner(partner: Pick<PartnerProfile, "kycStatus" | "kyc">): { title: string; body: string } | null {
    const status = partner.kycStatus ?? partner.kyc?.status ?? null;
    if (!status || status === "VERIFIED") return null;
    const standing = kycStanding(kycSummaryOf(partner));
    const body =
        standing === "PENDING"
            ? "Your documents are with ADX. They are usually reviewed within a day."
            : standing === "NEEDS_INFO"
              ? "ADX could not accept some of your documents — send the flagged ones again."
              : standing === "REJECTED"
                ? "ADX could not verify the shop from what was sent. Open Verification to see why and try again."
                : standing === "REQUESTED"
                  ? "ADX has asked for your shop's KYC. Verify with Digio, or upload the documents."
                  : "Verify the shop once — with Digio in a minute, or by uploading PAN, GST, the owner's ID, a bank proof and a selfie.";
    return { title: "Complete your KYC", body };
}

/* ------------------------------------------------------------------ */
/* Jobs                                                                */
/* ------------------------------------------------------------------ */

/**
 * The words are decisions: REQUESTED says "Accept or decline" because the
 * shop is the one holding it up; READY says "Awaiting pickup" because the
 * agent now moves it.
 */
export const JOB_WORDS: Record<PrintJobStatus, { label: string; tone: Tone }> = {
    REQUESTED: { label: "Accept or decline", tone: "warning" },
    ACCEPTED: { label: "Accepted", tone: "info" },
    PRINTING: { label: "Printing", tone: "warning" },
    READY: { label: "Awaiting pickup", tone: "info" },
    COLLECTED: { label: "Collected", tone: "success" },
    CANCELLED: { label: "Cancelled", tone: "neutral" },
};

export const LADDER_LABELS: Record<Exclude<PrintJobStatus, "CANCELLED">, string> = {
    REQUESTED: "Requested",
    ACCEPTED: "Accepted",
    PRINTING: "Printing",
    READY: "Ready",
    COLLECTED: "Collected",
};

export const JOB_CHIPS: { value: PrintJobStatus | "ALL"; label: string }[] = [
    { value: "ALL", label: "All" },
    { value: "REQUESTED", label: "New" },
    { value: "ACCEPTED", label: "Accepted" },
    { value: "PRINTING", label: "Printing" },
    { value: "READY", label: "Ready" },
    { value: "COLLECTED", label: "Collected" },
    { value: "CANCELLED", label: "Cancelled" },
];

/** The booking an order is, by its BKG id — or, on a row older than the series (or a wire that does not carry it yet), the same six characters the notices use. */
export function bookingRefOf(orderId: string, displayId?: string | null): string {
    return displayId || `BKG-${orderId.slice(-6).toUpperCase()}`;
}

export const jobRef = (job: Pick<PrintJob, "orderId" | "order">): string => bookingRefOf(job.orderId, job.order?.displayId);
export const requestRef = (request: Pick<QuoteRequest, "orderId" | "orderDisplayId">): string => bookingRefOf(request.orderId, request.orderDisplayId);

/** Jobs where the shop is the blocker sort first; then the newest move. */
const NEEDS_YOU: PrintJobStatus[] = ["REQUESTED", "ACCEPTED", "PRINTING"];

export function sortJobs(jobs: PrintJob[]): PrintJob[] {
    return [...jobs].sort((a, b) => {
        const blocking = Number(NEEDS_YOU.includes(b.status)) - Number(NEEDS_YOU.includes(a.status));
        if (blocking !== 0) return blocking;
        return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });
}

/** The rungs the home's "in hand" list shows: the shop's move, or the agent on their way. */
export const IN_HAND: PrintJobStatus[] = ["REQUESTED", "ACCEPTED", "PRINTING", "READY"];

export interface LadderStep {
    key: string;
    label: string;
    state: "done" | "current" | "todo";
    detail: string | null;
}

/** The fact under a reached rung — the time it happened. */
export function ladderDetail(job: PrintJob, rung: PrintJobStatus): string | null {
    switch (rung) {
        case "REQUESTED":
            return formatWhen(job.requestedAt);
        case "ACCEPTED":
            return job.partnerAcceptedAt ? formatWhen(job.partnerAcceptedAt) : null;
        case "READY":
            return job.readyAt ? formatWhen(job.readyAt) : null;
        case "COLLECTED":
            return job.handoverConfirmedAt ? `${formatWhen(job.handoverConfirmedAt)} · scanned` : job.collectedAt ? `${formatWhen(job.collectedAt)} · recorded by the agent` : null;
        default:
            return null;
    }
}

export function ladderSteps(job: PrintJob): LadderStep[] {
    const position = JOB_LADDER.indexOf(job.status as Exclude<PrintJobStatus, "CANCELLED">);
    return JOB_LADDER.map((rung, index) => ({
        key: rung.toLowerCase(),
        label: LADDER_LABELS[rung],
        state: job.status === "CANCELLED" ? (index === 0 ? "done" : "todo") : job.status === "COLLECTED" ? "done" : index < position ? "done" : index === position ? "current" : "todo",
        detail: ladderDetail(job, rung),
    }));
}

/** The one date that matters at this rung. */
export function jobWhen(job: PrintJob): string {
    switch (job.status) {
        case "REQUESTED":
            return `Requested ${formatWhen(job.requestedAt)}`;
        case "ACCEPTED":
            return `Accepted ${formatWhen(job.partnerAcceptedAt)}`;
        case "PRINTING":
            return job.order?.startDate ? `Goes up ${formatDay(job.order.startDate)}` : `Accepted ${formatWhen(job.partnerAcceptedAt)}`;
        case "READY":
            return `Ready ${formatWhen(job.readyAt)}`;
        case "COLLECTED":
            return `Collected ${formatWhen(job.handoverConfirmedAt ?? job.collectedAt)}`;
        default:
            return `Cancelled ${formatWhen(job.partnerDeclinedAt ?? job.updatedAt)}`;
    }
}

/** What the rung allows, and nothing the server would refuse: decline only until printing starts. */
export function jobMoves(status: PrintJobStatus): { accept: boolean; decline: boolean; printing: boolean; ready: boolean; handover: boolean } {
    return {
        accept: status === "REQUESTED",
        decline: status === "REQUESTED" || status === "ACCEPTED",
        printing: status === "ACCEPTED",
        ready: status === "PRINTING",
        handover: status === "READY",
    };
}

/** A decline's reason, or why it cannot be sent yet. */
export function declineProblem(reason: string): string | null {
    return reason.trim().length < 3 ? "Say why, in a few words. ADX reads the reason and reopens the request for the other shops." : null;
}

/** The ledger's credit for the job's order — the first positive line keyed by the order, once ADX approves the cost. */
export function creditFor(job: Pick<PrintJob, "orderId">, entries: LedgerEntry[] | null | undefined): LedgerEntry | null {
    if (!entries) return null;
    return entries.find((entry) => entry.orderId === job.orderId && isPositiveMoney(entry.amount)) ?? null;
}

/** The specs, printed as rows: strings and numbers as they are, a nested value named rather than dumped. */
export function specRows(specs: Record<string, unknown> | null | undefined): { key: string; value: string }[] {
    if (!specs) return [];
    return Object.entries(specs)
        .filter(([, value]) => value !== null && value !== undefined && value !== "")
        .map(([key, value]) => ({
            key: key
                .replace(/[_-]+/g, " ")
                .replace(/([a-z])([A-Z])/g, "$1 $2")
                .toLowerCase()
                .replace(/^\w/, (c) => c.toUpperCase()),
            value: typeof value === "string" || typeof value === "number" || typeof value === "boolean" ? String(value) : JSON.stringify(value),
        }));
}

/** The first few readable specs on one line, for a row. */
export function specSummary(specs: Record<string, unknown> | null | undefined): string {
    const parts = Object.entries(specs ?? {})
        .filter(([, value]) => typeof value === "string" || typeof value === "number")
        .slice(0, 3)
        .map(([key, value]) => `${key} ${String(value)}`);
    return parts.length ? parts.join(" · ") : "Print specs attached";
}

/* ------------------------------------------------------------------ */
/* Quote requests                                                      */
/* ------------------------------------------------------------------ */

export const REQUEST_CHIPS: { value: QuoteRequestStatus | "ALL"; label: string }[] = [
    { value: "ALL", label: "All" },
    { value: "OPEN", label: "Open" },
    { value: "AWARDED", label: "Awarded" },
    { value: "EXPIRED", label: "Expired" },
];

export const QUOTE_WORDS: Record<QuoteStatus, { label: string; tone: Tone }> = {
    SUBMITTED: { label: "Quoted", tone: "info" },
    ACCEPTED: { label: "Awarded to you", tone: "success" },
    REJECTED: { label: "Not awarded", tone: "neutral" },
    WITHDRAWN: { label: "Withdrawn", tone: "neutral" },
};

const REQUEST_WORDS: Record<QuoteRequestStatus, string> = { OPEN: "Open", AWARDED: "Awarded", EXPIRED: "Expired", CANCELLED: "Cancelled" };

export function deadlinePassed(iso: string, now: number): boolean {
    const at = new Date(iso).getTime();
    return Number.isNaN(at) || at <= now;
}

/** "2 days 3 h left", "45 min left", "Closed". */
export function countdown(iso: string, now: number): string {
    const left = new Date(iso).getTime() - now;
    if (Number.isNaN(left) || left <= 0) return "Closed";
    const minutes = Math.floor(left / 60000);
    if (minutes < 60) return `${Math.max(minutes, 1)} min left`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} h ${minutes % 60} min left`;
    const days = Math.floor(hours / 24);
    return `${days} day${days === 1 ? "" : "s"} ${hours % 24} h left`;
}

/** Where a request stands for the partner: the outcome once decided, else whether their quote is in. */
export function requestOutcome(request: Pick<QuoteRequest, "status" | "awarded" | "deadlineAt" | "myQuote">, now: number): { label: string; tone: Tone } {
    if (request.status === "AWARDED") return request.awarded ? { label: "Awarded to you", tone: "success" } : { label: "Not awarded", tone: "neutral" };
    if (request.status !== "OPEN") return { label: REQUEST_WORDS[request.status], tone: "neutral" };
    if (deadlinePassed(request.deadlineAt, now)) return { label: "Closed", tone: "neutral" };
    return request.myQuote?.status === "SUBMITTED" ? { label: "Quoted", tone: "info" } : { label: "Quote wanted", tone: "warning" };
}

/** Open ones with the nearest deadline first; the decided ones after, newest first. */
export function sortRequests(requests: QuoteRequest[], now: number): QuoteRequest[] {
    return [...requests].sort((a, b) => {
        const aOpen = a.status === "OPEN" && !deadlinePassed(a.deadlineAt, now);
        const bOpen = b.status === "OPEN" && !deadlinePassed(b.deadlineAt, now);
        if (aOpen !== bOpen) return aOpen ? -1 : 1;
        if (aOpen) return new Date(a.deadlineAt).getTime() - new Date(b.deadlineAt).getTime();
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
}

/** The partner's quote as it stands — a withdrawn one is no quote. */
export const standingQuote = (request: Pick<QuoteRequest, "myQuote">): Quote | null => (request.myQuote && request.myQuote.status !== "WITHDRAWN" ? request.myQuote : null);

/** Whether the quote form is drawn: the request open, the deadline ahead, the quote not decided. */
export function quoteEditable(request: Pick<QuoteRequest, "status" | "deadlineAt" | "myQuote">, now: number): boolean {
    if (request.status !== "OPEN" || deadlinePassed(request.deadlineAt, now)) return false;
    const standing = standingQuote(request);
    return standing?.status !== "ACCEPTED" && standing?.status !== "REJECTED";
}

/** The quote body from the typed amount, days and note — or the first thing wrong with them. */
export function quoteBody(input: { amount: string; turnaround: string; note: string }): { body: QuoteInput } | { problem: string } {
    const amount = toApiAmount(input.amount);
    if (!amount || !isPositiveMoney(amount)) return { problem: "Enter your price for the whole print, in rupees." };
    const turnaround = input.turnaround.trim();
    const days = Number(turnaround);
    if (turnaround === "" || !Number.isInteger(days) || days < 0 || days > 365) return { problem: "The turnaround is a whole number of days, up to 365." };
    const note = input.note.trim();
    if (note.length > 500) return { problem: "Keep the note to 500 characters." };
    return { body: { amount, turnaroundDays: days, note: note || null } };
}

/* ------------------------------------------------------------------ */
/* Money                                                               */
/* ------------------------------------------------------------------ */

export const ENTRY_LABEL: Record<string, string> = {
    PRINT_COST: "Print job paid",
    EARNING: "Print charge approved",
    BONUS: "Bonus",
    ADJUSTMENT: "Adjustment by ADX",
    PAYOUT: "Paid out to your account",
    PENALTY: "Penalty",
    REFUND: "Refund",
    GOODWILL_CREDIT: "ADX credit",
};

export function entryLabel(kind: string): string {
    return ENTRY_LABEL[kind] ?? kind.replace(/_/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase());
}

/** Credits dated this month from the ledger page — the fallback when the summary did not answer. */
export function creditedThisMonth(entries: LedgerEntry[], now: Date): Money {
    const month = monthKey(now);
    const credits = entries.filter((entry) => isPositiveMoney(entry.amount) && monthKey(new Date(entry.createdAt)) === month).map((entry) => entry.amount);
    return credits.length === 0 ? "0.00" : (sumMoney(credits) ?? "0.00");
}

/** Why nothing can be asked for, naming the rule that bites — in payouts' order; null when a withdrawal can be asked for. */
export function withdrawBlocker(allowance: PartnerAllowance | null | undefined, methods: PayoutMethod[], frozen: boolean): string | null {
    if (!allowance) return "Your wallet could not be read just now.";
    if (frozen || allowance.frozenAt) return "Your wallet is frozen; withdrawals are refused until ADX lifts it.";
    if (!methods.some((method) => method.status === "VERIFIED")) return "Add a bank account or UPI ID first. ADX checks it before any withdrawal can use it.";
    if (!isPositiveMoney(allowance.withdrawable)) return `Nothing has cleared in your wallet yet. The smallest withdrawal is ${formatMoney(allowance.minimum)}.`;
    if (!isPositiveMoney(allowance.remainingToday)) return `You have used today's ${formatMoney(allowance.dailyCap)} limit. What is left can be asked for tomorrow.`;
    if (compareMoney(allowance.maximum, allowance.minimum) < 0) return `Less than the smallest withdrawal, ${formatMoney(allowance.minimum)}, is ready right now.`;
    return null;
}

/** The typed amount against the rules, in the server's order; null when it is fine (or nothing is typed yet). */
export function withdrawProblem(raw: string, allowance: PartnerAllowance): string | null {
    if (!raw.trim()) return null;
    const amount = toApiAmount(raw);
    if (!amount || !isPositiveMoney(amount)) return "Enter an amount to withdraw.";
    if (compareMoney(amount, allowance.minimum) < 0) return `The smallest withdrawal is ${formatMoney(allowance.minimum)}.`;
    if (compareMoney(amount, allowance.withdrawable) > 0) return `Only ${formatMoney(allowance.withdrawable)} has cleared.`;
    if (compareMoney(amount, allowance.remainingToday) > 0) return `${formatMoney(allowance.remainingToday)} of today's ${formatMoney(allowance.dailyCap)} limit is left.`;
    return null;
}

/* ------------------------------------------------------------------ */
/* Rate card                                                           */
/* ------------------------------------------------------------------ */

export interface RateDraft {
    material: string;
    sizeClass: string;
    unit: string;
    ratePerUnit: string;
    minQty: string;
    notes: string;
}

export const emptyRateDraft = (): RateDraft => ({ material: "", sizeClass: "", unit: "sq ft", ratePerUnit: "", minQty: "", notes: "" });

export const rateDraftOf = (row: RateCardRow): RateDraft => ({
    material: row.material,
    sizeClass: row.sizeClass ?? "",
    unit: row.unit,
    ratePerUnit: row.ratePerUnit,
    minQty: row.minQty === null || row.minQty === undefined ? "" : String(row.minQty),
    notes: row.notes ?? "",
});

/** An untouched line is left out, not a mistake; the prefilled unit alone does not count as typing. */
export const isBlankRateDraft = (draft: RateDraft): boolean => [draft.material, draft.sizeClass, draft.ratePerUnit, draft.minQty, draft.notes].every((value) => value.trim() === "");

export function rateRowOf(draft: RateDraft): { row: RateCardRow } | { problem: string } {
    const material = draft.material.trim();
    const unit = draft.unit.trim();
    const rate = toApiAmount(draft.ratePerUnit);
    if (!material) return { problem: "Name the material." };
    if (!unit) return { problem: "Say what the rate is per — sq ft, piece, running ft." };
    if (!rate || !isPositiveMoney(rate)) return { problem: "Enter the rate." };
    const minQty = draft.minQty.trim() === "" ? null : Number(draft.minQty);
    if (minQty !== null && (!Number.isInteger(minQty) || minQty < 1)) return { problem: "The minimum quantity is a whole number." };
    return { row: { material, sizeClass: draft.sizeClass.trim() || null, unit, ratePerUnit: rate, minQty, notes: draft.notes.trim() || null } };
}

/** The whole card from the drafts: the rows, the problems by line, and whether there is anything to save. */
export function rateCardBody(drafts: RateDraft[], fileId: string | null): { body: { fileId: string | null; rows: RateCardRow[] } | null; problems: Record<number, string>; problem: string | null } {
    const rows: RateCardRow[] = [];
    const problems: Record<number, string> = {};
    drafts.forEach((draft, index) => {
        if (isBlankRateDraft(draft)) return;
        const result = rateRowOf(draft);
        if ("problem" in result) problems[index] = result.problem;
        else rows.push(result.row);
    });
    if (Object.keys(problems).length > 0) return { body: null, problems, problem: null };
    if (!fileId && rows.length === 0) return { body: null, problems, problem: "A rate card needs a file or at least one rate." };
    return { body: { fileId, rows }, problems, problem: null };
}

/* ------------------------------------------------------------------ */
/* Dates                                                               */
/* ------------------------------------------------------------------ */

const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "24 Sep, 7:16 pm" — the moment on the partner's clock, the website's month words. */
export function formatWhen(iso: string | null | undefined): string {
    if (!iso) return "—";
    const at = new Date(iso);
    if (Number.isNaN(at.getTime())) return "—";
    const hours = at.getHours();
    const minutes = String(at.getMinutes()).padStart(2, "0");
    return `${at.getDate()} ${MONTHS_SHORT[at.getMonth()]}, ${hours % 12 === 0 ? 12 : hours % 12}:${minutes} ${hours < 12 ? "am" : "pm"}`;
}

/** "29 Sep 2026". */
export function formatDay(iso: string | null | undefined): string {
    if (!iso) return "—";
    const at = new Date(iso);
    if (Number.isNaN(at.getTime())) return "—";
    return `${at.getDate()} ${MONTHS_SHORT[at.getMonth()]} ${at.getFullYear()}`;
}

/** "2026-09" for the month a date falls in — the invoice route's YYYY-MM. */
export function monthKey(date: Date): string {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

const MONTHS_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export function monthLabel(key: string): string {
    const [year, month] = key.split("-").map(Number);
    if (!year || !month || month < 1 || month > 12) return key;
    return `${MONTHS_LONG[month - 1]} ${year}`;
}

/** This month and the two before it: the months a shop invoices for. */
export function recentMonths(now: Date): { value: string; label: string }[] {
    return [0, 1, 2].map((back) => {
        const at = new Date(now.getFullYear(), now.getMonth() - back, 1);
        const key = monthKey(at);
        return { value: key, label: monthLabel(key) };
    });
}
