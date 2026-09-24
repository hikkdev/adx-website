"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { creativeHref, type CreativeProps } from "@/components/creative/creative-screen";
import { Chip, LabeledInput, LabeledTextarea } from "@/components/planner/fields";
import { InlineError, StepActions, TaskCard } from "@/components/planner/planner-shell";
import { messageOf } from "@/lib/api-client";
import { briefOf, STYLES, type DesignStyle } from "@/services/creatives";
import { planPrefs } from "@/services/planner";

/**
 * 01 · Design brief (5204:68087): what the artwork should achieve, the
 * message, the notes — saved as the campaign's ADX-design brief. The
 * backend's brief also wants a look and feel, so the three it knows are
 * offered under the notes; the notes themselves stay in this browser
 * until the brief carries a field for them.
 */
export function BriefForm({ campaign, save }: CreativeProps) {
    const router = useRouter();
    const existing = briefOf(campaign);
    const [objective, setObjective] = React.useState(existing?.objective ?? "");
    const [keyMessage, setKeyMessage] = React.useState(existing?.keyMessage ?? "");
    const [style, setStyle] = React.useState<DesignStyle>(existing?.style ?? "CLEAN_AND_MINIMAL");
    const [notes, setNotes] = React.useState(() => planPrefs.read(campaign.id).designNotes);
    const [busy, setBusy] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);

    const ready = objective.trim().length >= 2 && keyMessage.trim().length >= 2;

    const submit = async () => {
        if (!ready || busy) return;
        setBusy(true);
        setError(null);
        try {
            planPrefs.write(campaign.id, { designNotes: notes.trim() });
            await save({ creative: { creativePath: "ADX_DESIGN_AGENCY", creativeConfig: { objective: objective.trim().slice(0, 200), keyMessage: keyMessage.trim().slice(0, 500), style } } });
            router.push(creativeHref(campaign.id, "audience"));
        } catch (caught) {
            setError(messageOf(caught, "Could not save the brief."));
            setBusy(false);
        }
    };

    return (
        <>
            <TaskCard title="Design brief">
                <div className="space-y-6">
                    <LabeledInput label="Creative objective" value={objective} onChange={setObjective} placeholder="Introduce Aster Home’s festive collection." />
                    <LabeledTextarea label="Message or offer" value={keyMessage} onChange={setKeyMessage} rows={4} placeholder="Make room for celebration. Discover the festive collection, crafted for everyday living." />
                    <LabeledTextarea label="Design notes (optional)" value={notes} onChange={setNotes} rows={3} placeholder="Clean, minimal layout. Use the supplied logo and brand colours." />
                    <div>
                        <p className="text-sm font-medium text-ink">Look and feel</p>
                        <div className="mt-2 flex flex-wrap gap-3">
                            {STYLES.map((option) => (
                                <Chip key={option.id} label={option.title} on={style === option.id} onClick={() => setStyle(option.id)} />
                            ))}
                        </div>
                    </div>
                    <p className="text-xs text-dim">Design notes are kept with your plan in this browser and shown on the request; the brief ADX receives carries the objective, the message and the look and feel.</p>
                </div>
                {error && (
                    <div className="mt-4">
                        <InlineError message={error} />
                    </div>
                )}
            </TaskCard>
            <StepActions back={{ label: "Back", href: `/advertiser/campaigns/${encodeURIComponent(campaign.id)}/artwork` }} next={{ label: "Continue to audience", onClick: submit, disabled: !ready, busy }} />
        </>
    );
}
