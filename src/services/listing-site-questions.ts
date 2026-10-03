/**
 * The listing-data-gaps lot (the owner, 3 Oct 2026): ask what ADX stores,
 * store what ADX asks — the website's half.
 *
 * The site questions every listing form asks (daily footfall, how busy, how
 * far it can be seen, how high it is, a screen's resolution, the kind of
 * vehicle, available to book now): their flow field ids, their stable codes,
 * the words the website prints, and when each one is asked. The apps keep
 * the same table in `mobile/shared/features/listing/listing-answers.ts` —
 * same ids, same codes, same words, same order (the owner's rule: no
 * difference between the website and the apps).
 *
 * The codes are what the columns store; the labels live here. A value the
 * database held before the codes existed ("High", "Ground level") is read
 * back as its code when its words are one of the labels, and printed as it
 * is otherwise — never lost.
 */

/** The flow field ids `flows.listing` asks them under — the column names in snake case. */
export const SITE_FIELD = {
    footfall: "estimated_daily_footfall",
    traffic: "traffic_grade",
    visibility: "visibility",
    elevation: "elevation",
    widthPx: "width_px",
    heightPx: "height_px",
    vehicleType: "vehicle_type",
    availableNow: "available_now",
    coverage: "coverage",
} as const;

/** The words, as the website and the apps print them. */
export const SITE_LABEL = {
    footfall: "About how many people pass this spot in a day?",
    footfallHint: "Your best estimate — we may refine it with measured data.",
    traffic: "How busy is it?",
    visibility: "From how far can it be seen?",
    elevation: "How high is it?",
    pixels: "Screen resolution (pixels)",
    widthPx: "Width",
    heightPx: "Height",
    vehicleType: "What kind of vehicle?",
    availableNow: "Available to book now?",
} as const;

export interface SiteOption {
    value: string;
    label: string;
}

/** Stored as the code; the label is the client's. */
export const TRAFFIC_GRADES: readonly SiteOption[] = [
    { value: "LOW", label: "Low" },
    { value: "MEDIUM", label: "Medium" },
    { value: "HIGH", label: "High" },
    { value: "VERY_HIGH", label: "Very high" },
];

export const VISIBILITY_RANGES: readonly SiteOption[] = [
    { value: "UNDER_50M", label: "Under 50 m" },
    { value: "50_150M", label: "50–150 m" },
    { value: "150_300M", label: "150–300 m" },
    { value: "OVER_300M", label: "Over 300 m" },
];

export const ELEVATIONS: readonly SiteOption[] = [
    { value: "GROUND", label: "Ground level" },
    { value: "FIRST_FLOOR", label: "First floor" },
    { value: "ROOFTOP", label: "Rooftop" },
    { value: "ELEVATED", label: "Elevated structure" },
];

export const VEHICLE_KINDS: readonly SiteOption[] = [
    { value: "AUTO", label: "Auto" },
    { value: "CAR", label: "Car" },
    { value: "CAB", label: "Cab" },
    { value: "BUS", label: "Bus" },
    { value: "TRUCK", label: "Truck" },
    { value: "OTHER", label: "Other" },
];

/** The vocabulary behind each coded select, by its flow field id. */
export const SITE_OPTIONS: Readonly<Record<string, readonly SiteOption[]>> = {
    [SITE_FIELD.traffic]: TRAFFIC_GRADES,
    [SITE_FIELD.visibility]: VISIBILITY_RANGES,
    [SITE_FIELD.elevation]: ELEVATIONS,
    [SITE_FIELD.vehicleType]: VEHICLE_KINDS,
};

/** The answers that are whole numbers: typed on the number pad, digits only. */
export const WHOLE_NUMBER_FIELDS: ReadonlySet<string> = new Set([SITE_FIELD.footfall, SITE_FIELD.widthPx, SITE_FIELD.heightPx]);

const norm = (category: string | null | undefined): string => (category ?? "").toLowerCase();

/** A spot with a place a person walks or drives past — not a vehicle, not a channel. */
export const isPhysicalCategory = (category: string | null | undefined): boolean => norm(category) === "indoor" || norm(category) === "outdoor";

/**
 * Whether a question is asked of this spot — the rule `flows.listing` is
 * written to, applied once more here because one of them (a screen's
 * resolution) turns on the spot type chosen two steps earlier, which no
 * branch can express. Any other field id is asked wherever the flow put it.
 *
 *   footfall, how busy, how far   indoor and outdoor
 *   how high                      outdoor
 *   screen resolution             a digital screen, whatever the category
 *   kind of vehicle               transit
 *   available to book now         every spot
 */
export function siteFieldApplies(fieldId: string, spot: { category: string | null | undefined; digital: boolean }): boolean {
    switch (fieldId) {
        case SITE_FIELD.footfall:
        case SITE_FIELD.traffic:
        case SITE_FIELD.visibility:
            return isPhysicalCategory(spot.category);
        case SITE_FIELD.elevation:
            return norm(spot.category) === "outdoor";
        case SITE_FIELD.widthPx:
        case SITE_FIELD.heightPx:
            return spot.digital;
        case SITE_FIELD.vehicleType:
            return norm(spot.category) === "transit";
        default:
            return true;
    }
}

/** Digits only — what a whole-number box keeps of what was typed. */
export const digitsOnly = (text: string): string => text.replace(/\D/g, "");

/** A whole number ≥ `min` from an answer, or undefined when there is none. `0` is an answer for a count. */
export function wholeNumberOf(raw: unknown, min = 0): number | undefined {
    const value = typeof raw === "number" ? raw : typeof raw === "string" && raw.trim() !== "" ? Number(raw.trim()) : NaN;
    return Number.isInteger(value) && value >= min ? value : undefined;
}

/**
 * The code a stored value stands for, so a select opens on it: the code
 * itself, a label typed as words ("very high", "Ground level"), or the
 * value unchanged when it is neither — the select then offers the old
 * words as a choice of their own (`siteOptionsFor`).
 */
export function siteCodeOf(options: readonly SiteOption[], stored: string | null | undefined): string {
    if (!stored) return "";
    if (options.some((o) => o.value === stored)) return stored;
    const words = stored.trim().toLowerCase();
    return options.find((o) => o.label.toLowerCase() === words || o.value.toLowerCase() === words.replace(/[\s-]+/g, "_"))?.value ?? stored;
}

/** A stored value as the words to print: the code's label, or an older value as it is. */
export function siteLabelOf(options: readonly SiteOption[], stored: string | null | undefined): string | null {
    if (!stored) return null;
    const code = siteCodeOf(options, stored);
    return options.find((o) => o.value === code)?.label ?? stored;
}

/** The options to offer for a value: the vocabulary, plus older words when they are not in it. */
export function siteOptionsFor(options: readonly SiteOption[], value: string | null | undefined): SiteOption[] {
    if (!value || options.some((o) => o.value === value)) return [...options];
    return [...options, { value, label: value }];
}

/** The review step's attestation. */
export const TERMS_FIELD = "terms";

/**
 * The version of the statement that was ticked: the flow it was ticked on,
 * named the way the server keeps a replaced flow (`flows.listing:v<N>`).
 * Null when the flow carries no version.
 */
export function termsVersionOf(flow: { version?: unknown } | null | undefined): string | null {
    const version = flow?.version;
    return typeof version === "number" && Number.isFinite(version) ? `flows.listing:v${version}` : null;
}

/** Where the apps keep a photograph's upload row and its moment in a flow's answers: `{ [url]: { uploadedFileId, takenAt } }`. */
export const PHOTO_META_FIELD = "photo_meta";

export interface ExtraAnswer {
    key: string;
    label: string;
    value: unknown;
}
