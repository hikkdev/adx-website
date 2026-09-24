import { api } from "@/lib/api-client";

/**
 * The advertiser's campaigns — `GET /campaigns`, the same rows the ADX app's
 * "My campaigns" tab and the console's Campaigns desk read. Only what the
 * web lists needs is typed here; a campaign's full record grows with the
 * boards that use it.
 */
export type CampaignStatus = "DRAFT" | "PENDING_PAYMENT" | "SCHEDULED" | "ACTIVE" | "COMPLETED" | "CANCELLED" | "PAUSED" | string;

export interface CampaignSummary {
    id: string;
    reference: string;
    name: string;
    status: CampaignStatus;
    step: number;
    brandName: string | null;
    startDate: string | null;
    endDate: string | null;
    totalAmount?: string | null;
    createdAt: string;
    updatedAt: string;
    spotCount?: number;
    city?: string | null;
}

export interface CampaignPage {
    items: CampaignSummary[];
    total: number;
    page: number;
    pageSize: number;
}

export const campaignsService = {
    list: async (params: { status?: string; page?: number; pageSize?: number } = {}): Promise<CampaignPage> => {
        const search = new URLSearchParams();
        if (params.status) search.set("status", params.status);
        search.set("page", String(params.page ?? 1));
        search.set("pageSize", String(params.pageSize ?? 50));
        const answer = await api.get<CampaignPage | CampaignSummary[]>(`/campaigns?${search.toString()}`);
        if (Array.isArray(answer)) return { items: answer, total: answer.length, page: 1, pageSize: answer.length };
        return answer;
    },
};
