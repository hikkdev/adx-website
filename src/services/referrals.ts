import { api } from "@/lib/api-client";

/**
 * Refer a business on the web — the ADX app's `leads/refer-screen.tsx`
 * over `/leads/referrals*` (LH3, D9). Every publisher and advertiser has one
 * link; a business they refer lands as a lead attributed to them; when it
 * goes live, the referral credit lands in their wallet.
 */

export type LeadSide = "PUBLISHER" | "ADVERTISER";
export type LeadStage = "SOURCED" | "SCORED" | "CLAIMED" | "CONTACTED" | "ENGAGED" | "VISIT_BOOKED" | "PROPOSED" | "CONVERTED" | "ONBOARDING" | "ACTIVATED" | "RETAINED" | "LOST";

export interface ReferralLink {
    code: string;
    url: string;
}

export interface ReferralRow {
    id: string;
    referrerKind: "PUBLISHER" | "ADVERTISER" | "AGENT";
    referrerId: string;
    leadId: string;
    lead: { displayId: string | null; businessName: string; stage: LeadStage; status: string; side: LeadSide; city: string | null } | null;
    creditAmount: string | null;
    creditedAt: string | null;
    createdAt: string;
}

export interface MyReferrals {
    link: ReferralLink;
    referrals: ReferralRow[];
    totals: { referred: number; activated: number; credited: string };
}

export interface ReferInput {
    side: LeadSide;
    businessName: string;
    contactName?: string;
    phone: string;
    city?: string;
    message?: string;
}

export interface ReferAnswer {
    leadId: string;
    displayId: string | null;
    created: boolean;
    assignedAgentId: string | null;
    alreadyKnown: boolean;
}

export const EMPTY_REFERRALS: MyReferrals = { link: { code: "", url: "" }, referrals: [], totals: { referred: 0, activated: 0, credited: "0.00" } };

export const referralsService = {
    mine: () => api.get<MyReferrals>("/leads/referrals/me"),
    refer: (input: ReferInput) => api.post<ReferAnswer>("/leads/referrals", input),
};

/** Where a referred business stands, in the referrer's words. */
export function referralStanding(row: Pick<ReferralRow, "lead" | "creditedAt">): { label: string; tone: "success" | "info" | "neutral" | "warning" } {
    if (row.creditedAt) return { label: "Live on ADX · credit paid", tone: "success" };
    const stage = row.lead?.stage;
    if (!stage) return { label: "Received", tone: "neutral" };
    if (stage === "ACTIVATED" || stage === "RETAINED") return { label: "Live on ADX", tone: "success" };
    if (stage === "CONVERTED" || stage === "ONBOARDING") return { label: "Signed up, getting set up", tone: "info" };
    if (stage === "LOST") return { label: "Did not go ahead", tone: "neutral" };
    return { label: "Being worked by ADX", tone: "info" };
}

/** The share message — the link with one line around it. */
export function shareMessage(link: ReferralLink, side: LeadSide | "BOTH" = "BOTH"): string {
    const hook =
        side === "PUBLISHER"
            ? "Your wall, shop front or building could earn every month on ADX."
            : side === "ADVERTISER"
              ? "Advertise on real walls and screens near your customers with ADX."
              : "Earn from your wall, or advertise on walls near your customers, with ADX.";
    return `${hook} Sign up with my link: ${link.url}`;
}

/** Whether the form can go: a name, and a whole number. */
export function referReady(input: { businessName: string; phone: string }): boolean {
    return input.businessName.trim().length > 0 && input.phone.replace(/\D/g, "").length >= 10;
}

/** The body `POST /leads/referrals` gets — the optional fields only when filled. */
export function referBody(input: { side: LeadSide; businessName: string; phone: string; contactName: string; city: string; message?: string }): ReferInput {
    return {
        side: input.side,
        businessName: input.businessName.trim(),
        phone: input.phone.trim(),
        ...(input.contactName.trim() ? { contactName: input.contactName.trim() } : {}),
        ...(input.city.trim() ? { city: input.city.trim() } : {}),
        ...(input.message?.trim() ? { message: input.message.trim() } : {}),
    };
}

/** What the page says once it went through. */
export function sentLine(businessName: string, answer: Pick<ReferAnswer, "alreadyKnown">): string {
    return answer.alreadyKnown ? `${businessName.trim()} was already with ADX — thank you anyway.` : `${businessName.trim()} is in. ADX will reach out.`;
}

/** "3 referred · 1 live · ₹500.00 earned". */
export function totalsLine(totals: MyReferrals["totals"]): string {
    return `${totals.referred} referred · ${totals.activated} live · ₹${totals.credited} earned`;
}
