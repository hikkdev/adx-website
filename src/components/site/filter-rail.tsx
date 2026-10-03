"use client";

import * as React from "react";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { BROWSE_CATEGORIES, CATEGORY_LABEL, FOOTFALL_OPTIONS, INSTANT_OFF_REASON, PRICE_BANDS, priceBandOf, spacesCount, type CategoryTile, type VenueTile } from "@/services/browse";

/** The drawer's facets, as the URL carries them. */
export interface FilterState {
    category: string;
    venueTypeId: string;
    display: string;
    /** Rupees per day, as typed. */
    minRate: string;
    maxRate: string;
    minFootfall: string;
    lit: boolean;
    instant: boolean;
}

const DISPLAYS = [
    { value: "", label: "Any type" },
    { value: "DIGITAL", label: "Digital" },
    { value: "STATIC", label: "Static" },
];

const same = (a: FilterState, b: FilterState) => (Object.keys(a) as (keyof FilterState)[]).every((key) => a[key] === b[key]);

/**
 * DR 12's filter rail (5204:49950), holding the app's filter drawer
 * (4189:2440) section for section: category and sub-category (the venue
 * types, counted for the place), type of display, price per day — the
 * listing's own unit, as the app's slider and bands are — daily footfall,
 * illuminated at night, and instant booking while its switch is on. The
 * rail edits a draft; "Show N spaces" counts what the draft would find
 * (the browse's total, asked a beat after the last change) and applies it.
 *
 * Illumination is one switch, as in the app: the browse filters lit or
 * not, and a front-lit / back-lit choice it cannot honour would find the
 * same spaces under two names.
 */
export function FilterRail({
    value,
    categories,
    venues,
    instantOn,
    instantNote,
    currentTotal,
    countFor,
    onApply,
}: {
    value: FilterState;
    categories: CategoryTile[] | null;
    venues: VenueTile[];
    /** The instant-booking flag: the switch is drawn only while it is on. */
    instantOn: boolean;
    /** Signed in with the flag read and off — say why there is no switch, as the app's drawer does. */
    instantNote: boolean;
    /** The page's own total, for the button while the draft is the URL. */
    currentTotal: number | null;
    countFor: (draft: FilterState) => Promise<number>;
    onApply: (next: FilterState) => void;
}) {
    /* Remounted by the parent's key whenever the URL changes, so the draft starts from the URL and never needs to sync. */
    const [draft, setDraft] = React.useState<FilterState>(value);
    const [preview, setPreview] = React.useState<{ key: string; count: number | null } | null>(null);
    const dirty = !same(draft, value);
    const draftKey = JSON.stringify(draft);

    React.useEffect(() => {
        if (!dirty) return;
        let cancelled = false;
        const timer = window.setTimeout(() => {
            countFor(JSON.parse(draftKey) as FilterState)
                .then((count) => !cancelled && setPreview({ key: draftKey, count }))
                .catch(() => !cancelled && setPreview({ key: draftKey, count: null }));
        }, 300);
        return () => {
            cancelled = true;
            window.clearTimeout(timer);
        };
    }, [dirty, draftKey, countFor]);

    const count = dirty ? (preview?.key === draftKey ? preview.count : undefined) : currentTotal;
    const set = (patch: Partial<FilterState>) => setDraft((current) => ({ ...current, ...patch }));
    const ownVenues = venues.filter((venue) => !draft.category || venue.category === draft.category);
    const band = priceBandOf({ minRate: draft.minRate, maxRate: draft.maxRate });

    return (
        <aside className="h-fit rounded-2xl border border-[#e9e9e6] bg-white p-6 shadow-card" aria-label="Filters">
            <Heading>Category</Heading>
            <ul className="mt-3 space-y-1" role="radiogroup" aria-label="Category">
                <li>
                    <Radio name="category" checked={!draft.category} onChange={() => set({ category: "", venueTypeId: "" })} label="Any category" />
                </li>
                {(categories ?? BROWSE_CATEGORIES.map((category): CategoryTile => ({ category, count: -1, photoUrl: null }))).map((tile) => (
                    <li key={tile.category}>
                        <Radio
                            name="category"
                            checked={draft.category === tile.category}
                            onChange={() => set({ category: tile.category, venueTypeId: venues.some((v) => v.venueTypeId === draft.venueTypeId && v.category === tile.category) ? draft.venueTypeId : "" })}
                            label={CATEGORY_LABEL[tile.category]}
                            count={tile.count >= 0 ? tile.count : null}
                        />
                    </li>
                ))}
            </ul>

            <label className="mt-5 block">
                <span className="text-xs font-bold uppercase tracking-[0.8px] text-dim">Sub-category</span>
                <select
                    value={draft.venueTypeId}
                    onChange={(event) => {
                        const venue = venues.find((v) => v.venueTypeId === event.target.value);
                        set({ venueTypeId: event.target.value, ...(venue ? { category: venue.category } : {}) });
                    }}
                    disabled={venues.length === 0}
                    className="mt-2 h-11 w-full rounded-[11px] border border-[#e9e9e6] bg-white px-3 text-sm text-ink focus:border-ink focus:outline-none disabled:bg-ground disabled:text-dim"
                >
                    <option value="">{venues.length === 0 ? "No sub-categories to choose" : "Any sub-category"}</option>
                    {ownVenues.map((venue) => (
                        <option key={venue.venueTypeId} value={venue.venueTypeId}>
                            {venue.label} · {spacesCount(venue.count)}
                        </option>
                    ))}
                </select>
            </label>

            <Heading className="mt-8">Type of display</Heading>
            <Chips options={DISPLAYS} value={draft.display} onChange={(display) => set({ display })} label="Type of display" />

            <Heading className="mt-8">Price per day</Heading>
            <Chips
                options={PRICE_BANDS.map((b) => ({ value: b.id, label: b.label }))}
                value={band}
                onChange={(id) => {
                    const chosen = PRICE_BANDS.find((b) => b.id === id);
                    set({ minRate: chosen?.minRate ?? "", maxRate: chosen?.maxRate ?? "" });
                }}
                label="Price bands"
            />
            <div className="mt-3 grid grid-cols-2 gap-4">
                <label className="flex h-11 items-center gap-1 rounded-[11px] border border-[#e9e9e6] px-3 text-sm text-ink">
                    ₹
                    <input
                        inputMode="numeric"
                        value={draft.minRate}
                        onChange={(e) => set({ minRate: e.target.value.replace(/[^\d]/g, "") })}
                        placeholder="Minimum"
                        aria-label="Minimum price per day"
                        className="min-w-0 flex-1 bg-transparent focus:outline-none"
                    />
                </label>
                <label className="flex h-11 items-center gap-1 rounded-[11px] border border-[#e9e9e6] px-3 text-sm text-ink">
                    ₹
                    <input
                        inputMode="numeric"
                        value={draft.maxRate}
                        onChange={(e) => set({ maxRate: e.target.value.replace(/[^\d]/g, "") })}
                        placeholder="Maximum"
                        aria-label="Maximum price per day"
                        className="min-w-0 flex-1 bg-transparent focus:outline-none"
                    />
                </label>
            </div>
            <p className="mt-2 text-xs text-dim">Daily rates, before printing and installation. A week is seven days.</p>

            <Heading className="mt-8">Daily footfall</Heading>
            <Chips
                options={FOOTFALL_OPTIONS.map((o) => ({ value: o.value === null ? "" : String(o.value), label: o.label }))}
                value={draft.minFootfall}
                onChange={(minFootfall) => set({ minFootfall })}
                label="Daily footfall"
            />

            <Toggle className="mt-8" title="Illuminated at night" hint="Front-lit, back-lit or digital displays" checked={draft.lit} onChange={(lit) => set({ lit })} />
            {instantOn && <Toggle className="mt-4" title="Instant booking" hint="Book without waiting for publisher approval" checked={draft.instant} onChange={(instant) => set({ instant })} />}
            {!instantOn && instantNote && <p className="mt-4 text-xs text-dim">{INSTANT_OFF_REASON}</p>}

            <button type="button" onClick={() => onApply(draft)} className="mt-10 h-12 w-full rounded-[11px] bg-brand text-sm font-semibold text-white hover:bg-[#a51b1b]">
                {count === undefined || count === null ? (dirty ? "Show spaces" : "Apply filters") : `Show ${count.toLocaleString("en-IN")} space${count === 1 ? "" : "s"}`}
            </button>
            <button
                type="button"
                onClick={() => setDraft({ category: "", venueTypeId: "", display: "", minRate: "", maxRate: "", minFootfall: "", lit: false, instant: false })}
                className="mt-3 w-full text-center text-sm font-medium text-ink underline underline-offset-2 hover:text-brand"
            >
                Clear all
            </button>
        </aside>
    );
}

function Heading({ children, className }: { children: React.ReactNode; className?: string }) {
    return <p className={cn("text-xs font-bold uppercase tracking-[0.8px] text-dim", className)}>{children}</p>;
}

function Radio({ name, checked, onChange, label, count }: { name: string; checked: boolean; onChange: () => void; label: string; count?: number | null }) {
    return (
        <label className="flex cursor-pointer items-center gap-3 py-1 text-sm text-ink">
            <input type="radio" name={name} checked={checked} onChange={onChange} className="size-[18px] accent-brand" />
            <span className="flex-1">{label}</span>
            {count !== undefined && count !== null && <span className={cn("text-xs tabular-nums", count > 0 ? "text-dim" : "text-[#a3a3a8]")}>{count.toLocaleString("en-IN")}</span>}
        </label>
    );
}

function Chips({ options, value, onChange, label }: { options: { value: string; label: string }[]; value: string; onChange: (value: string) => void; label: string }) {
    return (
        <div className="mt-3 flex flex-wrap gap-2" role="radiogroup" aria-label={label}>
            {options.map((option) => {
                const on = option.value === value;
                return (
                    <button
                        key={option.value || "any"}
                        type="button"
                        role="radio"
                        aria-checked={on}
                        onClick={() => onChange(option.value)}
                        className={cn("h-8 rounded-full border px-3 text-xs font-medium", on ? "border-ink bg-ink text-white" : "border-line bg-white text-ink hover:border-ink")}
                    >
                        {option.label}
                    </button>
                );
            })}
        </div>
    );
}

function Toggle({ title, hint, checked, onChange, className }: { title: string; hint: string; checked: boolean; onChange: (value: boolean) => void; className?: string }) {
    const id = React.useId();
    return (
        <div className={cn("flex items-center gap-3", className)}>
            <label htmlFor={id} className="flex-1 cursor-pointer">
                <span className="block text-sm font-semibold text-ink">{title}</span>
                <span className="block text-xs text-dim">{hint}</span>
            </label>
            <Switch id={id} checked={checked} onCheckedChange={onChange} className="data-[state=checked]:bg-brand" />
        </div>
    );
}
