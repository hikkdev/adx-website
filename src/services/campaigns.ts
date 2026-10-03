import { api, ApiError } from "@/lib/api-client";

/**
 * The advertiser's campaigns beyond the booking steps — the list with its
 * search, chips and pages, the analytics (one campaign, and all of them),
 * the ADX landing page a QR lands on, rating a space once it has run, and
 * cancelling after payment. Every route and shape is the ADX app's
 * (`mobile/user-app/src/features/advertiser/campaigns/campaigns-api.ts`),
 * so a campaign read here reads the same on the phone.
 */

export type CampaignStatus = "DRAFT" | "PENDING_PAYMENT" | "SCHEDULED" | "LIVE" | "PAUSED" | "COMPLETED" | "CANCELLED";

/* ------------------------------------------------------------------ */
/* The list                                                            */
/* ------------------------------------------------------------------ */

export interface CampaignSummary {
    id: string;
    reference: string;
    name: string;
    status: CampaignStatus | string;
    goal?: string | null;
    brandName: string | null;
    city?: string | null;
    budget?: string | null;
    total?: string | null;
    startDate: string | null;
    endDate: string | null;
    spotCount?: number;
    /** The booked spots' daily rate over the days run so far — the Spend Bar is this over `budget`. */
    spendToDate?: string | null;
    createdAt: string;
    updatedAt: string;
}

export interface CampaignPage {
    items: CampaignSummary[];
    total: number;
    page: number;
    pageSize: number;
    counts?: Record<string, number>;
}

export type CampaignListSort = "NEWEST" | "OLDEST" | "BUDGET_DESC" | "ENDING_SOON" | "NAME";

export interface CampaignListQuery {
    status?: readonly string[];
    /** The server's canonical search. */
    q?: string;
    sort?: CampaignListSort;
    page?: number;
    pageSize?: number;
}

/** `?q=&status=A,B&sort=&page=&pageSize=` — a comma list for the statuses, the way a chip row sends them. */
export function campaignListQuery(query: CampaignListQuery = {}): string {
    const parts: string[] = [];
    const add = (key: string, value: string | number | undefined | null) => {
        if (value === undefined || value === null || value === "") return;
        parts.push(`${key}=${encodeURIComponent(String(value))}`);
    };
    add("q", query.q?.trim());
    if (query.status?.length) parts.push(`status=${query.status.join(",")}`);
    add("sort", query.sort);
    add("page", query.page);
    add("pageSize", query.pageSize);
    return parts.length ? `?${parts.join("&")}` : "";
}

/**
 * DR 06's chips: All, Live, Drafts, Ended — each the statuses it stands for.
 * A scheduled, paused or unpaid campaign sits under All only; a chip that
 * swallowed it under "Live" would claim it is running.
 */
export const CAMPAIGN_CHIPS: { value: "ALL" | "LIVE" | "DRAFTS" | "ENDED"; label: string; statuses: readonly CampaignStatus[] }[] = [
    { value: "ALL", label: "All", statuses: [] },
    { value: "LIVE", label: "Live", statuses: ["LIVE"] },
    { value: "DRAFTS", label: "Drafts", statuses: ["DRAFT"] },
    { value: "ENDED", label: "Ended", statuses: ["COMPLETED", "CANCELLED"] },
];

export type CampaignChip = (typeof CAMPAIGN_CHIPS)[number]["value"];

/** Links written before the four chips (`?chip=ACTIVE`, `?chip=COMPLETED`) land on the nearest one. */
export function chipOf(value: string | null | undefined): CampaignChip {
    if (value === "COMPLETED") return "ENDED";
    if (value === "ACTIVE") return "LIVE";
    return CAMPAIGN_CHIPS.some((chip) => chip.value === value) ? (value as CampaignChip) : "ALL";
}

export function campaignChipStatuses(chip: string | null | undefined): readonly CampaignStatus[] {
    return CAMPAIGN_CHIPS.find((entry) => entry.value === chipOf(chip))?.statuses ?? [];
}

/** The chips with the page's counts on them; All is every status added up. */
export function campaignChips(counts: Record<string, number> | undefined): { value: CampaignChip; label: string; count?: number }[] {
    if (!counts) return CAMPAIGN_CHIPS.map((chip) => ({ value: chip.value, label: chip.label }));
    const all = Object.values(counts).reduce((sum, n) => sum + n, 0);
    return CAMPAIGN_CHIPS.map((chip) => ({
        value: chip.value,
        label: chip.label,
        count: chip.value === "ALL" ? all : chip.statuses.reduce((sum, status) => sum + (counts[status] ?? 0), 0),
    }));
}

/**
 * The website's Campaigns tabs (28 Sep 2026, the owner: "I don't see any
 * options for campaign history"). The frame (5204:75477) draws All
 * campaigns / Active / Completed; the backend has seven statuses, so each
 * one sits in exactly one tab and a finished or cancelled campaign is always
 * a click away. "Awaiting payment" is a draft that reached the pay step; a
 * paused campaign is mid-flight, so it stays with the live ones and its row
 * says "Paused". Every tab is drawn even at zero, with the line saying what
 * will appear there. The app's four chips above stay the phone's.
 */
export const CAMPAIGN_TABS: readonly { value: "ALL" | "LIVE" | "SCHEDULED" | "DRAFTS" | "COMPLETED" | "CANCELLED"; label: string; statuses: readonly CampaignStatus[]; empty: string }[] = [
    { value: "ALL", label: "All campaigns", statuses: [], empty: "You have no campaigns yet. Your drafts and booked campaigns will appear here." },
    { value: "LIVE", label: "Live", statuses: ["LIVE", "PAUSED"], empty: "No campaign is running right now. Campaigns appear here while they are up on their spaces." },
    { value: "SCHEDULED", label: "Scheduled", statuses: ["SCHEDULED"], empty: "Nothing is scheduled. Paid campaigns wait here for their start date — with their artwork in review or approved." },
    { value: "DRAFTS", label: "Drafts", statuses: ["DRAFT", "PENDING_PAYMENT"], empty: "No drafts. A campaign you start and have not paid for waits here, so you can pick it up where you left off." },
    { value: "COMPLETED", label: "Completed", statuses: ["COMPLETED"], empty: "No completed campaigns yet. When a campaign finishes its run it moves here, with its delivery proofs and invoice." },
    { value: "CANCELLED", label: "Cancelled", statuses: ["CANCELLED"], empty: "Nothing cancelled. A campaign you or ADX cancel is kept here, with any refund it is due." },
];

export type CampaignTab = (typeof CAMPAIGN_TABS)[number]["value"];

/** `?tab=` — and the chips' `?chip=` from before the tabs (ACTIVE, ENDED, DRAFT) — landed on the nearest tab. */
export function campaignTabOf(value: string | null | undefined): CampaignTab {
    const v = (value ?? "").toUpperCase();
    if (v === "ACTIVE") return "LIVE";
    if (v === "ENDED") return "COMPLETED";
    if (v === "DRAFT") return "DRAFTS";
    return CAMPAIGN_TABS.some((tab) => tab.value === v) ? (v as CampaignTab) : "ALL";
}

export function campaignTabStatuses(tab: string | null | undefined): readonly CampaignStatus[] {
    return CAMPAIGN_TABS.find((entry) => entry.value === campaignTabOf(tab))?.statuses ?? [];
}

/** What an empty tab says will appear there. */
export function campaignTabEmpty(tab: string | null | undefined): string {
    return CAMPAIGN_TABS.find((entry) => entry.value === campaignTabOf(tab))?.empty ?? CAMPAIGN_TABS[0]!.empty;
}

/** The tabs with the page's counts on them — every tab, zero included; All is every status added up. */
export function campaignTabs(counts: Record<string, number> | undefined): { value: CampaignTab; label: string; count: number | null }[] {
    const all = counts ? Object.values(counts).reduce((sum, n) => sum + n, 0) : null;
    return CAMPAIGN_TABS.map((tab) => ({
        value: tab.value,
        label: tab.label,
        count: !counts ? null : tab.value === "ALL" ? all : tab.statuses.reduce((sum, status) => sum + (counts[status] ?? 0), 0),
    }));
}

/** The list's orders — the server's five (`sort=`), named for what they do. */
export const CAMPAIGN_SORTS: readonly { value: CampaignListSort; label: string }[] = [
    { value: "NEWEST", label: "Recently updated" },
    { value: "OLDEST", label: "Oldest first" },
    { value: "ENDING_SOON", label: "Ending soonest" },
    { value: "BUDGET_DESC", label: "Highest budget" },
    { value: "NAME", label: "Name A–Z" },
];

export function campaignSortOf(value: string | null | undefined): CampaignListSort {
    return CAMPAIGN_SORTS.find((sort) => sort.value === value)?.value ?? "NEWEST";
}

/** The Campaigns page's own address for a tab, a search and an order — the defaults left off. */
export function campaignsHref(query: { tab?: CampaignTab; q?: string; sort?: CampaignListSort } = {}): string {
    const params = new URLSearchParams();
    if (query.tab && query.tab !== "ALL") params.set("tab", query.tab);
    if (query.q?.trim()) params.set("q", query.q.trim());
    if (query.sort && query.sort !== "NEWEST") params.set("sort", query.sort);
    const qs = params.toString();
    return qs ? `/advertiser/campaigns?${qs}` : "/advertiser/campaigns";
}

/* ------------------------------------------------------------------ */
/* Money, exact                                                        */
/* ------------------------------------------------------------------ */

/**
 * Money here is the decimal string the API sends. Nothing parses a rupee
 * amount into a float: sums and comparisons are done in whole paise, so the
 * wallet check says what the server's own check will say a moment later.
 */
type Parts = { negative: boolean; whole: string; paise: string };

function split(value: string | number | null | undefined): Parts | null {
    const text = typeof value === "number" ? (Number.isFinite(value) ? value.toFixed(2) : "") : value;
    if (typeof text !== "string") return null;
    const match = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(text.trim());
    if (!match) return null;
    const whole = match[2]!.replace(/^0+(?=\d)/, "");
    const paise = `${match[3] ?? ""}00`.slice(0, 2);
    const zero = /^0+$/.test(whole) && paise === "00";
    return { negative: match[1] === "-" && !zero, whole, paise };
}

function toPaise(value: string | number | null | undefined): number | null {
    const parts = split(value);
    if (!parts) return null;
    const paise = Number(`${parts.whole}${parts.paise}`);
    if (!Number.isSafeInteger(paise)) return null;
    return parts.negative ? -paise : paise;
}

function fromPaise(paise: number): string | null {
    if (!Number.isSafeInteger(paise)) return null;
    const sign = paise < 0 ? "-" : "";
    const digits = String(Math.abs(paise)).padStart(3, "0");
    return `${sign}${digits.slice(0, -2)}.${digits.slice(-2)}`;
}

function groupIndian(whole: string): string {
    if (whole.length <= 3) return whole;
    return `${whole.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ",")},${whole.slice(-3)}`;
}

/** ₹8,333.33 — paise only when there are paise; "—" for nothing readable. */
export function formatMoney(value: string | number | null | undefined, options: { paise?: "auto" | "always" | "never" } = {}): string {
    const parts = split(value);
    if (!parts) return "—";
    const mode = options.paise ?? "auto";
    const withPaise = mode === "always" || (mode === "auto" && parts.paise !== "00");
    return `${parts.negative ? "−" : ""}₹${groupIndian(parts.whole)}${withPaise ? `.${parts.paise}` : ""}`;
}

/** −1, 0 or 1, in whole paise; 0 when either is not an amount. */
export function compareMoney(a: string | number | null | undefined, b: string | number | null | undefined): number {
    const left = toPaise(a);
    const right = toPaise(b);
    if (left === null || right === null) return 0;
    return left === right ? 0 : left < right ? -1 : 1;
}

/** One amount less another, as a decimal string; null when either is not an amount. */
export function subtractMoney(a: string | number | null | undefined, b: string | number | null | undefined): string | null {
    const left = toPaise(a);
    const right = toPaise(b);
    if (left === null || right === null) return null;
    return fromPaise(left - right);
}

/** How full a bar is, 0 to 1, from two exact amounts; an empty bar for a zero or unreadable whole. */
export function moneyRatio(part: string | null | undefined, whole: string | null | undefined): number {
    const numerator = toPaise(part);
    const denominator = toPaise(whole);
    if (numerator === null || denominator === null || denominator <= 0) return 0;
    return Math.min(Math.max(numerator / denominator, 0), 1);
}

/** 37 for ₹18,500 of ₹50,000 — rounded once; null with no budget to be a share of. */
export function moneyPercent(part: string | null | undefined, whole: string | null | undefined): number | null {
    const numerator = toPaise(part);
    const denominator = toPaise(whole);
    if (numerator === null || denominator === null || denominator <= 0) return null;
    return Math.max(0, Math.round((numerator * 100) / denominator));
}

/** "37% of ₹50,000" — the Spend Bar's label, or null where there is no budget. */
export function spendLabel(row: Pick<CampaignSummary, "spendToDate" | "budget">): string | null {
    const percent = moneyPercent(row.spendToDate ?? null, row.budget ?? null);
    if (percent === null) return null;
    return `${percent}% of ${formatMoney(row.budget, { paise: "never" })}`;
}

/** Whether a wallet covers what is due — compared in paise, the way the server holds it. */
export const walletCovers = (spendable: string | null | undefined, due: string | number | null | undefined): boolean =>
    spendable !== null && spendable !== undefined && split(spendable) !== null && split(due) !== null && compareMoney(spendable, due) >= 0;

/* ------------------------------------------------------------------ */
/* Analytics                                                           */
/* ------------------------------------------------------------------ */

export type Provenance = "MEASURED" | "REPORTED" | "ESTIMATED" | "UNAVAILABLE";

/** Every figure says where it came from; the pages print the basis. */
export interface Metric {
    value: number | null;
    provenance: Provenance;
    basis: string;
}

/**
 * One headline metric against the window of the same length just before
 * this one — null when the previous window has nothing to compare against,
 * so a first week prints no delta rather than "+100%".
 */
export type MetricComparison<V = number> = {
    previous: V;
    deltaPct: number | null;
    provenance: "MEASURED" | "ESTIMATED";
    basis: string;
} | null;

export interface WindowComparison {
    window: { days: number; from: string; to: string; previousFrom: string; previousTo: string };
    totalReach: MetricComparison<number>;
    clickRate: MetricComparison<number>;
    budgetSpent: MetricComparison<string>;
}

export interface AudienceShare {
    label: string;
    share: number;
}

export type AudienceVendor = "GEOIQ" | "AZIRA";
export type AudienceSource = AudienceVendor | "BLENDED";

/** G7 (Q109): a footfall / data-panel vendor's view of the campaign's sites — modelled, never observed by ADX. */
export interface CampaignAudience {
    provenance: "PANEL";
    vendor: string;
    vendors?: AudienceVendor[];
    provenanceByField?: { footfall: AudienceSource | null; demographics: AudienceSource | null; affinities: AudienceSource | null };
    agreement?: { footfall: number | null };
    /** YYYY-MM the panels were read for. */
    period: string;
    basis: string;
    spotsWithData: number;
    spotsTotal: number;
    footfall: {
        daily: number | null;
        /** 24 shares, midnight first. */
        byHour: number[] | null;
        /** 7 shares, Monday first. */
        byWeekday: number[] | null;
    };
    demographics: {
        ageBands: AudienceShare[] | null;
        gender: AudienceShare[] | null;
        incomeBands: AudienceShare[] | null;
        affinities: AudienceShare[] | null;
    };
}

/** Lot D (Q7): what happened on the ADX landing page after the scan, folded four ways. */
export interface CampaignInteractions {
    provenance: "MEASURED";
    basis: string;
    byDevice: { device: string | null; count: number }[];
    byHour: { hourIst: number | null; count: number }[];
    byCity: { city: string | null; count: number }[];
    byCta: { ctaLabel: string | null; count: number }[];
}

export interface CampaignAnalytics {
    campaignId: string;
    reference?: string;
    name?: string;
    status?: CampaignStatus;
    startDate?: string | null;
    endDate?: string | null;
    daysElapsed: number;
    daysTotal: number;
    spend: { toDate: string; committed: string; budget: string | null; onTrack: boolean | null };
    spotsLive: number;
    spotsBooked: number;
    reach: Metric;
    scans: Metric;
    clicks: Metric;
    clickRate: Metric;
    redemptions: Metric;
    series: { day: string; spend: string; spotsLive: number; scans: number; clicks: number; estimatedReach: number | null }[];
    mix?: { label: string; spots: number; spend: string; share: number }[];
    bySpot?: { spotId: string; title: string; city: string | null; ratePerDay: string; days: number; spend: string; scans: number; clicks: number; estimatedDailyFootfall: number | null }[];
    byMarket?: { market: string | null; spots: number; spend: string; scans: number; clicks: number }[];
    interactions?: CampaignInteractions;
    audience?: CampaignAudience | null;
    comparison?: WindowComparison;
}

export interface PortfolioAnalytics {
    totalReach: Metric;
    clickRate: Metric;
    activeCampaigns: { value: number; basis: string };
    budgetSpent: { value: string; basis: string; onTrack: boolean | null };
    comparison?: WindowComparison;
    series: { day: string; spend: string; scans: number; clicks: number }[];
    campaigns: {
        id: string;
        reference: string;
        name: string;
        status: CampaignStatus;
        brandName: string | null;
        startDate: string | null;
        endDate: string | null;
        spots: number;
        spend: string;
        scans: number | null;
        clickRate: number | null;
    }[];
}

/** The three comparison windows the analytics pages offer; 90 is the server's most. */
export const ANALYTICS_WINDOWS = [7, 30, 90] as const;
export type AnalyticsWindow = (typeof ANALYTICS_WINDOWS)[number];

export function windowOf(value: string | number | null | undefined): AnalyticsWindow {
    const n = Number(value);
    return (ANALYTICS_WINDOWS as readonly number[]).includes(n) ? (n as AnalyticsWindow) : 7;
}

/** The pacing chip from a read's `onTrack`; none while the server has no verdict. */
export function pacingChip(onTrack: boolean | null | undefined): { label: string; tone: "success" | "warning" } | null {
    if (onTrack === null || onTrack === undefined) return null;
    return onTrack ? { label: "On track", tone: "success" } : { label: "Behind", tone: "warning" };
}

/** "+12.4%", "−3.2%", "No change" — or null with nothing to compare against. */
export function deltaLabel(comparison: MetricComparison<unknown> | null | undefined): string | null {
    if (!comparison || comparison.deltaPct === null || comparison.deltaPct === undefined) return null;
    const pct = comparison.deltaPct;
    if (pct === 0) return "No change";
    return `${pct > 0 ? "+" : "−"}${Math.abs(pct).toFixed(1)}%`;
}

/** 1.2Cr, 3.4L, 85.0K — the compact figures the tiles print, Indian units. */
export function compact(value: number): string {
    if (value >= 10_000_000) return `${(value / 10_000_000).toFixed(1)}Cr`;
    if (value >= 100_000) return `${(value / 100_000).toFixed(1)}L`;
    if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
    return String(value);
}

/** A click rate as the server sends it (already a percentage) — "2.4%", or "—". */
export function percentLabel(value: number | null | undefined): string {
    if (value === null || value === undefined || !Number.isFinite(value)) return "—";
    return `${Number.isInteger(value) ? value : value.toFixed(1)}%`;
}

export type InteractionFacet = "byDevice" | "byHour" | "byCity" | "byCta";

export const INTERACTION_FACETS: { id: InteractionFacet; label: string }[] = [
    { id: "byDevice", label: "Device" },
    { id: "byHour", label: "Hour" },
    { id: "byCity", label: "City" },
    { id: "byCta", label: "Button" },
];

/** One fold of the interactions as slices, largest first, the empty ones dropped. */
export function interactionSlices(interactions: CampaignInteractions, facet: InteractionFacet): { label: string; count: number }[] {
    const rows =
        facet === "byDevice"
            ? interactions.byDevice.map((row) => ({ label: row.device ?? "Unknown device", count: row.count }))
            : facet === "byHour"
              ? interactions.byHour.map((row) => ({ label: row.hourIst === null ? "Unknown hour" : `${String(row.hourIst).padStart(2, "0")}:00 IST`, count: row.count }))
              : facet === "byCity"
                ? interactions.byCity.map((row) => ({ label: row.city ?? "Unknown city", count: row.count }))
                : interactions.byCta.map((row) => ({ label: row.ctaLabel ?? "No button", count: row.count }));
    return rows.filter((row) => row.count > 0).sort((a, b) => b.count - a.count);
}

export const interactionTotal = (interactions: CampaignInteractions): number => interactions.byDevice.reduce((sum, row) => sum + row.count, 0);

export type AudienceFacet = "ageBands" | "gender" | "incomeBands" | "affinities";

export const AUDIENCE_FACETS: { id: AudienceFacet; label: string }[] = [
    { id: "ageBands", label: "Age" },
    { id: "gender", label: "Gender" },
    { id: "incomeBands", label: "Income" },
    { id: "affinities", label: "Affinities" },
];

/** One facet of the panel as slices — the share is the count, largest first; empty for a facet the vendor does not carry. */
export function audienceSlices(audience: CampaignAudience, facet: AudienceFacet): { label: string; count: number }[] {
    return (audience.demographics[facet] ?? [])
        .filter((row) => row.share > 0)
        .map((row) => ({ label: row.label, count: row.share }))
        .sort((a, b) => b.count - a.count);
}

/** The facets the vendor actually carries. */
export const audienceFacetsOffered = (audience: CampaignAudience): { id: AudienceFacet; label: string }[] =>
    AUDIENCE_FACETS.filter((option) => (audience.demographics[option.id] ?? []).length > 0);

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** A footfall profile as labelled bars: Monday first for the week, "00"–"23" for the day. */
export function profileBars(profile: number[], kind: "byWeekday" | "byHour"): { label: string; value: number }[] {
    return profile.map((value, index) => ({ label: kind === "byWeekday" ? (WEEKDAYS[index] ?? String(index + 1)) : String(index).padStart(2, "0"), value }));
}

const VENDOR_NAMES: Record<string, string> = { GEOIQ: "GeoIQ", AZIRA: "Azira", BLENDED: "both vendors" };
const vendorName = (source: string): string => VENDOR_NAMES[source] ?? source;

/**
 * Whose figures these are: one name when every group came from one vendor,
 * else each group named ("Footfall: Azira - Demographics: GeoIQ"); the
 * legacy `vendor` label on an answer from before the blend.
 */
export function vendorLine(audience: CampaignAudience): string {
    const by = audience.provenanceByField;
    if (!by) return vendorName(audience.vendor);
    const groups: { label: string; source: string | null }[] = [
        { label: "Footfall", source: by.footfall },
        { label: "Demographics", source: by.demographics },
        { label: "Affinities", source: by.affinities === by.demographics ? null : by.affinities },
    ];
    const present = groups.filter((group): group is { label: string; source: string } => group.source !== null);
    if (present.length === 0) return vendorName(audience.vendor);
    const distinct = new Set(present.map((group) => group.source));
    if (distinct.size === 1) {
        const only = present[0]!.source;
        return only === "BLENDED" ? "Both vendors" : vendorName(only);
    }
    return present.map((group) => `${group.label}: ${vendorName(group.source)}`).join(" - ");
}

/** "Both vendors agree within 6 %", or null unless both answered somewhere. */
export function agreementLine(audience: CampaignAudience): string | null {
    const score = audience.agreement?.footfall;
    if (typeof score !== "number" || !Number.isFinite(score)) return null;
    const apart = Math.round((1 - Math.min(1, Math.max(0, score))) * 100);
    return `Both vendors agree within ${apart} %`;
}

/** A share to one decimal, whole where it is whole — "50", "41.5". */
export const shareLabel = (share: number): string => (Number.isInteger(share) ? String(share) : share.toFixed(1));

/* ------------------------------------------------------------------ */
/* Cancelling, refunds, rating a space                                 */
/* ------------------------------------------------------------------ */

/** What a cancel answers: released, or owed and recorded for finance. */
export interface CancelOutcome {
    released: boolean;
    refundNeeded: boolean;
    campaignRefundId?: string | null;
    /** The unused value, as recorded; "0.00" when nothing is owed. */
    refundAmount?: string;
}

export interface CampaignRefundView {
    id: string;
    amount: string;
    status: "PENDING" | "RELEASED" | "REJECTED" | string;
    reason?: string;
    releasedAt?: string | null;
}

/** Whether the advertiser may cancel from the campaign page — before or after payment, never once it has run. */
export const cancellable = (status: string): boolean => status === "DRAFT" || status === "PENDING_PAYMENT" || status === "SCHEDULED" || status === "LIVE";

/** What the confirm says will happen to the money, before the click — the app's own words per status. */
export function cancelConsequence(status: string, reservation: { status: string; fee: string } | null | undefined, retainPct: number | null = null): string {
    const base =
        status === "SCHEDULED"
            ? "The money held for it is released back to your wallet."
            : status === "LIVE" || status === "PAUSED"
              ? "It has already started, so the payment was taken. The unused days are valued and a refund goes to ADX finance to release."
              : status === "PENDING_PAYMENT"
                ? "The spots are released and nothing is charged."
                : "The draft is closed; nothing is charged.";
    if (reservation?.status !== "PAID") return base;
    return `${base} ${retainPct === null ? "Part" : `${retainPct}%`} of the ${formatMoney(reservation.fee)} reservation fee is kept; the rest goes back to your wallet.`;
}

/** The toast after a cancel, from the outcome. */
export function cancelledMessage(outcome: CancelOutcome): string {
    if (outcome.refundNeeded) {
        return outcome.refundAmount && compareMoney(outcome.refundAmount, "0") > 0
            ? `Campaign cancelled. A refund of ${formatMoney(outcome.refundAmount)} for the unused days is pending with ADX finance.`
            : "Campaign cancelled. It had already started, so ADX support will be in touch about any refund.";
    }
    if (outcome.released) return "Campaign cancelled. The money held for it is back in your wallet.";
    return "Campaign cancelled.";
}

/** The refund block's headline and tone, from `campaign.refund`. */
export function refundHeadline(refund: CampaignRefundView): { label: string; tone: "info" | "success" | "warning" } {
    if (refund.status === "RELEASED") return { label: `Refund of ${formatMoney(refund.amount)} credited to your wallet`, tone: "success" };
    if (refund.status === "REJECTED") return { label: `Refund of ${formatMoney(refund.amount)} refused by ADX finance`, tone: "warning" };
    return { label: `Refund of ${formatMoney(refund.amount)} pending with ADX finance`, tone: "info" };
}

export const REFUND_STATUS_LABEL: Record<string, string> = { PENDING: "Pending", RELEASED: "Released", REJECTED: "Refused" };

/** What `POST /campaigns/:id/spots/:spotId/review` answers. */
export interface SpotReview {
    id: string;
    rating: number;
    note: string | null;
    createdAt: string;
}

/** "3 of 5 · Fair" — the line under the stars. */
export const STAR_WORDS: Record<number, string> = { 1: "Poor", 2: "Below par", 3: "Fair", 4: "Good", 5: "Excellent" };

/* ------------------------------------------------------------------ */
/* The ADX landing page                                                */
/* ------------------------------------------------------------------ */

/** The five closed block shapes the backend renders into the public page. */
export type LandingBlock =
    | { type: "hero"; headline: string; subheadline?: string; imageUrl?: string | null }
    | { type: "offer"; title: string; body: string; highlight?: string }
    | { type: "cta"; label: string; href?: string | null }
    | { type: "contact"; phone?: string; email?: string; address?: string; hours?: string; note?: string; formEnabled?: boolean }
    | { type: "gallery"; images: { url: string; alt?: string }[]; placeholders?: number };

export interface LandingTheme {
    primaryColor?: string;
    accentColor?: string;
    font?: "sans" | "serif";
}

export type LandingPageStatus = "DRAFT" | "PUBLISHED";

export interface LandingPage {
    id: string;
    campaignId: string;
    slug: string;
    blocks: LandingBlock[];
    theme: LandingTheme | null;
    version: number;
    status: LandingPageStatus;
    generatedByAi: boolean;
    publishedAt: string | null;
    createdAt: string;
    updatedAt: string;
    /** `/p/:slug`, as the server prints it. */
    url: string;
}

export const GALLERY_MAX_IMAGES = 12;

/** The public address: `/p/:slug` is mounted at the server's root, beside `/t/:code`, not under `/api/v1`. */
export function landingPageUrl(apiBaseUrl: string, page: Pick<LandingPage, "url">): string {
    const origin = apiBaseUrl.replace(/\/+$/, "").replace(/\/api\/v\d+$/i, "");
    return `${origin}${page.url}`;
}

export function landingBlock<K extends LandingBlock["type"]>(blocks: readonly LandingBlock[], kind: K): Extract<LandingBlock, { type: K }> | null {
    return (blocks.find((block) => block.type === kind) as Extract<LandingBlock, { type: K }> | undefined) ?? null;
}

/** What the button does — the four answers the button and contact blocks can express between them. */
export type CtaAction = "LINK" | "CALL" | "WHATSAPP" | "FORM";

export interface LandingDraft {
    headline: string;
    subheadline: string;
    offerTitle: string;
    offerBody: string;
    offerHighlight: string;
    ctaLabel: string;
    ctaAction: CtaAction;
    ctaHref: string;
    phone: string;
    email: string;
    address: string;
    hours: string;
    note: string;
    formEnabled: boolean;
    images: { url: string; alt?: string }[];
    placeholders: number;
}

const WA_LINK = /^https?:\/\/(?:wa\.me|api\.whatsapp\.com)\//i;

/** Digits only, with India's country code when the number was typed without one. */
export function whatsappNumber(phone: string): string {
    const digits = phone.replace(/\D+/g, "");
    return digits.length === 10 ? `91${digits}` : digits;
}

/** The blocks as fields, so the editor edits words rather than JSON. */
export function draftFrom(blocks: readonly LandingBlock[], advertiserPhone: string | null): LandingDraft {
    const hero = landingBlock(blocks, "hero");
    const offer = landingBlock(blocks, "offer");
    const cta = landingBlock(blocks, "cta");
    const contact = landingBlock(blocks, "contact");
    const gallery = landingBlock(blocks, "gallery");
    const href = cta?.href ?? "";
    return {
        headline: hero?.headline ?? "",
        subheadline: hero?.subheadline ?? "",
        offerTitle: offer?.title ?? "",
        offerBody: offer?.body ?? "",
        offerHighlight: offer?.highlight ?? "",
        ctaLabel: cta?.label ?? "Get in touch",
        ctaAction: href ? (WA_LINK.test(href) ? "WHATSAPP" : "LINK") : "FORM",
        ctaHref: href,
        phone: contact?.phone ?? advertiserPhone ?? "",
        email: contact?.email ?? "",
        address: contact?.address ?? "",
        hours: contact?.hours ?? "",
        note: contact?.note ?? "",
        formEnabled: contact?.formEnabled ?? true,
        images: gallery?.images ?? [],
        placeholders: gallery?.placeholders ?? 3,
    };
}

const trimmed = (value: string): string | undefined => (value.trim() ? value.trim() : undefined);

/**
 * The fields back into the blocks the schema takes, in the order the page
 * draws them. "Call" is the contact block's phone (only http(s) links
 * survive the schema, so no tel: button); WhatsApp is a wa.me link.
 */
export function blocksFrom(draft: LandingDraft, advertiserPhone: string | null): LandingBlock[] {
    const phone = draft.ctaAction === "CALL" ? (trimmed(draft.phone) ?? trimmed(advertiserPhone ?? "")) : trimmed(draft.phone);
    const href = draft.ctaAction === "LINK" ? (trimmed(draft.ctaHref) ?? null) : draft.ctaAction === "WHATSAPP" ? `https://wa.me/${whatsappNumber(draft.phone || advertiserPhone || "")}` : null;
    const blocks: LandingBlock[] = [
        { type: "hero", headline: draft.headline.trim(), ...(trimmed(draft.subheadline) ? { subheadline: draft.subheadline.trim() } : {}) },
        { type: "offer", title: draft.offerTitle.trim(), body: draft.offerBody.trim(), ...(trimmed(draft.offerHighlight) ? { highlight: draft.offerHighlight.trim() } : {}) },
        { type: "cta", label: draft.ctaLabel.trim() || "Get in touch", href },
        {
            type: "contact",
            ...(phone ? { phone } : {}),
            ...(trimmed(draft.email) ? { email: draft.email.trim() } : {}),
            ...(trimmed(draft.address) ? { address: draft.address.trim() } : {}),
            ...(trimmed(draft.hours) ? { hours: draft.hours.trim() } : {}),
            ...(trimmed(draft.note) ? { note: draft.note.trim() } : {}),
            formEnabled: draft.formEnabled,
        },
        { type: "gallery", images: draft.images, placeholders: draft.placeholders },
    ];
    /* The offer block is optional on the page; an empty one is not sent. */
    return blocks.filter((block) => block.type !== "offer" || (block.title && block.body));
}

/** What stops the page from being saved, in the words the fields use. */
export function draftProblems(draft: LandingDraft): string[] {
    const problems: string[] = [];
    if (!draft.headline.trim()) problems.push("The page needs a headline.");
    if (draft.ctaAction === "LINK" && !/^https?:\/\/.+/i.test(draft.ctaHref.trim())) problems.push("The button needs a link that starts with https://.");
    if ((draft.ctaAction === "CALL" || draft.ctaAction === "WHATSAPP") && whatsappNumber(draft.phone).length < 10) problems.push("Add the phone number the button should reach.");
    if (draft.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.email.trim())) problems.push("That email address does not look right.");
    return problems;
}

/** The page builder's refusals, in the page's own words. */
export function landingPageError(caught: unknown, fallback: string): string {
    if (caught instanceof ApiError) {
        if (caught.code === "QUOTA_EXHAUSTED") return "Your page drafts for this campaign are used up — edit this page instead of drafting another.";
        if (caught.code === "AI_UNAVAILABLE" || caught.code === "AI_FAILED") return "ADX could not draft the page just now. Try again in a moment, or edit what is here.";
        if (caught.code === "FEATURE_OFF" || caught.status === 503) return "The ADX page builder is switched off right now. Use your own website for the QR codes, or ask ADX when it is back.";
        return caught.message || fallback;
    }
    return fallback;
}

/* ------------------------------------------------------------------ */
/* Home                                                                */
/* ------------------------------------------------------------------ */

/** "Good morning" … "Good night", off the person's own clock — the phone's greeting. */
export function greetingFor(now: Date = new Date()): string {
    const hour = now.getHours();
    if (hour >= 5 && hour < 12) return "Good morning";
    if (hour >= 12 && hour < 17) return "Good afternoon";
    if (hour >= 17 && hour < 21) return "Good evening";
    return "Good night";
}

/** "Meera S" → "Meera"; null while the account is still known by its number. */
export function firstNameOf(name: string | null | undefined): string | null {
    const first = (name ?? "").trim().split(/\s+/)[0] ?? "";
    return first && !/^\+?\d+$/.test(first) ? first : null;
}

/**
 * Who the Overview greets (29 Sep 2026): the person signed in — their first
 * name, else the first word of their display name — never the advertiser
 * account, whose name is a business's for a business account.
 */
export function greetingNameOf(user: { firstName?: string | null; name?: string | null } | null | undefined): string | null {
    const first = user?.firstName?.trim();
    return first || firstNameOf(user?.name);
}

export type SetupGate = "PROFILE" | "AGREEMENT";

/** What the set-up card walks — the billing details, then the agreement; verification and funds are asked where they matter. */
export function pendingGates(eligibility: { blockedBy?: readonly string[]; launchBlockedBy?: readonly string[] } | null | undefined): SetupGate[] {
    const pending = new Set<string>([...(eligibility?.blockedBy ?? []), ...(eligibility?.launchBlockedBy ?? [])]);
    return (["PROFILE", "AGREEMENT"] as SetupGate[]).filter((gate) => pending.has(gate));
}

/** The markets cap, read off the server's refusal ("at most 3 markets"). */
export function marketCapFrom(message: string | null | undefined): number | null {
    const match = /at most (\d+) market/i.exec(message ?? "");
    return match ? Number(match[1]) : null;
}

export const DEFAULT_MARKET_CAP = 3;

/** The owner's note, printed wherever more than one market is on the brief. */
export const MULTI_MARKET_NOTE = "Different cities mean different languages, business habits and consumer mindsets - ADX recommends one market per campaign unless the ad is on common ground";

/** The flag variant under which the second market opens no note. */
export const MULTI_MARKET_UNWARNED_VARIANT = "unwarned";

/* ------------------------------------------------------------------ */
/* Calls                                                               */
/* ------------------------------------------------------------------ */

const enc = encodeURIComponent;

export const campaignsService = {
    /** One page of the list, with the count behind each chip. An older bare-array answer is read as one page. */
    page: async (query: CampaignListQuery = {}): Promise<CampaignPage> => {
        const answer = await api.get<CampaignPage | CampaignSummary[]>(`/campaigns${campaignListQuery({ page: 1, pageSize: 20, ...query })}`);
        if (Array.isArray(answer)) return { items: answer, total: answer.length, page: 1, pageSize: answer.length, counts: {} };
        return answer;
    },
    /** Kept for callers from before the page: a status and a page. */
    list: (params: { status?: string; page?: number; pageSize?: number } = {}) =>
        campaignsService.page({ ...(params.status ? { status: params.status.split(",") } : {}), page: params.page ?? 1, pageSize: params.pageSize ?? 50 }),

    /** `days` is the comparison window (7 by default, 90 at most). */
    analytics: (id: string, days?: number) => api.get<CampaignAnalytics>(`/campaigns/${enc(id)}/analytics${days ? `?days=${days}` : ""}`),
    /** Every campaign's figures; `search` matches the name, brand or reference. */
    portfolio: (query: { search?: string; days?: number } = {}) => {
        const params = new URLSearchParams();
        if (query.search?.trim()) params.set("search", query.search.trim());
        if (query.days) params.set("days", String(query.days));
        const qs = params.toString();
        return api.get<PortfolioAnalytics>(`/campaigns/analytics${qs ? `?${qs}` : ""}`);
    },

    cancel: (id: string, reason: string) => api.post<CancelOutcome>(`/campaigns/${enc(id)}/cancel`, { reason }),
    /** A whole star, one to five, and a line if there is one; 409 REVIEW_EXISTS the second time. */
    reviewSpot: (id: string, spotId: string, body: { rating: number; note?: string }) => api.post<SpotReview>(`/campaigns/${enc(id)}/spots/${enc(spotId)}/review`, body),

    /** The campaign's page; 404 NOT_FOUND while none has been drafted. */
    landingPage: (id: string) => api.get<LandingPage>(`/campaigns/${enc(id)}/landing-page`),
    /** Drafts the blocks from the brief; a second call replaces them. */
    generateLandingPage: (id: string) => api.post<LandingPage>(`/campaigns/${enc(id)}/landing-page/generate`, {}),
    patchLandingPage: (id: string, body: { blocks?: LandingBlock[]; theme?: LandingTheme | null }) => api.patch<LandingPage>(`/campaigns/${enc(id)}/landing-page`, body),
    publishLandingPage: (id: string) => api.post<LandingPage>(`/campaigns/${enc(id)}/landing-page/publish`, {}),
};

/** The page, or null when none has been drafted yet (the read answers 404). */
export async function landingPageOrNull(id: string): Promise<LandingPage | null> {
    try {
        return await campaignsService.landingPage(id);
    } catch (caught) {
        if (caught instanceof ApiError && caught.status === 404) return null;
        throw caught;
    }
}

/* ------------------------------------------------------------------ */
/* Chart helpers                                                       */
/* ------------------------------------------------------------------ */

/** The next clean axis top above a peak — 1, 2 or 5 × 10ⁿ — so the ticks read 0 / 50 / 100, never 0 / 47 / 94. */
export function niceCeil(peak: number): number {
    if (!Number.isFinite(peak) || peak <= 0) return 1;
    const magnitude = 10 ** Math.floor(Math.log10(peak));
    for (const step of [1, 2, 5, 10]) {
        if (step * magnitude >= peak) return step * magnitude;
    }
    return 10 * magnitude;
}

/** "26 Sep" off a YYYY-MM-DD day, for a chart's axis and its tooltip. */
export function dayLabel(day: string): string {
    const [y, m, d] = day.slice(0, 10).split("-").map(Number);
    if (!y || !m || !d) return day;
    return `${d} ${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][m - 1]}`;
}

/** Donut slices past the fifth fold into one "Other", so a hue is never generated for a sixth series. */
export function foldSlices(slices: { label: string; count: number }[], keep = 5): { label: string; count: number }[] {
    if (slices.length <= keep + 1) return slices;
    const rest = slices.slice(keep).reduce((sum, slice) => sum + slice.count, 0);
    return [...slices.slice(0, keep), { label: "Other", count: rest }];
}
