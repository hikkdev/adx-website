import {
    areaSqFt,
    documentSlotsFor,
    isDigitalMediaType,
    isoDay,
    normalisePlate,
    RIGHTS_PAPERS,
    shortName,
    type Catalogue,
    type ContentStance,
    type Listing,
    type ListingCategory,
    type ListingDocument,
    type ListingDocumentKind,
    type ListingDraft,
    type PricingUnit,
    type RightsBasis,
} from "@/services/listing-editor";
import { isPrivateFileUrl } from "@/lib/private-file";
import { digitsOnly, ELEVATIONS, PHOTO_META_FIELD, siteCodeOf, siteFieldApplies, SITE_FIELD, TERMS_FIELD, TRAFFIC_GRADES, VEHICLE_KINDS, VISIBILITY_RANGES, wholeNumberOf, type ExtraAnswer } from "@/services/listing-site-questions";

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
    /** How close the fix is, in metres — only when the browser's GPS placed the pin; a clicked or dragged pin has none. */
    accuracyM?: number;
}

export interface StoredFile {
    url: string;
    name: string;
    /** The upload row (`POST /upload` answers its id) — a photograph files it as `uploadedFileId`. */
    fileId?: string;
    /** When a photograph was taken, off its own EXIF, when the file says. */
    takenAt?: string;
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
    /** "Installation by ADX · Special Pricing Applicable" — `installationByAdx`, sent only when ticked (LF-2). */
    installationByAdx: boolean;

    /*
     * The site questions (listing-data-gaps lot, 3 Oct 2026) — asked of the
     * spots `siteFieldApplies` names: footfall (a whole number), how busy,
     * how far it is seen and how high (codes), a screen's pixels.
     */
    estimatedDailyFootfall: string;
    trafficGrade: string;
    visibility: string;
    elevation: string;
    widthPx: string;
    heightPx: string;

    /* Vehicle and route (5204:78093) */
    vehicleNumber: string;
    /** "What kind of vehicle?" — a code (`VEHICLE_KINDS`) → `vehicleType`. */
    vehicleType: string;
    /** `vehicleModel` (LF-2). */
    vehicleModel: string;
    operatingHours: string;

    /* Outlet and audience reach (5204:78275) — `broadcastLanguage`, `contentFormat`, the slot as `size`; the coverage its own column (never the city) */
    broadcastLanguage: string;
    contentFormat: string;
    coverage: string;
    slotDuration: string;

    /* Space description (5204:78454) */
    description: string;
    targetAudience: string;
    uniqueSellingPoint: string;
    footfallNote: string;

    /* Audience evidence (5204:78629) — the six facts are `audienceDemographics`; the two reports are filed as AUDIENCE_RATING / FOOTFALL_AUDIT papers (LF-2) */
    audience: { ageBand: string; genderSplit: string; urbanRural: string; secProfile: string; incomeBracket: string; occupation: string };
    audienceDocs: { barc: StoredFile | null; footfall: StoredFile | null };

    /* Availability and booking terms (5204:78822) */
    availableYearRound: "" | "yes" | "no";
    /** "Available to book now?" — the switch opens on (the column's default); only a "no" travels on a create. */
    availableNow: boolean;
    visibilityWindow: string;
    /** Hours the five windows cannot name — a phone's own pair, or a listing's — kept as they are rather than dropped. */
    customHours: { from: string; to: string } | null;
    minBookingDays: string;
    /** LF-2: `maxBookingDays` and `advanceBookingDays` (the option id is the number of days). */
    maxBookingDays: string;
    advanceBookingDays: string;
    /** LF-2: `flexible` | `7` | `14` | `30` | `none` → `cancellationPolicy` (+ `cancellationNoticeDays`); see `cancellationOf`. */
    cancellationNotice: string;
    /** Lot D (Q6/Q105): accept bookings the moment they are placed — sent only when true, and only while the flag is on. */
    instantBooking: boolean;

    /* Listing price (5204:79001) */
    pricingUnit: PricingUnit | "";
    basePrice: string;
    availableFrom: string;
    peakPeriodNote: string;
    slotsTotal: number;

    /* Rate card (5204:79601) — `rateCardUrl`, `rateCardValidFrom` / `rateCardValidTo` (YYYY-MM-DD), `seasonalVariationNote` (the words) */
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

    /**
     * FL-1 (27 Sep 2026): answers to flow fields the listing has no column
     * and this form no key for — the review step's attestation (`terms`),
     * anything the console adds to `flows.listing` later — keyed by the
     * flow field id and kept with the draft. Never read by `toCreateBody`;
     * since the listing-data-gaps lot `declarationsBody` files the tick as
     * `termsAcceptedAt` and every other one as an extra answer.
     */
    extra: Record<string, unknown>;
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
        estimatedDailyFootfall: "",
        trafficGrade: "",
        visibility: "",
        elevation: "",
        widthPx: "",
        heightPx: "",
        vehicleNumber: "",
        vehicleType: "",
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
        availableNow: true,
        visibilityWindow: "",
        customHours: null,
        minBookingDays: "",
        maxBookingDays: "",
        advanceBookingDays: "",
        cancellationNotice: "",
        instantBooking: false,
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
        extra: {},
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

/** LF-2: the flow's `max_booking_days` options — the value is the number of days, as `maxBookingDays` stores it. */
export const MAX_BOOKING_PERIODS: { value: string; label: string }[] = [
    { value: "7", label: "7 days" },
    { value: "14", label: "14 days" },
    { value: "30", label: "30 days" },
    { value: "90", label: "90 days" },
    { value: "180", label: "180 days" },
    { value: "365", label: "1 year" },
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

/** LF-2: the flow's `rate_card_seasonal` options — stored as the words chosen (`seasonalVariationNote`), so the value is the label. */
export const SEASONAL_VARIATIONS: { value: string; label: string }[] = [
    "No seasonal change",
    "Higher in the festive season (Oct – Dec)",
    "Higher in the wedding season",
    "Lower in summer",
    "Lower in the monsoon",
    "Premium in event weeks",
    "Other — noted on the card",
].map((words) => ({ value: words, label: words }));

/** The keys the rate card step stored before LF-2, for a draft saved then. */
const OLD_SEASONAL_KEYS = new Map<string, string>([
    ["none", "No seasonal change"],
    ["festive", "Higher in the festive season (Oct – Dec)"],
    ["wedding", "Higher in the wedding season"],
    ["summer", "Lower in summer"],
    ["monsoon", "Lower in the monsoon"],
    ["events", "Premium in event weeks"],
    ["other", "Other — noted on the card"],
]);

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

/**
 * The hours `availableHours*` hold: the visibility window, else hours the
 * five windows cannot name (kept as they came — before this lot a phone's
 * "10 AM – 7 PM" was dropped on its way through), else the transit
 * operating hours, as before. The operating hours have columns of their
 * own since that lot (`operatingHoursFrom/To`, `operatingHoursOf`), so a
 * window that outranks them here no longer throws them away.
 */
export function hoursPairOf(form: Pick<ListingForm, "visibilityWindow" | "customHours" | "operatingHours">): { from: string; to: string } | null {
    const window = VISIBILITY_WINDOWS.find((w) => w.key === form.visibilityWindow);
    if (window) return { from: window.from, to: window.to };
    if (form.customHours && form.customHours.from && form.customHours.to) return { from: form.customHours.from, to: form.customHours.to };
    const operating = OPERATING_HOURS.find((w) => w.value === form.operatingHours);
    return operating ? { from: operating.from, to: operating.to } : null;
}

function hoursOf(form: ListingForm): { availableHoursFrom?: string; availableHoursTo?: string } {
    const pair = hoursPairOf(form);
    return pair ? { availableHoursFrom: pair.from, availableHoursTo: pair.to } : {};
}

/** The transit operating hours in their own columns — kept beside the visibility window, never instead of it. */
function operatingHoursOf(form: Pick<ListingForm, "operatingHours">): { operatingHoursFrom?: string; operatingHoursTo?: string } {
    const operating = OPERATING_HOURS.find((w) => w.value === form.operatingHours);
    return operating ? { operatingHoursFrom: operating.from, operatingHoursTo: operating.to } : {};
}

export function contentRulesOf(form: ListingForm): { contentCategoryId: string; stance: ContentStance }[] {
    return Object.entries(form.contentRules)
        .filter(([, stance]) => !!stance)
        .map(([contentCategoryId, stance]) => ({ contentCategoryId, stance }));
}

/** The photographs in the review's order; each carries its upload row and the moment it was taken when they are known. */
export function photosOf(form: ListingForm): { url: string; type: string; uploadedFileId?: string; takenAt?: string }[] {
    return (["front", "left", "right", "wide"] as const)
        .filter((k) => form.photos[k])
        .map((k) => {
            const photo = form.photos[k]!;
            return { url: photo.url, type: k.toUpperCase(), ...(photo.fileId ? { uploadedFileId: photo.fileId } : {}), ...(photo.takenAt ? { takenAt: photo.takenAt } : {}) };
        });
}

/** Whether the spot is a screen — the spot type chosen names one, or its illumination says "Digital" (the flow template's rule) — the pixels are asked only then. */
export function isDigitalForm(form: Pick<ListingForm, "mediaTypeId" | "illumination">, catalogue: Catalogue | null): boolean {
    return isDigitalMediaType(catalogue?.mediaTypes.find((m) => m.id === form.mediaTypeId)) || form.illumination.trim().toLowerCase() === "digital";
}

/** Whether a site question is asked of this form's spot (`siteFieldApplies`, with the screen check off the catalogue). */
export function siteAsks(fieldId: string, form: Pick<ListingForm, "category" | "mediaTypeId" | "illumination">, catalogue: Catalogue | null): boolean {
    return siteFieldApplies(fieldId, { category: form.category, digital: isDigitalForm(form, catalogue) });
}

/**
 * The site questions' answers as columns — only what was answered, and only
 * for a spot the question is asked of, so a footfall typed before the
 * category moved to transit is not filed. All optional; none blocks.
 */
export function siteAnswersOf(form: ListingForm, catalogue: Catalogue | null): Record<string, unknown> {
    const asks = (id: string) => siteAsks(id, form, catalogue);
    const footfall = asks(SITE_FIELD.footfall) ? wholeNumberOf(form.estimatedDailyFootfall) : undefined;
    const widthPx = asks(SITE_FIELD.widthPx) ? wholeNumberOf(form.widthPx, 1) : undefined;
    const heightPx = asks(SITE_FIELD.heightPx) ? wholeNumberOf(form.heightPx, 1) : undefined;
    return {
        ...(footfall !== undefined ? { estimatedDailyFootfall: footfall } : {}),
        ...(asks(SITE_FIELD.traffic) && text(form.trafficGrade) ? { trafficGrade: text(form.trafficGrade) } : {}),
        ...(asks(SITE_FIELD.visibility) && text(form.visibility) ? { visibility: text(form.visibility) } : {}),
        ...(asks(SITE_FIELD.elevation) && text(form.elevation) ? { elevation: text(form.elevation) } : {}),
        ...(widthPx !== undefined ? { widthPx } : {}),
        ...(heightPx !== undefined ? { heightPx } : {}),
        ...(asks(SITE_FIELD.vehicleType) && text(form.vehicleType) ? { vehicleType: text(form.vehicleType) } : {}),
    };
}

/** The pin's accuracy, in metres to one place, when a GPS fix placed it. */
function pinAccuracyOf(form: Pick<ListingForm, "location">): { locationAccuracyM?: number } {
    const accuracy = form.location?.accuracyM;
    return typeof accuracy === "number" && Number.isFinite(accuracy) && accuracy >= 0 ? { locationAccuracyM: Math.round(accuracy * 10) / 10 } : {};
}

/* LF-2 (28 Sep 2026): the listing flow's restored questions — one mapping on the website, both apps and the console. */

const AUDIENCE_KEYS = ["ageBand", "genderSplit", "urbanRural", "secProfile", "incomeBracket", "occupation"] as const;

/** The six audience facts as `audienceDemographics` holds them: only the answered ones, the words chosen; null when none is. */
export function audienceDemographicsOf(form: Pick<ListingForm, "audience">): Record<string, string> | null {
    const answered = AUDIENCE_KEYS.map((key) => [key, form.audience[key].trim()] as const).filter(([, value]) => value !== "");
    return answered.length ? Object.fromEntries(answered) : null;
}

/** A number of days off an option id ("0", "7", …), at least `min`; anything else is no answer. */
function daysOf(value: string, min: number): number | undefined {
    const trimmed = value.trim();
    return /^\d+$/.test(trimmed) && Number(trimmed) >= min ? Number(trimmed) : undefined;
}

/** The cancellation answer as the two columns hold it: flexible → FLEXIBLE; a number → NOTICE with that many days; none → NONE. */
export function cancellationOf(notice: string): { cancellationPolicy?: "FLEXIBLE" | "NOTICE" | "NONE"; cancellationNoticeDays?: number } {
    const answer = notice.trim();
    if (answer === "flexible") return { cancellationPolicy: "FLEXIBLE" };
    if (answer === "none") return { cancellationPolicy: "NONE" };
    const days = daysOf(answer, 1);
    return days !== undefined ? { cancellationPolicy: "NOTICE", cancellationNoticeDays: days } : {};
}

/** The columns back into the answer `cancellationOf` reads. */
function cancellationNoticeOf(listing: Pick<Listing, "cancellationPolicy" | "cancellationNoticeDays">): string {
    if (listing.cancellationPolicy === "FLEXIBLE") return "flexible";
    if (listing.cancellationPolicy === "NONE") return "none";
    const days = listing.cancellationNoticeDays;
    return (listing.cancellationPolicy === "NOTICE" || !listing.cancellationPolicy) && typeof days === "number" && days > 0 ? String(days) : "";
}

/** Maximum period, advance notice, cancellation — the booking terms beyond the minimum. */
function bookingTermsOf(form: ListingForm): Record<string, unknown> {
    const max = daysOf(form.maxBookingDays, 1);
    const advance = daysOf(form.advanceBookingDays, 0);
    return {
        ...(max !== undefined ? { maxBookingDays: max } : {}),
        ...(advance !== undefined ? { advanceBookingDays: advance } : {}),
        ...cancellationOf(form.cancellationNotice),
    };
}

/** The rate card's validity (YYYY-MM-DD) and its seasonal note. */
function rateCardTermsOf(form: ListingForm): Record<string, unknown> {
    return {
        ...(text(form.rateCardValidFrom) ? { rateCardValidFrom: text(form.rateCardValidFrom) } : {}),
        ...(text(form.rateCardValidTo) ? { rateCardValidTo: text(form.rateCardValidTo) } : {}),
        ...(text(form.rateCardSeasonal) ? { seasonalVariationNote: text(form.rateCardSeasonal) } : {}),
    };
}

/** The paper each audience report is filed as. */
export const AUDIENCE_DOCUMENT_KINDS: Record<keyof ListingForm["audienceDocs"], ListingDocumentKind> = { barc: "AUDIENCE_RATING", footfall: "FOOTFALL_AUDIT" };

export interface DocumentPost {
    /** What the submit remembers as filed, so a retry does not file it twice. */
    key: string;
    kind: ListingDocumentKind;
    url: string;
    expiresAt?: string;
}

/**
 * Every paper the last step files once the listing exists, one
 * `POST /supply/listings/:id/documents` each and in this order: the site's
 * slots for the category, the kinds the flow's documents field added, then
 * the two audience reports (LF-2). A rights paper carries the term it runs to.
 */
export function documentPostsOf(form: ListingForm): DocumentPost[] {
    const term = form.rightsBasis && form.rightsBasis !== "OWNED" && form.rightsValidUntil ? form.rightsValidUntil : null;
    const expiry = (kind: ListingDocumentKind) => (term && RIGHTS_PAPERS.has(kind) ? { expiresAt: term } : {});
    const posts: DocumentPost[] = [];
    for (const slot of documentSlotsFor(form.category)) {
        const answer = form.documents[slot.key];
        if (answer && "url" in answer) posts.push({ key: slot.key, kind: slot.kind, url: answer.url, ...expiry(slot.kind) });
    }
    /* FL-1: a paper of a kind the site has no slot for is keyed `kind:<KIND>` by the flow's documents field and filed by that kind. */
    for (const [key, answer] of Object.entries(form.documents)) {
        if (!key.startsWith("kind:") || !answer || !("url" in answer)) continue;
        const kind = key.split(":")[1] as ListingDocumentKind;
        posts.push({ key, kind, url: answer.url, ...expiry(kind) });
    }
    for (const key of ["barc", "footfall"] as const) {
        const file = form.audienceDocs[key];
        if (file) posts.push({ key: `audience:${key}`, kind: AUDIENCE_DOCUMENT_KINDS[key], url: file.url });
    }
    return posts;
}

export function toCreateBody(form: ListingForm, catalogue: Catalogue | null): Record<string, unknown> {
    const media = form.category === "MEDIA";
    const minDays = Number(form.minBookingDays);
    const rules = contentRulesOf(form);
    const photos = photosOf(form);
    const slots = isDigitalMediaType(catalogue?.mediaTypes.find((m) => m.id === form.mediaTypeId)) ? form.slotsTotal : 1;
    const audience = audienceDemographicsOf(form);
    return {
        category: form.category,
        title: effectiveTitle(form, catalogue),
        address: form.address.trim(),
        /* The listing-data-gaps lot: the coverage (a media outlet's reach, a transit or area spot's ground) is its own column — the city stays the city, never "Bengaluru + 50 km". */
        ...(text(form.city) ? { city: text(form.city) } : {}),
        ...(text(form.coverage) ? { coverage: text(form.coverage) } : {}),
        ...(form.location ? { latitude: form.location.latitude, longitude: form.location.longitude, ...pinAccuracyOf(form) } : {}),
        ...(form.venueTypeId ? { venueTypeId: form.venueTypeId } : {}),
        ...(form.mediaTypeId ? { mediaTypeId: form.mediaTypeId } : {}),
        ...(form.materialId ? { materialId: form.materialId } : {}),
        ...(text(form.placement) ? { placement: text(form.placement) } : {}),
        ...(text(form.widthFt) ? { widthFt: text(form.widthFt) } : {}),
        ...(text(form.heightFt) ? { heightFt: text(form.heightFt) } : {}),
        ...(text(form.illumination) ? { illumination: text(form.illumination) } : {}),
        ...(text(form.facing) ? { facing: text(form.facing) } : {}),
        ...(form.installationByAdx ? { installationByAdx: true } : {}),
        ...siteAnswersOf(form, catalogue),
        ...(text(form.vehicleNumber) ? { vehicleNumber: normalisePlate(form.vehicleNumber) } : {}),
        ...(text(form.vehicleModel) ? { vehicleModel: text(form.vehicleModel) } : {}),
        ...(text(form.broadcastLanguage) ? { broadcastLanguage: text(form.broadcastLanguage) } : {}),
        ...(text(form.contentFormat) ? { contentFormat: text(form.contentFormat) } : {}),
        ...(media && text(form.slotDuration) ? { size: text(form.slotDuration) } : {}),
        ...(audience ? { audienceDemographics: audience } : {}),
        ...(text(form.description) ? { description: text(form.description) } : {}),
        ...(text(form.targetAudience) ? { targetAudience: text(form.targetAudience) } : {}),
        ...(text(form.uniqueSellingPoint) ? { uniqueSellingPoint: text(form.uniqueSellingPoint) } : {}),
        ...(text(form.footfallNote) ? { footfallNote: text(form.footfallNote) } : {}),
        ...(form.pricingUnit && text(form.basePrice) ? { pricingUnit: form.pricingUnit, basePrice: text(form.basePrice) } : {}),
        ...(Number.isInteger(minDays) && minDays > 0 ? { minBookingDays: minDays } : {}),
        // LF-2: its own column — `availableNow` is the live occupied flag the planner filters on and orders flip.
        ...(form.availableYearRound === "yes" ? { availableYearRound: true } : {}),
        ...(form.availableYearRound === "no" ? { availableYearRound: false } : {}),
        /* "Available to book now?" opens on yes, the column's default — so only a "no" needs saying. */
        ...(form.availableNow === false ? { availableNow: false } : {}),
        ...bookingTermsOf(form),
        ...(text(form.availableFrom) ? { availableFrom: text(form.availableFrom) } : {}),
        ...hoursOf(form),
        ...operatingHoursOf(form),
        ...(text(form.peakPeriodNote) ? { peakPeriodNote: text(form.peakPeriodNote) } : {}),
        ...(form.instantBooking ? { instantBooking: true } : {}),
        ...(form.rateCard ? { rateCardUrl: form.rateCard.url } : {}),
        ...rateCardTermsOf(form),
        ...(form.rightsBasis ? { rightsBasis: form.rightsBasis } : {}),
        ...(form.rightsBasis && form.rightsBasis !== "OWNED" && text(form.rightsValidUntil) ? { rightsValidUntil: text(form.rightsValidUntil) } : {}),
        ...(slots > 1 ? { slotsTotal: slots } : {}),
        ...(rules.length ? { contentRules: rules } : {}),
        ...(photos.length ? { photos } : {}),
    };
}

/* ── The answers that used to be thrown away (listing-data-gaps lot) ─────── */

/** "Not applicable" / "I am the owner" on a paper, as the listing keeps it: the kind, and which paper and what was said. ADX stamps when. */
export function documentWaiversOf(form: Pick<ListingForm, "category" | "documents">): { kind: ListingDocumentKind; reason: string }[] {
    return documentSlotsFor(form.category).flatMap((slot) => {
        const answer = form.documents[slot.key];
        return answer && "waived" in answer && answer.waived ? [{ kind: slot.kind, reason: `${slot.title}: ${answer.waived}` }] : [];
    });
}

/** A stored waiver back onto its slot — by the paper named in the reason, else the only slot of its kind. */
export function documentsFromWaivers(category: ListingCategory | null, waivers: Listing["documentWaivers"]): ListingForm["documents"] {
    const out: ListingForm["documents"] = {};
    if (!Array.isArray(waivers)) return out;
    const slots = documentSlotsFor(category);
    for (const waiver of waivers) {
        if (!waiver || typeof waiver.kind !== "string") continue;
        const reason = typeof waiver.reason === "string" ? waiver.reason : "";
        const named = slots.find((s) => s.kind === waiver.kind && reason.startsWith(`${s.title}:`));
        const ofKind = slots.filter((s) => s.kind === waiver.kind);
        const slot = named ?? (ofKind.length === 1 ? ofKind[0] : undefined);
        if (!slot || out[slot.key]) continue;
        const said = named ? reason.slice(slot.title.length + 1).trim() : reason.trim();
        out[slot.key] = { waived: said || slot.waiver || "Not applicable" };
    }
    return out;
}

/**
 * What the create says beside `toCreateBody`'s columns — the answers a
 * listing used to lose on its way to the server, in the backend's LD-1
 * shapes (ADX stamps the moments):
 *
 *   - the review's tick → `termsAccepted: true` (+ `termsVersion`, the flow it was ticked on);
 *   - "I own the venue" (rights held as OWNED) → `ownershipDeclared: true`;
 *   - a paper marked "Not applicable" / "I am the owner" → `documentWaivers: [{ kind, reason }]`;
 *   - every flow answer no column takes (`context.extraAnswers`, labelled by the flow) → `extraAnswers`.
 *
 * Kept apart from `toCreateBody`, whose body the parity tests hold; the
 * wizard merges the two. Each only when there is something to say.
 */
export function declarationsBody(form: ListingForm, context: { termsVersion?: string | null; extraAnswers?: ExtraAnswer[] } = {}): Record<string, unknown> {
    const waivers = documentWaiversOf(form);
    const extras = context.extraAnswers ?? [];
    return {
        ...(form.extra[TERMS_FIELD] === true ? { termsAccepted: true, ...(context.termsVersion ? { termsVersion: context.termsVersion } : {}) } : {}),
        ...(form.rightsBasis === "OWNED" ? { ownershipDeclared: true } : {}),
        ...(waivers.length ? { documentWaivers: waivers } : {}),
        ...(extras.length ? { extraAnswers: extras } : {}),
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
export function patchFor(section: EditSection, form: ListingForm, catalogue: Catalogue | null = null): Record<string, unknown> {
    const minDays = Number(form.minBookingDays);
    switch (section) {
        case "details":
            /* A transit listing's details page is the vehicle page — before this lot its registration, model and hours went nowhere from here. */
            if (form.category === "TRANSIT") return patchFor("vehicle", form, catalogue);
            return {
                /* The site questions this spot is asked (the pixels only once the catalogue names the type a screen). */
                ...siteAnswersOf(form, catalogue),
                ...(text(form.coverage) ? { coverage: text(form.coverage) } : {}),
                ...(text(form.title) ? { title: text(form.title) } : {}),
                ...(text(form.placement) ? { placement: text(form.placement) } : {}),
                ...(text(form.widthFt) ? { widthFt: text(form.widthFt) } : {}),
                ...(text(form.heightFt) ? { heightFt: text(form.heightFt) } : {}),
                ...(text(form.illumination) ? { illumination: text(form.illumination) } : {}),
                ...(text(form.facing) ? { facing: text(form.facing) } : {}),
                /* LF-2: the tick is drawn for a fixed spot, so its state is the answer — an untick clears it. */
                ...(form.category === "INDOOR" || form.category === "OUTDOOR" ? { installationByAdx: form.installationByAdx } : {}),
                /* LF-2: a media listing's details are its outlet. */
                ...(text(form.broadcastLanguage) ? { broadcastLanguage: text(form.broadcastLanguage) } : {}),
                ...(text(form.contentFormat) ? { contentFormat: text(form.contentFormat) } : {}),
                ...(form.category === "MEDIA" && text(form.slotDuration) ? { size: text(form.slotDuration) } : {}),
            };
        case "vehicle":
            return {
                ...(text(form.title) ? { title: text(form.title) } : {}),
                ...(text(form.vehicleNumber) ? { vehicleNumber: normalisePlate(form.vehicleNumber) } : {}),
                ...siteAnswersOf({ ...form, category: "TRANSIT" }, catalogue),
                ...(text(form.coverage) ? { coverage: text(form.coverage) } : {}),
                ...(text(form.vehicleModel) ? { vehicleModel: text(form.vehicleModel) } : {}),
                ...(text(form.placement) ? { placement: text(form.placement) } : {}),
                /* The vehicle page asks the operating hours: their own columns, and — as before — the hours when no window outranks them. */
                ...hoursOf(form),
                ...operatingHoursOf(form),
            };
        case "description":
            return {
                ...(text(form.description) ? { description: text(form.description) } : {}),
                ...(text(form.targetAudience) ? { targetAudience: text(form.targetAudience) } : {}),
                ...(text(form.uniqueSellingPoint) ? { uniqueSellingPoint: text(form.uniqueSellingPoint) } : {}),
                ...(text(form.footfallNote) ? { footfallNote: text(form.footfallNote) } : {}),
            };
        case "audience": {
            /* The two reports are papers, filed through `/supply` by the page; the six facts are the column. */
            const audience = audienceDemographicsOf(form);
            return audience ? { audienceDemographics: audience } : {};
        }
        case "terms":
            return {
                ...(form.availableYearRound === "yes" ? { availableYearRound: true } : {}),
                ...(form.availableYearRound === "no" ? { availableYearRound: false } : {}),
                ...hoursOf(form),
                ...(Number.isInteger(minDays) && minDays > 0 ? { minBookingDays: minDays } : {}),
                ...bookingTermsOf(form),
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
            return { ...(form.rateCard ? { rateCardUrl: form.rateCard.url } : {}), ...rateCardTermsOf(form) };
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
    form.location = listing.latitude !== null && listing.longitude !== null ? { latitude: listing.latitude, longitude: listing.longitude, ...(typeof listing.locationAccuracyM === "number" ? { accuracyM: listing.locationAccuracyM } : {}) } : null;
    form.widthFt = listing.widthFt ? String(Number(listing.widthFt)) : "";
    form.heightFt = listing.heightFt ? String(Number(listing.heightFt)) : "";
    form.illumination = listing.illumination ?? "";
    form.facing = listing.facing ?? "";
    form.installationByAdx = listing.installationByAdx === true;
    /* The site questions: a code opens its select; words stored before the codes existed are matched to one, or offered as they are. */
    form.estimatedDailyFootfall = typeof listing.estimatedDailyFootfall === "number" ? String(listing.estimatedDailyFootfall) : "";
    form.trafficGrade = siteCodeOf(TRAFFIC_GRADES, listing.trafficGrade);
    form.visibility = siteCodeOf(VISIBILITY_RANGES, listing.visibility);
    form.elevation = siteCodeOf(ELEVATIONS, listing.elevation);
    form.widthPx = typeof listing.widthPx === "number" ? String(listing.widthPx) : "";
    form.heightPx = typeof listing.heightPx === "number" ? String(listing.heightPx) : "";
    form.vehicleType = siteCodeOf(VEHICLE_KINDS, listing.vehicleType);
    form.vehicleNumber = listing.vehicleNumber ?? "";
    form.vehicleModel = listing.vehicleModel ?? "";
    form.broadcastLanguage = listing.broadcastLanguage ?? "";
    form.contentFormat = listing.contentFormat ?? "";
    form.slotDuration = listing.category === "MEDIA" ? (listing.size ?? "") : "";
    /* Its own column since the listing-data-gaps lot; a media listing filed before it kept the coverage in the city. */
    form.coverage = listing.coverage ?? (listing.category === "MEDIA" && listing.coverage === undefined ? (listing.city ?? "") : "");
    form.description = listing.description ?? "";
    form.targetAudience = listing.targetAudience ?? "";
    form.uniqueSellingPoint = listing.uniqueSellingPoint ?? "";
    form.footfallNote = listing.footfallNote ?? "";
    /* LF-2: the profile the flow writes — words under the six keys; older shares (numbers, or a list) answer none of these selects. */
    const profile: Record<string, unknown> = listing.audienceDemographics && !Array.isArray(listing.audienceDemographics) ? listing.audienceDemographics : {};
    for (const key of AUDIENCE_KEYS) {
        const value = profile[key];
        if (typeof value === "string") form.audience[key] = value;
    }
    /* LF-2: "Available year-round?" is its own column — never `availableNow`, the live occupied flag. */
    form.availableYearRound = listing.availableYearRound === true ? "yes" : listing.availableYearRound === false ? "no" : "";
    form.availableNow = listing.availableNow !== false;
    form.visibilityWindow = visibilityWindowOf(listing.availableHoursFrom, listing.availableHoursTo);
    /* Their own columns since the listing-data-gaps lot; before, a transit listing's operating hours were its hours. */
    const operatingFrom = listing.operatingHoursFrom ?? listing.availableHoursFrom;
    const operatingTo = listing.operatingHoursFrom ? listing.operatingHoursTo : listing.availableHoursTo;
    form.operatingHours = OPERATING_HOURS.find((w) => w.from === operatingFrom && w.to === operatingTo)?.value ?? "";
    /* Hours none of the choices name are shown and kept as they are, not cleared by the next save. */
    form.customHours = !form.visibilityWindow && !form.operatingHours && listing.availableHoursFrom && listing.availableHoursTo ? { from: listing.availableHoursFrom, to: listing.availableHoursTo } : null;
    form.minBookingDays = listing.minBookingDays ? String(listing.minBookingDays) : "";
    form.maxBookingDays = typeof listing.maxBookingDays === "number" && listing.maxBookingDays > 0 ? String(listing.maxBookingDays) : "";
    form.advanceBookingDays = typeof listing.advanceBookingDays === "number" && listing.advanceBookingDays >= 0 ? String(listing.advanceBookingDays) : "";
    form.cancellationNotice = cancellationNoticeOf(listing);
    form.instantBooking = listing.instantBooking === true;
    form.pricingUnit = (listing.pricingUnit as PricingUnit) ?? "";
    form.basePrice = listing.basePrice ? String(Number(listing.basePrice)) : listing.ratePerDay ? String(Number(listing.ratePerDay)) : "";
    form.availableFrom = listing.availableFrom ? listing.availableFrom.slice(0, 10) : "";
    form.peakPeriodNote = listing.peakPeriodNote ?? "";
    form.slotsTotal = listing.slotsTotal ?? 1;
    form.rateCard = listing.rateCardUrl ? { url: listing.rateCardUrl, name: fileNameOf(listing.rateCardUrl) } : null;
    form.rateCardValidFrom = isoDay(listing.rateCardValidFrom);
    form.rateCardValidTo = isoDay(listing.rateCardValidTo);
    form.rateCardSeasonal = listing.seasonalVariationNote ?? "";
    form.contentRules = Object.fromEntries(rules.map((r) => [r.contentCategoryId, r.stance]));
    const photos = listing.photos ?? [];
    const pick = (type: string, index: number) => photos.find((p) => p.type?.toUpperCase() === type) ?? (photos.every((p) => !["FRONT", "LEFT", "RIGHT", "WIDE"].includes(p.type?.toUpperCase())) ? photos[index] : undefined);
    const stored = (type: string, index: number): StoredFile | null => {
        const photo = pick(type, index);
        return photo ? { url: photo.url, name: fileNameOf(photo.url), ...(photo.uploadedFileId ? { fileId: photo.uploadedFileId } : {}), ...(photo.takenAt ? { takenAt: photo.takenAt } : {}) } : null;
    };
    form.photos = { front: stored("FRONT", 0), left: stored("LEFT", 1), right: stored("RIGHT", 2), wide: stored("WIDE", 3) };
    form.rightsBasis = listing.rightsBasis ?? "";
    form.rightsValidUntil = listing.rightsValidUntil ? listing.rightsValidUntil.slice(0, 10) : "";
    form.ownVenue = listing.rightsBasis === "OWNED";
    /* The papers marked "Not applicable" / "I am the owner" come back onto their slots, so the documents page shows them and a save keeps them. */
    form.documents = documentsFromWaivers(listing.category, listing.documentWaivers);
    /* The latest document of each kind fills the slot that asks for that kind. */
    const slots = documentSlotsFor(listing.category);
    for (const slot of slots) {
        const latest = documents.find((d) => d.kind === slot.kind && !form.documents[slot.key] && !Object.values(form.documents).some((v) => v && "url" in v && v.url === d.url));
        if (latest) form.documents[slot.key] = { url: latest.url, name: fileNameOf(latest.url) };
    }
    /* LF-2: the latest audience report of each kind, so the audience page shows what is on file and does not file it twice. */
    for (const key of ["barc", "footfall"] as const) {
        const latest = documents.find((d) => d.kind === AUDIENCE_DOCUMENT_KINDS[key]);
        if (latest) form.audienceDocs[key] = { url: latest.url, name: fileNameOf(latest.url) };
    }
    return form;
}

/** The name a stored file is shown under. ST-2: a private file's URL ends in its id, which names nothing a person would recognise. */
export const PRIVATE_DOCUMENT_NAME = "Private document";

export function fileNameOf(url: string): string {
    if (isPrivateFileUrl(url)) return PRIVATE_DOCUMENT_NAME;
    try {
        const path = new URL(url, "http://x").pathname;
        return decodeURIComponent(path.split("/").pop() || url);
    } catch {
        return url.split("/").pop() || url;
    }
}

/* ── The apps' shapes for a pin and a photograph's row ─────────────────── */

/** A pin from the apps' `{ latitude, longitude, accuracyM? }` (an older phone's `accuracy` read too). */
export function pointFromAnswer(value: unknown): GeoPoint | null {
    const point = value as { latitude?: unknown; longitude?: unknown; accuracyM?: unknown; accuracy?: unknown } | null | undefined;
    if (!point || typeof point.latitude !== "number" || !Number.isFinite(point.latitude) || typeof point.longitude !== "number" || !Number.isFinite(point.longitude)) return null;
    const accuracy = typeof point.accuracyM === "number" ? point.accuracyM : typeof point.accuracy === "number" ? point.accuracy : null;
    return { latitude: point.latitude, longitude: point.longitude, ...(accuracy !== null && Number.isFinite(accuracy) && accuracy >= 0 ? { accuracyM: accuracy } : {}) };
}

type PhotoMeta = { uploadedFileId?: string | null; takenAt?: string | null };

/** The apps' `photo_meta` — `{ [url]: { uploadedFileId, takenAt } }` — off the form's photographs; null when none carries any. */
export function photoMetaOf(photos: ListingForm["photos"]): Record<string, PhotoMeta> | null {
    const meta: Record<string, PhotoMeta> = {};
    for (const photo of Object.values(photos)) {
        if (photo && (photo.fileId || photo.takenAt)) meta[photo.url] = { ...(photo.fileId ? { uploadedFileId: photo.fileId } : {}), ...(photo.takenAt ? { takenAt: photo.takenAt } : {}) };
    }
    return Object.keys(meta).length ? meta : null;
}

/** The photographs with the apps' `photo_meta` put back on them, by URL. */
export function withPhotoMeta(photos: ListingForm["photos"], meta: unknown): ListingForm["photos"] {
    if (!meta || typeof meta !== "object") return photos;
    const rows = meta as Record<string, PhotoMeta | undefined>;
    const put = (photo: StoredFile | null): StoredFile | null => {
        const row = photo ? rows[photo.url] : undefined;
        if (!photo || !row) return photo;
        return { ...photo, ...(typeof row.uploadedFileId === "string" && row.uploadedFileId ? { fileId: row.uploadedFileId } : {}), ...(typeof row.takenAt === "string" && row.takenAt ? { takenAt: row.takenAt } : {}) };
    };
    return { front: put(photos.front), left: put(photos.left), right: put(photos.right), wide: put(photos.wide) };
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
        /* A draft saved before LF-2 kept the seasonal note by key; the column takes the words. */
        form.rateCardSeasonal = OLD_SEASONAL_KEYS.get(form.rateCardSeasonal) ?? form.rateCardSeasonal;
        return { form, step: isStepKey(draft.stepKey) ? draft.stepKey : "category" };
    }
    const form = emptyForm();
    const str = (key: string) => (typeof answers[key] === "string" ? (answers[key] as string) : "");
    const fileAt = (key: string): StoredFile | null => (str(key) ? { url: str(key), name: fileNameOf(str(key)) } : null);
    const category = str("category").toUpperCase();
    form.category = ["INDOOR", "OUTDOOR", "TRANSIT", "MEDIA"].includes(category) ? (category as ListingCategory) : null;
    form.venueTypeId = str("venue_type_id") || null;
    form.mediaTypeId = str("media_type_id") || null;
    form.materialId = str("material_id") || null;
    form.title = str("title");
    form.placement = str("placement");
    form.address = str("address");
    form.city = str("city");
    form.location = pointFromAnswer(answers.location);
    form.widthFt = str("width_ft");
    form.heightFt = str("height_ft");
    form.illumination = str("illumination");
    form.facing = str("facing");
    form.installationByAdx = answers.installation_by_adx === true;
    const whole = (key: string) => (typeof answers[key] === "number" ? String(answers[key]) : digitsOnly(str(key)));
    form.estimatedDailyFootfall = whole(SITE_FIELD.footfall);
    form.trafficGrade = str(SITE_FIELD.traffic);
    form.visibility = str(SITE_FIELD.visibility);
    form.elevation = str(SITE_FIELD.elevation);
    form.widthPx = whole(SITE_FIELD.widthPx);
    form.heightPx = whole(SITE_FIELD.heightPx);
    form.vehicleType = str(SITE_FIELD.vehicleType);
    form.availableNow = answers[SITE_FIELD.availableNow] !== false;
    form.vehicleNumber = str("vehicle_number");
    form.vehicleModel = str("vehicle_model");
    form.broadcastLanguage = str("broadcast_language");
    form.contentFormat = str("content_format");
    form.coverage = str(SITE_FIELD.coverage);
    form.slotDuration = str("slot_duration");
    form.audience = { ageBand: str("age_band"), genderSplit: str("gender_split"), urbanRural: str("urban_rural"), secProfile: str("sec_profile"), incomeBracket: str("income_bracket"), occupation: str("occupation") };
    form.audienceDocs = { barc: fileAt("barc_report"), footfall: fileAt("footfall_report") };
    form.availableYearRound = answers.available_year_round === "yes" ? "yes" : answers.available_year_round === "no" ? "no" : "";
    form.maxBookingDays = str("max_booking_days");
    form.advanceBookingDays = str("advance_booking_days");
    form.cancellationNotice = str("cancellation_notice");
    form.description = str("description");
    form.targetAudience = str("target_audience");
    form.uniqueSellingPoint = str("unique_selling_point");
    form.footfallNote = str("footfall_note");
    form.pricingUnit = (str("pricing_unit") as PricingUnit) || "";
    form.basePrice = str("base_price");
    form.minBookingDays = str("min_booking_days");
    form.availableFrom = str("available_from");
    form.peakPeriodNote = str("peak_period_note");
    form.instantBooking = answers.instant_booking === true;
    const hours = answers.available_hours as { from?: string; to?: string } | undefined;
    form.visibilityWindow = visibilityWindowOf(hours?.from, hours?.to);
    form.customHours = !form.visibilityWindow && typeof hours?.from === "string" && typeof hours?.to === "string" && hours.from && hours.to ? { from: hours.from, to: hours.to } : null;
    form.rateCard = fileAt("rate_card");
    form.rateCardValidFrom = str("rate_card_valid_from");
    form.rateCardValidTo = str("rate_card_valid_to");
    form.rateCardSeasonal = str("rate_card_seasonal");
    form.rightsBasis = (str("rights_basis") as RightsBasis) || "";
    form.rightsValidUntil = str("rights_valid_until");
    form.ownVenue = form.rightsBasis === "OWNED";
    const rules = answers.content_rules as { contentCategoryId: string; stance: ContentStance }[] | undefined;
    if (Array.isArray(rules)) form.contentRules = Object.fromEntries(rules.map((r) => [r.contentCategoryId, r.stance]));
    form.photos = withPhotoMeta({ front: fileAt("main_photo"), left: fileAt("left_photo"), right: fileAt("right_photo"), wide: fileAt("wide_photo") }, answers[PHOTO_META_FIELD]);
    const docs = answers.documents as { kind: string; url: string }[] | undefined;
    if (Array.isArray(docs)) {
        for (const slot of documentSlotsFor(form.category)) {
            const row = docs.find((d) => d.kind === slot.kind);
            if (row && !form.documents[slot.key]) form.documents[slot.key] = { url: row.url, name: fileNameOf(row.url) };
        }
    }
    /* Where the phone stopped, by the closest chapter. */
    const phoneStep = draft.stepKey ?? "";
    const phoneSteps = new Map<string, StepKey>([
        ["venue", "venue"],
        ["spot-type", "format"],
        ["spot-details", "details"],
        ["more-info", "description"],
        ["audience", "audience"],
        ["content-rules", "rules"],
        ["terms", "terms"],
        ["pricing", "pricing"],
        ["rate-card", "ratecard"],
        ["documents", "documents"],
        ["review", "review"],
    ]);
    const step: StepKey = phoneSteps.get(phoneStep) ?? "category";
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
