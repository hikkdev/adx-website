import { apiConfig } from "./api-config";

/**
 * PB-1 (27 Sep 2026): the site's address table — every Studio page's key,
 * its public address and, for a system page, the route the code serves it
 * at; plus the redirects Studio keeps when an address changes ("Only
 * admins can change the addresses"). `GET /app/site/routes` answers it; the
 * proxy reads it on every request to turn a public address into the route
 * behind it, and `pageHref` turns a page key into its current address so a
 * link never goes stale when ADX moves a page.
 *
 * The matcher is pure: given the table and a pathname, it says pass,
 * redirect or rewrite. The nine system pages are seeded here so the site
 * links itself correctly before the table is ever read — and when it
 * cannot be.
 */

export type SitePageKind = "SYSTEM" | "CUSTOM";
export type SiteChannel = "WEBSITE" | "APPS";

export interface SiteRoutePage {
    key: string;
    kind: SitePageKind;
    title: string;
    /** The public address, with `:param` segments where a system page takes one (`/spaces/:id`). */
    path: string;
    /** The route the code serves a system page at; null for a custom page (served at `/pg/<key>`). */
    internalPath: string | null;
    channels: SiteChannel[];
}

export interface SiteRedirectRow {
    fromPath: string;
    toPath: string;
    permanent: boolean;
}

export interface SiteRoutesTable {
    version: string;
    pages: SiteRoutePage[];
    redirects: SiteRedirectRow[];
}

/* ------------------------------------------------------------------ */
/* The seeded system pages                                             */
/* ------------------------------------------------------------------ */

const system = (key: string, title: string, path: string): SiteRoutePage => ({ key, kind: "SYSTEM", title, path, internalPath: path, channels: ["WEBSITE"] });

/** The nine system pages as the lead seeded them — the fallback for every link and the proxy's "nothing to do". */
export const SEEDED_PAGES: readonly SiteRoutePage[] = Object.freeze([
    system("home", "Home", "/"),
    system("explore", "Explore ad spaces", "/spaces"),
    system("listing", "Ad space", "/spaces/:id"),
    system("categories", "All categories", "/categories"),
    system("formats", "Advertising formats", "/formats"),
    system("how-it-works", "How it works", "/how-it-works"),
    system("advertise", "Advertise with ADX", "/advertise"),
    system("publishers", "For publishers", "/publishers"),
    system("help", "Help centre", "/help"),
]);

export const SEEDED_TABLE: SiteRoutesTable = Object.freeze({ version: "seed", pages: [...SEEDED_PAGES], redirects: [] });

/* ------------------------------------------------------------------ */
/* Reading the answer                                                  */
/* ------------------------------------------------------------------ */

const str = (value: unknown): string | null => (typeof value === "string" && value.trim() ? value.trim() : null);
const PATH = /^\/(?!\/)[^\s?#]*$/;
const HTTPS = /^https:\/\/[^\s]+$/i;

function pageOf(value: unknown): SiteRoutePage | null {
    if (!value || typeof value !== "object") return null;
    const row = value as Record<string, unknown>;
    const key = str(row.key);
    const path = str(row.path);
    if (!key || !path || !PATH.test(path)) return null;
    const kind: SitePageKind = row.kind === "CUSTOM" ? "CUSTOM" : "SYSTEM";
    const internal = str(row.internalPath);
    const channels = (Array.isArray(row.channels) ? row.channels : []).filter((c): c is SiteChannel => c === "WEBSITE" || c === "APPS");
    return { key, kind, title: str(row.title) ?? key, path, internalPath: kind === "SYSTEM" ? (internal && PATH.test(internal) ? internal : path) : null, channels: channels.length ? channels : ["WEBSITE"] };
}

function redirectOf(value: unknown): SiteRedirectRow | null {
    if (!value || typeof value !== "object") return null;
    const row = value as Record<string, unknown>;
    const from = str(row.fromPath);
    const to = str(row.toPath);
    if (!from || !to || !PATH.test(from) || !(PATH.test(to) || HTTPS.test(to))) return null;
    return { fromPath: from, toPath: to, permanent: row.permanent !== false };
}

/** The table, read strictly — a row that is not a page or a redirect is left out; no table at all is null. */
export function parseSiteRoutes(answer: unknown): SiteRoutesTable | null {
    const row = answer && typeof answer === "object" && "data" in (answer as object) && !("pages" in (answer as object)) ? (answer as { data: unknown }).data : answer;
    if (!row || typeof row !== "object") return null;
    const table = row as Record<string, unknown>;
    if (!Array.isArray(table.pages)) return null;
    return {
        version: str(table.version) ?? "",
        pages: table.pages.map(pageOf).filter((page): page is SiteRoutePage => page !== null),
        redirects: (Array.isArray(table.redirects) ? table.redirects : []).map(redirectOf).filter((r): r is SiteRedirectRow => r !== null),
    };
}

/* ------------------------------------------------------------------ */
/* Patterns                                                            */
/* ------------------------------------------------------------------ */

/** A path's segments, with no empty ones and no trailing slash: "/spaces/x/" → ["spaces", "x"]. */
export function segmentsOf(path: string): string[] {
    return path.split("/").filter((segment) => segment.length > 0);
}

/** The params a pattern captures from a pathname (`/spaces/:id` on `/spaces/LST-1` → `{ id: "LST-1" }`), or null when it does not match. */
export function matchPattern(pattern: string, pathname: string): Record<string, string> | null {
    const wanted = segmentsOf(pattern);
    const given = segmentsOf(pathname);
    if (wanted.length !== given.length) return null;
    const params: Record<string, string> = {};
    for (let index = 0; index < wanted.length; index += 1) {
        const segment = wanted[index]!;
        const value = given[index]!;
        if (segment.startsWith(":")) {
            if (!value) return null;
            params[segment.slice(1)] = value;
        } else if (segment !== value) return null;
    }
    return params;
}

/** A pattern with its params filled in; a param with no value is left as it is. */
export function fillPattern(pattern: string, params: Record<string, string> = {}): string {
    const filled = segmentsOf(pattern).map((segment) => (segment.startsWith(":") ? (params[segment.slice(1)] ?? segment) : segment));
    return `/${filled.join("/")}`;
}

/** Whether a pattern takes params at all. */
export const hasParams = (pattern: string): boolean => segmentsOf(pattern).some((segment) => segment.startsWith(":"));

/* ------------------------------------------------------------------ */
/* The matcher                                                         */
/* ------------------------------------------------------------------ */

export type RouteDecision = { kind: "pass" } | { kind: "redirect"; to: string; permanent: boolean } | { kind: "rewrite"; to: string };

const PASS: RouteDecision = { kind: "pass" };

/** The prefix under which a custom page is served. */
export const PAGE_ROUTE_PREFIX = "/pg";

/** Requests the proxy leaves alone: the API, Next's own files, anything with an extension, Studio and its preview frames. */
export function shouldSkip(pathname: string): boolean {
    if (pathname === "/api" || pathname.startsWith("/api/")) return true;
    if (pathname.startsWith("/_next")) return true;
    if (pathname === "/studio" || pathname.startsWith("/studio/")) return true;
    if (pathname === "/preview" || pathname.startsWith("/preview/")) return true;
    const last = segmentsOf(pathname).at(-1) ?? "";
    return /\.[a-z0-9]+$/i.test(last);
}

/** Pages ordered so a literal address wins over one with a `:param` — `/spaces/deals` before `/spaces/:id`. */
function ordered(pages: SiteRoutePage[]): SiteRoutePage[] {
    return [...pages.filter((page) => !hasParams(page.path)), ...pages.filter((page) => hasParams(page.path))];
}

/**
 * What to do with a request at `pathname`, in the contract's order: (1) a
 * redirect's source → redirect; (2) a custom page's address → rewrite to
 * `/pg/<key>`; (3) a system page moved off its route → rewrite to the
 * route; (4) a request at a moved system page's old route → redirect to
 * the public address; (5) `/pg/<key>` hit directly → redirect to the
 * page's address — unless it carries a preview token, which is Studio's
 * frame of a page that may not be published yet.
 */
export function resolveRequest(table: SiteRoutesTable | null, pathname: string, options: { preview?: boolean } = {}): RouteDecision {
    if (!table || shouldSkip(pathname)) return PASS;
    const clean = pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;

    for (const redirect of table.redirects) {
        const params = matchPattern(redirect.fromPath, clean);
        if (!params) continue;
        const to = HTTPS.test(redirect.toPath) ? redirect.toPath : fillPattern(redirect.toPath, params);
        return { kind: "redirect", to, permanent: redirect.permanent };
    }

    const pages = ordered(table.pages);
    for (const page of pages) {
        const params = matchPattern(page.path, clean);
        if (!params) continue;
        if (page.kind === "CUSTOM") return { kind: "rewrite", to: `${PAGE_ROUTE_PREFIX}/${encodeURIComponent(page.key)}` };
        if (page.internalPath && page.internalPath !== page.path) return { kind: "rewrite", to: fillPattern(page.internalPath, params) };
        return PASS;
    }

    for (const page of pages) {
        if (page.kind !== "SYSTEM" || !page.internalPath || page.internalPath === page.path) continue;
        const params = matchPattern(page.internalPath, clean);
        if (params) return { kind: "redirect", to: fillPattern(page.path, params), permanent: true };
    }

    const direct = matchPattern(`${PAGE_ROUTE_PREFIX}/:key`, clean);
    if (direct && !options.preview) {
        const page = table.pages.find((row) => row.kind === "CUSTOM" && row.key === decodeURIComponent(direct.key!));
        if (page) return { kind: "redirect", to: page.path, permanent: true };
    }
    return PASS;
}

/* ------------------------------------------------------------------ */
/* Links                                                               */
/* ------------------------------------------------------------------ */

let remembered: SiteRoutesTable | null = null;

/** The table every `pageHref` reads: set by the root layout on the server and by `SiteRoutesProvider` in the browser. */
export function rememberSiteRoutes(table: SiteRoutesTable | null): void {
    remembered = table;
}

export function currentSiteRoutes(): SiteRoutesTable {
    return remembered ?? SEEDED_TABLE;
}

/**
 * A page's current address by its key — the table's, else the seeded one,
 * else its `/pg/<key>` route (a custom page not yet published). `params`
 * fill a system page's `:param`; a `hash` or `search` rides along.
 */
export function pageHref(key: string, params: Record<string, string> = {}, options: { table?: SiteRoutesTable | null; hash?: string; search?: string } = {}): string {
    const table = options.table ?? currentSiteRoutes();
    const page = table.pages.find((row) => row.key === key) ?? SEEDED_PAGES.find((row) => row.key === key);
    const base = page ? fillPattern(page.path, params) : `${PAGE_ROUTE_PREFIX}/${encodeURIComponent(key)}`;
    const search = options.search ? (options.search.startsWith("?") ? options.search : `?${options.search}`) : "";
    const hash = options.hash ? (options.hash.startsWith("#") ? options.hash : `#${options.hash}`) : "";
    return `${base}${search}${hash}`;
}

/* ------------------------------------------------------------------ */
/* Reading                                                             */
/* ------------------------------------------------------------------ */

/** How long a process keeps the table — the backend's own cache is 60 s. */
export const SITE_ROUTES_REVALIDATE_SECONDS = 60;

let memo: { at: number; table: SiteRoutesTable } | null = null;

/**
 * The table, kept a minute in this process and asked of ADX with Next's
 * own `revalidate` besides; two and a half seconds at most. When ADX does
 * not answer, the last good table is used, and with none the answer is
 * null — the proxy then passes every request through and the links fall
 * back to the seeded addresses.
 */
export async function readSiteRoutes(baseUrl: string = apiConfig.baseUrl, now: number = Date.now()): Promise<SiteRoutesTable | null> {
    if (memo && now - memo.at < SITE_ROUTES_REVALIDATE_SECONDS * 1000) return memo.table;
    try {
        const response = await fetch(`${baseUrl}/app/site/routes`, { next: { revalidate: SITE_ROUTES_REVALIDATE_SECONDS }, signal: AbortSignal.timeout(2500) });
        if (!response.ok) return memo?.table ?? null;
        const table = parseSiteRoutes(await response.json());
        if (!table) return memo?.table ?? null;
        memo = { at: now, table };
        return table;
    } catch {
        return memo?.table ?? null;
    }
}

/** Tests: forget the process's table. */
export function resetSiteRoutesCache(): void {
    memo = null;
    remembered = null;
}
