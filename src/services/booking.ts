import { api, apiFetch, ApiError } from "@/lib/api-client";
import type { CartState } from "@/lib/cart";

/**
 * The booking — DR 12 board 04, from the cart to a paid campaign — over the
 * same campaign endpoints the ADX app's wizard walks (`campaigns-api.ts` in
 * the user app is the reference for every shape here). A campaign is created
 * as a draft the moment a signed-in advertiser leaves the cart, and PATCHed a
 * step at a time; the review prices it; the payment settles it.
 */

export type CampaignStatus = "DRAFT" | "PENDING_PAYMENT" | "SCHEDULED" | "LIVE" | "PAUSED" | "COMPLETED" | "CANCELLED";
export type CampaignGoal = "BRAND_AWARENESS" | "DIGITAL_LIFT" | "LOCAL_FOOTFALL";
export type AwarenessLevel = "BRAND_NEW" | "ALREADY_ESTABLISHED";
export type TargetingMethod = "RADIUS" | "MARKET_OR_DMA" | "POI_VENUE";
export type CampaignStrategy = "DEFENSIVE" | "GENERAL" | "ATTACK";
export type AudiencePersona = "B2B_DECISION_MAKERS" | "STUDENTS_OR_GEN_Z" | "HIGH_INCOME_CONSUMERS" | "FAMILIES_OR_SUBURBAN";
export type TriggerType = "NONE" | "WEATHER" | "TIME_OF_DAY" | "EVENT";
export type CreativePath = "STATIC_IMAGES" | "VIDEO_OR_MOTION" | "DYNAMIC_HTML5" | "ADX_DESIGN_AGENCY";
export type TrackingMethod = "QR_OR_DEEPLINK" | "VANITY_OR_PROMO" | "LOCATION_LIFT" | "NONE";
export type FulfilmentChoice = "ADX_PRINTS" | "ADVERTISER_SHIPS";
export type CreativeStatus = "PENDING_UPLOAD" | "UPLOADED" | "IN_REVIEW" | "APPROVED" | "REJECTED" | "CHANGES_REQUESTED" | "AWAITING_ADVERTISER";

export interface CampaignSpot {
    id: string;
    listingId: string;
    status: "RESERVED" | "BOOKED" | "LIVE" | "COMPLETED" | "CANCELLED";
    ratePerDay: string;
    days: number;
    quantity: number;
    lineTotal: string;
    listing: {
        id: string;
        title: string;
        city: string | null;
        address: string;
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
    path: CreativePath;
    status: CreativeStatus;
    fileUrl: string | null;
    fileName: string | null;
    fileSize?: number | null;
    mimeType?: string | null;
    widthPx?: number | null;
    heightPx?: number | null;
    durationMs?: number | null;
    reviewNote?: string | null;
    reviewedAt?: string | null;
    submittedAt?: string | null;
    resubmissionOfId?: string | null;
    flags?: string[];
}

export interface Campaign {
    id: string;
    reference: string;
    advertiserId: string;
    name: string;
    status: CampaignStatus;
    step: number;
    brandName: string | null;
    productName: string | null;
    industry: string | null;
    subCategory: string | null;
    goal: CampaignGoal | null;
    awareness: AwarenessLevel | null;
    targetingMethod: TargetingMethod | null;
    targetLocation: string | null;
    targetLatitude: number | null;
    targetLongitude: number | null;
    targetRadiusKm: number | null;
    targetMarket: string | null;
    targetMarkets?: string[];
    strategy: CampaignStrategy | null;
    persona: AudiencePersona | null;
    triggerType: TriggerType;
    triggerConfig: Record<string, unknown> | null;
    budget: string | null;
    startDate: string | null;
    endDate: string | null;
    creativePath: CreativePath | null;
    creativeConfig: Record<string, unknown> | null;
    trackingMethod: TrackingMethod;
    trackingConfig: Record<string, unknown> | null;
    fulfilment: FulfilmentChoice | null;
    spotsSubtotal: string | null;
    feesTotal: string | null;
    discount: string | null;
    gstAmount: string | null;
    total: string | null;
    paidAt: string | null;
    launchedAt: string | null;
    launchBlockedBy?: string[];
    submittedForPaymentAt?: string | null;
    spots: CampaignSpot[];
    creatives: CampaignCreative[];
    spotCount?: number;
    city?: string | null;
}

export interface MissingAnswer {
    step: string;
    field: string;
    label: string;
}

export interface ReviewLine {
    spotId: string;
    listingId: string;
    title: string;
    city: string | null;
    photoUrl: string | null;
    mediaTypeName: string | null;
    size: string | null;
    ratePerDay: string;
    days: number;
    quantity: number;
    lineTotal: string;
    fees: { label: string; amount: string }[];
    gst: string;
    gross: string;
}

export interface AgreementStanding {
    kind: string;
    accepted: boolean;
    templateVersion: number | null;
    currentVersion: number | null;
    current: boolean;
}

export interface CampaignReview {
    campaignId: string;
    reference: string;
    status: CampaignStatus;
    lines: ReviewLine[];
    spotsSubtotal: string;
    feesTotal: string;
    gstAmount: string;
    discount: string;
    total: string;
    budget: string | null;
    budgetRemaining: string | null;
    days: number;
    creativesUploaded: number;
    creativesExpected: number;
    missing: MissingAnswer[];
    outstanding?: { code: string; label: string; creativeIds: string[] }[];
    agreements?: AgreementStanding[];
    signing?: { required: boolean; satisfied: boolean; request: { id: string; status: string; signingUrl: string | null; mock: boolean } | null };
    clashes: { spotId: string; listingId: string; title: string; reason?: string }[];
    /** The promo code standing on the campaign, behind `discount`; null when none. */
    promo?: PromoDiscount | null;
}

/** The code behind a review's `discount`. */
export interface PromoDiscount {
    code: string;
    amount: string;
}

export type CampaignPatch = Partial<{
    name: string;
    step: number;
    brandName: string | null;
    productName: string | null;
    industry: string | null;
    subCategory: string | null;
    goal: CampaignGoal | null;
    awareness: AwarenessLevel | null;
    targetingMethod: TargetingMethod | null;
    targetLocation: string | null;
    targetRadiusKm: number | null;
    targetMarket: string | null;
    targetMarkets: string[];
    strategy: CampaignStrategy | null;
    persona: AudiencePersona | null;
    budget: string | null;
    startDate: string | null;
    endDate: string | null;
    fulfilment: FulfilmentChoice | null;
    trigger: { triggerType: "NONE" };
    creative:
        | { creativePath: "STATIC_IMAGES" }
        | { creativePath: "VIDEO_OR_MOTION" }
        | { creativePath: "ADX_DESIGN_AGENCY"; creativeConfig?: { objective: string; keyMessage: string; style: string } };
    tracking:
        | { trackingMethod: "NONE" }
        | { trackingMethod: "QR_OR_DEEPLINK"; trackingConfig?: { destinationUrl?: string; utmCampaign?: string } }
        | { trackingMethod: "VANITY_OR_PROMO"; trackingConfig?: { vanityUrl?: string; promoCode?: string; redemptionWindow: string } }
        | { trackingMethod: "LOCATION_LIFT"; trackingConfig?: { businessAddress: string; measurementWindowDays: number; baselinePeriod: string } };
}>;

export interface InventoryMatch {
    listingId: string;
    title: string;
    city: string | null;
    address: string;
    photoUrl: string | null;
    mediaTypeName: string | null;
    size: string | null;
    ratePerDay: string;
    lineTotal: string;
    matchScore: number;
    clashes: boolean;
}

/** The advertiser behind the session — the billing fields `PATCH /advertisers/:id` takes. */
export interface AdvertiserProfile {
    id: string;
    displayId: string | null;
    name: string;
    mobile: string | null;
    email: string | null;
    type: "INDIVIDUAL" | "COMMERCIAL" | "NGO" | "AGENCY" | string;
    companyName: string | null;
    gstin: string | null;
    billingAddress: string | null;
    city: string | null;
    state: string | null;
    kycStatus: string;
    verified?: boolean;
}

export type AdvertiserPatch = Partial<Pick<AdvertiserProfile, "name" | "email" | "companyName" | "gstin" | "billingAddress" | "city" | "state">>;

export interface Eligibility {
    eligible: boolean;
    blockedBy: Array<"SUSPENDED" | "PROFILE" | "KYC" | "AGREEMENT" | "FUNDS">;
    launchBlockedBy?: string[];
}

export interface AgreementTemplate {
    id: string;
    kind: string;
    version: number;
    title?: string | null;
    body?: string | null;
    content?: string | null;
}

export interface UploadedFile {
    id: string;
    url: string;
}

/* ------------------------------------------------------------------ */
/* Calls                                                               */
/* ------------------------------------------------------------------ */

export const bookingService = {
    create: (body: { name?: string; brandId?: string } = {}) => api.post<Campaign>("/campaigns", body),
    get: (id: string) => api.get<Campaign>(`/campaigns/${encodeURIComponent(id)}`),
    patch: (id: string, body: CampaignPatch) => api.patch<Campaign>(`/campaigns/${encodeURIComponent(id)}`, body),
    discard: (id: string) => api.delete<{ discarded: boolean }>(`/campaigns/${encodeURIComponent(id)}`),
    /** The cart is sent whole, because it is edited whole. */
    setSpots: (id: string, items: { listingId: string; quantity?: number }[]) => api.put<Campaign>(`/campaigns/${encodeURIComponent(id)}/spots`, { items }),
    inventory: (id: string, limit = 6) => api.get<InventoryMatch[]>(`/campaigns/${encodeURIComponent(id)}/inventory?sort=BEST_MATCH&limit=${limit}`),
    review: (id: string) => api.get<CampaignReview>(`/campaigns/${encodeURIComponent(id)}/review`),
    /** `POST /upload` multipart — the file, then its purpose; answers the stored file's public URL and id. */
    uploadFile: (file: File, purpose = "CAMPAIGN_CREATIVE") => {
        const form = new FormData();
        form.append("file", file);
        form.append("purpose", purpose);
        return apiFetch<UploadedFile>("/upload", { method: "POST", body: form });
    },
    addCreative: (
        id: string,
        body: { spotId: string | null; fileUrl: string; fileName?: string; fileSize?: number; mimeType?: string; widthPx?: number; heightPx?: number; durationMs?: number }
    ) => api.post<CampaignCreative>(`/campaigns/${encodeURIComponent(id)}/creatives`, body),
    deleteCreative: (id: string, creativeId: string) => api.delete<{ deleted: boolean }>(`/campaigns/${encodeURIComponent(id)}/creatives/${encodeURIComponent(creativeId)}`),
    /** Ops or the campaign's agent send it to be paid; an advertiser's own campaign is paid straight from the pay step. */
    submitForPayment: (id: string) => api.post<{ campaign: Campaign; review: CampaignReview; reservedUntil: string }>(`/campaigns/${encodeURIComponent(id)}/submit-for-payment`, {}),
    cancel: (id: string, reason: string) => api.post<{ released: boolean; refundNeeded: boolean }>(`/campaigns/${encodeURIComponent(id)}/cancel`, { reason }),
    applyPromo: async (id: string, code: string) => normalisePromo(await api.post<unknown>(`/campaigns/${encodeURIComponent(id)}/promo`, { code })),
    removePromo: async (id: string) => normalisePromo(await api.delete<unknown>(`/campaigns/${encodeURIComponent(id)}/promo`)),

    advertiser: () => api.get<AdvertiserProfile | null>("/advertisers/me"),
    updateAdvertiser: (id: string, patch: AdvertiserPatch) => api.patch<AdvertiserProfile>(`/advertisers/${encodeURIComponent(id)}`, patch),
    eligibility: (id: string) => api.get<Eligibility>(`/advertisers/${encodeURIComponent(id)}/eligibility`),
    industries: async () => {
        const rows = await api.get<unknown>("/advertisers/industries");
        return Array.isArray(rows) ? (rows as string[]).filter((r) => typeof r === "string") : [];
    },
    acceptInsertionOrder: (advertiserId: string, campaignId: string) => api.post<unknown>(`/advertisers/${encodeURIComponent(advertiserId)}/agreements/insertion-order`, { campaignId }),
    acceptPlatformAgreement: (advertiserId: string) => api.post<unknown>(`/advertisers/${encodeURIComponent(advertiserId)}/agreements/platform`, {}),
    agreement: (kind: "INSERTION_ORDER" | "ADVERTISER_PLATFORM") => api.get<AgreementTemplate | null>(`/agreements/current/${kind}`),

    /**
     * The cart becomes a campaign: a draft, its flight and market from the
     * cart, then the spots. A refused cart (a listing that takes longer
     * bookings, say) discards the draft it just made and throws, so the
     * person still has their cart to fix.
     */
    campaignFromCart: async (state: CartState, options: { city?: string | null } = {}): Promise<Campaign> => {
        if (!state.dates.from || !state.dates.to) throw new ApiError(0, "DATES_REQUIRED", "Choose your campaign dates first.");
        if (state.lines.length === 0) throw new ApiError(0, "CART_EMPTY", "Your cart is empty.");
        const draft = await bookingService.create();
        try {
            const city = options.city ?? cityOf(state);
            await bookingService.patch(draft.id, {
                step: 1,
                startDate: state.dates.from,
                endDate: state.dates.to,
                fulfilment: state.printing ? "ADX_PRINTS" : "ADVERTISER_SHIPS",
                ...(city ? { targetingMethod: "MARKET_OR_DMA", targetMarket: city, targetMarkets: [city], targetLocation: city } : {}),
            });
            return await bookingService.setSpots(
                draft.id,
                state.lines.map((line) => ({ listingId: line.listingId }))
            );
        } catch (caught) {
            await bookingService.discard(draft.id).catch(() => undefined);
            throw caught;
        }
    },
};

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

/**
 * `POST`/`DELETE /campaigns/:id/promo` answer the review — `discount` a money
 * string, `promo: { code, amount } | null` naming the code behind it. Read
 * as one thing and handed back as the two the pay page keeps.
 */
export function normalisePromo(answer: unknown): { review: CampaignReview; promo: PromoDiscount | null } {
    const review = (answer ?? {}) as CampaignReview;
    const promo = review.promo && typeof review.promo === "object" && review.promo.code ? { code: review.promo.code, amount: String(review.promo.amount ?? review.discount ?? "0") } : null;
    return { review: { ...review, discount: String(review.discount ?? "0") }, promo };
}

/** The city the cart's spaces are in, when they agree on one — off the "area" line's last part or the chip. */
export function cityOf(state: Pick<CartState, "lines">): string | null {
    const cities = state.lines.map((line) => line.area?.split(",").map((part) => part.trim()).filter(Boolean).pop() ?? null).filter((c): c is string => !!c);
    if (cities.length === 0) return null;
    const first = cities[0]!;
    return cities.every((c) => c === first) ? first : first;
}

/** Inclusive days between two ISO dates; 0 when the pair is not a flight. */
export function flightDays(from: string | null | undefined, to: string | null | undefined): number {
    if (!from || !to) return 0;
    const a = new Date(from.slice(0, 10) + "T00:00:00").getTime();
    const b = new Date(to.slice(0, 10) + "T00:00:00").getTime();
    if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return 0;
    return Math.round((b - a) / 86_400_000) + 1;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function parts(iso: string): { d: number; m: number; y: number } {
    const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
    return { d: d ?? 1, m: (m ?? 1) - 1, y: y ?? 1970 };
}

/**
 * "12–25 Oct 2026" as the frames print a flight; "28 Oct – 3 Nov 2026"
 * across months; both years when they differ. `long` spells the month
 * ("12–25 October 2026"); `year: false` drops it ("12–25 Oct").
 */
export function formatFlight(from: string | null | undefined, to: string | null | undefined, options: { long?: boolean; year?: boolean } = {}): string {
    if (!from || !to) return "Dates not set";
    const names = options.long ? MONTHS_LONG : MONTHS;
    const a = parts(from);
    const b = parts(to);
    const year = options.year === false ? "" : ` ${b.y}`;
    if (a.y === b.y && a.m === b.m) return `${a.d}–${b.d} ${names[b.m]}${year}`;
    if (a.y === b.y) return `${a.d} ${names[a.m]} – ${b.d} ${names[b.m]}${year}`;
    return `${a.d} ${names[a.m]} ${a.y} – ${b.d} ${names[b.m]} ${b.y}`;
}

/** "12 Oct 2026" — one date. */
export function formatDay(iso: string | null | undefined): string {
    if (!iso) return "—";
    const p = parts(iso);
    return `${p.d} ${MONTHS[p.m]} ${p.y}`;
}

/** ₹12,600 — Indian grouping; paise dropped, as the frames print money. */
export function rupees(value: string | number | null | undefined): string {
    if (value === null || value === undefined || value === "") return "—";
    const n = typeof value === "number" ? value : Number(value);
    if (!Number.isFinite(n)) return "—";
    return `₹${Math.round(n).toLocaleString("en-IN")}`;
}

export interface Charges {
    mediaRent: number;
    printing: number;
    installation: number;
    /** Printing + installation, the frames' "Print & installation". */
    production: number;
    platformFee: number;
    /** Fees that are none of the above — the revenue module's "Creative design", say — each its own row. */
    otherFees: { label: string; amount: number }[];
    gst: number;
    discount: number;
    total: number;
    /** Every fee line by its own label, for the itemised block. */
    fees: { label: string; amount: number }[];
}

const isPrinting = (label: string) => /print|production/i.test(label) && !/install/i.test(label);
const isInstallation = (label: string) => /install|mount|fitting/i.test(label);
const isPlatform = (label: string) => /platform|service fee|adx fee/i.test(label);

/**
 * The review's lines folded into the frames' four rows: media rent, print &
 * installation, the platform fee, GST — any other fee the rates carry keeps
 * its own row — and the total the server worked out, never re-added here.
 */
export function chargesOf(review: Pick<CampaignReview, "lines" | "spotsSubtotal" | "gstAmount" | "discount" | "total" | "feesTotal">): Charges {
    const fees = new Map<string, number>();
    const others = new Map<string, number>();
    let printing = 0;
    let installation = 0;
    let platformFee = 0;
    for (const line of review.lines) {
        for (const fee of line.fees) {
            const amount = Number(fee.amount) || 0;
            fees.set(fee.label, (fees.get(fee.label) ?? 0) + amount);
            if (isInstallation(fee.label)) installation += amount;
            else if (isPrinting(fee.label)) printing += amount;
            else if (isPlatform(fee.label)) platformFee += amount;
            else others.set(fee.label, (others.get(fee.label) ?? 0) + amount);
        }
    }
    return {
        mediaRent: Number(review.spotsSubtotal) || 0,
        printing,
        installation,
        production: printing + installation,
        platformFee,
        otherFees: [...others.entries()].map(([label, amount]) => ({ label, amount })),
        gst: Number(review.gstAmount) || 0,
        discount: Number(review.discount) || 0,
        total: Number(review.total) || 0,
        fees: [...fees.entries()].map(([label, amount]) => ({ label, amount })),
    };
}

/** The cart's estimate before a campaign exists: the listing page's own rule, so the two agree. */
export function estimateCart(lines: { ratePerDay: string | null; print: boolean }[], days: number): Charges {
    const mediaRent = lines.reduce((sum, line) => sum + (Number(line.ratePerDay) || 0) * days, 0);
    const printRent = lines.filter((line) => line.print).reduce((sum, line) => sum + (Number(line.ratePerDay) || 0) * days, 0);
    const printing = Math.round(printRent * 0.4);
    const installation = Math.round(printRent * 0.2);
    const platformFee = lines.length > 0 ? 200 : 0;
    const subtotal = mediaRent + printing + installation + platformFee;
    const gst = Math.round(subtotal * 0.18);
    return { mediaRent, printing, installation, production: printing + installation, platformFee, otherFees: [], gst, discount: 0, total: Math.round(subtotal + gst), fees: [] };
}

/** The review's `missing` without the agreement lines — what the brief itself still lacks. */
export const briefMissing = (review: Pick<CampaignReview, "missing">): MissingAnswer[] =>
    review.missing.filter((item) => item.field !== "AGREEMENT_REQUIRED" && item.field !== "SIGNATURE_REQUIRED");

/** Whether the insertion order stands accepted on the version live now. */
export const insertionOrderAccepted = (review: Pick<CampaignReview, "agreements">): boolean =>
    review.agreements?.find((a) => a.kind === "INSERTION_ORDER")?.current ?? true;

/**
 * The newest artwork for a slot — a re-upload after a refusal is a new row
 * pointing at the old one, and the desk keeps what it refused.
 */
export function creativeFor(creatives: CampaignCreative[], spotId: string | null): CampaignCreative | null {
    const superseded = new Set(creatives.map((c) => c.resubmissionOfId).filter(Boolean));
    const rows = creatives.filter((c) => c.spotId === spotId && !superseded.has(c.id));
    if (rows.length === 0) return null;
    return rows.reduce((newest, row) => ((row.submittedAt ?? "") >= (newest.submittedAt ?? "") ? row : newest));
}

/** A refusal or a change request re-opens the upload; nothing else does. */
export const creativeNeedsChange = (creative: CampaignCreative | null): boolean =>
    !!creative && (creative.status === "REJECTED" || creative.status === "CHANGES_REQUESTED");

export const CREATIVE_STATUS_LABEL: Record<CreativeStatus, string> = {
    PENDING_UPLOAD: "Not uploaded",
    UPLOADED: "Uploaded",
    IN_REVIEW: "Publisher review pending",
    APPROVED: "Approved",
    REJECTED: "Rejected",
    CHANGES_REQUESTED: "Changes requested",
    AWAITING_ADVERTISER: "Awaiting your approval",
};

/** Print or digital, off what the listing says of itself: its display when the browse card is at hand, else its media type's name. */
export function isDigital(listing: { display?: string | null; mediaTypeName?: string | null; mediaTypeCategory?: string | null }): boolean {
    if (listing.display) return listing.display === "DIGITAL";
    return /digital|screen|led|dooh|video|display|kiosk/i.test(listing.mediaTypeName ?? "") || listing.mediaTypeCategory === "MEDIA";
}

/** "40×20 ft" → "40 × 20 ft"; a pixel size stays as sent. */
export const prettySize = (size: string | null | undefined): string | null => (size ? size.replace(/\s*[x×]\s*/i, " × ") : null);

export interface ArtworkRequirement {
    label: string;
    value: string;
}

/**
 * ADX's standard spec per kind of placement (frames 14 and 15). The backend
 * caps uploads at 10 MB for images and PDFs and 50 MB for video; nothing on a
 * listing states a spec of its own yet, so this is the platform's.
 */
export function artworkRequirements(kind: "print" | "digital", size: string | null): ArtworkRequirement[] {
    if (kind === "print") {
        return [
            { label: "File type", value: "PDF" },
            { label: "Maximum size", value: "10 MB" },
            { label: "Resolution", value: "300 DPI minimum" },
            { label: "Colour mode", value: "CMYK" },
            { label: "Safe area", value: "Use the publisher's template" },
        ];
    }
    const orientation = orientationOf(size);
    return [
        { label: "Dimensions", value: `${prettySize(size) ?? "As the screen"}${orientation ? ` · ${orientation}` : ""}` },
        { label: "Video", value: "MP4 · H.264 · up to 30 seconds" },
        { label: "Frame rate", value: "25 fps" },
        { label: "File size / audio", value: "Up to 50 MB · Muted" },
    ];
}

/** "Portrait" / "Landscape" / "Square" off a "1080 × 1920 px" size, or null when it says nothing. */
export function orientationOf(size: string | null | undefined): string | null {
    const match = /(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)/i.exec(size ?? "");
    if (!match) return null;
    const w = Number(match[1]);
    const h = Number(match[2]);
    if (w === h) return "Square";
    return h > w ? "Portrait" : "Landscape";
}

/** The step a draft has reached, so "Continue draft" lands where the person left off. */
export function stepOf(campaign: Pick<Campaign, "name" | "spots" | "creativePath" | "fulfilment" | "creatives" | "status">): 1 | 2 | 3 | 4 {
    if (campaign.status !== "DRAFT" && campaign.status !== "PENDING_PAYMENT") return 4;
    if (!campaign.name || /^untitled/i.test(campaign.name)) return 1;
    if (campaign.spots.length === 0) return 2;
    if (!campaign.creativePath || !campaign.fulfilment) return 3;
    return 4;
}

export const STEP_ROUTES = ["details", "spaces", "artwork", "review"] as const;

/** The billing address the backend holds is one line; the pincode rides at its end. */
export function splitBillingAddress(address: string | null | undefined): { street: string; postalCode: string } {
    const value = (address ?? "").trim();
    const match = /^(.*?)[,\s]*(\d{6})$/.exec(value);
    if (match) return { street: match[1]!.trim().replace(/,$/, ""), postalCode: match[2]! };
    return { street: value, postalCode: "" };
}

export function joinBillingAddress(street: string, postalCode: string): string {
    const s = street.trim().replace(/,\s*$/, "");
    const p = postalCode.trim();
    return p ? `${s}, ${p}` : s;
}

export const GSTIN_PATTERN = /^\d{2}[A-Z]{5}\d{4}[A-Z]\d[Z][A-Z\d]$/;

export const INDIAN_STATES = [
    "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh", "Delhi", "Goa", "Gujarat", "Haryana", "Himachal Pradesh",
    "Jharkhand", "Karnataka", "Kerala", "Madhya Pradesh", "Maharashtra", "Manipur", "Meghalaya", "Mizoram", "Nagaland", "Odisha",
    "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu", "Telangana", "Tripura", "Uttar Pradesh", "Uttarakhand", "West Bengal",
    "Andaman and Nicobar Islands", "Chandigarh", "Dadra and Nagar Haveli and Daman and Diu", "Jammu and Kashmir", "Ladakh", "Lakshadweep", "Puducherry",
];

export const GOAL_LABEL: Record<CampaignGoal, string> = { BRAND_AWARENESS: "Brand awareness", DIGITAL_LIFT: "Digital lift", LOCAL_FOOTFALL: "Local footfall" };
export const AWARENESS_LABEL: Record<AwarenessLevel, string> = { BRAND_NEW: "Brand new", ALREADY_ESTABLISHED: "Already established" };
export const PERSONA_LABEL: Record<AudiencePersona, string> = {
    B2B_DECISION_MAKERS: "B2B decision makers",
    STUDENTS_OR_GEN_Z: "Students or Gen Z",
    HIGH_INCOME_CONSUMERS: "High-income consumers",
    FAMILIES_OR_SUBURBAN: "Families or suburban",
};
export const STRATEGY_LABEL: Record<CampaignStrategy, string> = { DEFENSIVE: "Defensive", GENERAL: "General", ATTACK: "Attack" };
export const TARGETING_LABEL: Record<TargetingMethod, string> = { RADIUS: "Radius", MARKET_OR_DMA: "Market", POI_VENUE: "Venues" };
export const TRACKING_LABEL: Record<TrackingMethod, string> = {
    QR_OR_DEEPLINK: "QR codes or deep links",
    VANITY_OR_PROMO: "Vanity URL or promo code",
    LOCATION_LIFT: "Location lift",
    NONE: "No measurement",
};
export const DESIGN_STYLES = [
    { value: "BOLD_AND_ENERGETIC", label: "Bold and energetic" },
    { value: "CLEAN_AND_MINIMAL", label: "Clean and minimal" },
    { value: "WARM_AND_FRIENDLY", label: "Warm and friendly" },
];

/** "18.4 MB" / "640 KB". */
export function fileSizeLabel(bytes: number | null | undefined): string | null {
    if (!bytes || bytes <= 0) return null;
    if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${Math.round(bytes / 1024)} KB`;
}

/** "PDF" / "MP4 · H.264" / "JPEG" off a mime type or a file name. */
export function fileKindLabel(mimeType: string | null | undefined, fileName: string | null | undefined): string {
    const ext = (fileName ?? "").split(".").pop()?.toLowerCase() ?? "";
    if (mimeType === "application/pdf" || ext === "pdf") return "PDF";
    if (mimeType === "video/mp4" || ext === "mp4") return "MP4 · H.264";
    if (mimeType === "video/quicktime" || ext === "mov") return "MOV";
    if (mimeType?.startsWith("image/")) return mimeType.slice(6).toUpperCase().replace("JPEG", "JPEG");
    return ext ? ext.toUpperCase() : "File";
}
