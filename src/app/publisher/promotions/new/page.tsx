"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { messageOf } from "@/lib/api-client";
import { brandButton, CardTitle, Crumbs, Empty, ErrorNote, Field, inputClass, KeyRow, Loading } from "@/components/publisher/parts";
import { useLoad } from "@/components/publisher/use-load";
import { AgeGate, useAgeGate } from "@/components/checkout/age-gate";
import { DaysCalendar } from "@/components/promotions/days-calendar";
import { BoostsNotOpen, useBoostsOpen } from "@/components/promotions/boosts/gate";
import { mergedCapacity, mergedMinDays, mergePlacementDays, orderedPlacements, placementsLabel, RELEASE_MINUTES, sponsorable } from "@/components/promotions/boosts/model";
import { BoostPayPanel } from "@/components/promotions/boosts/pay-panel";
import { PlacementPicker } from "@/components/promotions/boosts/placement-picker";
import { publisherWorkspace, type MyListing } from "@/services/publisher-workspace";
import {
    boostQuoteOf,
    dayLabel,
    dayOf,
    featureOff,
    fullDaysOf,
    isIsoDay,
    money,
    PLACEMENT_MEANING,
    promotionsService,
    runDays,
    runLabel,
    type BoostPlacement,
    type BoostPlacementInfo,
    type BoostQuote,
    type BoostView,
} from "@/services/promotions";

/**
 * LM-1 · Sponsor a listing: one of the publisher's live listings, the
 * placements it is shown first in, the days on a calendar that counts each
 * day's room (the chosen placements merged — the fuller one decides), the
 * quote (drawn here while choosing, then the server's, which is what is
 * charged, with any full day named), then create — the dates are held,
 * unpaid, for an hour — and pay from the earnings wallet or by card/UPI.
 */
export default function SponsorListingPage() {
    return (
        <React.Suspense fallback={<Loading label="Loading…" />}>
            <SponsorListing />
        </React.Suspense>
    );
}

type Read = { closed: true } | { closed: false; placements: BoostPlacementInfo[]; listings: MyListing[] };

async function readSetup(): Promise<Read> {
    try {
        const [placements, listings] = await Promise.all([promotionsService.placements(), publisherWorkspace.listings({ pageSize: 100 })]);
        return { closed: false, placements, listings: listings.items.filter(sponsorable) };
    } catch (caught) {
        if (featureOff(caught)) return { closed: true };
        throw caught;
    }
}

function SponsorListing() {
    const open = useBoostsOpen();
    return (
        <div className="mx-auto w-full max-w-[1384px]">
            <Crumbs items={[{ label: "Sponsored listings", href: "/publisher/promotions" }, { label: "Sponsor a listing" }]} />
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-ink">Sponsor a listing</h1>
            <p className="mt-2 text-sm text-dim">Show a live listing first, labelled Sponsored. A flat rate per day, plus 18% GST.</p>
            {open === "loading" && <Loading />}
            {open === "closed" && <BoostsNotOpen />}
            {open === "open" && <SetupLoader />}
        </div>
    );
}

function SetupLoader() {
    const { data, error, loading, reload } = useLoad("boosts:setup", readSetup);
    if (!data && loading) return <Loading label="Reading your listings and the prices…" />;
    if (error && !data)
        return (
            <div className="mt-6">
                <ErrorNote message={error} onRetry={reload} />
            </div>
        );
    if (!data) return null;
    if (data.closed) return <BoostsNotOpen />;
    if (data.placements.length === 0) return <div className="mt-6"><Empty title="No placements on sale" text="ADX has no sponsored placement on sale right now. Check back soon." /></div>;
    if (data.listings.length === 0)
        return (
            <div className="mt-6">
                <Empty title="No live listing to sponsor" text="Only a listing that is live on the marketplace can be sponsored. Once ADX approves one of yours, come back here." action={{ label: "Go to my inventory", href: "/publisher/inventory" }} />
            </div>
        );
    return <SponsorForm placements={data.placements} listings={data.listings} />;
}

type ServerQuote = { key: string; quote: BoostQuote | null; error: string | null };

function SponsorForm({ placements, listings }: { placements: BoostPlacementInfo[]; listings: MyListing[] }) {
    const router = useRouter();
    const search = useSearchParams();
    const wanted = search.get("listingId");
    const [listingId, setListingId] = React.useState(() => listings.find((row) => row.id === wanted || row.displayId === wanted)?.id ?? (listings.length === 1 ? listings[0].id : ""));
    const [chosen, setChosen] = React.useState<BoostPlacement[]>(() => (placements.some((row) => row.placement === "SEARCH_TOP") ? ["SEARCH_TOP"] : [placements[0].placement]));
    const [range, setRange] = React.useState<{ from: string; to: string } | null>(null);
    const [server, setServer] = React.useState<ServerQuote>({ key: "", quote: null, error: null });
    const [creating, setCreating] = React.useState(false);
    const [createError, setCreateError] = React.useState<{ message: string; full: string[] } | null>(null);
    const [created, setCreated] = React.useState<BoostView | null>(null);
    /* 29 Sep 2026: holding the dates is an order — 18 or over, a missing date of birth asked here. */
    const age = useAgeGate();

    const listing = listings.find((row) => row.id === listingId) ?? null;
    const ordered = orderedPlacements(chosen);
    const capacity = mergedCapacity(placements, ordered);
    const minDays = mergedMinDays(placements, ordered);
    const days = range ? runDays(range.from, range.to) : 0;
    const runReady = !!range && days >= minDays;
    const ready = !!listing && ordered.length > 0 && runReady;
    const local = ordered.length > 0 && days > 0 ? boostQuoteOf(placements, ordered, days) : null;
    const quoteKey = ready && range ? `${listingId}|${ordered.join(",")}|${range.from}|${range.to}` : "";

    React.useEffect(() => {
        if (!quoteKey) return;
        const [forListing, forPlacements, from, to] = quoteKey.split("|");
        let cancelled = false;
        const timer = setTimeout(() => {
            promotionsService
                .boostQuote(forListing, forPlacements.split(",") as BoostPlacement[], from, to)
                .then((quote) => !cancelled && setServer({ key: quoteKey, quote: { ...quote, full: Array.isArray(quote?.full) ? quote.full.map((day) => dayOf(String(day))).filter(isIsoDay) : [] }, error: null }))
                .catch((caught: unknown) => !cancelled && setServer({ key: quoteKey, quote: null, error: fullDaysOf(caught)?.length ? `Full on ${fullDaysOf(caught)!.map(dayLabel).join(", ")}.` : messageOf(caught, "Could not price these dates.") }));
        }, 250);
        return () => {
            cancelled = true;
            clearTimeout(timer);
        };
    }, [quoteKey]);

    const serverQuote = server.key === quoteKey ? server.quote : null;
    const serverError = server.key === quoteKey ? server.error : null;
    const pricing = !!quoteKey && server.key !== quoteKey;
    const full = serverQuote?.full ?? [];
    const locked = !!created;

    /* The calendar keeps the latest reader on a ref and re-reads on `loadKey`. */
    const loadDays = async (from: string, to: string) => (listingId && ordered.length ? mergePlacementDays(await promotionsService.boostAvailability(listingId, from, to, ordered), ordered) : []);

    const create = async () => {
        if (!ready || !range || creating || locked || !age.ready(() => void create())) return;
        setCreating(true);
        setCreateError(null);
        try {
            const boost = await promotionsService.createBoost({ listingId, placements: ordered, startDate: range.from, endDate: range.to });
            setCreated(boost);
            toast.success("Dates held — pay within the hour to keep them.");
        } catch (caught) {
            if (age.caught(caught, () => void create())) return;
            const fullDays = fullDaysOf(caught);
            setCreateError(fullDays ? { message: "Some of these days filled up while you were choosing.", full: fullDays } : { message: messageOf(caught, "Could not create the sponsorship."), full: [] });
        } finally {
            setCreating(false);
        }
    };

    const shown = serverQuote ?? local;

    return (
        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
            <div className="grid content-start gap-6">
                <section className="rounded-lg border border-line bg-white p-6">
                    <CardTitle>1 · The listing</CardTitle>
                    <div className="mt-4">
                        <Field label="Live listing" htmlFor="boost-listing">
                            <select id="boost-listing" value={listingId} disabled={locked} onChange={(event) => { setListingId(event.target.value); setRange(null); }} className={inputClass}>
                                <option value="">Choose a listing</option>
                                {listings.map((row) => (
                                    <option key={row.id} value={row.id}>
                                        {row.title}
                                        {row.displayId ? ` · ${row.displayId}` : ""}
                                    </option>
                                ))}
                            </select>
                        </Field>
                        <p className="mt-2 min-h-5 text-sm text-dim">{listing ? [listing.city, listing.category.charAt(0) + listing.category.slice(1).toLowerCase(), listing.address].filter(Boolean).join(" · ") : "Only listings live on the marketplace can be sponsored."}</p>
                    </div>
                </section>

                <section className="rounded-lg border border-line bg-white p-6">
                    <CardTitle>2 · Where it is shown first</CardTitle>
                    <p className="mt-1 text-sm text-dim">Pick one or both. Each is labelled Sponsored where it shows.</p>
                    <div className="mt-4">
                        <PlacementPicker placements={placements} value={chosen} onChange={setChosen} disabled={locked} />
                    </div>
                    {ordered.length === 0 && <p className="mt-3 text-sm text-danger">Pick at least one placement.</p>}
                </section>

                <section className="rounded-lg border border-line bg-white p-6">
                    <CardTitle>3 · The days</CardTitle>
                    <p className="mt-1 text-sm text-dim">
                        Each day shows the room left in {listing?.city ? `${listing.city} for this category` : "this listing's city and category"}
                        {ordered.length > 1 ? " — on the fuller of the two placements" : ""}. The shortest run is {minDays} day{minDays === 1 ? "" : "s"}.
                    </p>
                    <div className="mt-4">
                        {listing && ordered.length > 0 ? (
                            locked ? (
                                <p className="rounded-md bg-ground px-4 py-3 text-sm text-ink">{runLabel(range?.from, range?.to)}</p>
                            ) : (
                                <DaysCalendar load={loadDays} loadKey={`${listingId}|${ordered.join(",")}`} capacity={capacity} value={range} onChange={setRange} minDays={minDays} />
                            )
                        ) : (
                            <p className="rounded-md bg-ground px-4 py-3 text-sm text-dim">Choose the listing and a placement to see the free days.</p>
                        )}
                    </div>
                </section>
            </div>

            <aside className="grid content-start gap-6 lg:sticky lg:top-6 lg:self-start">
                <section className="rounded-lg border border-line bg-white p-6" data-testid="boost-quote">
                    <CardTitle>Your quote</CardTitle>
                    <div className="mt-3 divide-y divide-line">
                        <KeyRow label="Listing" value={listing?.title ?? "—"} />
                        <KeyRow label="Shown first in" value={placementsLabel(ordered)} />
                        <KeyRow label="Dates" value={range ? runLabel(range.from, range.to) : "—"} />
                    </div>
                    <div className="mt-3 border-t border-line pt-3">
                        {ordered.map((placement) => {
                            const rate = serverQuote?.ratePerDay?.[placement] ?? placements.find((row) => row.placement === placement)?.ratePerDay;
                            return <KeyRow key={placement} label={`${PLACEMENT_MEANING[placement].title} · per day`} value={money(rate)} />;
                        })}
                        <KeyRow label="Days" value={shown ? shown.days : "—"} />
                        <KeyRow label="Subtotal" value={shown ? money(shown.subtotal) : "—"} />
                        <KeyRow label="GST (18%)" value={shown ? money(shown.gstAmount) : "—"} />
                        <KeyRow label="Total" value={shown ? money(shown.total) : "—"} strong className="border-t border-line pt-3" />
                    </div>
                    <p className="mt-2 min-h-4 text-xs text-dim" aria-live="polite">
                        {pricing ? "Checking the price with ADX…" : serverQuote ? "ADX's quote — this is what you pay." : shown ? "Worked out here; ADX confirms it before you pay." : ""}
                    </p>
                    {full.length > 0 && (
                        <p className="mt-3 rounded-md bg-danger-soft px-3 py-2 text-sm text-danger" data-testid="quote-full">
                            Full on {full.map(dayLabel).join(", ")}. Pick a run around {full.length === 1 ? "that day" : "those days"}.
                        </p>
                    )}
                    {serverError && <p className="mt-3 rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">{serverError}</p>}
                    {createError && (
                        <div className="mt-3 rounded-md bg-danger-soft px-3 py-2 text-sm text-danger" role="alert">
                            {createError.message}
                            {createError.full.length > 0 && <> Full on {createError.full.map(dayLabel).join(", ")}.</>}
                        </div>
                    )}
                    {!locked && (
                        <>
                            <AgeGate gate={age} className="mt-3" />
                            <button type="button" onClick={create} disabled={!ready || creating || pricing || full.length > 0 || age.blocked} className={`${brandButton} mt-5 w-full`}>
                                {creating ? "Holding your dates…" : "Continue to pay"}
                            </button>
                            <p className="mt-3 text-xs text-dim">Your dates are held for {RELEASE_MINUTES} minutes while you pay; an unpaid sponsorship is released after that.</p>
                        </>
                    )}
                </section>
                {created && (
                    <>
                        <BoostPayPanel boost={created} onPaid={(next) => router.push(`/publisher/promotions/${encodeURIComponent(next.id || created.id)}`)} />
                        <Link href={`/publisher/promotions/${encodeURIComponent(created.id)}`} className="text-center text-sm font-medium text-ink underline underline-offset-4">
                            Pay later from the sponsorship&apos;s page
                        </Link>
                    </>
                )}
            </aside>
        </div>
    );
}
