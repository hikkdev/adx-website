"use client";

import * as React from "react";
import Link from "next/link";
import { messageOf } from "@/lib/api-client";
import { BookingCard, ErrorNote, StepFooter, smallButton } from "@/components/booking/booking-frame";
import { ChargesTable } from "@/components/booking/charges";
import { DateRangeDialog } from "@/components/booking/date-range-dialog";
import { SpaceLineCard } from "@/components/booking/space-line";
import { StepPage, stepHref, useCampaignId, type ReadyCampaign } from "@/components/booking/step-page";
import { kindLineOf, useListingCards } from "@/components/booking/summary-rail";
import { bookingService, chargesOf, estimateCart, flightDays, formatFlight, rupees, type InventoryMatch } from "@/services/booking";

/**
 * Step 2 · Ad spaces: the campaign's chosen spaces as the cart drew them,
 * priced by the review, with Remove, the dates picker (5204:67792) and the
 * spaces ADX matches to the brief (`GET /campaigns/:id/inventory`) to add
 * from. Every change is `PUT /campaigns/:id/spots`, the cart sent whole.
 */
export default function SpacesPage({ params }: { params: Promise<{ id: string }> }) {
    const id = useCampaignId(params);
    return (
        <StepPage id={id} step={2}>
            {(ready) => <SpacesStep key={ready.campaign.id} ready={ready} />}
        </StepPage>
    );
}

function SpacesStep({ ready }: { ready: ReadyCampaign }) {
    const { campaign, review } = ready;
    const cards = useListingCards(campaign.spots.map((spot) => spot.listingId));
    const [datesOpen, setDatesOpen] = React.useState(false);
    const [busy, setBusy] = React.useState<string | null>(null);
    const [error, setError] = React.useState<string | null>(null);
    const [matches, setMatches] = React.useState<InventoryMatch[] | null>(null);

    React.useEffect(() => {
        let cancelled = false;
        bookingService
            .inventory(campaign.id, 6)
            .then((rows) => {
                if (!cancelled) setMatches(rows);
            })
            .catch(() => {
                if (!cancelled) setMatches([]);
            });
        return () => {
            cancelled = true;
        };
    }, [campaign.id]);

    const days = flightDays(campaign.startDate, campaign.endDate);
    const charges = review ? chargesOf(review) : estimateCart(campaign.spots.map((spot) => ({ ratePerDay: spot.ratePerDay, print: campaign.fulfilment !== "ADVERTISER_SHIPS" })), days);
    const inCart = new Set(campaign.spots.map((spot) => spot.listingId));

    const write = async (what: string, items: { listingId: string }[], dates?: { from: string; to: string }) => {
        setBusy(what);
        setError(null);
        try {
            if (dates) await bookingService.patch(campaign.id, { startDate: dates.from, endDate: dates.to, step: 11 });
            const saved = await bookingService.setSpots(campaign.id, items);
            ready.applyCampaign(saved);
        } catch (caught) {
            setError(messageOf(caught, "Could not update your spaces."));
        } finally {
            setBusy(null);
        }
    };

    const remove = (listingId: string) => write(listingId, campaign.spots.filter((spot) => spot.listingId !== listingId).map((spot) => ({ listingId: spot.listingId })));
    const add = (listingId: string) => write(listingId, [...campaign.spots.map((spot) => ({ listingId: spot.listingId })), { listingId }]);

    return (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
            <div>
                <BookingCard title="Your ad spaces" description={`${campaign.spots.length} space${campaign.spots.length === 1 ? "" : "s"} · ${formatFlight(campaign.startDate, campaign.endDate, { long: true })} · ${days} days. Every space runs on the same schedule.`}>
                    <ErrorNote message={error} className="mt-4" />
                    <div className="mt-5 space-y-3">
                        {campaign.spots.length === 0 && <p className="rounded-md border border-dashed border-line px-4 py-6 text-center text-sm text-dim">No spaces yet. Add one from the matches below, or find more on Explore.</p>}
                        {campaign.spots.map((spot) => {
                            const line = review?.lines.find((l) => l.spotId === spot.id);
                            const kind = kindLineOf(cards[spot.listingId], { mediaTypeName: spot.listing.mediaType?.name, size: line?.size });
                            const clash = review?.clashes.find((c) => c.spotId === spot.id);
                            return (
                                <div key={spot.id}>
                                    <SpaceLineCard
                                        title={spot.listing.title}
                                        kindLine={kind.line}
                                        digital={kind.digital}
                                        datesLine={`${formatFlight(campaign.startDate, campaign.endDate, { year: false })} · ${days} days · ${rupees(line?.lineTotal ?? spot.lineTotal)}`}
                                        photo={spot.listing.photos[0]?.url ?? null}
                                        action={
                                            <button type="button" disabled={busy === spot.listingId} onClick={() => void remove(spot.listingId)} className="inline-flex h-10 items-center rounded-md border border-line bg-white px-5 text-sm font-medium text-ink hover:border-ink disabled:opacity-50">
                                                {busy === spot.listingId ? "Removing…" : "Remove"}
                                            </button>
                                        }
                                    />
                                    {clash && <p className="mt-1.5 text-xs text-[#b42318]">No slot left on these dates — taken while you were building the campaign. Remove it or change the dates.</p>}
                                </div>
                            );
                        })}
                    </div>
                    <div className="mt-4 flex flex-wrap gap-3">
                        <button type="button" onClick={() => setDatesOpen(true)} className={smallButton}>
                            Edit dates
                        </button>
                        <Link href="/spaces" className={smallButton}>
                            Find more spaces ↗
                        </Link>
                    </div>
                    <p className="mt-3 text-xs text-dim">Spaces added from Explore go to a new cart; add to this campaign from the matches below.</p>
                </BookingCard>

                <BookingCard className="mt-4" title="Spaces that match your brief" description="Matched to your market and dates. Add any to this campaign.">
                    <div className="mt-5 space-y-3">
                        {matches === null && <p className="text-sm text-dim">Finding matches…</p>}
                        {matches !== null && matches.filter((m) => !inCart.has(m.listingId)).length === 0 && <p className="text-sm text-dim">Nothing more to suggest for these dates.</p>}
                        {(matches ?? [])
                            .filter((m) => !inCart.has(m.listingId))
                            .map((match) => (
                                <div key={match.listingId} className="flex items-center justify-between gap-4 rounded-md border border-line px-4 py-3">
                                    <div className="flex min-w-0 items-center gap-3">
                                        {match.photoUrl && <img src={match.photoUrl} alt="" className="size-12 shrink-0 rounded-md object-cover" />}
                                        <div className="min-w-0">
                                            <p className="truncate text-sm font-medium text-ink">{match.title}</p>
                                            <p className="text-xs text-dim">
                                                {[match.mediaTypeName, match.size, match.city].filter(Boolean).join(" · ")} · {rupees(match.lineTotal)} for {days} days
                                                {match.clashes ? " · no slot left" : ""}
                                            </p>
                                        </div>
                                    </div>
                                    <button type="button" disabled={match.clashes || busy === match.listingId} onClick={() => void add(match.listingId)} className={smallButton}>
                                        {busy === match.listingId ? "Adding…" : "Add"}
                                    </button>
                                </div>
                            ))}
                    </div>
                </BookingCard>

                <StepFooter className="mt-6" back={{ href: stepHref(campaign.id, "details"), label: "Back" }} next={{ label: "Continue to artwork", href: stepHref(campaign.id, "artwork"), disabled: campaign.spots.length === 0 }} />
            </div>

            <aside>
                <ChargesTable charges={charges} title="Campaign total" note={review ? "Confirmed by your publisher's rates. GST is charged per line." : "Estimate until the review prices the cart."} />
            </aside>

            {datesOpen && (
                <DateRangeDialog
                    open={datesOpen}
                    from={campaign.startDate}
                    to={campaign.endDate}
                    onClose={() => setDatesOpen(false)}
                    onApply={(from, to) => {
                        setDatesOpen(false);
                        void write("dates", campaign.spots.map((spot) => ({ listingId: spot.listingId })), { from, to });
                    }}
                />
            )}
        </div>
    );
}
