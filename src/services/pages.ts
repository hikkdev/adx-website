import type { MetadataRoute } from "next";
import { api, ApiError } from "@/lib/api-client";
import { apiConfig } from "@/lib/api-config";
import { SEEDED_PAGES, type SiteChannel } from "@/lib/site-routes";
import { askSearch, LAYOUT_REVALIDATE_SECONDS, metaOf, type LayoutAsk, type LayoutMeta, type ResolvedBlock } from "@/services/layouts";

/**
 * PB-4 (27 Sep 2026): a Studio page — a custom page ADX made in Studio,
 * served at its own address (the proxy rewrites it to `/pg/<key>`). `GET
 * /app/pages/:key` answers the published version resolved for whoever is
 * looking, exactly as a surface is (visibility, schedule, media, rails,
 * forms), with the version's SEO settings; a preview token answers the
 * draft. 404 means archived or nothing published — the site's 404.
 */

export interface SitePageView {
    key: string;
    title: string;
    path: string;
    channels: SiteChannel[];
    version: number;
    isDefault: boolean;
    preview: boolean;
    meta: LayoutMeta | null;
    blocks: ResolvedBlock[];
}

const str = (value: unknown): string | null => (typeof value === "string" && value.trim() ? value.trim() : null);

/** The answer, read strictly — anything that is not a page is no page. */
export function parsePage(answer: unknown): SitePageView | null {
    const row = answer && typeof answer === "object" && "data" in (answer as object) && !("blocks" in (answer as object)) ? (answer as { data: unknown }).data : answer;
    if (!row || typeof row !== "object") return null;
    const page = row as Record<string, unknown>;
    const key = str(page.key);
    if (!key || !Array.isArray(page.blocks)) return null;
    return {
        key,
        title: str(page.title) ?? key,
        path: str(page.path) ?? `/pg/${encodeURIComponent(key)}`,
        channels: (Array.isArray(page.channels) ? page.channels : []).filter((c): c is SiteChannel => c === "WEBSITE" || c === "APPS"),
        version: typeof page.version === "number" ? page.version : 0,
        isDefault: page.isDefault === true,
        preview: page.preview === true,
        meta: metaOf(page.meta),
        blocks: page.blocks.filter((block): block is ResolvedBlock => !!block && typeof block === "object" && typeof (block as ResolvedBlock).type === "string"),
    };
}

export function pagePath(key: string, ask: LayoutAsk): string {
    return `/app/pages/${encodeURIComponent(key)}?${askSearch(ask)}`;
}

/** What a server read came to: the page, nothing at that key, or an ADX that did not answer. */
export type PageRead = { kind: "page"; page: SitePageView } | { kind: "missing" } | { kind: "unreachable" };

/**
 * On the server, as a visitor: kept a minute unless a preview token asks
 * for the draft (never kept); two and a half seconds at most. A 404 is
 * "missing" (the site's 404); anything else that is not a page is
 * "unreachable" — the page says so rather than pretending it is gone.
 */
export async function readPageServer(key: string, ask: Omit<LayoutAsk, "side"> = {}, baseUrl: string = apiConfig.baseUrl): Promise<PageRead> {
    try {
        const caching: RequestInit = ask.preview ? { cache: "no-store" } : { next: { revalidate: LAYOUT_REVALIDATE_SECONDS } };
        const response = await fetch(`${baseUrl}${pagePath(key, { ...ask, side: "VISITOR" })}`, { ...caching, signal: AbortSignal.timeout(2500) });
        if (response.status === 404) return { kind: "missing" };
        if (!response.ok) return { kind: "unreachable" };
        const page = parsePage(await response.json());
        return page ? { kind: "page", page } : { kind: "unreachable" };
    } catch {
        return { kind: "unreachable" };
    }
}

export const pagesService = {
    /** In the browser: with the session, so a signed-in side is honoured; null for a page that is not there. */
    read: async (key: string, ask: LayoutAsk): Promise<SitePageView | null> => {
        try {
            return parsePage(await api.get<unknown>(pagePath(key, ask), { anonymous: ask.side === "VISITOR" }));
        } catch (caught) {
            if (caught instanceof ApiError && caught.status === 404) return null;
            throw caught;
        }
    },
};

/* ------------------------------------------------------------------ */
/* The sitemap                                                         */
/* ------------------------------------------------------------------ */

export interface SitemapRow {
    path: string;
    updatedAt: string | null;
}

/** `GET /app/site/sitemap` — the live WEBSITE pages that are not `noindex`, with when they last changed; null when ADX does not answer. */
export async function readSitemapServer(baseUrl: string = apiConfig.baseUrl): Promise<SitemapRow[] | null> {
    try {
        const response = await fetch(`${baseUrl}/app/site/sitemap`, { next: { revalidate: 3600 }, signal: AbortSignal.timeout(2500) });
        if (!response.ok) return null;
        const payload = (await response.json()) as { data?: unknown } | unknown[];
        const rows = Array.isArray(payload) ? payload : Array.isArray((payload as { data?: unknown }).data) ? ((payload as { data: unknown[] }).data as unknown[]) : null;
        if (!rows) return null;
        return rows
            .map((row) => (row && typeof row === "object" ? { path: str((row as Record<string, unknown>).path), updatedAt: str((row as Record<string, unknown>).updatedAt) } : null))
            .filter((row): row is SitemapRow => !!row && !!row.path && /^\/(?!\/)[^\s?#:]*$/.test(row.path));
    } catch {
        return null;
    }
}

/** The seeded system pages a sitemap always names — every one without a `:param`. */
export const SEEDED_SITEMAP: SitemapRow[] = SEEDED_PAGES.filter((page) => !page.path.includes(":")).map((page) => ({ path: page.path, updatedAt: null }));

/**
 * The sitemap's entries: ADX's pages (or the seeded ones when it did not
 * answer), then the static documents (`/contact`, `/privacy`, …) and the
 * policies index — each once, the home page first.
 */
export function sitemapEntries(base: string, rows: SitemapRow[] | null, docSlugs: readonly string[]): MetadataRoute.Sitemap {
    const root = base.replace(/\/$/, "");
    const seen = new Set<string>();
    const out: MetadataRoute.Sitemap = [];
    const add = (path: string, updatedAt: string | null, priority: number) => {
        if (seen.has(path)) return;
        seen.add(path);
        const at = updatedAt ? Date.parse(updatedAt) : Number.NaN;
        out.push({ url: `${root}${path}`, ...(Number.isNaN(at) ? {} : { lastModified: new Date(at) }), changeFrequency: path === "/" ? "daily" : "weekly", priority });
    };
    const pages = rows && rows.length ? rows : SEEDED_SITEMAP;
    const home = pages.find((row) => row.path === "/");
    add("/", home?.updatedAt ?? null, 1);
    for (const row of pages) add(row.path, row.updatedAt, 0.8);
    for (const slug of docSlugs) add(`/${slug}`, null, 0.5);
    add("/legal", null, 0.5);
    return out;
}
