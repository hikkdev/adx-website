import { api, apiBlob } from "@/lib/api-client";
import { rupees } from "@/services/browse";

/**
 * The campaign planner — DR 12 board 06 — over the same wizard the ADX app
 * walks: `POST /campaigns` opens a draft, `PATCH /campaigns/:id` saves one
 * screen at a time, `GET /campaigns/:id/inventory` turns the brief into a
 * shortlist and `PUT /campaigns/:id/spots` books the chosen ones onto it.
 * Types mirror the app's `campaigns-api.ts`, so a draft started on the web
 * reopens on the phone and the other way round.
 */
export type CampaignStatus = "DRAFT" | "PENDING_PAYMENT" | "SCHEDULED" | "LIVE" | "PAUSED" | "COMPLETED" | "CANCELLED";
export type CampaignGoal = "BRAND_AWARENESS" | "DIGITAL_LIFT" | "LOCAL_FOOTFALL";
export type BrandAwarenessLevel = "BRAND_NEW" | "ALREADY_ESTABLISHED";
export type TargetingMethod = "RADIUS" | "MARKET_OR_DMA" | "POI_VENUE";
export type CampaignStrategy = "DEFENSIVE" | "GENERAL" | "ATTACK";
export type AudiencePersona = "B2B_DECISION_MAKERS" | "STUDENTS_OR_GEN_Z" | "HIGH_INCOME_CONSUMERS" | "FAMILIES_OR_SUBURBAN";
export type CampaignTriggerType = "NONE" | "WEATHER" | "TIME_OF_DAY" | "EVENT";
export type CreativePath = "STATIC_IMAGES" | "VIDEO_OR_MOTION" | "DYNAMIC_HTML5" | "ADX_DESIGN_AGENCY";
export type TrackingMethod = "QR_OR_DEEPLINK" | "VANITY_OR_PROMO" | "LOCATION_LIFT" | "NONE";
export type FulfilmentChoice = "ADX_PRINTS" | "ADVERTISER_SHIPS";
export type CampaignSpotStatus = "RESERVED" | "BOOKED" | "LIVE" | "COMPLETED" | "CANCELLED";
export type CreativeStatus = "PENDING_UPLOAD" | "UPLOADED" | "IN_REVIEW" | "APPROVED" | "REJECTED" | "CHANGES_REQUESTED" | "AWAITING_ADVERTISER";

export interface CampaignSpot {
    id: string;
    listingId: string;
    status: CampaignSpotStatus;
    matchScore: number | null;
    ratePerDay: string;
    days: number;
    quantity: number;
    lineTotal: string;
    orderId: string | null;
    listing: {
        id: string;
        title: string;
        city: string | null;
        address: string;
        latitude?: number | null;
        longitude?: number | null;
        widthFt: string | null;
        heightFt: string | null;
        estimatedDailyFootfall: number | null;
        mediaType: { id: string; name: string; category: string } | null;
        photos: { url: string }[];
    };
}

export interface CampaignPoi {
    id?: string;
    label: string;
    address: string | null;
    latitude: number | null;
    longitude: number | null;
}

export interface CampaignCreative {
    id: string;
    spotId: string | null;
    path: CreativePath;
    status: CreativeStatus;
    fileUrl: string | null;
    fileName: string | null;
    reviewNote?: string | null;
    reviewedAt?: string | null;
    submittedAt?: string | null;
    designedByAdx?: boolean;
    trackingCodeId?: string | null;
    resubmissionOfId?: string | null;
    flags?: string[];
    checks?: { code: string; result: "PASS" | "FAIL" | "UNKNOWN"; note?: string }[];
}

export interface TrackingCodeView {
    id: string;
    spotId: string | null;
    code: string;
    url?: string;
    method: TrackingMethod;
    destination: string | null;
    promoCode: string | null;
    scans: number;
    clicks: number;
    redemptions: number;
}

export interface TriggerPlan {
    triggerType: CampaignTriggerType;
    triggerConfig: Record<string, unknown> | null;
    enforced: boolean;
    basis: string;
}

export interface Campaign {
    id: string;
    reference: string;
    advertiserId: string;
    agentId: string | null;
    name: string;
    status: CampaignStatus;
    step: number;
    brandName: string | null;
    productName: string | null;
    industry: string | null;
    subCategory: string | null;
    goal: CampaignGoal | null;
    awareness: BrandAwarenessLevel | null;
    targetingMethod: TargetingMethod | null;
    targetLocation: string | null;
    targetLatitude: number | null;
    targetLongitude: number | null;
    targetRadiusKm: number | null;
    targetMarket: string | null;
    targetMarkets?: string[];
    multiMarketWarning?: boolean;
    contentCategoryId?: string | null;
    strategy: CampaignStrategy | null;
    persona: AudiencePersona | null;
    triggerType: CampaignTriggerType;
    triggerConfig: Record<string, unknown> | null;
    triggers?: TriggerPlan;
    budget: string | null;
    startDate: string | null;
    endDate: string | null;
    creativePath: CreativePath | null;
    creativeConfig: Record<string, unknown> | null;
    trackingMethod: TrackingMethod;
    trackingConfig: Record<string, unknown> | null;
    fulfilment: FulfilmentChoice | null;
    spotsSubtotal: string | null;
    feesTotal: string | null;
    discount: string | null;
    gstAmount: string | null;
    total: string | null;
    paidAt: string | null;
    launchedAt: string | null;
    launchBlockedBy?: string[];
    spots: CampaignSpot[];
    pois: CampaignPoi[];
    creatives: CampaignCreative[];
    codes: TrackingCodeView[];
    city?: string | null;
    spotCount?: number;
    /** DQ-1: the desk's design quote on an ADX-design campaign. */
    designQuoteAmount?: string | null;
    designQuoteStatus?: DesignQuoteStatus | null;
    designQuoteNote?: string | null;
    designQuotedAt?: string | null;
    designQuoteRespondedAt?: string | null;
}

export type DesignQuoteStatus = "QUOTED" | "ACCEPTED" | "DECLINED";

/** Everything a planner screen may send back — the backend's patch schema, key for key. */
export type CampaignPatch = Partial<{
    name: string;
    step: number;
    brandName: string | null;
    productName: string | null;
    industry: string | null;
    subCategory: string | null;
    goal: CampaignGoal | null;
    awareness: BrandAwarenessLevel | null;
    targetingMethod: TargetingMethod | null;
    targetLocation: string | null;
    targetLatitude: number | null;
    targetLongitude: number | null;
    targetRadiusKm: number | null;
    targetMarket: string | null;
    targetMarkets: string[];
    contentCategoryId: string | null;
    pois: { label: string; address?: string | null; latitude?: number | null; longitude?: number | null }[];
    strategy: CampaignStrategy | null;
    persona: AudiencePersona | null;
    budget: string | null;
    startDate: string | null;
    endDate: string | null;
    fulfilment: FulfilmentChoice | null;
    trigger:
        | { triggerType: "NONE" }
        | { triggerType: "WEATHER"; triggerConfig: { conditions: string[]; response: string } }
        | { triggerType: "TIME_OF_DAY"; triggerConfig: { slots: string[]; days: string[] } }
        | { triggerType: "EVENT"; triggerConfig: { eventName: string; startsAt: string; endsAt: string; eventType: string } };
    creative:
        | { creativePath: "STATIC_IMAGES" }
        | { creativePath: "VIDEO_OR_MOTION" }
        | { creativePath: "DYNAMIC_HTML5"; creativeConfig?: { endpointUrl: string; refreshSeconds: number } }
        | { creativePath: "ADX_DESIGN_AGENCY"; creativeConfig?: { objective: string; keyMessage: string; style: string } };
    tracking:
        | { trackingMethod: "NONE" }
        | { trackingMethod: "QR_OR_DEEPLINK"; trackingConfig?: { destinationUrl?: string; utmCampaign?: string } }
        | { trackingMethod: "VANITY_OR_PROMO"; trackingConfig?: { vanityUrl?: string; promoCode?: string; redemptionWindow: string } }
        | { trackingMethod: "LOCATION_LIFT"; trackingConfig?: { businessAddress: string; latitude?: number; longitude?: number; measurementWindowDays: number; baselinePeriod: string } };
}>;

export interface MatchReason {
    label: string;
    detail: string;
    contribution: number;
}

/** One row of `GET /campaigns/:id/inventory` — a space the brief matched, with why. */
export interface InventoryMatch {
    listingId: string;
    title: string;
    city: string | null;
    address: string;
    photoUrl: string | null;
    mediaTypeId?: string | null;
    mediaTypeName: string | null;
    mediaTypeCategory: string | null;
    venueTypeName: string | null;
    size: string | null;
    ratePerDay: string;
    lineTotal: string;
    distanceMeters: number | null;
    estimatedDailyFootfall: number | null;
    matchScore: number;
    reasons: MatchReason[];
    clashes: boolean;
}

export interface MissingAnswer {
    step: string;
    field: string;
    label: string;
}

export interface CampaignReviewLine {
    spotId: string;
    listingId: string;
    title: string;
    city: string | null;
    photoUrl: string | null;
    mediaTypeName: string | null;
    size: string | null;
    ratePerDay: string;
    days: number;
    quantity: number;
    lineTotal: string;
    fees: { label: string; amount: string }[];
    gst: string;
    gross: string;
}

/** `GET /campaigns/:id/review` — the priced cart, before anything is held. */
export interface CampaignReview {
    campaignId: string;
    reference: string;
    status: CampaignStatus;
    lines: CampaignReviewLine[];
    spotsSubtotal: string;
    feesTotal: string;
    gstAmount: string;
    discount: string;
    total: string;
    budget: string | null;
    budgetRemaining: string | null;
    days: number;
    creativesUploaded: number;
    creativesExpected: number;
    missing: MissingAnswer[];
    outstanding?: { code: string; label: string; creativeIds: string[] }[];
    clashes: { spotId: string; listingId: string; title: string; reason?: string }[];
}

export interface ContentCategory {
    id: string;
    name: string;
    slug: string;
    isSensitive: boolean;
}

/** One row of `GET /app/geo/cities` — a market the catalogue has open. */
export interface PickerCity {
    slug: string;
    name: string;
    state: string | null;
    stage: string;
    latitude: number | null;
    longitude: number | null;
    distanceM: number | null;
    comingSoon: boolean;
}

export interface PickerPage {
    items: PickerCity[];
    comingSoon: PickerCity[];
}

export interface PlacePrediction {
    placeId: string;
    description: string;
    mainText: string;
    secondaryText: string | null;
}

export interface GeocodedPlace {
    formattedAddress: string;
    latitude: number;
    longitude: number;
    placeId: string | null;
    city: string | null;
    state: string | null;
    postalCode: string | null;
}

/* ------------------------------------------------------------------ */
/* The words the frames print                                          */
/* ------------------------------------------------------------------ */

export const GOALS: { id: CampaignGoal; title: string }[] = [
    { id: "BRAND_AWARENESS", title: "Brand awareness" },
    { id: "DIGITAL_LIFT", title: "Digital lift" },
    { id: "LOCAL_FOOTFALL", title: "Local footfall" },
];

export const AWARENESS: { id: BrandAwarenessLevel; title: string }[] = [
    { id: "BRAND_NEW", title: "Brand new" },
    { id: "ALREADY_ESTABLISHED", title: "Already established" },
];

export const PERSONAS: { id: AudiencePersona; title: string }[] = [
    { id: "B2B_DECISION_MAKERS", title: "B2B decision makers" },
    { id: "STUDENTS_OR_GEN_Z", title: "Students or Gen Z" },
    { id: "HIGH_INCOME_CONSUMERS", title: "High-income consumers" },
    { id: "FAMILIES_OR_SUBURBAN", title: "Families or suburban" },
];

export const STRATEGIES: { id: CampaignStrategy; title: string; description: string }[] = [
    { id: "DEFENSIVE", title: "Defensive", description: "Protect the budget with lower-risk sites and conservative targets." },
    { id: "GENERAL", title: "General", description: "Use your campaign goal and audience to guide the choice of ad spaces." },
    { id: "ATTACK", title: "Attack", description: "Buy the highest-traffic sites available and spend faster." },
];

export const TARGETING: { id: TargetingMethod; title: string }[] = [
    { id: "RADIUS", title: "Radius" },
    { id: "MARKET_OR_DMA", title: "Market or DMA" },
    { id: "POI_VENUE", title: "POI venue" },
];

export const RADII = [1, 5, 10, 25, 50] as const;

export const TRIGGERS: { id: CampaignTriggerType; title: string }[] = [
    { id: "NONE", title: "None" },
    { id: "WEATHER", title: "Weather" },
    { id: "TIME_OF_DAY", title: "Time of day" },
    { id: "EVENT", title: "Holiday or event" },
];

/** The backend's conditions; the frame's "Hot above 30°C" is the catalogue's HEAT_ABOVE_35. */
export const WEATHER_CONDITIONS: { id: string; title: string }[] = [
    { id: "HEAT_ABOVE_35", title: "Heat above 35°C" },
    { id: "RAIN_OR_DRIZZLE", title: "Rain or drizzle" },
    { id: "COLD_BELOW_15", title: "Cold below 15°C" },
    { id: "CLEAR", title: "Clear skies" },
];

export const WEATHER_RESPONSES: { id: string; title: string; description: string }[] = [
    { id: "BOOST", title: "Boost delivery", description: "Add weight to programmable placements while the condition holds." },
    { id: "PAUSE", title: "Pause delivery", description: "Hold programmable placements until the weather clears." },
    { id: "ACTIVATE", title: "Activate", description: "Run only while the condition holds." },
];

export const DAYPARTS: { id: string; title: string }[] = [
    { id: "MORNING", title: "Morning 6 AM–12 PM" },
    { id: "AFTERNOON", title: "Afternoon 12–6 PM" },
    { id: "EVENING", title: "Evening 6–10 PM" },
    { id: "NIGHT", title: "Night 10 PM–6 AM" },
];

export const DAYS: { id: string; title: string }[] = [
    { id: "MON", title: "Mon" },
    { id: "TUE", title: "Tue" },
    { id: "WED", title: "Wed" },
    { id: "THU", title: "Thu" },
    { id: "FRI", title: "Fri" },
    { id: "SAT", title: "Sat" },
    { id: "SUN", title: "Sun" },
];

export const EVENT_TYPES: { id: string; title: string }[] = [
    { id: "HOLIDAY", title: "Public holiday" },
    { id: "SPORTS", title: "Sports match" },
    { id: "FESTIVAL", title: "Festival" },
    { id: "CONCERT", title: "Concert" },
    { id: "OTHER", title: "Other" },
];

export const TRACKING_METHODS: { id: TrackingMethod; title: string }[] = [
    { id: "QR_OR_DEEPLINK", title: "QR codes or deep links" },
    { id: "VANITY_OR_PROMO", title: "Vanity URL or promo code" },
    { id: "LOCATION_LIFT", title: "Mobile location lift" },
    { id: "NONE", title: "No tracking" },
];

export const REDEMPTION_WINDOWS: { id: string; title: string }[] = [
    { id: "SEVEN_DAYS", title: "7 days" },
    { id: "THIRTY_DAYS", title: "30 days" },
    { id: "CAMPAIGN_DURATION", title: "Campaign duration" },
];

export const MEASUREMENT_WINDOWS: { id: 7 | 14 | 30; title: string }[] = [
    { id: 7, title: "7 days" },
    { id: 14, title: "14 days" },
    { id: 30, title: "30 days" },
];

export const BASELINES: { id: string; title: string; description: string }[] = [
    { id: "SAME_MONTH_LAST_YEAR", title: "Same period last year", description: "Historical seasonal comparison" },
    { id: "PRIOR_MONTH", title: "Previous 30 days", description: "Immediate preceding period" },
];

export const BUDGET_SHORTCUTS = ["30000", "50000", "100000"] as const;

/**
 * The Subcategory field's suggestions, per industry. The backend keeps
 * `subCategory` as free text and has no list of its own, so these are
 * prompts under the dropdown, never the only answers.
 */
export const SUBCATEGORIES: Record<string, string[]> = {
    Retail: ["Home furnishings", "Fashion & apparel", "Electronics", "Jewellery", "Grocery", "Furniture"],
    "Food & beverage": ["Restaurant", "Café", "Quick service", "Packaged food", "Beverages"],
    "Real estate": ["Residential", "Commercial", "Plots & land", "Co-living"],
    Education: ["School", "College", "Coaching", "Online learning", "Skills"],
    Healthcare: ["Hospital", "Clinic", "Pharmacy", "Diagnostics", "Wellness"],
    Automotive: ["Cars", "Two-wheelers", "Electric vehicles", "Service & parts", "Dealership"],
    Finance: ["Banking", "Insurance", "Loans", "Investments", "Payments"],
    Entertainment: ["Cinema", "Events", "Streaming", "Gaming", "Sports"],
    "E-commerce": ["Marketplace", "D2C brand", "Quick commerce", "Subscriptions"],
    Government: ["Public notice", "Civic campaign", "Health drive", "Tourism"],
    NGO: ["Fundraising", "Awareness", "Volunteering"],
    Other: [],
};

/* ------------------------------------------------------------------ */
/* The eight web steps over the app's seventeen                        */
/* ------------------------------------------------------------------ */

export type PlannerStepId = "brand" | "goal" | "audience" | "location" | "triggers" | "budget" | "spaces" | "tracking";

export const PLANNER_STEPS: PlannerStepId[] = ["brand", "goal", "audience", "location", "triggers", "budget", "spaces", "tracking"];

export interface PlannerStepMeta {
    id: PlannerStepId;
    /** Which of the four bar steps this screen sits under. */
    bar: 1 | 2 | 3 | 4;
    subtitle: string;
    continueLabel: string;
    /** The app's step number to record, so a draft reopens on the phone where the web left it. */
    appStep: number;
}

export const STEP_META: Record<PlannerStepId, PlannerStepMeta> = {
    brand: { id: "brand", bar: 1, subtitle: "Campaign brief · 1 of 6 · Brand", continueLabel: "Continue to goal", appStep: 2 },
    goal: { id: "goal", bar: 1, subtitle: "Campaign brief · 2 of 6 · Goal", continueLabel: "Continue to audience", appStep: 4 },
    audience: { id: "audience", bar: 1, subtitle: "Campaign brief · 3 of 6 · Audience", continueLabel: "Continue to location", appStep: 4 },
    location: { id: "location", bar: 1, subtitle: "Campaign brief · 4 of 6 · Locations", continueLabel: "Continue", appStep: 8 },
    triggers: { id: "triggers", bar: 1, subtitle: "Campaign brief · 5 of 6 · Triggers (optional)", continueLabel: "Continue to budget", appStep: 9 },
    budget: { id: "budget", bar: 1, subtitle: "Campaign brief · 6 of 6 · Budget & schedule", continueLabel: "Find matching spaces", appStep: 10 },
    spaces: { id: "spaces", bar: 2, subtitle: "Choose ad spaces · Step 2 of 4", continueLabel: "Continue with selected spaces", appStep: 12 },
    tracking: { id: "tracking", bar: 3, subtitle: "Artwork & delivery · Step 3 of 4", continueLabel: "Save and prepare artwork", appStep: 14 },
};

export function isPlannerStep(value: string): value is PlannerStepId {
    return (PLANNER_STEPS as string[]).includes(value);
}

export function plannerHref(campaignId: string, step: PlannerStepId): string {
    return `/advertiser/campaigns/new/${encodeURIComponent(campaignId)}/${step}`;
}

export function previousStep(step: PlannerStepId): PlannerStepId | null {
    const index = PLANNER_STEPS.indexOf(step);
    return index > 0 ? PLANNER_STEPS[index - 1]! : null;
}

export function nextStep(step: PlannerStepId): PlannerStepId | null {
    const index = PLANNER_STEPS.indexOf(step);
    return index >= 0 && index < PLANNER_STEPS.length - 1 ? PLANNER_STEPS[index + 1]! : null;
}

/* ------------------------------------------------------------------ */
/* Pure helpers                                                        */
/* ------------------------------------------------------------------ */

/** The YYYY-MM-DD part of whatever date the backend sent. */
export function isoDate(value: string | null | undefined): string {
    if (!value) return "";
    return value.slice(0, 10);
}

/** Whole days a flight covers, both ends included — the backend's `flightDays`. */
export function flightDays(from: string | null | undefined, to: string | null | undefined): number {
    const a = isoDate(from);
    const b = isoDate(to);
    if (!a || !b) return 0;
    const start = Date.UTC(Number(a.slice(0, 4)), Number(a.slice(5, 7)) - 1, Number(a.slice(8, 10)));
    const end = Date.UTC(Number(b.slice(0, 4)), Number(b.slice(5, 7)) - 1, Number(b.slice(8, 10)));
    if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return 0;
    return Math.round((end - start) / 86_400_000) + 1;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function parts(iso: string): { d: number; m: number; y: number } | null {
    const date = isoDate(iso);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
    return { y: Number(date.slice(0, 4)), m: Number(date.slice(5, 7)) - 1, d: Number(date.slice(8, 10)) };
}

/** 12 Oct 2026 */
export function formatDate(iso: string | null | undefined): string {
    const p = iso ? parts(iso) : null;
    if (!p) return "—";
    return `${p.d} ${MONTHS[p.m]} ${p.y}`;
}

/** 12–25 Oct 2026 · 28 Sep – 5 Oct 2026 · 28 Dec 2026 – 3 Jan 2027, as the frames print a flight. */
export function formatDateRange(from: string | null | undefined, to: string | null | undefined): string {
    const a = from ? parts(from) : null;
    const b = to ? parts(to) : null;
    if (!a || !b) return a ? `From ${formatDate(from)}` : b ? `Until ${formatDate(to)}` : "Dates not set";
    if (a.y === b.y && a.m === b.m) return a.d === b.d ? formatDate(from) : `${a.d}–${b.d} ${MONTHS[a.m]} ${a.y}`;
    if (a.y === b.y) return `${a.d} ${MONTHS[a.m]} – ${b.d} ${MONTHS[b.m]} ${a.y}`;
    return `${formatDate(from)} – ${formatDate(to)}`;
}

/** Today plus `offset` days, as YYYY-MM-DD in local time. */
export function isoToday(offset = 0): string {
    const d = new Date();
    d.setDate(d.getDate() + offset);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
}

/** Money as the backend wants it: digits and at most two decimals, or null for nothing. */
export function moneyString(value: string | number | null | undefined): string | null {
    if (value === null || value === undefined) return null;
    const digits = String(value).replace(/[^\d.]/g, "");
    if (!digits) return null;
    const n = Number(digits);
    if (!Number.isFinite(n) || n <= 0) return null;
    return n.toFixed(2).replace(/\.00$/, "");
}

/** ₹3,000 / week off a per-day rate, the way the space cards print it. */
export function perWeek(ratePerDay: string | null | undefined): string {
    if (!ratePerDay) return "Rate on request";
    return `${rupees(Number(ratePerDay) * 7)} / week`;
}

/** The media subtotal of a selection over the flight — what the frame's "2 spaces selected" row prints. */
export function mediaSubtotal(selected: Pick<InventoryMatch, "lineTotal">[]): number {
    return selected.reduce((sum, match) => sum + (Number(match.lineTotal) || 0), 0);
}

/** "Whitefield billboard and Phoenix Mall Atrium" — the names of a selection, in one line. */
export function joinNames(names: string[]): string {
    if (names.length === 0) return "";
    if (names.length === 1) return names[0]!;
    return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/**
 * The frame's "Footfall planning estimate": the daily footfall the matched
 * spaces state, added up, over the flight. Only spaces that state a figure
 * count, and the basis says how many did — nothing here is invented.
 */
export function footfallEstimate(
    matches: Pick<InventoryMatch, "estimatedDailyFootfall">[],
    days: number
): { daily: number; total: number; counted: number; of: number } | null {
    const counted = matches.filter((m) => typeof m.estimatedDailyFootfall === "number" && m.estimatedDailyFootfall > 0);
    if (counted.length === 0) return null;
    const daily = counted.reduce((sum, m) => sum + (m.estimatedDailyFootfall ?? 0), 0);
    return { daily, total: daily * Math.max(1, days), counted: counted.length, of: matches.length };
}

/** "1,00,600" — a count in Indian grouping. */
export function formatCount(value: number): string {
    return Math.round(value).toLocaleString("en-IN");
}

/** The `utm_content` a placement's draft QR carries: the space's name as a slug. */
export function utmContent(title: string): string {
    return title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 60);
}

/** The destination with ADX's tags on it — the backend's `withUtm`, so a draft preview reads like the printed code will. */
export function withUtm(destination: string, utmCampaign: string | null, content: string): string | null {
    let url: URL;
    try {
        url = new URL(destination);
    } catch {
        return null;
    }
    if (!url.searchParams.has("utm_source")) url.searchParams.set("utm_source", "adx");
    if (!url.searchParams.has("utm_medium")) url.searchParams.set("utm_medium", "ooh");
    if (utmCampaign && !url.searchParams.has("utm_campaign")) url.searchParams.set("utm_campaign", utmCampaign);
    if (!url.searchParams.has("utm_content")) url.searchParams.set("utm_content", content);
    return url.toString();
}

/** A URL the backend's `z.string().url()` accepts: `asterhome.example/festive` becomes https://. */
export function ensureUrl(value: string): string {
    const trimmed = value.trim();
    if (!trimmed) return "";
    return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

export function isUrl(value: string): boolean {
    try {
        const url = new URL(value);
        return url.protocol === "http:" || url.protocol === "https:";
    } catch {
        return false;
    }
}

/**
 * The three targeting shapes, each clearing the other two — the matcher
 * prefers a centre over pins over a market, so a leftover answer from a
 * method no longer chosen would quietly change the shortlist.
 */
export function radiusPatch(input: { location: string; latitude: number; longitude: number; km: number }): CampaignPatch {
    return {
        targetingMethod: "RADIUS",
        targetLocation: input.location.trim() || null,
        targetLatitude: input.latitude,
        targetLongitude: input.longitude,
        targetRadiusKm: input.km,
        targetMarket: null,
        pois: [],
    };
}

export function marketPatch(market: string): CampaignPatch {
    return {
        targetingMethod: "MARKET_OR_DMA",
        targetMarket: market,
        targetLocation: market,
        targetLatitude: null,
        targetLongitude: null,
        targetRadiusKm: null,
        pois: [],
    };
}

export function poiPatch(pois: CampaignPoi[]): CampaignPatch {
    return {
        targetingMethod: "POI_VENUE",
        pois: pois.map((poi) => ({ label: poi.label, address: poi.address, latitude: poi.latitude, longitude: poi.longitude })),
        targetLocation: pois[0]?.label ?? null,
        targetLatitude: null,
        targetLongitude: null,
        targetRadiusKm: null,
        targetMarket: null,
    };
}

/** What a campaign's targeting reads as — "Whitefield, Bengaluru" on the shortlist's brief line. */
export function targetSummary(campaign: Pick<Campaign, "targetingMethod" | "targetLocation" | "targetMarket" | "targetRadiusKm" | "pois">): string {
    if (campaign.targetingMethod === "MARKET_OR_DMA") return campaign.targetMarket ?? campaign.targetLocation ?? "Market not set";
    if (campaign.targetingMethod === "POI_VENUE") {
        const names = campaign.pois.map((poi) => poi.label);
        return names.length ? joinNames(names) : "No venues pinned";
    }
    if (campaign.targetLocation) return campaign.targetRadiusKm ? `${campaign.targetLocation} · ${campaign.targetRadiusKm} km` : campaign.targetLocation;
    return "Location not set";
}

/* ------------------------------------------------------------------ */
/* What the backend does not keep yet                                  */
/* ------------------------------------------------------------------ */

/**
 * The planner's drawn controls the campaign record has no field for —
 * the three placement preferences, the brand's launch-approval switch and
 * the design notes. Kept in this browser beside the campaign id so the
 * screens hold their answers; the report names the fields the backend
 * needs to carry them.
 */
export interface PlanPrefs {
    avoidAlcohol: boolean;
    avoidPolitical: boolean;
    avoidCompetitors: boolean;
    brandApproves: boolean;
    designNotes: string;
}

export const DEFAULT_PREFS: PlanPrefs = { avoidAlcohol: true, avoidPolitical: true, avoidCompetitors: false, brandApproves: true, designNotes: "" };

const PREFS_KEY = (campaignId: string) => `adx.web.plan.${campaignId}`;

export const planPrefs = {
    read(campaignId: string): PlanPrefs {
        if (typeof window === "undefined") return DEFAULT_PREFS;
        try {
            const raw = window.localStorage.getItem(PREFS_KEY(campaignId));
            return raw ? { ...DEFAULT_PREFS, ...(JSON.parse(raw) as Partial<PlanPrefs>) } : DEFAULT_PREFS;
        } catch {
            return DEFAULT_PREFS;
        }
    },
    write(campaignId: string, patch: Partial<PlanPrefs>): PlanPrefs {
        const next = { ...planPrefs.read(campaignId), ...patch };
        try {
            window.localStorage.setItem(PREFS_KEY(campaignId), JSON.stringify(next));
        } catch {
            /* Private mode or a full store: the answer lives for this page. */
        }
        return next;
    },
};

/* ------------------------------------------------------------------ */
/* Query strings                                                       */
/* ------------------------------------------------------------------ */

export interface PickerQuery {
    q?: string;
    stages?: readonly string[];
    near?: { latitude: number; longitude: number } | null;
    limit?: number;
}

export function pickerSearch(query: PickerQuery): string {
    const params = new URLSearchParams();
    if (query.stages && query.stages.length > 0) params.set("stage", query.stages.join(","));
    const q = query.q?.trim();
    if (q) params.set("q", q);
    if (query.near) {
        params.set("lat", String(query.near.latitude));
        params.set("lng", String(query.near.longitude));
    }
    if (query.limit) params.set("limit", String(query.limit));
    const search = params.toString();
    return search ? `?${search}` : "";
}

export interface AutocompleteQuery {
    input: string;
    session?: string;
    near?: { latitude: number; longitude: number } | null;
    radiusM?: number;
}

export function autocompleteSearch(query: AutocompleteQuery): string {
    const params = new URLSearchParams();
    params.set("input", query.input.trim());
    if (query.session) params.set("session", query.session);
    if (query.near) {
        params.set("latitude", String(query.near.latitude));
        params.set("longitude", String(query.near.longitude));
    }
    if (query.radiusM) params.set("radiusM", String(query.radiusM));
    return `?${params.toString()}`;
}

/* ------------------------------------------------------------------ */
/* The service                                                         */
/* ------------------------------------------------------------------ */

export const plannerService = {
    create: (body: { name?: string; brandId?: string | null } = {}) => api.post<Campaign>("/campaigns", body),
    get: (id: string) => api.get<Campaign>(`/campaigns/${encodeURIComponent(id)}`),
    patch: (id: string, patch: CampaignPatch) => api.patch<Campaign>(`/campaigns/${encodeURIComponent(id)}`, patch),
    inventory: (id: string, query: { sort?: "BEST_MATCH" | "LOWEST_RATE" | "MOST_REACH"; limit?: number } = {}) => {
        const params = new URLSearchParams();
        if (query.sort) params.set("sort", query.sort);
        if (query.limit) params.set("limit", String(query.limit));
        const search = params.toString();
        return api.get<InventoryMatch[]>(`/campaigns/${encodeURIComponent(id)}/inventory${search ? `?${search}` : ""}`);
    },
    setSpots: (id: string, items: { listingId: string; quantity?: number; matchScore?: number | null }[]) =>
        api.put<Campaign>(`/campaigns/${encodeURIComponent(id)}/spots`, { items }),
    review: (id: string) => api.get<CampaignReview>(`/campaigns/${encodeURIComponent(id)}/review`),
    trackingCodes: (id: string) => api.get<TrackingCodeView[]>(`/campaigns/${encodeURIComponent(id)}/tracking-codes`),
    trackingCodeSvg: (id: string, code: string, size = 512) =>
        apiBlob(`/campaigns/${encodeURIComponent(id)}/tracking-codes/${encodeURIComponent(code)}/image.svg?size=${size}`),
    industries: () => api.get<string[]>("/advertisers/industries"),
    contentCategories: () => api.get<ContentCategory[]>("/campaigns/content-categories"),
    cities: (query: PickerQuery = {}) => api.get<PickerPage>(`/app/geo/cities${pickerSearch(query)}`),
    autocomplete: (query: AutocompleteQuery) => api.get<PlacePrediction[]>(`/geo/autocomplete${autocompleteSearch(query)}`),
    place: (placeId: string, session?: string) =>
        api.get<GeocodedPlace>(`/geo/places/${encodeURIComponent(placeId)}${session ? `?session=${encodeURIComponent(session)}` : ""}`),
    geocode: (address: string) => api.get<GeocodedPlace>(`/geo/geocode?address=${encodeURIComponent(address.trim())}`),
    reverse: (latitude: number, longitude: number) => api.get<GeocodedPlace>(`/geo/reverse?latitude=${latitude}&longitude=${longitude}`),
};
