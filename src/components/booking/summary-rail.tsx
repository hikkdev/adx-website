"use client";

import * as React from "react";
import { browseService, type BrowseCard } from "@/services/browse";
import { formatFlight, isDigital, prettySize, rupees, type Campaign, type CampaignReview, type Charges } from "@/services/booking";
import { ChargesTable } from "./charges";
import { SpaceLineCard } from "./space-line";

/** The browse cards behind a set of listing ids — for a size and a display the campaign's own spot rows do not carry. */
export function useListingCards(ids: string[]): Record<string, BrowseCard> {
    const key = ids.join(",");
    const [cards, setCards] = React.useState<{ key: string; byId: Record<string, BrowseCard> }>({ key: "", byId: {} });

    React.useEffect(() => {
        if (!key) return;
        let cancelled = false;
        Promise.all(key.split(",").map((id) => browseService.listing(id).catch(() => null))).then((rows) => {
            if (cancelled) return;
            const byId: Record<string, BrowseCard> = {};
            rows.forEach((row, index) => {
                if (row) byId[key.split(",")[index]!] = row;
            });
            setCards({ key, byId });
        });
        return () => {
            cancelled = true;
        };
    }, [key]);

    return cards.key === key ? cards.byId : {};
}

/** "Outdoor · 40 × 20 ft" / "Digital · 1080 × 1920 px" — the line under a space's name. */
export function kindLineOf(card: BrowseCard | undefined, fallback: { mediaTypeName?: string | null; size?: string | null }): { line: string; digital: boolean } {
    const digital = card ? isDigital({ display: card.display }) : isDigital({ mediaTypeName: fallback.mediaTypeName });
    const size = prettySize(card?.size ?? fallback.size ?? null);
    const kind = digital ? "Digital" : card?.category === "OUTDOOR" ? "Outdoor" : card?.category === "INDOOR" ? "Indoor" : card?.category === "TRANSIT" ? "Transit" : (fallback.mediaTypeName ?? "Space");
    return { line: size ? `${kind} · ${size}` : kind, digital };
}

/**
 * The right-hand column on the billing and pay pages (5204:64359): one
 * card per chosen space, then the totals block.
 */
export function SummaryRail({ campaign, review, charges, promo, before }: { campaign: Campaign; review: CampaignReview | null; charges: Charges; promo?: { code: string; amount: string } | null; before?: React.ReactNode }) {
    const cards = useListingCards(campaign.spots.map((spot) => spot.listingId));
    const days = review?.days ?? campaign.spots[0]?.days ?? 0;
    return (
        <aside className="space-y-3">
            {campaign.spots.map((spot) => {
                const line = review?.lines.find((l) => l.spotId === spot.id);
                const kind = kindLineOf(cards[spot.listingId], { mediaTypeName: spot.listing.mediaType?.name, size: line?.size });
                return <SpaceLineCard key={spot.id} title={spot.listing.title} kindLine={kind.line} digital={kind.digital} datesLine={`${formatFlight(campaign.startDate, campaign.endDate, { year: false })} · ${days} days · ${rupees(line?.lineTotal ?? spot.lineTotal)}`} />;
            })}
            <ChargesTable charges={charges} promo={promo} className="mt-6" />
            {before}
        </aside>
    );
}
