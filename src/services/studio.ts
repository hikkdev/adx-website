import { ApiError } from "@/lib/api-client";
import { apiConfig } from "@/lib/api-config";

/**
 * ST-1 (27 Sep 2026): Studio's own door onto the ADX backend.
 *
 * The owner: "My goal is to be able to edit the layout of existing and
 * create whole new pages, also assign proper URLs to the new pages and edit
 * existing URLs as well." Studio is the editor that does it, on the website
 * itself so a page is drawn with the very components a visitor sees.
 *
 * Studio never touches the party session (`lib/api-client.ts` keeps an
 * advertiser's or a publisher's tokens in localStorage): it keeps the
 * console admin's pair in sessionStorage under its own keys, sends them
 * itself, refreshes them itself, and forgets them when the tab closes — so
 * an operator checking a publisher workspace in one tab and laying out the
 * home page in another never has one session trample the other.
 */

/* ------------------------------------------------------------------ */
/* Configuration                                                       */
/* ------------------------------------------------------------------ */

export const studioConfig = {
    /** Where the console is — the only place Studio is opened from ("Open Studio from the console"). */
    consoleUrl: (process.env.NEXT_PUBLIC_CONSOLE_URL ?? "http://localhost:5173").replace(/\/$/, ""),
    siteUrl: apiConfig.siteUrl,
};

/* ------------------------------------------------------------------ */
/* Token storage — sessionStorage, Studio's own keys                   */
/* ------------------------------------------------------------------ */

const ACCESS_KEY = "adx.studio.accessToken";
const REFRESH_KEY = "adx.studio.refreshToken";

let accessCache: string | null = null;
const tokenListeners = new Set<() => void>();
const notify = () => tokenListeners.forEach((listener) => listener());

const storage = (): Storage | null => {
    if (typeof window === "undefined") return null;
    try {
        return window.sessionStorage;
    } catch {
        return null;
    }
};

export const studioTokens = {
    subscribe(listener: () => void) {
        tokenListeners.add(listener);
        return () => {
            tokenListeners.delete(listener);
        };
    },
    get access(): string | null {
        if (accessCache) return accessCache;
        accessCache = storage()?.getItem(ACCESS_KEY) ?? null;
        return accessCache;
    },
    get refresh(): string | null {
        return storage()?.getItem(REFRESH_KEY) ?? null;
    },
    set(next: { accessToken: string; refreshToken?: string | null }) {
        accessCache = next.accessToken;
        const store = storage();
        store?.setItem(ACCESS_KEY, next.accessToken);
        if (next.refreshToken) store?.setItem(REFRESH_KEY, next.refreshToken);
        notify();
    },
    clear() {
        accessCache = null;
        const store = storage();
        store?.removeItem(ACCESS_KEY);
        store?.removeItem(REFRESH_KEY);
        notify();
    },
};

/**
 * The console hands Studio its session in the URL fragment —
 * `#token=<access>&refresh=<refresh>` — never the query, so it is never
 * logged by a server or sent in a Referer. This reads it; the caller clears
 * the fragment at once.
 */
export function parseHandoff(hash: string | null | undefined): { accessToken: string; refreshToken: string | null } | null {
    if (!hash) return null;
    const raw = hash.startsWith("#") ? hash.slice(1) : hash;
    if (!raw) return null;
    const params = new URLSearchParams(raw);
    const accessToken = params.get("token")?.trim();
    if (!accessToken) return null;
    const refreshToken = params.get("refresh")?.trim() || null;
    return { accessToken, refreshToken };
}

/* ------------------------------------------------------------------ */
/* Request                                                             */
/* ------------------------------------------------------------------ */

const REQUEST_TIMEOUT_MS = 45_000;

export interface StudioRequestOptions extends Omit<RequestInit, "body"> {
    body?: unknown;
    _retried?: boolean;
}

let refreshInFlight: Promise<boolean> | null = null;

async function refreshStudioToken(): Promise<boolean> {
    const refreshToken = studioTokens.refresh;
    if (!refreshToken) return false;
    if (!refreshInFlight) {
        refreshInFlight = (async () => {
            try {
                const response = await fetch(`${apiConfig.baseUrl}/auth/refresh`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ refreshToken }),
                });
                if (!response.ok) return false;
                const payload = (await response.json()) as { data?: { accessToken?: string; refreshToken?: string } };
                const next = payload?.data;
                if (!next?.accessToken) return false;
                studioTokens.set({ accessToken: next.accessToken, refreshToken: next.refreshToken });
                return true;
            } catch {
                return false;
            } finally {
                refreshInFlight = null;
            }
        })();
    }
    return refreshInFlight;
}

const sessionEndedListeners = new Set<() => void>();

/** Fired when Studio's session cannot be recovered — the shell shows "Open Studio from the console". */
export function onStudioSessionEnded(listener: () => void): () => void {
    sessionEndedListeners.add(listener);
    return () => {
        sessionEndedListeners.delete(listener);
    };
}

function endStudioSession() {
    studioTokens.clear();
    sessionEndedListeners.forEach((listener) => listener());
}

async function send(path: string, options: StudioRequestOptions): Promise<Response> {
    const { body, _retried, headers, ...rest } = options;
    const requestHeaders = new Headers(headers);
    if (body !== undefined && !(body instanceof FormData)) requestHeaders.set("Content-Type", "application/json");
    const token = studioTokens.access;
    if (token) requestHeaders.set("Authorization", `Bearer ${token}`);

    let response: Response;
    try {
        response = await fetch(`${apiConfig.baseUrl}${path}`, {
            ...rest,
            signal: rest.signal ?? AbortSignal.timeout(REQUEST_TIMEOUT_MS),
            headers: requestHeaders,
            body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body),
        });
    } catch (error) {
        if (error instanceof DOMException && error.name === "TimeoutError") throw new ApiError(0, "TIMEOUT", "The server took too long to respond.");
        throw new ApiError(0, "NETWORK", "Could not reach ADX.");
    }

    if (response.status === 401 && !_retried) {
        const refreshed = await refreshStudioToken();
        if (refreshed) return send(path, { ...options, _retried: true });
        if (studioTokens.access || studioTokens.refresh) endStudioSession();
        throw new ApiError(401, "UNAUTHENTICATED", "Your Studio session has expired — open Studio from the console again.");
    }
    return response;
}

/** The backend's `{ success, data }` envelope unwrapped, with Studio's own bearer. */
export async function studioFetch<T>(path: string, options: StudioRequestOptions = {}): Promise<T> {
    const response = await send(path, options);
    if (response.status === 204) return undefined as T;
    let payload: unknown;
    try {
        payload = await response.json();
    } catch {
        if (response.ok) return undefined as T;
        throw new ApiError(response.status, "BAD_RESPONSE", "The server sent an unreadable response.");
    }
    const envelope = payload as { success?: boolean; data?: T; error?: { code?: string; message?: string; details?: unknown } };
    if (!response.ok || envelope.success === false) {
        throw new ApiError(response.status, envelope.error?.code ?? "REQUEST_FAILED", envelope.error?.message ?? "Something went wrong.", envelope.error?.details);
    }
    return (envelope.data ?? (payload as T)) as T;
}

export const studioApi = {
    get: <T>(path: string, options?: StudioRequestOptions) => studioFetch<T>(path, { ...options, method: "GET" }),
    post: <T>(path: string, body?: unknown, options?: StudioRequestOptions) => studioFetch<T>(path, { ...options, method: "POST", body }),
    put: <T>(path: string, body?: unknown, options?: StudioRequestOptions) => studioFetch<T>(path, { ...options, method: "PUT", body }),
    patch: <T>(path: string, body?: unknown, options?: StudioRequestOptions) => studioFetch<T>(path, { ...options, method: "PATCH", body }),
    delete: <T>(path: string, options?: StudioRequestOptions) => studioFetch<T>(path, { ...options, method: "DELETE" }),
};

/* ------------------------------------------------------------------ */
/* The vocabulary — surfaces, sides, stages, targets                   */
/* ------------------------------------------------------------------ */

/** The four app homes Studio lays out in a phone frame. */
export const APP_SURFACES = ["APP_ADVERTISER_HOME", "APP_PUBLISHER_HOME", "APP_PARTNER_HOME", "AGENT_HOME"] as const;
export type AppSurface = (typeof APP_SURFACES)[number];
export const isAppSurface = (value: string): value is AppSurface => (APP_SURFACES as readonly string[]).includes(value);

/** The backend's `SURFACE_LABEL`, for when a read has not answered a label. */
export const SURFACE_LABEL: Record<string, string> = {
    WEB_HOME: "Website — Home page",
    WEB_EXPLORE: "Website — Explore page",
    WEB_FORMATS: "Website — Advertising formats page",
    WEB_LISTING: "Website — Listing page",
    APP_ADVERTISER_HOME: "User app — Advertiser home",
    APP_PUBLISHER_HOME: "User app — Publisher home",
    APP_PARTNER_HOME: "User app — Print partner home",
    AGENT_HOME: "Agent app — Home",
    WEB_CATEGORIES: "Website — All categories page",
    WEB_HOW_IT_WORKS: "Website — How it works page",
    WEB_ADVERTISE: "Website — Advertise with ADX page",
    WEB_PUBLISHERS: "Website — For publishers page",
    WEB_HELP: "Website — Help page",
};

export const surfaceLabel = (surface: string): string => SURFACE_LABEL[surface] ?? surface.replace(/_/g, " ").toLowerCase();

/** The nine SYSTEM pages the lead seeded — Studio's fallback while `GET /site/pages` is not yet answering. */
export const SYSTEM_PAGE_SEEDS: readonly { key: string; surface: string; path: string; title: string }[] = [
    { key: "home", surface: "WEB_HOME", path: "/", title: "Home" },
    { key: "explore", surface: "WEB_EXPLORE", path: "/spaces", title: "Explore" },
    { key: "listing", surface: "WEB_LISTING", path: "/spaces/:id", title: "Ad space" },
    { key: "categories", surface: "WEB_CATEGORIES", path: "/categories", title: "All categories" },
    { key: "formats", surface: "WEB_FORMATS", path: "/formats", title: "Advertising formats" },
    { key: "how-it-works", surface: "WEB_HOW_IT_WORKS", path: "/how-it-works", title: "How it works" },
    { key: "advertise", surface: "WEB_ADVERTISE", path: "/advertise", title: "Advertise with ADX" },
    { key: "publishers", surface: "WEB_PUBLISHERS", path: "/publishers", title: "For publishers" },
    { key: "help", surface: "WEB_HELP", path: "/help", title: "Help" },
];

export const seedForKey = (key: string) => SYSTEM_PAGE_SEEDS.find((seed) => seed.key === key) ?? null;
export const seedForSurface = (surface: string) => SYSTEM_PAGE_SEEDS.find((seed) => seed.surface === surface) ?? null;

export const SIDES = ["VISITOR", "ADVERTISER", "PUBLISHER", "PARTNER", "AGENT_FIELD", "AGENT_SALES"] as const;
export type Side = (typeof SIDES)[number];
export const SIDE_LABEL: Record<Side, string> = {
    VISITOR: "Visitor (signed out)",
    ADVERTISER: "Advertiser",
    PUBLISHER: "Publisher",
    PARTNER: "Print partner",
    AGENT_FIELD: "Field agent",
    AGENT_SALES: "Sales agent",
};

/** The sides that can ever see a surface — the "viewing as" chooser offers these. */
export function sidesFor(surface: string | null): readonly Side[] {
    switch (surface) {
        case "APP_ADVERTISER_HOME":
            return ["ADVERTISER"];
        case "APP_PUBLISHER_HOME":
            return ["PUBLISHER"];
        case "APP_PARTNER_HOME":
            return ["PARTNER"];
        case "AGENT_HOME":
            return ["AGENT_FIELD", "AGENT_SALES"];
        default:
            return ["VISITOR", "ADVERTISER", "PUBLISHER"];
    }
}

export const CITY_STAGES = ["PLANNED", "SEEDING", "LAUNCHED", "PAUSED", "WITHDRAWN"] as const;
export type CityStage = (typeof CITY_STAGES)[number];
export const STAGE_LABEL: Record<CityStage, string> = { PLANNED: "Planned", SEEDING: "Coming soon", LAUNCHED: "Live", PAUSED: "Paused", WITHDRAWN: "Closed" };

/** PB-1: `PAGE` names a Studio page by its key — the website resolves it to the page's current address. */
export const TARGET_KINDS = ["ROUTE", "URL", "LISTING", "CATEGORY", "VENUE", "CONTENT", "NEW_CAMPAIGN", "EXPLORE", "PAGE"] as const;
export type TargetKind = (typeof TARGET_KINDS)[number];
export const TARGET_KIND_META: Record<TargetKind, { label: string; needsValue: boolean; placeholder: string }> = {
    ROUTE: { label: "Website path", needsValue: true, placeholder: "/spaces?city=Pune" },
    URL: { label: "Web address", needsValue: true, placeholder: "https://…" },
    LISTING: { label: "A listing", needsValue: true, placeholder: "Listing id" },
    CATEGORY: { label: "A category", needsValue: true, placeholder: "OUTDOOR" },
    VENUE: { label: "A venue type", needsValue: true, placeholder: "Venue type id" },
    CONTENT: { label: "A content page", needsValue: true, placeholder: "how-it-works" },
    NEW_CAMPAIGN: { label: "Start a campaign", needsValue: false, placeholder: "" },
    EXPLORE: { label: "Explore", needsValue: false, placeholder: "" },
    PAGE: { label: "A Studio page", needsValue: true, placeholder: "Page key" },
};
export const LISTING_CATEGORIES = ["INDOOR", "OUTDOOR", "TRANSIT", "MEDIA"] as const;

/** Blocks that close their surface: always last, never hidden, never targeted away (the backend's `PINNED_LAST`). */
export const PINNED_LAST: Record<string, readonly string[]> = { WEB_EXPLORE: ["results"] };
export const pinnedFor = (surface: string | null): readonly string[] => (surface ? (PINNED_LAST[surface] ?? []) : []);

/* ------------------------------------------------------------------ */
/* Types — the API's shapes                                            */
/* ------------------------------------------------------------------ */

export interface StudioUser {
    id: string;
    name: string | null;
    email: string | null;
    roles: string[];
    avatarUrl?: string | null;
}

/** One prop of a block type, as the backend describes it; `input` may be one this build does not know (edited as JSON). */
export interface FieldSpec {
    key: string;
    label: string;
    input: string;
    required?: boolean;
    options?: { value: string; label: string }[];
    min?: number;
    max?: number;
    spec?: string;
    of?: FieldSpec[];
    hint?: string;
}

export interface BlockTypeDef {
    type: string;
    label: string;
    kind: "SYSTEM" | "CONTENT";
    surfaces: string[];
    props: FieldSpec[];
}

export interface BlockVisibility {
    sides?: Side[];
    cityIds?: string[];
    stages?: CityStage[];
}
export interface BlockSchedule {
    startsAt?: string;
    endsAt?: string;
}
export interface BlockEnvelope {
    visibility?: BlockVisibility;
    schedule?: BlockSchedule;
    hidden?: boolean;
}

export interface LayoutBlock extends BlockEnvelope {
    id: string;
    type: string;
    props: Record<string, unknown>;
}

export interface ResolvedBlock {
    id: string;
    type: string;
    props: Record<string, unknown>;
}

export interface ResolvedLayout {
    surface?: string;
    key?: string;
    version: number;
    isDefault: boolean;
    blocks: ResolvedBlock[];
}

/** SEO for a page, kept on the version (`meta`). The picture is a library id; the public read resolves it to `seoImage`. */
export interface PageMeta {
    seoTitle?: string;
    seoDescription?: string;
    seoImageMediaId?: string;
    noindex?: boolean;
}

export type VersionStatus = "DRAFT" | "PUBLISHED" | "RETIRED";

export interface VersionView {
    id: string;
    number: number;
    status: VersionStatus;
    blocks: LayoutBlock[];
    meta?: PageMeta | null;
    changeNote: string | null;
    createdAt: string;
    updatedAt?: string;
    publishedAt: string | null;
    retiredAt?: string | null;
    publishedBy?: { id: string; name?: string | null } | string | null;
}

export interface SurfaceSummary {
    surface: string;
    label: string;
    live: { number: number; publishedAt: string | null } | null;
    draft: { number: number; updatedAt: string } | null;
}

export interface SurfaceDetail {
    surface: string;
    label?: string;
    live: VersionView | null;
    draft: VersionView | null;
    defaults: LayoutBlock[];
}

export type PageKind = "SYSTEM" | "CUSTOM";
export type PageChannel = "WEBSITE" | "APPS";

export interface SitePageRow {
    id: string;
    key: string;
    kind: PageKind;
    title: string;
    path: string;
    internalPath: string | null;
    surface: string | null;
    channels: PageChannel[];
    addressLocked: boolean;
    archivedAt: string | null;
    live: { number: number; publishedAt: string | null } | null;
    draft: { number: number; updatedAt: string } | null;
    updatedAt: string;
    redirectCount?: number;
}

export interface SitePageDetail extends Omit<SitePageRow, "live" | "draft"> {
    live: VersionView | null;
    draft: VersionView | null;
    versions?: VersionView[];
    defaults?: LayoutBlock[];
}

export interface NewPageInput {
    key: string;
    title: string;
    path: string;
    channels?: PageChannel[];
    template?: "blank" | "event" | "landing";
}

export interface PagePatch {
    title?: string;
    channels?: PageChannel[];
    path?: string;
}

export interface MediaAsset {
    id: string;
    url: string;
    mime: string;
    width: number | null;
    height: number | null;
    bytes: number | null;
    altText: string | null;
    title: string | null;
    tags: string[];
    spec: string | null;
    archivedAt: string | null;
    createdAt: string;
}

export interface MediaSpec {
    key: string;
    label: string;
    width: number;
    height: number;
    minWidth: number;
    minHeight: number;
    maxBytes: number;
    formats: string[];
}

export interface SlotRow {
    key: string;
    label: string;
    spec?: string;
}

export interface FormRow {
    id?: string;
    key: string;
    title: string;
    destination?: string;
    live?: { number: number } | null;
}

export interface CityRow {
    id: string;
    name: string;
    state?: string | null;
    stage?: string;
}

export interface ListingHit {
    id: string;
    displayId: string | null;
    title: string;
    city: string | null;
    category?: string;
}

export interface PreviewToken {
    token: string;
    expiresAt: string;
}

/** One problem the server named on a block — `{ index, blockId, type, path, message }` in a 400's details. */
export interface BlockIssue {
    index: number;
    blockId: string | null;
    type: string | null;
    path: string;
    message: string;
}

/* ------------------------------------------------------------------ */
/* Pure helpers                                                        */
/* ------------------------------------------------------------------ */

/** The editor's target: a Studio page (system or custom, by key) or an app home (by surface). */
export type EditorTarget = { kind: "page"; key: string } | { kind: "surface"; surface: string };

/** Where a target's versions live: a SYSTEM page's on `/layouts/:surface`, a CUSTOM page's on `/site/pages/:key`. */
export type VersionBase = { kind: "surface"; surface: string } | { kind: "custom"; key: string };

export const versionPath = (base: VersionBase): string => (base.kind === "surface" ? `/layouts/${encodeURIComponent(base.surface)}` : `/site/pages/${encodeURIComponent(base.key)}`);

/** The address the real page answers at, with the preview token for a draft. */
export function previewUrl(path: string, token: string | null, siteUrl = ""): string {
    const clean = path.startsWith("/") ? path : `/${path}`;
    const joiner = clean.includes("?") ? "&" : "?";
    return token ? `${siteUrl}${clean}${joiner}preview=${encodeURIComponent(token)}` : `${siteUrl}${clean}`;
}

/**
 * Where the real page is asked for its draft. A SYSTEM page answers at its
 * own address; a CUSTOM page at `/pg/<key>` — the proxy lists a custom
 * page's address only once it is published, and never redirects `/pg/<key>`
 * away while `preview` is in the query (builder C2, 28 Sep 2026).
 */
export function previewPathFor(page: { kind: PageKind; key: string; path: string }): string {
    return page.kind === "CUSTOM" ? `/pg/${encodeURIComponent(page.key)}` : page.path;
}

/** A page whose address takes a parameter (`/spaces/:id`) has no one page to preview. */
export const hasPathParam = (path: string | null | undefined): boolean => !!path && /(^|\/):[a-zA-Z0-9_]+/.test(path);

/** A stable id for a new block — the browser's UUID, or a random fallback in a runner without one. */
export function newBlockId(): string {
    const cryptoRef = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
    if (cryptoRef?.randomUUID) return cryptoRef.randomUUID();
    return `blk-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** The props a fresh block starts with: a required select takes its first option, a required number its minimum, a required target Explore. */
export function defaultProps(specs: readonly FieldSpec[]): Record<string, unknown> {
    const props: Record<string, unknown> = {};
    for (const spec of specs) {
        if (!spec.required) continue;
        if (spec.input === "select" && spec.options?.[0]) props[spec.key] = spec.options[0].value;
        if (spec.input === "number") props[spec.key] = spec.min ?? 1;
        if (spec.input === "target") props[spec.key] = { kind: "EXPLORE" };
        if (spec.input === "list" && spec.of) props[spec.key] = Array.from({ length: Math.max(1, spec.min ?? 1) }, () => defaultProps(spec.of!));
    }
    return props;
}

/**
 * Props as the API wants them: an empty string, an empty object, an
 * undefined or a null is left out at every depth (a cleared "Which one" is
 * no value, not `""` — the schema says `min(1)`); `0` and `false` stay.
 */
export function cleanProps(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(cleanProps).filter((item) => item !== undefined);
    if (value && typeof value === "object") {
        const out: Record<string, unknown> = {};
        for (const [key, inner] of Object.entries(value as Record<string, unknown>)) {
            const cleaned = cleanProps(inner);
            if (cleaned === undefined) continue;
            if (cleaned && typeof cleaned === "object" && !Array.isArray(cleaned) && Object.keys(cleaned).length === 0) continue;
            out[key] = cleaned;
        }
        return out;
    }
    if (value === "" || value === undefined || value === null) return undefined;
    if (typeof value === "string") return value;
    return value;
}

/** Empty visibility and schedule removed, so the saved block carries only what narrows it. */
export function cleanBlock(block: LayoutBlock): LayoutBlock {
    const out: LayoutBlock = { id: block.id, type: block.type, props: (cleanProps(block.props ?? {}) as Record<string, unknown>) ?? {} };
    const v = block.visibility;
    if (v && ((v.sides?.length ?? 0) > 0 || (v.cityIds?.length ?? 0) > 0 || (v.stages?.length ?? 0) > 0)) {
        out.visibility = {};
        if (v.sides?.length) out.visibility.sides = v.sides;
        if (v.cityIds?.length) out.visibility.cityIds = v.cityIds;
        if (v.stages?.length) out.visibility.stages = v.stages;
    }
    const s = block.schedule;
    if (s && (s.startsAt || s.endsAt)) {
        out.schedule = {};
        if (s.startsAt) out.schedule.startsAt = s.startsAt;
        if (s.endsAt) out.schedule.endsAt = s.endsAt;
    }
    if (block.hidden) out.hidden = true;
    return out;
}

function canonical(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(canonical);
    if (value && typeof value === "object") {
        const out: Record<string, unknown> = {};
        for (const key of Object.keys(value as Record<string, unknown>).sort()) {
            const item = (value as Record<string, unknown>)[key];
            if (item === undefined) continue;
            out[key] = canonical(item);
        }
        return out;
    }
    return value;
}

/** True when the two lists would save the same — key order does not make a draft dirty. */
export function sameBlocks(a: readonly LayoutBlock[], b: readonly LayoutBlock[]): boolean {
    return JSON.stringify(canonical(a.map(cleanBlock))) === JSON.stringify(canonical(b.map(cleanBlock)));
}

/** Pinned blocks (Explore's `results`) back at the end, in their order. */
export function keepPinnedLast(list: readonly LayoutBlock[], pinnedTypes: readonly string[]): LayoutBlock[] {
    if (pinnedTypes.length === 0) return [...list];
    return [...list.filter((block) => !pinnedTypes.includes(block.type)), ...list.filter((block) => pinnedTypes.includes(block.type))];
}

/* ---- Puck's data and back ---- */

/** The key inside a Puck item's props that carries the block's envelope — no field is declared for it, so Puck never shows it. */
export const ENVELOPE_KEY = "__adx";

export interface PuckItem {
    type: string;
    props: Record<string, unknown> & { id: string };
}
export interface PuckPageData {
    root: { props: Record<string, unknown> };
    content: PuckItem[];
    zones?: Record<string, PuckItem[]>;
}

export function envelopeOf(block: BlockEnvelope): BlockEnvelope {
    const env: BlockEnvelope = {};
    if (block.visibility) env.visibility = block.visibility;
    if (block.schedule) env.schedule = block.schedule;
    if (block.hidden) env.hidden = true;
    return env;
}

/** Blocks as Puck edits them: each block's props plus its id, the envelope riding along under `ENVELOPE_KEY`. */
export function toPuckData(blocks: readonly LayoutBlock[]): PuckPageData {
    return {
        root: { props: {} },
        content: blocks.map((block) => ({ type: block.type, props: { ...block.props, id: block.id, [ENVELOPE_KEY]: envelopeOf(block) } })),
    };
}

/** Puck's data back into blocks — the id and the envelope lifted out, the props cleaned, pinned blocks kept last. */
export function fromPuckData(data: PuckPageData | null | undefined, pinnedTypes: readonly string[] = []): LayoutBlock[] {
    const items = Array.isArray(data?.content) ? data!.content : [];
    const blocks = items.map((item, index): LayoutBlock => {
        const { id, [ENVELOPE_KEY]: envelope, ...props } = item.props ?? ({} as PuckItem["props"]);
        const env = (envelope ?? {}) as BlockEnvelope;
        return cleanBlock({ id: typeof id === "string" && id ? id : `block-${index}`, type: item.type, props, visibility: env.visibility, schedule: env.schedule, hidden: env.hidden });
    });
    return keepPinnedLast(blocks, pinnedTypes);
}

/* ---- Resolved props ---- */

export interface CanvasProps {
    /** The block's props with the server's additions (media, query, markdown, ads, form, href) over them. */
    props: Record<string, unknown>;
    /** False when the resolution dropped the block — hidden, out of schedule, or targeted at another viewer. */
    shown: boolean;
}

/**
 * What the canvas draws for each block: the resolved twin's props over the
 * block's own, so rails show real listings and pictures are pictures; a
 * block the resolution dropped keeps its own props and is marked not shown.
 * Before any resolution has answered (`resolved` null) every block is
 * "shown" on its raw props.
 */
export function mergeResolved(blocks: readonly LayoutBlock[], resolved: readonly ResolvedBlock[] | null | undefined): Map<string, CanvasProps> {
    const twins = new Map((resolved ?? []).filter((row) => row && typeof row.id === "string").map((row) => [row.id, row]));
    const out = new Map<string, CanvasProps>();
    for (const block of blocks) {
        const twin = twins.get(block.id);
        if (!resolved) out.set(block.id, { props: block.props, shown: true });
        else if (twin) out.set(block.id, { props: { ...block.props, ...(twin.props ?? {}) }, shown: true });
        else out.set(block.id, { props: block.props, shown: false });
    }
    return out;
}

/** A 400's issues, by block id (or `#index` when the block had none); the list-wide ones under "". */
export function issuesByBlock(details: unknown): Map<string, BlockIssue[]> {
    const raw = (details as { issues?: unknown } | null | undefined)?.issues;
    const map = new Map<string, BlockIssue[]>();
    if (!Array.isArray(raw)) return map;
    for (const item of raw as Partial<BlockIssue>[]) {
        if (!item || typeof item.message !== "string") continue;
        const key = item.blockId ? item.blockId : typeof item.index === "number" && item.index >= 0 ? `#${item.index}` : "";
        const issue: BlockIssue = { index: item.index ?? -1, blockId: item.blockId ?? null, type: item.type ?? null, path: item.path ?? "", message: item.message };
        map.set(key, [...(map.get(key) ?? []), issue]);
    }
    return map;
}

/** The permission ids a 403 carried, or none when the failure was not about permissions. */
export function missingPermissionsOf(details: unknown): string[] {
    const missing = (details as { missing?: unknown } | undefined)?.missing;
    return Array.isArray(missing) ? missing.filter((id): id is string => typeof id === "string") : [];
}

const TIER: Record<string, string> = { view: "View", edit: "Edit", approve: "Approve", delete: "Delete", addresses: "Change addresses for" };

/** "content.approve" → "Approve content"; "content.addresses" → "Change addresses for content". */
export function permissionLabel(id: string): string {
    const [group, ...rest] = id.split(".");
    const tier = rest.join(".");
    if (group && TIER[tier]) return `${TIER[tier]} ${group}`;
    return id;
}

/** What a 403 means to the person: the permission missing, named. */
export function forbiddenMessage(caught: unknown, fallback: string): string {
    if (caught instanceof ApiError && caught.status === 403) {
        const missing = missingPermissionsOf(caught.details);
        if (missing.length) return `This needs a permission your role does not hold: ${missing.map(permissionLabel).join(", ")} (${missing.join(", ")}). Ask a super admin.`;
        return caught.message || fallback;
    }
    return caught instanceof ApiError ? caught.message : fallback;
}

/** "Advertisers · 3 cities · from 1 Oct" — who and when, in a line; null when the block shows to everyone always. */
export function audienceLine(block: BlockEnvelope): string | null {
    const parts: string[] = [];
    const v = block.visibility;
    if (v?.sides?.length) parts.push(v.sides.map((side) => SIDE_LABEL[side] ?? side).join(", "));
    if (v?.cityIds?.length) parts.push(`${v.cityIds.length} ${v.cityIds.length === 1 ? "city" : "cities"}`);
    if (v?.stages?.length) parts.push(`${v.stages.map((stage) => STAGE_LABEL[stage] ?? stage).join("/")} cities`);
    const s = block.schedule;
    const day = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
    if (s?.startsAt && s.endsAt) parts.push(`${day(s.startsAt)} – ${day(s.endsAt)}`);
    else if (s?.startsAt) parts.push(`from ${day(s.startsAt)}`);
    else if (s?.endsAt) parts.push(`until ${day(s.endsAt)}`);
    if (block.hidden) parts.push("hidden");
    return parts.length ? parts.join(" · ") : null;
}

/** A page key from a title: lowercase letters, digits and single hyphens, at most 64. */
export function keyFromTitle(title: string): string {
    return title
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 64)
        .replace(/-+$/g, "");
}

export const PAGE_KEY_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const PATH_PATTERN = /^\/(?:[a-z0-9]+(?:-[a-z0-9]+)*(?:\/(?:[a-z0-9]+(?:-[a-z0-9]+)*|:[a-zA-Z0-9_]+))*)?$/;

/* ------------------------------------------------------------------ */
/* Service                                                             */
/* ------------------------------------------------------------------ */

/**
 * Whose pictures (28 Sep 2026): ADX's own (`adx` — what a page may draw),
 * the advertisers' ad artwork (`advertisers` — it lives with their ads), or
 * both (`all`, the server's default).
 */
export type MediaOwner = "adx" | "advertisers" | "all";

export interface MediaListQuery {
    q?: string;
    spec?: string;
    archived?: boolean;
    owner?: MediaOwner;
    limit?: number;
}

export function mediaQuery(query: MediaListQuery): string {
    const params = new URLSearchParams();
    if (query.q) params.set("q", query.q);
    if (query.spec) params.set("spec", query.spec);
    if (query.archived !== undefined) params.set("archived", String(query.archived));
    if (query.owner) params.set("owner", query.owner);
    if (query.limit) params.set("limit", String(query.limit));
    const qs = params.toString();
    return qs ? `?${qs}` : "";
}

export interface PreviewQuery {
    version?: "draft" | number;
    side?: Side;
    cityId?: string | null;
    stage?: string | null;
}

function previewQuery(query: PreviewQuery): string {
    const params = new URLSearchParams();
    if (query.version !== undefined) params.set("version", String(query.version));
    if (query.side) params.set("side", query.side);
    if (query.cityId) params.set("cityId", query.cityId);
    if (query.stage) params.set("stage", query.stage);
    const qs = params.toString();
    return qs ? `?${qs}` : "";
}

const rows = <T>(answer: T[] | { items?: T[] } | null | undefined): T[] => (Array.isArray(answer) ? answer : (answer?.items ?? []));

/** The version desk of one target — the same seven doors whether the versions live on a surface or a custom page. */
export function versionApi(base: VersionBase) {
    const root = versionPath(base);
    return {
        base,
        /** `GET` — the live version, the draft and the defaults beside them. */
        get: () => studioApi.get<SurfaceDetail | SitePageDetail>(root),
        /** `content.edit`. Validated per type; every problem at once in `details.issues[]`. */
        saveDraft: (input: { blocks: LayoutBlock[]; meta?: PageMeta | null; changeNote?: string | null }) =>
            studioApi.put<VersionView>(`${root}/draft`, { blocks: input.blocks.map(cleanBlock), ...(input.meta !== undefined ? { meta: input.meta } : {}), ...(input.changeNote ? { changeNote: input.changeNote } : {}) }),
        /** `content.delete` — every DELETE names a delete power. */
        discardDraft: () => studioApi.delete<{ message?: string }>(`${root}/draft`),
        preview: (query: PreviewQuery = {}) => studioApi.get<ResolvedLayout>(`${root}/preview${previewQuery(query)}`),
        /** `content.approve`. The live version retires. */
        publish: (changeNote?: string | null) => studioApi.post<VersionView>(`${root}/publish`, changeNote ? { changeNote } : {}),
        versions: () => studioApi.get<VersionView[]>(`${root}/versions`),
        /** `content.approve`. Publishes that version's blocks as a new version. */
        restore: (number: number) => studioApi.post<VersionView>(`${root}/versions/${number}/restore`, {}),
        /** A 24-hour token that lets the real page answer its draft: `?preview=<token>`. */
        previewToken: () => studioApi.post<PreviewToken>(`${root}/preview-token`, {}),
    };
}

export const studioService = {
    /** The same "me" the console verifies with — role ADMIN is what Studio needs. */
    me: () => studioApi.get<StudioUser>("/users/me"),
    pages: {
        list: () => studioApi.get<SitePageRow[]>("/site/pages"),
        get: (key: string) => studioApi.get<SitePageDetail>(`/site/pages/${encodeURIComponent(key)}`),
        create: (input: NewPageInput) => studioApi.post<SitePageDetail | SitePageRow>("/site/pages", input),
        /** `content.edit` for title and channels; `content.addresses` for the path (the old address redirects). */
        patch: (key: string, patch: PagePatch) => studioApi.patch<SitePageRow>(`/site/pages/${encodeURIComponent(key)}`, patch),
        archive: (key: string) => studioApi.post<SitePageRow>(`/site/pages/${encodeURIComponent(key)}/archive`, {}),
        restore: (key: string) => studioApi.post<SitePageRow>(`/site/pages/${encodeURIComponent(key)}/restore-page`, {}),
    },
    layouts: {
        list: () => studioApi.get<SurfaceSummary[]>("/layouts"),
        blockTypes: () => studioApi.get<BlockTypeDef[]>("/layouts/block-types"),
    },
    media: {
        list: async (query: MediaListQuery = {}) => rows(await studioApi.get<MediaAsset[] | { items?: MediaAsset[] }>(`/media${mediaQuery(query)}`)),
        specs: () => studioApi.get<MediaSpec[]>("/media/specs"),
        /** `content.edit`; multipart `file` + `altText`, `title`, `spec`. The server checks the spec: ratio within 1%, the minimum size, the weight cap. */
        upload: (input: { file: File; spec?: string; altText: string; title?: string }) => {
            const body = new FormData();
            body.append("file", input.file);
            if (input.spec) body.append("spec", input.spec);
            body.append("altText", input.altText);
            if (input.title) body.append("title", input.title);
            return studioApi.post<MediaAsset>("/media", body);
        },
    },
    slots: async () => rows(await studioApi.get<SlotRow[] | { items?: SlotRow[] }>("/promotions/slots")),
    forms: async () => rows(await studioApi.get<FormRow[] | { items?: FormRow[] }>("/forms")),
    /** The catalogue's cities with their ids (the envelope names cities by id) — `marketplace.view`. */
    cities: async (q: string) => rows(await studioApi.get<{ items?: CityRow[] } | CityRow[]>(`/geo/cities?q=${encodeURIComponent(q)}&pageSize=10`)),
    listings: async (q: string): Promise<ListingHit[]> => {
        const page = await studioApi.get<{ items?: ListingHit[] }>(`/listings/browse?q=${encodeURIComponent(q)}&pageSize=8`);
        return (page.items ?? []).map((item) => ({ id: item.id, displayId: item.displayId ?? null, title: item.title, city: item.city ?? null, category: item.category }));
    },
    versions: versionApi,
};
