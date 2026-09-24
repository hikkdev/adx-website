import { api, apiBlob, ApiError } from "@/lib/api-client";

/**
 * The publisher workspace (DR 12 board 10) over the routes the ADX app's
 * publisher side already reads: `/publishers/me/*`, `/orders/*`,
 * `/payouts/*`, `/support/tickets`, `/users/me/*`, `/notifications/preferences`
 * and the availability contract (`/publishers/me/availability`,
 * `/listings/:id/blocked-dates`). Types mirror the backend payloads as the
 * mobile `*-api.ts` files declare them; every rupee is a decimal string.
 */

export type Money = string;

/* ------------------------------------------------------------------ */
/* The publisher                                                       */
/* ------------------------------------------------------------------ */

export type KycStatus = "PENDING" | "VERIFIED" | "REJECTED" | "NEEDS_INFO";

export interface PublisherProfile {
    id: string;
    displayId: string | null;
    name: string;
    mobile: string;
    email?: string | null;
    type?: string | null;
    address?: string | null;
    city?: string | null;
    state?: string | null;
    gstin?: string | null;
    contactName?: string | null;
    contactMobile?: string | null;
    contactEmail?: string | null;
    kycStatus: KycStatus | string;
    onboardingStatus?: string;
    verified?: boolean;
    avatarUrl?: string | null;
    createdAt?: string;
    /** QR-3: how far along the account is; absent on an older backend. */
    readiness?: { score?: number; items?: { key: string; label: string; done: boolean }[] } | null;
}

export interface PublisherPatch {
    name?: string;
    email?: string;
    type?: string;
    address?: string;
    city?: string;
    state?: string;
    gstin?: string;
    contactName?: string;
    contactMobile?: string;
    contactEmail?: string;
}

/** The KYC row (`GET /publishers/me/kyc`), or null before the first submission. */
export interface PublisherKyc {
    id: string;
    status: KycStatus | string;
    method: string;
    rejectionReason: string | null;
    reviewNote?: string | null;
    submittedAt: string | null;
    reviewedAt: string | null;
    panFrontUrl: string | null;
    gstUrl: string | null;
    addressProofUrl: string | null;
    businessRegCertUrl: string | null;
    businessAddressProofUrl: string | null;
    adAuthLetterUrl: string | null;
    aadhaarFrontUrl?: string | null;
    govIdFrontUrl?: string | null;
}

/** What `POST /publishers/me/kyc` takes — the document URLs `POST /upload` answered. */
export interface KycSubmission {
    panFrontUrl?: string;
    gstUrl?: string;
    addressProofUrl?: string;
    businessRegCertUrl?: string;
    businessAddressProofUrl?: string;
    adAuthLetterUrl?: string;
}

/** The documents the Verify page asks for, in the frame's order. */
export const KYC_DOCUMENTS: { key: keyof KycSubmission; label: string; hint: string }[] = [
    { key: "businessRegCertUrl", label: "Business registration", hint: "Certificate of incorporation, shop licence or partnership deed" },
    { key: "panFrontUrl", label: "PAN card", hint: "The business PAN, or the owner's for a sole proprietor" },
    { key: "gstUrl", label: "GST certificate", hint: "Needed when the business is GST-registered" },
    { key: "addressProofUrl", label: "Address proof", hint: "A utility bill, rent agreement or bank statement" },
    { key: "adAuthLetterUrl", label: "Authorisation to advertise", hint: "The letter or agreement that lets you sell advertising on your spaces" },
];

export interface PublisherDashboard {
    name: string;
    greeting: string;
    occupancy: { rate: number | null; occupied: number; live: number };
    awaiting: number;
    listings: { id: string; title: string; status: string; occupied: boolean }[];
}

/* ------------------------------------------------------------------ */
/* Inventory                                                           */
/* ------------------------------------------------------------------ */

export type ListingCategory = "INDOOR" | "OUTDOOR" | "TRANSIT" | "MEDIA";

export interface ListingPhoto {
    id: string;
    url: string;
    type: string;
}

export interface MyListing {
    id: string;
    displayId: string | null;
    title: string;
    category: ListingCategory | string;
    subType: string | null;
    placement: string | null;
    address: string;
    city: string | null;
    status: string;
    ratePerDay: Money | null;
    pricingUnit?: string;
    basePrice?: Money | null;
    widthFt: string | null;
    heightFt: string | null;
    illumination: string | null;
    photos?: ListingPhoto[];
    occupied: boolean;
    belowFloor?: boolean;
    rejectionReason?: string | null;
    submittedAt?: string | null;
    publishedAt?: string | null;
    createdAt: string;
}

export interface MyListingsPage {
    items: MyListing[];
    total: number;
    page: number;
    pageSize: number;
    counts: Record<string, number>;
}

/* ------------------------------------------------------------------ */
/* Bookings                                                            */
/* ------------------------------------------------------------------ */

export type OrderStatus =
    | "DRAFT"
    | "PENDING_PUBLISHER"
    | "PUBLISHER_REJECTED"
    | "PENDING_PRINT"
    | "SELF_INSTALL"
    | "PENDING_AGENT"
    | "AGENT_REJECTED"
    | "SLOT_PROPOSED"
    | "SLOT_CONFIRMED"
    | "IN_PROGRESS"
    | "PENDING_OTP"
    | "PENDING_APPROVAL"
    | "COMPLETED"
    | "CANCELLED";

export type InstallBy = "PUBLISHER" | "ADX";

export interface BookingListing {
    id: string;
    displayId?: string | null;
    title: string;
    address: string;
    city: string | null;
    category?: ListingCategory | string;
    subType?: string | null;
    placement?: string | null;
    widthFt?: string | null;
    heightFt?: string | null;
    illumination?: string | null;
    ratePerDay: Money | null;
    latitude?: number | null;
    longitude?: number | null;
    photos?: ListingPhoto[];
}

export interface BookingPerson {
    id: string;
    name: string | null;
    mobile?: string;
}

/** One row of `GET /orders/my?as=publisher` — the order and its listing. */
export interface Booking {
    id: string;
    status: OrderStatus;
    campaignName: string | null;
    campaignId?: string | null;
    designUrl: string | null;
    startDate: string | null;
    endDate: string | null;
    notes: string | null;
    meetingPlace: string | null;
    slotTime: string | null;
    slotCounterCount: number;
    publisherTimerExpiry: string | null;
    publisherAcceptedAt: string | null;
    autoAcceptedAt?: string | null;
    slotConfirmedAt: string | null;
    adminApprovedAt: string | null;
    printReadyAt: string | null;
    installBy: InstallBy | null;
    agentId: string | null;
    cancellationReason?: string | null;
    cancelledAt?: string | null;
    /** What the publisher said when they declined — written by `reject-publisher`. */
    publisherRejectionReason?: string | null;
    listingId: string;
    listing?: BookingListing;
    createdAt: string;
}

export interface BookingMilestone {
    id: string;
    status: "PENDING" | "DISPATCHED" | "IN_PROGRESS" | "COMPLETED" | "SKIPPED";
    order: number;
    startedAt: string | null;
    completedAt: string | null;
    template: { id: string; title: string; description: string | null } | null;
}

/** The whole aggregate `GET /orders/:id` returns. */
export interface BookingDetail extends Booking {
    advertiser?: BookingPerson | null;
    agent?: { id: string; city: string | null; user: BookingPerson | null } | null;
    verification?: { qrScanned: boolean; checklistPassed: boolean; notes: string | null; verifiedAt: string | null } | null;
    checkIn?: { latitude: number; longitude: number; distanceM: number; checkedInAt: string } | null;
    milestones?: BookingMilestone[];
    campaign?: { id: string; name: string; reference?: string; advertiser?: { name: string } | null } | null;
    quotedFee?: Money | null;
}

export interface BookingsPage {
    items: Booking[];
    total: number;
    page: number;
    pageSize: number;
    counts: Record<string, number>;
}

export type EvidenceKind = "PICKUP" | "CONDITION" | "INSTALLATION" | "REJECTION";

export interface EvidencePhoto {
    id: string;
    kind: EvidenceKind;
    label: string | null;
    url: string;
    latitude: number | null;
    longitude: number | null;
    capturedAt: string;
}

export interface Evidence {
    photos: EvidencePhoto[];
    counts: Partial<Record<EvidenceKind, number>>;
    requirements: { key: string; label: string; met: boolean }[];
    met: number;
    total: number;
    canSubmit: boolean;
}

export interface SpotInsights {
    scans: number;
    estimatedReach: number | null;
    interactions: number;
}

/* ------------------------------------------------------------------ */
/* Money                                                               */
/* ------------------------------------------------------------------ */

export type PayoutMethodStatus = "PENDING_VERIFICATION" | "VERIFIED" | "REJECTED";
export type WithdrawalStatus = "REQUESTED" | "APPROVED" | "PROCESSING" | "PAID" | "REJECTED" | "FAILED" | "CANCELLED";
export type WalletEntryType = "TOPUP" | "CAMPAIGN_DEBIT" | "PACKAGE_DEBIT" | "GOODWILL_CREDIT" | "REFUND" | "ADJUSTMENT" | "EARNING" | "BONUS" | "REFERRAL" | "PAYOUT" | "PENALTY" | "EXPIRY";

export interface PayoutMethod {
    id: string;
    type: "BANK" | "UPI";
    accountHolder: string | null;
    bankName: string | null;
    accountNumberMasked: string | null;
    ifscCode: string | null;
    bankBranch?: string | null;
    upiVpa: string | null;
    isDefault: boolean;
    status: PayoutMethodStatus;
    verifiedVia: string | null;
    verifiedAt: string | null;
    rejectionReason: string | null;
    createdAt: string;
}

export interface NewMethodInput {
    type: "BANK" | "UPI";
    accountHolder?: string;
    bankName?: string;
    accountNumber?: string;
    ifscCode?: string;
    upiVpa?: string;
}

export interface Allowance {
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
}

export interface WalletSnapshot {
    walletId: string;
    balance: Money;
    goodwill: Money;
    spendable: Money;
    pendingClearance: Money;
    held: Money;
    openWithdrawals: Money;
    withdrawable: Money;
    lastActivityAt: string | null;
    kind: "PUBLISHER" | "AGENT" | string;
    allowance: Allowance;
    frozenAt?: string | null;
    frozenReason?: string | null;
}

export interface WalletEntry {
    id: string;
    type: WalletEntryType;
    amount: Money;
    balanceAfter: Money;
    isGoodwill: boolean;
    reference: string | null;
    note: string | null;
    createdAt: string;
}

export interface EarningsDay {
    id: string;
    forDate: string;
    listing: { id: string; title: string; city: string | null };
    gross: Money;
    commission: Money;
    taxWithheld: Money;
    net: Money;
    clearsAt: string;
    cleared: boolean;
}

export interface Earnings {
    summary: { grossEarned: Money; commission: Money; taxWithheld: Money; netEarned: Money; daysEarned: number; pendingClearance: Money; pendingDays: number };
    days: EarningsDay[];
}

export interface Withdrawal {
    id: string;
    reference: string;
    walletId: string;
    amount: Money;
    taxWithheld: Money;
    netAmount: Money;
    status: WithdrawalStatus;
    requestedAt: string;
    decidedAt: string | null;
    decisionNote: string | null;
    rail: string | null;
    railReference: string | null;
    paidAt: string | null;
    failureReason: string | null;
    method: PayoutMethod;
}

export interface Statement {
    id: string;
    reference: string;
    period: string;
    periodStart: string;
    periodEnd: string;
    openingBalance: Money;
    credits: Money;
    debits: Money;
    taxWithheld: Money;
    closingBalance: Money;
    entryCount: number;
    hasPdf: boolean;
    generatedAt: string;
}

export interface IfscLookup {
    ifsc: string;
    bank: string | null;
    branch: string | null;
    city: string | null;
    state: string | null;
    found: boolean;
}

/* ------------------------------------------------------------------ */
/* Availability                                                        */
/* ------------------------------------------------------------------ */

export interface AvailabilityBooking {
    orderId: string;
    campaignName: string | null;
    advertiserName: string | null;
    from: string;
    to: string;
    kind: "BOOKED" | "HOLD";
    /** Added by the fallback so the bar can print the booking's own word. */
    status?: OrderStatus;
}

export interface AvailabilityBlock {
    id: string;
    from: string;
    to: string;
    reason: string | null;
}

export interface AvailabilityListing {
    id: string;
    displayId: string | null;
    title: string;
    category: string;
    city: string | null;
    slotsTotal: number;
    status: string;
    bookings: AvailabilityBooking[];
    blocks: AvailabilityBlock[];
}

export interface AvailabilityWindow {
    from: string;
    to: string;
    listings: AvailabilityListing[];
    /** False when the read fell back to listings + bookings because the contract is not live yet. */
    blocksAvailable: boolean;
}

/* ------------------------------------------------------------------ */
/* Support and account                                                 */
/* ------------------------------------------------------------------ */

export type TicketStatus = "OPEN" | "WAITING" | "CLOSED";

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
}

export interface SupportTicket {
    id: string;
    userId: string;
    kind: "ISSUE" | "FEEDBACK";
    displayId: string | null;
    title: string;
    description: string;
    category: string;
    status: TicketStatus;
    priority?: string | null;
    relatedOrderId: string | null;
    attachmentUrls: string[];
    createdAt: string;
    updatedAt: string;
    messages?: TicketMessage[];
}

export type IssueCategory = "ORDER" | "LISTING" | "PAYMENT" | "ACCOUNT" | "APP_BUG" | "OTHER";

export interface NewTicket {
    kind?: "ISSUE";
    title?: string;
    description: string;
    category: IssueCategory;
    relatedOrderId?: string;
    attachmentUrls?: string[];
}

export interface DeviceSession {
    id: string;
    userAgent: string | null;
    ipAddress: string | null;
    lastUsedAt: string | null;
    createdAt: string;
    expiresAt: string;
    current?: boolean;
}

export type NotificationType = "ORDER" | "BOOKING" | "PAYOUT" | "KYC" | "MESSAGE" | "SYSTEM" | "DISPUTE" | "ANNOUNCEMENT" | "WORK";
export type NotificationChannel = "IN_APP" | "PUSH" | "EMAIL" | "SMS";

export interface NotificationPreference {
    type: NotificationType;
    channel: NotificationChannel;
    enabled: boolean;
    mandatory: boolean;
}

export interface AccountMe {
    id: string;
    mobile: string;
    email: string | null;
    name: string | null;
    hasPassword?: boolean;
    roles: string[];
}

export interface UploadedFile {
    id: string;
    url: string;
}

/* ------------------------------------------------------------------ */
/* The service                                                         */
/* ------------------------------------------------------------------ */

const listQuery = (params: Record<string, string | number | undefined>): string => {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
        if (value === undefined || value === "" || value === null) continue;
        search.set(key, String(value));
    }
    const text = search.toString();
    return text ? `?${text}` : "";
};

/** The route is not there yet (404), or is there and not answering (5xx) — either way the calendar still draws. */
const isMissing = (caught: unknown) => caught instanceof ApiError && (caught.status === 404 || caught.status >= 500);

export const publisherWorkspace = {
    /* The publisher */
    profile: () => api.get<PublisherProfile>("/publishers/me"),
    updateProfile: (patch: PublisherPatch) => api.patch<PublisherProfile>("/publishers/me", patch),
    dashboard: () => api.get<PublisherDashboard>("/publishers/me/dashboard"),
    kyc: () => api.get<PublisherKyc | null>("/publishers/me/kyc"),
    submitKyc: (documents: KycSubmission) => api.post<PublisherKyc>("/publishers/me/kyc", documents),

    /* Inventory */
    listings: (query: { q?: string; shelf?: string; sort?: string; page?: number; pageSize?: number } = {}) =>
        api.get<MyListingsPage>(`/publishers/me/listings${listQuery({ ...query, pageSize: query.pageSize ?? 100 })}`),

    /* Bookings */
    bookings: (query: { status?: string; q?: string; sort?: string; page?: number; pageSize?: number } = {}) =>
        api.get<BookingsPage>(`/orders/my${listQuery({ as: "publisher", pageSize: 100, ...query })}`),
    booking: (id: string) => api.get<BookingDetail>(`/orders/${id}`),
    evidence: (id: string) => api.get<Evidence>(`/orders/${id}/evidence`),
    insights: (id: string) => api.get<SpotInsights>(`/publishers/me/bookings/${id}/insights`),
    reportPdf: (id: string) => apiBlob(`/publishers/me/bookings/${id}/report.pdf`),
    accept: (id: string) => api.post<Booking>(`/orders/${id}/accept-publisher`, {}),
    reject: (id: string, reason: string) => api.post<Booking>(`/orders/${id}/reject-publisher`, { reason }),
    chooseFulfilment: (id: string, installBy: InstallBy) => api.post<Booking>(`/orders/${id}/choose-fulfilment`, { installBy }),
    confirmSlot: (id: string) => api.post<Booking>(`/orders/${id}/confirm-slot`, {}),
    counterSlot: (id: string, counterNote?: string) => api.post<Booking>(`/orders/${id}/counter-slot`, counterNote ? { counterNote } : {}),
    selfCollectPrints: (id: string, photoUrl: string) => api.post<Booking>(`/orders/${id}/self-install/collect-prints`, { photoUrl }),
    selfCaptureCondition: (id: string, photoUrls: string[]) => api.post<Booking>(`/orders/${id}/self-install/capture-condition`, { photoUrls }),
    selfCheckIn: (id: string, position?: { latitude: number; longitude: number }) => api.post<Booking>(`/orders/${id}/self-install/checkin`, position ?? {}),
    selfCaptureInstallation: (id: string, photoUrl: string) => api.post<Booking>(`/orders/${id}/self-install/capture-installation`, { photoUrl }),

    /* Money */
    wallet: () => api.get<WalletSnapshot>("/payouts/wallet"),
    earnings: () => api.get<Earnings>("/payouts/wallet/earnings"),
    entries: (limit = 20) => api.get<WalletEntry[]>(`/payouts/wallet/entries?limit=${limit}`),
    statements: () => api.get<Statement[]>("/payouts/wallet/statements"),
    statementPdf: (id: string) => apiBlob(`/payouts/wallet/statements/${id}/pdf`),
    withdrawals: () => api.get<Withdrawal[]>("/payouts/withdrawals"),
    requestWithdrawal: (amount: Money, payoutMethodId: string) => api.post<Withdrawal>("/payouts/withdrawals", { amount, payoutMethodId }),
    cancelWithdrawal: (id: string) => api.post<Withdrawal>(`/payouts/withdrawals/${id}/cancel`, {}),
    methods: () => api.get<PayoutMethod[]>("/payouts/methods"),
    addMethod: (input: NewMethodInput) => api.post<PayoutMethod>("/payouts/methods", input),
    removeMethod: (id: string) => api.delete<{ removed: boolean }>(`/payouts/methods/${id}`),
    setDefaultMethod: (id: string) => api.post<PayoutMethod>(`/payouts/methods/${id}/set-default`, {}),
    ifsc: (code: string) => api.get<IfscLookup>(`/payouts/ifsc/${encodeURIComponent(code.trim().toUpperCase())}`),

    /* Availability — the contract being built; a 404 falls back to listings + bookings. */
    availability: async (from: string, to: string): Promise<AvailabilityWindow> => {
        try {
            const window = await api.get<Omit<AvailabilityWindow, "blocksAvailable">>(`/publishers/me/availability?from=${from}&to=${to}`);
            return { ...window, blocksAvailable: true };
        } catch (caught) {
            if (!isMissing(caught)) throw caught;
            const [listings, bookings] = await Promise.all([publisherWorkspace.listings({ pageSize: 100 }), publisherWorkspace.bookings({ pageSize: 100 })]);
            return { ...availabilityFallback(from, to, listings.items, bookings.items), blocksAvailable: false };
        }
    },
    blockedDates: (listingId: string) => api.get<{ blocks: AvailabilityBlock[] }>(`/listings/${listingId}/blocked-dates`),
    addBlockedDate: (listingId: string, input: { from: string; to: string; reason?: string }) => api.post<AvailabilityBlock>(`/listings/${listingId}/blocked-dates`, input),
    removeBlockedDate: (listingId: string, blockId: string) => api.delete<void>(`/listings/${listingId}/blocked-dates/${blockId}`),

    /* Support */
    tickets: (status?: TicketStatus) => api.get<SupportTicket[]>(`/support/tickets${listQuery({ status })}`),
    ticket: (id: string) => api.get<SupportTicket>(`/support/tickets/${id}`),
    createTicket: (input: NewTicket) => api.post<SupportTicket>("/support/tickets", { kind: "ISSUE", ...input }),
    reply: (id: string, message: string) => api.post<TicketMessage>(`/support/tickets/${id}/reply`, { message }),

    /* Account */
    me: () => api.get<AccountMe>("/users/me"),
    updateMe: (patch: { name?: string; email?: string }) => api.patch<AccountMe>("/users/me", patch),
    sessions: () => api.get<DeviceSession[]>("/users/me/sessions"),
    revokeSession: (id: string) => api.delete<{ message: string }>(`/users/me/sessions/${id}`),
    revokeOtherSessions: () => api.delete<{ revoked: number }>("/users/me/sessions"),
    changePassword: (input: { currentPassword?: string; newPassword: string }) => api.post<unknown>("/auth/change-password", input),
    notificationPreferences: () => api.get<NotificationPreference[]>("/notifications/preferences"),
    saveNotificationPreferences: (rows: { type: NotificationType; channel: NotificationChannel; enabled: boolean }[]) => api.put<unknown>("/notifications/preferences", rows),

    /** `POST /upload` — multipart, the file under `file`, the purpose beside it. Answers `{ id, url }`. */
    upload: (file: File, purpose: "KYC" | "VERIFICATION" | "SUPPORT_ATTACHMENT" | "OTHER") => {
        const form = new FormData();
        form.append("file", file, file.name);
        form.append("purpose", purpose);
        return api.post<UploadedFile>("/upload", form);
    },
};

/* ------------------------------------------------------------------ */
/* Money helpers — decimal strings, Indian grouping, never a float     */
/* ------------------------------------------------------------------ */

type Parts = { negative: boolean; whole: string; paise: string };

function splitMoney(value: string | number | null | undefined): Parts | null {
    if (typeof value === "number") {
        if (!Number.isFinite(value)) return null;
        value = value.toFixed(2);
    }
    if (typeof value !== "string") return null;
    const match = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(value.trim());
    if (!match) return null;
    const whole = match[2]!.replace(/^0+(?=\d)/, "");
    const paise = `${match[3] ?? ""}00`.slice(0, 2);
    const zero = /^0+$/.test(whole) && paise === "00";
    return { negative: match[1] === "-" && !zero, whole, paise };
}

function groupIndian(whole: string): string {
    if (whole.length <= 3) return whole;
    const head = whole.slice(0, -3);
    const tail = whole.slice(-3);
    return `${head.replace(/\B(?=(\d{2})+(?!\d))/g, ",")},${tail}`;
}

/** "12500.00" → "₹12,500"; "12.50" → "₹12.50"; anything unreadable → "—". */
export function formatMoney(value: string | number | null | undefined, options: { paise?: "auto" | "always" | "never" } = {}): string {
    const parts = splitMoney(value);
    if (!parts) return "—";
    const mode = options.paise ?? "auto";
    const withPaise = mode === "always" || (mode === "auto" && parts.paise !== "00");
    return `${parts.negative ? "−" : ""}₹${groupIndian(parts.whole)}${withPaise ? `.${parts.paise}` : ""}`;
}

function toPaise(value: string | number | null | undefined): number | null {
    const parts = splitMoney(value);
    if (!parts) return null;
    const paise = Number(`${parts.whole}${parts.paise}`);
    if (!Number.isSafeInteger(paise)) return null;
    return parts.negative ? -paise : paise;
}

function fromPaise(paise: number): Money | null {
    if (!Number.isSafeInteger(paise)) return null;
    const digits = String(Math.abs(paise)).padStart(3, "0");
    return `${paise < 0 ? "-" : ""}${digits.slice(0, -2)}.${digits.slice(-2)}`;
}

/** Adds amounts; null if any of them is not an amount (a total that skipped a row would lie). */
export function sumMoney(values: (string | null | undefined)[]): Money | null {
    let total = 0;
    for (const value of values) {
        const paise = toPaise(value);
        if (paise === null) return null;
        total += paise;
    }
    return fromPaise(total);
}

/** A daily rate taken so many times. */
export function multiplyMoney(value: string | null | undefined, times: number): Money | null {
    const paise = toPaise(value);
    if (paise === null || !Number.isSafeInteger(times) || times < 0) return null;
    return fromPaise(paise * times);
}

export function compareMoney(a: string | null | undefined, b: string | null | undefined): number {
    const left = toPaise(a);
    const right = toPaise(b);
    if (left === null || right === null) return 0;
    return left < right ? -1 : left > right ? 1 : 0;
}

export const isPositiveMoney = (value: string | null | undefined): boolean => compareMoney(value, "0.00") > 0;

/** The typed amount as the API's `^\d+(\.\d{1,2})?$`, or null. */
export function toApiAmount(raw: string): Money | null {
    const cleaned = raw.replace(/[^\d.]/g, "");
    const [first = "", ...rest] = cleaned.split(".");
    const whole = first.replace(/^0+(?=\d)/, "").slice(0, 9);
    if (whole === "") return null;
    const fraction = rest.join("").slice(0, 2);
    return `${whole}.${`${fraction}00`.slice(0, 2)}`;
}

/* ------------------------------------------------------------------ */
/* Dates                                                               */
/* ------------------------------------------------------------------ */

const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function partsOf(iso: string | null | undefined): { day: number; month: number; year: number } | null {
    if (!iso) return null;
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
    if (match) return { year: Number(match[1]), month: Number(match[2]) - 1, day: Number(match[3]) };
    const at = new Date(iso);
    if (Number.isNaN(at.getTime())) return null;
    return { year: at.getFullYear(), month: at.getMonth(), day: at.getDate() };
}

/** "25 Oct 2026", or "25 October 2026" with `month: "long"`. */
export function longDate(iso: string | null | undefined, options: { month?: "short" | "long" } = {}): string {
    const parts = partsOf(iso);
    if (!parts) return "—";
    const months = options.month === "long" ? MONTHS_LONG : MONTHS_SHORT;
    return `${parts.day} ${months[parts.month]} ${parts.year}`;
}

/** "12–25 Oct 2026" · "28 Sep – 5 Oct 2026" · "28 Dec 2026 – 3 Jan 2027". */
export function dateRange(from: string | null | undefined, to: string | null | undefined, options: { month?: "short" | "long" } = {}): string {
    const a = partsOf(from);
    const b = partsOf(to);
    if (!a && !b) return "Dates to be agreed";
    if (!a) return `Until ${longDate(to, options)}`;
    if (!b) return `From ${longDate(from, options)}`;
    const months = options.month === "long" ? MONTHS_LONG : MONTHS_SHORT;
    if (a.year === b.year && a.month === b.month) {
        return a.day === b.day ? `${a.day} ${months[a.month]} ${a.year}` : `${a.day}–${b.day} ${months[a.month]} ${a.year}`;
    }
    if (a.year === b.year) return `${a.day} ${months[a.month]} – ${b.day} ${months[b.month]} ${a.year}`;
    return `${a.day} ${months[a.month]} ${a.year} – ${b.day} ${months[b.month]} ${b.year}`;
}

/** "Wed 15 Oct, 10:30 am". */
export function dateTime(iso: string | null | undefined): string {
    if (!iso) return "—";
    const at = new Date(iso);
    if (Number.isNaN(at.getTime())) return "—";
    return at.toLocaleString("en-IN", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
}

/** The day of a timestamp as YYYY-MM-DD, in local time. */
export function isoDay(value: Date | string): string {
    const at = typeof value === "string" ? new Date(value) : value;
    const y = at.getFullYear();
    const m = String(at.getMonth() + 1).padStart(2, "0");
    const d = String(at.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
}

/** Whole days from a date at UTC midnight. */
function dayNumber(iso: string | null | undefined): number | null {
    const parts = partsOf(iso);
    if (!parts) return null;
    return Math.floor(Date.UTC(parts.year, parts.month, parts.day) / 86_400_000);
}

/** Days in a run, both ends counted — the 5th to the 5th is one day. */
export function daysBetween(from: string | null | undefined, to: string | null | undefined): number | null {
    const a = dayNumber(from);
    const b = dayNumber(to);
    if (a === null || b === null || b < a) return null;
    return b - a + 1;
}

export function addDays(iso: string, days: number): string {
    const parts = partsOf(iso)!;
    const at = new Date(parts.year, parts.month, parts.day + days);
    return isoDay(at);
}

/** "3 months ago", "2 hours ago", "Active now". */
export function relativeTime(iso: string | null | undefined, now: Date = new Date()): string {
    if (!iso) return "—";
    const at = new Date(iso);
    if (Number.isNaN(at.getTime())) return "—";
    const minutes = Math.round((now.getTime() - at.getTime()) / 60_000);
    if (minutes < 5) return "Active now";
    if (minutes < 60) return `${minutes} minutes ago`;
    const hours = Math.round(minutes / 60);
    if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
    const days = Math.round(hours / 24);
    if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`;
    const months = Math.round(days / 30);
    return `${months} month${months === 1 ? "" : "s"} ago`;
}

/* ------------------------------------------------------------------ */
/* Bookings — the frames' words for the state machine                  */
/* ------------------------------------------------------------------ */

export type Tone = "success" | "warning" | "danger" | "info" | "neutral" | "ink";

/** A booking reference to quote. Orders carry no display id, so this is the tail of the id. */
export function bookingRef(booking: Pick<Booking, "id">): string {
    return `BKG-${booking.id.slice(-6).toUpperCase()}`;
}

const BOOKING_WORDS: Record<OrderStatus, { label: string; tone: Tone }> = {
    DRAFT: { label: "Draft", tone: "neutral" },
    PENDING_PUBLISHER: { label: "Needs response", tone: "ink" },
    PUBLISHER_REJECTED: { label: "Declined", tone: "neutral" },
    PENDING_PRINT: { label: "Artwork review", tone: "neutral" },
    SELF_INSTALL: { label: "Installation pending", tone: "warning" },
    PENDING_AGENT: { label: "Assigning installer", tone: "info" },
    AGENT_REJECTED: { label: "Assigning installer", tone: "info" },
    SLOT_PROPOSED: { label: "Slot proposed", tone: "warning" },
    SLOT_CONFIRMED: { label: "Installation scheduled", tone: "info" },
    IN_PROGRESS: { label: "Installation in progress", tone: "info" },
    PENDING_OTP: { label: "Your code is needed", tone: "warning" },
    PENDING_APPROVAL: { label: "Proof in review", tone: "info" },
    COMPLETED: { label: "Completed", tone: "success" },
    CANCELLED: { label: "Cancelled", tone: "neutral" },
};

/** The status as the frames print it: "Needs response", "Artwork review", "Completed"… A signed-off run still going is "Live". */
export function bookingStatus(booking: Pick<Booking, "status" | "endDate">, now: number = Date.now()): { label: string; tone: Tone } {
    if (booking.status === "COMPLETED") {
        const ends = booking.endDate ? new Date(booking.endDate).getTime() : NaN;
        const finished = Number.isFinite(ends) && ends <= now;
        return finished ? { label: "Completed", tone: "success" } : { label: "Live", tone: "success" };
    }
    return BOOKING_WORDS[booking.status] ?? { label: booking.status.replace(/_/g, " ").toLowerCase(), tone: "neutral" };
}

/** The Bookings page's chips, as status facets on `/orders/my`. */
export const UPCOMING_STATUSES: OrderStatus[] = ["PENDING_PUBLISHER", "PENDING_PRINT", "SELF_INSTALL", "PENDING_AGENT", "AGENT_REJECTED", "SLOT_PROPOSED", "SLOT_CONFIRMED", "IN_PROGRESS", "PENDING_OTP", "PENDING_APPROVAL"];
export const COMPLETED_STATUSES: OrderStatus[] = ["COMPLETED"];
export const CLOSED_STATUSES: OrderStatus[] = ["PUBLISHER_REJECTED", "CANCELLED"];

export const isUpcoming = (booking: Pick<Booking, "status">): boolean => UPCOMING_STATUSES.includes(booking.status);

/** Whether the publisher chose the self-install lane, or is on it. */
export const installsThemselves = (booking: Pick<Booking, "installBy" | "status">): boolean => booking.installBy === "PUBLISHER" || booking.status === "SELF_INSTALL";

/** "Respond by 11 October" — the publisher's 30-minute window, as a date the frame prints. */
export function respondBy(iso: string | null | undefined): string | null {
    if (!iso) return null;
    const at = new Date(iso);
    if (Number.isNaN(at.getTime())) return null;
    return at.toLocaleString("en-IN", { day: "numeric", month: "long", hour: "numeric", minute: "2-digit" });
}

/** The three-line Progress card on the accepted booking. */
export function bookingProgress(booking: Pick<Booking, "status" | "publisherAcceptedAt" | "printReadyAt" | "adminApprovedAt">, digital: boolean): { label: string; value: string }[] {
    const accepted = !!booking.publisherAcceptedAt || !["PENDING_PUBLISHER", "PUBLISHER_REJECTED", "DRAFT"].includes(booking.status);
    const artworkDone = !!booking.printReadyAt || ["PENDING_AGENT", "AGENT_REJECTED", "SLOT_PROPOSED", "SLOT_CONFIRMED", "IN_PROGRESS", "PENDING_OTP", "PENDING_APPROVAL", "COMPLETED"].includes(booking.status);
    const proofDone = booking.status === "COMPLETED" || !!booking.adminApprovedAt;
    const proofInReview = booking.status === "PENDING_APPROVAL" || booking.status === "PENDING_OTP";
    return [
        { label: "Booking accepted", value: accepted ? "Complete" : "Pending" },
        { label: "Artwork review", value: artworkDone ? "Complete" : "Pending" },
        { label: digital ? "Playback confirmation" : "Installation proof", value: proofDone ? "Complete" : proofInReview ? "In review" : "Pending" },
    ];
}

/* ------------------------------------------------------------------ */
/* Listings — format, size, status                                     */
/* ------------------------------------------------------------------ */

const CATEGORY_WORD: Record<string, string> = { OUTDOOR: "Outdoor", INDOOR: "Indoor", TRANSIT: "Transit", MEDIA: "Media" };

/** Whether the spot is a screen rather than a printed surface. */
export function isDigital(listing: Pick<BookingListing, "illumination" | "subType" | "placement">): boolean {
    if ((listing.illumination ?? "").toUpperCase() === "DIGITAL") return true;
    const words = `${listing.subType ?? ""} ${listing.placement ?? ""}`.toLowerCase();
    return /digital|led|screen|display|video wall/.test(words);
}

/** "Digital indoor" · "Outdoor" · "Transit" — the Format column. */
export function listingFormat(listing: Pick<BookingListing, "category" | "illumination" | "subType" | "placement">): string {
    const word = CATEGORY_WORD[(listing.category ?? "").toUpperCase()] ?? "Space";
    return isDigital(listing) ? `Digital ${word.toLowerCase()}` : word;
}

function trimFt(value: string): string {
    return value.includes(".") ? value.replace(/\.?0+$/, "") : value;
}

/** "40 × 20 ft", or the sub-type when no size is recorded. */
export function listingSize(listing: Pick<BookingListing, "widthFt" | "heightFt" | "subType" | "placement">): string | null {
    if (listing.widthFt && listing.heightFt) return `${trimFt(listing.widthFt)} × ${trimFt(listing.heightFt)} ft`;
    return listing.subType ?? listing.placement ?? null;
}

/** "Bengaluru · Outdoor · 40 × 20 ft" — the line under a space's name. */
export function listingLine(listing: Pick<BookingListing, "city" | "category" | "widthFt" | "heightFt" | "subType" | "placement" | "illumination">, options: { format?: boolean } = {}): string {
    return [listing.city, options.format ? listingFormat(listing) : null, listingSize(listing)].filter(Boolean).join(" · ");
}

export type ListingShelf = "PUBLISHED" | "IN_REVIEW" | "OTHER";

const IN_REVIEW = new Set(["PENDING_REVIEW", "AWAITING_SITE_VERIFICATION", "PENDING_PRICE_APPROVAL", "AWAITING_APPROVAL", "UNDER_REVIEW", "SUBMITTED"]);

export function listingShelf(status: string): ListingShelf {
    if (status === "ACTIVE") return "PUBLISHED";
    if (IN_REVIEW.has(status)) return "IN_REVIEW";
    return "OTHER";
}

/** "Published" in green, "In review" in grey, and the rest by their name. */
export function listingStatus(status: string): { label: string; tone: Tone } {
    if (status === "ACTIVE") return { label: "Published", tone: "success" };
    if (IN_REVIEW.has(status)) return { label: "In review", tone: "neutral" };
    if (status === "DRAFT") return { label: "Draft", tone: "neutral" };
    if (status === "REJECTED") return { label: "Not approved", tone: "danger" };
    if (status === "SUSPENDED") return { label: "Suspended", tone: "danger" };
    if (status === "INACTIVE" || status === "ARCHIVED" || status === "PAUSED") return { label: "Unpublished", tone: "neutral" };
    return { label: status.charAt(0) + status.slice(1).toLowerCase().replace(/_/g, " "), tone: "neutral" };
}

/** The frame's "Rate / 14 days" column. */
export const rateForDays = (ratePerDay: Money | null | undefined, days: number): Money | null => multiplyMoney(ratePerDay, days);

/* ------------------------------------------------------------------ */
/* Earnings — what one booking is worth                                */
/* ------------------------------------------------------------------ */

export interface BookingEarning {
    /** ACCRUED: real days from the ledger; EXPECTED: rate × run; UNKNOWN: nothing to say. */
    source: "ACCRUED" | "EXPECTED" | "UNKNOWN";
    gross: Money | null;
    commission: Money | null;
    taxWithheld: Money | null;
    net: Money | null;
    days: number;
    clearedDays: number;
}

/** The accrual days that belong to this booking: its listing, inside its run. */
export function daysForBooking(booking: Pick<Booking, "listingId" | "startDate" | "endDate">, days: EarningsDay[]): EarningsDay[] {
    const from = dayNumber(booking.startDate);
    const to = dayNumber(booking.endDate);
    if (from === null || to === null) return [];
    return days.filter((day) => {
        if (day.listing.id !== booking.listingId) return false;
        const on = dayNumber(day.forDate);
        return on !== null && on >= from && on <= to;
    });
}

export function bookingEarning(booking: Pick<Booking, "listingId" | "startDate" | "endDate" | "listing" | "status">, earnings: Earnings | null): BookingEarning {
    const mine = daysForBooking(booking, earnings?.days ?? []);
    if (mine.length > 0) {
        return {
            source: "ACCRUED",
            gross: sumMoney(mine.map((d) => d.gross)),
            commission: sumMoney(mine.map((d) => d.commission)),
            taxWithheld: sumMoney(mine.map((d) => d.taxWithheld)),
            net: sumMoney(mine.map((d) => d.net)),
            days: mine.length,
            clearedDays: mine.filter((d) => d.cleared).length,
        };
    }
    const days = daysBetween(booking.startDate, booking.endDate) ?? 0;
    const expected = days > 0 && booking.listing?.ratePerDay ? multiplyMoney(booking.listing.ratePerDay, days) : null;
    if (expected === null) return { source: "UNKNOWN", gross: null, commission: null, taxWithheld: null, net: null, days, clearedDays: 0 };
    return { source: "EXPECTED", gross: expected, commission: null, taxWithheld: null, net: null, days, clearedDays: 0 };
}

/** The one figure a row prints: the net once earned, the expected gross before. */
export function earningHeadline(earning: BookingEarning): Money | null {
    return earning.source === "ACCRUED" ? earning.net : earning.source === "EXPECTED" ? earning.gross : null;
}

/** "Deductions" on the completed booking: ADX's share plus tax withheld. */
export function deductions(earning: BookingEarning): Money | null {
    if (earning.source !== "ACCRUED") return null;
    return sumMoney([earning.commission, earning.taxWithheld]);
}

/* ------------------------------------------------------------------ */
/* Payouts                                                             */
/* ------------------------------------------------------------------ */

export function withdrawalStatus(status: WithdrawalStatus): { label: string; tone: Tone; shelf: "PENDING" | "PAID" | "CLOSED" } {
    switch (status) {
        case "PAID":
            return { label: "Paid", tone: "success", shelf: "PAID" };
        case "REJECTED":
            return { label: "Rejected", tone: "danger", shelf: "CLOSED" };
        case "FAILED":
            return { label: "Failed", tone: "danger", shelf: "CLOSED" };
        case "CANCELLED":
            return { label: "Cancelled", tone: "neutral", shelf: "CLOSED" };
        case "PROCESSING":
            return { label: "Processing", tone: "info", shelf: "PENDING" };
        case "APPROVED":
            return { label: "Approved", tone: "info", shelf: "PENDING" };
        default:
            return { label: "Pending", tone: "neutral", shelf: "PENDING" };
    }
}

/** "HDFC Bank · •••• 4821" or the UPI id. */
export function methodLine(method: Pick<PayoutMethod, "type" | "bankName" | "accountNumberMasked" | "upiVpa"> | null | undefined): string {
    if (!method) return "No payout account yet";
    if (method.type === "UPI") return method.upiVpa ?? "UPI";
    const tail = (method.accountNumberMasked ?? "").replace(/[^0-9]/g, "").slice(-4);
    return [method.bankName ?? "Bank account", tail ? `•••• ${tail}` : null].filter(Boolean).join(" · ");
}

export function methodStatus(status: PayoutMethodStatus): { label: string; tone: Tone } {
    if (status === "VERIFIED") return { label: "Verified", tone: "success" };
    if (status === "REJECTED") return { label: "Rejected", tone: "danger" };
    return { label: "Pending verification", tone: "warning" };
}

/** Eleven characters: four letters, a zero, six letters or digits. */
export const isValidIfsc = (code: string): boolean => /^[A-Z]{4}0[A-Z0-9]{6}$/.test(code.trim().toUpperCase());

/** The latest day a pending earning clears — the Overview's "After campaign completion · 25 Oct 2026". */
export function pendingClearsBy(earnings: Earnings | null): string | null {
    const pending = (earnings?.days ?? []).filter((day) => !day.cleared);
    if (pending.length === 0) return null;
    return pending.reduce((latest, day) => (day.clearsAt > latest ? day.clearsAt : latest), pending[0]!.clearsAt);
}

/* ------------------------------------------------------------------ */
/* Availability — the grid's arithmetic                                */
/* ------------------------------------------------------------------ */

export type CalendarView = "week" | "2weeks" | "month";

/** The window a view draws around an anchor day; weeks start on Monday. */
export function calendarWindow(anchor: string, view: CalendarView): { from: string; to: string; days: string[] } {
    const parts = partsOf(anchor)!;
    let from: Date;
    let to: Date;
    if (view === "month") {
        from = new Date(parts.year, parts.month, 1);
        to = new Date(parts.year, parts.month + 1, 0);
    } else {
        const at = new Date(parts.year, parts.month, parts.day);
        const offset = (at.getDay() + 6) % 7;
        from = new Date(parts.year, parts.month, parts.day - offset);
        to = new Date(from.getFullYear(), from.getMonth(), from.getDate() + (view === "week" ? 6 : 13));
    }
    const days: string[] = [];
    for (let d = new Date(from); d <= to; d.setDate(d.getDate() + 1)) days.push(isoDay(d));
    return { from: isoDay(from), to: isoDay(to), days };
}

/** The anchor one window earlier or later. */
export function shiftAnchor(anchor: string, view: CalendarView, direction: -1 | 1): string {
    const parts = partsOf(anchor)!;
    if (view === "month") return isoDay(new Date(parts.year, parts.month + direction, 1));
    return addDays(anchor, direction * (view === "week" ? 7 : 14));
}

/** "12 Oct to 25 Oct" · "28 Sep to 11 Oct" · "October 2026". */
export function windowLabel(from: string, to: string, view: CalendarView): string {
    const a = partsOf(from)!;
    const b = partsOf(to)!;
    if (view === "month") return `${MONTHS_LONG[a.month]} ${a.year}`;
    return `${a.day} ${MONTHS_SHORT[a.month]} to ${b.day} ${MONTHS_SHORT[b.month]}`;
}

/** Where a range sits on the day axis: its first and last column, or null when it misses the window. */
export function spanOf(range: { from: string; to: string }, days: string[]): { start: number; end: number } | null {
    const first = days[0];
    const last = days[days.length - 1];
    if (!first || !last) return null;
    const from = range.from.slice(0, 10);
    const to = range.to.slice(0, 10);
    if (to < first || from > last) return null;
    const start = Math.max(0, days.indexOf(from) === -1 ? 0 : days.indexOf(from));
    const end = days.indexOf(to) === -1 ? days.length - 1 : days.indexOf(to);
    return { start, end };
}

/** Whether two closed date ranges overlap. */
export const rangesOverlap = (a: { from: string; to: string }, b: { from: string; to: string }): boolean => a.from.slice(0, 10) <= b.to.slice(0, 10) && b.from.slice(0, 10) <= a.to.slice(0, 10);

const HOLD_STATUSES = new Set<OrderStatus>(["PENDING_PUBLISHER", "DRAFT"]);
const GONE_STATUSES = new Set<OrderStatus>(["PUBLISHER_REJECTED", "CANCELLED"]);

/** The window drawn from the listings and bookings alone, until the availability contract lands. */
export function availabilityFallback(from: string, to: string, listings: MyListing[], bookings: Booking[]): Omit<AvailabilityWindow, "blocksAvailable"> {
    const byListing = new Map<string, AvailabilityBooking[]>();
    for (const booking of bookings) {
        if (!booking.startDate || !booking.endDate || GONE_STATUSES.has(booking.status)) continue;
        const range = { from: booking.startDate.slice(0, 10), to: booking.endDate.slice(0, 10) };
        if (!rangesOverlap(range, { from, to })) continue;
        const rows = byListing.get(booking.listingId) ?? [];
        rows.push({ orderId: booking.id, campaignName: booking.campaignName, advertiserName: null, from: range.from, to: range.to, kind: HOLD_STATUSES.has(booking.status) ? "HOLD" : "BOOKED", status: booking.status });
        byListing.set(booking.listingId, rows);
    }
    return {
        from,
        to,
        listings: listings.map((listing) => ({
            id: listing.id,
            displayId: listing.displayId,
            title: listing.title,
            category: listing.category,
            city: listing.city,
            slotsTotal: 1,
            status: listing.status,
            bookings: byListing.get(listing.id) ?? [],
            blocks: [],
        })),
    };
}

/* ------------------------------------------------------------------ */
/* Account                                                             */
/* ------------------------------------------------------------------ */

/** "+91 98••• ••210" — the number as the profile frame masks it. */
export function maskedPhone(mobile: string | null | undefined): string {
    if (!mobile) return "—";
    const digits = mobile.replace(/\D/g, "");
    const local = digits.length > 10 ? digits.slice(-10) : digits;
    const code = digits.length > 10 ? `+${digits.slice(0, digits.length - 10)} ` : "";
    if (local.length < 6) return `${code}${local}`;
    return `${code}${local.slice(0, 2)}••• ••${local.slice(-3)}`;
}

/** "MacBook Pro" is not on a user agent; "Chrome on Windows" is what can honestly be read off it. */
export function describeSession(userAgent: string | null): { name: string; platform: string | null; kind: "desktop" | "phone" } {
    const ua = (userAgent ?? "").trim();
    if (!ua) return { name: "Unknown device", platform: null, kind: "desktop" };
    const lower = ua.toLowerCase();
    let platform: string | null = null;
    let kind: "desktop" | "phone" = "desktop";
    if (lower.includes("android")) {
        platform = "Android";
        kind = "phone";
    } else if (lower.includes("iphone") || lower.includes("ipad")) {
        platform = "iPhone";
        kind = "phone";
    } else if (lower.includes("windows")) platform = "Windows";
    else if (lower.includes("mac os") || lower.includes("macintosh")) platform = "macOS";
    else if (lower.includes("linux")) platform = "Linux";
    let name = "Browser";
    if (lower.includes("adx") || lower.includes("okhttp") || lower.includes("react-native")) {
        name = "ADX app";
        kind = "phone";
    } else if (lower.includes("edg/")) name = "Edge";
    else if (lower.includes("chrome")) name = "Chrome";
    else if (lower.includes("firefox")) name = "Firefox";
    else if (lower.includes("safari")) name = "Safari";
    else if (lower.includes("curl")) name = "Command line";
    return { name, platform, kind };
}

/** The four switches on the Business profile, each a notification type on the EMAIL channel. */
export const NOTIFICATION_SWITCHES: { key: string; type: NotificationType | null; label: string; hint: string }[] = [
    { key: "booking", type: "BOOKING", label: "Booking requests", hint: "Email me when an advertiser requests my space" },
    { key: "artwork", type: "ORDER", label: "Artwork and proof updates", hint: "Send updates when artwork or installation proof needs attention" },
    { key: "payout", type: "PAYOUT", label: "Payout updates", hint: "Notify me when money reaches my bank account" },
    { key: "weekly", type: null, label: "Weekly business summary", hint: "Sent every Monday at 9:00 AM IST" },
];

/** The KYC status as the profile prints it. */
export function kycLabel(status: string | null | undefined): { label: string; tone: Tone } {
    switch (status) {
        case "VERIFIED":
            return { label: "Verified", tone: "success" };
        case "REJECTED":
            return { label: "Not approved", tone: "danger" };
        case "NEEDS_INFO":
            return { label: "More information needed", tone: "warning" };
        case "PENDING":
            return { label: "In review", tone: "warning" };
        default:
            return { label: "Not started", tone: "neutral" };
    }
}

/** The ticket category the Report an issue tabs send. */
export const ISSUE_TABS: { value: "BOOKING" | "LISTING" | "PAYOUT"; label: string; category: IssueCategory }[] = [
    { value: "BOOKING", label: "Booking", category: "ORDER" },
    { value: "LISTING", label: "Listing", category: "LISTING" },
    { value: "PAYOUT", label: "Payout", category: "PAYMENT" },
];

export function ticketStatus(status: TicketStatus): { label: string; tone: Tone } {
    if (status === "CLOSED") return { label: "Resolved", tone: "success" };
    if (status === "WAITING") return { label: "Waiting on you", tone: "warning" };
    return { label: "Open", tone: "info" };
}

/** Opens a PDF the backend served with the session's bearer, in a new tab. */
export function openBlob(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.target = "_blank";
    link.rel = "noopener";
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
