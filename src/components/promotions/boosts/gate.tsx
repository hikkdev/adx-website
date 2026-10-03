"use client";

import * as React from "react";
import Link from "next/link";
import { outlineButton } from "@/components/publisher/parts";
import { useFlag, useFlagsLoaded } from "@/lib/flags";
import { FLAG_PROMOTION_BOOSTS } from "@/services/promotions";

/**
 * Whether sponsored listings are open: the console's `promotions.boosts`
 * switch, read once the flags land ("loading" until then, so no buying door
 * flashes). A 503 FEATURE_OFF from any read says the same thing.
 */
export function useBoostsOpen(): "loading" | "open" | "closed" {
    const loaded = useFlagsLoaded();
    const on = useFlag(FLAG_PROMOTION_BOOSTS);
    if (!loaded) return "loading";
    return on ? "open" : "closed";
}

/** The honest page when the switch is off: no buying door. */
export function BoostsNotOpen() {
    return (
        <div className="mt-6 rounded-lg border border-dashed border-line bg-white px-6 py-10 text-center" data-testid="boosts-closed">
            <p className="text-sm font-semibold text-ink">Sponsored listings are not open yet</p>
            <p className="mx-auto mt-1 max-w-md text-sm text-dim">ADX has not opened sponsored placements on the marketplace. When it does, you can put a live listing at the top of search and similar listings from here.</p>
            <Link href="/publisher/inventory" className={`${outlineButton} mt-5`}>
                Back to my inventory
            </Link>
        </div>
    );
}
