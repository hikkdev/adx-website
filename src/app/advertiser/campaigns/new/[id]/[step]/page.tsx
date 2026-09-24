import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PlannerStep } from "@/components/planner/planner-step";
import { isPlannerStep } from "@/services/planner";

export const metadata: Metadata = { title: "Create a campaign" };

/**
 * DR 12 · 06 · the planner's screens on a draft: brand, goal, audience,
 * location, triggers, budget, spaces, tracking — one route each, the
 * draft's id in the path so a screen reopens where it was left.
 */
export default async function PlannerStepPage({ params }: { params: Promise<{ id: string; step: string }> }) {
    const { id, step } = await params;
    if (!isPlannerStep(step)) notFound();
    return <PlannerStep campaignId={decodeURIComponent(id)} step={step} />;
}
