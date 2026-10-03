import { api, ApiError } from "@/lib/api-client";
import { pageHref } from "@/lib/site-routes";
import { siteCodeOf, siteLabelOf, VISIBILITY_RANGES } from "@/services/listing-site-questions";

/**
 * Discovery over `GET /listings/browse` — the same read the ADX app's
 * advertiser home uses, so a space, its price, its photographs and its
 * availability are one record on the phone, on the web and on the console's
 * listings desk. Types mirror the app's `discover-api.ts`; the labels, the
 * filter options and the sort orders mirror its filter drawer, sort sheet,
 * search screen and listing page, so the web asks the backend the same
 * questions and says the answers in the same words.
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
    /** E11-2: the public spot page the server mints (`PUBLIC_WEB_URL/s/:displayId`); null while the spot has no display id. */
    shareUrl: string | null;
    display: BrowseDisplay;
    slotsTotal: number;
    /** AV-1: the slots left on the busiest single day of the asked window (today when none was asked). */
    slotsLeft: number;
    /** AV-1: of the window's days, how many have at least one slot free. */
    freeDays?: number;
    /** AV-1: how many days the window has — 1 on an undated browse. */
    windowDays?: number;
    /** LM-1: a paid "sponsored listing" put first on this read — labelled "Sponsored" wherever it is drawn. */
    sponsored?: boolean;
    boostId?: string;
}

export interface BrowseQuery {
    q?: string;
    city?: string;
    category?: BrowseCategory | null;
    venueTypeId?: string | null;
    publisherId?: string | null;
    /** SIM-1: the spaces like one listing (its id or LST- display id) — "View all similar listings". */
    similarTo?: string | null;
    display?: BrowseDisplay | null;
    minRate?: string;
    maxRate?: string;
    /** ISO datetime — use `dayStart` on a picked date, as the app's drawer does. */
    from?: string;
    /** ISO datetime — use `dayEnd` on a picked date. */
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
    /** SIM-1: the listing a "spaces like" page is anchored on. */
    similarTo?: { id: string; displayId: string | null; title: string };
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

/** The platform's four categories, in the order the app's All Categories grid names them. */
export const BROWSE_CATEGORIES: BrowseCategory[] = ["OUTDOOR", "INDOOR", "TRANSIT", "MEDIA"];

export function isBrowseCategory(value: unknown): value is BrowseCategory {
    return typeof value === "string" && (BROWSE_CATEGORIES as string[]).includes(value);
}

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
    put("similarTo", query.similarTo);
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

/* ------------------------------------------------------------------ */
/* Money and dates                                                     */
/* ------------------------------------------------------------------ */

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

/** "₹1,800 / day" — the rate as the app prints it; the listing's own unit. */
export function perDay(ratePerDay: string | null): string {
    if (!ratePerDay) return "Rate on request";
    return `${rupees(ratePerDay)} / day`;
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDay(value: string | null | undefined): value is string {
    return typeof value === "string" && ISO_DAY.test(value) && !Number.isNaN(new Date(`${value}T00:00:00Z`).getTime());
}

/**
 * The browse takes `from`/`to` as ISO datetimes (a bare date is refused 400);
 * the app's drawer sends the first instant of the start day and the last of
 * the end day. Anything that is not a YYYY-MM-DD is nothing.
 */
export function dayStart(day: string | null | undefined): string | undefined {
    return isIsoDay(day) ? `${day}T00:00:00.000Z` : undefined;
}

export function dayEnd(day: string | null | undefined): string | undefined {
    return isIsoDay(day) ? `${day}T23:59:59.999Z` : undefined;
}

/* ------------------------------------------------------------------ */
/* The drawer's options — the app's filter drawer and sort sheet       */
/* ------------------------------------------------------------------ */

/** The sort sheet's rows (DR 06, 4420:31), in its order and its words. `NEWEST` is the browse's default. */
export const BROWSE_SORTS: { value: BrowseSort; label: string }[] = [
    { value: "NEWEST", label: "Newest first" },
    { value: "RATING", label: "Top rated" },
    { value: "PRICE_ASC", label: "Price, low to high" },
    { value: "PRICE_DESC", label: "Price, high to low" },
    { value: "NAME", label: "Name, A to Z" },
];

export function isBrowseSort(value: unknown): value is BrowseSort {
    return typeof value === "string" && BROWSE_SORTS.some((s) => s.value === value);
}

export function sortLabel(sort: BrowseSort): string {
    return BROWSE_SORTS.find((option) => option.value === sort)?.label ?? sort;
}

/** "Daily footfall" — the drawer's reach chips. */
export const FOOTFALL_OPTIONS: { value: number | null; label: string }[] = [
    { value: null, label: "Any" },
    { value: 25_000, label: "25K+" },
    { value: 50_000, label: "50K+" },
    { value: 100_000, label: "1L+" },
];

/** The browse chips' price bands — per day, as the app's Price chip offers them. */
export const PRICE_BANDS: { id: string; label: string; minRate?: string; maxRate?: string }[] = [
    { id: "ANY", label: "Any price" },
    { id: "UNDER_5K", label: "Under ₹5K", maxRate: "5000" },
    { id: "5K_15K", label: "₹5K – ₹15K", minRate: "5000", maxRate: "15000" },
    { id: "15K_50K", label: "₹15K – ₹50K", minRate: "15000", maxRate: "50000" },
    { id: "50K_UP", label: "₹50K+", minRate: "50000" },
];

/** Which band a min/max pair is; "CUSTOM" for a range typed by hand. */
export function priceBandOf(range: { minRate?: string; maxRate?: string }): string {
    const min = range.minRate || undefined;
    const max = range.maxRate || undefined;
    return PRICE_BANDS.find((band) => band.minRate === min && band.maxRate === max)?.id ?? "CUSTOM";
}

/** The line the app prints when the instant-booking flag is off, in place of the switch. */
export const INSTANT_OFF_REASON = "Instant booking is not switched on yet, so every booking waits for the publisher.";

/* ------------------------------------------------------------------ */
/* Categories and venues                                               */
/* ------------------------------------------------------------------ */

/** The category read's rows, known categories only, counts never below zero, in the server's order. */
export function categoryTiles(read: { items: CategoryTile[] }): CategoryTile[] {
    return read.items.filter((row) => isBrowseCategory(row.category)).map((row) => ({ category: row.category, count: Math.max(0, row.count ?? 0), photoUrl: row.photoUrl ?? null }));
}

/** QR-20: how many venues a strip draws. */
export const STRIP_VENUES = 16;

/** The venues a strip draws: every counted one first, then the rest in the server's order, capped. */
export function stripVenues(venues: VenueTile[], limit = STRIP_VENUES): VenueTile[] {
    const counted = venues.filter((v) => v.count > 0);
    const rest = venues.filter((v) => v.count <= 0);
    return [...counted, ...rest].slice(0, limit);
}

/**
 * The strip laid out as a two-row mosaic (the owner, 27 Sep 2026: "double
 * stack" — the app's QR-21 mosaic): the All door first, one tall tile over
 * both rows; then each category a wide tile (two columns) over two of its
 * own sub-categories; a category with none to show stands tall on its own;
 * then the remaining sub-categories two to a column. Every placement is
 * explicit — column and row — so an odd count never shifts the next block.
 */
export type MosaicPlacement =
    | { kind: "all"; column: number; row: "both"; span: 1 }
    | { kind: "category"; tile: CategoryTile; column: number; row: 1 | "both"; span: 1 | 2 }
    | { kind: "venue"; tile: VenueTile; column: number; row: 1 | 2; span: 1 };

export function stripMosaic(categories: CategoryTile[], venues: VenueTile[]): { placements: MosaicPlacement[]; columns: number } {
    const strip = stripVenues(venues);
    const used = new Set<string>();
    const placements: MosaicPlacement[] = [{ kind: "all", column: 1, row: "both", span: 1 }];
    let column = 2;
    for (const tile of categories) {
        const own = strip.filter((venue) => venue.category === tile.category && !used.has(venue.venueTypeId)).slice(0, 2);
        own.forEach((venue) => used.add(venue.venueTypeId));
        if (own.length === 0) {
            placements.push({ kind: "category", tile, column, row: "both", span: 1 });
            column += 1;
            continue;
        }
        placements.push({ kind: "category", tile, column, row: 1, span: 2 });
        own.forEach((venue, index) => placements.push({ kind: "venue", tile: venue, column: column + index, row: 2, span: 1 }));
        column += 2;
    }
    const rest = strip.filter((venue) => !used.has(venue.venueTypeId));
    for (let index = 0; index < rest.length; index += 2) {
        placements.push({ kind: "venue", tile: rest[index]!, column, row: 1, span: 1 });
        const second = rest[index + 1];
        if (second) placements.push({ kind: "venue", tile: second, column, row: 2, span: 1 });
        column += 1;
    }
    return { placements, columns: column - 1 };
}

/**
 * The Explore link for a tile in a place: `/spaces?city=…&category=…` or,
 * around a point, `lat`/`lng`/`radius` — the keys Explore's URL reads.
 */
export function spacesHref(
    facets: { category?: string | null; venueTypeId?: string | null; display?: string | null } = {},
    place: { city?: string | null; near?: { latitude: number; longitude: number; radiusKm?: number } | null } = {}
): string {
    const params = new URLSearchParams();
    if (place.near) {
        params.set("lat", String(place.near.latitude));
        params.set("lng", String(place.near.longitude));
        if (place.near.radiusKm !== undefined) params.set("radius", String(place.near.radiusKm));
    } else if (place.city) params.set("city", place.city);
    if (facets.category) params.set("category", facets.category);
    if (facets.venueTypeId) params.set("venueTypeId", facets.venueTypeId);
    if (facets.display) params.set("display", facets.display);
    const search = params.toString();
    // PB-1: the Explore page's address is the console's to change — read it from the route table (seeded `/spaces` until one answers).
    const explore = pageHref("explore");
    return search ? `${explore}?${search}` : explore;
}

/** "8 spaces", "1 space", "None yet" — a tile's count, as the app's grid prints it. */
export function spacesCount(count: number): string {
    if (count <= 0) return "None yet";
    return `${count.toLocaleString("en-IN")} space${count === 1 ? "" : "s"}`;
}

/**
 * The browse's heading, as the app's browse names it: the publisher, else
 * the venue, else the category, else the query in quotes, else all spaces.
 */
/** SIM-1: the listing page's "View all similar listings" — the same rule as its row, paged. */
export function similarHref(card: Pick<BrowseCard, "id" | "displayId">): string {
    return `/spaces?similarTo=${encodeURIComponent(card.displayId ?? card.id)}`;
}

export function browseHeading(input: { publisher?: string | null; venue?: string | null; category?: BrowseCategory | null; q?: string | null }, fallback = "Ad spaces"): string {
    if (input.publisher) return input.publisher;
    if (input.venue) return input.venue;
    if (input.category) return CATEGORY_LABEL[input.category];
    if (input.q) return `“${input.q}”`;
    return fallback;
}

/* ------------------------------------------------------------------ */
/* The card and the listing page                                       */
/* ------------------------------------------------------------------ */

/** "6 slots left", "1 slot left", "Booked" — and null on a static wall, which has no loop. */
export function slotsLabel(card: Pick<BrowseCard, "display" | "slotsLeft">): string | null {
    if (card.display !== "DIGITAL") return null;
    const left = Math.max(0, card.slotsLeft ?? 0);
    if (left === 0) return "Booked";
    return `${left} slot${left === 1 ? "" : "s"} left`;
}

/* ------------------------------------------------------------------ */
/* AV-1 — availability by the day                                      */
/* ------------------------------------------------------------------ */

/**
 * The owner (27 Sep 2026): what an advertiser sees when some dates of a
 * space are booked and the rest are free. Slots are counted per day — a
 * static wall has one, a digital screen sells a share of its loop all day —
 * so a day is free, partly booked (a screen with some of its loop sold),
 * booked, or blocked by the publisher. There are no time-of-day slots.
 */
export interface AvailabilityDay {
    date: string;
    held: number;
    left: number;
    blocked: boolean;
}

/** `GET /listings/browse/:listingId/availability` — counts only, never who booked. */
export interface ListingAvailability {
    listingId: string;
    slotsTotal: number;
    from: string;
    to: string;
    days: AvailabilityDay[];
    /** The first day in the range with room for `quantity`; null when none. */
    nextFreeDate: string | null;
    /** Asked with a `length`: the earliest run of that many days, all with room for `quantity`. */
    nextFit: { from: string; to: string } | null;
    freeDays: number;
}

export interface AvailabilityQuery {
    from?: string;
    to?: string;
    length?: number;
    quantity?: number;
}

/** The most days one availability read answers. */
export const AVAILABILITY_MAX_DAYS = 186;

export function availabilitySearch(query: AvailabilityQuery): string {
    const params = new URLSearchParams();
    if (isIsoDay(query.from)) params.set("from", query.from);
    if (isIsoDay(query.to)) params.set("to", query.to);
    if (query.length && query.length > 0) params.set("length", String(Math.min(366, Math.round(query.length))));
    if (query.quantity && query.quantity > 0) params.set("quantity", String(Math.min(100, Math.round(query.quantity))));
    const search = params.toString();
    return search ? `?${search}` : "";
}

const DAY = 86_400_000;
const SHORT_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const LONG_MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function utcMs(iso: string): number {
    return Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));
}

function isoOf(ms: number): string {
    return new Date(ms).toISOString().slice(0, 10);
}

/** Today as the backend counts days — UTC. */
export function utcToday(now: Date = new Date()): string {
    return now.toISOString().slice(0, 10);
}

export function addDays(iso: string, days: number): string {
    return isoOf(utcMs(iso) + days * DAY);
}

/** Whole days from `from` to `to`, both ends included; 0 when the end comes first. */
export function spanDays(from: string, to: string): number {
    if (!isIsoDay(from) || !isIsoDay(to) || to < from) return 0;
    return Math.round((utcMs(to) - utcMs(from)) / DAY) + 1;
}

/** "11 Oct" */
export function shortDate(iso: string): string {
    return `${Number(iso.slice(8, 10))} ${SHORT_MONTHS[Number(iso.slice(5, 7)) - 1]}`;
}

/** "Sat 11 Oct" */
export function weekdayDate(iso: string): string {
    return `${WEEKDAYS[new Date(utcMs(iso)).getUTCDay()]} ${shortDate(iso)}`;
}

/** "16–22 Oct", "28 Oct – 3 Nov", "28 Dec 2026 – 3 Jan 2027". */
export function dateSpan(from: string, to: string): string {
    if (from === to) return shortDate(from);
    const [fy, fm] = [from.slice(0, 4), from.slice(5, 7)];
    const [ty, tm] = [to.slice(0, 4), to.slice(5, 7)];
    if (fy !== ty) return `${shortDate(from)} ${fy} – ${shortDate(to)} ${ty}`;
    if (fm !== tm) return `${shortDate(from)} – ${shortDate(to)}`;
    return `${Number(from.slice(8, 10))}–${shortDate(to)}`;
}

/** "October 2026" off any day of the month. */
export function monthLabel(iso: string): string {
    return `${LONG_MONTHS[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;
}

/** The first of the month `offset` months from the month of `iso`. */
export function monthStart(iso: string, offset = 0): string {
    const d = new Date(Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1 + offset, 1));
    return isoOf(d.getTime());
}

export function monthEnd(iso: string): string {
    return addDays(monthStart(iso, 1), -1);
}

/** A month as weeks, Monday first; the days before the 1st and after the last are null. */
export function monthWeeks(iso: string): (string | null)[][] {
    const first = monthStart(iso);
    const last = monthEnd(iso);
    const lead = (new Date(utcMs(first)).getUTCDay() + 6) % 7;
    const cells: (string | null)[] = Array.from({ length: lead }, () => null);
    for (let day = first; day <= last; day = addDays(day, 1)) cells.push(day);
    while (cells.length % 7 !== 0) cells.push(null);
    const weeks: (string | null)[][] = [];
    for (let index = 0; index < cells.length; index += 7) weeks.push(cells.slice(index, index + 7));
    return weeks;
}

export type DayState = "free" | "partly" | "booked" | "blocked" | "past";

/**
 * A day of the calendar: blocked when the publisher closed it; booked when
 * no slot is left; free when every slot is; partly booked in between — which
 * only a digital screen, with more than one slot in its loop, can be.
 */
export function dayState(day: Pick<AvailabilityDay, "left" | "blocked">, slotsTotal: number): Exclude<DayState, "past"> {
    if (day.blocked) return "blocked";
    if (day.left <= 0) return "booked";
    if (day.left >= slotsTotal) return "free";
    return "partly";
}

export const DAY_STATE_LABEL: Record<DayState, string> = {
    free: "Free",
    partly: "Partly booked",
    booked: "Booked",
    blocked: "Blocked by the publisher",
    past: "Past",
};

/** What one day says on hover, focus or tap: "Partly booked · 4 of 6 slots left". */
export function dayDetail(day: Pick<AvailabilityDay, "left" | "blocked">, slotsTotal: number): string {
    const state = dayState(day, slotsTotal);
    if (slotsTotal <= 1 || state === "blocked") return DAY_STATE_LABEL[state];
    return `${DAY_STATE_LABEL[state]} · ${Math.max(0, day.left)} of ${slotsTotal} slots left`;
}

/** "Free today", "Next free from 11 Oct", or that nothing is free in the range read. */
export function nextFreeLine(availability: Pick<ListingAvailability, "nextFreeDate" | "from" | "to">, today: string): string {
    if (!availability.nextFreeDate) return `No free day until ${shortDate(availability.to)}`;
    if (availability.nextFreeDate <= today) return "Free today";
    return `Next free from ${shortDate(availability.nextFreeDate)}`;
}

/**
 * Whether every day from `from` to `to` has room for `quantity`; null when
 * the read does not cover all of them (or the range is not a range).
 */
export function datesFit(days: readonly AvailabilityDay[], from: string, to: string, quantity = 1): boolean | null {
    const span = spanDays(from, to);
    if (span === 0) return null;
    const inRange = days.filter((day) => day.date >= from && day.date <= to);
    if (inRange.length < span) return null;
    return inRange.every((day) => !day.blocked && day.left >= quantity);
}

/** "Free for 7 days from 16 Oct: 16–22 Oct" off `nextFit`; null when nothing fits. */
export function fitLine(nextFit: ListingAvailability["nextFit"]): string | null {
    if (!nextFit) return null;
    const days = spanDays(nextFit.from, nextFit.to);
    return `Free for ${days} day${days === 1 ? "" : "s"} from ${shortDate(nextFit.from)}: ${dateSpan(nextFit.from, nextFit.to)}`;
}

/**
 * The availability line on a card. On a dated browse (a window of more than
 * a day, or dates in the URL): a static wall says "Booked on these dates"
 * or "Partly booked · 21 of 31 days free", and nothing when it is free on
 * all of them; a screen keeps its "n slots left" / "Booked" and adds the
 * free days when only some have room. Undated, only the screen's slots.
 */
export function cardAvailability(
    card: Pick<BrowseCard, "display" | "slotsLeft" | "freeDays" | "windowDays">,
    dated = false
): { text: string; tone: "free" | "partly" | "booked" } | null {
    const windowDays = card.windowDays ?? 1;
    const hasDates = dated || windowDays > 1;
    const left = Math.max(0, card.slotsLeft ?? 0);
    const freeDays = Math.max(0, Math.min(card.freeDays ?? (left > 0 ? windowDays : 0), windowDays));
    const partly = hasDates && left === 0 && freeDays > 0 && freeDays < windowDays;
    const daysFree = `${freeDays} of ${windowDays} days free`;
    if (card.display !== "DIGITAL") {
        if (!hasDates || left > 0) return null;
        return partly ? { text: `Partly booked · ${daysFree}`, tone: "partly" } : { text: "Booked on these dates", tone: "booked" };
    }
    const slots = slotsLabel(card);
    if (!slots) return null;
    if (partly) return { text: `${slots} · ${daysFree}`, tone: "partly" };
    return { text: slots, tone: left === 0 ? "booked" : "free" };
}

/** "4.8" — one decimal off the server's two-place string; null while there are no reviews. */
export function ratingLabel(ratingAvg: string | null, reviewCount = 1): string | null {
    if (ratingAvg === null || reviewCount <= 0) return null;
    const value = Number(ratingAvg);
    return Number.isFinite(value) ? value.toFixed(1) : null;
}

/**
 * The listing page's highlights, read from the listing rather than asserted
 * (the app's `highlightsOf`): instant booking when the flag is on and the
 * publisher opted in, illuminated when it is lit, high footfall past 25,000,
 * available now, the visibility the publisher recorded — three at most.
 */
export function highlightsOf(card: BrowseCard, instantOn = false): { key: string; label: string }[] {
    const out: { key: string; label: string }[] = [];
    if (instantOn && card.instantBooking) out.push({ key: "instant", label: "Instant booking" });
    if (card.illumination && card.illumination.toUpperCase() !== "NONE") out.push({ key: "lit", label: "Illuminated" });
    if ((card.estimatedDailyFootfall ?? 0) >= 25_000) out.push({ key: "footfall", label: "High footfall" });
    if (card.availableNow) out.push({ key: "available", label: "Available now" });
    /* The listing-data-gaps lot: a coded distance reads as words; words stored before the codes ("High") read as they always did. */
    const seen = visibilityHighlight(card.visibility);
    if (seen) out.push({ key: "visibility", label: seen });
    return out.slice(0, 3);
}

/** The visibility highlight: "Seen from over 300 m" for the two far codes, nothing for the near ones, older words as "High visibility". */
export function visibilityHighlight(value: string | null | undefined): string | null {
    if (!value) return null;
    const code = siteCodeOf(VISIBILITY_RANGES, value);
    if (code === "OVER_300M" || code === "150_300M") return `Seen from ${siteLabelOf(VISIBILITY_RANGES, code)!.toLowerCase()}`;
    if (VISIBILITY_RANGES.some((o) => o.value === code)) return null;
    return `${value} visibility`;
}

/** How an illumination word reads: FRONTLIT → "Front-lit". */
export function illuminationLabel(value: string | null): string | null {
    if (!value) return null;
    const key = value.toUpperCase().replace(/[^A-Z]/g, "");
    const known: Record<string, string> = { NONE: "Not lit", FRONTLIT: "Front-lit", BACKLIT: "Back-lit", DIGITAL: "Digital (self-lit)", LED: "LED (self-lit)" };
    return known[key] ?? value;
}

/** The listing's specs, the rows the app's listing page prints — only those the publisher filled. */
export function specsOf(card: BrowseCard): { label: string; value: string }[] {
    const rows: { label: string; value: string | null }[] = [
        { label: "Size", value: card.size },
        { label: "Illuminated", value: illuminationLabel(card.illumination) },
        { label: "Facing", value: card.facing },
        { label: "Daily footfall", value: card.estimatedDailyFootfall ? `~${card.estimatedDailyFootfall.toLocaleString("en-IN")} people` : null },
        { label: "Placement", value: card.placement },
        { label: "Hours", value: card.availableHoursFrom && card.availableHoursTo ? `${card.availableHoursFrom} – ${card.availableHoursTo}` : null },
    ];
    return rows.flatMap((row) => (row.value ? [{ label: row.label, value: row.value }] : []));
}

/** The words a share carries — the app's `shareTextOf` without the link, which the share sends on its own. */
export function shareWordsOf(card: Pick<BrowseCard, "title" | "ratePerDay" | "city">): string {
    const rate = card.ratePerDay === null ? "Rate on request" : `${rupees(card.ratePerDay)} per day`;
    const where = card.city ? ` in ${card.city}` : "";
    return `${card.title}${where} — ${rate} on ADX`;
}

/** The link a share carries: the server's spot page when the spot has one, else the page it was shared from. */
export function shareLinkOf(card: Pick<BrowseCard, "shareUrl">, pageUrl: string): string {
    return card.shareUrl || pageUrl;
}

/** The publisher's line on the listing page — who approves, and whether ADX has checked who they are. */
export function publisherLine(card: Pick<BrowseCard, "publisherName" | "instantBooking" | "publisherVerified">, instantOn = false): string | null {
    if (!card.publisherName) return null;
    const who = instantOn && card.instantBooking ? `Listed by ${card.publisherName}. Bookings on this space are accepted the moment they are placed.` : `Listed by ${card.publisherName}. Every booking waits for their approval.`;
    const standing = card.publisherVerified === true ? " Identity verified by ADX." : card.publisherVerified === false ? " This publisher has not completed their identity check yet." : "";
    return who + standing;
}

/* ------------------------------------------------------------------ */
/* Recent searches — the app's search-screen "Recent"                  */
/* ------------------------------------------------------------------ */

export const RECENTS_LIMIT = 8;
const RECENTS_KEY = "adx.web.recentSearches";

/** The list with `query` at the front, once, case-insensitively; blanks are not kept. */
export function rememberQuery(list: string[], query: string, limit = RECENTS_LIMIT): string[] {
    const text = query.trim();
    if (!text) return list;
    const key = text.toLowerCase();
    return [text, ...list.filter((item) => item.toLowerCase() !== key)].slice(0, limit);
}

export function forgetQuery(list: string[], query: string): string[] {
    const key = query.trim().toLowerCase();
    return list.filter((item) => item.toLowerCase() !== key);
}

let recentMemory: string[] | null = null;
const recentListeners = new Set<() => void>();
const EMPTY_RECENTS: string[] = [];

function readRecents(): string[] {
    if (recentMemory) return recentMemory;
    if (typeof window === "undefined") return EMPTY_RECENTS;
    try {
        const raw = window.localStorage.getItem(RECENTS_KEY);
        const parsed: unknown = raw ? JSON.parse(raw) : [];
        recentMemory = Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string").slice(0, RECENTS_LIMIT) : [];
    } catch {
        recentMemory = [];
    }
    return recentMemory;
}

function writeRecents(next: string[]) {
    recentMemory = next;
    try {
        window.localStorage.setItem(RECENTS_KEY, JSON.stringify(next));
    } catch {
        /* A private window keeps them for this page only. */
    }
    recentListeners.forEach((listener) => listener());
}

/** This browser's recent searches — the app keeps its per phone; the web keeps them per browser. */
export const recentSearches = {
    list: readRecents,
    server: () => EMPTY_RECENTS,
    subscribe(listener: () => void) {
        recentListeners.add(listener);
        return () => {
            recentListeners.delete(listener);
        };
    },
    remember: (query: string) => writeRecents(rememberQuery(readRecents(), query)),
    forget: (query: string) => writeRecents(forgetQuery(readRecents(), query)),
    clear: () => writeRecents([]),
};

/* ------------------------------------------------------------------ */
/* Near me                                                             */
/* ------------------------------------------------------------------ */

export type LocateFailure = "denied" | "unavailable" | "timeout" | "unsupported";

/** The words for a location that could not be had — the permission-denied state above all. */
export function locateMessage(failure: LocateFailure): string {
    switch (failure) {
        case "denied":
            return "Your browser is blocking location for this site. Allow location in the site settings (the icon at the left of the address bar), then try again — or type a city instead.";
        case "timeout":
            return "Your location took too long to arrive. Try again, or type a city instead.";
        case "unsupported":
            return "This browser cannot share a location. Type a city instead.";
        default:
            return "Your device could not work out where you are just now. Try again, or type a city instead.";
    }
}

/** The radius choices around "near me", in km; 15 is the app's "Popular near you". */
export const NEAR_RADII = [5, 10, 15, 25, 50] as const;
export const DEFAULT_RADIUS_KM = 15;

/** A point off the URL's `lat`/`lng`/`radius`, or null when either coordinate is missing or out of range. */
export function nearOf(lat: string | null | undefined, lng: string | null | undefined, radius?: string | null): { latitude: number; longitude: number; radiusKm: number } | null {
    if (!lat || !lng) return null;
    const latitude = Number(lat);
    const longitude = Number(lng);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
    const r = Number(radius);
    const radiusKm = Number.isFinite(r) && r >= 1 && r <= 100 ? r : DEFAULT_RADIUS_KM;
    return { latitude, longitude, radiusKm };
}

/** Four decimals — about eleven metres — is all a browse around a point needs, and all a shared URL should carry. */
export function roundCoord(value: number): string {
    return (Math.round(value * 10_000) / 10_000).toString();
}

/** "1.2 km away" / "350 m away" off the card's `distanceM`. */
export function distanceLabel(distanceM: number | null): string | null {
    if (distanceM === null || !Number.isFinite(distanceM)) return null;
    if (distanceM < 1000) return `${Math.round(distanceM / 10) * 10} m away`;
    return `${(distanceM / 1000).toFixed(distanceM < 10_000 ? 1 : 0)} km away`;
}

/* ------------------------------------------------------------------ */
/* Cities — the stage pill, the waitlist, the gate's refusal           */
/* ------------------------------------------------------------------ */

export type CityStage = "PLANNED" | "SEEDING" | "LAUNCHED" | "PAUSED" | "WITHDRAWN";
export const ALL_STAGES: readonly CityStage[] = ["LAUNCHED", "SEEDING", "PAUSED", "WITHDRAWN", "PLANNED"];
export type CityFunction = "supplyIntake" | "publishing" | "demand" | "agentOnboarding" | "printPartners" | "leadFeeds";
export type WaitlistSide = "ADVERTISER" | "PUBLISHER";

/** One row of `GET /app/geo/cities`. */
export interface PickerCity {
    slug: string;
    name: string;
    state: string | null;
    stage: CityStage;
    latitude: number | null;
    longitude: number | null;
    distanceM: number | null;
    comingSoon: boolean;
}

export interface PickerPage {
    items: PickerCity[];
    comingSoon: PickerCity[];
}

/** `GET /app/geo/resolve?name=` — an unknown name answers `resolved: false`. */
export interface CityResolution {
    name: string;
    resolved: boolean;
    slug: string | null;
    city: string | null;
    state: string | null;
    stage: CityStage | null;
    switches: Record<CityFunction, boolean>;
    comingSoon: boolean;
}

export interface WaitlistAnswer {
    leadId: string;
    city: string;
    stage: CityStage;
}

/** The picker's query string, key for key as `geo-api.ts` builds it. */
export function pickerSearch(query: { q?: string; stages?: readonly CityStage[]; near?: { latitude: number; longitude: number } | null; limit?: number }): string {
    const params = new URLSearchParams();
    if (query.stages && query.stages.length > 0) params.set("stage", query.stages.join(","));
    const q = query.q?.trim();
    if (q) params.set("q", q);
    if (query.near) {
        params.set("lat", String(query.near.latitude));
        params.set("lng", String(query.near.longitude));
    }
    if (query.limit) params.set("limit", String(query.limit));
    const search = params.toString();
    return search ? `?${search}` : "";
}

/** The pill beside a city: Live, Coming soon, or — for the two closed stages — why not. */
export function stageLabel(stage: CityStage | string): string {
    switch (stage) {
        case "LAUNCHED":
            return "Live";
        case "PAUSED":
            return "Paused";
        case "WITHDRAWN":
            return "Closed";
        default:
            return "Coming soon";
    }
}

export function stageTone(stage: CityStage | string): "success" | "info" | "warning" | "neutral" {
    switch (stage) {
        case "LAUNCHED":
            return "success";
        case "PAUSED":
            return "warning";
        case "WITHDRAWN":
            return "neutral";
        default:
            return "info";
    }
}

/** The coming-soon card's words for a stage (`coming-soon-card.tsx`). */
export function comingSoonCopy(city: string, stage: CityStage | string): { closed: boolean; title: string; body: string } {
    const closed = stage === "PAUSED" || stage === "WITHDRAWN";
    if (closed) return { closed, title: `ADX is not taking new bookings in ${city} right now`, body: "Campaigns already running here finish as planned. Try another city, or come back later." };
    if (stage === "SEEDING") return { closed, title: `Coming soon in ${city}`, body: `Publishers in ${city} are listing their spaces now. Booking opens when the city launches.` };
    return { closed, title: `Coming soon in ${city}`, body: `ADX is not in ${city} yet. Choose a city that is live, or ask to be told when this one opens.` };
}

export function isCityNotOpen(cause: unknown): cause is ApiError {
    return cause instanceof ApiError && cause.code === "CITY_NOT_OPEN";
}

export function isAlreadyLive(cause: unknown): cause is ApiError {
    return cause instanceof ApiError && cause.code === "ALREADY_LIVE";
}

const FUNCTION_NOUN: Record<CityFunction, string> = {
    supplyIntake: "listings",
    publishing: "listings",
    demand: "bookings",
    agentOnboarding: "agents",
    printPartners: "print partners",
    leadFeeds: "leads",
};

const titleCase = (slug: string) =>
    slug
        .split("-")
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ");

/**
 * The line for `400 CITY_NOT_OPEN { stage, function, city }` —
 * "ADX is not taking new bookings in Pune right now." — the app's
 * `cityNotOpenMessage`, word for word. Any other error answers null.
 */
export function cityNotOpenMessage(cause: unknown, cityName?: string | null): string | null {
    if (!isCityNotOpen(cause)) return null;
    const details = (cause.details ?? {}) as { function?: string; city?: string };
    const fn = details.function as CityFunction | undefined;
    const noun = fn && fn in FUNCTION_NOUN ? FUNCTION_NOUN[fn] : "business";
    const city = cityName?.trim() || (details.city ? titleCase(details.city) : null);
    return `ADX is not taking new ${noun}${city ? ` in ${city}` : ""} right now.`;
}

/** What "Notify me" came to, in the card's words. */
export function waitlistOutcome(cause: unknown, city: string): { tone: "ok" | "no"; text: string; live: boolean } {
    if (isAlreadyLive(cause)) return { tone: "ok", text: `${city} is live now — loading its spaces.`, live: true };
    if (cause instanceof ApiError && (cause.code === "FEATURE_OFF" || cause.status === 404)) {
        return { tone: "no", text: `ADX is not taking names for ${city} yet. Check back here — the city goes live from ADX's side.`, live: false };
    }
    const closed = cityNotOpenMessage(cause, city);
    if (closed) return { tone: "no", text: closed, live: false };
    return { tone: "no", text: cause instanceof ApiError ? cause.message : "Could not reach ADX.", live: false };
}

/** `GET /publishers/:id/public` (26 Sep 2026) — a publisher's storefront header, public: no contact data, no KYC detail. */
export interface PublicPublisher {
    id: string;
    name: string;
    avatarUrl: string | null;
    verified: boolean;
    liveListings: number;
}

export const geoService = {
    /** Public since 26 Sep 2026 (a visitor's city suggestions and stage pill); a session is sent when there is one. */
    cities: (query: Parameters<typeof pickerSearch>[0] = {}) => api.get<PickerPage>(`/app/geo/cities${pickerSearch(query)}`),
    resolve: (name: string) => api.get<CityResolution>(`/app/geo/resolve?name=${encodeURIComponent(name.trim())}`),
    joinWaitlist: (citySlug: string, side: WaitlistSide = "ADVERTISER", note?: string) =>
        api.post<WaitlistAnswer>("/app/geo/waitlist", { citySlug, side, ...(note?.trim() ? { note: note.trim() } : {}) }),
};

/* ------------------------------------------------------------------ */
/* The explore home's strip — campaigns live and scans this month      */
/* ------------------------------------------------------------------ */

/** Q106: the month's scans off the portfolio analytics' daily series; null for a read without one. */
export function scansOf(portfolio: { series?: { scans?: number | string | null }[] } | null | undefined): number | null {
    if (!portfolio || !Array.isArray(portfolio.series)) return null;
    return portfolio.series.reduce((sum, day) => sum + (Number(day.scans) || 0), 0);
}

/* ------------------------------------------------------------------ */
/* Spot-page views (listing-data-gaps lot, 3 Oct 2026)                 */
/* ------------------------------------------------------------------ */

/** When each spot was last counted from this tab — React draws a page twice in development, and that is one view. */
const viewCountedAt = new Map<string, number>();
const SAME_VIEW_MS = 5_000;

/**
 * Count one view of a spot's public page — `POST /listings/:id/view
 * { source: "WEB" }`, the public, rate-limited door the backend dedupes per
 * visitor per day (the signed-in person, else a hash it makes itself) and
 * never counts for the spot's own publisher, its agent or ADX staff. Once
 * per page view; a failure (an older server without the door, a switched-off
 * feature, the rate limit) is silent — a view count never breaks the page.
 * Answers whether a request went out.
 */
export function countSpotView(listingId: string, now: number = Date.now()): boolean {
    if (!listingId) return false;
    const last = viewCountedAt.get(listingId);
    if (last !== undefined && now - last < SAME_VIEW_MS) return false;
    viewCountedAt.set(listingId, now);
    api.post<unknown>(`/listings/${encodeURIComponent(listingId)}/view`, { source: "WEB" }).catch(() => undefined);
    return true;
}

export const browseService = {
    browse: (query: BrowseQuery = {}) => api.get<BrowsePage>(`/listings/browse${browseSearch(query)}`),
    categories: (place: Pick<BrowseQuery, "city" | "near"> = {}) =>
        api.get<{ items: CategoryTile[]; total: number }>(`/listings/browse/categories${placeSearch(place)}`),
    venues: (place: Pick<BrowseQuery, "city" | "near"> = {}) =>
        api.get<{ items: VenueTile[]; total: number }>(`/listings/browse/venues${placeSearch(place)}`),
    /** AV-1: with the visitor's dates (whole days, `YYYY-MM-DD`), the slots left and free days are counted over them. */
    listing: (listingId: string, dates?: { from: string; to: string } | null) =>
        api.get<BrowseCard>(
            `/listings/browse/${encodeURIComponent(listingId)}${dates ? `?from=${encodeURIComponent(`${dates.from}T00:00:00.000Z`)}&to=${encodeURIComponent(`${dates.to}T23:59:59.999Z`)}` : ""}`
        ),
    /** AV-1: every day of a range (90 days from today by default, at most 186), the first free day, and the earliest run of `length` days with room for `quantity`. Public. */
    availability: (listingId: string, query: AvailabilityQuery = {}) =>
        api.get<ListingAvailability>(`/listings/browse/${encodeURIComponent(listingId)}/availability${availabilitySearch(query)}`, { anonymous: true }),
    /** Up to five like spaces, as browse cards (26 Sep 2026) — the grid draws them directly. */
    /** SIM-1: `limit` up to 24 — the listing page's scrolling row asks for a dozen. */
    similar: (listingId: string, limit?: number) =>
        api.get<BrowseCard[]>(`/listings/${encodeURIComponent(listingId)}/similar${limit ? `?limit=${limit}` : ""}`, { anonymous: true }),
    /** A publisher's public card for the storefront header; null when there is none (404). */
    publisher: (publisherId: string) =>
        api.get<PublicPublisher>(`/publishers/${encodeURIComponent(publisherId)}/public`, { anonymous: true }).catch((caught: unknown) => {
            if (caught instanceof ApiError && caught.status === 404) return null;
            throw caught;
        }),
    reviews: (listingId: string, page = 1, pageSize = 20) =>
        api.get<ListingReviewPage>(`/listings/browse/${encodeURIComponent(listingId)}/reviews?page=${page}&pageSize=${pageSize}`),
    save: (listingId: string) => api.put<BrowseCard>(`/listings/browse/${encodeURIComponent(listingId)}/save`),
    unsave: (listingId: string) => api.delete<{ saved: boolean }>(`/listings/browse/${encodeURIComponent(listingId)}/save`),
    saved: (advertiserId: string, page = 1, pageSize = 20) =>
        api.get<BrowsePage>(`/advertisers/${encodeURIComponent(advertiserId)}/saved?page=${page}&pageSize=${pageSize}`),
    /** The home strip's two reads, as the app makes them: LIVE campaigns (the total), and the month's portfolio. */
    liveCampaigns: () => api.get<{ items: unknown[]; total?: number }>("/campaigns?status=LIVE&pageSize=1"),
    portfolio: (days: number) => api.get<{ series?: { scans?: number | string | null }[] }>(`/campaigns/analytics?days=${days}`),
};
