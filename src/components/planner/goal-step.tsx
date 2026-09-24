"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ChoiceRow } from "@/components/planner/fields";
import { InlineError, StepActions, TaskCard } from "@/components/planner/planner-shell";
import type { StepProps } from "@/components/planner/planner-step";
import { messageOf } from "@/lib/api-client";
import { AWARENESS, GOALS, plannerHref, STEP_META, type BrandAwarenessLevel, type CampaignGoal } from "@/services/planner";

/** 02 · Goal & awareness (5204:70135): the goal, then how known the brand is. */
export function GoalStep({ campaign, save }: StepProps) {
    const router = useRouter();
    const [goal, setGoal] = React.useState<CampaignGoal | null>(campaign.goal);
    const [awareness, setAwareness] = React.useState<BrandAwarenessLevel | null>(campaign.awareness);
    const [busy, setBusy] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);

    const submit = async () => {
        if (!goal || !awareness || busy) return;
        setBusy(true);
        setError(null);
        try {
            await save({ goal, awareness, step: STEP_META.goal.appStep });
            router.push(plannerHref(campaign.id, "audience"));
        } catch (caught) {
            setError(messageOf(caught, "Could not save the goal."));
            setBusy(false);
        }
    };

    return (
        <>
            <TaskCard title="Campaign goal">
                <div role="radiogroup" aria-label="Campaign goal" className="space-y-2.5">
                    {GOALS.map((option) => (
                        <ChoiceRow key={option.id} title={option.title} selected={goal === option.id} onSelect={() => setGoal(option.id)} />
                    ))}
                </div>
                <div className="mt-6">
                    <h3 className="text-lg font-semibold leading-6 text-ink">Brand awareness</h3>
                    <p className="mt-2 text-sm text-dim">This adds context to your goal.</p>
                    <div role="radiogroup" aria-label="Brand awareness" className="mt-4 space-y-2.5">
                        {AWARENESS.map((option) => (
                            <ChoiceRow key={option.id} title={option.title} selected={awareness === option.id} onSelect={() => setAwareness(option.id)} />
                        ))}
                    </div>
                </div>
                {error && (
                    <div className="mt-4">
                        <InlineError message={error} />
                    </div>
                )}
            </TaskCard>
            <StepActions back={{ label: "Back", href: plannerHref(campaign.id, "brand") }} next={{ label: STEP_META.goal.continueLabel, onClick: submit, disabled: !goal || !awareness, busy }} />
        </>
    );
}
