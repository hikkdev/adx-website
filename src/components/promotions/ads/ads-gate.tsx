"use client";

import * as React from "react";
import { Panel } from "@/components/workspace/page-heading";
import { LoadingLine } from "@/components/advertiser/bits";
import { useFlag, useFlagsLoaded } from "@/lib/flags";
import { FLAG_PROMOTION_ADS } from "@/services/promotions";

/** What the page says when ADX is not selling ads — the switch is off, or the server answered 503 FEATURE_OFF. */
export function AdsClosed({ className }: { className?: string }) {
    return (
        <Panel className={className ?? "mt-6"}>
            <p className="text-sm font-medium text-ink" data-testid="ads-closed">
                Advertising on ADX is not open yet
            </p>
            <p className="mt-1 text-sm text-dim">ADX is not selling ad space on its pages right now. When it opens, you can book a slot here, upload your artwork and pay — nothing to do until then.</p>
        </Panel>
    );
}

/**
 * The `promotions.ads` switch in front of every buying door: nothing is
 * drawn until the flags have loaded (no door flashes open), and with the
 * switch off the page says so instead of offering a door.
 */
export function useAdsOpen(): "loading" | "open" | "closed" {
    const loaded = useFlagsLoaded();
    const on = useFlag(FLAG_PROMOTION_ADS);
    if (!loaded) return "loading";
    return on ? "open" : "closed";
}

export function AdsGate({ heading, children }: { heading: React.ReactNode; children: React.ReactNode }) {
    const open = useAdsOpen();
    if (open === "open") return <>{children}</>;
    return (
        <>
            {heading}
            {open === "loading" ? (
                <div className="mt-6">
                    <LoadingLine />
                </div>
            ) : (
                <AdsClosed />
            )}
        </>
    );
}
