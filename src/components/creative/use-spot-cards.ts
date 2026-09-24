"use client";

import * as React from "react";
import { browseService, type BrowseCard } from "@/services/browse";
import type { CampaignSpot } from "@/services/planner";

/**
 * The browse card behind each booked spot — the campaign's own spot row
 * carries the title and the size in feet, the card adds whether the face
 * is a screen, its photographs and the area. Read once per listing.
 */
export function useSpotCards(spots: CampaignSpot[]): Record<string, BrowseCard | null> {
    const ids = spots.map((spot) => spot.listingId).sort().join(",");
    const [cards, setCards] = React.useState<{ key: string; byId: Record<string, BrowseCard | null> }>({ key: "", byId: {} });

    React.useEffect(() => {
        if (!ids) return;
        let cancelled = false;
        const wanted = ids.split(",");
        Promise.all(
            wanted.map((id) =>
                browseService
                    .listing(id)
                    .then((card) => [id, card] as const)
                    .catch(() => [id, null] as const)
            )
        ).then((rows) => {
            if (!cancelled) setCards({ key: ids, byId: Object.fromEntries(rows) });
        });
        return () => {
            cancelled = true;
        };
    }, [ids]);

    return cards.key === ids ? cards.byId : {};
}
