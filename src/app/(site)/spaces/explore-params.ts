import type { FilterState } from "@/components/site/filter-rail";
import {
    dayEnd,
    dayStart,
    isBrowseCategory,
    isBrowseSort,
    isIsoDay,
    nearOf,
    type BrowseCategory,
    type BrowseDisplay,
    type BrowseQuery,
} from "@/services/browse";

/**
 * Explore's state is its URL, so a search is a link:
 * `/spaces?city=Bengaluru&category=OUTDOOR&minRate=2000&lit=1`. The keys
 * are the browse's own (`minRate`/`maxRate` per day, `minFootfall`,
 * `venueTypeId`, `publisherId`, `lat`/`lng`/`radius`), so a link reads the
 * way the app's drawer asks. Older links — the first build's `format`,
 * weekly `budgetMin`/`budgetMax` and `lit=front|back|led` — still open,
 * translated once on the way in.
 */
export interface ExploreParams {
    q: string;
    city: string;
    from: string;
    to: string;
    category: string;
    venueTypeId: string;
    publisherId: string;
    /** SIM-1: the spaces like one listing. */
    similarTo: string;
    display: string;
    /** Rupees per day, as typed. */
    minRate: string;
    maxRate: string;
    minFootfall: string;
    /** Illuminated at night — front-lit, back-lit or digital. */
    lit: boolean;
    /** Instant booking only; sent only while the flag is on. */
    instant: boolean;
    sort: string;
    page: number;
    map: boolean;
    lat: string;
    lng: string;
    radius: string;
}

export const EMPTY_PARAMS: ExploreParams = {
    q: "",
    city: "",
    from: "",
    to: "",
    category: "",
    venueTypeId: "",
    publisherId: "",
    similarTo: "",
    display: "",
    minRate: "",
    maxRate: "",
    minFootfall: "",
    lit: false,
    instant: false,
    sort: "",
    page: 1,
    map: false,
    lat: "",
    lng: "",
    radius: "",
};

export const PAGE_SIZE = 12;

type Raw = Record<string, string | string[] | undefined>;
const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) ?? "";
const digits = (value: string) => value.replace(/[^\d]/g, "");

/** The first build's format rail, for links made before the category and venue tiles. */
const LEGACY_FORMAT: Record<string, Partial<ExploreParams>> = {
    billboard: { category: "OUTDOOR" },
    digital: { display: "DIGITAL" },
    transit: { category: "TRANSIT" },
    mall: { category: "INDOOR", q: "mall" },
    airport: { category: "INDOOR", q: "airport" },
};

/** A weekly budget from an old link, as the per-day rate the browse filters on. */
const weeklyToDaily = (value: string) => (digits(value) && Number(digits(value)) > 0 ? String(Math.round(Number(digits(value)) / 7)) : "");

export function parseExploreParams(raw: Raw): ExploreParams {
    const p: ExploreParams = {
        ...EMPTY_PARAMS,
        q: first(raw.q).trim(),
        city: first(raw.city).trim(),
        from: first(raw.from),
        to: first(raw.to),
        category: first(raw.category),
        venueTypeId: first(raw.venueTypeId),
        publisherId: first(raw.publisherId),
        similarTo: first(raw.similarTo),
        display: first(raw.display),
        minRate: digits(first(raw.minRate)),
        maxRate: digits(first(raw.maxRate)),
        minFootfall: digits(first(raw.minFootfall)),
        lit: ["1", "true", "front", "back", "led"].includes(first(raw.lit)),
        instant: ["1", "true"].includes(first(raw.instant)),
        sort: first(raw.sort),
        page: Math.max(1, Number(first(raw.page)) || 1),
        map: first(raw.map) === "1",
        lat: first(raw.lat),
        lng: first(raw.lng),
        radius: first(raw.radius),
    };
    const legacy = LEGACY_FORMAT[first(raw.format)];
    if (legacy) {
        if (legacy.category && !p.category) p.category = legacy.category;
        if (legacy.display && !p.display) p.display = legacy.display;
        if (legacy.q) p.q = p.q ? `${p.q} ${legacy.q}` : legacy.q;
    }
    if (!p.minRate && first(raw.budgetMin)) p.minRate = weeklyToDaily(first(raw.budgetMin));
    if (!p.maxRate && first(raw.budgetMax)) p.maxRate = weeklyToDaily(first(raw.budgetMax));
    if (first(raw.lit) === "led" && !p.display) p.display = "DIGITAL";
    return p;
}

/**
 * The browse read for a URL — what the app's browse sends for the same
 * state. Near me wins over the city (the app sends one place, not two);
 * instant is sent only while the flag is on; a date that is not a day, or
 * an end before the start, is left out rather than refused by the server.
 */
export function exploreQuery(params: ExploreParams, options: { instantOn?: boolean; pageSize?: number } = {}): BrowseQuery {
    const near = nearOf(params.lat, params.lng, params.radius);
    const from = isIsoDay(params.from) ? params.from : "";
    const to = isIsoDay(params.to) && (!from || params.to >= from) ? params.to : "";
    const footfall = Number(params.minFootfall);
    const query: BrowseQuery = { page: params.page, pageSize: options.pageSize ?? PAGE_SIZE };
    if (params.q) query.q = params.q;
    if (near) query.near = near;
    else if (params.city) query.city = params.city;
    if (isBrowseCategory(params.category)) query.category = params.category;
    if (params.venueTypeId) query.venueTypeId = params.venueTypeId;
    if (params.publisherId) query.publisherId = params.publisherId;
    if (params.similarTo) query.similarTo = params.similarTo;
    if (params.display === "DIGITAL" || params.display === "STATIC") query.display = params.display as BrowseDisplay;
    if (params.minRate) query.minRate = params.minRate;
    if (params.maxRate) query.maxRate = params.maxRate;
    if (from) query.from = dayStart(from);
    if (to) query.to = dayEnd(to);
    if (Number.isFinite(footfall) && footfall > 0) query.minFootfall = footfall;
    if (params.lit) query.illuminated = true;
    if (params.instant && options.instantOn) query.instant = true;
    if (isBrowseSort(params.sort)) query.sort = params.sort;
    return query;
}

/** The URL for a change of state; every change but paging starts from page one (the caller passes `page`). */
export function exploreHref(next: Partial<ExploreParams>, base: ExploreParams): string {
    const merged = { ...base, ...next };
    const params = new URLSearchParams();
    const put = (key: string, value: string | number | boolean | undefined) => {
        if (value === undefined || value === "" || value === false || value === 0) return;
        params.set(key, value === true ? "1" : String(value));
    };
    put("q", merged.q);
    put("city", merged.lat && merged.lng ? "" : merged.city);
    put("lat", merged.lat);
    put("lng", merged.lng);
    put("radius", merged.lat && merged.lng ? merged.radius : "");
    put("from", merged.from);
    put("to", merged.to);
    put("category", merged.category);
    put("venueTypeId", merged.venueTypeId);
    put("publisherId", merged.publisherId);
    put("similarTo", merged.similarTo);
    put("display", merged.display);
    put("minRate", merged.minRate);
    put("maxRate", merged.maxRate);
    put("minFootfall", merged.minFootfall);
    put("lit", merged.lit);
    put("instant", merged.instant);
    put("sort", merged.sort);
    if (merged.page > 1) put("page", merged.page);
    put("map", merged.map);
    const search = params.toString();
    return search ? `/spaces?${search}` : "/spaces";
}

/** The facets the drawer holds, for the "Show N spaces" count and the Clear all. */
export type DrawerState = FilterState;

export function drawerOf(params: ExploreParams): DrawerState {
    return {
        category: params.category,
        venueTypeId: params.venueTypeId,
        display: params.display,
        minRate: params.minRate,
        maxRate: params.maxRate,
        minFootfall: params.minFootfall,
        lit: params.lit,
        instant: params.instant,
    };
}

export const CLEAR_DRAWER: DrawerState = { category: "", venueTypeId: "", display: "", minRate: "", maxRate: "", minFootfall: "", lit: false, instant: false };

/** How many drawer facets are in force — the badge beside "Filters". */
export function activeFilterCount(state: DrawerState): number {
    return [state.category, state.venueTypeId, state.display, state.minRate || state.maxRate, state.minFootfall, state.lit, state.instant].filter(Boolean).length;
}

/** Whether the page is the explore home — nothing asked yet — where "Popular near you" is drawn. */
export function isLanding(params: ExploreParams): boolean {
    return !params.q && !params.category && !params.venueTypeId && !params.publisherId && !params.similarTo && params.page === 1 && activeFilterCount(drawerOf(params)) === 0;
}

export function categoryOf(params: Pick<ExploreParams, "category">): BrowseCategory | null {
    return isBrowseCategory(params.category) ? params.category : null;
}
