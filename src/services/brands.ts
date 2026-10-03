import { api } from "@/lib/api-client";
import { campaignStatusLabel, rupees, type CampaignStatus, type Tone } from "@/services/advertiser-workspace";

/**
 * DR 06's brands on the web, over `/advertisers/:id/brands` — the app's
 * `brands-model.ts` and the brand calls in `advertiser-api.ts`.
 *
 * A brand is a name the advertiser books under. Its industry, sub-category
 * and awareness are the newest campaign's, so each is null until a campaign
 * has been briefed for it. `{ isActive: false }` archives; the same call with
 * `true` brings it back. Money is the string the server sent.
 */

export type BrandSector = "GENERAL" | "ALCOHOL" | "TOBACCO" | "GAMBLING" | "PHARMA" | "POLITICAL" | "FINANCIAL" | "REAL_ESTATE" | "EDUCATION" | "HEALTHCARE" | "INFANT_NUTRITION";
export type BrandAwareness = "BRAND_NEW" | "ALREADY_ESTABLISHED";
export type BrandStatus = "ACTIVE" | "ARCHIVED";

export interface BrandCard {
    id: string;
    advertiserId: string;
    name: string;
    sector: BrandSector | string;
    logoUrl: string | null;
    website: string | null;
    isActive: boolean;
    archived: boolean;
    awareness: BrandAwareness | null;
    industry: string | null;
    subCategory: string | null;
    campaigns: { total: number; live: number; scheduled: number };
    /** Committed budget across the brand's campaigns, as a decimal string. */
    lifetimeSpend: string;
    createdAt: string;
}

export interface BrandCampaignLine {
    id: string;
    name: string;
    status: string;
    budget: string | null;
    spots: number;
    startDate: string | null;
    endDate: string | null;
}

export interface BrandDetail extends BrandCard {
    campaignList: BrandCampaignLine[];
}

export interface BrandInput {
    name: string;
    sector?: BrandSector;
    logoUrl?: string;
    website?: string;
}

export type BrandPatch = Partial<BrandInput> & { isActive?: boolean };

const base = (advertiserId: string) => `/advertisers/${encodeURIComponent(advertiserId)}/brands`;

export const brandsService = {
    /** The list, or one chip's worth of it. */
    list: (advertiserId: string, status?: BrandStatus) => api.get<BrandCard[]>(`${base(advertiserId)}${status ? `?status=${status}` : ""}`),
    get: (advertiserId: string, brandId: string) => api.get<BrandDetail>(`${base(advertiserId)}/${encodeURIComponent(brandId)}`),
    create: (advertiserId: string, input: BrandInput) => api.post<BrandCard>(base(advertiserId), input),
    update: (advertiserId: string, brandId: string, patch: BrandPatch) => api.patch<BrandCard>(`${base(advertiserId)}/${encodeURIComponent(brandId)}`, patch),
};

/* ------------------------------------------------------------------ */
/* What the pages print                                                */
/* ------------------------------------------------------------------ */

export type BrandChip = "ALL" | BrandStatus;

export const BRAND_CHIPS: { value: BrandChip; label: string }[] = [
    { value: "ALL", label: "All" },
    { value: "ACTIVE", label: "Active" },
    { value: "ARCHIVED", label: "Archived" },
];

export function brandChip(value: string | null | undefined): BrandChip {
    return value === "ACTIVE" || value === "ARCHIVED" ? value : "ALL";
}

/** The `?status=` a chip asks for; All asks for nothing. */
export function chipStatus(chip: BrandChip): BrandStatus | undefined {
    return chip === "ALL" ? undefined : chip;
}

/** The sectors the server accepts, in the order the form offers them. */
export const BRAND_SECTORS: BrandSector[] = ["GENERAL", "FINANCIAL", "REAL_ESTATE", "EDUCATION", "HEALTHCARE", "PHARMA", "INFANT_NUTRITION", "ALCOHOL", "TOBACCO", "GAMBLING", "POLITICAL"];

/** "Real estate", "Infant nutrition". */
export function sectorLabel(sector: string): string {
    return sector.toLowerCase().replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
}

/** The industry (newest campaign's), else the sector the advertiser gave. */
export function industryLine(card: Pick<BrandCard, "industry" | "sector">): string {
    return card.industry?.trim() || sectorLabel(card.sector);
}

/** "2 live campaigns", "1 scheduled campaign", "No live campaigns". */
export function campaignsLine(card: Pick<BrandCard, "campaigns">): string {
    const { live, scheduled } = card.campaigns;
    if (live > 0) return `${live} live ${live === 1 ? "campaign" : "campaigns"}`;
    if (scheduled > 0) return `${scheduled} scheduled ${scheduled === 1 ? "campaign" : "campaigns"}`;
    return "No live campaigns";
}

/** "₹43,400 spent", or null for a brand with no campaign (no zero somebody could read as a decision). */
export function spentLabel(card: Pick<BrandCard, "campaigns" | "lifetimeSpend">): string | null {
    if (card.campaigns.total === 0) return null;
    return `${rupees(card.lifetimeSpend)} spent`;
}

export function brandPill(card: Pick<BrandCard, "archived">): { label: string; tone: Tone } {
    return card.archived ? { label: "Archived", tone: "neutral" } : { label: "Active", tone: "success" };
}

/** "Brand new" / "Already established"; null until a campaign has said. */
export function awarenessLabel(awareness: string | null): string | null {
    if (awareness === null) return null;
    if (awareness === "BRAND_NEW") return "Brand new";
    if (awareness === "ALREADY_ESTABLISHED") return "Already established";
    return sectorLabel(awareness);
}

/** "Mar 2026". */
export function addedLabel(card: Pick<BrandCard, "createdAt">): string {
    const date = new Date(card.createdAt);
    if (Number.isNaN(date.getTime())) return "—";
    return `${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][date.getMonth()]} ${date.getFullYear()}`;
}

/** The search narrows the list in the browser: the endpoint has no `q`, and the list is short. */
export function matchesBrand(card: Pick<BrandCard, "name" | "industry" | "sector">, query: string): boolean {
    const needle = query.trim().toLowerCase();
    if (!needle) return true;
    return [card.name, card.industry ?? "", sectorLabel(card.sector)].some((text) => text.toLowerCase().includes(needle));
}

export function countLine(total: number): string {
    return `${total} ${total === 1 ? "brand" : "brands"}`;
}

/** The campaign row's status, from the campaign book's one table. */
export function brandCampaignStatus(status: string): { label: string; tone: Tone } {
    const known: CampaignStatus[] = ["DRAFT", "PENDING_PAYMENT", "SCHEDULED", "LIVE", "PAUSED", "COMPLETED", "CANCELLED"];
    if (known.includes(status as CampaignStatus)) return campaignStatusLabel({ status: status as CampaignStatus });
    return { label: sectorLabel(status), tone: "neutral" };
}

/** Where "New campaign for this brand" goes — the Campaigns builder reads `brandId`. */
export function newCampaignHref(brandId: string): string {
    return `/advertiser/campaigns/new?brandId=${encodeURIComponent(brandId)}`;
}

/**
 * What the form sends, or the sentence that says why it cannot. The server
 * takes a name of 1–120 characters, a sector from its list, and a website or
 * logo only as a full URL (up to 500) — checked here so the refusal is the
 * page's words, not a validation dump.
 */
export function brandInput(form: { name: string; sector: string; website: string; logoUrl?: string }): { ok: true; input: BrandInput } | { ok: false; message: string } {
    const name = form.name.trim();
    if (!name) return { ok: false, message: "Give the brand a name." };
    if (name.length > 120) return { ok: false, message: "Keep the name under 120 characters." };
    if (!BRAND_SECTORS.includes(form.sector as BrandSector)) return { ok: false, message: "Choose the sector the brand is in." };
    const input: BrandInput = { name, sector: form.sector as BrandSector };
    const website = form.website.trim();
    if (website) {
        const url = normaliseUrl(website);
        if (!url) return { ok: false, message: "Enter the website as an address, like https://example.com." };
        input.website = url;
    }
    const logo = form.logoUrl?.trim() ?? "";
    if (logo) {
        const url = normaliseUrl(logo);
        if (!url) return { ok: false, message: "Enter the logo as the address of an image, like https://example.com/logo.png." };
        input.logoUrl = url;
    }
    return { ok: true, input };
}

/** "example.com" → "https://example.com"; null when it is not an address at all. */
export function normaliseUrl(value: string): string | null {
    const trimmed = value.trim();
    if (!trimmed || /\s/.test(trimmed)) return null;
    const candidate = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    try {
        const url = new URL(candidate);
        if (!url.hostname.includes(".") || candidate.length > 500) return null;
        return candidate;
    } catch {
        return null;
    }
}

/** Only the fields that changed, so an edit never re-sends what the server already holds. */
export function brandPatch(before: Pick<BrandCard, "name" | "sector" | "website" | "logoUrl">, after: BrandInput): BrandPatch {
    const patch: BrandPatch = {};
    if (after.name !== before.name) patch.name = after.name;
    if (after.sector && after.sector !== before.sector) patch.sector = after.sector;
    if (after.website && after.website !== before.website) patch.website = after.website;
    if (after.logoUrl && after.logoUrl !== before.logoUrl) patch.logoUrl = after.logoUrl;
    return patch;
}
