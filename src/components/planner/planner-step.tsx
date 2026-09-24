"use client";

import * as React from "react";
import Link from "next/link";
import { InlineError, LoadingLine, PlannerShell } from "@/components/planner/planner-shell";
import { useCampaign } from "@/components/planner/use-campaign";
import { STEP_META, type Campaign, type PlannerStepId } from "@/services/planner";
import { BrandStep } from "@/components/planner/brand-step";
import { GoalStep } from "@/components/planner/goal-step";
import { AudienceStep } from "@/components/planner/audience-step";
import { LocationStep } from "@/components/planner/location-step";
import { TriggersStep } from "@/components/planner/triggers-step";
import { BudgetStep } from "@/components/planner/budget-step";
import { SpacesStep } from "@/components/planner/spaces-step";
import { TrackingStep } from "@/components/planner/tracking-step";

export interface StepProps {
    campaign: Campaign;
    save: ReturnType<typeof useCampaign>["save"];
    replace: ReturnType<typeof useCampaign>["replace"];
    reload: () => void;
}

/**
 * DR 12 · 06 · Create a campaign: one route per screen, the campaign
 * read once per screen and saved on Continue. `/advertiser/campaigns/new`
 * is the brand screen before a draft exists; every later screen carries
 * the draft's id in its path.
 */
export function PlannerStep({ campaignId, step }: { campaignId: string | null; step: PlannerStepId }) {
    const meta = STEP_META[step];
    const { state, campaign, save, replace, reload } = useCampaign(campaignId);

    if (!campaignId) {
        return (
            <PlannerShell title="Create a campaign" subtitle={meta.subtitle} bar={meta.bar}>
                <BrandStep campaign={null} save={save} replace={replace} reload={reload} />
            </PlannerShell>
        );
    }

    return (
        <PlannerShell title="Create a campaign" subtitle={meta.subtitle} bar={meta.bar}>
            {state.kind === "loading" && <LoadingLine>Loading your campaign…</LoadingLine>}
            {state.kind === "missing" && (
                <div className="rounded-xl border border-line bg-white p-8">
                    <p className="text-base font-semibold text-ink">This campaign is not in your workspace</p>
                    <p className="mt-2 text-sm text-dim">It may have been discarded, or it belongs to another account.</p>
                    <Link href="/advertiser/campaigns/new" className="mt-4 inline-flex h-12 items-center rounded-md bg-brand px-6 text-sm font-medium text-white">
                        Start a new campaign
                    </Link>
                </div>
            )}
            {state.kind === "error" && <InlineError message={state.message} />}
            {campaign && step === "brand" && <BrandStep campaign={campaign} save={save} replace={replace} reload={reload} />}
            {campaign && step === "goal" && <GoalStep campaign={campaign} save={save} replace={replace} reload={reload} />}
            {campaign && step === "audience" && <AudienceStep campaign={campaign} save={save} replace={replace} reload={reload} />}
            {campaign && step === "location" && <LocationStep campaign={campaign} save={save} replace={replace} reload={reload} />}
            {campaign && step === "triggers" && <TriggersStep campaign={campaign} save={save} replace={replace} reload={reload} />}
            {campaign && step === "budget" && <BudgetStep campaign={campaign} save={save} replace={replace} reload={reload} />}
            {campaign && step === "spaces" && <SpacesStep campaign={campaign} save={save} replace={replace} reload={reload} />}
            {campaign && step === "tracking" && <TrackingStep campaign={campaign} save={save} replace={replace} reload={reload} />}
        </PlannerShell>
    );
}
