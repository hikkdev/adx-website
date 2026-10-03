"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BadgeCheck, Calendar, ChevronDown, LayoutGrid, LocateFixed, MapPin, X } from "lucide-react";
import { LayoutBlocks } from "@/components/layout/layout-blocks";
import { useLayout } from "@/components/layout/use-layout";
import { CategoryStrip } from "@/components/site/category-strip";
import { CityField, StagePill } from "@/components/site/city-field";
import { ComingSoonCard } from "@/components/site/coming-soon-card";
import { ExploreSearch } from "@/components/site/explore-search";
import { FilterRail, type FilterState } from "@/components/site/filter-rail";
import { useNearMe } from "@/components/site/near-me";
import { CampaignStrip, PopularRail } from "@/components/site/popular-rail";
import { SpaceCard } from "@/components/site/space-card";
import { ApiError } from "@/lib/api-client";
import { useAuth } from "@/lib/auth";
import { useCart } from "@/lib/cart";
import { FLAG_INSTANT_BOOKING, useFlag, useFlagsLoaded } from "@/lib/flags";
import { usePageHref } from "@/lib/site-links";
import { cn } from "@/lib/utils";
import {
    BROWSE_SORTS,
    browseHeading,
    browseService,
    categoryTiles,
    cityNotOpenMessage,
    DEFAULT_RADIUS_KM,
    geoService,
    locateMessage,
    NEAR_RADII,
    nearOf,
    roundCoord,
    type BrowsePage,
    type CategoryTile,
    type CityStage,
    type PublicPublisher,
    type VenueTile,
} from "@/services/browse";
import type { Layout } from "@/services/layouts";
import { categoryOf, drawerOf, exploreHref, exploreQuery, isLanding, type ExploreParams } from "./explore-params";

const MapPanel = dynamic(() => import("@/components/site/map-panel").then((m) => m.MapPanel), { ssr: false });

function dateLabel(from: string, to: string): string {
    if (!from && !to) return "Any dates";
    const fmt = (iso: string) => (iso ? new Date(iso + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : "…");
    return `${fmt(from)} – ${fmt(to)}`;
}

type Result = { key: string; page: BrowsePage | null; error: string | null };
type Place = { key: string; categories: CategoryTile[] | null; venues: VenueTile[] };

/**
 * DR 12 · 02 · Explore ad spaces, holding the app's discovery: the
 * category and venue tiles with their counts, "Popular near you", the
 * search with its recents and live results, the drawer's facets, the sort
 * sheet's five orders, "Near me", one publisher's spaces, and the
 * coming-soon city. The URL is the state; every control writes a new URL
 * and the page re-reads. The last page stays on screen, dimmed, while the
 * next one loads, so the grid never flashes empty.
 */
export function ExploreView({ params, initialLayout, preview = null }: { params: ExploreParams; initialLayout?: Layout | null; preview?: string | null }) {
    const router = useRouter();
    const { status } = useAuth();
    const pageLink = usePageHref();
    const { lines } = useCart();
    const instantOn = useFlag(FLAG_INSTANT_BOOKING);
    const flagsLoaded = useFlagsLoaded();
    const [version, setVersion] = React.useState(0);
    const near = React.useMemo(() => nearOf(params.lat, params.lng, params.radius), [params.lat, params.lng, params.radius]);
    const query = exploreQuery(params, { instantOn });
    const key = JSON.stringify({ query, version });
    const placeKey = JSON.stringify(near ? { near } : { city: params.city });
    const [result, setResult] = React.useState<Result>({ key: "", page: null, error: null });
    const [place, setPlace] = React.useState<Place>({ key: "", categories: null, venues: [] });
    const [stage, setStage] = React.useState<{ city: string; stage: CityStage | null } | null>(null);

    const go = React.useCallback((next: Partial<ExploreParams>) => router.push(exploreHref({ page: 1, ...next }, params)), [router, params]);
    const onFix = React.useCallback(
        (fix: { latitude: number; longitude: number }) => go({ lat: roundCoord(fix.latitude), lng: roundCoord(fix.longitude), radius: params.radius || String(DEFAULT_RADIUS_KM), city: "" }),
        [go, params.radius]
    );
    const nearMe = useNearMe(onFix);
    /* LM-1: the landing's sections in the order ADX publishes, for this side and city; the results stay last. */
    const layout = useLayout("WEB_EXPLORE", { city: params.city || null, initial: initialLayout, enabled: isLanding(params), preview });

    React.useEffect(() => {
        let cancelled = false;
        browseService
            .browse(JSON.parse(key).query)
            .then((page) => {
                if (!cancelled) setResult({ key, page, error: null });
            })
            .catch((caught: unknown) => {
                if (cancelled) return;
                const closed = cityNotOpenMessage(caught, params.city);
                setResult({ key, page: null, error: closed ?? (caught instanceof ApiError ? caught.message : "Could not load the spaces.") });
            });
        return () => {
            cancelled = true;
        };
    }, [key, params.city]);

    /* The tiles and the drawer's counts are for the place being browsed, read once per place. */
    React.useEffect(() => {
        let cancelled = false;
        const where = JSON.parse(placeKey) as { city?: string; near?: { latitude: number; longitude: number; radiusKm: number } };
        const placeQuery = where.near ? { near: where.near } : where.city ? { city: where.city } : {};
        Promise.all([browseService.categories(placeQuery).then(categoryTiles).catch(() => [] as CategoryTile[]), browseService.venues(placeQuery).then((read) => read.items).catch(() => [] as VenueTile[])]).then(
            ([categories, venues]) => {
                if (!cancelled) setPlace({ key: placeKey, categories, venues });
            }
        );
        return () => {
            cancelled = true;
        };
    }, [placeKey]);

    /* The stage pill beside a typed city — the catalogue's read is public (26 Sep 2026), so a visitor sees it too. */
    React.useEffect(() => {
        if (!params.city || near) return;
        let cancelled = false;
        geoService
            .resolve(params.city)
            .then((answer) => !cancelled && setStage({ city: params.city, stage: answer.resolved ? answer.stage : null }))
            .catch(() => !cancelled && setStage({ city: params.city, stage: null }));
        return () => {
            cancelled = true;
        };
    }, [params.city, near]);

    /* The storefront header of `/spaces?publisherId=` — the publisher's public card (26 Sep 2026). */
    const [publisher, setPublisher] = React.useState<{ id: string; card: PublicPublisher | null } | null>(null);
    React.useEffect(() => {
        if (!params.publisherId) return;
        let cancelled = false;
        const wanted = params.publisherId;
        browseService
            .publisher(wanted)
            .then((card) => !cancelled && setPublisher({ id: wanted, card }))
            .catch(() => !cancelled && setPublisher({ id: wanted, card: null }));
        return () => {
            cancelled = true;
        };
    }, [params.publisherId]);

    const countFor = React.useCallback(
        async (draft: FilterState) => (await browseService.browse({ ...exploreQuery({ ...params, ...draft, page: 1 }, { instantOn, pageSize: 1 }), page: 1, pageSize: 1 })).total,
        [params, instantOn]
    );

    const loading = result.key !== key;
    const page = result.page;
    const error = loading ? null : result.error;
    const tiles = place.key === placeKey ? place : { key: placeKey, categories: null, venues: [] as VenueTile[] };
    const filters = drawerOf(params);
    const totalPages = page ? Math.max(1, Math.ceil(page.total / page.pageSize)) : 1;
    const category = categoryOf(params);
    const venue = tiles.venues.find((v) => v.venueTypeId === params.venueTypeId) ?? null;
    const publisherCard = params.publisherId ? (page?.items[0] ?? null) : null;
    const heading = browseHeading({ venue: venue?.label, category, q: params.q });
    const where = near ? `within ${near.radiusKm} km of you` : params.city ? `in ${params.city}` : "across India";
    const cityStage = stage && stage.city === params.city && !near ? stage.stage : null;
    const landing = isLanding(params);
    const nearFailed = nearMe.state.kind === "failed" ? nearMe.state.failure : null;

    const placeHref = (next: Partial<ExploreParams>) => exploreHref({ page: 1, ...next }, params);
    const categoriesHref = (() => {
        const search = new URLSearchParams();
        if (near) {
            search.set("lat", params.lat);
            search.set("lng", params.lng);
            search.set("radius", String(near.radiusKm));
        } else if (params.city) search.set("city", params.city);
        const s = search.toString();
        /* PB-1: the categories page by its key, whatever its address. */
        return pageLink("categories", {}, s ? { search: s } : {});
    })();

    const headerRow = (
        <div className="flex flex-wrap items-end justify-between gap-6">
            {params.publisherId ? (
                <PublisherHeader publisher={publisher?.id === params.publisherId ? publisher.card : null} card={publisherCard} total={page && !loading ? page.total : null} onClear={() => go({ publisherId: "" })} />
            ) : (
                <div className="min-w-0">
                    {params.similarTo && (
                        <p className="mb-1 text-sm text-dim">
                            <Link href={page?.similarTo ? `/spaces/${encodeURIComponent(page.similarTo.displayId ?? page.similarTo.id)}` : "/spaces"} className="hover:text-ink">
                                ← Back to the listing
                            </Link>
                        </p>
                    )}
                    <h1 className="text-[48px] font-extrabold leading-[56px] tracking-[-1.6px] text-ink">
                        {params.similarTo ? (page?.similarTo ? `Spaces like ${page.similarTo.title}` : "Similar spaces") : heading}
                    </h1>
                    <p className="mt-2 flex flex-wrap items-center gap-2 text-sm text-dim">
                        {page ? `${page.total.toLocaleString("en-IN")} space${page.total === 1 ? "" : "s"} ${where}` : "Counting spaces…"}
                        {cityStage && <StagePill stage={cityStage} />}
                    </p>
                </div>
            )}
            <ExploreSearch key={params.q} initial={params.q} city={near ? null : params.city || null} onSubmit={(q) => go({ q })} className="max-w-[520px]" />
        </div>
    );
    const categoryRow =
        !params.publisherId && !params.similarTo ? (
            <CategoryStrip
                categories={tiles.categories}
                venues={tiles.venues}
                selectedCategory={category}
                selectedVenue={params.venueTypeId || null}
                categoryHref={(c) => placeHref({ category: c ?? "", venueTypeId: "" })}
                venueHref={(v) => placeHref({ category: v.category, venueTypeId: v.venueTypeId })}
                allHref={categoriesHref}
            />
        ) : null;
    const resultsRow = (
        <div className="grid gap-8 lg:grid-cols-[300px_minmax(0,1fr)]">
            <FilterRail
                key={JSON.stringify(filters)}
                value={filters}
                categories={tiles.categories}
                venues={tiles.venues}
                instantOn={instantOn}
                instantNote={status === "signed-in" && flagsLoaded}
                currentTotal={page && !loading ? page.total : null}
                countFor={countFor}
                onApply={(next) => go(next)}
            />

            <div className="min-w-0">
                <div className="flex flex-wrap items-center justify-between gap-4">
                    <SearchBar key={`${params.city}|${params.from}|${params.to}|${params.display}|${params.lat}`} params={params} near={near} asking={nearMe.state.kind === "asking"} onNearMe={nearMe.ask} onSearch={go} />

                    <div className="flex items-center gap-2">
                        <label className="relative flex h-[38px] items-center rounded-lg border border-line bg-white px-4 text-sm font-medium text-dim">
                            <span className="sr-only">Sort by</span>
                            {near ? (
                                <select value="NEAREST" disabled aria-label="Sort" title="Around a point, the nearest come first" className="appearance-none bg-transparent pr-6 focus:outline-none">
                                    <option value="NEAREST">Nearest first</option>
                                </select>
                            ) : (
                                <select value={params.sort || "NEWEST"} onChange={(event) => go({ sort: event.target.value === "NEWEST" ? "" : event.target.value })} aria-label="Sort" className="appearance-none bg-transparent pr-6 focus:outline-none">
                                    {BROWSE_SORTS.map((s) => (
                                        <option key={s.value} value={s.value}>
                                            {s.label}
                                        </option>
                                    ))}
                                </select>
                            )}
                            <ChevronDown className="pointer-events-none absolute right-3 size-4" aria-hidden />
                        </label>
                        <button
                            type="button"
                            onClick={() => router.push(exploreHref({ map: !params.map }, params))}
                            className={cn("h-[38px] rounded-lg border border-line bg-white px-6 text-sm font-medium text-dim hover:text-ink", params.map && "border-ink text-ink")}
                        >
                            {params.map ? "Hide map" : "Show map  ↗"}
                        </button>
                    </div>
                </div>

                {near && (
                    <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-ink">
                        <span className="inline-flex items-center gap-2 rounded-full border border-ink bg-white py-1.5 pl-3 pr-1.5">
                            <LocateFixed className="size-4 text-brand" aria-hidden />
                            Near you, within
                            <select value={String(near.radiusKm)} onChange={(e) => go({ radius: e.target.value })} aria-label="Distance" className="bg-transparent font-semibold focus:outline-none">
                                {NEAR_RADII.map((r) => (
                                    <option key={r} value={r}>
                                        {r} km
                                    </option>
                                ))}
                            </select>
                            <button type="button" aria-label="Stop searching near me" onClick={() => go({ lat: "", lng: "", radius: "" })} className="flex size-6 items-center justify-center rounded-full hover:bg-ground">
                                <X className="size-3.5" aria-hidden />
                            </button>
                        </span>
                    </div>
                )}

                {nearFailed && (
                    <div className="mt-4 flex items-start justify-between gap-4 rounded-xl border border-line bg-warning-soft px-5 py-4" role="alert">
                        <div>
                            <p className="text-sm font-semibold text-ink">{nearFailed === "denied" ? "Location is blocked for ADX" : "Could not find where you are"}</p>
                            <p className="mt-1 text-sm text-dim">{locateMessage(nearFailed)}</p>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                            <button type="button" onClick={nearMe.ask} className="h-9 rounded-md border border-line bg-white px-4 text-sm font-medium text-ink hover:border-ink">
                                Try again
                            </button>
                            <button type="button" aria-label="Dismiss" onClick={nearMe.dismiss} className="flex size-9 items-center justify-center rounded-md text-dim hover:text-ink">
                                <X className="size-4" aria-hidden />
                            </button>
                        </div>
                    </div>
                )}

                {lines.length > 0 && (
                    <Link href="/cart" className="mt-4 flex items-center justify-between rounded-xl bg-[#243039] px-5 py-3 text-sm text-white hover:bg-[#1c262e]" data-testid="cart-bar">
                        <span className="font-semibold">
                            {lines.length} space{lines.length === 1 ? "" : "s"} in your campaign
                        </span>
                        <span className="font-bold underline underline-offset-2">Continue booking</span>
                    </Link>
                )}

                {params.map && page && !page.comingSoon && <MapPanel cards={page.items} className="mt-5" />}

                {error ? (
                    <div className="mt-8 rounded-2xl border border-line bg-white p-10 text-center shadow-card">
                        <p className="text-lg font-semibold text-ink">Could not load the spaces</p>
                        <p className="mt-1 text-sm text-dim">{error}</p>
                        <button type="button" onClick={() => setVersion((v) => v + 1)} className="mt-5 rounded-[11px] border border-line bg-white px-5 py-2.5 text-sm font-semibold text-ink hover:border-ink">
                            Try again
                        </button>
                    </div>
                ) : !page ? (
                    <div className="mt-8 grid gap-6 md:grid-cols-2 xl:grid-cols-3" aria-busy="true">
                        {Array.from({ length: 6 }).map((_, i) => (
                            <div key={i} className="h-[356px] animate-pulse rounded-[14px] border border-line bg-white" />
                        ))}
                    </div>
                ) : page.comingSoon ? (
                    <ComingSoonCard className="mt-8" city={page.comingSoon} onLive={() => setVersion((v) => v + 1)} />
                ) : page.items.length === 0 ? (
                    <EmptySpaces params={params} where={where} onClear={() => router.push(params.publisherId ? `/spaces?publisherId=${encodeURIComponent(params.publisherId)}` : "/spaces")} />
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
                            Showing {page.items.length} of {page.total.toLocaleString("en-IN")} space{page.total === 1 ? "" : "s"} {where}
                        </p>
                        <nav className="flex items-center gap-2" aria-label="Pages">
                            {pageNumbers(params.page, totalPages).map((n) => (
                                <button
                                    key={n}
                                    type="button"
                                    onClick={() => router.push(exploreHref({ page: n }, params))}
                                    aria-current={n === params.page ? "page" : undefined}
                                    className={cn("size-10 rounded-[10px] text-sm font-medium", n === params.page ? "bg-ink text-white" : "border border-line bg-white text-ink hover:border-ink")}
                                >
                                    {n}
                                </button>
                            ))}
                            <button
                                type="button"
                                disabled={params.page >= totalPages}
                                onClick={() => router.push(exploreHref({ page: params.page + 1 }, params))}
                                className="h-10 rounded-[11px] border border-line bg-white px-5 text-sm font-medium text-ink hover:border-ink disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                Next
                            </button>
                        </nav>
                    </div>
                )}
            </div>
        </div>
    );

    return (
        <div className="mx-auto max-w-[1920px] px-6 pb-16 pt-10 lg:px-16">
            {landing ? (
                <LayoutBlocks
                    surface="WEB_EXPLORE"
                    layout={layout}
                    place={{ city: params.city || null }}
                    gapClassName="mt-10"
                    system={{
                        explore_search: headerRow,
                        category_strip: categoryRow,
                        campaign_strip: <CampaignStrip />,
                        popular_rail: (title) => <PopularRail title={title} city={params.city} near={near} onUseLocation={nearMe.ask} />,
                        results: resultsRow,
                    }}
                />
            ) : (
                <>
                    {headerRow}
                    {categoryRow && <div className="mt-8">{categoryRow}</div>}
                    <div className="mt-10">{resultsRow}</div>
                </>
            )}
        </div>
    );
}

/**
 * One publisher's spaces (QR-27, the listing page's "View publisher →"):
 * who they are, whether ADX has verified them, how many live spaces they
 * have. There is no public publisher read, so the name, the picture and the
 * tick are the browse card's own, which every one of their spaces carries.
 */
/**
 * The publisher's storefront header: their public card (`/publishers/:id/public`)
 * — name, picture, the verified mark — even when a filter leaves no space to
 * borrow them from; the first card of the page stands in until it answers.
 */
function PublisherHeader({ publisher, card, total, onClear }: { publisher: PublicPublisher | null; card: BrowsePage["items"][number] | null; total: number | null; onClear: () => void }) {
    const name = publisher?.name ?? card?.publisherName ?? null;
    const avatar = publisher?.avatarUrl ?? card?.publisherAvatarUrl ?? null;
    const verified = publisher ? publisher.verified : (card?.publisherVerified ?? null);
    return (
        <div className="flex min-w-0 items-center gap-5" data-testid="publisher-header">
            {avatar ? (
                <img src={avatar} alt="" className="size-16 shrink-0 rounded-full object-cover" />
            ) : (
                <span className="flex size-16 shrink-0 items-center justify-center rounded-full bg-white text-lg font-semibold text-ink shadow-card">{(name ?? "P").slice(0, 2).toUpperCase()}</span>
            )}
            <div className="min-w-0">
                <p className="text-xs font-bold uppercase tracking-[0.8px] text-dim">Publisher</p>
                <h1 className="flex items-center gap-2 text-[40px] font-extrabold leading-[48px] tracking-[-1.2px] text-ink">
                    <span className="truncate">{name ?? (total === null ? "Loading…" : "This publisher")}</span>
                    {verified === true && <BadgeCheck className="size-7 shrink-0 text-brand" aria-label="Verified by ADX" />}
                </h1>
                <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-dim">
                    {total === null ? (publisher ? `${publisher.liveListings.toLocaleString("en-IN")} live space${publisher.liveListings === 1 ? "" : "s"}` : "Counting their spaces…") : total === 0 ? "No live spaces from this publisher right now" : `${total.toLocaleString("en-IN")} live space${total === 1 ? "" : "s"}`}
                    {verified === true && <span>· Identity verified by ADX</span>}
                    {verified === false && <span className="rounded-md bg-ground px-2 py-0.5 text-xs font-medium text-dim">Unverified</span>}
                    <button type="button" onClick={onClear} className="font-medium text-ink underline underline-offset-2 hover:text-brand">
                        See every publisher&apos;s spaces
                    </button>
                </p>
            </div>
        </div>
    );
}

/** Place · dates · format (5204:50100), with "Near me". Remounted by its key whenever the URL changes, so it never needs to sync. */
function SearchBar({
    params,
    near,
    asking,
    onNearMe,
    onSearch,
}: {
    params: ExploreParams;
    near: ReturnType<typeof nearOf>;
    asking: boolean;
    onNearMe: () => void;
    onSearch: (next: Partial<ExploreParams>) => void;
}) {
    const [city, setCity] = React.useState(params.city);
    const [from, setFrom] = React.useState(params.from);
    const [to, setTo] = React.useState(params.to);
    const [datesOpen, setDatesOpen] = React.useState(false);
    const endBeforeStart = !!from && !!to && to < from;
    /** A typed city ends "near me" — one place at a time, as the app sends it. */
    const withPlace = (next: Partial<ExploreParams>) => (city.trim() && city.trim() !== params.city ? { ...next, lat: "", lng: "", radius: "" } : next);

    return (
        <form
            className="flex w-full max-w-[600px] overflow-visible rounded-xl border border-[rgba(204,204,204,0.5)] bg-white shadow-[0px_3px_5px_rgba(0,0,0,0.04)]"
            onSubmit={(event) => {
                event.preventDefault();
                onSearch(withPlace({ city: city.trim(), from, to: endBeforeStart ? "" : to }));
            }}
        >
            <div className="flex min-w-0 flex-[1.3] items-center gap-2 border-r border-[rgba(204,204,204,0.5)] py-2 pl-5 pr-2">
                {near ? (
                    <span className="flex min-w-0 flex-1 items-center gap-3 py-2 text-sm font-medium text-ink">
                        <LocateFixed className="size-5 shrink-0 text-brand" aria-hidden />
                        <span className="truncate">Near you</span>
                    </span>
                ) : (
                    <CityField
                        value={city}
                        onChange={setCity}
                        onPick={(picked) => onSearch({ city: picked.name, from, to, lat: "", lng: "", radius: "" })}
                        icon={<MapPin className="size-5 shrink-0 text-dim" aria-hidden />}
                        className="min-w-0 flex-1 py-2"
                    />
                )}
                <button
                    type="button"
                    onClick={onNearMe}
                    disabled={asking}
                    title="Search around where you are"
                    className={cn("flex h-8 shrink-0 items-center gap-1.5 rounded-md px-2.5 text-xs font-semibold", near ? "bg-brand-soft text-brand" : "text-ink hover:bg-ground")}
                >
                    <LocateFixed className="size-4" aria-hidden />
                    {asking ? "Locating…" : "Near me"}
                </button>
            </div>
            <div className="relative flex min-w-0 flex-1 border-r border-[rgba(204,204,204,0.5)]">
                <button type="button" onClick={() => setDatesOpen((o) => !o)} className="flex w-full items-center gap-3 px-5 py-4 text-left text-sm font-medium text-dim" aria-expanded={datesOpen}>
                    <Calendar className="size-5 shrink-0" aria-hidden />
                    <span className={cn("truncate", (from || to) && "text-ink")}>{dateLabel(from, to)}</span>
                </button>
                {datesOpen && (
                    <div className="absolute left-0 top-full z-20 mt-2 grid w-[320px] gap-3 rounded-xl border border-line bg-white p-4 shadow-card">
                        <p className="text-xs text-dim">Spaces free across the days your campaign runs.</p>
                        <div className="grid grid-cols-2 gap-3">
                            <label className="grid gap-1 text-xs font-bold uppercase tracking-[0.8px] text-dim">
                                Starts
                                <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-10 rounded-md border border-line px-2 text-sm font-normal normal-case tracking-normal text-ink" />
                            </label>
                            <label className="grid gap-1 text-xs font-bold uppercase tracking-[0.8px] text-dim">
                                Ends
                                <input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} className={cn("h-10 rounded-md border px-2 text-sm font-normal normal-case tracking-normal text-ink", endBeforeStart ? "border-danger" : "border-line")} />
                            </label>
                        </div>
                        {endBeforeStart && <p className="text-xs text-danger">The end is before the start — pick an end on or after it.</p>}
                        <div className="flex justify-end gap-2">
                            <button type="button" className="rounded-md px-3 py-2 text-sm font-medium text-dim" onClick={() => { setFrom(""); setTo(""); }}>
                                Clear
                            </button>
                            <button type="button" disabled={endBeforeStart} className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" onClick={() => { setDatesOpen(false); onSearch(withPlace({ city: city.trim(), from, to })); }}>
                                Done
                            </button>
                        </div>
                    </div>
                )}
            </div>
            <label className="flex min-w-0 flex-1 items-center gap-3 px-5 py-4">
                <LayoutGrid className="size-5 shrink-0 text-dim" aria-hidden />
                <select value={params.display} onChange={(event) => onSearch(withPlace({ city: city.trim(), from, to, display: event.target.value }))} aria-label="Type of display" className="min-w-0 flex-1 appearance-none bg-transparent text-sm font-medium text-dim focus:outline-none">
                    <option value="">Any type</option>
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

/** DR 12 · 08 · No matching spaces. */
function EmptySpaces({ params, where, onClear }: { params: ExploreParams; where: string; onClear: () => void }) {
    return (
        <div className="mt-8 rounded-2xl border border-line bg-white px-8 py-14 text-center shadow-card">
            <p className="text-xl font-semibold text-ink">{params.publisherId ? "Nothing from this publisher matches" : "No matching spaces"}</p>
            <p className="mx-auto mt-2 max-w-md text-sm text-dim">
                Nothing {where} matches every filter{params.from || params.to ? " for those dates" : ""}. Loosen one, try other dates, or another city.
            </p>
            <button type="button" onClick={onClear} className="mt-6 rounded-[11px] bg-brand px-6 py-3 text-sm font-semibold text-white">
                Clear filters
            </button>
        </div>
    );
}
