"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRight, LocateFixed, MapPin, X } from "lucide-react";
import { LayoutBlocks } from "@/components/layout/layout-blocks";
import { useLayout } from "@/components/layout/use-layout";
import { CityField } from "@/components/site/city-field";
import { useNearMe } from "@/components/site/near-me";
import { messageOf } from "@/lib/api-client";
import { usePageHref } from "@/lib/site-links";
import { cn } from "@/lib/utils";
import type { Layout } from "@/services/layouts";
import {
    browseService,
    CATEGORY_LABEL,
    categoryTiles,
    DEFAULT_RADIUS_KM,
    locateMessage,
    nearOf,
    roundCoord,
    spacesCount,
    spacesHref,
    type CategoryTile,
    type VenueTile,
} from "@/services/browse";

type Loaded = { key: string; categories: CategoryTile[]; venues: VenueTile[]; error: string | null };

/**
 * "All Categories." — the app's grid, on the web: the four categories as
 * photograph tiles with how many live spaces each holds in the place, then
 * every sub-category (venue type) under its category with its own count.
 * A tile with nothing in it says "None yet" rather than vanishing, so an
 * advertiser can see a place has no transit inventory. One read each —
 * `GET /listings/browse/categories` and `/venues` — for the place.
 * PB-3: the heading row (`categories_hero`) and the tiles
 * (`category_sections`) are the `WEB_CATEGORIES` layout's sections, with
 * whatever ADX places between them.
 */
export function CategoriesView({ city, lat, lng, radius, initialLayout, preview = null }: { city: string; lat: string; lng: string; radius: string; initialLayout?: Layout | null; preview?: string | null }) {
    const router = useRouter();
    const href = usePageHref();
    const layout = useLayout("WEB_CATEGORIES", { city: city || null, initial: initialLayout, preview });
    const near = React.useMemo(() => nearOf(lat, lng, radius), [lat, lng, radius]);
    const place = React.useMemo(() => (near ? { near } : city ? { city } : {}), [near, city]);
    const key = JSON.stringify(place);
    const [loaded, setLoaded] = React.useState<Loaded | null>(null);
    const [draft, setDraft] = React.useState(city);

    const goTo = React.useCallback(
        (next: { city?: string; near?: { latitude: number; longitude: number; radiusKm: number } | null }) => {
            const search = new URLSearchParams();
            if (next.near) {
                search.set("lat", roundCoord(next.near.latitude));
                search.set("lng", roundCoord(next.near.longitude));
                search.set("radius", String(next.near.radiusKm));
            } else if (next.city) search.set("city", next.city);
            const s = search.toString();
            router.push(href("categories", {}, s ? { search: s } : {}));
        },
        [router, href]
    );
    const nearMe = useNearMe(React.useCallback((fix) => goTo({ near: { ...fix, radiusKm: DEFAULT_RADIUS_KM } }), [goTo]));

    React.useEffect(() => {
        let cancelled = false;
        const where = JSON.parse(key);
        Promise.all([browseService.categories(where).then(categoryTiles), browseService.venues(where).then((read) => read.items).catch(() => [] as VenueTile[])])
            .then(([categories, venues]) => !cancelled && setLoaded({ key, categories, venues, error: null }))
            .catch((caught: unknown) => !cancelled && setLoaded({ key, categories: [], venues: [], error: messageOf(caught, "Could not reach ADX.") }));
        return () => {
            cancelled = true;
        };
    }, [key]);

    const ready = loaded?.key === key ? loaded : null;
    const filled = ready ? ready.categories.filter((tile) => tile.count > 0).length : 0;
    const placeLabel = near ? `within ${near.radiusKm} km of you` : city ? `in ${city}` : "across India";
    const failed = nearMe.state.kind === "failed" ? nearMe.state.failure : null;

    const hero = (
        <>
            <nav className="flex items-center gap-1.5 text-xs text-dim" aria-label="Breadcrumb">
                <Link href={href("home")} className="hover:text-ink">Home</Link>
                <ChevronRight className="size-3" aria-hidden />
                <Link href={spacesHref({}, place)} className="hover:text-ink">Ad spaces</Link>
                <ChevronRight className="size-3" aria-hidden />
                <span className="text-ink">All categories</span>
            </nav>

            <div className="mt-4 flex flex-wrap items-end justify-between gap-6">
                <div>
                    <h1 className="text-[48px] font-extrabold leading-[56px] tracking-[-1.6px] text-ink">
                        All categories<span className="text-brand">.</span>
                    </h1>
                    <p className="mt-2 text-lg text-dim" data-testid="categories-count">
                        {ready ? `${filled} categor${filled === 1 ? "y" : "ies"} with live spaces ${placeLabel}` : "Counting categories…"}
                    </p>
                </div>

                <form
                    className="flex w-full max-w-[560px] items-center gap-2 rounded-xl border border-[rgba(204,204,204,0.5)] bg-white py-2 pl-5 pr-2 shadow-[0px_3px_5px_rgba(0,0,0,0.04)]"
                    onSubmit={(event) => {
                        event.preventDefault();
                        goTo({ city: draft.trim() });
                    }}
                >
                    {near ? (
                        <span className="flex min-w-0 flex-1 items-center gap-3 text-sm font-medium text-ink">
                            <LocateFixed className="size-5 shrink-0 text-brand" aria-hidden />
                            Near you, within {near.radiusKm} km
                            <button type="button" aria-label="Stop using my location" onClick={() => goTo({ city: "" })} className="flex size-6 items-center justify-center rounded-full text-dim hover:bg-ground hover:text-ink">
                                <X className="size-3.5" aria-hidden />
                            </button>
                        </span>
                    ) : (
                        <CityField value={draft} onChange={setDraft} onPick={(picked) => goTo({ city: picked.name })} placeholder="Any city in India" icon={<MapPin className="size-5 shrink-0 text-dim" aria-hidden />} className="min-w-0 flex-1" />
                    )}
                    <button
                        type="button"
                        onClick={nearMe.ask}
                        disabled={nearMe.state.kind === "asking"}
                        className={cn("flex h-9 shrink-0 items-center gap-1.5 rounded-md px-3 text-xs font-semibold", near ? "bg-brand-soft text-brand" : "text-ink hover:bg-ground")}
                    >
                        <LocateFixed className="size-4" aria-hidden />
                        {nearMe.state.kind === "asking" ? "Locating…" : "Near me"}
                    </button>
                    {!near && (
                        <button type="submit" className="h-9 shrink-0 rounded-[9px] bg-brand px-4 text-sm font-semibold text-white hover:bg-[#a51b1b]">
                            Show
                        </button>
                    )}
                </form>
            </div>

            {failed && (
                <div className="mt-6 flex items-start justify-between gap-4 rounded-xl border border-line bg-warning-soft px-5 py-4" role="alert">
                    <div>
                        <p className="text-sm font-semibold text-ink">{failed === "denied" ? "Location is blocked for ADX" : "Could not find where you are"}</p>
                        <p className="mt-1 text-sm text-dim">{locateMessage(failed)}</p>
                    </div>
                    <button type="button" onClick={nearMe.ask} className="h-9 shrink-0 rounded-md border border-line bg-white px-4 text-sm font-medium text-ink hover:border-ink">
                        Try again
                    </button>
                </div>
            )}
        </>
    );

    const sections = (
        <>
            {ready?.error && (
                <div className="mb-8 rounded-2xl border border-line bg-white p-10 text-center shadow-card">
                    <p className="text-lg font-semibold text-ink">Could not load the categories</p>
                    <p className="mt-1 text-sm text-dim">{ready.error}</p>
                </div>
            )}

            <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4" data-testid="category-grid">
                {!ready
                    ? Array.from({ length: 4 }).map((_, index) => <div key={index} className="h-[260px] animate-pulse rounded-[17px] border border-line bg-white" />)
                    : ready.categories.map((tile) => (
                          <Link
                              key={tile.category}
                              href={spacesHref({ category: tile.category }, place)}
                              aria-label={`${CATEGORY_LABEL[tile.category]}, ${spacesCount(tile.count)}`}
                              className="group relative h-[260px] overflow-hidden rounded-[17px] bg-[#f1f1ee] shadow-card"
                          >
                              {tile.photoUrl ? (
                                  <img src={tile.photoUrl} alt="" loading="lazy" className="absolute inset-0 size-full object-cover transition-transform group-hover:scale-[1.03]" />
                              ) : (
                                  <div className="absolute inset-0 flex items-center justify-center text-sm text-dim">No photograph yet</div>
                              )}
                              <div aria-hidden className="absolute inset-x-0 bottom-0 h-[160px] bg-gradient-to-t from-[rgba(0,0,0,0.55)] to-transparent" />
                              <span className="absolute right-3 top-3 rounded-full bg-white/95 px-3 py-1 text-xs font-semibold text-[#17171a]">{spacesCount(tile.count)}</span>
                              <span className="absolute bottom-4 left-4 rounded-full bg-black/40 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.4px] text-white">{CATEGORY_LABEL[tile.category]}</span>
                          </Link>
                      ))}
            </div>

            {ready &&
                ready.venues.length > 0 &&
                ready.categories.map((tile) => {
                    const own = ready.venues.filter((venue) => venue.category === tile.category);
                    if (own.length === 0) return null;
                    return (
                        <section key={tile.category} className="mt-12" data-testid={`venues-${tile.category.toLowerCase()}`}>
                            <div className="flex items-baseline justify-between gap-4">
                                <h2 className="text-2xl font-bold tracking-tight text-ink">{CATEGORY_LABEL[tile.category]}</h2>
                                <Link href={spacesHref({ category: tile.category }, place)} className="text-sm font-medium text-ink underline underline-offset-2 hover:text-brand">
                                    See all {spacesCount(tile.count).toLowerCase()}
                                </Link>
                            </div>
                            <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5 2xl:grid-cols-6">
                                {own.map((venue) => (
                                    <Link
                                        key={venue.venueTypeId}
                                        href={spacesHref({ category: venue.category, venueTypeId: venue.venueTypeId }, place)}
                                        title={venue.name}
                                        aria-label={`${venue.label}, ${spacesCount(venue.count)}`}
                                        className="group overflow-hidden rounded-[12px] border border-line bg-white shadow-card hover:border-ink"
                                    >
                                        <div className="h-[110px] overflow-hidden bg-[#f1f1ee]">
                                            {venue.photoUrl ? <img src={venue.photoUrl} alt="" loading="lazy" className="size-full object-cover transition-transform group-hover:scale-[1.03]" /> : <div className="flex size-full items-center justify-center text-xs text-dim">No photo yet</div>}
                                        </div>
                                        <div className="px-3.5 pb-3 pt-2.5">
                                            <p className="line-clamp-2 min-h-[40px] text-sm font-medium text-ink">{venue.label}</p>
                                            <p className={cn("mt-0.5 text-xs", venue.count > 0 ? "text-dim" : "text-[#a3a3a8]")}>{spacesCount(venue.count)}</p>
                                        </div>
                                    </Link>
                                ))}
                            </div>
                        </section>
                    );
                })}

            <div className="mt-12 flex justify-center">
                <Link href={spacesHref({}, place)} className="inline-flex h-12 items-center rounded-[11px] border border-ink bg-white px-8 text-sm font-semibold text-ink hover:bg-ground">
                    Browse all spaces {placeLabel}
                </Link>
            </div>
        </>
    );

    return (
        <div className="mx-auto max-w-[1920px] px-6 pb-16 pt-10 lg:px-16">
            <LayoutBlocks surface="WEB_CATEGORIES" layout={layout} place={{ city: city || null }} gapClassName="mt-8" system={{ categories_hero: hero, category_sections: sections }} />
        </div>
    );
}
