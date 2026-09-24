"use client";

import * as React from "react";
import { ApiError } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { listingEditorService, rupees, type IndicatorState, type PriceIndicator } from "@/services/listing-editor";

const TONE: Record<IndicatorState, { label: string; className: string }> = {
    NO_DATA: { label: "Nothing to compare", className: "bg-ground text-dim" },
    TOO_LOW: { label: "Below the market", className: "bg-warning-soft text-warning" },
    LOW_SIDE: { label: "On the cheaper side", className: "bg-info-soft text-info" },
    GOOD: { label: "Within the going rate", className: "bg-success-soft text-success" },
    TOO_HIGH: { label: "Above the market", className: "bg-warning-soft text-warning" },
};

/**
 * The sentence under the price (`POST /pricing/evaluate`): how the rate
 * compares with the spots priced nearby. It informs and never blocks — a
 * publisher may list at any price. Asked once the question is complete
 * (a format, a named size, a pin and a daily rate) and half a second after
 * the last keystroke, since the route is metered.
 */
export function PriceIndicatorLine({
    venueTypeId,
    mediaTypeId,
    sizeClassId,
    latitude,
    longitude,
    city,
    ratePerDay,
    excludeListingId,
    blockedBy,
}: {
    venueTypeId: string | null;
    mediaTypeId: string | null;
    sizeClassId: string | null;
    latitude: number | null;
    longitude: number | null;
    city: string | null;
    ratePerDay: string | null;
    excludeListingId?: string;
    blockedBy?: string | null;
}) {
    const question = `${venueTypeId}|${mediaTypeId}|${sizeClassId}|${latitude}|${longitude}|${city}|${ratePerDay}`;
    const [answer, setAnswer] = React.useState<{ key: string; result: PriceIndicator | null; failed: string | null } | null>(null);
    const askable = mediaTypeId !== null && sizeClassId !== null && latitude !== null && longitude !== null && ratePerDay !== null && Number(ratePerDay) > 0;

    React.useEffect(() => {
        if (!askable) return;
        let live = true;
        const timer = setTimeout(() => {
            listingEditorService
                .evaluate({ venueTypeId, mediaTypeId: mediaTypeId!, sizeClassId: sizeClassId!, latitude: latitude!, longitude: longitude!, city, ratePerDay: ratePerDay!, ...(excludeListingId ? { excludeListingId } : {}) })
                .then((result) => {
                    if (live) setAnswer({ key: question, result, failed: null });
                })
                .catch((caught: unknown) => {
                    if (live) setAnswer({ key: question, result: null, failed: caught instanceof ApiError ? caught.message : "Could not check this price right now." });
                });
        }, 500);
        return () => {
            live = false;
            clearTimeout(timer);
        };
    }, [askable, question, venueTypeId, mediaTypeId, sizeClassId, latitude, longitude, city, ratePerDay, excludeListingId]);

    if (!askable) {
        return <p className="text-xs text-dim">{blockedBy ?? "ADX compares your rate with spots nearby once the format, the size and the pin are in."}</p>;
    }
    if (!answer || answer.key !== question) return <p className="text-xs text-dim">Checking nearby prices…</p>;
    if (answer.failed) return <p className="text-xs text-dim">{answer.failed}</p>;
    const result = answer.result!;
    const tone = TONE[result.state] ?? TONE.NO_DATA;
    return (
        <p className="flex flex-wrap items-center gap-2 text-xs text-dim">
            <span className={cn("inline-flex h-5 items-center rounded-full px-2 text-[11px] font-semibold", tone.className)}>{tone.label}</span>
            <span>
                {result.message}
                {result.range ? ` Nearby: ${rupees(result.range.low)}–${rupees(result.range.high)} a day.` : ""}
                {result.thin ? " Few comparables yet." : ""}
            </span>
        </p>
    );
}
