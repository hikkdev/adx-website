import {
    dayLabel,
    dayOf,
    isIsoDay,
    quoteOf,
    runDays,
    specFor,
    statsOf,
    type AdBookingView,
    type AdDraftInput,
    type AdSlotInfo,
    type MediaSpec,
    type PromotionStats,
    type PromotionStatus,
    type Quote,
} from "@/services/promotions";

/**
 * LM-1, the advertiser's display ads: the pure pieces the pages draw from —
 * where a slot shows, what a status means to the buyer, whether the form
 * is ready to go, and the quote the rail shows before and after the server
 * answers.
 */

/** Where each layout surface is, in the buyer's words. */
export const SURFACE_LABEL: Record<string, string> = {
    WEB_HOME: "Website home page",
    WEB_EXPLORE: "Website Explore page",
    WEB_FORMATS: "Website Formats page",
    WEB_LISTING: "Website listing pages",
    APP_ADVERTISER_HOME: "Advertiser app home",
    APP_PUBLISHER_HOME: "Publisher app home",
    APP_PARTNER_HOME: "Partner app home",
    AGENT_HOME: "Agent app home",
};

export function surfacesLabel(surfaces: string[] | null | undefined): string {
    const names = (surfaces ?? []).map((surface) => SURFACE_LABEL[surface] ?? surface.replace(/_/g, " ").toLowerCase());
    if (names.length === 0) return "Where ADX places it";
    if (names.length === 1) return names[0];
    return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/** The page the preview mock draws: a website page (with the listing sidebar when it is one) or a phone. */
export type PreviewPage = "LISTING" | "WEB" | "APP";
/** Where on that page the ad sits: the sidebar, a full-width strip, or a square tile. */
export type PreviewPosition = "SIDEBAR" | "BANNER" | "TILE";

export function previewOf(slot: Pick<AdSlotInfo, "surfaces" | "spec">): { page: PreviewPage; position: PreviewPosition } {
    const surfaces = slot.surfaces ?? [];
    const page: PreviewPage = surfaces.includes("WEB_LISTING") ? "LISTING" : surfaces.some((s) => s.startsWith("WEB_")) ? "WEB" : surfaces.length > 0 ? "APP" : "WEB";
    const spec = slot.spec ?? "";
    const position: PreviewPosition = spec === "AD_SIDEBAR" ? "SIDEBAR" : spec === "AD_BANNER" || spec === "PROMO_WIDE" ? "BANNER" : spec === "PROMO_SQUARE" || spec === "TILE" ? "TILE" : page === "LISTING" ? "SIDEBAR" : "BANNER";
    // A sidebar only exists on the listing page; elsewhere a portrait ad is a tile in the grid.
    return { page, position: position === "SIDEBAR" && page !== "LISTING" ? "TILE" : position };
}

/** An absolute http(s) link — the only kind an ad may open. */
export function isHttpUrl(value: string): boolean {
    const text = value.trim();
    if (!/^https?:\/\//i.test(text)) return false;
    try {
        const url = new URL(text);
        return (url.protocol === "http:" || url.protocol === "https:") && url.hostname.includes(".");
    } catch {
        return false;
    }
}

export interface AdFormState {
    slotKey: string;
    from: string;
    to: string;
    title: string;
    headline: string;
    ctaLabel: string;
    targetUrl: string;
    /** A file picked and checked, or artwork already on the draft. */
    hasArtwork: boolean;
    /** Problems the browser found with the picked file. */
    artworkProblems: string[];
}

/** What still stands between the form and a submit, first thing first. Empty = ready. */
export function adFormProblems(form: AdFormState, slot: Pick<AdSlotInfo, "minDays"> | null, fullDays: string[] = []): string[] {
    const problems: string[] = [];
    if (!slot || !form.slotKey) problems.push("Choose where the ad shows.");
    const days = runDays(form.from, form.to);
    if (days <= 0) problems.push("Pick the first and the last day.");
    else if (slot && days < Math.max(1, slot.minDays)) problems.push(`This slot is sold for at least ${slot.minDays} days.`);
    if (fullDays.length > 0) problems.push("Some of your days are full — pick a run around them.");
    if (form.title.trim().length < 2) problems.push("Give the ad a name (only you and ADX see it).");
    if (!isHttpUrl(form.targetUrl)) problems.push("Add the link a tap opens — a full address starting https://.");
    if (form.artworkProblems.length > 0) problems.push("The artwork does not fit the slot yet.");
    else if (!form.hasArtwork) problems.push("Add the artwork.");
    return problems;
}

/** The problems a draft may still be saved with: a slot, a run and a name are enough; the link must be right if given. */
export function draftProblems(form: AdFormState, slot: Pick<AdSlotInfo, "minDays"> | null): string[] {
    const problems: string[] = [];
    if (!slot || !form.slotKey) problems.push("Choose where the ad shows.");
    if (runDays(form.from, form.to) <= 0) problems.push("Pick the first and the last day.");
    if (form.title.trim().length < 2) problems.push("Give the ad a name (only you and ADX see it).");
    if (!isHttpUrl(form.targetUrl)) problems.push("Add the link a tap opens — a full address starting https://.");
    return problems;
}

/**
 * The quote the rail shows: the server's once there is a draft for this very
 * slot and run (it is the one that is charged), the browser's arithmetic
 * before that.
 */
export function quoteFor(slot: Pick<AdSlotInfo, "key" | "ratePerDay"> | null, from: string, to: string, draft: Pick<AdBookingView, "startDate" | "endDate" | "days" | "ratePerDay" | "subtotal" | "gstAmount" | "total" | "slot" | "slotKey"> | null): (Quote & { fromServer: boolean }) | null {
    if (!slot) return null;
    const days = runDays(from, to);
    const draftSlot = draft?.slot?.key ?? draft?.slotKey ?? null;
    if (draft && draftSlot === slot.key && dayOf(draft.startDate) === from && dayOf(draft.endDate) === to && draft.total) {
        return { days: draft.days || days, ratePerDay: draft.ratePerDay, subtotal: draft.subtotal, gstAmount: draft.gstAmount, total: draft.total, fromServer: true };
    }
    const quote = quoteOf(slot.ratePerDay, days);
    return quote ? { ...quote, fromServer: false } : null;
}

/** The line under the heading that says what happens next, per status. */
export function adStatusLine(ad: Pick<AdBookingView, "status" | "startDate" | "endDate" | "reviewNote" | "cancelReason" | "refundedAt">): { title: string; line: string } {
    switch (ad.status) {
        case "DRAFT":
            return { title: "Draft", line: "Finish the details and the artwork, then submit it to pay." };
        case "PENDING_PAYMENT":
            return { title: "Waiting for payment", line: "Pay to hold these days. An unpaid booking is released 60 minutes after it was submitted." };
        case "PENDING_REVIEW":
            return { title: "In review", line: "ADX checks the artwork, usually within a working day. If it is turned down, the full amount comes back to your wallet." };
        case "SCHEDULED":
            return { title: "Scheduled", line: `Approved. It starts on ${dayLabel(ad.startDate)} and runs until ${dayLabel(ad.endDate)}.` };
        case "LIVE":
            return { title: "Live", line: `Showing now, rotating with the other ads in the slot, until ${dayLabel(ad.endDate)}.` };
        case "ENDED":
            return { title: "Ended", line: `It ran until ${dayLabel(ad.endDate)}. The figures below are final.` };
        case "REJECTED":
            return {
                title: "Rejected",
                line: `${ad.reviewNote?.trim() ? `ADX's reason: ${ad.reviewNote.trim()}` : "ADX turned the artwork down."} ${ad.refundedAt ? `The full amount went back to your wallet on ${dayLabel(ad.refundedAt)}.` : "Any amount paid goes back to your wallet in full."} Edit it and submit it again.`,
            };
        case "CANCELLED":
            return { title: "Cancelled", line: ad.cancelReason?.trim() ? `Cancelled: ${ad.cancelReason.trim()}` : "This booking was cancelled." };
        default:
            return { title: String(ad.status), line: "" };
    }
}

/** Whether the performance figures mean anything yet. */
export const showsStats = (status: PromotionStatus): boolean => status === "SCHEDULED" || status === "LIVE" || status === "ENDED" || status === "CANCELLED";

/** The stats on a row, when the list carries them. */
export function rowStats(ad: Pick<AdBookingView, "stats">): PromotionStats | null {
    return ad.stats && typeof ad.stats === "object" ? statsOf(ad.stats) : null;
}

/** "Everywhere" or the cities by name, as far as the names are known. */
export function citiesLabel(cityIds: string[] | null | undefined, names: Record<string, string> = {}): string {
    const ids = cityIds ?? [];
    if (ids.length === 0) return "Everywhere";
    return ids.map((id) => names[id] ?? prettySlug(id)).join(", ");
}

/** "navi-mumbai" → "Navi Mumbai"; an opaque id is left as it is. */
export function prettySlug(value: string): string {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value) || /\d{4,}/.test(value)) return value;
    return value
        .split("-")
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ");
}

/** The detail page's address, with the payment being waited on. */
export const adHref = (id: string, paymentId?: string | null): string => `/advertiser/promotions/${encodeURIComponent(id)}${paymentId ? `?payment=${encodeURIComponent(paymentId)}` : ""}`;

export const editHref = (id: string): string => `/advertiser/promotions/new?edit=${encodeURIComponent(id)}`;

/** A first and a last day, in order. */
export function runIsValid(from: string, to: string): boolean {
    return isIsoDay(from) && isIsoDay(to) && to >= from;
}

/**
 * A PATCH names no slot (the slot is fixed once saved), and clears the
 * headline or the button label with null when the box was emptied.
 */
export function patchOf(body: AdDraftInput): Partial<AdDraftInput> {
    // The update takes null to clear the two optional words; the shared input type only spells strings.
    const patch = { title: body.title, targetUrl: body.targetUrl, cityIds: body.cityIds ?? [], startDate: body.startDate, endDate: body.endDate, headline: body.headline ?? null, ctaLabel: body.ctaLabel ?? null };
    return patch as unknown as Partial<AdDraftInput>;
}

/**
 * The size a slot's artwork is checked against: the slot's own `specDetail`
 * (what `/promotions/slots` answers, and what the upload is judged by), else
 * the media library's spec by key, else the contract's.
 */
export function slotSpec(slot: Pick<AdSlotInfo, "spec"> & { specDetail?: unknown }, specs: MediaSpec[] | null | undefined): MediaSpec | null {
    const detail = slot.specDetail as Partial<MediaSpec> | null | undefined;
    if (detail && typeof detail === "object" && typeof detail.width === "number" && typeof detail.height === "number" && detail.width > 0 && detail.height > 0) {
        const fallback = specFor(slot.spec, specs);
        return {
            key: typeof detail.key === "string" ? detail.key : slot.spec,
            label: typeof detail.label === "string" ? detail.label : (fallback?.label ?? slot.spec),
            width: detail.width,
            height: detail.height,
            minWidth: typeof detail.minWidth === "number" ? detail.minWidth : detail.width,
            minHeight: typeof detail.minHeight === "number" ? detail.minHeight : detail.height,
            maxBytes: typeof detail.maxBytes === "number" ? detail.maxBytes : (fallback?.maxBytes ?? 0),
            formats: Array.isArray(detail.formats) && detail.formats.length > 0 ? detail.formats.filter((f): f is string => typeof f === "string") : (fallback?.formats ?? []),
        };
    }
    return specFor(slot.spec, specs);
}
