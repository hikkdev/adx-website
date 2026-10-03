"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Clock, MapPin, Search, X } from "lucide-react";
import { ApiError } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { browseService, perDay, recentSearches, type BrowseCard } from "@/services/browse";

/** How long after the last keystroke the browse is asked, and from how many characters. */
export const SEARCH_DEBOUNCE_MS = 250;
export const SEARCH_MIN_CHARS = 2;
const RESULTS = 6;

/**
 * The app's search screen (DR 06, 4417:7446) as a box on Explore: "Recent"
 * — the last searches made in this browser — and "Results", a compact row
 * per matching space as the person types (the browse's own answer to `q`,
 * newest first, a beat after the last keystroke, scoped to the city being
 * browsed). A row opens the space; Enter, or "See every result", runs the
 * whole browse with the query, where the filters and the sort are.
 */
export function ExploreSearch({ initial, city, onSubmit, className }: { initial: string; city: string | null; onSubmit: (query: string) => void; className?: string }) {
    const router = useRouter();
    const [query, setQuery] = React.useState(initial);
    const [open, setOpen] = React.useState(false);
    const [answer, setAnswer] = React.useState<{ term: string; items: BrowseCard[]; error: string | null } | null>(null);
    const recent = React.useSyncExternalStore(recentSearches.subscribe, recentSearches.list, recentSearches.server);
    const box = React.useRef<HTMLDivElement>(null);
    const latest = React.useRef(0);
    const term = query.trim();
    const live = term.length >= SEARCH_MIN_CHARS;

    React.useEffect(() => {
        if (!live || !open) return;
        const request = ++latest.current;
        const timer = window.setTimeout(() => {
            browseService
                .browse({ q: term, ...(city ? { city } : {}), sort: "NEWEST", pageSize: RESULTS })
                .then((page) => {
                    if (request === latest.current) setAnswer({ term, items: page.items, error: null });
                })
                .catch((caught: unknown) => {
                    if (request === latest.current) setAnswer({ term, items: [], error: caught instanceof ApiError ? caught.message : "Could not reach ADX." });
                });
        }, SEARCH_DEBOUNCE_MS);
        return () => window.clearTimeout(timer);
    }, [live, open, term, city]);

    React.useEffect(() => {
        if (!open) return;
        const onDown = (event: MouseEvent) => {
            if (box.current && !box.current.contains(event.target as Node)) setOpen(false);
        };
        document.addEventListener("mousedown", onDown);
        return () => document.removeEventListener("mousedown", onDown);
    }, [open]);

    const submit = (text = term) => {
        const clean = text.trim();
        if (clean) recentSearches.remember(clean);
        setOpen(false);
        onSubmit(clean);
    };

    const openListing = (card: BrowseCard) => {
        if (term) recentSearches.remember(term);
        setOpen(false);
        router.push(`/spaces/${encodeURIComponent(card.displayId ?? card.id)}`);
    };

    const results = live && answer?.term === term ? answer : null;
    const searching = live && !results;

    return (
        <div ref={box} className={cn("relative w-full", className)}>
            <form
                role="search"
                onSubmit={(event) => {
                    event.preventDefault();
                    submit();
                }}
                className={cn("flex h-[52px] items-center gap-3 rounded-xl border bg-white px-4 shadow-[0px_3px_5px_rgba(0,0,0,0.04)]", open ? "border-ink" : "border-[rgba(204,204,204,0.5)]")}
            >
                <Search className="size-5 shrink-0 text-dim" aria-hidden />
                <input
                    value={query}
                    onChange={(event) => {
                        setQuery(event.target.value);
                        setOpen(true);
                    }}
                    onFocus={() => setOpen(true)}
                    onKeyDown={(event) => {
                        if (event.key === "Escape") setOpen(false);
                    }}
                    placeholder="Search spaces by name, street or area"
                    aria-label="Search spaces"
                    autoComplete="off"
                    className="min-w-0 flex-1 bg-transparent text-sm font-medium text-ink placeholder:text-dim focus:outline-none"
                />
                {query && (
                    <button
                        type="button"
                        aria-label="Clear the search"
                        onClick={() => {
                            setQuery("");
                            setOpen(true);
                            if (initial) onSubmit("");
                        }}
                        className="flex size-7 items-center justify-center rounded-full text-dim hover:bg-ground hover:text-ink"
                    >
                        <X className="size-4" aria-hidden />
                    </button>
                )}
                <button type="submit" className="h-9 shrink-0 rounded-[9px] bg-brand px-4 text-sm font-semibold text-white hover:bg-[#a51b1b]">
                    Search
                </button>
            </form>

            {open && (recent.length > 0 || live) && (
                <div className="absolute left-0 right-0 top-full z-30 mt-2 max-h-[460px] overflow-y-auto rounded-xl border border-line bg-white p-2 shadow-card" data-testid="explore-search-panel">
                    {recent.length > 0 && (
                        <div className="pb-1">
                            <div className="flex items-center justify-between px-3 pb-1 pt-2">
                                <p className="text-xs font-bold uppercase tracking-[0.8px] text-dim">Recent</p>
                                <button type="button" onClick={() => recentSearches.clear()} className="text-xs font-medium text-dim hover:text-ink">
                                    Clear
                                </button>
                            </div>
                            {recent.map((item) => (
                                <div key={item} className="group flex items-center gap-3 rounded-lg px-3 py-2 hover:bg-ground">
                                    <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-ground group-hover:bg-white">
                                        <Clock className="size-4 text-dim" aria-hidden />
                                    </span>
                                    <button type="button" onClick={() => { setQuery(item); submit(item); }} className="min-w-0 flex-1 truncate text-left text-sm font-medium text-ink">
                                        {item}
                                    </button>
                                    <button type="button" aria-label={`Forget “${item}”`} onClick={() => recentSearches.forget(item)} className="hidden size-6 items-center justify-center rounded-full text-dim hover:text-ink group-hover:flex">
                                        <X className="size-3.5" aria-hidden />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                    {live && (
                        <div className={cn(recent.length > 0 && "border-t border-line pt-1")}>
                            <p className="px-3 pb-1 pt-2 text-xs font-bold uppercase tracking-[0.8px] text-dim">Results</p>
                            {results?.error && <p className="px-3 py-2 text-sm text-dim">{results.error}</p>}
                            {searching ? (
                                <p className="px-3 py-3 text-sm text-dim">Searching…</p>
                            ) : results && results.items.length === 0 && !results.error ? (
                                <p className="px-3 py-3 text-sm text-dim">{`Nothing matches “${term}”. Try a shorter word, or another city.`}</p>
                            ) : (
                                results?.items.map((card) => (
                                    <button key={card.id} type="button" onClick={() => openListing(card)} className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left hover:bg-ground">
                                        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-ground">
                                            <MapPin className="size-4 text-dim" aria-hidden />
                                        </span>
                                        <span className="min-w-0 flex-1">
                                            <span className="block truncate text-sm font-semibold text-ink">{card.title}</span>
                                            <span className="mt-0.5 flex items-center gap-2">
                                                <span className="rounded bg-brand-soft px-1.5 py-px text-[10px] font-bold uppercase tracking-[0.4px] text-brand-bright">{card.category}</span>
                                                <span className="truncate text-xs text-dim">{card.address || card.city || ""}</span>
                                            </span>
                                        </span>
                                        <span className="shrink-0 text-xs font-bold tabular-nums text-brand">{perDay(card.ratePerDay)}</span>
                                    </button>
                                ))
                            )}
                            {results && results.items.length > 0 && (
                                <button type="button" onClick={() => submit()} className="mt-1 w-full rounded-lg px-3 py-2.5 text-left text-sm font-semibold text-ink hover:bg-ground">
                                    See every result for “{term}” →
                                </button>
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
