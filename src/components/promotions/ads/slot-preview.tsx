"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { perDayLabel, specSize, type AdSlotInfo, type MediaSpec } from "@/services/promotions";
import { previewOf, slotSpec, surfacesLabel, type PreviewPage, type PreviewPosition } from "./ad-helpers";

/**
 * LM-1: a small drawing of the page an ad slot is on, with the slot's place
 * in brand — the listing page's sidebar, a strip across a page, a tile in a
 * grid, or the same on a phone. A sketch, not the page: it answers "where
 * will people see it" before the buyer reads the description.
 */
export function SlotPreview({ slot, className }: { slot: Pick<AdSlotInfo, "surfaces" | "spec" | "label">; className?: string }) {
    const { page, position } = previewOf(slot);
    const where = `${surfacesLabel(slot.surfaces)} — ${position === "SIDEBAR" ? "in the sidebar" : position === "BANNER" ? "a strip across the page" : "a tile among the sections"}`;
    return (
        <div role="img" aria-label={`Where it shows: ${where}`} data-testid="slot-preview" data-page={page} data-position={position} className={cn("flex items-center justify-center rounded-md bg-ground p-3", className)}>
            {page === "APP" ? <PhoneSketch position={position} /> : <PageSketch page={page} position={position} />}
        </div>
    );
}

const bar = "rounded-sm bg-line";

function AdMark({ className }: { className?: string }) {
    return (
        <div className={cn("relative flex items-center justify-center rounded-sm bg-brand/85 ring-2 ring-brand", className)} data-testid="slot-preview-ad">
            <span className="rounded-[2px] bg-white px-1 text-[7px] font-bold leading-[10px] text-brand">Ad</span>
        </div>
    );
}

function PageSketch({ page, position }: { page: PreviewPage; position: PreviewPosition }) {
    return (
        <div className="w-full max-w-[220px] overflow-hidden rounded-sm border border-line bg-white" aria-hidden>
            <div className="flex items-center gap-1 border-b border-line px-1.5 py-1">
                <span className="size-1 rounded-full bg-line" />
                <span className="size-1 rounded-full bg-line" />
                <span className="size-1 rounded-full bg-line" />
                <span className={cn(bar, "ml-1 h-1.5 w-10")} />
            </div>
            <div className="space-y-1.5 p-1.5">
                {position === "BANNER" && page !== "LISTING" && <AdMark className="h-4 w-full" />}
                <div className="flex gap-1.5">
                    <div className="min-w-0 flex-1 space-y-1">
                        <div className="h-10 rounded-sm bg-ground" />
                        {position === "BANNER" && page === "LISTING" && <AdMark className="h-4 w-full" />}
                        <div className={cn(bar, "h-1.5 w-3/4")} />
                        <div className={cn(bar, "h-1.5 w-1/2")} />
                        <div className="grid grid-cols-3 gap-1 pt-0.5">
                            <div className="h-5 rounded-sm bg-ground" />
                            {position === "TILE" ? <AdMark className="h-5" /> : <div className="h-5 rounded-sm bg-ground" />}
                            <div className="h-5 rounded-sm bg-ground" />
                        </div>
                    </div>
                    {page === "LISTING" && (
                        <div className="w-[34%] shrink-0 space-y-1">
                            <div className="space-y-0.5 rounded-sm border border-line p-1">
                                <div className={cn(bar, "h-1.5 w-2/3")} />
                                <div className="h-2.5 rounded-sm bg-ink/70" />
                            </div>
                            {position === "SIDEBAR" ? <AdMark className="h-[30px]" /> : <div className="h-[30px] rounded-sm bg-ground" />}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

function PhoneSketch({ position }: { position: PreviewPosition }) {
    return (
        <div className="w-[76px] overflow-hidden rounded-[10px] border-2 border-ink/70 bg-white p-1" aria-hidden>
            <div className="mx-auto mb-1 h-1 w-5 rounded-full bg-line" />
            <div className="space-y-1">
                <div className={cn(bar, "h-1.5 w-2/3")} />
                <div className="h-6 rounded-sm bg-ground" />
                {position === "BANNER" ? <AdMark className="h-4 w-full" /> : null}
                <div className="grid grid-cols-2 gap-1">
                    {position === "TILE" ? <AdMark className="h-6" /> : <div className="h-6 rounded-sm bg-ground" />}
                    <div className="h-6 rounded-sm bg-ground" />
                </div>
                <div className="h-4 rounded-sm bg-ground" />
            </div>
        </div>
    );
}

/**
 * One slot as a choice: the preview, the label and what it is, where it
 * shows, the artwork size, the rate and the shortest run.
 */
export function SlotCard({ slot, specs, checked, onSelect }: { slot: AdSlotInfo; specs: MediaSpec[] | null; checked: boolean; onSelect: () => void }) {
    const spec = slotSpec(slot, specs);
    return (
        <button
            type="button"
            role="radio"
            aria-checked={checked}
            onClick={onSelect}
            data-testid={`slot-${slot.key}`}
            className={cn("flex h-full w-full flex-col gap-3 rounded-lg border bg-white p-4 text-left transition-colors", checked ? "border-brand bg-brand-soft/40 ring-1 ring-brand" : "border-line hover:border-ink")}
        >
            <SlotPreview slot={slot} className="min-h-[120px] w-full" />
            <div className="flex items-start justify-between gap-3">
                <p className="text-sm font-semibold text-ink">{slot.label}</p>
                <span className="shrink-0 text-sm font-semibold tabular-nums text-ink">{perDayLabel(slot.ratePerDay)}</span>
            </div>
            {slot.description && <p className="text-xs text-dim">{slot.description}</p>}
            <dl className="mt-auto grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                <dt className="text-dim">Shows on</dt>
                <dd className="text-right text-ink">{surfacesLabel(slot.surfaces)}</dd>
                <dt className="text-dim">Artwork</dt>
                <dd className="text-right text-ink">{spec ? specSize(spec) : slot.spec}</dd>
                <dt className="text-dim">Shortest run</dt>
                <dd className="text-right text-ink">
                    {Math.max(1, slot.minDays)} day{Math.max(1, slot.minDays) === 1 ? "" : "s"}
                </dd>
                <dt className="text-dim">Ads at once</dt>
                <dd className="text-right text-ink">Up to {slot.maxConcurrent}, rotating</dd>
            </dl>
        </button>
    );
}
