import type { Metadata } from "next";
import { api } from "@/lib/api-client";
import { apiConfig } from "@/lib/api-config";
import { pageHref } from "@/lib/site-routes";
import type { Party } from "@/services/party";
import type { BrowseCategory, BrowseQuery, BrowseSort } from "@/services/browse";
import { parseFormView, type FormView } from "@/services/forms";

/**
 * LM-1 — layouts: what each website page draws, in what order, for whom and
 * when, as the console publishes it. `GET /app/layouts/:surface` answers the
 * live layout for the side and the city asked (visibility, schedule and
 * `hidden` already applied; media, rail queries, content and ads resolved),
 * or the baked default (`version: 0, isDefault: true`) while nothing is
 * published. The site renders the answer's blocks in order, skips a type it
 * does not know, and draws its own baked order when the read fails, or
 * answers the default — so a page never waits on, or breaks with, a layout.
 */

/** PB-3 (27 Sep 2026): the rest of the website's own pages are surfaces too — sections in Studio. */
export type LayoutSurface = "WEB_HOME" | "WEB_EXPLORE" | "WEB_FORMATS" | "WEB_LISTING" | "WEB_CATEGORIES" | "WEB_HOW_IT_WORKS" | "WEB_ADVERTISE" | "WEB_PUBLISHERS" | "WEB_HELP";
export type LayoutSide = "VISITOR" | "ADVERTISER" | "PUBLISHER" | "PARTNER" | "AGENT_FIELD" | "AGENT_SALES";

/** PB-1: `PAGE` names a Studio page by key — the server adds `href` (its current address); the site falls back to `pageHref`. */
export type TargetKind = "ROUTE" | "URL" | "LISTING" | "CATEGORY" | "VENUE" | "CONTENT" | "NEW_CAMPAIGN" | "EXPLORE" | "PAGE";
export interface Target {
    kind: TargetKind;
    value?: string;
    /** A PAGE target's address, as the server resolved it. */
    href?: string;
}

export interface ResolvedMedia {
    url: string;
    width: number | null;
    height: number | null;
    altText: string | null;
}

export interface ResolvedBlock {
    id: string;
    type: string;
    props: Record<string, unknown>;
}

/** PB-2: what a version says about itself for search engines — Studio's page settings sheet. */
export interface LayoutMeta {
    seoTitle: string | null;
    seoDescription: string | null;
    seoImage: ResolvedMedia | null;
    noindex: boolean;
}

export interface Layout {
    surface: string;
    version: number;
    isDefault: boolean;
    blocks: ResolvedBlock[];
    meta?: LayoutMeta | null;
    /** True when a preview token asked for the draft. */
    preview?: boolean;
}

/** One sold ad as the layout resolves it into an `ad_slot` block. */
export interface ResolvedAd {
    adBookingId: string;
    displayId: string | null;
    media: ResolvedMedia;
    headline: string | null;
    ctaLabel: string | null;
    targetUrl: string | null;
}

/* ------------------------------------------------------------------ */
/* The site's own sections, in today's order                           */
/* ------------------------------------------------------------------ */

/** Each surface's system blocks — the website's existing sections — in their baked order. */
export const SYSTEM_BLOCKS: Record<LayoutSurface, readonly string[]> = {
    WEB_HOME: ["legacy_home"],
    WEB_EXPLORE: ["explore_search", "category_strip", "campaign_strip", "popular_rail", "results"],
    WEB_FORMATS: ["formats_hero", "format_cards", "venue_tiles", "guides_strip"],
    WEB_LISTING: ["publisher_listings"],
    /* PB-3: the five pages' own sections, named as the registry names them. */
    WEB_CATEGORIES: ["categories_hero", "category_sections"],
    WEB_HOW_IT_WORKS: ["hiw_hero", "hiw_steps"],
    WEB_ADVERTISE: ["advertise_hero", "display_ads_section", "sponsored_listings_section"],
    WEB_PUBLISHERS: ["publishers_hero", "publishers_steps", "publishers_forms", "publishers_faq"],
    WEB_HELP: ["help_hero", "help_topics", "help_contact", "help_faq"],
};

/** The slot the listing page's sidebar sells. */
export const LISTING_SIDEBAR_SLOT = "WEB_LISTING_SIDEBAR";

/** The content blocks the site can draw — on any surface, and on a custom page (PB-4: the thirteen Studio adds). */
export const CONTENT_BLOCKS = [
    "promo_banner",
    "tile_grid",
    "listing_rail",
    "rich_text",
    "ad_slot",
    "hero",
    "cta_strip",
    "columns",
    "image",
    "video",
    "faq",
    "steps",
    "stats",
    "divider",
    "button_row",
    "category_tiles",
    "listing_grid",
    "form",
] as const;
export type ContentBlockType = (typeof CONTENT_BLOCKS)[number];

/** Today's order — what the page draws with no layout, or the default one. */
export function defaultBlocks(surface: LayoutSurface): ResolvedBlock[] {
    const blocks: ResolvedBlock[] = SYSTEM_BLOCKS[surface].map((type) => ({ id: `default-${type}`, type, props: {} }));
    if (surface === "WEB_LISTING") blocks.push({ id: "default-ad_slot", type: "ad_slot", props: { slotKey: LISTING_SIDEBAR_SLOT } });
    return blocks;
}

/** A section a surface must always draw, and where: Explore's results are last, and never hidden. */
const PINNED_LAST: Partial<Record<LayoutSurface, string>> = { WEB_EXPLORE: "results" };

export type PlannedBlock = { kind: "system"; id: string; type: string; title: string | null } | { kind: "content"; id: string; type: ContentBlockType; props: Record<string, unknown> };

export const isContentType = (type: string): type is ContentBlockType => (CONTENT_BLOCKS as readonly string[]).includes(type);

/** PB-4: a custom page's blocks — content blocks only, in the page's order; anything else is skipped. */
export function planContentBlocks(blocks: ResolvedBlock[] | null | undefined): PlannedBlock[] {
    const out: PlannedBlock[] = [];
    for (const block of Array.isArray(blocks) ? blocks : []) {
        if (!block || typeof block !== "object" || typeof block.type !== "string" || !isContentType(block.type)) continue;
        const id = typeof block.id === "string" && block.id ? block.id : `${block.type}-${out.length}`;
        const props = block.props && typeof block.props === "object" && !Array.isArray(block.props) ? block.props : {};
        out.push({ kind: "content", id, type: block.type, props });
    }
    return out;
}

/**
 * The blocks a page draws, in order: the layout's when it has one that is
 * not the default, else today's. A system block names one of the page's own
 * sections (each drawn once, and only on its own surface); a content block
 * is one of the five the site knows; anything else is skipped. Explore's
 * results are always there, and always last.
 */
export function planBlocks(surface: LayoutSurface, layout: Layout | null | undefined): PlannedBlock[] {
    const answered = layout && Array.isArray(layout.blocks) ? layout.blocks : [];
    /* The default answer is today's order, but resolved: the sidebar's slot comes back with the ads that run in it. */
    const source = layout && !layout.isDefault && Array.isArray(layout.blocks) ? layout.blocks : defaultBlocks(surface).map((block) => resolvedTwin(block, answered) ?? block);
    const system = SYSTEM_BLOCKS[surface];
    const seen = new Set<string>();
    const out: PlannedBlock[] = [];
    for (const block of source) {
        if (!block || typeof block !== "object" || typeof block.type !== "string") continue;
        const id = typeof block.id === "string" && block.id ? block.id : `${block.type}-${out.length}`;
        const props = block.props && typeof block.props === "object" && !Array.isArray(block.props) ? block.props : {};
        if (system.includes(block.type)) {
            if (seen.has(block.type)) continue;
            seen.add(block.type);
            const title = typeof props.title === "string" && props.title.trim() ? props.title.trim() : null;
            out.push({ kind: "system", id, type: block.type, title });
        } else if (isContentType(block.type)) {
            out.push({ kind: "content", id, type: block.type, props });
        }
    }
    const pinned = PINNED_LAST[surface];
    if (pinned) {
        const at = out.findIndex((block) => block.kind === "system" && block.type === pinned);
        const row: PlannedBlock = at === -1 ? { kind: "system", id: `default-${pinned}`, type: pinned, title: null } : out.splice(at, 1)[0]!;
        out.push(row);
    }
    return out;
}

/** A baked content block's resolved twin in the server's default answer — same type, and for a slot the same key. */
function resolvedTwin(block: ResolvedBlock, answered: ResolvedBlock[]): ResolvedBlock | null {
    if (!isContentType(block.type)) return null;
    const twin = answered.find((row) => row && row.type === block.type && (block.type !== "ad_slot" || (row.props as { slotKey?: unknown } | undefined)?.slotKey === block.props.slotKey));
    return twin && twin.props && typeof twin.props === "object" ? { ...block, props: { ...block.props, ...twin.props } } : null;
}

/* ------------------------------------------------------------------ */
/* Reading                                                             */
/* ------------------------------------------------------------------ */

/** The side a layout is asked for: the workspace the account is in, or a visitor. */
export function sideOf(signedIn: boolean, party: Party | null | undefined): LayoutSide {
    if (!signedIn || !party) return "VISITOR";
    if (party === "PRINT_PARTNER") return "PARTNER";
    return party;
}

export interface LayoutAsk {
    side: LayoutSide;
    city?: string | null;
    cityId?: string | null;
    stage?: string | null;
    /** PB-2: a Studio preview token — the draft is answered when it names this surface. */
    preview?: string | null;
}

/** The query a layout or a page is asked with. */
export function askSearch(ask: LayoutAsk): string {
    const params = new URLSearchParams({ side: ask.side });
    if (ask.city?.trim()) params.set("city", ask.city.trim());
    if (ask.cityId?.trim()) params.set("cityId", ask.cityId.trim());
    if (ask.stage?.trim()) params.set("stage", ask.stage.trim());
    if (ask.preview?.trim()) params.set("preview", ask.preview.trim());
    return params.toString();
}

export function layoutPath(surface: LayoutSurface, ask: LayoutAsk): string {
    return `/app/layouts/${surface}?${askSearch(ask)}`;
}

/** The answer, read strictly — anything that is not a layout is no layout. */
export function parseLayout(answer: unknown): Layout | null {
    const row = answer && typeof answer === "object" && "data" in (answer as object) && !("blocks" in (answer as object)) ? (answer as { data: unknown }).data : answer;
    if (!row || typeof row !== "object") return null;
    const layout = row as Partial<Layout>;
    if (!Array.isArray(layout.blocks)) return null;
    return {
        surface: typeof layout.surface === "string" ? layout.surface : "",
        version: typeof layout.version === "number" ? layout.version : 0,
        isDefault: layout.isDefault === true,
        blocks: layout.blocks.filter((block): block is ResolvedBlock => !!block && typeof block === "object" && typeof (block as ResolvedBlock).type === "string"),
        /* PB-2: only when the version says something — a plain layout stays the shape LM-1 answered. */
        ...(metaOf(layout.meta) ? { meta: metaOf(layout.meta) } : {}),
        ...(layout.preview === true ? { preview: true } : {}),
    };
}

/** The version's SEO settings, read strictly; null when the version carries none. */
export function metaOf(value: unknown): LayoutMeta | null {
    if (!value || typeof value !== "object") return null;
    const meta = value as Record<string, unknown>;
    const out: LayoutMeta = { seoTitle: str(meta.seoTitle), seoDescription: str(meta.seoDescription), seoImage: mediaOf(meta.seoImage), noindex: meta.noindex === true };
    return out.seoTitle || out.seoDescription || out.seoImage || out.noindex ? out : null;
}

/**
 * A page's metadata: the version's SEO title, description and share
 * image over the page's own words; `noindex` (or a preview) keeps search
 * engines out.
 */
export function metadataFrom(meta: LayoutMeta | null | undefined, fallback: { title: string; description?: string | null }, options: { noindex?: boolean } = {}): Metadata {
    const title = meta?.seoTitle ?? fallback.title;
    const description = meta?.seoDescription ?? fallback.description ?? undefined;
    const out: Metadata = { title, ...(description ? { description } : {}) };
    if (meta?.seoImage) {
        const image = meta.seoImage;
        out.openGraph = { title, ...(description ? { description } : {}), images: [{ url: image.url, ...(image.width ? { width: image.width } : {}), ...(image.height ? { height: image.height } : {}), ...(image.altText ? { alt: image.altText } : {}) }] };
    }
    if (options.noindex || meta?.noindex) out.robots = { index: false, follow: false };
    return out;
}

/** How long a server keeps a layout — the backend's own cache is ~60 s. */
export const LAYOUT_REVALIDATE_SECONDS = 60;

export const layoutsService = {
    /** In the browser: with the session, so a signed-in side is honoured. */
    read: async (surface: LayoutSurface, ask: LayoutAsk): Promise<Layout | null> => parseLayout(await api.get<unknown>(layoutPath(surface, ask), { anonymous: ask.side === "VISITOR" })),
};

/**
 * On the server, always as a visitor (the server holds no session): cached
 * for a minute, two and a half seconds at most, and null — never a throw —
 * when ADX does not answer, so the page draws its baked order.
 */
export async function readLayoutServer(surface: LayoutSurface, ask: Omit<LayoutAsk, "side"> = {}, baseUrl: string = apiConfig.baseUrl): Promise<Layout | null> {
    try {
        /* PB-2: a preview is the draft as it stands this second — never kept. */
        const caching: RequestInit = ask.preview ? { cache: "no-store" } : { next: { revalidate: LAYOUT_REVALIDATE_SECONDS } };
        const response = await fetch(`${baseUrl}${layoutPath(surface, { ...ask, side: "VISITOR" })}`, { ...caching, signal: AbortSignal.timeout(2500) });
        if (!response.ok) return null;
        return parseLayout(await response.json());
    } catch {
        return null;
    }
}

/* ------------------------------------------------------------------ */
/* Block props                                                         */
/* ------------------------------------------------------------------ */

const str = (value: unknown): string | null => (typeof value === "string" && value.trim() ? value.trim() : null);

export function mediaOf(value: unknown): ResolvedMedia | null {
    if (!value || typeof value !== "object") return null;
    const media = value as Record<string, unknown>;
    const url = str(media.url);
    if (!url || !/^(https?:\/\/|\/)/i.test(url)) return null;
    const num = (n: unknown) => (typeof n === "number" && Number.isFinite(n) && n > 0 ? n : null);
    return { url, width: num(media.width), height: num(media.height), altText: str(media.altText) };
}

export function targetOf(value: unknown): Target | null {
    if (!value || typeof value !== "object") return null;
    const target = value as Record<string, unknown>;
    const kinds: TargetKind[] = ["ROUTE", "URL", "LISTING", "CATEGORY", "VENUE", "CONTENT", "NEW_CAMPAIGN", "EXPLORE", "PAGE"];
    if (!kinds.includes(target.kind as TargetKind)) return null;
    const href = str(target.href);
    return { kind: target.kind as TargetKind, value: str(target.value) ?? undefined, ...(href ? { href } : {}) };
}

const SAFE_URL = /^https?:\/\/[^\s]+$/i;
/** A path on this site: one leading slash, never two (`//evil.example` is another host). */
const SAFE_PATH = /^\/(?!\/)[^\s]*$/;

/** Where a target goes on the website; null when it goes nowhere safe. */
export function targetHref(target: Target | null | undefined): { href: string; external: boolean } | null {
    if (!target) return null;
    const value = target.value ?? "";
    switch (target.kind) {
        case "ROUTE":
            return SAFE_PATH.test(value) ? { href: value, external: false } : null;
        case "URL":
            return SAFE_URL.test(value) ? { href: value, external: true } : null;
        case "LISTING":
            return value ? { href: `/spaces/${encodeURIComponent(value)}`, external: false } : null;
        case "CATEGORY":
            return value ? { href: `/spaces?category=${encodeURIComponent(value)}`, external: false } : { href: "/spaces", external: false };
        case "VENUE":
            return value ? { href: `/spaces?venueTypeId=${encodeURIComponent(value)}`, external: false } : { href: "/spaces", external: false };
        case "CONTENT":
            return value && /^[a-z0-9][a-z0-9-]*$/i.test(value) ? { href: `/${value}`, external: false } : null;
        case "NEW_CAMPAIGN":
            return { href: "/advertiser/campaigns/new", external: false };
        case "EXPLORE":
            return { href: value && value.startsWith("?") ? `/spaces${value}` : SAFE_PATH.test(value) && value.startsWith("/spaces") ? value : "/spaces", external: false };
        case "PAGE":
            /* PB-1: the server's resolution when it sent one; else the page's current address by key. */
            if (target.href && SAFE_PATH.test(target.href)) return { href: target.href, external: false };
            return value && /^[a-z0-9]+(?:-[a-z0-9]+)*$/i.test(value) ? { href: pageHref(value), external: false } : null;
        default:
            return null;
    }
}

/** An ad's link: only http(s), always a new tab, always `rel="sponsored noopener"`. */
export function adHref(targetUrl: string | null | undefined): string | null {
    const value = str(targetUrl);
    return value && SAFE_URL.test(value) ? value : null;
}

export function adsOf(value: unknown): ResolvedAd[] {
    if (!Array.isArray(value)) return [];
    const out: ResolvedAd[] = [];
    for (const row of value) {
        if (!row || typeof row !== "object") continue;
        const ad = row as Record<string, unknown>;
        const media = mediaOf(ad.media);
        const id = str(ad.adBookingId);
        if (!media || !id) continue;
        out.push({ adBookingId: id, displayId: str(ad.displayId), media, headline: str(ad.headline), ctaLabel: str(ad.ctaLabel), targetUrl: adHref(ad.targetUrl as string | null) });
    }
    return out;
}

/**
 * The ad a slot shows on this page view: one at a time, the next one on the
 * next view. The list is put in a stable order first, so the rotation walks
 * every ad whatever order the server shuffled them into.
 */
export function pickAd<T extends { adBookingId: string }>(ads: T[], view: number): T | null {
    if (ads.length === 0) return null;
    const ordered = [...ads].sort((a, b) => (a.adBookingId < b.adBookingId ? -1 : a.adBookingId > b.adBookingId ? 1 : 0));
    const index = ((Math.floor(view) % ordered.length) + ordered.length) % ordered.length;
    return ordered[index]!;
}

/* ------------------------------------------------------------------ */
/* listing_rail                                                        */
/* ------------------------------------------------------------------ */

const SORTS: BrowseSort[] = ["NEWEST", "PRICE_ASC", "PRICE_DESC", "NAME", "RATING"];
const CATEGORIES: BrowseCategory[] = ["INDOOR", "OUTDOOR", "TRANSIT", "MEDIA"];

export interface RailPlan {
    /** A browse read, or null when the rail names listings by id. */
    query: BrowseQuery | null;
    ids: string[];
    /** A NEAR_YOU rail the server could not place: it waits for the browser's position or the page's city. */
    wantsPlace: boolean;
}

/**
 * The resolved `query` of a `listing_rail`, as a browse read: the sort, the
 * facets, the size (1–12). `ids` (a curated rail) are read one by one.
 * `near` is a point when the server placed it; `near: true` (or a NEAR_YOU
 * rail with no point) takes the page's city instead.
 */
export function railPlan(props: Record<string, unknown>, place: { city?: string | null } = {}): RailPlan {
    const query = props.query && typeof props.query === "object" ? (props.query as Record<string, unknown>) : {};
    const count = Math.min(12, Math.max(1, Math.round(Number(query.pageSize ?? props.count ?? 6)) || 6));
    const ids = Array.isArray(query.ids) ? query.ids.filter((id): id is string => typeof id === "string" && !!id.trim()).slice(0, count) : [];
    if (ids.length) return { query: null, ids, wantsPlace: false };
    const out: BrowseQuery = { pageSize: count };
    if (SORTS.includes(query.sort as BrowseSort)) out.sort = query.sort as BrowseSort;
    if (CATEGORIES.includes(query.category as BrowseCategory)) out.category = query.category as BrowseCategory;
    const venue = str(query.venueTypeId);
    if (venue) out.venueTypeId = venue;
    const publisher = str(query.publisherId);
    if (publisher) out.publisherId = publisher;
    const near = query.near && typeof query.near === "object" ? (query.near as Record<string, unknown>) : null;
    const lat = Number(near?.latitude ?? near?.lat);
    const lng = Number(near?.longitude ?? near?.lng);
    let wantsPlace = false;
    if (near && Number.isFinite(lat) && Number.isFinite(lng)) {
        const radius = Number(near.radiusKm);
        out.near = { latitude: lat, longitude: lng, ...(Number.isFinite(radius) && radius > 0 ? { radiusKm: radius } : {}) };
    } else if (query.near === true || props.source === "NEAR_YOU") {
        wantsPlace = true;
        if (place.city) out.city = place.city;
    } else if (str(query.city)) {
        out.city = str(query.city)!;
    }
    return { query: out, ids: [], wantsPlace };
}

/** Explore with the rail's facets — its "See all" link. */
export function railSeeAllHref(plan: RailPlan): string {
    if (!plan.query) return "/spaces";
    const params = new URLSearchParams();
    if (plan.query.category) params.set("category", plan.query.category);
    if (plan.query.venueTypeId) params.set("venueTypeId", plan.query.venueTypeId);
    if (plan.query.publisherId) params.set("publisherId", plan.query.publisherId);
    if (plan.query.sort && plan.query.sort !== "NEWEST") params.set("sort", plan.query.sort);
    if (plan.query.city) params.set("city", plan.query.city);
    const s = params.toString();
    return s ? `/spaces?${s}` : "/spaces";
}

/* ------------------------------------------------------------------ */
/* PB-4: the thirteen Studio blocks — their props, read strictly       */
/* ------------------------------------------------------------------ */

/**
 * Each parser turns a resolved block's `props` into the shape its
 * component draws, and answers null when the block has nothing to draw
 * (no headline, no picture, no items) — so a half-filled block never
 * reaches a visitor. Studio (C1) renders through the same components with
 * the preview's resolved props, so these are the one reading of a block.
 */

const list = (value: unknown, max: number): Record<string, unknown>[] =>
    (Array.isArray(value) ? value : [])
        .slice(0, max)
        .map((item) => (item && typeof item === "object" && !Array.isArray(item) ? (item as Record<string, unknown>) : null))
        .filter((item): item is Record<string, unknown> => item !== null);

const oneOf = <T extends string>(value: unknown, allowed: readonly T[], fallback: T): T => (allowed.includes(value as T) ? (value as T) : fallback);

/** A call to action: a label and where it goes. */
export interface Cta {
    label: string;
    target: Target | null;
}

export function ctaOf(value: unknown): Cta | null {
    if (!value || typeof value !== "object") return null;
    const cta = value as Record<string, unknown>;
    const label = str(cta.label);
    return label ? { label, target: targetOf(cta.target) } : null;
}

export type HeroAlign = "LEFT" | "CENTER";
export interface HeroProps {
    headline: string;
    subheadline: string | null;
    media: ResolvedMedia | null;
    primaryCta: Cta | null;
    secondaryCta: Cta | null;
    align: HeroAlign;
}

export function heroOf(props: Record<string, unknown>): HeroProps | null {
    const headline = str(props.headline);
    if (!headline) return null;
    return { headline, subheadline: str(props.subheadline), media: mediaOf(props.media), primaryCta: ctaOf(props.primaryCta), secondaryCta: ctaOf(props.secondaryCta), align: oneOf(props.align, ["LEFT", "CENTER"] as const, "LEFT") };
}

export type CtaTone = "BRAND" | "INK" | "PAPER";
export interface CtaStripProps {
    headline: string;
    body: string | null;
    ctaLabel: string;
    target: Target | null;
    tone: CtaTone;
}

export function ctaStripOf(props: Record<string, unknown>): CtaStripProps | null {
    const headline = str(props.headline);
    const ctaLabel = str(props.ctaLabel);
    if (!headline || !ctaLabel) return null;
    return { headline, body: str(props.body), ctaLabel, target: targetOf(props.target), tone: oneOf(props.tone, ["BRAND", "INK", "PAPER"] as const, "BRAND") };
}

export interface ColumnItem {
    title: string | null;
    markdown: string;
    media: ResolvedMedia | null;
    target: Target | null;
}
export interface ColumnsProps {
    columns: ColumnItem[];
}

export function columnsOf(props: Record<string, unknown>): ColumnsProps | null {
    const columns = list(props.columns, 4)
        .map((column) => ({ title: str(column.title), markdown: str(column.markdown) ?? "", media: mediaOf(column.media), target: targetOf(column.target) }))
        .filter((column) => column.markdown || column.title || column.media);
    return columns.length >= 1 ? { columns } : null;
}

export type ImageWidth = "FULL" | "CONTAINED";
export interface ImageProps {
    media: ResolvedMedia;
    caption: string | null;
    target: Target | null;
    width: ImageWidth;
}

export function imageOf(props: Record<string, unknown>): ImageProps | null {
    const media = mediaOf(props.media);
    if (!media) return null;
    return { media, caption: str(props.caption), target: targetOf(props.target), width: oneOf(props.width, ["FULL", "CONTAINED"] as const, "CONTAINED") };
}

export type VideoEmbed = { kind: "youtube" | "vimeo"; src: string } | { kind: "file"; src: string };
export interface VideoProps {
    url: string;
    caption: string | null;
    embed: VideoEmbed;
}

/** Where a video plays from: YouTube and Vimeo through their players (no cookies from YouTube), an https `.mp4` in the page's own player. */
export function videoEmbed(url: string): VideoEmbed | null {
    let parsed: URL;
    try {
        parsed = new URL(url);
    } catch {
        return null;
    }
    if (parsed.protocol !== "https:") return null;
    const host = parsed.hostname.replace(/^www\.|^m\./, "");
    const id = /^[A-Za-z0-9_-]{6,20}$/;
    if (host === "youtube.com" || host === "youtube-nocookie.com") {
        const v = parsed.searchParams.get("v");
        const fromPath = /^\/(?:embed|shorts|v)\/([^/?]+)/.exec(parsed.pathname)?.[1];
        const found = v ?? fromPath ?? null;
        return found && id.test(found) ? { kind: "youtube", src: `https://www.youtube-nocookie.com/embed/${found}` } : null;
    }
    if (host === "youtu.be") {
        const found = parsed.pathname.slice(1).split("/")[0] ?? "";
        return id.test(found) ? { kind: "youtube", src: `https://www.youtube-nocookie.com/embed/${found}` } : null;
    }
    if (host === "vimeo.com" || host === "player.vimeo.com") {
        const found = /(\d{5,})/.exec(parsed.pathname)?.[1];
        return found ? { kind: "vimeo", src: `https://player.vimeo.com/video/${found}` } : null;
    }
    return /\.mp4(?:$|\?)/i.test(parsed.pathname + parsed.search) ? { kind: "file", src: url } : null;
}

export function videoOf(props: Record<string, unknown>): VideoProps | null {
    const url = str(props.url);
    const embed = url ? videoEmbed(url) : null;
    return url && embed ? { url, caption: str(props.caption), embed } : null;
}

export interface FaqProps {
    title: string | null;
    items: { question: string; answer: string }[];
}

export function faqOf(props: Record<string, unknown>): FaqProps | null {
    const items = list(props.items, 20)
        .map((item) => ({ question: str(item.question), answer: str(item.answer) }))
        .filter((item): item is { question: string; answer: string } => !!item.question && !!item.answer);
    return items.length ? { title: str(props.title), items } : null;
}

export interface StepsProps {
    title: string | null;
    items: { title: string; body: string }[];
}

export function stepsOf(props: Record<string, unknown>): StepsProps | null {
    const items = list(props.items, 8)
        .map((item) => ({ title: str(item.title), body: str(item.body) ?? "" }))
        .filter((item): item is { title: string; body: string } => !!item.title);
    return items.length ? { title: str(props.title), items } : null;
}

export interface StatsProps {
    items: { value: string; label: string }[];
}

export function statsOf(props: Record<string, unknown>): StatsProps | null {
    const items = list(props.items, 4)
        .map((item) => ({ value: str(item.value), label: str(item.label) }))
        .filter((item): item is { value: string; label: string } => !!item.value && !!item.label);
    return items.length ? { items } : null;
}

export type DividerStyle = "LINE" | "SPACE";
export interface DividerProps {
    style: DividerStyle;
}

export function dividerOf(props: Record<string, unknown>): DividerProps {
    return { style: oneOf(props.style, ["LINE", "SPACE"] as const, "LINE") };
}

export type ButtonStyle = "PRIMARY" | "SECONDARY";
export interface ButtonRowProps {
    buttons: { label: string; target: Target | null; style: ButtonStyle }[];
}

export function buttonRowOf(props: Record<string, unknown>): ButtonRowProps | null {
    const buttons = list(props.buttons, 4)
        .map((button) => ({ label: str(button.label), target: targetOf(button.target), style: oneOf(button.style, ["PRIMARY", "SECONDARY"] as const, "PRIMARY") }))
        .filter((button): button is { label: string; target: Target | null; style: ButtonStyle } => !!button.label && !!targetHref(button.target));
    return buttons.length ? { buttons } : null;
}

export interface CategoryTilesProps {
    title: string | null;
}

export function categoryTilesOf(props: Record<string, unknown>): CategoryTilesProps {
    return { title: str(props.title) };
}

export type GridColumns = 2 | 3 | 4;
export interface ListingGridProps {
    title: string | null;
    seeAllLabel: string | null;
    columns: GridColumns;
}

/** A listing grid is a rail's query drawn as a grid — `railPlan` reads the query, this reads the rest. */
export function listingGridOf(props: Record<string, unknown>): ListingGridProps {
    const columns = Number(props.columns);
    return { title: str(props.title), seeAllLabel: str(props.seeAllLabel), columns: columns === 2 || columns === 4 ? columns : 3 };
}

export interface FormBlockProps {
    heading: string | null;
    intro: string | null;
    form: FormView;
}

/** The form the server resolved into the block; null (draw nothing) when it is unpublished or gone. */
export function formBlockOf(props: Record<string, unknown>): FormBlockProps | null {
    const form = parseFormView(props.form);
    return form ? { heading: str(props.heading), intro: str(props.intro), form } : null;
}
