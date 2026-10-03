"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { ALL_STAGES, geoService, stageLabel, stageTone, type CityStage, type PickerCity } from "@/services/browse";

const TONE: Record<ReturnType<typeof stageTone>, string> = {
    success: "bg-success-soft text-success",
    info: "bg-info-soft text-info",
    warning: "bg-warning-soft text-warning",
    neutral: "bg-ground text-dim",
};

/** The pill beside a city — Live, Coming soon, Paused, Closed — the app's `stageLabel` in its tone. */
export function StagePill({ stage, className }: { stage: CityStage | string; className?: string }) {
    return <span className={cn("inline-flex h-5 shrink-0 items-center rounded-full px-2 text-[11px] font-semibold", TONE[stageTone(stage)], className)}>{stageLabel(stage)}</span>;
}

/**
 * A city box with the catalogue's cities under it as they are typed — the
 * app's city picker (`GET /app/geo/cities`), each with its stage pill, so
 * "Coming soon" is seen before it is searched. The catalogue read is public
 * (26 Sep 2026), so a visitor gets the suggestions too; free text stays
 * free (a town the catalogue has never heard of is still a search).
 */
export function CityField({
    value,
    onChange,
    onPick,
    placeholder = "City",
    className,
    inputClassName,
    icon,
    id,
}: {
    value: string;
    onChange: (value: string) => void;
    /** A suggestion chosen — the caller usually searches at once. */
    onPick?: (city: PickerCity) => void;
    placeholder?: string;
    className?: string;
    inputClassName?: string;
    icon?: React.ReactNode;
    id?: string;
}) {
    const [open, setOpen] = React.useState(false);
    const [rows, setRows] = React.useState<{ q: string; items: PickerCity[] } | null>(null);
    const listId = React.useId();
    const term = value.trim();
    const live = open && term.length >= 2;

    React.useEffect(() => {
        if (!live) return;
        let cancelled = false;
        const timer = window.setTimeout(() => {
            geoService
                .cities({ q: term, stages: ALL_STAGES, limit: 8 })
                .then((page) => {
                    if (!cancelled) setRows({ q: term, items: page.items });
                })
                .catch(() => {
                    if (!cancelled) setRows({ q: term, items: [] });
                });
        }, 250);
        return () => {
            cancelled = true;
            window.clearTimeout(timer);
        };
    }, [live, term]);

    const items = live && rows?.q === term ? rows.items : [];

    return (
        <div className={cn("relative", className)}>
            <label className="flex min-w-0 items-center gap-3">
                {icon}
                <input
                    id={id}
                    value={value}
                    onChange={(event) => {
                        onChange(event.target.value);
                        setOpen(true);
                    }}
                    onFocus={() => setOpen(true)}
                    onBlur={() => window.setTimeout(() => setOpen(false), 150)}
                    placeholder={placeholder}
                    aria-label="City"
                    aria-autocomplete="list"
                    aria-controls={items.length ? listId : undefined}
                    autoComplete="off"
                    className={cn("min-w-0 flex-1 bg-transparent text-sm font-medium text-ink placeholder:text-dim focus:outline-none", inputClassName)}
                />
            </label>
            {items.length > 0 && (
                <ul id={listId} role="listbox" className="absolute left-0 top-full z-30 mt-3 max-h-[320px] w-[300px] overflow-y-auto rounded-xl border border-line bg-white py-1.5 shadow-card">
                    {items.map((city) => (
                        <li key={city.slug} role="option" aria-selected={city.name.toLowerCase() === term.toLowerCase()}>
                            <button
                                type="button"
                                onMouseDown={(event) => event.preventDefault()}
                                onClick={() => {
                                    onChange(city.name);
                                    setOpen(false);
                                    onPick?.(city);
                                }}
                                className="flex w-full items-center justify-between gap-3 px-4 py-2 text-left hover:bg-ground"
                            >
                                <span className="min-w-0">
                                    <span className="block truncate text-sm font-medium text-ink">{city.name}</span>
                                    {city.state && <span className="block truncate text-xs text-dim">{city.state}</span>}
                                </span>
                                <StagePill stage={city.stage} />
                            </button>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
