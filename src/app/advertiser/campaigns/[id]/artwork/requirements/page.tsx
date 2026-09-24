"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { BookingCard, BookingHeader, primaryButton, secondaryButton } from "@/components/booking/booking-frame";
import { SelectField } from "@/components/booking/fields";
import { useCampaign } from "@/components/booking/use-campaign";
import { accountNameOf, stepHref, useCampaignId } from "@/components/booking/step-page";
import { useListingCards } from "@/components/booking/summary-rail";
import { artworkRequirements, isDigital, prettySize } from "@/services/booking";

/**
 * Artwork requirements (5204:66851): the placement picker, then the spec
 * for it — print (file type, size, DPI, colour, safe area) or digital
 * (dimensions and orientation, codec and length, frame rate, size and
 * audio). ADX's standard spec: listings carry no spec of their own yet.
 */
export default function RequirementsPage({ params }: { params: Promise<{ id: string }> }) {
    const id = useCampaignId(params);
    return (
        <React.Suspense>
            <Requirements id={id} />
        </React.Suspense>
    );
}

function Requirements({ id }: { id: string }) {
    const router = useRouter();
    const search = useSearchParams();
    const { state } = useCampaign(id);
    const campaign = state.kind === "ready" ? state.campaign : null;
    const cards = useListingCards(campaign?.spots.map((spot) => spot.listingId) ?? []);
    const wanted = search.get("spot");
    const spot = campaign?.spots.find((s) => s.id === wanted) ?? campaign?.spots[0] ?? null;
    const back = stepHref(id, "artwork/files");

    if (state.kind !== "ready" || !campaign) {
        return (
            <div className="mx-auto max-w-[1008px]">
                <BookingHeader back={{ href: back, label: "Back to artwork" }} title="Artwork requirements" subtitle={state.kind === "error" ? state.message : "Loading…"} />
            </div>
        );
    }

    const card = spot ? cards[spot.listingId] : undefined;
    const digital = spot ? isDigital({ display: card?.display, mediaTypeName: spot.listing.mediaType?.name }) : false;
    const size = prettySize(card?.size ?? null);
    const rows = artworkRequirements(digital ? "digital" : "print", card?.size ?? null);

    return (
        <div className="mx-auto max-w-[1008px]">
            <BookingHeader back={{ href: back, label: "Back to artwork" }} title="Artwork requirements" subtitle={`${campaign.name} · ${campaign.brandName ?? accountNameOf(state.advertiser)}`} />
            <BookingCard className="mt-6">
                <p className="text-sm text-dim">Choose the placement you're preparing artwork for.</p>
                <SelectField label="Placement" className="mt-5" value={spot?.id ?? ""} onChange={(e) => router.replace(`${stepHref(id, "artwork/requirements")}?spot=${encodeURIComponent(e.target.value)}`)}>
                    {campaign.spots.map((s) => (
                        <option key={s.id} value={s.id}>
                            {s.listing.title}
                        </option>
                    ))}
                </SelectField>
                {spot && (
                    <>
                        <h2 className="mt-7 text-base font-semibold text-ink">{digital ? "Digital artwork" : "Print artwork"}</h2>
                        <p className="mt-1 text-sm text-dim">
                            {spot.listing.city ?? spot.listing.title}
                            {size ? ` · ${size}` : ""}
                        </p>
                        <dl className="mt-4 divide-y divide-line">
                            {rows.map((row) => (
                                <div key={row.label} className="flex items-center justify-between gap-4 py-3 text-sm">
                                    <dt className="text-dim">{row.label}</dt>
                                    <dd className="text-right font-medium text-ink">{row.value}</dd>
                                </div>
                            ))}
                        </dl>
                        <p className="mt-4 text-sm text-dim">{digital ? "Export at the screen's exact pixel size; the publisher checks the file before playback." : "Use the publisher's template for the final size, bleed and safe area."}</p>
                    </>
                )}
            </BookingCard>
            <div className="mt-6 flex items-center justify-between">
                <Link href="/advertiser/help" className={secondaryButton}>
                    Get help
                </Link>
                <Link href={back} className={primaryButton}>
                    Back to artwork
                </Link>
            </div>
        </div>
    );
}
