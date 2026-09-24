"use client";

import * as React from "react";
import Link from "next/link";
import type { CreativeProps } from "@/components/creative/creative-screen";
import { useSpotCards } from "@/components/creative/use-spot-cards";
import { StepActions, TaskCard } from "@/components/planner/planner-shell";
import { artworkSpec } from "@/services/creatives";
import { plannerHref } from "@/services/planner";

const WORDS = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];

/** "Outdoor billboard · 40 × 20 ft" / "Digital screen · 24 × 14 ft" — the format line on a selected space. */
function formatLine(spot: CreativeProps["campaign"]["spots"][number], card: ReturnType<typeof useSpotCards>[string]): string {
    const spec = artworkSpec(spot, card);
    const kind = card?.display === "DIGITAL" || spec.kind === "Digital artwork" ? "Digital screen" : card?.category === "OUTDOOR" ? "Outdoor billboard" : card?.category === "TRANSIT" ? "Transit" : spot.listing.mediaType?.name ?? "Indoor space";
    return spec.size ? `${kind} · ${spec.size}` : kind;
}

/** 05 · Selected locations (5204:69172): the spaces on this booking, each with its way to the listing, and "Change spaces". */
export function SelectedSpaces({ campaign, returnHref }: CreativeProps) {
    const spots = campaign.spots.filter((spot) => spot.status !== "CANCELLED");
    const cards = useSpotCards(spots);
    const count = spots.length;

    return (
        <>
            <TaskCard title="Selected ad spaces" intro={count ? `These are the ${WORDS[count] ?? count} space${count === 1 ? "" : "s"} selected for this booking.` : "No spaces are on this booking yet."}>
                {count > 0 && (
                    <ul className="space-y-3">
                        {spots.map((spot) => {
                            const card = cards[spot.listingId] ?? null;
                            const photo = spot.listing.photos[0]?.url ?? card?.photos[0] ?? null;
                            const area = spot.listing.address?.split(",")[0]?.trim() || spot.listing.city;
                            return (
                                <li key={spot.id} className="flex items-center gap-4 rounded-lg border border-line bg-white p-4">
                                    <div className="h-[84px] w-[104px] shrink-0 overflow-hidden rounded-md bg-[#f1f1ee]">
                                        {photo ? <img src={photo} alt={spot.listing.title} className="size-full object-cover" /> : <div className="flex size-full items-center justify-center text-[11px] text-dim">No photo</div>}
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <p className="text-base font-semibold text-ink">{spot.listing.title}</p>
                                        <p className="mt-1 text-sm text-dim">
                                            {area}
                                            {spot.listing.city && area !== spot.listing.city ? `, ${spot.listing.city}` : ""}
                                        </p>
                                        <p className="mt-1 text-sm text-dim">{formatLine(spot, card)}</p>
                                    </div>
                                    <Link href={`/spaces/${encodeURIComponent(card?.displayId ?? spot.listingId)}`} className="inline-flex h-10 shrink-0 items-center rounded-md border border-line bg-white px-4 text-sm font-medium text-ink hover:border-ink">
                                        View space
                                    </Link>
                                </li>
                            );
                        })}
                    </ul>
                )}
                <div className="mt-5 flex flex-wrap items-center justify-between gap-4">
                    <p className="text-sm text-dim">Need a different location or format?</p>
                    <Link href={plannerHref(campaign.id, "spaces")} className="inline-flex h-10 items-center rounded-md border border-line bg-white px-4 text-sm font-medium text-ink hover:border-ink">
                        Change spaces
                    </Link>
                </div>
            </TaskCard>
            <StepActions next={{ label: "Done", href: returnHref, width: 176 }} />
        </>
    );
}
