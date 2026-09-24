import type { Metadata } from "next";
import { PlannerStep } from "@/components/planner/planner-step";

export const metadata: Metadata = { title: "Create a campaign" };

/** DR 12 · 06 · 01 · Brand & campaign (5204:69932) — the planner before a draft exists. */
export default function NewCampaignPage() {
    return <PlannerStep campaignId={null} step="brand" />;
}
