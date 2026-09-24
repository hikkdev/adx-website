"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { creativeHref, type CreativeProps } from "@/components/creative/creative-screen";
import { ChoiceRow } from "@/components/planner/fields";
import { InlineError, StepActions, TaskCard } from "@/components/planner/planner-shell";
import { messageOf } from "@/lib/api-client";
import { AUDIENCES } from "@/services/creatives";
import type { AudiencePersona } from "@/services/planner";

/** 02 · Audience (5204:68330): who the artwork speaks to — the campaign's persona, in plainer words. */
export function AudienceForm({ campaign, save }: CreativeProps) {
    const router = useRouter();
    const [persona, setPersona] = React.useState<AudiencePersona | null>(campaign.persona);
    const [busy, setBusy] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);

    const submit = async () => {
        if (!persona || busy) return;
        setBusy(true);
        setError(null);
        try {
            if (persona !== campaign.persona) await save({ persona });
            router.push(creativeHref(campaign.id, "review"));
        } catch (caught) {
            setError(messageOf(caught, "Could not save the audience."));
            setBusy(false);
        }
    };

    return (
        <>
            <TaskCard title="Audience">
                <div role="radiogroup" aria-label="Audience" className="space-y-3">
                    {AUDIENCES.map((option) => (
                        <ChoiceRow key={option.id} title={option.title} description={option.description} selected={persona === option.id} onSelect={() => setPersona(option.id)} radio />
                    ))}
                </div>
                {error && (
                    <div className="mt-4">
                        <InlineError message={error} />
                    </div>
                )}
            </TaskCard>
            <StepActions back={{ label: "Back", href: creativeHref(campaign.id, "brief") }} next={{ label: "Review design request", onClick: submit, disabled: !persona, busy }} />
        </>
    );
}
