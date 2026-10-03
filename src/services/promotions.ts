import { api, ApiError } from "@/lib/api-client";
import { formatMoney } from "@/services/campaigns";

/**
 * LM-1 — paid placements on ADX, as the website buys them.
 *
 * Two products, both flat rate per day plus GST 18%, both counted per day
 * against a capacity (the busiest day decides, as AV-1 counts a space):
 *
 * - **Display ads** in an ad slot (the listing page's sidebar, say): an
 *   advertiser books a slot for dates, uploads artwork, pays; ADX reviews
 *   the artwork; it runs, rotating with the other ads in the slot. A
 *   rejection refunds in full.
 * - **Sponsored listings** ("boosts"): a publisher pays to have their own
 *   listing shown first — at the top of the search results it matches
 *   (`SEARCH_TOP`) and/or at the head of the "Similar listing" row
 *   (`SIMILAR_TOP`). No artwork review: paid → SCHEDULED → LIVE.
 *
 * Dates are whole UTC days, `YYYY-MM-DD` on the wire into the backend, the
 * first and the LAST day of the run. The server's quote is the one that is
 * charged; the helpers here draw the same arithmetic before it answers.
 */

export type Money = string;

export type PromotionStatus = "DRAFT" | "PENDING_PAYMENT" | "PENDING_REVIEW" | "SCHEDULED" | "LIVE" | "ENDED" | "REJECTED" | "CANCELLED";
export type BoostPlacement = "SEARCH_TOP" | "SIMILAR_TOP";
export type PromotionEventKind = "IMPRESSION" | "CLICK";

/** The GST rate on every paid placement. */
export const PROMOTION_GST_RATE = 0.18;

/* ------------------------------------------------------------------ */
/* Slots and placements                                                */
/* ------------------------------------------------------------------ */

/** `GET /promotions/slots` — an active slot ADX sells display ads in. */
export interface AdSlotInfo {
    key: string;
    label: string;
    description: string | null;
    surfaces: string[];
    /** A media spec key (`AD_SIDEBAR`, `AD_BANNER`…) — the artwork's size. */
    spec: string;
    ratePerDay: Money;
    minDays: number;
    maxConcurrent: number;
}

export interface SlotDay {
    date: string;
    booked: number;
    left: number;
}

/** `GET /promotions/slots/:key/availability` */
export interface SlotAvailability {
    days: SlotDay[];
    nextFreeDate: string | null;
}

/** `GET /promotions/boost/placements` */
export interface BoostPlacementInfo {
    placement: BoostPlacement;
    label: string;
    ratePerDay: Money;
    minDays: number;
    maxConcurrent: number;
}

/** What each placement means, in the buyer's words. */
export const PLACEMENT_MEANING: Record<BoostPlacement, { title: string; line: string }> = {
    SEARCH_TOP: {
        title: "Top of search",
        line: "Your space leads the Explore results it matches — its category and its city — labelled Sponsored.",
    },
    SIMILAR_TOP: {
        title: "Top of similar listings",
        line: "Your space leads the “Similar listing” row on the listings it is similar to, labelled Sponsored.",
    },
};

export const BOOST_PLACEMENTS: BoostPlacement[] = ["SEARCH_TOP", "SIMILAR_TOP"];

/* ------------------------------------------------------------------ */
/* Media specs                                                         */
/* ------------------------------------------------------------------ */

/** `GET /media/specs` — the sizes artwork is checked against. */
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

const IMAGE_FORMATS = ["image/jpeg", "image/png", "image/webp"];

/**
 * The contract's five sizes, for when `/media/specs` cannot be read — the
 * browser's check is a courtesy; the server checks the file again.
 */
export const FALLBACK_SPECS: MediaSpec[] = [
    { key: "PROMO_WIDE", label: "Wide banner", width: 1600, height: 480, minWidth: 1600, minHeight: 480, maxBytes: 5 * 1024 * 1024, formats: IMAGE_FORMATS },
    { key: "PROMO_SQUARE", label: "Square banner", width: 1080, height: 1080, minWidth: 1080, minHeight: 1080, maxBytes: 5 * 1024 * 1024, formats: IMAGE_FORMATS },
    { key: "TILE", label: "Tile", width: 600, height: 600, minWidth: 600, minHeight: 600, maxBytes: 5 * 1024 * 1024, formats: IMAGE_FORMATS },
    { key: "AD_SIDEBAR", label: "Sidebar ad", width: 600, height: 750, minWidth: 600, minHeight: 750, maxBytes: 5 * 1024 * 1024, formats: IMAGE_FORMATS },
    { key: "AD_BANNER", label: "Banner ad", width: 1456, height: 180, minWidth: 1456, minHeight: 180, maxBytes: 5 * 1024 * 1024, formats: IMAGE_FORMATS },
];

export function specFor(key: string, specs: MediaSpec[] | null | undefined): MediaSpec | null {
    return (specs ?? []).find((spec) => spec.key === key) ?? FALLBACK_SPECS.find((spec) => spec.key === key) ?? null;
}

/** "600 × 750 px" */
export const specSize = (spec: Pick<MediaSpec, "width" | "height">): string => `${spec.width} × ${spec.height} px`;

/** "JPEG, PNG or WebP" */
export function formatsLabel(formats: string[]): string {
    const names = formats.map((mime) => (mime === "image/jpeg" ? "JPEG" : mime === "image/png" ? "PNG" : mime === "image/webp" ? "WebP" : mime.replace(/^image\//, "").toUpperCase()));
    if (names.length <= 1) return names[0] ?? "an image";
    return `${names.slice(0, -1).join(", ")} or ${names[names.length - 1]}`;
}

/** "5 MB" */
export function bytesLabel(bytes: number): string {
    if (bytes >= 1024 * 1024) return `${Math.round((bytes / (1024 * 1024)) * 10) / 10} MB`;
    return `${Math.round(bytes / 1024)} KB`;
}

/**
 * What is wrong with a picked file against a spec, the way the server will
 * judge it: the format, the weight, the exact ratio within 1%, at least the
 * minimum size. An empty list is a file worth uploading.
 */
export function artworkProblems(file: { type: string; size: number; width: number; height: number }, spec: MediaSpec): string[] {
    const problems: string[] = [];
    if (spec.formats.length && !spec.formats.includes(file.type)) problems.push(`Use ${formatsLabel(spec.formats)} — this file is ${file.type || "an unknown type"}.`);
    if (spec.maxBytes > 0 && file.size > spec.maxBytes) problems.push(`The file is ${bytesLabel(file.size)}; the most this slot takes is ${bytesLabel(spec.maxBytes)}.`);
    if (file.width > 0 && file.height > 0) {
        const wanted = spec.width / spec.height;
        const got = file.width / file.height;
        if (Math.abs(got - wanted) / wanted > 0.01) problems.push(`The artwork must be ${spec.width}:${spec.height} in shape (${specSize(spec)}); this one is ${file.width} × ${file.height}.`);
        if (file.width < spec.minWidth || file.height < spec.minHeight) problems.push(`It must be at least ${spec.minWidth} × ${spec.minHeight} px; this one is ${file.width} × ${file.height}.`);
    }
    return problems;
}

/** The pixel size of an image file, read in the browser. */
export function imageSize(file: Blob): Promise<{ width: number; height: number }> {
    return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(file);
        const image = new Image();
        image.onload = () => {
            resolve({ width: image.naturalWidth, height: image.naturalHeight });
            URL.revokeObjectURL(url);
        };
        image.onerror = () => {
            reject(new Error("That file is not an image the browser can read."));
            URL.revokeObjectURL(url);
        };
        image.src = url;
    });
}

/* ------------------------------------------------------------------ */
/* Money and days                                                      */
/* ------------------------------------------------------------------ */

function toPaise(value: string | number | null | undefined): number | null {
    if (value === null || value === undefined || value === "") return null;
    const n = typeof value === "number" ? value : Number(value);
    if (!Number.isFinite(n)) return null;
    return Math.round(n * 100);
}

const fromPaise = (paise: number): Money => (paise / 100).toFixed(2);

export interface Quote {
    days: number;
    ratePerDay: Money;
    subtotal: Money;
    gstAmount: Money;
    total: Money;
}

/** Days × the rate, GST at 18% on it (rounded to the paisa), and the total. */
export function quoteOf(ratePerDay: Money | number, days: number): Quote | null {
    const rate = toPaise(ratePerDay);
    if (rate === null || !Number.isInteger(days) || days <= 0) return null;
    const subtotal = rate * days;
    const gst = Math.round(subtotal * PROMOTION_GST_RATE);
    return { days, ratePerDay: fromPaise(rate), subtotal: fromPaise(subtotal), gstAmount: fromPaise(gst), total: fromPaise(subtotal + gst) };
}

/** A boost's quote: every chosen placement's rate, added, for the same days. */
export function boostQuoteOf(placements: Pick<BoostPlacementInfo, "placement" | "ratePerDay">[], chosen: BoostPlacement[], days: number): Quote | null {
    const rows = placements.filter((row) => chosen.includes(row.placement));
    if (rows.length === 0 || rows.length !== new Set(chosen).size) return null;
    let rate = 0;
    for (const row of rows) {
        const paise = toPaise(row.ratePerDay);
        if (paise === null) return null;
        rate += paise;
    }
    return quoteOf(fromPaise(rate), days);
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;

export const isIsoDay = (value: unknown): value is string => typeof value === "string" && ISO_DAY.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));

/** `2026-10-11T00:00:00.000Z` or `2026-10-11` → `2026-10-11`. */
export const dayOf = (value: string | null | undefined): string => (typeof value === "string" ? value.slice(0, 10) : "");

/** The first to the last day, both counted; 0 when the range is not one. */
export function runDays(from: string, to: string): number {
    if (!isIsoDay(from) || !isIsoDay(to) || to < from) return 0;
    return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS) + 1;
}

export function addDays(day: string, n: number): string {
    return new Date(Date.parse(`${day}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
}

export const utcToday = (now: Date = new Date()): string => now.toISOString().slice(0, 10);

/** The days in [from, to] that have no room left, as the availability read says. */
export function fullDays(days: Pick<SlotDay, "date" | "left">[], from: string, to: string): string[] {
    return days.filter((day) => day.date >= from && day.date <= to && day.left <= 0).map((day) => day.date);
}

/** "₹1,500.00" — the quote's figures with paise. */
export const money = (value: Money | number | null | undefined): string => formatMoney(value, { paise: "always" });

/** "₹1,500 / day" */
export const perDayLabel = (value: Money | number | null | undefined): string => `${formatMoney(value)} / day`;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "11 Oct 2026" */
export function dayLabel(value: string | null | undefined): string {
    const day = dayOf(value);
    if (!isIsoDay(day)) return "—";
    return `${Number(day.slice(8, 10))} ${MONTHS[Number(day.slice(5, 7)) - 1]} ${day.slice(0, 4)}`;
}

/** "11–17 Oct 2026 · 7 days" */
export function runLabel(from: string | null | undefined, to: string | null | undefined): string {
    const a = dayOf(from);
    const b = dayOf(to);
    if (!isIsoDay(a) || !isIsoDay(b)) return "—";
    const days = runDays(a, b);
    return `${a === b ? dayLabel(a) : `${dayLabel(a)} – ${dayLabel(b)}`} · ${days} day${days === 1 ? "" : "s"}`;
}

/* ------------------------------------------------------------------ */
/* Status                                                              */
/* ------------------------------------------------------------------ */

export type StatusTone = "neutral" | "info" | "success" | "warning" | "danger";

export const STATUS_LABEL: Record<PromotionStatus, { label: string; tone: StatusTone }> = {
    DRAFT: { label: "Draft", tone: "neutral" },
    PENDING_PAYMENT: { label: "Waiting for payment", tone: "warning" },
    PENDING_REVIEW: { label: "In review", tone: "info" },
    SCHEDULED: { label: "Scheduled", tone: "info" },
    LIVE: { label: "Live", tone: "success" },
    ENDED: { label: "Ended", tone: "neutral" },
    REJECTED: { label: "Rejected", tone: "danger" },
    CANCELLED: { label: "Cancelled", tone: "neutral" },
};

export const statusOf = (status: string): { label: string; tone: StatusTone } => STATUS_LABEL[status as PromotionStatus] ?? { label: status, tone: "neutral" };

/** An ad may be edited (and its artwork replaced) only before it is paid for, or after it is turned down. */
export const canEditAd = (status: PromotionStatus): boolean => status === "DRAFT" || status === "REJECTED";
export const canPay = (status: PromotionStatus): boolean => status === "PENDING_PAYMENT";
export const canCancel = (status: PromotionStatus): boolean => status === "DRAFT" || status === "PENDING_PAYMENT" || status === "PENDING_REVIEW" || status === "SCHEDULED" || status === "LIVE";

/**
 * What cancelling does to the money, stated before the button is pressed:
 * nothing paid, nothing to refund; paid and not started, the whole amount
 * back to the wallet; started, it stops and nothing comes back.
 */
export function cancelRule(item: { status: PromotionStatus; startDate: string; total: Money }, today: string = utcToday()): string {
    if (item.status === "DRAFT" || item.status === "PENDING_PAYMENT") return "Nothing has been paid, so nothing is refunded.";
    if (item.status === "LIVE" || dayOf(item.startDate) <= today) return "It has already started: it stops now and nothing is refunded.";
    return `It has not started yet, so the full ${money(item.total)} goes back to your ADX wallet.`;
}

/* ------------------------------------------------------------------ */
/* Stats                                                               */
/* ------------------------------------------------------------------ */

export interface StatDay {
    date: string;
    impressions: number;
    clicks: number;
}

export interface PromotionStats {
    impressions: number;
    clicks: number;
    ctr: number | null;
    byDay: StatDay[];
}

/** "2.4%" — clicks over impressions, one decimal; "—" before the first impression. */
export function ctrLabel(stats: Pick<PromotionStats, "impressions" | "clicks" | "ctr"> | null | undefined): string {
    if (!stats || stats.impressions <= 0) return "—";
    const ratio = stats.clicks / stats.impressions;
    return `${(Math.round(ratio * 1000) / 10).toFixed(1)}%`;
}

/** The stats block, read strictly: anything malformed is zeroes. */
export function statsOf(answer: unknown): PromotionStats {
    const row = (answer && typeof answer === "object" ? answer : {}) as Record<string, unknown>;
    const num = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : Number(value) || 0);
    const byDay = Array.isArray(row.byDay)
        ? row.byDay
              .filter((day): day is Record<string, unknown> => !!day && typeof day === "object")
              .map((day) => ({ date: dayOf(String(day.date ?? "")), impressions: num(day.impressions), clicks: num(day.clicks) }))
              .filter((day) => isIsoDay(day.date))
        : [];
    return { impressions: num(row.impressions), clicks: num(row.clicks), ctr: row.ctr === null || row.ctr === undefined ? null : num(row.ctr), byDay };
}

/* ------------------------------------------------------------------ */
/* Bookings                                                            */
/* ------------------------------------------------------------------ */

export interface PromotionMedia {
    id?: string;
    url: string;
    width: number | null;
    height: number | null;
    altText: string | null;
}

export interface AdBookingView {
    id: string;
    displayId: string | null;
    slot: (Partial<AdSlotInfo> & { key: string; label: string }) | null;
    slotKey?: string;
    title: string;
    headline: string | null;
    ctaLabel: string | null;
    targetUrl: string | null;
    cityIds: string[];
    startDate: string;
    endDate: string;
    days: number;
    ratePerDay: Money;
    subtotal: Money;
    gstAmount: Money;
    total: Money;
    status: PromotionStatus;
    reviewNote: string | null;
    paidAt: string | null;
    refundedAt: string | null;
    cancelledAt: string | null;
    cancelReason: string | null;
    mediaId: string | null;
    media: PromotionMedia | null;
    stats?: PromotionStats | null;
    createdAt?: string;
}

export interface AdDraftInput {
    slotKey: string;
    title: string;
    headline?: string;
    ctaLabel?: string;
    targetUrl: string;
    cityIds?: string[];
    startDate: string;
    endDate: string;
}

export interface BoostView {
    id: string;
    displayId: string | null;
    listingId: string;
    listing?: { id: string; displayId: string | null; title: string; photo?: string | null; photos?: string[] } | null;
    placements: BoostPlacement[];
    city: string | null;
    category: string;
    startDate: string;
    endDate: string;
    days: number;
    subtotal: Money;
    gstAmount: Money;
    total: Money;
    status: PromotionStatus;
    reviewNote: string | null;
    paidAt: string | null;
    refundedAt: string | null;
    cancelledAt: string | null;
    cancelReason: string | null;
    stats?: PromotionStats | null;
    createdAt?: string;
}

/** `GET /promotions/boost/quote` */
export interface BoostQuote {
    days: number;
    ratePerDay: Partial<Record<BoostPlacement, Money>>;
    subtotal: Money;
    gstAmount: Money;
    total: Money;
    /** Days with no room left on a chosen placement. */
    full: string[];
}

/** One placement's days, however the availability read spells them. */
export type BoostAvailability = Partial<Record<BoostPlacement, SlotDay[]>>;

/**
 * `GET /promotions/boost/availability` answers "per placement per day
 * left"; the contract leaves the spelling open, so the three plain ones are
 * read: `{ placements: [{ placement, days }] }`, `{ SEARCH_TOP: { days } |
 * days[] }` (also under `placements`), and `{ days: [{ date, SEARCH_TOP: n }
 * | { date, left: { SEARCH_TOP: n } }] }`.
 */
export function boostAvailabilityOf(answer: unknown): BoostAvailability {
    const out: BoostAvailability = {};
    if (!answer || typeof answer !== "object") return out;
    const root = answer as Record<string, unknown>;
    const dayRows = (value: unknown): SlotDay[] =>
        Array.isArray(value)
            ? value
                  .filter((row): row is Record<string, unknown> => !!row && typeof row === "object")
                  .map((row) => ({ date: dayOf(String(row.date ?? "")), booked: Number(row.booked ?? 0) || 0, left: Number(row.left ?? 0) || 0 }))
                  .filter((row) => isIsoDay(row.date))
            : [];
    const put = (placement: unknown, value: unknown) => {
        if (placement !== "SEARCH_TOP" && placement !== "SIMILAR_TOP") return;
        const days = Array.isArray(value) ? dayRows(value) : value && typeof value === "object" ? dayRows((value as Record<string, unknown>).days) : [];
        out[placement] = days;
    };
    const placements = root.placements;
    if (Array.isArray(placements)) {
        for (const row of placements) if (row && typeof row === "object") put((row as Record<string, unknown>).placement, (row as Record<string, unknown>).days);
    } else if (placements && typeof placements === "object") {
        for (const [key, value] of Object.entries(placements)) put(key, value);
    }
    for (const key of BOOST_PLACEMENTS) if (!out[key] && key in root) put(key, root[key]);
    if (Array.isArray(root.days) && Object.keys(out).length === 0) {
        for (const row of root.days) {
            if (!row || typeof row !== "object") continue;
            const day = row as Record<string, unknown>;
            const date = dayOf(String(day.date ?? ""));
            if (!isIsoDay(date)) continue;
            const left = day.left && typeof day.left === "object" ? (day.left as Record<string, unknown>) : day;
            for (const key of BOOST_PLACEMENTS) {
                if (!(key in left)) continue;
                (out[key] ??= []).push({ date, booked: 0, left: Number(left[key]) || 0 });
            }
        }
    }
    return out;
}

/** A list the backend may answer bare or as `{ items }`. */
export function rowsOf<T>(answer: unknown): T[] {
    if (Array.isArray(answer)) return answer as T[];
    if (answer && typeof answer === "object" && Array.isArray((answer as { items?: unknown }).items)) return (answer as { items: T[] }).items;
    return [];
}

/** YYYY-MM-DD on the way in: the backend's dates are whole UTC days. */
const q = (params: Record<string, string | number | undefined | null>): string => {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) if (value !== undefined && value !== null && value !== "") search.set(key, String(value));
    const s = search.toString();
    return s ? `?${s}` : "";
};

export const promotionsService = {
    /* Public reads. */
    slots: async (): Promise<AdSlotInfo[]> => rowsOf<AdSlotInfo>(await api.get<unknown>("/promotions/slots", { anonymous: true })),
    slotAvailability: (key: string, from: string, to: string) => api.get<SlotAvailability>(`/promotions/slots/${encodeURIComponent(key)}/availability${q({ from, to })}`, { anonymous: true }),
    placements: async (): Promise<BoostPlacementInfo[]> => rowsOf<BoostPlacementInfo>(await api.get<unknown>("/promotions/boost/placements", { anonymous: true })),
    boostAvailability: async (listingId: string, from: string, to: string, placements: BoostPlacement[] = BOOST_PLACEMENTS): Promise<BoostAvailability> =>
        boostAvailabilityOf(await api.get<unknown>(`/promotions/boost/availability${q({ listingId, from, to, placements: placements.join(",") })}`)),
    specs: async (): Promise<MediaSpec[]> => rowsOf<MediaSpec>(await api.get<unknown>("/media/specs")),

    /* Display ads — the advertiser's. */
    myAds: async (): Promise<AdBookingView[]> => rowsOf<AdBookingView>(await api.get<unknown>("/promotions/ads/mine")),
    ad: (id: string) => api.get<AdBookingView>(`/promotions/ads/${encodeURIComponent(id)}`),
    createAd: (body: AdDraftInput) => api.post<AdBookingView>("/promotions/ads", body),
    updateAd: (id: string, body: Partial<AdDraftInput>) => api.patch<AdBookingView>(`/promotions/ads/${encodeURIComponent(id)}`, body),
    uploadArtwork: (id: string, file: File, altText?: string) => {
        const form = new FormData();
        form.append("file", file, file.name);
        if (altText) form.append("altText", altText);
        return api.post<AdBookingView>(`/promotions/ads/${encodeURIComponent(id)}/artwork`, form);
    },
    submitAd: (id: string) => api.post<AdBookingView>(`/promotions/ads/${encodeURIComponent(id)}/submit`),
    payAdFromWallet: (id: string) => api.post<AdBookingView>(`/promotions/ads/${encodeURIComponent(id)}/pay-from-wallet`),
    cancelAd: (id: string, reason: string) => api.post<AdBookingView>(`/promotions/ads/${encodeURIComponent(id)}/cancel`, { reason }),

    /* Sponsored listings — the publisher's. */
    boostQuote: (listingId: string, placements: BoostPlacement[], startDate: string, endDate: string) =>
        api.get<BoostQuote>(`/promotions/boost/quote${q({ listingId, placements: placements.join(","), startDate, endDate })}`),
    myBoosts: async (): Promise<BoostView[]> => rowsOf<BoostView>(await api.get<unknown>("/promotions/boosts/mine")),
    boost: (id: string) => api.get<BoostView>(`/promotions/boosts/${encodeURIComponent(id)}`),
    createBoost: (body: { listingId: string; placements: BoostPlacement[]; startDate: string; endDate: string }) => api.post<BoostView>("/promotions/boosts", body),
    payBoostFromWallet: (id: string) => api.post<BoostView>(`/promotions/boosts/${encodeURIComponent(id)}/pay-from-wallet`),
    cancelBoost: (id: string, reason: string) => api.post<BoostView>(`/promotions/boosts/${encodeURIComponent(id)}/cancel`, { reason }),
};

/** The days a 409 `SLOT_FULL` / `PLACEMENT_FULL` names, when it names them. */
export function fullDaysOf(caught: unknown): string[] | null {
    if (!(caught instanceof ApiError) || (caught.code !== "SLOT_FULL" && caught.code !== "PLACEMENT_FULL")) return null;
    const details = caught.details as { days?: unknown; full?: unknown; fullDays?: unknown } | unknown[] | undefined;
    const list = Array.isArray(details) ? details : (details?.fullDays ?? details?.full ?? details?.days);
    if (!Array.isArray(list)) return [];
    return list.map((value) => (typeof value === "string" ? dayOf(value) : value && typeof value === "object" ? dayOf(String((value as { date?: unknown }).date ?? "")) : "")).filter(isIsoDay);
}

/** Whether a failure is the feature being switched off (`503 FEATURE_OFF`). */
export const featureOff = (caught: unknown): boolean => caught instanceof ApiError && (caught.code === "FEATURE_OFF" || caught.status === 503);

/** The flags the buying doors hang on. */
export const FLAG_PROMOTION_ADS = "promotions.ads";
export const FLAG_PROMOTION_BOOSTS = "promotions.boosts";
