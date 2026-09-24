"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ChoiceRow, ChoiceTile, Chip, DateField, DayChip, LabeledInput, Notice } from "@/components/planner/fields";
import { InlineError, StepActions, TaskCard } from "@/components/planner/planner-shell";
import type { StepProps } from "@/components/planner/planner-step";
import { messageOf } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import {
    DAYPARTS,
    DAYS,
    EVENT_TYPES,
    formatDateRange,
    isoDate,
    isoToday,
    plannerHref,
    STEP_META,
    TRIGGERS,
    WEATHER_CONDITIONS,
    WEATHER_RESPONSES,
    type CampaignPatch,
    type CampaignTriggerType,
} from "@/services/planner";

const RECORDED_ONLY = "Triggers are recorded on the brief and printed on the order. Nothing switches a hoarding on and off automatically — that needs programmable inventory.";

/** 05 · External triggers (5204:71149): none, weather, time of day or an event, with the detail the choice needs. */
export function TriggersStep({ campaign, save }: StepProps) {
    const router = useRouter();
    const config = (campaign.triggerConfig ?? {}) as Record<string, unknown>;
    const [trigger, setTrigger] = React.useState<CampaignTriggerType>(campaign.triggerType ?? "NONE");
    const [conditions, setConditions] = React.useState<string[]>(Array.isArray(config.conditions) ? (config.conditions as string[]) : ["RAIN_OR_DRIZZLE"]);
    const [response, setResponse] = React.useState<string>(typeof config.response === "string" ? config.response : "BOOST");
    const [slots, setSlots] = React.useState<string[]>(Array.isArray(config.slots) ? (config.slots as string[]) : ["EVENING"]);
    const [days, setDays] = React.useState<string[]>(Array.isArray(config.days) ? (config.days as string[]) : ["FRI", "SAT", "SUN"]);
    const [eventName, setEventName] = React.useState<string>(typeof config.eventName === "string" ? config.eventName : "");
    const [startsAt, setStartsAt] = React.useState<string>(isoDate(typeof config.startsAt === "string" ? config.startsAt : campaign.startDate) || isoToday(3));
    const [endsAt, setEndsAt] = React.useState<string>(isoDate(typeof config.endsAt === "string" ? config.endsAt : campaign.endDate) || isoToday(10));
    const [eventType, setEventType] = React.useState<string>(typeof config.eventType === "string" ? config.eventType : "FESTIVAL");
    const [busy, setBusy] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);

    const toggle = (list: string[], value: string) => (list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);

    const ready =
        trigger === "NONE" ||
        (trigger === "WEATHER" && conditions.length > 0) ||
        (trigger === "TIME_OF_DAY" && slots.length > 0) ||
        (trigger === "EVENT" && eventName.trim().length >= 2 && startsAt <= endsAt);

    const patchFor = (): CampaignPatch["trigger"] => {
        if (trigger === "WEATHER") return { triggerType: "WEATHER", triggerConfig: { conditions, response } };
        if (trigger === "TIME_OF_DAY") return { triggerType: "TIME_OF_DAY", triggerConfig: { slots, days } };
        if (trigger === "EVENT") return { triggerType: "EVENT", triggerConfig: { eventName: eventName.trim(), startsAt, endsAt, eventType } };
        return { triggerType: "NONE" };
    };

    const submit = async () => {
        if (!ready || busy) return;
        setBusy(true);
        setError(null);
        try {
            await save({ trigger: patchFor(), step: STEP_META.triggers.appStep });
            router.push(plannerHref(campaign.id, "budget"));
        } catch (caught) {
            setError(messageOf(caught, "Could not save the trigger."));
            setBusy(false);
        }
    };

    const basis = campaign.triggers?.basis ?? RECORDED_ONLY;

    return (
        <>
            <TaskCard title="Delivery triggers" intro="Choose a requirement for programmable placements. Fixed billboards do not change delivery with weather or time of day.">
                <div role="radiogroup" aria-label="Delivery trigger" className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                    {TRIGGERS.map((option) => (
                        <ChoiceTile key={option.id} title={option.title} selected={trigger === option.id} onSelect={() => setTrigger(option.id)} />
                    ))}
                </div>

                {trigger === "NONE" && (
                    <Notice title="No trigger requirements" className="mt-6">
                        Continue with suitable spaces that run for your selected campaign dates.
                    </Notice>
                )}

                {trigger === "WEATHER" && (
                    <div className="mt-6 rounded-lg bg-ground px-5 py-5">
                        <p className="text-base font-semibold text-ink">Weather conditions</p>
                        <p className="mt-2 text-sm text-dim">Choose the weather that should change delivery on programmable placements.</p>
                        <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                            {WEATHER_CONDITIONS.map((condition) => (
                                <ChoiceRow key={condition.id} title={condition.title} selected={conditions.includes(condition.id)} onSelect={() => setConditions((c) => toggle(c, condition.id))} compact />
                            ))}
                        </div>
                        <p className="mt-5 text-sm font-medium text-ink">When it happens</p>
                        <div role="radiogroup" aria-label="Weather response" className="mt-2 space-y-2">
                            {WEATHER_RESPONSES.filter((r) => r.id !== "ACTIVATE" || response === "ACTIVATE").map((option) => (
                                <ChoiceRow key={option.id} title={option.title} description={option.description} selected={response === option.id} onSelect={() => setResponse(option.id)} />
                            ))}
                        </div>
                        <p className="mt-4 text-xs text-dim">{basis}</p>
                    </div>
                )}

                {trigger === "TIME_OF_DAY" && (
                    <div className="mt-6 rounded-lg bg-ground px-5 py-5">
                        <p className="text-base font-semibold text-ink">Active hours</p>
                        <p className="mt-2 text-sm text-dim">Choose when programmable placements should run each day.</p>
                        <p className="mt-4 text-sm font-medium text-ink">Time slots</p>
                        <div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                            {DAYPARTS.map((part) => (
                                <ChoiceRow key={part.id} title={part.title} selected={slots.includes(part.id)} onSelect={() => setSlots((s) => toggle(s, part.id))} compact />
                            ))}
                        </div>
                        <p className="mt-4 text-sm font-medium text-ink">Days</p>
                        <div className="mt-2 flex flex-wrap gap-2">
                            {DAYS.map((day) => (
                                <DayChip key={day.id} label={day.title} on={days.includes(day.id)} onClick={() => setDays((d) => toggle(d, day.id))} />
                            ))}
                        </div>
                        <div className="mt-4 rounded-lg border border-line bg-white px-4 py-4 text-sm">
                            <p className="text-ink">
                                <span className="text-dim">Requested schedule · </span>
                                {slots.length ? DAYPARTS.filter((p) => slots.includes(p.id)).map((p) => p.title).join(", ") : "No slots chosen"}
                            </p>
                            <p className="mt-1.5 text-ink">
                                <span className="text-dim">Days · </span>
                                {days.length === 0 || days.length === 7 ? "Every day" : DAYS.filter((d) => days.includes(d.id)).map((d) => d.title).join(", ")}
                            </p>
                            <p className="mt-1.5 text-dim">Applies to programmable screens only; static faces run all day.</p>
                        </div>
                        <p className="mt-4 text-xs text-dim">{basis}</p>
                    </div>
                )}

                {trigger === "EVENT" && (
                    <div className="mt-6 rounded-lg bg-ground px-5 py-5">
                        <p className="text-base font-semibold text-ink">Holiday or event</p>
                        <p className="mt-2 text-sm text-dim">Line the campaign up with a date in the calendar.</p>
                        <div className="mt-4 grid gap-4 md:grid-cols-2">
                            <LabeledInput label="Event name" value={eventName} onChange={setEventName} placeholder="Festive collection launch" />
                            <div>
                                <p className="mb-2 text-sm font-medium text-ink">Event dates</p>
                                <div className="grid grid-cols-2 gap-2">
                                    <DateField label="From" value={startsAt} onChange={(iso) => { setStartsAt(iso); if (iso > endsAt) setEndsAt(iso); }} native />
                                    <DateField label="To" value={endsAt} onChange={setEndsAt} min={startsAt} native />
                                </div>
                                <p className="mt-2 text-sm text-dim">{formatDateRange(startsAt, endsAt)}</p>
                            </div>
                        </div>
                        <p className="mt-4 text-sm font-medium text-ink">Event type</p>
                        <div role="radiogroup" aria-label="Event type" className="mt-2 space-y-2">
                            {EVENT_TYPES.filter((t) => ["HOLIDAY", "SPORTS", "FESTIVAL"].includes(t.id) || eventType === t.id).map((type) => (
                                <ChoiceRow key={type.id} title={type.title} selected={eventType === type.id} onSelect={() => setEventType(type.id)} />
                            ))}
                        </div>
                        <div className="mt-3 flex gap-2">
                            {EVENT_TYPES.filter((t) => !["HOLIDAY", "SPORTS", "FESTIVAL"].includes(t.id) && eventType !== t.id).map((type) => (
                                <Chip key={type.id} label={type.title} on={false} onClick={() => setEventType(type.id)} className={cn("h-9")} />
                            ))}
                        </div>
                        <p className="mt-4 text-xs text-dim">{basis}</p>
                    </div>
                )}

                {error && (
                    <div className="mt-4">
                        <InlineError message={error} />
                    </div>
                )}
            </TaskCard>
            <StepActions back={{ label: "Back", href: plannerHref(campaign.id, "location") }} next={{ label: STEP_META.triggers.continueLabel, onClick: submit, disabled: !ready, busy }} />
        </>
    );
}
