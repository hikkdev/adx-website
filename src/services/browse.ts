import { api } from "@/lib/api-client";

/**
 * Discovery over `GET /listings/browse` — the same read the ADX app's
 * advertiser home uses, so a space, its price, its photographs and its
 * availability are one record on the phone, on the web and on the console's
 * listings desk. Types mirror the app's `discover-api.ts`.
 */
export type BrowseCategory = "INDOOR" | "OUTDOOR" | "TRANSIT" | "MEDIA";
export type BrowseDisplay = "DIGITAL" | "STATIC";
export type BrowseSort = "NEWEST" | "PRICE_ASC" | "PRICE_DESC" | "NAME" | "RATING";

export interface BrowseCard {
    id: string;
    displayId: string | null;
    title: string;
    category: BrowseCategory;
    subType: string | null;
    address: string;
    city: string | null;
    latitude: number | null;
    longitude: number | null;
    /** Money as a decimal string, per day. */
    ratePerDay: string | null;
    pricingUnit: string;
    basePrice: string | null;
    size: string | null;
    photos: string[];
    description: string | null;
    illumination: string | null;
    facing: string | null;
    placement: string | null;
    visibility: string | null;
    estimatedDailyFootfall: number | null;
    availableNow: boolean;
    availableFrom: string | null;
    availableHoursFrom: string | null;
    availableHoursTo: string | null;
    peakPeriodNote: string | null;
    targetAudience: string | null;
    uniqueSellingPoint: string | null;
    publisherName: string | null;
    /** The publisher's id, for "other spaces by this publisher" through `publisherId` on the browse. */
    publisherId?: string | null;
    publisherVerified?: boolean;
    publisherAvatarUrl?: string | null;
    distanceM: number | null;
    ratingAvg: string | null;
    reviewCount: number;
    saved: boolean;
    instantBooking: boolean;
    shareUrl: string | null;
    display: BrowseDisplay;
    slotsTotal: number;
    slotsLeft: number;
}

export interface BrowseQuery {
    q?: string;
    city?: string;
    category?: BrowseCategory | null;
    venueTypeId?: string | null;
    publisherId?: string | null;
    display?: BrowseDisplay | null;
    minRate?: string;
    maxRate?: string;
    from?: string;
    to?: string;
    minFootfall?: number | null;
    illuminated?: boolean;
    instant?: boolean;
    near?: { latitude: number; longitude: number; radiusKm?: number } | null;
    sort?: BrowseSort;
    page?: number;
    pageSize?: number;
}

export interface BrowsePage {
    items: BrowseCard[];
    total: number;
    page: number;
    pageSize: number;
    comingSoon?: { city: string; slug: string; stage: string };
}

export interface ListingReview {
    id: string;
    rating: number;
    note: string | null;
    createdAt: string;
}

export interface ListingReviewPage {
    items: ListingReview[];
    total: number;
    page: number;
    pageSize: number;
}

export interface CategoryTile {
    category: BrowseCategory;
    count: number;
    photoUrl: string | null;
}

export interface VenueTile {
    venueTypeId: string;
    slug: string;
    name: string;
    label: string;
    category: BrowseCategory;
    count: number;
    photoUrl: string | null;
}

export const CATEGORY_LABEL: Record<BrowseCategory, string> = {
    OUTDOOR: "Billboards",
    INDOOR: "Indoor spaces",
    TRANSIT: "Transit",
    MEDIA: "Media",
};

/** The chip on a card: the sub-type when the publisher named one, else the category. */
export function formatChip(card: Pick<BrowseCard, "category" | "subType" | "display">): string {
    if (card.subType) return card.subType.replace(/_/g, " ").toUpperCase();
    if (card.display === "DIGITAL") return "DIGITAL";
    return { OUTDOOR: "BILLBOARD", INDOOR: "INDOOR", TRANSIT: "TRANSIT", MEDIA: "MEDIA" }[card.category];
}

/** The query string of a browse read, key for key as the app sends it. */
export function browseSearch(query: BrowseQuery): string {
    const params = new URLSearchParams();
    const put = (key: string, value: string | number | boolean | null | undefined) => {
        if (value === undefined || value === null || value === "") return;
        params.set(key, String(value));
    };
    put("q", query.q);
    put("city", query.city);
    put("category", query.category);
    put("venueTypeId", query.venueTypeId);
    put("publisherId", query.publisherId);
    put("display", query.display);
    put("minRate", query.minRate);
    put("maxRate", query.maxRate);
    put("from", query.from);
    put("to", query.to);
    put("minFootfall", query.minFootfall);
    if (query.illuminated) put("illuminated", "true");
    if (query.instant) put("instant", "true");
    if (query.near) {
        put("lat", query.near.latitude);
        put("lng", query.near.longitude);
        put("radiusKm", query.near.radiusKm);
    }
    put("sort", query.sort);
    put("page", query.page);
    put("pageSize", query.pageSize);
    const search = params.toString();
    return search ? `?${search}` : "";
}

/** The place part of a categories or venues read. */
export function placeSearch(place: Pick<BrowseQuery, "city" | "near">): string {
    const params = new URLSearchParams();
    if (place.city) params.set("city", place.city);
    if (place.near) {
        params.set("lat", String(place.near.latitude));
        params.set("lng", String(place.near.longitude));
        if (place.near.radiusKm !== undefined) params.set("radiusKm", String(place.near.radiusKm));
    }
    const search = params.toString();
    return search ? `?${search}` : "";
}

/** ₹3,000 — Indian grouping, no paise on a rate. */
export function rupees(value: string | number | null | undefined): string {
    if (value === null || value === undefined || value === "") return "—";
    const n = typeof value === "number" ? value : Number(value);
    if (!Number.isFinite(n)) return "—";
    return `₹${Math.round(n).toLocaleString("en-IN")}`;
}

/** The weekly figure the DR 12 cards print, off the per-day rate. */
export function perWeek(ratePerDay: string | null): string {
    if (!ratePerDay) return "Rate on request";
    return `${rupees(Number(ratePerDay) * 7)} / week`;
}

export const browseService = {
    browse: (query: BrowseQuery = {}) => api.get<BrowsePage>(`/listings/browse${browseSearch(query)}`),
    categories: (place: Pick<BrowseQuery, "city" | "near"> = {}) =>
        api.get<{ items: CategoryTile[]; total: number }>(`/listings/browse/categories${placeSearch(place)}`),
    venues: (place: Pick<BrowseQuery, "city" | "near"> = {}) =>
        api.get<{ items: VenueTile[]; total: number }>(`/listings/browse/venues${placeSearch(place)}`),
    listing: (listingId: string) => api.get<BrowseCard>(`/listings/browse/${encodeURIComponent(listingId)}`),
    similar: (listingId: string) => api.get<BrowseCard[]>(`/listings/${encodeURIComponent(listingId)}/similar`, { anonymous: true }),
    reviews: (listingId: string, page = 1, pageSize = 20) =>
        api.get<ListingReviewPage>(`/listings/browse/${encodeURIComponent(listingId)}/reviews?page=${page}&pageSize=${pageSize}`),
    save: (listingId: string) => api.put<BrowseCard>(`/listings/browse/${encodeURIComponent(listingId)}/save`),
    unsave: (listingId: string) => api.delete<{ saved: boolean }>(`/listings/browse/${encodeURIComponent(listingId)}/save`),
    saved: (advertiserId: string, page = 1, pageSize = 20) =>
        api.get<BrowsePage>(`/advertisers/${encodeURIComponent(advertiserId)}/saved?page=${page}&pageSize=${pageSize}`),
};
