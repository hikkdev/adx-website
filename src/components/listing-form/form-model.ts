import {
    areaSqFt,
    documentSlotsFor,
    isDigitalMediaType,
    normalisePlate,
    shortName,
    type Catalogue,
    type ContentStance,
    type Listing,
    type ListingCategory,
    type ListingDocument,
    type ListingDraft,
    type PricingUnit,
    type RightsBasis,
} from "@/services/listing-editor";

/**
 * The listing form — every answer the two boards ask for, in one object.
 *
 * The wizard (board 08) fills it step by step and saves it whole as a draft
 * (`answers` on `POST /listings/drafts`); the edit pages (board 09) fill it
 * from the listing and send one section back. `toCreateBody` and `patchFor`
 * are the only places a form field meets a column name, so a frame's field
 * with no column behind it is visible here and nowhere else.
 */
export interface GeoPoint {
    latitude: number;
    longitude: number;
}

export interface StoredFile {
    url: string;
    name: string;
}

export type DocumentAnswer = StoredFile | { waived: string } | null;

export interface ListingForm {
    category: ListingCategory | null;
    venueTypeId: string | null;
    mediaTypeId: string | null;
    materialId: string | null;

    /* Space details (5204:77900) */
    title: string;
    placement: string;
    address: string;
    city: string;
    location: GeoPoint | null;
    widthFt: string;
    heightFt: string;
    illumination: string;
    facing: string;
    /** "Installation by ADX · Special Pricing Applicable" — kept with the draft; no column on the listing. */
    installationByAdx: boolean;

    /* Vehicle and route (5204:78093) */
    vehicleNumber: string;
    /** Kept with the draft; no column on the listing. */
    vehicleModel: string;
    operatingHours: string;

    /* Outlet and audience reach (5204:78275) — kept with the draft where no column exists */
    broadcastLanguage: string;
    contentFormat: string;
    coverage: string;
    slotDuration: string;

    /* Space description (5204:78454) */
    description: string;
    targetAudience: string;
    uniqueSellingPoint: string;
    footfallNote: string;

    /* Audience evidence (5204:78629) — kept with the draft; the two reports are filed as documents */
    audience: { ageBand: string; genderSplit: string; urbanRural: string; secProfile: string; incomeBracket: string; occupation: string };
    audienceDocs: { barc: StoredFile | null; footfall: StoredFile | null };

    /* Availability and booking terms (5204:78822) */
    availableYearRound: "" | "yes" | "no";
    visibilityWindow: string;
    minBookingDays: string;
    /** Kept with the draft; no columns on the listing. */
    maxBookingDays: string;
    advanceBookingDays: string;
    cancellationNotice: string;

    /* Listing price (5204:79001) */
    pricingUnit: PricingUnit | "";
    basePrice: string;
    availableFrom: string;
    peakPeriodNote: string;
    slotsTotal: number;

    /* Rate card (5204:79601) */
    rateCard: StoredFile | null;
    rateCardValidFrom: string;
    rateCardValidTo: string;
    rateCardSeasonal: string;

    /* Content rules (5204:79771) */
    contentRules: Record<string, ContentStance>;

    /* Photos (5204:79968 / 5204:84858) */
    photos: { front: StoredFile | null; left: StoredFile | null; right: StoredFile | null; wide: StoredFile | null };

    /* Documents and rights (5204:80756 / 5204:80949 / 5204:81140) */
    rightsBasis: RightsBasis | "";
    rightsValidUntil: string;
    ownVenue: boolean;
    documents: Record<string, DocumentAnswer>;

    /* Requested updates (5204:82071) */
    clarification: string;
}

export function emptyForm(): ListingForm {
    return {
        category: null,
        venueTypeId: null,
        mediaTypeId: null,
        materialId: null,
        title: "",
        placement: "",
        address: "",
        city: "",
        location: null,
        widthFt: "",
        heightFt: "",
        illumination: "",
        facing: "",
        installationByAdx: false,
        vehicleNumber: "",
        vehicleModel: "",
        operatingHours: "",
        broadcastLanguage: "",
        contentFormat: "",
        coverage: "",
        slotDuration: "",
        description: "",
        targetAudience: "",
        uniqueSellingPoint: "",
        footfallNote: "",
        audience: { ageBand: "", genderSplit: "", urbanRural: "", secProfile: "", incomeBracket: "", occupation: "" },
        audienceDocs: { barc: null, footfall: null },
        availableYearRound: "",
        visibilityWindow: "",
        minBookingDays: "",
        maxBookingDays: "",
        advanceBookingDays: "",
        cancellationNotice: "",
        pricingUnit: "",
        basePrice: "",
        availableFrom: "",
        peakPeriodNote: "",
        slotsTotal: 1,
        rateCard: null,
        rateCardValidFrom: "",
        rateCardValidTo: "",
        rateCardSeasonal: "",
        contentRules: {},
        photos: { front: null, left: null, right: null, wide: null },
        rightsBasis: "",
        rightsValidUntil: "",
        ownVenue: false,
        documents: {},
        clarification: "",
    };
}

/* ── The steps, in the frames' order, under the four chapters ─────────── */

export type StepKey = "category" | "venue" | "format" | "details" | "description" | "audience" | "terms" | "pricing" | "ratecard" | "rules" | "review" | "verify" | "documents";

export const CHAPTERS: { n: number; label: string; steps: StepKey[] }[] = [
    { n: 1, label: "Choose space", steps: ["category", "venue", "format"] },
    { n: 2, label: "Space details", steps: ["details", "description", "audience"] },
    { n: 3, label: "Pricing & terms", steps: ["terms", "pricing", "ratecard", "rules"] },
    { n: 4, label: "Review & verify", steps: ["review", "verify", "documents"] },
];

export const STEP_ORDER: StepKey[] = CHAPTERS.flatMap((c) => c.steps);

export function chapterOf(step: StepKey): number {
    return CHAPTERS.find((c) => c.steps.includes(step))?.n ?? 1;
}

export function isStepKey(value: string | null | undefined): value is StepKey {
    return !!value && (STEP_ORDER as string[]).includes(value);
}

export function nextStep(step: StepKey): StepKey | null {
    const i = STEP_ORDER.indexOf(step);
    return STEP_ORDER[i + 1] ?? null;
}

export function previousStep(step: StepKey): StepKey | null {
    const i = STEP_ORDER.indexOf(step);
    return i > 0 ? STEP_ORDER[i - 1]! : null;
}

/* ── Options the selects draw ──────────────────────────────────────────── */

export const VISIBILITY_WINDOWS: { key: string; label: string; from: string; to: string }[] = [
    { key: "24h", label: "24 hours", from: "12 AM", to: "12 AM" },
    { key: "day", label: "Daytime · 6 AM – 6 PM", from: "6 AM", to: "6 PM" },
    { key: "extended", label: "6 AM – 10 PM", from: "6 AM", to: "10 PM" },
    { key: "business", label: "Business hours · 9 AM – 9 PM", from: "9 AM", to: "9 PM" },
    { key: "evening", label: "Evenings · 6 PM – 12 AM", from: "6 PM", to: "12 AM" },
];

export function visibilityWindowOf(from: string | null | undefined, to: string | null | undefined): string {
    if (!from || !to) return "";
    return VISIBILITY_WINDOWS.find((w) => w.from === from && w.to === to)?.key ?? "";
}

export const BOOKING_PERIODS: { value: string; label: string }[] = [
    { value: "1", label: "1 day" },
    { value: "3", label: "3 days" },
    { value: "7", label: "7 days" },
    { value: "14", label: "14 days" },
    { value: "30", label: "30 days" },
    { value: "90", label: "90 days" },
];

export const ADVANCE_BOOKING: { value: string; label: string }[] = [
    { value: "0", label: "No notice needed" },
    { value: "3", label: "3 days ahead" },
    { value: "7", label: "7 days ahead" },
    { value: "14", label: "14 days ahead" },
    { value: "30", label: "30 days ahead" },
];

export const CANCELLATION_NOTICE: { value: string; label: string }[] = [
    { value: "flexible", label: "Flexible · free up to 48 hours before" },
    { value: "7", label: "7 days' notice" },
    { value: "14", label: "14 days' notice" },
    { value: "30", label: "30 days' notice" },
    { value: "none", label: "No cancellation once confirmed" },
];

export const OPERATING_HOURS: { value: string; label: string; from: string; to: string }[] = [
    { value: "24h", label: "All day, every day", from: "12 AM", to: "12 AM" },
    { value: "day", label: "Daytime · 6 AM – 10 PM", from: "6 AM", to: "10 PM" },
    { value: "peak", label: "Peak hours · 7 AM – 11 AM and 5 PM – 9 PM", from: "7 AM", to: "9 PM" },
    { value: "night", label: "Nights · 8 PM – 6 AM", from: "8 PM", to: "6 AM" },
];

export const AGE_BANDS = ["18–24", "25–34", "35–44", "45–54", "55+", "Mixed"];
export const GENDER_SPLITS = ["Mostly men", "Mostly women", "Balanced"];
export const URBAN_RURAL = ["Urban", "Semi-urban", "Rural", "Mixed"];
export const SEC_PROFILES = ["SEC A", "SEC A / B", "SEC B", "SEC B / C", "SEC C", "Mixed"];
export const INCOME_BRACKETS = ["Under ₹3 lakh a year", "₹3 – 6 lakh", "₹6 – 12 lakh", "₹12 – 25 lakh", "Over ₹25 lakh", "Mixed"];
export const OCCUPATIONS = ["Office workers", "Students", "Shoppers", "Commuters", "Business owners", "Families", "Tourists", "Mixed"];
export const LANGUAGES = ["Hindi", "English", "Hindi · English", "Kannada", "Tamil", "Telugu", "Malayalam", "Marathi", "Bengali", "Gujarati", "Punjabi", "Other"];
export const CONTENT_FORMATS = ["Music and entertainment", "News and current affairs", "Talk and interviews", "Sports", "Regional programming", "Business", "Lifestyle", "Other"];
export const SLOT_DURATIONS = ["10 seconds", "15 seconds", "20 seconds", "30 seconds", "60 seconds", "Quarter page", "Half page", "Full page", "Other"];
export const VEHICLE_TYPES = ["City bus", "Auto-rickshaw", "E-rickshaw", "Taxi / cab", "Delivery van", "Truck", "Private car", "Two-wheeler", "School bus", "Office shuttle", "Other"];

/* ── Completeness, per step ────────────────────────────────────────────── */

/** What is still missing on a step, in the words of its labels; empty means Continue is live. */
export function missingOn(step: StepKey, form: ListingForm, catalogue: Catalogue | null): string[] {
    const media = form.category === "MEDIA";
    switch (step) {
        case "category":
            return form.category ? [] : ["Category"];
        case "venue": {
            if (form.category === "OUTDOOR") return [];
            const offered = catalogue ? catalogue.venues.filter((v) => v.isActive && v.category === form.category) : [];
            return form.venueTypeId || offered.length === 0 ? [] : [media ? "Medium" : "Venue"];
        }
        case "format": {
            const offered = catalogue ? catalogue.mediaTypes.filter((m) => (m.venueTypeId ?? null) === (form.venueTypeId ?? null) && m.category === form.category) : [];
            return form.mediaTypeId || offered.length === 0 ? [] : ["Format"];
        }
        case "details": {
            const missing: string[] = [];
            if (media) {
                if (!form.address.trim()) missing.push("Channel / publication name");
                return missing;
            }
            if (!form.title.trim()) missing.push(form.category === "TRANSIT" ? "Ad slot name" : "Ad spot name");
            if (!form.address.trim()) missing.push(form.category === "TRANSIT" ? "Base location" : "Street address / landmark");
            if (form.category !== "TRANSIT") {
                if (!form.location) missing.push("Location pin");
                if (!form.widthFt.trim()) missing.push("Width");
                if (!form.heightFt.trim()) missing.push("Height");
            }
            return missing;
        }
        case "pricing": {
            const missing: string[] = [];
            if (!form.pricingUnit) missing.push("Rate basis");
            if (!/^\d+(\.\d{1,2})?$/.test(form.basePrice.trim()) || Number(form.basePrice) <= 0) missing.push("Base price");
            if ((form.pricingUnit === "PER_SQFT_PER_DAY" || form.pricingUnit === "PER_SQFT_PER_MONTH") && !areaSqFt(form.widthFt, form.heightFt)) missing.push("Width and height (for a per sq.ft rate)");
            return missing;
        }
        case "ratecard":
            return media && !form.rateCard ? ["Rate card"] : [];
        case "documents":
            return form.rightsBasis ? (form.rightsBasis !== "OWNED" && !form.rightsValidUntil ? ["Right runs out on"] : []) : [];
        default:
            return [];
    }
}

/** Every step's gaps at once — what the review step lists and what blocks the submit. */
export function missingBeforeSubmit(form: ListingForm, catalogue: Catalogue | null): { step: StepKey; fields: string[] }[] {
    return (["category", "venue", "format", "details", "pricing", "ratecard"] as StepKey[]).map((step) => ({ step, fields: missingOn(step, form, catalogue) })).filter((row) => row.fields.length > 0);
}

/* ── Names off the catalogue ───────────────────────────────────────────── */

export function venueName(form: Pick<ListingForm, "venueTypeId">, catalogue: Catalogue | null): string | null {
    const venue = catalogue?.venues.find((v) => v.id === form.venueTypeId);
    return venue ? venue.name : null;
}

export function formatName(form: Pick<ListingForm, "mediaTypeId">, catalogue: Catalogue | null): string | null {
    const type = catalogue?.mediaTypes.find((m) => m.id === form.mediaTypeId);
    return type ? shortName(type.name) : null;
}

/** The title a media listing carries when the outlet step names no spot: "Sunrise FM 92.7 · Radio Spot ads". */
export function effectiveTitle(form: ListingForm, catalogue: Catalogue | null): string {
    if (form.title.trim()) return form.title.trim();
    if (form.category === "MEDIA" && form.address.trim()) {
        const format = formatName(form, catalogue);
        return format ? `${form.address.trim()} · ${format}` : form.address.trim();
    }
    return "";
}

/* ── The body `POST /listings` takes ───────────────────────────────────── */

const text = (value: string): string | undefined => {
    const trimmed = value.trim();
    return trimmed === "" ? undefined : trimmed;
};

function hoursOf(form: ListingForm): { availableHoursFrom?: string; availableHoursTo?: string } {
    const window = VISIBILITY_WINDOWS.find((w) => w.key === form.visibilityWindow) ?? OPERATING_HOURS.find((w) => w.value === form.operatingHours);
    return window ? { availableHoursFrom: window.from, availableHoursTo: window.to } : {};
}

export function contentRulesOf(form: ListingForm): { contentCategoryId: string; stance: ContentStance }[] {
    return Object.entries(form.contentRules)
        .filter(([, stance]) => !!stance)
        .map(([contentCategoryId, stance]) => ({ contentCategoryId, stance }));
}

export function photosOf(form: ListingForm): { url: string; type: string }[] {
    return (["front", "left", "right", "wide"] as const).filter((k) => form.photos[k]).map((k) => ({ url: form.photos[k]!.url, type: k.toUpperCase() }));
}

export function toCreateBody(form: ListingForm, catalogue: Catalogue | null): Record<string, unknown> {
    const media = form.category === "MEDIA";
    const minDays = Number(form.minBookingDays);
    const rules = contentRulesOf(form);
    const photos = photosOf(form);
    const slots = isDigitalMediaType(catalogue?.mediaTypes.find((m) => m.id === form.mediaTypeId)) ? form.slotsTotal : 1;
    return {
        category: form.category,
        title: effectiveTitle(form, catalogue),
        address: form.address.trim(),
        ...(text(media ? form.coverage || form.city : form.city) ? { city: text(media ? form.coverage || form.city : form.city) } : {}),
        ...(form.location ? { latitude: form.location.latitude, longitude: form.location.longitude } : {}),
        ...(form.venueTypeId ? { venueTypeId: form.venueTypeId } : {}),
        ...(form.mediaTypeId ? { mediaTypeId: form.mediaTypeId } : {}),
        ...(form.materialId ? { materialId: form.materialId } : {}),
        ...(text(form.placement) ? { placement: text(form.placement) } : {}),
        ...(text(form.widthFt) ? { widthFt: text(form.widthFt) } : {}),
        ...(text(form.heightFt) ? { heightFt: text(form.heightFt) } : {}),
        ...(text(form.illumination) ? { illumination: text(form.illumination) } : {}),
        ...(text(form.facing) ? { facing: text(form.facing) } : {}),
        ...(text(form.vehicleNumber) ? { vehicleNumber: normalisePlate(form.vehicleNumber) } : {}),
        ...(media && text(form.slotDuration) ? { size: text(form.slotDuration) } : {}),
        ...(text(form.description) ? { description: text(form.description) } : {}),
        ...(text(form.targetAudience) ? { targetAudience: text(form.targetAudience) } : {}),
        ...(text(form.uniqueSellingPoint) ? { uniqueSellingPoint: text(form.uniqueSellingPoint) } : {}),
        ...(text(form.footfallNote) ? { footfallNote: text(form.footfallNote) } : {}),
        ...(form.pricingUnit && text(form.basePrice) ? { pricingUnit: form.pricingUnit, basePrice: text(form.basePrice) } : {}),
        ...(Number.isInteger(minDays) && minDays > 0 ? { minBookingDays: minDays } : {}),
        ...(form.availableYearRound === "yes" ? { availableNow: true } : {}),
        ...(form.availableYearRound === "no" ? { availableNow: false } : {}),
        ...(text(form.availableFrom) ? { availableFrom: text(form.availableFrom) } : {}),
        ...hoursOf(form),
        ...(text(form.peakPeriodNote) ? { peakPeriodNote: text(form.peakPeriodNote) } : {}),
        ...(form.rateCard ? { rateCardUrl: form.rateCard.url } : {}),
        ...(form.rightsBasis ? { rightsBasis: form.rightsBasis } : {}),
        ...(form.rightsBasis && form.rightsBasis !== "OWNED" && text(form.rightsValidUntil) ? { rightsValidUntil: text(form.rightsValidUntil) } : {}),
        ...(slots > 1 ? { slotsTotal: slots } : {}),
        ...(rules.length ? { contentRules: rules } : {}),
        ...(photos.length ? { photos } : {}),
    };
}

/* ── The patch each edit page sends (`PATCH /listings/:id`) ────────────── */

export type EditSection = "details" | "vehicle" | "description" | "audience" | "terms" | "price" | "ratecard" | "rules" | "photos" | "documents";

export const EDIT_SECTIONS: { key: EditSection; title: string; blurb: string; heading: string }[] = [
    { key: "details", title: "Space details", blurb: "Location, placement, dimensions or vehicle information", heading: "Edit location and dimensions" },
    { key: "description", title: "Listing description", blurb: "Description, audience and placement benefits", heading: "Edit listing description" },
    { key: "audience", title: "Audience evidence", blurb: "Demographics and supporting reach reports", heading: "Edit audience evidence" },
    { key: "terms", title: "Availability & booking terms", blurb: "Availability, booking duration and cancellation terms", heading: "Edit availability and booking terms" },
    { key: "price", title: "Listing price", blurb: "Current rate and minimum booking", heading: "Edit listing price" },
    { key: "ratecard", title: "Rate card", blurb: "Current file, validity dates and seasonal rates", heading: "Edit rate card" },
    { key: "rules", title: "Content rules", blurb: "Accepted categories and approval requirements", heading: "Edit content rules" },
    { key: "photos", title: "Listing photos", blurb: "Cover photo, angles and placement context", heading: "Edit listing photos" },
    { key: "documents", title: "Verification documents", blurb: "Permissions, address and operating documents", heading: "Edit venue documents" },
];

export function isEditSection(value: string): value is EditSection {
    return EDIT_SECTIONS.some((s) => s.key === value) || value === "vehicle";
}

/**
 * The columns a section may move. `null` for a value means "unchanged"; the
 * patch carries only what the page could write. Address, pin and city are
 * not here: a spot at a different address is a different spot, and the
 * backend's patch has no such fields.
 */
export function patchFor(section: EditSection, form: ListingForm): Record<string, unknown> {
    const minDays = Number(form.minBookingDays);
    switch (section) {
        case "details":
            return {
                ...(text(form.title) ? { title: text(form.title) } : {}),
                ...(text(form.placement) ? { placement: text(form.placement) } : {}),
                ...(text(form.widthFt) ? { widthFt: text(form.widthFt) } : {}),
                ...(text(form.heightFt) ? { heightFt: text(form.heightFt) } : {}),
                ...(text(form.illumination) ? { illumination: text(form.illumination) } : {}),
                ...(text(form.facing) ? { facing: text(form.facing) } : {}),
            };
        case "vehicle":
            return {
                ...(text(form.title) ? { title: text(form.title) } : {}),
                ...(text(form.vehicleNumber) ? { vehicleNumber: normalisePlate(form.vehicleNumber) } : {}),
                ...(text(form.placement) ? { placement: text(form.placement) } : {}),
                ...hoursOf(form),
            };
        case "description":
            return {
                ...(text(form.description) ? { description: text(form.description) } : {}),
                ...(text(form.targetAudience) ? { targetAudience: text(form.targetAudience) } : {}),
                ...(text(form.uniqueSellingPoint) ? { uniqueSellingPoint: text(form.uniqueSellingPoint) } : {}),
                ...(text(form.footfallNote) ? { footfallNote: text(form.footfallNote) } : {}),
            };
        case "terms":
            return {
                ...(form.availableYearRound === "yes" ? { availableNow: true } : {}),
                ...(form.availableYearRound === "no" ? { availableNow: false } : {}),
                ...hoursOf(form),
                ...(Number.isInteger(minDays) && minDays > 0 ? { minBookingDays: minDays } : {}),
            };
        case "price":
            return {
                ...(form.pricingUnit && text(form.basePrice) ? { pricingUnit: form.pricingUnit, basePrice: text(form.basePrice) } : {}),
                ...(Number.isInteger(minDays) && minDays > 0 ? { minBookingDays: minDays } : {}),
                ...(text(form.availableFrom) ? { availableFrom: text(form.availableFrom) } : {}),
                ...hoursOf(form),
                ...(text(form.peakPeriodNote) ? { peakPeriodNote: text(form.peakPeriodNote) } : {}),
            };
        case "ratecard":
            return form.rateCard ? { rateCardUrl: form.rateCard.url } : {};
        case "rules":
            return { contentRules: contentRulesOf(form) };
        default:
            return {};
    }
}

/* ── The form, from a listing (board 09) ───────────────────────────────── */

export function formFromListing(listing: Listing, rules: { contentCategoryId: string; stance: ContentStance }[] = [], documents: ListingDocument[] = []): ListingForm {
    const form = emptyForm();
    form.category = listing.category;
    form.venueTypeId = listing.venueTypeId ?? null;
    form.mediaTypeId = listing.mediaTypeId ?? null;
    form.materialId = listing.materialId ?? null;
    form.title = listing.title ?? "";
    form.placement = listing.placement ?? "";
    form.address = listing.address ?? "";
    form.city = listing.city ?? "";
    form.location = listing.latitude !== null && listing.longitude !== null ? { latitude: listing.latitude, longitude: listing.longitude } : null;
    form.widthFt = listing.widthFt ? String(Number(listing.widthFt)) : "";
    form.heightFt = listing.heightFt ? String(Number(listing.heightFt)) : "";
    form.illumination = listing.illumination ?? "";
    form.facing = listing.facing ?? "";
    form.vehicleNumber = listing.vehicleNumber ?? "";
    form.slotDuration = listing.category === "MEDIA" ? (listing.size ?? "") : "";
    form.coverage = listing.category === "MEDIA" ? (listing.city ?? "") : "";
    form.description = listing.description ?? "";
    form.targetAudience = listing.targetAudience ?? "";
    form.uniqueSellingPoint = listing.uniqueSellingPoint ?? "";
    form.footfallNote = listing.footfallNote ?? "";
    form.availableYearRound = listing.availableNow ? "yes" : listing.availableFrom ? "no" : "";
    form.visibilityWindow = visibilityWindowOf(listing.availableHoursFrom, listing.availableHoursTo);
    form.operatingHours = OPERATING_HOURS.find((w) => w.from === listing.availableHoursFrom && w.to === listing.availableHoursTo)?.value ?? "";
    form.minBookingDays = listing.minBookingDays ? String(listing.minBookingDays) : "";
    form.pricingUnit = (listing.pricingUnit as PricingUnit) ?? "";
    form.basePrice = listing.basePrice ? String(Number(listing.basePrice)) : listing.ratePerDay ? String(Number(listing.ratePerDay)) : "";
    form.availableFrom = listing.availableFrom ? listing.availableFrom.slice(0, 10) : "";
    form.peakPeriodNote = listing.peakPeriodNote ?? "";
    form.slotsTotal = listing.slotsTotal ?? 1;
    form.rateCard = listing.rateCardUrl ? { url: listing.rateCardUrl, name: fileNameOf(listing.rateCardUrl) } : null;
    form.contentRules = Object.fromEntries(rules.map((r) => [r.contentCategoryId, r.stance]));
    const photos = listing.photos ?? [];
    const pick = (type: string, index: number) => photos.find((p) => p.type?.toUpperCase() === type) ?? (photos.every((p) => !["FRONT", "LEFT", "RIGHT", "WIDE"].includes(p.type?.toUpperCase())) ? photos[index] : undefined);
    form.photos = {
        front: pick("FRONT", 0) ? { url: pick("FRONT", 0)!.url, name: fileNameOf(pick("FRONT", 0)!.url) } : null,
        left: pick("LEFT", 1) ? { url: pick("LEFT", 1)!.url, name: fileNameOf(pick("LEFT", 1)!.url) } : null,
        right: pick("RIGHT", 2) ? { url: pick("RIGHT", 2)!.url, name: fileNameOf(pick("RIGHT", 2)!.url) } : null,
        wide: pick("WIDE", 3) ? { url: pick("WIDE", 3)!.url, name: fileNameOf(pick("WIDE", 3)!.url) } : null,
    };
    form.rightsBasis = listing.rightsBasis ?? "";
    form.rightsValidUntil = listing.rightsValidUntil ? listing.rightsValidUntil.slice(0, 10) : "";
    form.ownVenue = listing.rightsBasis === "OWNED";
    /* The latest document of each kind fills the slot that asks for that kind. */
    const slots = documentSlotsFor(listing.category);
    for (const slot of slots) {
        const latest = documents.find((d) => d.kind === slot.kind && !form.documents[slot.key] && !Object.values(form.documents).some((v) => v && "url" in v && v.url === d.url));
        if (latest) form.documents[slot.key] = { url: latest.url, name: fileNameOf(latest.url) };
    }
    return form;
}

export function fileNameOf(url: string): string {
    try {
        const path = new URL(url, "http://x").pathname;
        return decodeURIComponent(path.split("/").pop() || url);
    } catch {
        return url.split("/").pop() || url;
    }
}

/* ── Drafts: the whole form, and the phone's answers when a draft came from there ── */

export function toDraftInput(form: ListingForm, step: StepKey): { category: string | null; title: string | null; stepIndex: number; stepKey: string; answers: Record<string, unknown> } {
    return {
        category: form.category ? form.category.toLowerCase() : null,
        title: text(form.title) ?? null,
        stepIndex: STEP_ORDER.indexOf(step),
        stepKey: step,
        answers: { web: form },
    };
}

/**
 * A draft's answers back into the form: the web's own shape as saved, or the
 * phone's flow answers (`title`, `venue_type_id`, `location`, …) mapped onto
 * the same fields, so a spot started on the phone can be finished here.
 */
export function formFromDraft(draft: ListingDraft): { form: ListingForm; step: StepKey } {
    const answers = draft.answers ?? {};
    if (answers.web && typeof answers.web === "object") {
        const form = { ...emptyForm(), ...(answers.web as Partial<ListingForm>) };
        return { form, step: isStepKey(draft.stepKey) ? draft.stepKey : "category" };
    }
    const form = emptyForm();
    const str = (key: string) => (typeof answers[key] === "string" ? (answers[key] as string) : "");
    const category = str("category").toUpperCase();
    form.category = ["INDOOR", "OUTDOOR", "TRANSIT", "MEDIA"].includes(category) ? (category as ListingCategory) : null;
    form.venueTypeId = str("venue_type_id") || null;
    form.mediaTypeId = str("media_type_id") || null;
    form.materialId = str("material_id") || null;
    form.title = str("title");
    form.placement = str("placement");
    form.address = str("address");
    form.city = str("city");
    const point = answers.location as { latitude?: number; longitude?: number } | undefined;
    form.location = point && typeof point.latitude === "number" && typeof point.longitude === "number" ? { latitude: point.latitude, longitude: point.longitude } : null;
    form.widthFt = str("width_ft");
    form.heightFt = str("height_ft");
    form.illumination = str("illumination");
    form.facing = str("facing");
    form.vehicleNumber = str("vehicle_number");
    form.description = str("description");
    form.targetAudience = str("target_audience");
    form.uniqueSellingPoint = str("unique_selling_point");
    form.footfallNote = str("footfall_note");
    form.pricingUnit = (str("pricing_unit") as PricingUnit) || "";
    form.basePrice = str("base_price");
    form.minBookingDays = str("min_booking_days");
    form.availableFrom = str("available_from");
    form.peakPeriodNote = str("peak_period_note");
    const hours = answers.available_hours as { from?: string; to?: string } | undefined;
    form.visibilityWindow = visibilityWindowOf(hours?.from, hours?.to);
    form.rateCard = str("rate_card") ? { url: str("rate_card"), name: fileNameOf(str("rate_card")) } : null;
    form.rightsBasis = (str("rights_basis") as RightsBasis) || "";
    form.rightsValidUntil = str("rights_valid_until");
    form.ownVenue = form.rightsBasis === "OWNED";
    const rules = answers.content_rules as { contentCategoryId: string; stance: ContentStance }[] | undefined;
    if (Array.isArray(rules)) form.contentRules = Object.fromEntries(rules.map((r) => [r.contentCategoryId, r.stance]));
    form.photos.front = str("main_photo") ? { url: str("main_photo"), name: fileNameOf(str("main_photo")) } : null;
    form.photos.wide = str("wide_photo") ? { url: str("wide_photo"), name: fileNameOf(str("wide_photo")) } : null;
    const docs = answers.documents as { kind: string; url: string }[] | undefined;
    if (Array.isArray(docs)) {
        for (const slot of documentSlotsFor(form.category)) {
            const row = docs.find((d) => d.kind === slot.kind);
            if (row && !form.documents[slot.key]) form.documents[slot.key] = { url: row.url, name: fileNameOf(row.url) };
        }
    }
    /* Where the phone stopped, by the closest chapter. */
    const phoneStep = draft.stepKey ?? "";
    const step: StepKey = phoneStep === "venue" ? "venue" : phoneStep === "spot-type" ? "format" : phoneStep === "spot-details" ? "details" : phoneStep === "more-info" ? "description" : phoneStep === "content-rules" ? "rules" : phoneStep === "pricing" ? "pricing" : phoneStep === "documents" ? "documents" : phoneStep === "review" ? "review" : "category";
    return { form, step };
}

/* ── The review step's summary rows ────────────────────────────────────── */

export function summaryOf(form: ListingForm, catalogue: Catalogue | null): { category: string; venue: string; spotType: string; area: string; location: string; pricing: string } {
    const area = areaSqFt(form.widthFt, form.heightFt);
    const unit = form.pricingUnit ? { PER_DAY: "day", PER_WEEK: "week", PER_MONTH: "month", PER_SQFT_PER_DAY: "sq.ft / day", PER_SQFT_PER_MONTH: "sq.ft / month" }[form.pricingUnit] : null;
    const price = /^\d+(\.\d{1,2})?$/.test(form.basePrice.trim()) ? `₹${Math.round(Number(form.basePrice)).toLocaleString("en-IN")}` : null;
    return {
        category: form.category ? { OUTDOOR: "Outdoor Ad Spots", INDOOR: "Indoor Ad Spots", TRANSIT: "Transit Ad Spots", MEDIA: "Media Ad Spots" }[form.category] : "Not chosen",
        venue: venueName(form, catalogue) ?? (form.category === "OUTDOOR" ? "Roadside · no venue" : "Not chosen"),
        spotType: formatName(form, catalogue) ?? "Not chosen",
        area: area ? `${area} sq.ft` : form.slotDuration || "—",
        location: [form.address.trim(), form.city.trim()].filter(Boolean).join(", ") || "Not added",
        pricing: price && unit ? `${price} / placement / ${unit}` : "Not set",
    };
}
