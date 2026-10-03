"use client";

import * as React from "react";
import { usePuck } from "@puckeditor/core";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { CITY_STAGES, ENVELOPE_KEY, SIDE_LABEL, STAGE_LABEL, isAppSurface, pinnedFor, sidesFor, type BlockEnvelope, type CityStage, type Side } from "@/services/studio";
import { CityPick } from "./field-widgets";
import { useStudioLookups } from "./lookups";

/**
 * ST-1: "Who sees this" — the selected block's envelope: the sides, the
 * cities and the city stages it shows to, the window it runs in, and
 * whether it is hidden. The envelope rides inside the Puck item's props
 * under `ENVELOPE_KEY`, so it survives a move, a duplicate and an undo;
 * this panel writes it back through Puck's `replace` action, which is
 * what makes the change part of the autosave and the history.
 */

const pad = (n: number) => String(n).padStart(2, "0");

/** An ISO instant as a `datetime-local` value, in the browser's zone. */
export function toLocalInput(iso: string | undefined): string {
    if (!iso) return "";
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return "";
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** A `datetime-local` value as the ISO instant the API wants (with an offset — `Z`). */
export function fromLocalInput(local: string): string | undefined {
    if (!local) return undefined;
    const date = new Date(local);
    return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

const WEB_SIDES: readonly Side[] = ["VISITOR", "ADVERTISER", "PUBLISHER"];

export function EnvelopePanel() {
    const { selectedItem, getSelectorForId, dispatch } = usePuck();
    const { surface, types, readOnly } = useStudioLookups();

    if (!selectedItem) {
        return (
            <p className="px-4 py-6 text-sm text-dim" data-testid="envelope-empty">
                Select a block on the canvas to say who sees it, and when.
            </p>
        );
    }

    const id = String(selectedItem.props.id);
    const props = selectedItem.props as Record<string, unknown>;
    const env = (props[ENVELOPE_KEY] ?? {}) as BlockEnvelope;
    const pinned = pinnedFor(surface).includes(selectedItem.type);
    const label = types.get(selectedItem.type)?.label ?? selectedItem.type;
    const sides = surface && isAppSurface(surface) ? sidesFor(surface) : WEB_SIDES;
    const disabled = readOnly || pinned;

    const update = (next: BlockEnvelope) => {
        const selector = getSelectorForId(id);
        if (!selector) return;
        dispatch({ type: "replace", destinationIndex: selector.index, destinationZone: selector.zone, data: { ...selectedItem, props: { ...selectedItem.props, [ENVELOPE_KEY]: next } } });
    };
    const visibility = env.visibility ?? {};
    const setVisibility = (patch: Partial<NonNullable<BlockEnvelope["visibility"]>>) => update({ ...env, visibility: { ...visibility, ...patch } });
    const schedule = env.schedule ?? {};
    const setSchedule = (patch: Partial<NonNullable<BlockEnvelope["schedule"]>>) => update({ ...env, schedule: { ...schedule, ...patch } });

    const toggle = <T extends string>(list: T[] | undefined, value: T): T[] => (list?.includes(value) ? list.filter((item) => item !== value) : [...(list ?? []), value]);

    return (
        <div className="space-y-5 px-4 py-4" data-testid="envelope-panel">
            <div>
                <p className="text-sm font-semibold text-ink">{label}</p>
                <p className="text-xs text-dim">Everyone, everywhere, always — unless narrowed below.</p>
                {pinned && <p className="mt-2 rounded-md bg-paper px-2.5 py-1.5 text-xs text-ink">This block is always shown to everyone, and always last.</p>}
            </div>

            <fieldset className="space-y-1.5" disabled={disabled}>
                <legend className="mb-1 text-xs font-medium uppercase tracking-wide text-dim">Sides</legend>
                {sides.map((side) => (
                    <label key={side} className="flex items-center gap-2 text-sm text-ink">
                        <input type="checkbox" className="size-4 accent-brand" checked={visibility.sides?.includes(side) ?? false} onChange={() => setVisibility({ sides: toggle(visibility.sides, side) })} />
                        {SIDE_LABEL[side]}
                    </label>
                ))}
                <p className="text-[11px] text-dim">None ticked means every side.</p>
            </fieldset>

            <div className="space-y-1.5">
                <p className="text-xs font-medium uppercase tracking-wide text-dim">Cities</p>
                <CityPick value={visibility.cityIds ?? []} onChange={(cityIds) => setVisibility({ cityIds })} readOnly={disabled} />
                <p className="text-[11px] text-dim">None means every city, and viewers whose city is unknown.</p>
            </div>

            <fieldset className="space-y-1.5" disabled={disabled}>
                <legend className="mb-1 text-xs font-medium uppercase tracking-wide text-dim">City stages</legend>
                {CITY_STAGES.map((stage) => (
                    <label key={stage} className="flex items-center gap-2 text-sm text-ink">
                        <input type="checkbox" className="size-4 accent-brand" checked={visibility.stages?.includes(stage) ?? false} onChange={() => setVisibility({ stages: toggle<CityStage>(visibility.stages, stage) })} />
                        {STAGE_LABEL[stage]}
                    </label>
                ))}
            </fieldset>

            <div className="space-y-2">
                <p className="text-xs font-medium uppercase tracking-wide text-dim">Schedule</p>
                <div className="space-y-1">
                    <Label htmlFor="studio-starts" className="text-xs">
                        Starts
                    </Label>
                    <input id="studio-starts" type="datetime-local" disabled={disabled} value={toLocalInput(schedule.startsAt)} onChange={(event) => setSchedule({ startsAt: fromLocalInput(event.target.value) })} className="h-9 w-full rounded-md border border-line bg-white px-2 text-sm" />
                </div>
                <div className="space-y-1">
                    <Label htmlFor="studio-ends" className="text-xs">
                        Ends
                    </Label>
                    <input id="studio-ends" type="datetime-local" disabled={disabled} value={toLocalInput(schedule.endsAt)} onChange={(event) => setSchedule({ endsAt: fromLocalInput(event.target.value) })} className="h-9 w-full rounded-md border border-line bg-white px-2 text-sm" />
                </div>
                <p className="text-[11px] text-dim">Empty means no start or no end.</p>
            </div>

            <div className="flex items-center justify-between gap-3 rounded-md border border-line bg-white px-3 py-2">
                <div>
                    <p className="text-sm text-ink">Hidden</p>
                    <p className="text-[11px] text-dim">Kept in the layout, drawn for nobody.</p>
                </div>
                <Switch checked={!!env.hidden} disabled={disabled} onCheckedChange={(hidden) => update({ ...env, hidden })} aria-label="Hidden" />
            </div>
        </div>
    );
}
