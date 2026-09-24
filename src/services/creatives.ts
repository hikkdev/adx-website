import { api, apiFetch } from "@/lib/api-client";
import type { BrowseCard } from "@/services/browse";
import type { AudiencePersona, Campaign, CampaignCreative, CampaignSpot, ContentCategory, CreativeStatus } from "@/services/planner";

export type { CampaignCreative, CreativeStatus } from "@/services/planner";

/**
 * Creative assistance — DR 12 board 05 — over the campaign's ADX-design
 * path. A brief is `creativeConfig` on the campaign (`PATCH /campaigns/:id`
 * with `creative: { creativePath: 'ADX_DESIGN_AGENCY', creativeConfig }`);
 * the audience is `persona`. Once ADX designs the artwork it lands on the
 * campaign as a creative `AWAITING_ADVERTISER`, which the advertiser accepts
 * (`POST …/creatives/:id/accept`) or sends back with a note
 * (`POST …/creatives/:id/request-changes`). An upload the advertiser makes
 * themselves goes `POST /upload` then `POST /campaigns/:id/creatives`.
 */

export type DesignStyle = "BOLD_AND_ENERGETIC" | "CLEAN_AND_MINIMAL" | "WARM_AND_FRIENDLY";

export const STYLES: { id: DesignStyle; title: string }[] = [
    { id: "BOLD_AND_ENERGETIC", title: "Bold and energetic" },
    { id: "CLEAN_AND_MINIMAL", title: "Clean and minimal" },
    { id: "WARM_AND_FRIENDLY", title: "Warm and friendly" },
];

/** The frame's four audiences, each the app's persona under a plainer name. */
export const AUDIENCES: { id: AudiencePersona; title: string; description: string }[] = [
    { id: "FAMILIES_OR_SUBURBAN", title: "Families & home buyers", description: "People furnishing a home or planning their next purchase." },
    { id: "STUDENTS_OR_GEN_Z", title: "Students & young adults", description: "People exploring new brands, experiences and everyday essentials." },
    { id: "HIGH_INCOME_CONSUMERS", title: "Premium shoppers", description: "People considering premium products and higher-value purchases." },
    { id: "B2B_DECISION_MAKERS", title: "Business decision makers", description: "People choosing products or services for their organisation." },
];

export function audienceLabel(persona: AudiencePersona | null | undefined): string | null {
    return AUDIENCES.find((a) => a.id === persona)?.title ?? null;
}

export interface DesignBrief {
    objective: string;
    keyMessage: string;
    style: DesignStyle;
}

/** The brief on the campaign, when the ADX path carries one. */
export function briefOf(campaign: Pick<Campaign, "creativePath" | "creativeConfig">): DesignBrief | null {
    if (campaign.creativePath !== "ADX_DESIGN_AGENCY") return null;
    const config = (campaign.creativeConfig ?? {}) as Partial<DesignBrief>;
    if (!config.objective || !config.keyMessage) return null;
    return {
        objective: String(config.objective),
        keyMessage: String(config.keyMessage),
        style: (STYLES.some((s) => s.id === config.style) ? config.style : "CLEAN_AND_MINIMAL") as DesignStyle,
    };
}

/** The status chip's words for each state, as the app prints them. */
export const CREATIVE_STATUS_META: Record<CreativeStatus, { label: string; tone: "neutral" | "info" | "success" | "warning" | "danger" }> = {
    PENDING_UPLOAD: { label: "Not uploaded", tone: "neutral" },
    UPLOADED: { label: "Uploaded", tone: "neutral" },
    IN_REVIEW: { label: "In review", tone: "info" },
    APPROVED: { label: "Approved", tone: "success" },
    REJECTED: { label: "Rejected", tone: "danger" },
    CHANGES_REQUESTED: { label: "Changes requested", tone: "warning" },
    AWAITING_ADVERTISER: { label: "Awaiting your approval", tone: "warning" },
};

/**
 * The newest row for a slot — a re-upload after a refusal is a new row
 * pointing at the old one, and the desk keeps what it refused.
 */
export function currentCreativeFor(creatives: CampaignCreative[], spotId: string | null): CampaignCreative | null {
    const superseded = new Set(creatives.map((c) => c.resubmissionOfId).filter(Boolean));
    const rows = creatives.filter((c) => c.spotId === spotId && !superseded.has(c.id));
    if (rows.length === 0) return null;
    return rows.reduce((newest, row) => ((row.submittedAt ?? "") >= (newest.submittedAt ?? "") ? row : newest));
}

/** The design ADX made for this campaign — the newest ADX-path artwork with a file, or null while none exists. */
export function designedCreative(campaign: Pick<Campaign, "creatives">): CampaignCreative | null {
    const designs = campaign.creatives.filter((c) => c.fileUrl && (c.designedByAdx || c.path === "ADX_DESIGN_AGENCY"));
    if (designs.length === 0) return null;
    const last = designs[designs.length - 1]!;
    return currentCreativeFor(designs, last.spotId) ?? last;
}

export type DesignRequestStage = "NOT_SENT" | "AWAITING_QUOTE" | "ARTWORK_READY" | "CHANGES_REQUESTED" | "IN_REVIEW" | "APPROVED" | "REJECTED";

/**
 * Where the design request stands, read off the campaign: the brief is the
 * request, and the ADX-designed artwork's status is the rest of the story.
 */
export function designRequestStage(campaign: Pick<Campaign, "creativePath" | "creativeConfig" | "creatives">): DesignRequestStage {
    if (!briefOf(campaign)) return "NOT_SENT";
    const design = designedCreative(campaign);
    if (!design) return "AWAITING_QUOTE";
    switch (design.status) {
        case "AWAITING_ADVERTISER":
            return "ARTWORK_READY";
        case "CHANGES_REQUESTED":
            return "CHANGES_REQUESTED";
        case "APPROVED":
            return "APPROVED";
        case "REJECTED":
            return "REJECTED";
        default:
            return "IN_REVIEW";
    }
}

export const STAGE_META: Record<DesignRequestStage, { title: string; line: string; status: string }> = {
    NOT_SENT: { title: "No design request yet", line: "Write a brief and send it, and ADX will quote the artwork your spaces need.", status: "Not sent" },
    AWAITING_QUOTE: { title: "Request received · Awaiting quote", line: "ADX will review your brief and share the scope, price, and delivery date for your approval.", status: "Awaiting quote" },
    ARTWORK_READY: { title: "Artwork ready · Your approval needed", line: "ADX has designed the artwork from your brief. Approve it, or send it back with what to change.", status: "Awaiting your approval" },
    CHANGES_REQUESTED: { title: "Changes requested", line: "ADX has your note and will send a revised design. Nothing prints until you approve it.", status: "Changes requested" },
    IN_REVIEW: { title: "Design accepted · With the ADX desk", line: "You accepted the design. The ADX desk checks it against each space before it prints.", status: "In review" },
    APPROVED: { title: "Artwork approved", line: "The desk approved the artwork. It prints as approved once the campaign is paid for.", status: "Approved" },
    REJECTED: { title: "Artwork refused by the desk", line: "The desk could not approve this artwork. ADX will revise it from the desk's note.", status: "Refused" },
};

/** "Whitefield billboard + Phoenix Mall Atrium" — the frame's selected-spaces line. */
export function spaceNames(spots: Pick<CampaignSpot, "listing" | "status">[]): string {
    return spots
        .filter((spot) => spot.status !== "CANCELLED")
        .map((spot) => spot.listing.title)
        .join(" + ");
}

export interface ArtworkSpec {
    kind: "Print artwork" | "Digital artwork";
    /** "40 × 20 ft", or null when the space states no size. */
    size: string | null;
}

/**
 * What each space needs designed: a print file for a static face, a digital
 * file for a screen, at the size the listing states. The size is the
 * listing's own (feet); a screen's pixel spec is not a field the backend
 * keeps, so a digital space prints its stated size and nothing invented.
 */
export function artworkSpec(spot: Pick<CampaignSpot, "listing">, card?: Pick<BrowseCard, "display" | "size"> | null): ArtworkSpec {
    const digital = card?.display === "DIGITAL" || /digital|led|screen/i.test(spot.listing.mediaType?.name ?? "");
    const w = spot.listing.widthFt ? Number(spot.listing.widthFt) : null;
    const h = spot.listing.heightFt ? Number(spot.listing.heightFt) : null;
    const size = w && h ? `${Math.round(w)} × ${Math.round(h)} ft` : card?.size ?? null;
    return { kind: digital ? "Digital artwork" : "Print artwork", size };
}

/** "40 × 20 ft print artwork and 24 × 14 ft digital artwork" — the brief's deliverables line. */
export function deliverablesLine(specs: ArtworkSpec[]): string {
    const words = specs.map((spec) => `${spec.size ? `${spec.size} ` : ""}${spec.kind.toLowerCase()}`);
    if (words.length === 0) return "No spaces selected yet";
    if (words.length === 1) return words[0]!;
    return `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`;
}

/** What a space says about the campaign's content category — a note beside the spec, or nothing. */
export function stanceNote(rules: { contentCategoryId: string; stance: string }[], contentCategoryId: string | null | undefined, categoryName: string | null): string | null {
    if (!contentCategoryId) return null;
    const rule = rules.find((r) => r.contentCategoryId === contentCategoryId);
    if (!rule) return null;
    const what = categoryName ?? "this content";
    if (rule.stance === "PROHIBITED" || rule.stance === "NOT_ALLOWED") return `Does not take ${what}`;
    if (rule.stance === "REQUIRES_APPROVAL") return `Publisher approval needed for ${what}`;
    return null;
}

export interface UploadedFile {
    id: string;
    url: string;
    geoStamped?: boolean;
}

export interface SubmitCreativeInput {
    spotId?: string | null;
    fileUrl: string;
    fileName?: string;
    fileSize?: number;
    mimeType?: string;
    widthPx?: number;
    heightPx?: number;
    durationMs?: number;
    trackingCodeId?: string | null;
}

export const creativesService = {
    /** `POST /upload` as multipart — the artwork file, filed under CAMPAIGN_CREATIVE. */
    upload: (file: File) => {
        const body = new FormData();
        body.append("file", file);
        body.append("purpose", "CAMPAIGN_CREATIVE");
        return apiFetch<UploadedFile>("/upload", { method: "POST", body });
    },
    submit: (campaignId: string, input: SubmitCreativeInput) =>
        api.post<CampaignCreative & { campaign?: unknown; spot?: unknown }>(`/campaigns/${encodeURIComponent(campaignId)}/creatives`, input),
    remove: (campaignId: string, creativeId: string) =>
        api.delete<{ deleted: boolean } | undefined>(`/campaigns/${encodeURIComponent(campaignId)}/creatives/${encodeURIComponent(creativeId)}`),
    accept: (campaignId: string, creativeId: string) =>
        api.post<CampaignCreative>(`/campaigns/${encodeURIComponent(campaignId)}/creatives/${encodeURIComponent(creativeId)}/accept`, {}),
    requestChanges: (campaignId: string, creativeId: string, note: string) =>
        api.post<CampaignCreative>(`/campaigns/${encodeURIComponent(campaignId)}/creatives/${encodeURIComponent(creativeId)}/request-changes`, { note }),
    contentRules: (listingId: string) => api.get<{ contentCategoryId: string; stance: string }[]>(`/listings/${encodeURIComponent(listingId)}/content-rules`),
    contentCategories: () => api.get<ContentCategory[]>("/campaigns/content-categories"),
};
