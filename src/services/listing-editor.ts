import { api, apiFetch, ApiError } from "@/lib/api-client";

/**
 * The publisher's listing editor — DR 12 boards 08 (create & verify) and 09
 * (edit). Every read and write here is the same route the ADX app's listing
 * wizard uses (`mobile/user-app/src/features/publisher/publisher-api.ts`), so
 * a spot drafted on the web, finished on the phone and reviewed at the desk
 * is one record. Types mirror the backend payloads; the pure helpers at the
 * bottom (rates, areas, labels, catalogue filters) carry the tests.
 */

export type ListingCategory = "INDOOR" | "OUTDOOR" | "TRANSIT" | "MEDIA";
export type PricingUnit = "PER_DAY" | "PER_WEEK" | "PER_MONTH" | "PER_SQFT_PER_DAY" | "PER_SQFT_PER_MONTH";
export type RightsBasis = "OWNED" | "LEASED" | "LICENSED" | "PERMIT";
export type ContentStance = "ALLOWED" | "REQUIRES_APPROVAL" | "NOT_ALLOWED" | "PROHIBITED";
export type ListingDocumentKind = "DISPLAY_AGREEMENT" | "OWNER_NOC" | "ADDRESS_PROOF" | "MUNICIPAL_PERMIT" | "VEHICLE_RC" | "OTHER";
export type ListingStatus =
    | "UNCLAIMED"
    | "DRAFT"
    | "AWAITING_AGREEMENT"
    | "AWAITING_DOCUMENTS"
    | "PENDING_REVIEW"
    | "AWAITING_SITE_VERIFICATION"
    | "ACTIVE"
    | "SUSPENDED"
    | "REJECTED"
    | "INACTIVE"
    | string;

/* ── Catalogue (`/pricing/*`, `/listings/content-categories`) ──────────── */

export interface VenueType {
    id: string;
    name: string;
    slug: string;
    category: ListingCategory;
    description: string | null;
    subVenues: string[];
    isActive: boolean;
}

export interface MediaType {
    id: string;
    name: string;
    slug: string;
    category: ListingCategory;
    description: string | null;
    venueTypeId: string | null;
    formatGroup: string | null;
    sizeClassIds: string[];
    materialIds: string[];
}

export interface SizeClass {
    id: string;
    name: string;
    slug: string;
    widthFt: string | null;
    heightFt: string | null;
}

export interface Material {
    id: string;
    name: string;
    slug: string;
}

export interface ContentCategory {
    id: string;
    name: string;
    slug: string;
    isSensitive: boolean;
}

export interface Catalogue {
    venues: VenueType[];
    mediaTypes: MediaType[];
    sizeClasses: SizeClass[];
    materials: Material[];
    contentCategories: ContentCategory[];
}

/* ── The listing row, as the publisher's own reads return it ───────────── */

export interface ListingPhoto {
    id?: string;
    url: string;
    type: string;
    createdAt?: string;
}

export interface Listing {
    id: string;
    displayId: string | null;
    title: string;
    category: ListingCategory;
    subType: string | null;
    description: string | null;
    address: string;
    city: string | null;
    latitude: number | null;
    longitude: number | null;
    status: ListingStatus;
    ratePerDay: string | null;
    pricingUnit: PricingUnit | string;
    basePrice: string | null;
    size?: string | null;
    placement: string | null;
    widthFt: string | null;
    heightFt: string | null;
    areaSqFt: string | null;
    minBookingDays: number | null;
    availableNow: boolean;
    availableFrom: string | null;
    availableHoursFrom: string | null;
    availableHoursTo: string | null;
    peakPeriodNote: string | null;
    rateCardUrl?: string | null;
    targetAudience: string | null;
    uniqueSellingPoint: string | null;
    footfallNote: string | null;
    estimatedDailyFootfall?: number | null;
    illumination: string | null;
    facing: string | null;
    elevation?: string | null;
    visibility?: string | null;
    trafficGrade?: string | null;
    venueTypeId?: string | null;
    mediaTypeId?: string | null;
    sizeClassId?: string | null;
    materialId?: string | null;
    vehicleNumber?: string | null;
    vehicleRcVerifiedAt?: string | null;
    slotsTotal?: number;
    instantBooking?: boolean;
    photos?: ListingPhoto[];
    rejectionReason: string | null;
    submittedAt: string | null;
    publishedAt: string | null;
    rightsBasis?: RightsBasis | null;
    rightsValidUntil?: string | null;
    rightsLapsedAt?: string | null;
    verifiedAt?: string | null;
    verificationExpiresAt?: string | null;
    createdAt: string;
    updatedAt?: string;
}

/** A row of `GET /publishers/me/listings`: the listing, its photographs, and the two chips. */
export type MyListing = Listing & { photos: ListingPhoto[]; occupied: boolean; belowFloor: boolean };

export interface MyListingsPage {
    items: MyListing[];
    total: number;
    page: number;
    pageSize: number;
    counts: Record<string, number>;
}

/* ── Drafts (QR-8) ─────────────────────────────────────────────────────── */

export interface ListingDraft {
    id: string;
    displayId: string;
    category: string | null;
    title: string | null;
    stepIndex: number;
    stepKey: string | null;
    answers: Record<string, unknown>;
    createdAt: string;
    updatedAt: string;
}

export interface ListingDraftInput {
    category?: string | null;
    title?: string | null;
    stepIndex?: number;
    stepKey?: string | null;
    answers: Record<string, unknown>;
}

/* ── Documents, rights, verification (`/supply/*`) ─────────────────────── */

export interface ListingDocument {
    id: string;
    listingId: string;
    kind: ListingDocumentKind;
    url: string;
    status: "PENDING" | "VERIFIED" | "REJECTED";
    rejectionReason: string | null;
    submittedAt: string;
    reviewedAt: string | null;
    expiresAt?: string | null;
}

/* ── Pricing ───────────────────────────────────────────────────────────── */

export type IndicatorState = "NO_DATA" | "TOO_LOW" | "LOW_SIDE" | "GOOD" | "TOO_HIGH";

export interface PriceIndicator {
    state: IndicatorState;
    message: string;
    range: { low: string; high: string } | null;
    contributorCount: number;
    thin: boolean;
    tier: "VALIDATED" | "LISTED" | "PROVISIONAL" | null;
}

export interface SuggestedRateFactor {
    name: string;
    kind: "BASE_ADJUST" | "MULTIPLIER";
    value: string;
    mode: "ADVISORY" | "BINDING";
}

export interface SuggestedRateAnswer {
    listingId: string;
    currentRatePerDay: string | null;
    offer: { base: string; ratePerDay: string; compoundMultiplier: string; cappedOut: boolean; applied: SuggestedRateFactor[] };
    differs: boolean;
}

/* ── Vehicles (VH-3 / AG-4) ────────────────────────────────────────────── */

export interface VehicleRcCheck {
    vehicleNumber: string;
    via: string;
    nameMatch: number | null;
    publisherName: string | null;
    vehicle: {
        maker: string | null;
        model: string | null;
        vehicleClass: string | null;
        rcStatus: string | null;
        blacklisted: boolean | null;
        insuranceValidUntil: string | null;
        fitnessValidUntil: string | null;
        pucValidUntil: string | null;
    };
}

/* ── Audience (G7) ─────────────────────────────────────────────────────── */

export interface AudienceShare {
    label: string;
    share: number;
}

export interface ListingAudience {
    listingId: string;
    period: string;
    provider: string;
    providers: string[];
    audience: {
        footfall: { daily: number | null; byHour: number[] | null; byWeekday: number[] | null };
        demographics: { ageBands: AudienceShare[] | null; gender: AudienceShare[] | null; incomeBands: AudienceShare[] | null; affinities: AudienceShare[] | null };
        radiusM: number;
        vendors?: string[];
    } | null;
    basis: string;
    cached: boolean;
    unavailable: unknown[];
}

/* ── Location (`/geo/*`, `/app/geo/cities`) ────────────────────────────── */

export interface PlacePrediction {
    placeId: string;
    description: string;
    mainText: string;
    secondaryText: string | null;
}

export interface GeocodedPlace {
    formattedAddress: string;
    latitude: number;
    longitude: number;
    placeId: string | null;
    city: string | null;
    state: string | null;
    postalCode: string | null;
    name?: string | null;
}

export interface PickerCity {
    slug: string;
    name: string;
    state?: string | null;
    stage?: string;
    [key: string]: unknown;
}

/* ── Blocked dates (the common brief's contract) ───────────────────────── */

export interface BlockedDate {
    id: string;
    from: string;
    to: string;
    reason?: string | null;
}

/* ── Uploads ───────────────────────────────────────────────────────────── */

export type UploadPurpose = "LISTING_PHOTO" | "VERIFICATION" | "KYC" | "OTHER";

export interface UploadedFile {
    url: string;
    id: string;
}

/* ── The publisher behind the session, for the business verification ───── */

export interface PublisherProfile {
    id: string;
    displayId: string | null;
    name: string;
    mobile: string;
    email?: string | null;
    type?: string;
    address?: string | null;
    city?: string | null;
    state?: string | null;
    gstin?: string | null;
    contactName?: string | null;
    contactMobile?: string | null;
    contactEmail?: string | null;
    kycStatus: string;
    onboardingStatus?: string;
    verified?: boolean;
    [key: string]: unknown;
}

export interface PublisherKyc {
    status?: string;
    kycStatus?: string;
    businessRegCertUrl?: string | null;
    gstUrl?: string | null;
    addressProofUrl?: string | null;
    submittedAt?: string | null;
    updatedAt?: string | null;
    [key: string]: unknown;
}

/* ═══════════════════════════════════════════════════════════════════════ */
/* The service                                                             */
/* ═══════════════════════════════════════════════════════════════════════ */

const enc = encodeURIComponent;

export const listingEditorService = {
    /* Catalogue */
    catalogue: async (): Promise<Catalogue> => {
        const [venues, mediaTypes, sizeClasses, materials, contentCategories] = await Promise.all([
            api.get<VenueType[]>("/pricing/venue-types"),
            api.get<MediaType[]>("/pricing/media-types"),
            api.get<SizeClass[]>("/pricing/size-classes"),
            api.get<Material[]>("/pricing/materials"),
            api.get<ContentCategory[]>("/listings/content-categories"),
        ]);
        return { venues, mediaTypes, sizeClasses, materials, contentCategories };
    },

    /* Drafts */
    drafts: () => api.get<ListingDraft[]>("/listings/drafts"),
    saveDraft: (draft: ListingDraftInput, id: string | null) =>
        id ? api.put<ListingDraft>(`/listings/drafts/${enc(id)}`, draft) : api.post<ListingDraft>("/listings/drafts", draft),
    deleteDraft: (id: string) => api.delete<unknown>(`/listings/drafts/${enc(id)}`),

    /* The listing itself */
    create: (body: Record<string, unknown>) => api.post<Listing>("/listings", body),
    update: (listingId: string, patch: Record<string, unknown>) => api.patch<Listing>(`/listings/${enc(listingId)}`, patch),
    submit: (listingId: string) => api.post<Listing>(`/listings/${enc(listingId)}/submit`),
    contentRules: (listingId: string) => api.get<{ contentCategoryId: string; stance: ContentStance }[]>(`/listings/${enc(listingId)}/content-rules`),
    audience: (listingId: string) => api.get<ListingAudience>(`/listings/${enc(listingId)}/audience`),

    /* The publisher's own inventory (no per-id read exists: the page is searched) */
    myListings: (query: { q?: string; shelf?: string; page?: number; pageSize?: number } = {}) => {
        const params = new URLSearchParams();
        if (query.q) params.set("q", query.q);
        if (query.shelf) params.set("shelf", query.shelf);
        params.set("page", String(query.page ?? 1));
        params.set("pageSize", String(query.pageSize ?? 100));
        return api.get<MyListingsPage>(`/publishers/me/listings?${params.toString()}`);
    },
    myListing: async (listingId: string): Promise<MyListing | null> => {
        for (let page = 1; page <= 5; page += 1) {
            const answer = await listingEditorService.myListings({ page, pageSize: 100 });
            const found = answer.items.find((row) => row.id === listingId || row.displayId === listingId);
            if (found) return found;
            if (answer.items.length < 100) break;
        }
        return null;
    },

    /* Pricing */
    evaluate: (body: { venueTypeId?: string | null; mediaTypeId: string; sizeClassId: string; latitude: number; longitude: number; ratePerDay: string; city?: string | null; excludeListingId?: string }) =>
        api.post<PriceIndicator>("/pricing/evaluate", body),
    suggestedRate: (listingId: string) => api.get<SuggestedRateAnswer>(`/listings/me/${enc(listingId)}/suggested-rate`),
    acceptSuggestedRate: (listingId: string) => api.post<Listing>(`/listings/me/${enc(listingId)}/accept-suggested-rate`),

    /* Vehicles */
    checkVehicleRc: (vehicleNumber: string) => api.post<VehicleRcCheck>("/listings/vehicle-rc/check", { vehicleNumber }),
    verifyListingVehicleRc: (listingId: string, vehicleNumber?: string) =>
        api.post<{ listing: Listing; verification: { via: string; nameMatch: number | null; facts: Record<string, unknown> } }>(`/listings/${enc(listingId)}/vehicle-rc/verify`, vehicleNumber ? { vehicleNumber } : {}),

    /* Documents and rights */
    documents: (listingId: string) => api.get<ListingDocument[]>(`/supply/listings/${enc(listingId)}/documents`),
    addDocument: (listingId: string, body: { kind: ListingDocumentKind; url: string; expiresAt?: string }) =>
        api.post<ListingDocument>(`/supply/listings/${enc(listingId)}/documents`, body),
    setRights: (listingId: string, body: { basis: RightsBasis; validUntil: string | null }) =>
        api.patch<Listing>(`/supply/listings/${enc(listingId)}/rights`, body),

    /* Blocked dates */
    blockedDates: (listingId: string) => api.get<{ blocks: BlockedDate[] }>(`/listings/${enc(listingId)}/blocked-dates`),
    addBlockedDate: (listingId: string, body: { from: string; to: string; reason?: string }) => api.post<BlockedDate>(`/listings/${enc(listingId)}/blocked-dates`, body),
    removeBlockedDate: (listingId: string, blockId: string) => api.delete<BlockedDate>(`/listings/${enc(listingId)}/blocked-dates/${enc(blockId)}`),

    /* Files */
    upload: (file: File, purpose: UploadPurpose): Promise<UploadedFile> => {
        const form = new FormData();
        form.append("file", file);
        form.append("purpose", purpose);
        return apiFetch<UploadedFile>("/upload", { method: "POST", body: form });
    },

    /* Location */
    autocomplete: (input: string, session: string, near?: { latitude: number; longitude: number } | null) => {
        const params = new URLSearchParams({ input, session });
        if (near) {
            params.set("latitude", String(near.latitude));
            params.set("longitude", String(near.longitude));
        }
        return api.get<PlacePrediction[]>(`/geo/autocomplete?${params.toString()}`);
    },
    geocode: (address: string) => api.get<GeocodedPlace>(`/geo/geocode?address=${enc(address)}`),
    reverse: (latitude: number, longitude: number) => api.get<GeocodedPlace>(`/geo/reverse?latitude=${latitude}&longitude=${longitude}`),
    place: (placeId: string, session: string) => api.get<GeocodedPlace>(`/geo/places/${enc(placeId)}?session=${enc(session)}`),
    cities: (q: string) => api.get<{ items: PickerCity[]; comingSoon: PickerCity[] }>(`/app/geo/cities?q=${enc(q)}&limit=8`),

    /* The publisher, for the business verification */
    publisher: () => api.get<PublisherProfile>("/publishers/me"),
    updatePublisher: (patch: Record<string, unknown>) => api.patch<PublisherProfile>("/publishers/me", patch),
    kyc: () => api.get<PublisherKyc>("/publishers/me/kyc"),
    submitKyc: (body: Record<string, string>) => api.post<PublisherKyc>("/publishers/me/kyc", body),
};

/* ═══════════════════════════════════════════════════════════════════════ */
/* Pure helpers                                                            */
/* ═══════════════════════════════════════════════════════════════════════ */

/** The four categories, in the frame's order, with the frame's words (5204:75982). */
export const CATEGORY_OPTIONS: { id: ListingCategory; title: string; description: string; venueTitle: string; formatTitle: string }[] = [
    { id: "OUTDOOR", title: "Outdoor Ad Spots", description: "Hoardings, rooftops, bus shelters", venueTitle: "Outdoor venue", formatTitle: "Outdoor format" },
    { id: "INDOOR", title: "Indoor Ad Spots", description: "Malls, stores, offices, cinemas", venueTitle: "Indoor venue", formatTitle: "Indoor format" },
    { id: "TRANSIT", title: "Transit Ad Spots", description: "Vehicles, fleets, taxis and buses", venueTitle: "Transit venue", formatTitle: "Transit format" },
    { id: "MEDIA", title: "Media Ad Spots", description: "TV, radio, print or digital media", venueTitle: "Media outlet", formatTitle: "Media format" },
];

export function categoryLabel(category: ListingCategory | null | undefined): string {
    return CATEGORY_OPTIONS.find((c) => c.id === category)?.title ?? "—";
}

/** The five rate bases the backend keeps, with the words the price step prints. */
export const PRICING_UNITS: { id: PricingUnit; label: string; per: string; days: number | null }[] = [
    { id: "PER_DAY", label: "Per day", per: "day", days: 1 },
    { id: "PER_WEEK", label: "Per week", per: "week", days: 7 },
    { id: "PER_MONTH", label: "Per month", per: "month", days: 30 },
    { id: "PER_SQFT_PER_DAY", label: "Per sq.ft / day", per: "sq.ft / day", days: null },
    { id: "PER_SQFT_PER_MONTH", label: "Per sq.ft / month", per: "sq.ft / month", days: null },
];

export const RIGHTS_OPTIONS: { id: RightsBasis; title: string; description: string }[] = [
    { id: "OWNED", title: "I own it", description: "The land, wall or vehicle is yours" },
    { id: "LEASED", title: "On a lease", description: "Rented from the owner for a term" },
    { id: "LICENSED", title: "On a licence", description: "A display licence from the owner or operator" },
    { id: "PERMIT", title: "On a permit", description: "Municipal, highway, railway or airport authority — usually renewed each year" },
];

export const ILLUMINATION_OPTIONS = ["Non-lit", "Front-lit", "Back-lit", "Digital"];
export const FACING_OPTIONS = ["Single", "Double", "Junction", "Multi-facing"];

/** "40.00" → "40", "12.50" → "12.5" — a measurement as a person writes it. */
export function trimDecimal(value: string | null | undefined): string {
    if (value === null || value === undefined) return "";
    return value.includes(".") ? value.replace(/\.?0+$/, "") : value;
}

/** Width × height in square feet, two decimals, or null while either side is missing or not a number. */
export function areaSqFt(widthFt: string, heightFt: string): string | null {
    const w = Number(widthFt);
    const h = Number(heightFt);
    if (!widthFt.trim() || !heightFt.trim() || !Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return null;
    return (Math.round(w * h * 100) / 100).toFixed(2).replace(/\.?0+$/, "");
}

/**
 * The canonical daily rate the engine compares — derived from the
 * publisher's own unit exactly as the server derives it (`listing-pricing.ts`):
 * a week is seven days, a month thirty, and a per-square-foot rate needs the area.
 */
export function ratePerDayFrom(basePrice: string, unit: PricingUnit, area: string | null): string | null {
    const price = Number(basePrice);
    if (!/^\d+(\.\d{1,2})?$/.test(basePrice.trim()) || !Number.isFinite(price) || price <= 0) return null;
    const sqft = area ? Number(area) : null;
    let daily: number;
    switch (unit) {
        case "PER_DAY":
            daily = price;
            break;
        case "PER_WEEK":
            daily = price / 7;
            break;
        case "PER_MONTH":
            daily = price / 30;
            break;
        case "PER_SQFT_PER_DAY":
            if (!sqft) return null;
            daily = price * sqft;
            break;
        case "PER_SQFT_PER_MONTH":
            if (!sqft) return null;
            daily = (price * sqft) / 30;
            break;
        default:
            return null;
    }
    return (Math.round(daily * 100) / 100).toFixed(2);
}

/** ₹12,600 — Indian grouping, no paise. */
export function rupees(value: string | number | null | undefined): string {
    if (value === null || value === undefined || value === "") return "—";
    const n = typeof value === "number" ? value : Number(value);
    if (!Number.isFinite(n)) return "—";
    return `₹${Math.round(n).toLocaleString("en-IN")}`;
}

/** "₹12,600 / week" — the price in the publisher's own unit, or the daily rate when only that is known. */
export function rateLabel(listing: Pick<Listing, "basePrice" | "pricingUnit" | "ratePerDay">): string {
    const unit = PRICING_UNITS.find((u) => u.id === listing.pricingUnit);
    if (listing.basePrice && unit) return `${rupees(listing.basePrice)} / ${unit.per}`;
    if (listing.ratePerDay) return `${rupees(listing.ratePerDay)} / day`;
    return "Rate not set";
}

/** 12 Oct 2026 — the way the frames print a day; an ISO day or instant in, "—" for nothing. */
export function shortDate(value: string | null | undefined): string {
    if (!value) return "—";
    const d = new Date(value.length === 10 ? `${value}T00:00:00` : value);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

/** An ISO instant → YYYY-MM-DD for a date input; already a day, unchanged. */
export function isoDay(value: string | null | undefined): string {
    if (!value) return "";
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
}

/** The venues offered for a category — the active ones filed under it. */
export function offeredVenues(venues: VenueType[], category: ListingCategory | null): VenueType[] {
    return venues.filter((v) => v.isActive && (category === null || v.category === category));
}

/** The spot types offered inside the chosen venue (none, for a roadside hoarding), within the category. */
export function offeredMediaTypes(mediaTypes: MediaType[], venueTypeId: string | null, category: ListingCategory | null): MediaType[] {
    return mediaTypes.filter((m) => (m.venueTypeId ?? null) === (venueTypeId ?? null) && (category === null || m.category === category));
}

/** "Event Venues — Coffee Station Branding" → "Coffee Station Branding": the venue qualifier is noise inside the venue. */
export function shortName(name: string): string {
    const parts = name.split(" — ");
    return parts[parts.length - 1] ?? name;
}

/** The server's own rule for which spot types carry a loop: the name or its catalogue group names a screen. */
const LOOP_WORD = /digital|\bled\b|\blcd\b|(?<![\w-])screen(?![\w-])/i;
export function isDigitalMediaType(mediaType: Pick<MediaType, "name" | "formatGroup"> | null | undefined): boolean {
    if (!mediaType) return false;
    return LOOP_WORD.test(mediaType.name) || (mediaType.formatGroup !== null && LOOP_WORD.test(mediaType.formatGroup));
}

/** The size class an exact measurement already has a name for — the indicator needs one; the server mints the rest on save. */
export function matchedSizeClass(sizeClasses: SizeClass[], widthFt: string, heightFt: string): SizeClass | null {
    const w = Number(widthFt);
    const h = Number(heightFt);
    if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return null;
    return sizeClasses.find((s) => s.widthFt !== null && s.heightFt !== null && Number(s.widthFt) === w && Number(s.heightFt) === h) ?? null;
}

/** Plates are typed with spaces and in any case; the server keeps A–Z0–9 only. */
export function normalisePlate(value: string): string {
    return value.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/**
 * The venue proof a desk reviewer reads before an agent is sent out — which
 * kinds depends on the category, as the app's flow config lists them.
 */
export interface DocumentSlotSpec {
    key: string;
    kind: ListingDocumentKind;
    title: string;
    description: string;
    required: boolean;
    /** The second button beside "Browse files" on a transit paper, when the frame draws one. */
    waiver?: "Not applicable" | "I am the owner";
    /** The rate card is also the listing's `rateCardUrl`. */
    rateCard?: boolean;
}

export function documentSlotsFor(category: ListingCategory | null): DocumentSlotSpec[] {
    if (category === "TRANSIT") {
        return [
            { key: "transitRc", kind: "VEHICLE_RC", title: "Vehicle Registration Card (RC)", description: "Front + back · Owner name must match publisher", required: true },
            { key: "transitDl", kind: "OTHER", title: "Driving Licence (primary driver)", description: "Front + back · Valid + appropriate class (LMV/HMV)", required: true },
            { key: "transitInsurance", kind: "OTHER", title: "Insurance Certificate", description: "Comprehensive or third-party", required: true },
            { key: "transitPermit", kind: "MUNICIPAL_PERMIT", title: "Commercial Vehicle Permit", description: "AITP / state permit / route permit (commercial only)", required: true, waiver: "Not applicable" },
            { key: "transitFitness", kind: "OTHER", title: "Fitness Certificate", description: "Issued by RTO for older or commercial vehicles.", required: true, waiver: "Not applicable" },
            { key: "transitNoc", kind: "OWNER_NOC", title: "NOC from owner", description: "If publisher is not registered owner · Template available", required: true, waiver: "I am the owner" },
        ];
    }
    if (category === "MEDIA") {
        return [
            { key: "mediaKit", kind: "OTHER", title: "Media Kit (PDF)", description: "Audience, reach, and case studies. ≤6 months old.", required: true },
            { key: "mediaRate", kind: "OTHER", title: "Current Rate Card", description: "All sizes/durations + time-bands + position premiums", required: true, rateCard: true },
            { key: "mediaReach", kind: "OTHER", title: "Circulation / Reach Certificate", description: "Latest ABC, BARC, RAM, or GA report.", required: true },
            { key: "mediaSample", kind: "OTHER", title: "Sample / Proof of Content", description: "Latest issue, programming schedule, or sample show", required: true },
            { key: "mediaBusiness", kind: "DISPLAY_AGREEMENT", title: "Business Registration & License", description: "License, GST, PAN, or incorporation certificate.", required: true },
            { key: "mediaPolicy", kind: "OTHER", title: "Advertising Policy Document", description: "Content guidelines and approval process", required: false },
        ];
    }
    return [
        { key: "ownerNoc", kind: "OWNER_NOC", title: "Owner NOC", description: "Owner / RWA / authority approval when the publisher is not the venue owner.", required: false },
        { key: "addressProof", kind: "ADDRESS_PROOF", title: "Address proof", description: "Recent utility bill or rent receipt matching the venue address.", required: false },
        { key: "displayAgreement", kind: "DISPLAY_AGREEMENT", title: "Display agreement", description: "Signed display agreement, lease, deed or property tax receipt.", required: false },
        ...(category === "OUTDOOR" ? [{ key: "municipalPermit", kind: "MUNICIPAL_PERMIT" as const, title: "Municipal permit", description: "The civic or highway authority permit for this site.", required: false }] : []),
    ];
}

/** The document kinds whose paper carries the rights term (QR-24). */
export const RIGHTS_PAPERS: ReadonlySet<ListingDocumentKind> = new Set(["DISPLAY_AGREEMENT", "MUNICIPAL_PERMIT", "VEHICLE_RC"]);

/**
 * Where a listing stands, in the words of the status frames (5204:81881,
 * 5204:82267, 5204:82435): which of the three checks is on, whether ADX has
 * asked for changes, and the chip the overview prints.
 */
export type ReviewStage = "DOCUMENT_REVIEW" | "FIELD_VERIFICATION" | "FINAL_APPROVAL" | "LIVE" | "CHANGES_REQUESTED" | "REJECTED" | "DRAFT" | "OFF_MARKET";

export function reviewStageOf(listing: Pick<Listing, "status" | "rejectionReason" | "submittedAt">): ReviewStage {
    switch (listing.status) {
        case "ACTIVE":
            return "LIVE";
        case "REJECTED":
            return "REJECTED";
        case "PENDING_REVIEW":
        case "AWAITING_DOCUMENTS":
        case "AWAITING_AGREEMENT":
            return "DOCUMENT_REVIEW";
        case "AWAITING_SITE_VERIFICATION":
            return "FIELD_VERIFICATION";
        case "SUSPENDED":
        case "INACTIVE":
            return "OFF_MARKET";
        case "DRAFT":
        default:
            return listing.rejectionReason ? "CHANGES_REQUESTED" : "DRAFT";
    }
}

export function stageLabel(stage: ReviewStage): string {
    return {
        DOCUMENT_REVIEW: "Document review",
        FIELD_VERIFICATION: "Field verification",
        FINAL_APPROVAL: "Final approval",
        LIVE: "Live for booking",
        CHANGES_REQUESTED: "Updates requested",
        REJECTED: "Not approved",
        DRAFT: "Draft",
        OFF_MARKET: "Off the market",
    }[stage];
}

/** The chip on the overview card: Live, In review, Draft, Updates requested, … */
export function statusChip(listing: Pick<Listing, "status" | "rejectionReason" | "submittedAt">): { label: string; tone: "success" | "warning" | "danger" | "neutral" } {
    const stage = reviewStageOf(listing);
    if (stage === "LIVE") return { label: "Live", tone: "success" };
    if (stage === "DOCUMENT_REVIEW" || stage === "FIELD_VERIFICATION" || stage === "FINAL_APPROVAL") return { label: "In review", tone: "warning" };
    if (stage === "CHANGES_REQUESTED") return { label: "Updates requested", tone: "warning" };
    if (stage === "REJECTED") return { label: "Not approved", tone: "danger" };
    if (stage === "OFF_MARKET") return { label: "Paused", tone: "neutral" };
    return { label: "Draft", tone: "neutral" };
}

/**
 * ADX's send-back reason, split into the requests the frame lists one by
 * one (5204:82267): numbered lines, bullet lines, or sentences. Each item is
 * classified by what it asks for, which decides the control the fixes page
 * draws for it (5204:82071): a photo, a document, or a written clarification.
 */
export type RequestedUpdate = { index: number; title: string; detail: string; kind: "PHOTO" | "DOCUMENT" | "ADDRESS" | "OTHER" };

export function requestedUpdatesOf(reason: string | null | undefined): RequestedUpdate[] {
    if (!reason || !reason.trim()) return [];
    const raw = reason
        .split(/\r?\n|(?<=[.!?])\s+(?=[A-Z0-9])|;\s+/)
        .map((line) => line.replace(/^\s*(?:\d+[.)]|[-•*])\s*/, "").trim())
        .filter(Boolean);
    return raw.map((line, i) => {
        const lower = line.toLowerCase();
        const paper = /noc|permission|permit|agreement|licence|license|certificate|proof|\brc\b|insurance|bill|receipt/.test(lower);
        const kind: RequestedUpdate["kind"] = /photo|picture|image|angle|shot/.test(lower)
            ? "PHOTO"
            : /clarif|explain|mismatch|differ/.test(lower) || (/address|location|\bpin\b/.test(lower) && !paper)
              ? "ADDRESS"
              : paper || /document/.test(lower)
                ? "DOCUMENT"
                : "OTHER";
        const [head, ...rest] = line.split(/[:—–-]\s+/);
        const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
        const title = rest.length && head.length <= 60 ? cap(head.trim()) : line.length <= 60 ? cap(line) : `${cap(line.slice(0, 57).trim())}…`;
        const detail = rest.length && head.length <= 60 ? cap(rest.join(" ").trim()) : cap(line);
        return { index: i + 1, title, detail, kind };
    });
}

/** "one", "two", "three" … for "Three updates requested". */
export function countWord(n: number): string {
    const words = ["No", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten"];
    return words[n] ?? String(n);
}

/** True for the 404 the two contracts still being built answer, so a control can say "not available yet". */
export function isNotBuilt(caught: unknown): boolean {
    return caught instanceof ApiError && caught.status === 404;
}

/** The message a screen shows, or the field-level sentence when the backend flattened one. */
export function problemOf(caught: unknown, fallback: string): string {
    if (!(caught instanceof ApiError)) return fallback;
    const fields = caught.fieldErrors;
    const first = Object.entries(fields)[0];
    if (first && first[1][0]) return `${first[0]}: ${first[1][0]}`;
    return caught.message || fallback;
}
