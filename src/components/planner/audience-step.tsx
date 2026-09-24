"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ChoiceRow, Segmented } from "@/components/planner/fields";
import { InlineError, StepActions, TaskCard } from "@/components/planner/planner-shell";
import type { StepProps } from "@/components/planner/planner-step";
import { messageOf } from "@/lib/api-client";
import { PERSONAS, plannerHref, STEP_META, STRATEGIES, type AudiencePersona, type CampaignStrategy } from "@/services/planner";

/** The strategy dial (5204:70338's "Native strategy guide"): the needle sits left, centre or right. */
function StrategyGauge({ strategy }: { strategy: CampaignStrategy }) {
    const angle = strategy === "DEFENSIVE" ? -60 : strategy === "ATTACK" ? 60 : 0;
    return (
        <svg width="200" height="140" viewBox="0 0 200 140" role="img" aria-label={`Strategy guide: ${strategy.toLowerCase()}`}>
            <path d="M20 120 A80 80 0 0 1 180 120" fill="none" stroke="#f3d6d6" strokeWidth="14" strokeLinecap="round" />
            <path d="M20 120 A80 80 0 0 1 60 51" fill="none" stroke="#bd2020" strokeWidth="14" strokeLinecap="round" />
            <g transform={`rotate(${angle} 100 120)`}>
                <line x1="100" y1="120" x2="100" y2="52" stroke="#bd2020" strokeWidth="6" strokeLinecap="round" />
            </g>
            <circle cx="100" cy="120" r="10" fill="#fff" stroke="#bd2020" strokeWidth="4" />
        </svg>
    );
}

/** 03 · Audience & strategy (5204:70338): who the campaign is for, and how hard to buy. */
export function AudienceStep({ campaign, save }: StepProps) {
    const router = useRouter();
    const [persona, setPersona] = React.useState<AudiencePersona | null>(campaign.persona);
    const [strategy, setStrategy] = React.useState<CampaignStrategy>(campaign.strategy ?? "GENERAL");
    const [busy, setBusy] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);
    const mode = STRATEGIES.find((s) => s.id === strategy)!;

    const submit = async () => {
        if (!persona || busy) return;
        setBusy(true);
        setError(null);
        try {
            await save({ persona, strategy, step: STEP_META.audience.appStep });
            router.push(plannerHref(campaign.id, "location"));
        } catch (caught) {
            setError(messageOf(caught, "Could not save the audience."));
            setBusy(false);
        }
    };

    return (
        <>
            <TaskCard title="Audience">
                <div role="radiogroup" aria-label="Audience" className="space-y-2.5">
                    {PERSONAS.map((option) => (
                        <ChoiceRow key={option.id} title={option.title} selected={persona === option.id} onSelect={() => setPersona(option.id)} compact />
                    ))}
                </div>
                <div className="mt-6">
                    <h3 className="text-lg font-semibold leading-6 text-ink">Strategy</h3>
                    <div className="mt-3.5 flex flex-col gap-6 md:flex-row md:items-start">
                        <div className="w-[200px] shrink-0 text-center">
                            <StrategyGauge strategy={strategy} />
                            <p className="mt-1 text-xs text-dim">Strategy guide</p>
                        </div>
                        <div className="min-w-0 flex-1 pt-3">
                            <Segmented options={STRATEGIES.map((s) => ({ id: s.id, title: s.title }))} value={strategy} onChange={setStrategy} className="w-[320px] max-w-full" />
                            <div className="mt-3 rounded-lg bg-ground px-3 py-4">
                                <p className="text-sm font-medium text-ink">{mode.title}</p>
                                <p className="mt-1 text-sm text-dim">{mode.description}</p>
                            </div>
                        </div>
                    </div>
                </div>
                {error && (
                    <div className="mt-4">
                        <InlineError message={error} />
                    </div>
                )}
            </TaskCard>
            <StepActions back={{ label: "Back", href: plannerHref(campaign.id, "goal") }} next={{ label: STEP_META.audience.continueLabel, onClick: submit, disabled: !persona, busy }} />
        </>
    );
}
