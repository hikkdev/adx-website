"use client";

import * as React from "react";
import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { StagePill } from "@/components/site/city-field";
import { geoService, type PickerCity } from "@/services/browse";

export interface PickedCity {
    id: string;
    name: string;
}

/**
 * The catalogue's key for a city. The public picker answers the slug (the
 * catalogue's canonical key); an `id`, when a later read carries one, wins.
 */
export const cityKeyOf = (row: PickerCity & { id?: string | null }): string => (typeof row.id === "string" && row.id ? row.id : row.slug);

/**
 * LM-1: where the ad shows — everywhere (the default), or only on pages
 * seen in the cities picked here, searched from the catalogue
 * (`GET /app/geo/cities`).
 */
export function CityPicker({ value, onChange }: { value: PickedCity[]; onChange: (next: PickedCity[]) => void }) {
    const [mode, setMode] = React.useState<"ALL" | "SOME">(value.length > 0 ? "SOME" : "ALL");
    const [term, setTerm] = React.useState("");
    const [rows, setRows] = React.useState<{ q: string; items: PickerCity[] } | null>(null);
    const q = term.trim();

    React.useEffect(() => {
        if (mode !== "SOME") return;
        let cancelled = false;
        const timer = window.setTimeout(() => {
            geoService
                .cities({ q: q || undefined, limit: 8 })
                .then((page) => !cancelled && setRows({ q, items: page.items ?? [] }))
                .catch(() => !cancelled && setRows({ q, items: [] }));
        }, q ? 250 : 0);
        return () => {
            cancelled = true;
            window.clearTimeout(timer);
        };
    }, [mode, q]);

    const chosen = new Set(value.map((city) => city.id));
    const items = rows?.q === q ? rows.items : null;
    const choose = (next: "ALL" | "SOME") => {
        setMode(next);
        if (next === "ALL") onChange([]);
    };

    return (
        <div data-testid="city-picker">
            <div role="radiogroup" aria-label="Where it shows" className="grid gap-3 sm:grid-cols-2">
                {(
                    [
                        { key: "ALL", title: "Everywhere", line: "Every city the page is seen in." },
                        { key: "SOME", title: "Chosen cities", line: "Only pages seen in the cities you pick." },
                    ] as const
                ).map((option) => (
                    <button
                        key={option.key}
                        type="button"
                        role="radio"
                        aria-checked={mode === option.key}
                        onClick={() => choose(option.key)}
                        className={cn("flex h-full items-start gap-3 rounded-lg border bg-white p-4 text-left", mode === option.key ? "border-brand bg-brand-soft/40" : "border-line hover:border-ink")}
                    >
                        <span className={cn("mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border", mode === option.key ? "border-brand" : "border-line")} aria-hidden>
                            {mode === option.key && <span className="size-2 rounded-full bg-brand" />}
                        </span>
                        <span>
                            <span className="block text-sm font-semibold text-ink">{option.title}</span>
                            <span className="block text-xs text-dim">{option.line}</span>
                        </span>
                    </button>
                ))}
            </div>
            {mode === "SOME" && (
                <div className="mt-4">
                    {value.length > 0 && (
                        <ul className="mb-3 flex flex-wrap gap-2" aria-label="Chosen cities">
                            {value.map((city) => (
                                <li key={city.id} className="inline-flex h-8 items-center gap-1 rounded-full bg-ground pl-3 pr-1 text-sm text-ink">
                                    {city.name}
                                    <button type="button" onClick={() => onChange(value.filter((row) => row.id !== city.id))} aria-label={`Remove ${city.name}`} className="flex size-6 items-center justify-center rounded-full hover:bg-white">
                                        <X className="size-3.5" aria-hidden />
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                    <label className="relative block">
                        <span className="sr-only">Search cities</span>
                        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-dim" aria-hidden />
                        <input value={term} onChange={(event) => setTerm(event.target.value)} placeholder="Search a city" className="h-11 w-full rounded-md border border-line bg-white pl-9 pr-3 text-sm text-ink placeholder:text-dim focus:border-ink focus:outline-none" />
                    </label>
                    <ul className="mt-2 max-h-[240px] divide-y divide-line overflow-y-auto rounded-md border border-line bg-white" aria-label="Cities">
                        {items === null ? (
                            <li className="px-3 py-2.5 text-sm text-dim">Reading the cities…</li>
                        ) : items.length === 0 ? (
                            <li className="px-3 py-2.5 text-sm text-dim">{q ? "No city by that name." : "No cities to show."}</li>
                        ) : (
                            items.map((row) => {
                                const id = cityKeyOf(row);
                                const on = chosen.has(id);
                                return (
                                    <li key={id}>
                                        <label className="flex cursor-pointer items-center gap-3 px-3 py-2.5 text-sm hover:bg-ground">
                                            <input type="checkbox" checked={on} onChange={() => onChange(on ? value.filter((city) => city.id !== id) : [...value, { id, name: row.name }])} className="size-4 accent-[#bd2020]" />
                                            <span className="min-w-0 flex-1 text-ink">
                                                {row.name}
                                                {row.state && <span className="text-dim"> · {row.state}</span>}
                                            </span>
                                            <StagePill stage={row.stage} />
                                        </label>
                                    </li>
                                );
                            })
                        )}
                    </ul>
                    {value.length === 0 && <p className="mt-2 text-xs text-dim">With no city ticked, the ad shows everywhere.</p>}
                </div>
            )}
        </div>
    );
}
