"use client";

import * as React from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { addDays, AVAILABILITY_MAX_DAYS, browseService, dateSpan, isIsoDay, shortDate, utcToday, type ListingAvailability } from "@/services/browse";

/**
 * AV-1: under a space that has no slot left on the campaign's dates, when
 * it is next free and the earliest run of the campaign's length that fits
 * the spot's quantity — one availability read per clashing space — with a
 * link to that space's calendar, carrying the campaign's dates so the
 * calendar says the same. The booking rules are unchanged: the space still
 * has to go, or the dates have to move.
 */
export function ClashHint({
    listingId,
    length,
    quantity = 1,
    campaignDates,
    className,
}: {
    listingId: string;
    /** The campaign's days. */
    length: number;
    /** The slots this spot takes each day. */
    quantity?: number;
    campaignDates?: { from: string | null | undefined; to: string | null | undefined };
    className?: string;
}) {
    const key = `${listingId}|${length}|${quantity}`;
    const [read, setRead] = React.useState<{ key: string; value: ListingAvailability | null }>({ key: "", value: null });

    React.useEffect(() => {
        let cancelled = false;
        const today = utcToday();
        browseService
            .availability(listingId, { from: today, to: addDays(today, AVAILABILITY_MAX_DAYS - 1), ...(length > 0 ? { length } : {}), quantity })
            .then((value) => !cancelled && setRead({ key, value }))
            .catch(() => !cancelled && setRead({ key, value: null }));
        return () => {
            cancelled = true;
        };
    }, [listingId, length, quantity, key]);

    const from = campaignDates?.from?.slice(0, 10);
    const to = campaignDates?.to?.slice(0, 10);
    const href = `/spaces/${encodeURIComponent(listingId)}${isIsoDay(from) && isIsoDay(to) ? `?from=${from}&to=${to}` : ""}#availability`;
    const value = read.key === key ? read.value : null;
    const parts: string[] = [];
    if (value?.nextFreeDate) parts.push(`Free from ${shortDate(value.nextFreeDate)}`);
    if (value?.nextFit) parts.push(`Fits ${dateSpan(value.nextFit.from, value.nextFit.to)}`);
    else if (value && length > 0) parts.push(`No ${length}-day run free in the next six months`);

    return (
        <p className={cn("flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink", className)} data-testid="clash-hint">
            {read.key !== key ? <span className="text-dim">Looking for free dates…</span> : parts.length > 0 ? <span>{parts.join(" · ")}</span> : !value ? <span className="text-dim">Could not read this space&apos;s calendar.</span> : null}
            <Link href={href} className="font-semibold text-brand underline underline-offset-2">
                See its calendar
            </Link>
        </p>
    );
}

/** The clash list: each clashing space by name, with its hint under it. */
export function ClashList({
    clashes,
    length,
    quantityOf,
    campaignDates,
    className,
}: {
    clashes: { spotId: string; listingId: string; title: string }[];
    length: number;
    quantityOf?: (spotId: string) => number | undefined;
    campaignDates?: { from: string | null | undefined; to: string | null | undefined };
    className?: string;
}) {
    if (clashes.length === 0) return null;
    return (
        <ul className={cn("space-y-2", className)} data-testid="clash-list">
            {clashes.map((clash) => (
                <li key={clash.spotId}>
                    <p className="text-sm font-medium text-ink">{clash.title}</p>
                    <ClashHint listingId={clash.listingId} length={length} quantity={quantityOf?.(clash.spotId) ?? 1} campaignDates={campaignDates} className="mt-0.5" />
                </li>
            ))}
        </ul>
    );
}
