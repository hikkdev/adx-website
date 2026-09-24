"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export interface FilterState {
    /** One of the rail's formats, or empty. */
    format: string;
    /** Weekly budget, rupees, as typed. */
    budgetMin: string;
    budgetMax: string;
    /** any · front · back · led */
    lit: string;
}

const LIT = [
    { value: "any", label: "Any" },
    { value: "front", label: "Front-lit" },
    { value: "back", label: "Back-lit" },
    { value: "led", label: "LED / Digital" },
];

/**
 * DR 12's filter rail (5204:49950): FORMAT, WEEKLY BUDGET, ILLUMINATION and
 * an Apply button. The rail edits a draft and applies it in one go, the way
 * the frame's button says; the browse read takes one format at a time, so
 * the format boxes are one choice.
 */
export function FilterRail({ value, formats, onApply }: { value: FilterState; formats: { key: string; label: string }[]; onApply: (next: FilterState) => void }) {
    /* Remounted by the parent's key whenever the URL changes, so the draft starts from the URL and never needs to sync. */
    const [draft, setDraft] = React.useState<FilterState>(value);

    return (
        <aside className="h-fit rounded-2xl border border-[#e9e9e6] bg-white p-6 shadow-card" aria-label="Filters">
            <p className="text-xs font-bold uppercase tracking-[0.8px] text-dim">Format</p>
            <ul className="mt-3 space-y-2">
                {formats.map((format) => {
                    const checked = draft.format === format.key;
                    return (
                        <li key={format.key}>
                            <label className="flex cursor-pointer items-center gap-3 py-1 text-sm text-ink">
                                <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={() => setDraft({ ...draft, format: checked ? "" : format.key })}
                                    className="size-[18px] rounded-[5px] border-[1.4px] border-[#c8c8c5] accent-brand"
                                />
                                {format.label}
                            </label>
                        </li>
                    );
                })}
            </ul>

            <p className="mt-8 text-xs font-bold uppercase tracking-[0.8px] text-dim">Weekly budget</p>
            <div className="mt-3 grid grid-cols-2 gap-4">
                <label className="flex h-11 items-center gap-1 rounded-[11px] border border-[#e9e9e6] px-3 text-sm text-ink">
                    ₹
                    <input
                        inputMode="numeric"
                        value={draft.budgetMin}
                        onChange={(e) => setDraft({ ...draft, budgetMin: e.target.value.replace(/[^\d]/g, "") })}
                        placeholder="2,000"
                        aria-label="Minimum weekly budget"
                        className="min-w-0 flex-1 bg-transparent focus:outline-none"
                    />
                </label>
                <label className="flex h-11 items-center gap-1 rounded-[11px] border border-[#e9e9e6] px-3 text-sm text-ink">
                    ₹
                    <input
                        inputMode="numeric"
                        value={draft.budgetMax}
                        onChange={(e) => setDraft({ ...draft, budgetMax: e.target.value.replace(/[^\d]/g, "") })}
                        placeholder="50,000"
                        aria-label="Maximum weekly budget"
                        className="min-w-0 flex-1 bg-transparent focus:outline-none"
                    />
                </label>
            </div>

            <p className="mt-8 text-xs font-bold uppercase tracking-[0.8px] text-dim">Illumination</p>
            <ul className="mt-3 space-y-2" role="radiogroup" aria-label="Illumination">
                {LIT.map((option) => (
                    <li key={option.value}>
                        <label className="flex cursor-pointer items-center gap-3 py-1 text-sm text-ink">
                            <input type="radio" name="lit" value={option.value} checked={draft.lit === option.value} onChange={() => setDraft({ ...draft, lit: option.value })} className="size-[18px] accent-brand" />
                            {option.label}
                        </label>
                    </li>
                ))}
            </ul>

            <button
                type="button"
                onClick={() => onApply(draft)}
                className={cn("mt-10 h-12 w-full rounded-[11px] bg-brand text-sm font-semibold text-white hover:bg-[#a51b1b]")}
            >
                Apply filters
            </button>
        </aside>
    );
}
