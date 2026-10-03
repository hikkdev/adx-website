"use client";

import * as React from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { PLACEMENT_MEANING, perDayLabel, type BoostPlacement, type BoostPlacementInfo } from "@/services/promotions";

/**
 * LM-1: the placements a publisher can sponsor a listing in, as checkbox
 * cards — what each one means, its price per day and its shortest run.
 * Both cards are the same height (form symmetry): the meaning sits in the
 * card's body, the price and the minimum on one line at its foot.
 */
export function PlacementPicker({ placements, value, onChange, disabled }: { placements: BoostPlacementInfo[]; value: BoostPlacement[]; onChange: (next: BoostPlacement[]) => void; disabled?: boolean }) {
    const toggle = (placement: BoostPlacement) => onChange(value.includes(placement) ? value.filter((row) => row !== placement) : [...value, placement]);
    return (
        <fieldset className="grid gap-4 md:grid-cols-2" disabled={disabled}>
            <legend className="sr-only">Where your listing is shown first</legend>
            {placements.map((row) => {
                const checked = value.includes(row.placement);
                const meaning = PLACEMENT_MEANING[row.placement] ?? { title: row.label, line: "" };
                return (
                    <label
                        key={row.placement}
                        data-testid={`placement-${row.placement}`}
                        className={cn(
                            "flex h-full cursor-pointer flex-col rounded-lg border bg-white p-4 transition-colors",
                            checked ? "border-brand-bright bg-[#fff7f7]" : "border-line hover:border-dim",
                            disabled && "cursor-not-allowed opacity-60"
                        )}
                    >
                        <span className="flex items-start gap-3">
                            <input type="checkbox" className="peer sr-only" checked={checked} onChange={() => toggle(row.placement)} disabled={disabled} />
                            <span aria-hidden className={cn("mt-0.5 flex size-[18px] shrink-0 items-center justify-center rounded border-2 peer-focus-visible:ring-2 peer-focus-visible:ring-ink", checked ? "border-brand-bright bg-brand-bright text-white" : "border-line")}>
                                {checked && <Check className="size-3" strokeWidth={3} />}
                            </span>
                            <span className="min-w-0">
                                <span className="block text-sm font-semibold text-ink">{meaning.title}</span>
                                <span className="mt-1 block text-sm text-dim">{meaning.line}</span>
                            </span>
                        </span>
                        <span className="mt-auto flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 pl-[30px] pt-4">
                            <span className="whitespace-nowrap text-sm font-semibold tabular-nums text-ink">{perDayLabel(row.ratePerDay)} + GST</span>
                            <span className="whitespace-nowrap text-xs text-dim">
                                At least {row.minDays} day{row.minDays === 1 ? "" : "s"}
                            </span>
                        </span>
                    </label>
                );
            })}
        </fieldset>
    );
}
