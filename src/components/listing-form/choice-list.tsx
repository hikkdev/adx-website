"use client";

import * as React from "react";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { InfoDot } from "./fields";

export interface ChoiceOption {
    id: string;
    title: string;
    description?: string | null;
    group?: string | null;
}

/** Lists at or past this length get a search box above them (5204:76701, 5204:77384). */
export const SEARCH_FROM = 8;

/**
 * The radio-card list the first chapter draws: one bordered row per option
 * with the dot, the title, the one-line description and the ⓘ; the chosen
 * row outlined in red. A long list gets the search box; a grouped list
 * (spot types under their catalogue headings) prints the headings.
 */
export function ChoiceList({
    options,
    value,
    onChange,
    searchPlaceholder = "Search",
    emptyLabel = "Nothing to choose from yet.",
    forceSearch,
}: {
    options: ChoiceOption[];
    value: string | null;
    onChange: (id: string) => void;
    searchPlaceholder?: string;
    emptyLabel?: string;
    forceSearch?: boolean;
}) {
    const [query, setQuery] = React.useState("");
    const searchable = forceSearch ?? options.length >= SEARCH_FROM;
    const q = query.trim().toLowerCase();
    const shown = q ? options.filter((o) => o.id === value || o.title.toLowerCase().includes(q) || (o.description ?? "").toLowerCase().includes(q) || (o.group ?? "").toLowerCase().includes(q)) : options;
    const groups = new Map<string, ChoiceOption[]>();
    for (const option of shown) {
        const key = option.group ?? "";
        const bucket = groups.get(key);
        if (bucket) bucket.push(option);
        else groups.set(key, [option]);
    }
    const grouped = groups.size > 1 || (groups.size === 1 && !groups.has(""));

    if (options.length === 0) return <p className="rounded-md border border-line bg-ground px-4 py-3 text-sm text-dim">{emptyLabel}</p>;

    return (
        <div className="space-y-4" role="radiogroup">
            {searchable && (
                <label className="flex h-[34px] items-center gap-2.5 rounded-md border border-ink bg-white px-3">
                    <Search className="size-4 text-dim" aria-hidden />
                    <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={searchPlaceholder} aria-label={searchPlaceholder} className="min-w-0 flex-1 bg-transparent text-sm text-ink placeholder:text-dim focus:outline-none" />
                </label>
            )}
            {searchable && q && shown.length === 0 && <p className="text-sm text-dim">Nothing matches "{query.trim()}".</p>}
            {[...groups.entries()].map(([group, items]) => (
                <div key={group || "all"} className="space-y-4">
                    {grouped && group && <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-dim">{group}</p>}
                    {items.map((option) => {
                        const selected = option.id === value;
                        return (
                            <button
                                key={option.id}
                                type="button"
                                role="radio"
                                aria-checked={selected}
                                onClick={() => onChange(option.id)}
                                className={cn("flex min-h-14 w-full items-center gap-3 rounded-md border bg-white px-3.5 py-2.5 text-left transition-colors hover:border-ink", selected ? "border-brand-bright" : "border-line")}
                            >
                                <span className={cn("flex size-4 shrink-0 items-center justify-center rounded-full border-[1.5px]", selected ? "border-brand-bright" : "border-line")}>{selected && <span className="size-2 rounded-full bg-brand-bright" />}</span>
                                <span className="min-w-0 flex-1">
                                    <span className="block text-sm font-semibold leading-5 text-ink">{option.title}</span>
                                    {option.description && <span className="block text-xs leading-4 text-dim">{option.description}</span>}
                                </span>
                                <InfoDot active={selected} title={option.description ?? undefined} />
                            </button>
                        );
                    })}
                </div>
            ))}
        </div>
    );
}
