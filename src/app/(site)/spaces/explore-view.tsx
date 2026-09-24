"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { Calendar, ChevronDown, LayoutGrid, MapPin } from "lucide-react";
import { SpaceCard } from "@/components/site/space-card";
import { FilterRail, type FilterState } from "@/components/site/filter-rail";
import { ApiError } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { browseService, type BrowseCategory, type BrowseDisplay, type BrowsePage, type BrowseQuery, type BrowseSort } from "@/services/browse";

const MapPanel = dynamic(() => import("@/components/site/map-panel").then((m) => m.MapPanel), { ssr: false });

export interface ExploreParams {
    q: string;
    city: string;
    from: string;
    to: string;
    format: string;
    display: string;
    category: string;
    budgetMin: string;
    budgetMax: string;
    lit: string;
    sort: string;
    page: number;
    map: boolean;
}

const PAGE_SIZE = 12;

/**
 * The design's FORMAT rail, mapped onto the browse read's facets. The read
 * takes one category, so the rail is one choice at a time; Mall panel and
 * Airport are indoor spaces found by their words.
 */
const FORMATS: Record<string, { label: string; query: Partial<BrowseQuery> }> = {
    billboard: { label: "Billboard", query: { category: "OUTDOOR" } },
    digital: { label: "Digital screen", query: { display: "DIGITAL" } },
    transit: { label: "Transit", query: { category: "TRANSIT" } },
    mall: { label: "Mall panel", query: { category: "INDOOR", q: "mall" } },
    airport: { label: "Airport", query: { category: "INDOOR", q: "airport" } },
};

const SORTS: { value: string; label: string; sort?: BrowseSort }[] = [
    { value: "", label: "Recommended" },
    { value: "PRICE_ASC", label: "Price: low to high", sort: "PRICE_ASC" },
    { value: "PRICE_DESC", label: "Price: high to low", sort: "PRICE_DESC" },
    { value: "RATING", label: "Top rated", sort: "RATING" },
    { value: "NEWEST", label: "Newest", sort: "NEWEST" },
];

function queryOf(params: ExploreParams): BrowseQuery {
    const format = FORMATS[params.format]?.query ?? {};
    const weekly = (value: string) => (value && Number(value) > 0 ? String(Math.round(Number(value) / 7)) : undefined);
    const sort = SORTS.find((s) => s.value === params.sort)?.sort;
    return {
        ...(params.q ? { q: params.q } : {}),
        ...(params.city ? { city: params.city } : {}),
        ...(params.category ? { category: params.category as BrowseCategory } : {}),
        ...(params.display ? { display: params.display as BrowseDisplay } : {}),
        ...format,
        ...(format.q && params.q ? { q: `${params.q} ${format.q}` } : {}),
        ...(params.from ? { from: params.from } : {}),
        ...(params.to ? { to: params.to } : {}),
        ...(weekly(params.budgetMin) ? { minRate: weekly(params.budgetMin) } : {}),
        ...(weekly(params.budgetMax) ? { maxRate: weekly(params.budgetMax) } : {}),
        ...(params.lit && params.lit !== "any" ? { illuminated: true } : {}),
        ...(params.lit === "led" ? { display: "DIGITAL" as BrowseDisplay } : {}),
        ...(sort ? { sort } : {}),
        page: params.page,
        pageSize: PAGE_SIZE,
    };
}

function hrefOf(next: Partial<ExploreParams>, base: ExploreParams): string {
    const merged = { ...base, ...next };
    const params = new URLSearchParams();
    const put = (key: string, value: string | number | boolean | undefined) => {
        if (value === undefined || value === "" || value === false || value === 0) return;
        params.set(key, String(value));
    };
    put("q", merged.q);
    put("city", merged.city);
    put("from", merged.from);
    put("to", merged.to);
    put("format", merged.format);
    put("display", merged.display);
    put("category", merged.category);
    put("budgetMin", merged.budgetMin);
    put("budgetMax", merged.budgetMax);
    put("lit", merged.lit);
    put("sort", merged.sort);
    if (merged.page > 1) put("page", merged.page);
    if (merged.map) put("map", "1");
    const search = params.toString();
    return search ? `/spaces?${search}` : "/spaces";
}

function dateLabel(from: string, to: string): string {
    if (!from && !to) return "Any dates";
    const fmt = (iso: string) => (iso ? new Date(iso + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : "…");
    return `${fmt(from)} – ${fmt(to)}`;
}

type Result = { key: string; page: BrowsePage | null; error: string | null };

/**
 * DR 12 · 02 · Explore ad spaces. The URL is the state; every control writes
 * a new URL and the page re-reads. The last page stays on screen, dimmed,
 * while the next one loads, so the grid never flashes empty.
 */
export function ExploreView({ params }: { params: ExploreParams }) {
    const router = useRouter();
    const key = JSON.stringify(params);
    const [result, setResult] = React.useState<Result>({ key: "", page: null, error: null });

    const go = React.useCallback((next: Partial<ExploreParams>) => router.push(hrefOf({ page: 1, ...next }, params)), [router, params]);

    React.useEffect(() => {
        let cancelled = false;
        browseService
            .browse(queryOf(params))
            .then((page) => {
                if (!cancelled) setResult({ key, page, error: null });
            })
            .catch((caught: unknown) => {
                if (!cancelled) setResult({ key, page: null, error: caught instanceof ApiError ? caught.message : "Could not load the spaces." });
            });
        return () => {
            cancelled = true;
        };
    }, [key, params]);

    const loading = result.key !== key;
    const page = result.page;
    const error = loading ? null : result.error;
    const filters: FilterState = { format: params.format, budgetMin: params.budgetMin, budgetMax: params.budgetMax, lit: params.lit || "any" };
    const totalPages = page ? Math.max(1, Math.ceil(page.total / page.pageSize)) : 1;
    const where = params.city || (page?.items[0]?.city ?? "");

    return (
        <div className="mx-auto max-w-[1920px] px-6 pb-16 pt-10 lg:px-16">
            <h1 className="text-[48px] font-extrabold leading-[56px] tracking-[-1.6px] text-ink">Ad spaces</h1>

            <div className="mt-8 grid gap-8 lg:grid-cols-[300px_minmax(0,1fr)]">
                <FilterRail
                    key={`${filters.format}|${filters.budgetMin}|${filters.budgetMax}|${filters.lit}`}
                    value={filters}
                    formats={Object.entries(FORMATS).map(([k, f]) => ({ key: k, label: f.label }))}
                    onApply={(next) => go(next)}
                />

                <div className="min-w-0">
                    <div className="flex flex-wrap items-center justify-between gap-4">
                        <SearchBar key={`${params.city}|${params.from}|${params.to}|${params.display}`} params={params} onSearch={go} />

                        <div className="flex items-center gap-2">
                            <label className="relative flex h-[38px] items-center rounded-lg border border-line bg-white px-4 text-sm font-medium text-dim">
                                <select value={params.sort} onChange={(event) => go({ sort: event.target.value })} aria-label="Sort" className="appearance-none bg-transparent pr-6 focus:outline-none">
                                    {SORTS.map((s) => (
                                        <option key={s.value} value={s.value}>
                                            {s.label}
                                        </option>
                                    ))}
                                </select>
                                <ChevronDown className="pointer-events-none absolute right-3 size-4" aria-hidden />
                            </label>
                            <button
                                type="button"
                                onClick={() => router.push(hrefOf({ map: !params.map }, params))}
                                className={cn("h-[38px] rounded-lg border border-line bg-white px-6 text-sm font-medium text-dim hover:text-ink", params.map && "border-ink text-ink")}
                            >
                                {params.map ? "Hide map" : "Show map  ↗"}
                            </button>
                        </div>
                    </div>

                    {params.map && page && <MapPanel cards={page.items} className="mt-5" />}

                    {error ? (
                        <div className="mt-8 rounded-2xl border border-line bg-white p-10 text-center shadow-card">
                            <p className="text-lg font-semibold text-ink">Could not load the spaces</p>
                            <p className="mt-1 text-sm text-dim">{error}</p>
                        </div>
                    ) : !page ? (
                        <div className="mt-8 grid gap-6 md:grid-cols-2 xl:grid-cols-3" aria-busy="true">
                            {Array.from({ length: 6 }).map((_, i) => (
                                <div key={i} className="h-[356px] animate-pulse rounded-[14px] border border-line bg-white" />
                            ))}
                        </div>
                    ) : page.items.length === 0 ? (
                        <EmptySpaces params={params} comingSoon={page.comingSoon} onClear={() => router.push("/spaces")} />
                    ) : (
                        <div className={cn("mt-8 grid gap-6 md:grid-cols-2 xl:grid-cols-3", loading && "opacity-60")} aria-busy={loading}>
                            {page.items.map((card) => (
                                <SpaceCard key={card.id} card={card} dates={{ from: params.from || null, to: params.to || null }} />
                            ))}
                        </div>
                    )}

                    {page && page.total > 0 && (
                        <div className="mt-10 flex flex-wrap items-center justify-between gap-4">
                            <p className="text-sm text-dim">
                                Showing {page.items.length} of {page.total} space{page.total === 1 ? "" : "s"}
                                {where ? ` in ${where}` : ""}
                            </p>
                            <nav className="flex items-center gap-2" aria-label="Pages">
                                {pageNumbers(params.page, totalPages).map((n) => (
                                    <button
                                        key={n}
                                        type="button"
                                        onClick={() => router.push(hrefOf({ page: n }, params))}
                                        aria-current={n === params.page ? "page" : undefined}
                                        className={cn(
                                            "size-10 rounded-[10px] text-sm font-medium",
                                            n === params.page ? "bg-ink text-white" : "border border-line bg-white text-ink hover:border-ink"
                                        )}
                                    >
                                        {n}
                                    </button>
                                ))}
                                <button
                                    type="button"
                                    disabled={params.page >= totalPages}
                                    onClick={() => router.push(hrefOf({ page: params.page + 1 }, params))}
                                    className="h-10 rounded-[11px] border border-line bg-white px-5 text-sm font-medium text-ink hover:border-ink disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                    Next
                                </button>
                            </nav>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

/** Place · dates · format (5204:50100). Remounted by its key whenever the URL changes, so it never needs to sync. */
function SearchBar({ params, onSearch }: { params: ExploreParams; onSearch: (next: Partial<ExploreParams>) => void }) {
    const [city, setCity] = React.useState(params.city);
    const [from, setFrom] = React.useState(params.from);
    const [to, setTo] = React.useState(params.to);
    const [datesOpen, setDatesOpen] = React.useState(false);

    return (
        <form
            className="flex w-full max-w-[560px] overflow-visible rounded-xl border border-[rgba(204,204,204,0.5)] bg-white shadow-[0px_3px_5px_rgba(0,0,0,0.04)]"
            onSubmit={(event) => {
                event.preventDefault();
                onSearch({ city, from, to });
            }}
        >
            <label className="flex min-w-0 flex-1 items-center gap-3 border-r border-[rgba(204,204,204,0.5)] px-5 py-4">
                <MapPin className="size-5 shrink-0 text-dim" aria-hidden />
                <input
                    value={city}
                    onChange={(event) => setCity(event.target.value)}
                    placeholder="City"
                    aria-label="City"
                    className="min-w-0 flex-1 bg-transparent text-sm font-medium text-ink placeholder:text-dim focus:outline-none"
                />
            </label>
            <div className="relative flex min-w-0 flex-1 border-r border-[rgba(204,204,204,0.5)]">
                <button type="button" onClick={() => setDatesOpen((o) => !o)} className="flex w-full items-center gap-3 px-5 py-4 text-left text-sm font-medium text-dim" aria-expanded={datesOpen}>
                    <Calendar className="size-5 shrink-0" aria-hidden />
                    <span className={cn("truncate", (from || to) && "text-ink")}>{dateLabel(from, to)}</span>
                </button>
                {datesOpen && (
                    <div className="absolute left-0 top-full z-20 mt-2 grid w-[320px] gap-3 rounded-xl border border-line bg-white p-4 shadow-card">
                        <label className="grid gap-1 text-xs font-bold uppercase tracking-[0.8px] text-dim">
                            Starts
                            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-10 rounded-md border border-line px-3 text-sm font-normal normal-case tracking-normal text-ink" />
                        </label>
                        <label className="grid gap-1 text-xs font-bold uppercase tracking-[0.8px] text-dim">
                            Ends
                            <input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} className="h-10 rounded-md border border-line px-3 text-sm font-normal normal-case tracking-normal text-ink" />
                        </label>
                        <div className="flex justify-end gap-2">
                            <button type="button" className="rounded-md px-3 py-2 text-sm font-medium text-dim" onClick={() => { setFrom(""); setTo(""); }}>
                                Clear
                            </button>
                            <button type="button" className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white" onClick={() => { setDatesOpen(false); onSearch({ city, from, to }); }}>
                                Done
                            </button>
                        </div>
                    </div>
                )}
            </div>
            <label className="flex min-w-0 flex-1 items-center gap-3 px-5 py-4">
                <LayoutGrid className="size-5 shrink-0 text-dim" aria-hidden />
                <select value={params.display} onChange={(event) => onSearch({ city, from, to, display: event.target.value })} aria-label="Format" className="min-w-0 flex-1 appearance-none bg-transparent text-sm font-medium text-dim focus:outline-none">
                    <option value="">All formats</option>
                    <option value="STATIC">Static</option>
                    <option value="DIGITAL">Digital</option>
                </select>
                <button type="submit" className="sr-only">Search</button>
            </label>
        </form>
    );
}

function pageNumbers(current: number, total: number): number[] {
    const start = Math.max(1, Math.min(current - 2, total - 4));
    return Array.from({ length: Math.min(5, total) }, (_, i) => start + i);
}

/** DR 12 · 08 · No matching spaces — and Lot V's "coming soon" city. */
function EmptySpaces({ params, comingSoon, onClear }: { params: ExploreParams; comingSoon?: BrowsePage["comingSoon"]; onClear: () => void }) {
    return (
        <div className="mt-8 rounded-2xl border border-line bg-white px-8 py-14 text-center shadow-card">
            {comingSoon ? (
                <>
                    <p className="text-xl font-semibold text-ink">{comingSoon.city} is coming soon</p>
                    <p className="mx-auto mt-2 max-w-md text-sm text-dim">ADX is not open for advertisers in {comingSoon.city} yet. Publishers there are listing their spaces now; try another city meanwhile.</p>
                </>
            ) : (
                <>
                    <p className="text-xl font-semibold text-ink">No matching spaces</p>
                    <p className="mx-auto mt-2 max-w-md text-sm text-dim">
                        Nothing {params.city ? `in ${params.city} ` : ""}matches every filter{params.from || params.to ? " for those dates" : ""}. Widen the budget, drop a format, or try other dates.
                    </p>
                </>
            )}
            <button type="button" onClick={onClear} className="mt-6 rounded-[11px] bg-brand px-6 py-3 text-sm font-semibold text-white">
                Clear filters
            </button>
        </div>
    );
}
