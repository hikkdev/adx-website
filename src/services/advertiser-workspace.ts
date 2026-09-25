import { api, apiBlob, ApiError } from "@/lib/api-client";
import type { TwoFactorStatus } from "@/services/auth";
import type { ReservationFeeOffer, ReservationView } from "@/services/reservation";

/**
 * The advertiser workspace (DR 12 board 07) — everything the seven pages
 * read and write: the campaign book, one campaign, delivery proofs (orders
 * and their evidence), invoices and payments, support requests, the person's
 * own account. Types mirror the backend payloads as the ADX app types them
 * (`mobile/user-app/src/features/advertiser/**`, `mobile/shared/features/**`);
 * the helpers below are pure and tested beside this file.
 */

/* ------------------------------------------------------------------ */
/* Campaigns                                                           */
/* ------------------------------------------------------------------ */

export type CampaignStatus = "DRAFT" | "PENDING_PAYMENT" | "SCHEDULED" | "LIVE" | "PAUSED" | "COMPLETED" | "CANCELLED";

export interface CampaignRow {
    id: string;
    reference: string;
    name: string;
    status: CampaignStatus;
    goal: string | null;
    brandName: string | null;
    city: string | null;
    budget: string | null;
    total: string | null;
    startDate: string | null;
    endDate: string | null;
    spotCount: number;
    spendToDate?: string | null;
    createdAt: string;
    updatedAt: string;
}

export interface CampaignListPage {
    items: CampaignRow[];
    total: number;
    page: number;
    pageSize: number;
    counts: Record<string, number>;
}

export type CreativeStatus = "PENDING_UPLOAD" | "UPLOADED" | "IN_REVIEW" | "APPROVED" | "REJECTED" | "CHANGES_REQUESTED" | "AWAITING_ADVERTISER";
export type SpotStatus = "RESERVED" | "BOOKED" | "LIVE" | "COMPLETED" | "CANCELLED";

export interface CampaignSpot {
    id: string;
    listingId: string;
    status: SpotStatus;
    ratePerDay: string;
    days: number;
    quantity: number;
    lineTotal: string;
    orderId: string | null;
    reviewed?: boolean;
    listing: {
        id: string;
        title: string;
        city: string | null;
        address: string;
        category?: string | null;
        widthFt: string | null;
        heightFt: string | null;
        estimatedDailyFootfall: number | null;
        mediaType: { id: string; name: string; category: string } | null;
        photos: { url: string }[];
    };
}

export interface CampaignCreative {
    id: string;
    spotId: string | null;
    path: string;
    status: CreativeStatus;
    fileUrl: string | null;
    fileName: string | null;
    reviewNote?: string | null;
    reviewedAt?: string | null;
    submittedAt?: string | null;
    designedByAdx?: boolean;
    resubmissionOfId?: string | null;
}

export interface TrackingCode {
    id: string;
    spotId: string | null;
    code: string;
    url: string;
    printedUrl?: string | null;
    shortUrl?: string | null;
    engine?: "GENQR" | "LOCAL";
    method: string;
    destination: string | null;
    promoCode: string | null;
    scans: number;
    clicks: number;
    redemptions: number;
}

export interface CampaignRefund {
    id: string;
    amount: string;
    status: "PENDING" | "RELEASED" | "REJECTED";
    reason?: string;
    releasedAt?: string | null;
}

export interface CampaignDetail {
    id: string;
    reference: string;
    advertiserId: string;
    name: string;
    status: CampaignStatus;
    step: number;
    brandName: string | null;
    productName: string | null;
    goal: string | null;
    targetLocation: string | null;
    city?: string | null;
    spotCount?: number;
    budget: string | null;
    startDate: string | null;
    endDate: string | null;
    creativePath: string | null;
    creativeConfig: Record<string, unknown> | null;
    trackingMethod: string;
    fulfilment: string | null;
    spotsSubtotal: string | null;
    feesTotal: string | null;
    discount: string | null;
    gstAmount: string | null;
    total: string | null;
    paidAt: string | null;
    launchedAt: string | null;
    submittedForPaymentAt?: string | null;
    launchBlockedBy?: string[];
    spots: CampaignSpot[];
    creatives: CampaignCreative[];
    codes: TrackingCode[];
    refund?: CampaignRefund | null;
    landingPage?: { id: string; slug: string; status: string; url: string; publishedAt: string | null } | null;
    /** RF-1: the reservation as it stands, or null when none was ever taken. */
    reservation?: ReservationView | null;
    /** DQ-1: the desk's design quote on an ADX-design campaign. */
    designQuoteAmount?: string | null;
    designQuoteStatus?: DesignQuoteStatus | null;
    designQuoteNote?: string | null;
    designQuotedAt?: string | null;
    designQuoteRespondedAt?: string | null;
    createdAt: string;
    updatedAt: string;
}

export type DesignQuoteStatus = "QUOTED" | "ACCEPTED" | "DECLINED";

export interface Metric {
    value: number | null;
    provenance: "MEASURED" | "REPORTED" | "ESTIMATED" | "UNAVAILABLE";
    basis: string;
}

export interface CampaignAnalytics {
    campaignId: string;
    daysElapsed: number;
    daysTotal: number;
    spend: { toDate: string; committed: string; budget: string | null; onTrack: boolean | null };
    spotsLive: number;
    spotsBooked: number;
    reach: Metric;
    scans: Metric;
    clicks: Metric;
    clickRate: Metric;
    redemptions: Metric;
    series: { day: string; spend: string; spotsLive: number; scans: number; clicks: number; estimatedReach: number | null }[];
}

/** One line of `GET /campaigns/:id/review` — the receipt's own arithmetic. */
export interface ReviewLine {
    spotId: string;
    listingId: string;
    title: string;
    city: string | null;
    ratePerDay: string;
    days: number;
    quantity: number;
    lineTotal: string;
    fees: { label: string; amount: string }[];
    gst: string;
    gross: string;
    /** PS-1: the print choice this line was priced under; null means the campaign's. */
    fulfilment?: "ADX_PRINTS" | "ADVERTISER_SHIPS" | null;
}

export interface CampaignReview {
    campaignId: string;
    lines: ReviewLine[];
    spotsSubtotal: string;
    feesTotal: string;
    gstAmount: string;
    discount: string;
    /** GST-D: the tax the discount took off with it; `gstAmount` is already net of it. */
    discountGst?: string;
    /** DQ-1: ADX's accepted design quote as a fee on the booking. */
    designFee?: { amount: string; gst: string; note: string | null } | null;
    /** RF-1: what reserving would cost on this checkout. */
    reservationFee?: ReservationFeeOffer | null;
    total: string;
    days: number;
}

/* ------------------------------------------------------------------ */
/* Orders — the delivery proofs                                        */
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

export interface OrderListing {
    id: string;
    title: string;
    category: string;
    city: string | null;
    address: string;
    subType?: string | null;
    widthFt?: string | null;
    heightFt?: string | null;
    photos?: { url: string }[];
    publisher?: { id: string; name: string; displayId?: string | null } | null;
}

export interface AdvertiserOrder {
    id: string;
    /** BK-1: BKG-DDMM-YYNN; null on rows from before the ids. */
    displayId?: string | null;
    status: OrderStatus;
    campaignName: string | null;
    startDate: string | null;
    endDate: string | null;
    listingId: string;
    listing: OrderListing;
    notes: string | null;
    publisherAcceptedAt: string | null;
    slotTime: string | null;
    slotConfirmedAt: string | null;
    adminApprovedAt: string | null;
    cancelledAt: string | null;
    selfInstallInstallPhotoUrl?: string | null;
    selfInstallConditionPhotoUrls?: string[];
    /** SI-N: what the publisher wrote beside their own installation photos. */
    selfInstallNotes?: string | null;
    verification?: { verifiedAt: string | null; checklistPassed?: boolean; qrScanned?: boolean } | null;
    campaignSpot?: { campaignId: string } | null;
    createdAt: string;
    updatedAt: string;
}

export interface OrderPage {
    items: AdvertiserOrder[];
    total: number;
    page: number;
    pageSize: number;
    counts: Record<string, number>;
}

export interface OrderPhoto {
    id: string;
    orderId: string;
    kind: "PICKUP" | "CONDITION" | "INSTALLATION" | string;
    label: string | null;
    url: string;
    latitude: number | null;
    longitude: number | null;
    capturedAt: string;
}

export interface OrderEvidence {
    photos: OrderPhoto[];
    counts: Record<string, number>;
    requirements: { key: string; label: string; step: number; met: boolean }[];
    met: number;
    total: number;
    canSubmit: boolean;
}

/* ------------------------------------------------------------------ */
/* Money                                                               */
/* ------------------------------------------------------------------ */

export type InvoiceKind = "TAX_INVOICE" | "PROFORMA" | "CREDIT_NOTE";
export type InvoiceStatus = "DRAFT" | "ISSUED" | "PAID" | "VOID";

export interface Invoice {
    id: string;
    number: string;
    kind: InvoiceKind;
    status: InvoiceStatus;
    advertiserId: string;
    campaignId: string | null;
    packageSaleId: string | null;
    paymentId: string | null;
    topUpId: string | null;
    voidsInvoiceId: string | null;
    issuedAt: string | null;
    dueAt: string | null;
    supplierName: string | null;
    supplierGstin: string | null;
    recipientName: string;
    recipientGstin: string | null;
    recipientAddress: string | null;
    placeOfSupply: string | null;
    taxableValue: string;
    cgst: string;
    sgst: string;
    igst: string;
    roundOff: string;
    total: string;
    gstTotal: string;
    currency: string;
    pdfFileId: string | null;
    createdAt: string;
}

/** WG-1: one line of the document, as `GET /advertisers/:id/invoices/:invoiceId` prints it — money padded, `gstPct` a fraction ("0.18"). */
export interface InvoiceDetailLine {
    id: string;
    kind: "MEDIA" | "PRINTING" | "INSTALLATION" | "SERVICE_FEE" | "DISCOUNT" | string;
    description: string;
    sacCode: string | null;
    quantity: string;
    unitRate: string;
    taxableValue: string;
    gstPct: string;
    gstAmount: string;
    campaignSpotId: string | null;
    sortOrder: number;
}

export type InvoiceDetail = Invoice & { lines: InvoiceDetailLine[] };

export interface PaymentRow {
    id: string;
    reference: string;
    status: string;
    gateway: string;
    amount: string;
    refundable?: string;
    campaignId?: string | null;
    packageSaleId?: string | null;
    method?: string | null;
    capturedAt?: string | null;
    createdAt: string;
}

export interface PaymentPage {
    items: PaymentRow[];
    total: number;
    counts?: Record<string, number>;
}

export interface WalletSnapshot {
    balance: string;
    goodwill: string;
    held: string;
    spendable: string;
    currency: string;
}

export interface RefundRequest {
    id: string;
    amount: string;
    reason: string;
    note: string;
    status: "PENDING" | "APPROVED" | "REJECTED" | "WITHDRAWN" | "PAID" | "FAILED";
    destination: string;
    paidAt: string | null;
    decidedAt: string | null;
    createdAt: string;
}

/* ------------------------------------------------------------------ */
/* Support                                                             */
/* ------------------------------------------------------------------ */

export type TicketStatus = "OPEN" | "WAITING" | "CLOSED";

export interface TicketMessage {
    id: string;
    ticketId: string;
    authorId: string;
    authorName: string;
    message: string;
    createdAt: string;
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
    /** WG-1: the campaign the request is about, as the desk stores it; absent on a row from before the column. */
    relatedCampaignId?: string | null;
    attachmentUrls: string[];
    tags?: string[];
    createdAt: string;
    updatedAt: string;
    messages?: TicketMessage[];
    channel?: "TICKET" | "LIVE_CHAT";
}

export type TicketThread = SupportTicket & { messages: TicketMessage[] };

export interface NewTicket {
    kind?: "ISSUE" | "FEEDBACK";
    title?: string;
    description: string;
    category: string;
    relatedOrderId?: string;
    relatedCampaignId?: string;
    attachmentUrls?: string[];
    tags?: string[];
}

/* ------------------------------------------------------------------ */
/* Account                                                             */
/* ------------------------------------------------------------------ */

export interface UserProfile {
    id: string;
    displayId?: string | null;
    mobile: string;
    name: string | null;
    firstName?: string | null;
    lastName?: string | null;
    email: string | null;
    mobileVerifiedAt?: string | null;
    emailVerifiedAt?: string | null;
    avatarUrl: string | null;
    hasPassword: boolean;
    language: string;
    roles: string[];
    createdAt?: string;
    lastLoginAt?: string | null;
    advertiserProfile: { id: string; displayId?: string | null; name?: string } | null;
    twoFactorRequiredAt?: string | null;
}

export interface AdvertiserProfile {
    id: string;
    displayId: string | null;
    name: string;
    mobile: string;
    email: string | null;
    type: "INDIVIDUAL" | "COMMERCIAL" | "NGO" | "AGENCY" | string;
    companyName: string | null;
    gstin: string | null;
    billingAddress: string | null;
    city: string | null;
    state: string | null;
    /** AD-1: the PIN and the country on the billing address. */
    postalCode?: string | null;
    country?: string | null;
    industry?: string | null;
    kycStatus: "PENDING" | "VERIFIED" | "REJECTED" | "NEEDS_INFO" | string;
    verified?: boolean;
    activatedAt: string | null;
}

export interface AdvertiserProfilePatch {
    name?: string;
    email?: string;
    companyName?: string;
    gstin?: string;
    billingAddress?: string;
    city?: string;
    state?: string;
    postalCode?: string | null;
    country?: string | null;
    industry?: string | null;
}

export interface EmailCodeSent {
    email: string;
    resendAfterSeconds: number;
    sendsRemaining: number;
    expiresInSeconds: number;
    devOtp?: string;
}

export interface UserContact {
    id: string;
    kind: "EMAIL" | "PHONE";
    value: string;
    label: string | null;
    verifiedAt: string | null;
    createdAt: string;
}

export interface ContactsView {
    primary: { mobile: string; mobileVerifiedAt: string | null; email: string | null; emailVerified: boolean };
    contacts: UserContact[];
}

export interface ContactCodeSent {
    kind: "EMAIL" | "PHONE";
    expiresInSeconds: number;
    resendAfterSeconds: number;
    sendsRemaining: number;
    devOtp?: string;
}

export interface DeviceSession {
    id: string;
    userAgent: string | null;
    ipAddress: string | null;
    /** SL-1: where the address was last seen — null until looked up, or when the address is private. */
    city?: string | null;
    region?: string | null;
    country?: string | null;
    lastUsedAt: string | null;
    createdAt: string;
    expiresAt: string;
    current?: boolean;
}

/** WS-1: WEEKLY_SUMMARY is the Monday digest of the account's campaigns. */
export type NotificationType = "ORDER" | "BOOKING" | "PAYOUT" | "KYC" | "MESSAGE" | "SYSTEM" | "DISPUTE" | "ANNOUNCEMENT" | "WEEKLY_SUMMARY";
export type NotificationChannel = "IN_APP" | "PUSH" | "EMAIL" | "SMS";

export interface NotificationPreference {
    type: NotificationType;
    channel?: NotificationChannel;
    enabled: boolean;
    mandatory?: boolean;
}

export type { TwoFactorStatus } from "@/services/auth";

export interface AdvertiserKyc {
    id: string;
    status: string;
    submittedAt?: string | null;
    reviewedAt?: string | null;
    method?: string | null;
}

/* ------------------------------------------------------------------ */
/* The service                                                         */
/* ------------------------------------------------------------------ */

/** `?status=A,B&q=&sort=&page=&pageSize=` — the list contract, comma-joined statuses the way the app sends them. */
export function campaignQuery(query: { status?: readonly string[]; q?: string; sort?: string; page?: number; pageSize?: number } = {}): string {
    const parts: string[] = [];
    if (query.q?.trim()) parts.push(`q=${encodeURIComponent(query.q.trim())}`);
    if (query.status?.length) parts.push(`status=${query.status.join(",")}`);
    if (query.sort) parts.push(`sort=${query.sort}`);
    parts.push(`page=${query.page ?? 1}`);
    parts.push(`pageSize=${query.pageSize ?? 50}`);
    return `?${parts.join("&")}`;
}

const notFoundIsNull = <T>(caught: unknown): T | null => {
    if (caught instanceof ApiError && caught.status === 404) return null;
    throw caught;
};

export const advertiserWorkspace = {
    /* Campaigns */
    campaigns: (query: Parameters<typeof campaignQuery>[0] = {}) => api.get<CampaignListPage>(`/campaigns${campaignQuery(query)}`),
    campaign: (id: string) => api.get<CampaignDetail>(`/campaigns/${encodeURIComponent(id)}`),
    campaignAnalytics: (id: string, days?: number) =>
        api.get<CampaignAnalytics>(`/campaigns/${encodeURIComponent(id)}/analytics${days ? `?days=${days}` : ""}`),
    campaignReview: (id: string) => api.get<CampaignReview>(`/campaigns/${encodeURIComponent(id)}/review`),
    trackingCodes: (id: string) => api.get<TrackingCode[]>(`/campaigns/${encodeURIComponent(id)}/tracking-codes`),
    trackingCodeImage: (id: string, code: string) =>
        apiBlob(`/campaigns/${encodeURIComponent(id)}/tracking-codes/${encodeURIComponent(code)}/image.svg?size=240`),

    /* Orders — delivery proofs */
    orders: (query: { status?: readonly string[]; pageSize?: number } = {}) =>
        api.get<OrderPage>(`/orders/my?as=advertiser${query.status?.length ? `&status=${query.status.join(",")}` : ""}&pageSize=${query.pageSize ?? 100}`),
    order: (id: string) => api.get<AdvertiserOrder>(`/orders/${encodeURIComponent(id)}`),
    evidence: (id: string) => api.get<OrderEvidence>(`/orders/${encodeURIComponent(id)}/evidence`),

    /* The advertiser and their money */
    advertiser: () => api.get<AdvertiserProfile>("/advertisers/me"),
    updateAdvertiser: (id: string, patch: AdvertiserProfilePatch) => api.patch<AdvertiserProfile>(`/advertisers/${encodeURIComponent(id)}`, patch),
    invoices: (advertiserId: string) => api.get<Invoice[]>(`/advertisers/${encodeURIComponent(advertiserId)}/invoices`),
    /** WG-1: the document with its lines; null on a backend from before the route (404), when the page rebuilds the lines. */
    invoice: (advertiserId: string, invoiceId: string) =>
        api.get<InvoiceDetail>(`/advertisers/${encodeURIComponent(advertiserId)}/invoices/${encodeURIComponent(invoiceId)}`).catch(notFoundIsNull<InvoiceDetail>),
    invoicePdf: (advertiserId: string, invoiceId: string) =>
        apiBlob(`/advertisers/${encodeURIComponent(advertiserId)}/invoices/${encodeURIComponent(invoiceId)}/pdf`),
    payments: (advertiserId: string) => api.get<PaymentPage>(`/advertisers/${encodeURIComponent(advertiserId)}/payments?pageSize=100`),
    wallet: (advertiserId: string) => api.get<WalletSnapshot>(`/advertisers/${encodeURIComponent(advertiserId)}/wallet`),
    refundRequests: (advertiserId: string) =>
        api.get<{ items: RefundRequest[]; total: number }>(`/advertisers/${encodeURIComponent(advertiserId)}/wallet/refund-requests`),
    kyc: () => api.get<AdvertiserKyc | null>("/advertiser-kyc/me").catch(notFoundIsNull<AdvertiserKyc>),

    /* Support */
    tickets: () => api.get<SupportTicket[]>("/support/tickets?limit=100"),
    ticket: (id: string) => api.get<TicketThread>(`/support/tickets/${encodeURIComponent(id)}`),
    createTicket: (body: NewTicket) => api.post<SupportTicket>("/support/tickets", body),
    reply: (id: string, message: string) => api.post<TicketMessage>(`/support/tickets/${encodeURIComponent(id)}/reply`, { message }),
    setTicketStatus: (id: string, status: "OPEN" | "CLOSED") =>
        api.patch<SupportTicket>(`/support/tickets/${encodeURIComponent(id)}/status`, { status }),

    /* The person */
    profile: () => api.get<UserProfile>("/users/me"),
    updateProfile: (patch: { name?: string; firstName?: string; lastName?: string; language?: string }) => api.patch<UserProfile>("/users/me", patch),
    sendEmailCode: (email: string) => api.post<EmailCodeSent>("/users/me/email/send-code", { email }),
    verifyEmail: (email: string, code: string) => api.post<UserProfile>("/users/me/email/verify", { email, code }),
    contacts: () => api.get<ContactsView>("/users/me/contacts"),
    addContact: (input: { kind: "EMAIL" | "PHONE"; value: string; label?: string }) => api.post<UserContact>("/users/me/contacts", input),
    removeContact: (id: string) => api.delete<{ message: string }>(`/users/me/contacts/${encodeURIComponent(id)}`),
    sendContactCode: (id: string) => api.post<ContactCodeSent>(`/users/me/contacts/${encodeURIComponent(id)}/send-code`, {}),
    verifyContact: (id: string, code: string) => api.post<UserContact>(`/users/me/contacts/${encodeURIComponent(id)}/verify`, { code }),
    makeContactPrimary: (id: string) => api.post<unknown>(`/users/me/contacts/${encodeURIComponent(id)}/make-primary`, {}),
    sessions: () => api.get<DeviceSession[]>("/users/me/sessions"),
    revokeSession: (id: string) => api.delete<unknown>(`/users/me/sessions/${encodeURIComponent(id)}`),
    revokeOtherSessions: () => api.delete<{ revoked: number }>("/users/me/sessions"),
    changePassword: (body: { currentPassword?: string; newPassword: string }) => api.post<unknown>("/auth/change-password", body),
    twoFactorStatus: () => api.get<TwoFactorStatus>("/auth/2fa/status"),
    /** DQ-1: the advertiser's answer to the desk's design quote; answers the campaign detail. */
    respondToDesignQuote: (id: string, decision: "ACCEPTED" | "DECLINED") => api.post<CampaignDetail>(`/campaigns/${encodeURIComponent(id)}/design-quote/respond`, { decision }),
    /** The advertiser's own cancel: a draft or an unpaid campaign; a reserved one forfeits part of the fee. */
    cancelCampaign: (id: string, reason: string) => api.post<{ released: boolean; refundNeeded: boolean }>(`/campaigns/${encodeURIComponent(id)}/cancel`, { reason }),
    preferences: () => api.get<NotificationPreference[]>("/notifications/preferences"),
    savePreferences: (rows: NotificationPreference[]) => api.put<unknown>("/notifications/preferences", rows),
};

/* ------------------------------------------------------------------ */
/* Dates                                                               */
/* ------------------------------------------------------------------ */

const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function parse(iso: string | null | undefined): Date | null {
    if (!iso) return null;
    const date = new Date(iso);
    return Number.isNaN(date.getTime()) ? null : date;
}

/** "10 Oct 2026" */
export function shortDate(iso: string | null | undefined): string {
    const date = parse(iso);
    if (!date) return "—";
    return `${date.getDate()} ${MONTHS_SHORT[date.getMonth()]} ${date.getFullYear()}`;
}

/** "10 October 2026" */
export function longDate(iso: string | null | undefined): string {
    const date = parse(iso);
    if (!date) return "—";
    return `${date.getDate()} ${MONTHS_LONG[date.getMonth()]} ${date.getFullYear()}`;
}

/** "10 Oct" — the day without its year, for an activity line. */
export function dayMonth(iso: string | null | undefined): string {
    const date = parse(iso);
    if (!date) return "—";
    return `${date.getDate()} ${MONTHS_SHORT[date.getMonth()]}`;
}

/** "10 Oct · 10:24" — the frames' activity stamp. */
export function dateTime(iso: string | null | undefined): string {
    const date = parse(iso);
    if (!date) return "—";
    return `${dayMonth(iso)} · ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

/**
 * "12–25 Oct 2026", "28 Aug – 3 Sep 2026", "28 Dec 2026 – 3 Jan 2027" — the
 * frames' range, short months, an en dash, and nothing repeated.
 */
export function dateRange(start: string | null | undefined, end: string | null | undefined, style: "short" | "long" = "short"): string {
    const from = parse(start);
    const to = parse(end);
    const months = style === "long" ? MONTHS_LONG : MONTHS_SHORT;
    if (!from && !to) return "Not scheduled";
    if (!from || !to) return `${from ? "From" : "Until"} ${style === "long" ? longDate(from ? start : end) : shortDate(from ? start : end)}`;
    if (from.getFullYear() === to.getFullYear() && from.getMonth() === to.getMonth()) {
        if (from.getDate() === to.getDate()) return `${from.getDate()} ${months[from.getMonth()]} ${from.getFullYear()}`;
        return `${from.getDate()}–${to.getDate()} ${months[from.getMonth()]} ${from.getFullYear()}`;
    }
    if (from.getFullYear() === to.getFullYear()) {
        return `${from.getDate()} ${months[from.getMonth()]} – ${to.getDate()} ${months[to.getMonth()]} ${from.getFullYear()}`;
    }
    return `${from.getDate()} ${months[from.getMonth()]} ${from.getFullYear()} – ${to.getDate()} ${months[to.getMonth()]} ${to.getFullYear()}`;
}

/** Inclusive days between two dates — a 12–25 Oct booking is 14 days. */
export function dayCount(start: string | null | undefined, end: string | null | undefined): number | null {
    const from = parse(start);
    const to = parse(end);
    if (!from || !to) return null;
    const a = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate());
    const b = Date.UTC(to.getFullYear(), to.getMonth(), to.getDate());
    return Math.max(1, Math.round((b - a) / 86_400_000) + 1);
}

export function daysLabel(start: string | null | undefined, end: string | null | undefined): string {
    const n = dayCount(start, end);
    return n === null ? "—" : `${n} day${n === 1 ? "" : "s"}`;
}

/** "Active now" inside five minutes, else "2 hours ago" / "3 days ago". */
export function relativeTime(iso: string | null | undefined, now: Date = new Date()): string {
    const at = parse(iso);
    if (!at) return "Not used yet";
    const minutes = Math.round((now.getTime() - at.getTime()) / 60_000);
    if (minutes < 5) return "Active now";
    if (minutes < 60) return `${minutes} minutes ago`;
    const hours = Math.round(minutes / 60);
    if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
    const days = Math.round(hours / 24);
    return `${days} day${days === 1 ? "" : "s"} ago`;
}

/* ------------------------------------------------------------------ */
/* Money                                                               */
/* ------------------------------------------------------------------ */

/** ₹25,960 — Indian grouping, paise dropped; "—" for nothing. */
export function rupees(value: string | number | null | undefined): string {
    if (value === null || value === undefined || value === "") return "—";
    const n = typeof value === "number" ? value : Number(value);
    if (!Number.isFinite(n)) return "—";
    const sign = n < 0 ? "−" : "";
    return `${sign}₹${Math.round(Math.abs(n)).toLocaleString("en-IN")}`;
}

export const money = (value: string | number | null | undefined): number => {
    const n = typeof value === "number" ? value : Number(value ?? 0);
    return Number.isFinite(n) ? n : 0;
};

/** "GST 18%" from an invoice's own totals; "GST" when the rate is not a round one. */
export function gstLabel(taxable: string | number, gst: string | number): string {
    const base = money(taxable);
    if (base <= 0) return "GST";
    const rate = Math.round((money(gst) / base) * 1000) / 10;
    return Number.isInteger(rate) ? `GST ${rate}%` : "GST";
}

/* ------------------------------------------------------------------ */
/* Campaign status                                                     */
/* ------------------------------------------------------------------ */

export type Tone = "neutral" | "info" | "success" | "warning" | "danger";

/** The three chips on the Campaigns page, each the statuses it stands for. */
export const CAMPAIGN_CHIPS: { value: "ALL" | "ACTIVE" | "COMPLETED"; label: string; statuses: readonly CampaignStatus[] }[] = [
    { value: "ALL", label: "All campaigns", statuses: [] },
    { value: "ACTIVE", label: "Active", statuses: ["PENDING_PAYMENT", "SCHEDULED", "LIVE", "PAUSED"] },
    { value: "COMPLETED", label: "Completed", statuses: ["COMPLETED", "CANCELLED"] },
];

export function chipStatuses(chip: string | null | undefined): readonly CampaignStatus[] {
    return CAMPAIGN_CHIPS.find((c) => c.value === chip)?.statuses ?? [];
}

/** "3 campaigns · 1 draft" — the line under the Campaigns title, from the page's counts. */
export function campaignsSummary(counts: Record<string, number> | undefined, total: number): string {
    const all = counts ? Object.values(counts).reduce((sum, n) => sum + n, 0) : total;
    const drafts = counts?.["DRAFT"] ?? 0;
    const head = `${all} campaign${all === 1 ? "" : "s"}`;
    return drafts ? `${head} · ${drafts} draft${drafts === 1 ? "" : "s"}` : head;
}

/** The newest artwork per slot — a re-upload supersedes the row it points at. */
export function currentCreativeFor(creatives: CampaignCreative[], spotId: string | null): CampaignCreative | null {
    const superseded = new Set(creatives.map((c) => c.resubmissionOfId).filter(Boolean));
    const rows = creatives.filter((c) => c.spotId === spotId && !superseded.has(c.id));
    if (rows.length === 0) return null;
    return rows.reduce((newest, row) => ((row.submittedAt ?? "") >= (newest.submittedAt ?? "") ? row : newest));
}

export const CREATIVE_LABEL: Record<CreativeStatus, { label: string; tone: Tone }> = {
    PENDING_UPLOAD: { label: "Artwork not uploaded", tone: "neutral" },
    UPLOADED: { label: "Artwork uploaded", tone: "neutral" },
    IN_REVIEW: { label: "Artwork in review", tone: "neutral" },
    APPROVED: { label: "Artwork approved", tone: "success" },
    REJECTED: { label: "Artwork rejected", tone: "danger" },
    CHANGES_REQUESTED: { label: "Changes requested", tone: "warning" },
    AWAITING_ADVERTISER: { label: "Awaiting your approval", tone: "warning" },
};

/** Whether the desk still has artwork to approve — what "Artwork in review" on a paid campaign means. */
export function artworkInReview(creatives: CampaignCreative[]): boolean {
    const current = new Map<string | null, CampaignCreative>();
    for (const c of creatives) {
        const now = currentCreativeFor(creatives, c.spotId);
        if (now) current.set(c.spotId, now);
    }
    return [...current.values()].some((c) => c.fileUrl && c.status !== "APPROVED" && c.status !== "REJECTED");
}

/**
 * The status column and the status panel share one reading of a campaign:
 * the row's status, sharpened by the artwork when the detail is at hand.
 */
export function campaignStatusLabel(campaign: { status: CampaignStatus; creatives?: CampaignCreative[]; launchBlockedBy?: string[] }): { label: string; tone: Tone } {
    switch (campaign.status) {
        case "DRAFT":
            return { label: "Draft", tone: "neutral" };
        case "PENDING_PAYMENT":
            return { label: "Awaiting payment", tone: "warning" };
        case "SCHEDULED":
            if (campaign.launchBlockedBy?.includes("KYC")) return { label: "Verify to launch", tone: "warning" };
            if (campaign.creatives && artworkInReview(campaign.creatives)) return { label: "Artwork in review", tone: "neutral" };
            return { label: "Scheduled", tone: "info" };
        case "LIVE":
            return { label: "Live", tone: "success" };
        case "PAUSED":
            return { label: "Paused", tone: "warning" };
        case "COMPLETED":
            return { label: "Completed", tone: "success" };
        case "CANCELLED":
            return { label: "Cancelled", tone: "danger" };
        default:
            return { label: String(campaign.status), tone: "neutral" };
    }
}

/** The status panel's one line under its title (frame 02: "Your payment is complete. Publishers are reviewing…"). */
export function campaignStatusLine(campaign: Pick<CampaignDetail, "status" | "startDate" | "endDate" | "creatives" | "launchBlockedBy" | "refund">): string {
    const starts = campaign.startDate ? longDate(campaign.startDate).replace(/ \d{4}$/, "") : "its start date";
    const ends = campaign.endDate ? longDate(campaign.endDate).replace(/ \d{4}$/, "") : "its end date";
    switch (campaign.status) {
        case "DRAFT":
            return "Your brief is saved. Continue where you left off to choose spaces, add artwork and pay.";
        case "PENDING_PAYMENT":
            return "Your brief is complete. Pay to reserve the spaces and send your artwork for review.";
        case "SCHEDULED":
            if (campaign.launchBlockedBy?.includes("KYC")) return `Your payment is complete. Verify your account in the ADX app so the campaign can go live on ${starts}.`;
            if (artworkInReview(campaign.creatives ?? [])) return `Your payment is complete. Publishers are reviewing the submitted artwork before the campaign starts on ${starts}.`;
            return `Your payment is complete and the artwork is approved. The campaign starts on ${starts}.`;
        case "LIVE":
            return `Your campaign is running and ends on ${ends}. Delivery proofs arrive as each publisher installs.`;
        case "PAUSED":
            return "Your campaign is paused. ADX will tell you when it resumes.";
        case "COMPLETED":
            return `Your campaign ran until ${ends}. Delivery proofs and the invoice are below.`;
        case "CANCELLED":
            return campaign.refund
                ? `This campaign was cancelled. A refund of ${rupees(campaign.refund.amount)} is ${campaign.refund.status === "RELEASED" ? "released" : campaign.refund.status === "REJECTED" ? "not due" : "being reviewed"}.`
                : "This campaign was cancelled.";
        default:
            return "";
    }
}

/** Where "Continue draft" goes — the booking step for a draft, the pay step for an unpaid brief. */
export function campaignContinueHref(campaign: Pick<CampaignRow, "id" | "status">): string {
    if (campaign.status === "PENDING_PAYMENT") return `/advertiser/campaigns/${campaign.id}/pay`;
    return `/advertiser/campaigns/${campaign.id}/details`;
}

/** "2 spaces in Bengaluru" / "1 space" / "No spaces yet". */
export function spacesLine(spotCount: number, city: string | null | undefined): string {
    if (!spotCount) return "No spaces yet";
    const head = `${spotCount} space${spotCount === 1 ? "" : "s"}`;
    return city ? `${head} in ${city}` : head;
}

/** "Outdoor · 40 × 20 ft · 12–25 Oct 2026" — a booked space's second line. */
export function spotLine(spot: CampaignSpot, start: string | null, end: string | null): string {
    const parts: string[] = [];
    const kind = spot.listing.mediaType?.name ?? categoryLabel(spot.listing.category ?? spot.listing.mediaType?.category ?? null);
    if (kind) parts.push(kind);
    if (spot.listing.widthFt && spot.listing.heightFt) parts.push(`${trimZeros(spot.listing.widthFt)} × ${trimZeros(spot.listing.heightFt)} ft`);
    parts.push(dateRange(start, end));
    return parts.join(" · ");
}

const trimZeros = (value: string) => value.replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1");

export function categoryLabel(category: string | null | undefined): string {
    switch (category) {
        case "OUTDOOR":
            return "Outdoor";
        case "INDOOR":
            return "Indoor";
        case "TRANSIT":
            return "Transit";
        case "MEDIA":
            return "Media";
        case "DIGITAL":
            return "Digital";
        default:
            return category ? category.charAt(0) + category.slice(1).toLowerCase().replace(/_/g, " ") : "";
    }
}

export interface ActivityEntry {
    title: string;
    detail: string;
    at?: string | null;
}

/** "14 August" — the day with its month spelt out, for the Booking status card. */
export function dayMonthLong(iso: string | null | undefined): string {
    const date = parse(iso);
    if (!date) return "—";
    return `${date.getDate()} ${MONTHS_LONG[date.getMonth()]}`;
}

/**
 * The Activity card (frame 02): what has happened to the campaign, oldest
 * first, and what is next — the payment, the artwork, the publisher's
 * review, the start. A draft, which has none of those, shows its saving.
 */
export function campaignActivity(campaign: Pick<CampaignDetail, "createdAt" | "submittedForPaymentAt" | "paidAt" | "creatives" | "startDate" | "endDate" | "launchedAt" | "status">): ActivityEntry[] {
    const entries: ActivityEntry[] = [];
    if (campaign.status === "DRAFT" || campaign.status === "PENDING_PAYMENT") entries.push({ title: "Brief saved", detail: dateTime(campaign.createdAt), at: campaign.createdAt });
    if (campaign.submittedForPaymentAt) entries.push({ title: "Brief submitted", detail: dateTime(campaign.submittedForPaymentAt), at: campaign.submittedForPaymentAt });
    if (campaign.paidAt) entries.push({ title: "Payment received", detail: dateTime(campaign.paidAt), at: campaign.paidAt });
    const submitted = (campaign.creatives ?? []).map((c) => c.submittedAt).filter((v): v is string => !!v).sort();
    if (submitted.length) entries.push({ title: "Artwork submitted", detail: dateTime(submitted[submitted.length - 1]), at: submitted[submitted.length - 1] });
    if ((campaign.creatives ?? []).some((c) => c.fileUrl)) {
        const inReview = artworkInReview(campaign.creatives ?? []);
        const reviewed = (campaign.creatives ?? []).map((c) => c.reviewedAt).filter((v): v is string => !!v).sort();
        entries.push(
            inReview
                ? { title: "Publisher review", detail: "In progress", at: null }
                : { title: "Artwork approved", detail: reviewed.length ? dateTime(reviewed[reviewed.length - 1]) : "Done", at: reviewed[reviewed.length - 1] ?? null }
        );
    }
    if (campaign.launchedAt) entries.push({ title: "Campaign live", detail: dateTime(campaign.launchedAt), at: campaign.launchedAt });
    else if (campaign.startDate && campaign.status !== "DRAFT" && campaign.status !== "CANCELLED") entries.push({ title: "Campaign starts", detail: shortDate(campaign.startDate), at: campaign.startDate });
    if (campaign.endDate && (campaign.status === "LIVE" || campaign.status === "PAUSED" || campaign.status === "COMPLETED")) {
        entries.push({ title: campaign.status === "COMPLETED" ? "Campaign completed" : "Campaign ends", detail: shortDate(campaign.endDate), at: campaign.endDate });
    }
    return entries;
}

/* ------------------------------------------------------------------ */
/* Delivery proofs                                                     */
/* ------------------------------------------------------------------ */

export type ProofKey = "NOT_DUE" | "IN_PROGRESS" | "SUBMITTED" | "VERIFIED" | "DECLINED" | "CANCELLED";

export const PROOF_STATUSES: { key: ProofKey; label: string; tone: Tone }[] = [
    { key: "NOT_DUE", label: "Not due yet", tone: "warning" },
    { key: "IN_PROGRESS", label: "Installation in progress", tone: "info" },
    { key: "SUBMITTED", label: "Submitted · awaiting verification", tone: "info" },
    { key: "VERIFIED", label: "Verified", tone: "success" },
    { key: "DECLINED", label: "Publisher declined", tone: "danger" },
    { key: "CANCELLED", label: "Cancelled", tone: "neutral" },
];

/** Where an order's delivery proof stands, from the booking's own status. */
export function proofStatus(order: Pick<AdvertiserOrder, "status">): { key: ProofKey; label: string; tone: Tone } {
    const key: ProofKey = (() => {
        switch (order.status) {
            case "SELF_INSTALL":
            case "SLOT_PROPOSED":
            case "SLOT_CONFIRMED":
            case "IN_PROGRESS":
                return "IN_PROGRESS";
            case "PENDING_OTP":
            case "PENDING_APPROVAL":
                return "SUBMITTED";
            case "COMPLETED":
                return "VERIFIED";
            case "PUBLISHER_REJECTED":
                return "DECLINED";
            case "CANCELLED":
                return "CANCELLED";
            default:
                return "NOT_DUE";
        }
    })();
    return PROOF_STATUSES.find((s) => s.key === key)!;
}

/** Whether a booking may have evidence to read yet — before installation there is nothing to fetch. */
export function mayHaveEvidence(order: Pick<AdvertiserOrder, "status">): boolean {
    const key = proofStatus(order).key;
    return key === "IN_PROGRESS" || key === "SUBMITTED" || key === "VERIFIED";
}

/** "3 files" / "Not submitted". */
export function evidenceLine(count: number | null | undefined): string {
    if (!count) return "Not submitted";
    return `${count} file${count === 1 ? "" : "s"}`;
}

export const PHOTO_KIND_LABEL: Record<string, string> = {
    PICKUP: "Print collection photo",
    CONDITION: "Site condition photo",
    INSTALLATION: "Installation photo",
};

/** "city-bus-installation.jpg" off a storage URL, for the document rows. */
export function fileNameOf(url: string | null | undefined): string {
    if (!url || url.startsWith("data:") || url.startsWith("blob:")) return "";
    try {
        const path = new URL(url, "https://adx.in").pathname;
        return decodeURIComponent(path.split("/").filter(Boolean).pop() ?? "");
    } catch {
        return url.split("/").pop() ?? url;
    }
}

/** The Delivery activity card: the booking's milestones, oldest first. */
export function deliveryActivity(order: Pick<AdvertiserOrder, "publisherAcceptedAt" | "slotConfirmedAt" | "slotTime" | "verification" | "adminApprovedAt" | "endDate" | "status" | "cancelledAt" | "listing">, photos: OrderPhoto[] = []): ActivityEntry[] {
    const entries: ActivityEntry[] = [];
    const publisher = order.listing?.publisher?.name ?? "The publisher";
    if (order.publisherAcceptedAt) entries.push({ title: "Booking accepted", detail: `${dateTime(order.publisherAcceptedAt)} · ${publisher}`, at: order.publisherAcceptedAt });
    if (order.slotConfirmedAt || order.slotTime) entries.push({ title: "Installation slot confirmed", detail: dateTime(order.slotTime ?? order.slotConfirmedAt), at: order.slotTime ?? order.slotConfirmedAt });
    const installation = photos.filter((p) => p.kind === "INSTALLATION").map((p) => p.capturedAt).sort();
    if (installation.length) entries.push({ title: "Installation submitted", detail: `${dateTime(installation[0])} · ${publisher}`, at: installation[0] });
    if (order.verification?.verifiedAt) entries.push({ title: "Proof verified", detail: dateTime(order.verification.verifiedAt), at: order.verification.verifiedAt });
    if (order.adminApprovedAt) entries.push({ title: "Verified by ADX", detail: dateTime(order.adminApprovedAt), at: order.adminApprovedAt });
    if (order.status === "CANCELLED" && order.cancelledAt) entries.push({ title: "Booking cancelled", detail: dateTime(order.cancelledAt), at: order.cancelledAt });
    if (order.status === "COMPLETED" && order.endDate) entries.push({ title: "Campaign completed", detail: shortDate(order.endDate), at: order.endDate });
    return entries;
}

/* ------------------------------------------------------------------ */
/* Invoices and payments                                               */
/* ------------------------------------------------------------------ */

export function invoiceStatusLabel(invoice: Pick<Invoice, "status" | "kind" | "paymentId">): { label: string; tone: Tone } {
    if (invoice.kind === "CREDIT_NOTE") return { label: "Credit note", tone: "neutral" };
    switch (invoice.status) {
        case "PAID":
            return { label: "Paid", tone: "success" };
        case "ISSUED":
            return invoice.paymentId ? { label: "Paid", tone: "success" } : { label: invoice.kind === "PROFORMA" ? "Proforma" : "Due", tone: "warning" };
        case "VOID":
            return { label: "Void", tone: "neutral" };
        default:
            return { label: "Draft", tone: "neutral" };
    }
}

/** "2 invoices · All paid" / "3 invoices · 1 due". */
export function invoicesSummary(invoices: Pick<Invoice, "status" | "kind" | "paymentId">[]): string {
    const count = invoices.length;
    const head = `${count} invoice${count === 1 ? "" : "s"}`;
    if (!count) return "No invoices yet";
    const due = invoices.filter((i) => invoiceStatusLabel(i).label === "Due" || invoiceStatusLabel(i).label === "Proforma").length;
    return due ? `${head} · ${due} due` : `${head} · All paid`;
}

export const GATEWAY_LABEL: Record<string, string> = {
    RAZORPAY: "Razorpay",
    CASHFREE: "Cashfree",
    CCAVENUE: "CCAvenue",
    BANK_TRANSFER: "Bank transfer",
    WALLET: "ADX wallet",
    UPI: "UPI",
};

/** "₹25,960 paid · UPI" — the invoice's payment line, from the payment that settled it. */
export function paymentLine(invoice: Pick<Invoice, "total" | "paymentId" | "campaignId">, payments: PaymentRow[]): string {
    const payment = payments.find((p) => p.id === invoice.paymentId) ?? payments.find((p) => invoice.campaignId && p.campaignId === invoice.campaignId && /CAPTURED|PAID|SUCCEEDED|SUCCESS/i.test(p.status));
    if (!payment) return `${rupees(invoice.total)} · payment record not found`;
    const via = payment.method ?? GATEWAY_LABEL[payment.gateway] ?? payment.gateway;
    return `${rupees(payment.amount)} paid · ${via}`;
}

export interface InvoiceLine {
    description: string;
    period: string;
    quantity: string;
    taxable: number;
    gst: number;
    total: number;
}

/** The line table from the document's own lines (WG-1), the campaign's dates as the period of a media line. */
export function detailLines(lines: InvoiceDetailLine[], campaign: Pick<CampaignDetail, "startDate" | "endDate"> | null): InvoiceLine[] {
    const period = campaign ? dateRange(campaign.startDate, campaign.endDate) : "";
    const PERIOD: Record<string, string> = { PRINTING: "Campaign artwork", INSTALLATION: "Site placement", DISCOUNT: "" };
    return [...lines]
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((line) => {
            const taxable = money(line.taxableValue);
            const gst = money(line.gstAmount);
            const quantity = money(line.quantity);
            return {
                /* GST-D: the discount line carries a negative gstAmount — the tax that came off with it. */
                description: line.kind === "DISCOUNT" && gst < 0 ? `${line.description} (incl. GST ${rupees(gst)})` : line.description,
                period: line.kind in PERIOD ? PERIOD[line.kind]! : period,
                quantity: line.kind === "MEDIA" ? `${quantity} booking${quantity === 1 ? "" : "s"}` : String(quantity),
                taxable,
                gst,
                total: taxable + gst,
            };
        });
}

/**
 * The line table when the document read has no lines (a backend from before
 * WG-1): rebuilt from the campaign's receipt — each booked space at its media
 * cost, each fee the receipt named, and the discount, all at the invoice's
 * own GST rate so the columns add up to it.
 */
export function invoiceLines(invoice: Pick<Invoice, "taxableValue" | "gstTotal">, campaign: Pick<CampaignDetail, "spots" | "startDate" | "endDate" | "feesTotal" | "discount"> | null, review: CampaignReview | null): InvoiceLine[] {
    if (!campaign) return [];
    const base = money(invoice.taxableValue);
    const rate = base > 0 ? money(invoice.gstTotal) / base : 0.18;
    const period = dateRange(campaign.startDate, campaign.endDate);
    const lines: InvoiceLine[] = campaign.spots
        .filter((s) => s.status !== "CANCELLED")
        .map((spot) => {
            const taxable = money(spot.lineTotal);
            return { description: spot.listing.title, period, quantity: `${spot.quantity} booking${spot.quantity === 1 ? "" : "s"}`, taxable, gst: taxable * rate, total: taxable * (1 + rate) };
        });
    const fees = new Map<string, number>();
    if (review) {
        for (const line of review.lines) for (const fee of line.fees) fees.set(fee.label, (fees.get(fee.label) ?? 0) + money(fee.amount));
    } else if (money(campaign.feesTotal) > 0) {
        fees.set("Service fee", money(campaign.feesTotal));
    }
    for (const [label, amount] of fees) {
        lines.push({ description: label, period: /print/i.test(label) ? "Campaign artwork" : /install/i.test(label) ? "Site placement" : period, quantity: "1", taxable: amount, gst: amount * rate, total: amount * (1 + rate) });
    }
    if (money(campaign.discount) > 0) {
        const amount = -money(campaign.discount);
        lines.push({ description: "Discount", period: "", quantity: "1", taxable: amount, gst: amount * rate, total: amount * (1 + rate) });
    }
    return lines;
}

/* ------------------------------------------------------------------ */
/* Support requests                                                    */
/* ------------------------------------------------------------------ */

export interface RequestTopic {
    id: string;
    label: string;
    category: string;
    /** The "What happens next" paragraph on the request page. */
    next: string;
}

/** The Topic select on Contact support, each on one of the desk's pinned categories. */
export const REQUEST_TOPICS: RequestTopic[] = [
    { id: "ARTWORK", label: "Artwork & creative review", category: "ORDER", next: "ADX Support will check the artwork's review status with the publisher and reply here. Payment reserves the spaces; the publisher's approval is a separate step." },
    { id: "DELIVERY", label: "Delivery proofs", category: "ORDER", next: "ADX Support will check the installation evidence with the publisher and reply here with what was found." },
    { id: "PAYMENT", label: "Payments & invoices", category: "PAYMENT", next: "ADX Support will find the payment against the invoice number and reply here. Refunds, when due, are credited to your ADX wallet or your original payment method." },
    { id: "CHANGE", label: "Changes to a booking", category: "ORDER", next: "ADX Support will check what can still change under the booking terms and reply here with the options." },
    { id: "CANCELLATION", label: "Cancellation request", category: "ORDER", next: "We will review the booking terms and any work already completed. The cancellation decision and any refund amount will be shared in My requests." },
    { id: "DESIGN", label: "Design assistance", category: "OTHER", next: "ADX's design team will reply here with a quote and what they need from you." },
    { id: "ACCOUNT", label: "Account & billing details", category: "ACCOUNT", next: "ADX Support will reply here; changes to your registered details may need a document." },
    { id: "WEBSITE", label: "Problem with the website", category: "APP_BUG", next: "ADX Support will reproduce the problem and reply here." },
    { id: "OTHER", label: "Something else", category: "OTHER", next: "ADX Support will reply here." },
];

export const topicById = (id: string | null | undefined): RequestTopic | null => REQUEST_TOPICS.find((t) => t.id === id) ?? null;

/** The tags a request carries: its topic and the campaign it is about, both readable by the desk and by the list. */
export function requestTags(topic: RequestTopic, campaignId: string | null): string[] {
    const tags = [`topic:${topic.id}`, topic.label];
    if (campaignId) tags.push(`campaign:${campaignId}`);
    return tags;
}

export function ticketTopic(ticket: Pick<SupportTicket, "tags" | "category">): RequestTopic | null {
    const tag = ticket.tags?.find((t) => t.startsWith("topic:"));
    if (tag) return topicById(tag.slice("topic:".length));
    return REQUEST_TOPICS.find((t) => t.category === ticket.category && t.id !== "CHANGE" && t.id !== "CANCELLATION") ?? null;
}

/** The campaign a request is about: the desk's own column when the row has it, else the tag the website wrote before the column existed. */
export function ticketCampaignId(ticket: Pick<SupportTicket, "tags" | "relatedCampaignId">): string | null {
    if (ticket.relatedCampaignId) return ticket.relatedCampaignId;
    const tag = ticket.tags?.find((t) => t.startsWith("campaign:"));
    return tag ? tag.slice("campaign:".length) : null;
}

export function ticketStatusLabel(status: TicketStatus): { label: string; tone: Tone } {
    switch (status) {
        case "OPEN":
            return { label: "Open", tone: "neutral" };
        case "WAITING":
            return { label: "Waiting on you", tone: "warning" };
        case "CLOSED":
            return { label: "Resolved", tone: "success" };
        default:
            return { label: String(status), tone: "neutral" };
    }
}

/** "4 requests · 3 open · 1 resolved" */
export function requestsSummary(tickets: Pick<SupportTicket, "status">[]): string {
    const count = tickets.length;
    if (!count) return "No requests yet";
    const open = tickets.filter((t) => t.status !== "CLOSED").length;
    const resolved = count - open;
    return `${count} request${count === 1 ? "" : "s"} · ${open} open · ${resolved} resolved`;
}

/** The number a person quotes: TKT-… when minted, else the row's tail. */
export function ticketReference(ticket: Pick<SupportTicket, "id" | "displayId">): string {
    return ticket.displayId ?? `#${ticket.id.slice(-4).toUpperCase()}`;
}

/* ------------------------------------------------------------------ */
/* Account                                                             */
/* ------------------------------------------------------------------ */

/** "+91 98••• ••421" — the phone as the frame prints it. */
export function maskPhone(mobile: string | null | undefined): string {
    if (!mobile) return "—";
    const digits = mobile.replace(/\D/g, "");
    const local = digits.length > 10 ? digits.slice(-10) : digits;
    const country = digits.length > 10 ? `+${digits.slice(0, digits.length - 10)} ` : "";
    if (local.length < 6) return `${country}${local}`;
    return `${country}${local.slice(0, 2)}••• ••${local.slice(-3)}`;
}

/** "Chrome" with a "Windows" badge; "ADX app" with "Android" — read off the user agent. */
export function describeSession(userAgent: string | null): { name: string; badge: string | null } {
    const ua = (userAgent ?? "").trim();
    if (!ua) return { name: "Unknown device", badge: null };
    const lower = ua.toLowerCase();
    let badge: string | null = null;
    if (lower.includes("android")) badge = "Android";
    else if (lower.includes("iphone") || lower.includes("ipad") || lower.includes("ios")) badge = "iPhone";
    else if (lower.includes("windows")) badge = "Windows";
    else if (lower.includes("mac os") || lower.includes("macintosh")) badge = "macOS";
    else if (lower.includes("linux")) badge = "Linux";
    let name = "Browser";
    if (lower.startsWith("adx-agent") || lower.includes("adx agent")) name = "ADX Agent app";
    else if (lower.startsWith("adx-user") || lower.includes("adx user") || lower.startsWith("adx/")) name = "ADX app";
    else if (lower.includes("edg/")) name = "Edge";
    else if (lower.includes("chrome")) name = "Chrome";
    else if (lower.includes("firefox")) name = "Firefox";
    else if (lower.includes("safari")) name = "Safari";
    else if (lower.includes("okhttp") || lower.includes("react-native") || lower.includes("curl")) name = lower.includes("curl") ? "Command line" : "ADX app";
    else name = ua.split(/[\s/(]/)[0] || "Unknown device";
    return { name, badge };
}

/** This device first, then the rest as the server listed them. */
export function orderSessions<T extends Pick<DeviceSession, "current">>(sessions: readonly T[]): T[] {
    return [...sessions.filter((s) => s.current === true), ...sessions.filter((s) => s.current !== true)];
}

/** SL-1: "Bengaluru, India" — the city and the country when known, the region standing in for a missing city; null when nothing was looked up. */
export function sessionPlace(session: Pick<DeviceSession, "city" | "region" | "country">): string | null {
    const parts = [session.city || session.region || null, session.country || null].filter((part): part is string => !!part);
    return parts.length ? parts.join(", ") : null;
}

/** BK-1: the booking's id as people quote it — BKG-DDMM-YYNN, or the tail of the internal id on a row from before the ids. */
export function orderRef(order: Pick<AdvertiserOrder, "id" | "displayId">): string {
    return order.displayId || `BKG-${order.id.slice(-6).toUpperCase()}`;
}

export interface PreferenceGroup {
    id: string;
    label: string;
    hint: string;
    types: NotificationType[];
}

/** The four switches on Account settings, each over the notification kinds it stands for. */
export const PREFERENCE_GROUPS: PreferenceGroup[] = [
    { id: "campaign", label: "Campaign updates", hint: "Artwork approval, booking confirmation and campaign dates", types: ["BOOKING"] },
    { id: "delivery", label: "Delivery proof & requests", hint: "Notify me when proof arrives or my support request changes", types: ["ORDER", "MESSAGE"] },
    { id: "billing", label: "Invoices & payments", hint: "Payment receipts, tax invoices and refund updates", types: ["PAYOUT"] },
    { id: "weekly", label: "Weekly campaign summary", hint: "A summary of my campaigns by email every Monday", types: ["WEEKLY_SUMMARY"] },
];

/** A group is on when any of its switchable rows is on. */
export function groupEnabled(preferences: NotificationPreference[], group: PreferenceGroup): boolean {
    const rows = preferences.filter((p) => group.types.includes(p.type) && !p.mandatory);
    return rows.some((p) => p.enabled);
}

/** The rows to save when a group is switched: every channel of every kind in it, the mandatory ones left alone. */
export function groupRows(preferences: NotificationPreference[], group: PreferenceGroup, enabled: boolean): NotificationPreference[] {
    return preferences.filter((p) => group.types.includes(p.type) && !p.mandatory).map((p) => ({ type: p.type, channel: p.channel ?? "IN_APP", enabled }));
}

export const KYC_LABEL: Record<string, { label: string; tone: Tone }> = {
    VERIFIED: { label: "Verified", tone: "success" },
    PENDING: { label: "Under review", tone: "info" },
    NEEDS_INFO: { label: "More information needed", tone: "warning" },
    REJECTED: { label: "Not approved", tone: "danger" },
};

export function kycLabel(status: string | null | undefined, submitted: boolean): { label: string; tone: Tone } {
    if (status && KYC_LABEL[status] && (status !== "PENDING" || submitted)) return KYC_LABEL[status];
    return { label: "Not started", tone: "neutral" };
}

/** Initials for an avatar: "Aster Home" → "AH". */
export function initials(name: string | null | undefined, fallback = "AD"): string {
    const words = (name ?? "").trim().split(/\s+/).filter(Boolean);
    if (!words.length) return fallback;
    return words.slice(0, 2).map((w) => w[0]!.toUpperCase()).join("");
}

/** Save a blob the browser fetched with the bearer — the invoice PDF. */
export function saveBlob(blob: Blob, fileName: string): void {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** `INV/2026-27/000018.pdf` cannot be a file name; the server folds the slashes the same way. */
export function invoiceFileName(number: string): string {
    return `${number.replace(/\//g, "-")}.pdf`;
}
