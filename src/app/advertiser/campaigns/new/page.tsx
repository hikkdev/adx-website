import type { Metadata } from "next";
import { PlannerStep } from "@/components/planner/planner-step";

export const metadata: Metadata = { title: "Create a campaign" };

/**
 * DR 12 · 06 · 01 · Brand & campaign (5204:69932) — the planner before a
 * draft exists. DR 06: `?brandId=` starts the campaign under one of the
 * advertiser's brands (the brand page's "New campaign"), the way the app's
 * brand detail opens the booking with `create({ brandId })`.
 */
export default async function NewCampaignPage({ searchParams }: { searchParams: Promise<{ brandId?: string | string[] }> }) {
    const { brandId } = await searchParams;
    const brand = typeof brandId === "string" && brandId.trim() ? brandId.trim() : null;
    return <PlannerStep campaignId={null} step="brand" brandId={brand} />;
}
