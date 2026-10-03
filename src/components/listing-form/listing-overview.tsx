"use client";

import * as React from "react";
import Link from "next/link";
import { ApiError, messageOf } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { FLAG_INSTANT_BOOKING, useFlag } from "@/lib/flags";
import { FLAG_PROMOTION_BOOSTS } from "@/services/promotions";
import { listingEditorService, rateLabel, reviewStageOf, shortName, statusChip, type MyListing } from "@/services/listing-editor";
import { AvailabilityCard, BelowFloorCard, ListingSpecs, RightsCard, VerificationCard } from "@/components/listings/listing-cards";
import { ListingPills } from "@/components/listings/listing-pills";
import { EDIT_SECTIONS } from "./form-model";
import { Note, Problem } from "./fields";
import { SuggestedRateCard } from "./suggested-rate";

type State = { key: string; listing: MyListing | null; formatName: string | null; error: string | null };

/**
 * 09 · 01 · Listing overview (5204:82990): the spot as it stands — its
 * cover, its chip, its format, address and rate — then the whole of the
 * app's Listing details (specs, price, selling story, the space itself)
 * beside what needs the publisher: below ADX's floor with "Raise the rate",
 * ADX's suggested rate, the right to the space and its renewal, the
 * re-verification clock, and the blocked dates. The nine sections a
 * publisher can edit follow, each with its Edit. A listing still in review
 * says so at the foot and links to the review status.
 */
export function ListingOverview({ listingId }: { listingId: string }) {
    const [state, setState] = React.useState<State>({ key: "", listing: null, formatName: null, error: null });
    const [tick, setTick] = React.useState(0);
    const instant = useFlag(FLAG_INSTANT_BOOKING);
    const boosts = useFlag(FLAG_PROMOTION_BOOSTS);

    React.useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const listing = await listingEditorService.myListing(listingId);
                if (cancelled) return;
                if (!listing) {
                    setState({ key: listingId, listing: null, formatName: null, error: "That listing is not in your inventory." });
                    return;
                }
                let formatName: string | null = null;
                if (listing.mediaTypeId) {
                    try {
                        const types = await listingEditorService.catalogue();
                        formatName = shortName(types.mediaTypes.find((m) => m.id === listing.mediaTypeId)?.name ?? "") || null;
                    } catch {
                        /* The chip falls back to the sub-type. */
                    }
                }
                if (!cancelled) setState({ key: listingId, listing, formatName, error: null });
            } catch (caught) {
                if (!cancelled) setState({ key: listingId, listing: null, formatName: null, error: caught instanceof ApiError && caught.status === 404 ? "That listing is not in your inventory." : messageOf(caught, "Could not load this listing.") });
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [listingId, tick]);

    const ready = state.key === listingId;
    const listing = ready ? state.listing : null;
    const chip = listing ? statusChip(listing) : null;
    const stage = listing ? reviewStageOf(listing) : null;
    const photo = listing?.photos?.[0]?.url ?? null;
    const publicHref = listing ? `/spaces/${encodeURIComponent(listing.displayId ?? listing.id)}` : "/spaces";

    return (
        <div className="mx-auto w-full max-w-[1384px]">
            <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                    <p className="text-sm text-dim">
                        <Link href="/publisher/inventory" className="hover:text-ink">
                            My inventory
                        </Link>
                        <span className="mx-2">/</span>
                        Listing overview
                    </p>
                    <h1 className="mt-2 text-2xl font-semibold tracking-tight text-ink">{listing?.title ?? (ready ? "Listing" : "Loading…")}</h1>
                    {listing?.displayId && <p className="mt-1 text-sm text-dim">{listing.displayId}</p>}
                </div>
                <div className="flex flex-wrap gap-3">
                    {/* LM-1: a live listing can be sponsored — shown first in search and similar listings. */}
                    {boosts && listing?.status === "ACTIVE" && (
                        <Link href={`/publisher/promotions/new?listingId=${encodeURIComponent(listing.id)}`} className="inline-flex h-[50px] items-center rounded-md border border-line bg-white px-6 text-sm font-semibold text-ink shadow-sm hover:border-ink">
                            Sponsor this listing
                        </Link>
                    )}
                    <Link href={publicHref} className={cn("inline-flex h-[50px] items-center rounded-md border border-line bg-white px-6 text-sm font-semibold text-ink shadow-sm hover:border-ink", listing?.status !== "ACTIVE" && "pointer-events-none opacity-60")} aria-disabled={listing?.status !== "ACTIVE"}>
                        Preview public listing
                    </Link>
                </div>
            </div>

            {ready && state.error && <div className="mt-6"><Problem>{state.error}</Problem></div>}

            <section className="mt-5 flex flex-wrap gap-6 rounded-xl border border-line bg-white p-6">
                <div className="h-[160px] w-[248px] shrink-0 overflow-hidden rounded-lg bg-[#f1f1ee]">
                    {photo ? <img src={photo} alt="" className="size-full object-cover" /> : <div className="flex size-full items-center justify-center text-xs text-dim">No photo yet</div>}
                </div>
                <div className="min-w-0 flex-1 py-2">
                    {chip && (
                        <span className={cn("inline-flex h-6 items-center rounded-md px-2 text-xs font-medium", chip.tone === "success" ? "bg-success-soft text-success" : chip.tone === "warning" ? "bg-warning-soft text-warning" : chip.tone === "danger" ? "bg-danger-soft text-danger" : "bg-ground text-dim")}>
                            {chip.label}
                        </span>
                    )}
                    <p className="mt-3 text-lg font-semibold text-ink">{state.formatName ?? listing?.subType ?? listing?.placement ?? (listing ? listing.category.charAt(0) + listing.category.slice(1).toLowerCase() : "")}</p>
                    <p className="mt-2 text-sm text-dim">{listing ? [listing.placement, listing.address, listing.city].filter(Boolean).join(", ") : ""}</p>
                    <p className="mt-2 text-sm font-medium text-ink">{listing ? rateLabel(listing) : ""}</p>
                    {listing && <ListingPills row={listing} instant={instant} className="mt-3" />}
                    {listing?.description && <p className="mt-3 line-clamp-3 max-w-[760px] text-sm text-dim">{listing.description}</p>}
                </div>
            </section>

            {listing?.status === "REJECTED" && listing.rejectionReason && (
                <div className="mt-5 rounded-md border border-warning/30 bg-warning-soft px-4 py-3 text-sm text-warning">ADX did not accept this one: {listing.rejectionReason}</div>
            )}

            {listing && (
                <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_400px]">
                    <ListingSpecs listing={listing} formatName={state.formatName} instant={instant} />
                    <div className="grid content-start gap-5">
                        <BelowFloorCard key={`${listing.id}:${listing.ratePerDay ?? ""}`} listing={listing} />
                        <SuggestedRateCard listingId={listing.id} onAccepted={() => setTick((n) => n + 1)} />
                        <VerificationCard listing={listing} />
                        <RightsCard listing={listing} />
                        <AvailabilityCard listingId={listing.id} />
                    </div>
                </div>
            )}

            <h2 className="mt-8 text-base font-semibold text-ink">Edit this listing</h2>
            <section className="mt-3 rounded-xl border border-line bg-white px-5">
                {EDIT_SECTIONS.map((section) => {
                    const target = section.key === "details" && listing?.category === "TRANSIT" ? "vehicle" : section.key;
                    return (
                        <div key={section.key} className="flex items-center justify-between gap-6 border-b border-line py-4 last:border-b-0">
                            <div>
                                <p className="text-sm font-semibold text-ink">{section.title}</p>
                                <p className="mt-1 text-sm text-dim">{section.key === "details" && listing?.category === "TRANSIT" ? "Vehicle, registration, base and route" : section.blurb}</p>
                            </div>
                            <Link href={`/publisher/listings/${encodeURIComponent(listingId)}/edit/${target}`} className={cn("inline-flex h-10 items-center rounded-md border border-line bg-white px-6 text-sm font-semibold text-ink hover:border-ink", !listing && "pointer-events-none opacity-60")}>
                                Edit
                            </Link>
                        </div>
                    );
                })}
            </section>
            <p className="mt-3 text-xs text-dim">The address and whether the listing is live are not editable here. A space at a new address is a new listing, and ADX decides when one goes on the marketplace.</p>

            {listing && stage !== "LIVE" && (
                <div className="mt-5 flex flex-wrap items-center justify-between gap-4">
                    <Note>{stage === "CHANGES_REQUESTED" ? "ADX has asked for updates before this listing can go live." : stage === "DRAFT" ? "This listing has not been sent for review yet." : stage === "REJECTED" ? "This listing was not approved." : stage === "OFF_MARKET" ? "This listing is off the market." : "This listing is in review. Track the review from My inventory."}</Note>
                    <Link href={`/publisher/listings/${encodeURIComponent(listingId)}/status`} className="inline-flex h-[50px] items-center rounded-md bg-brand px-6 text-sm font-semibold text-white hover:bg-brand/90">
                        View review status
                    </Link>
                </div>
            )}
        </div>
    );
}
