"use client";

import * as React from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { bookingStatus, listingFormat, spanOf, type AvailabilityListing, type OrderStatus } from "@/services/publisher-workspace";

const WEEKDAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

/**
 * The Availability grid (5204:87466): a SITE column, one column a day, a
 * row per space with its booked, held and blocked ranges drawn as bars
 * across the days they cover, a red line on today, and a space that is not
 * live drawn as one long "unavailable" bar.
 */
export function AvailabilityGrid({
    days,
    listings,
    today,
    onRemoveBlock,
}: {
    days: string[];
    listings: AvailabilityListing[];
    today: string;
    onRemoveBlock?: (listingId: string, blockId: string) => void;
}) {
    const siteWidth = 148;
    const dense = days.length > 14;
    return (
        <div className="overflow-x-auto rounded-lg border border-line bg-white">
            <div className="min-w-[720px]">
                <div className="grid border-b border-line bg-[#f5f5f3]" style={{ gridTemplateColumns: `${siteWidth}px repeat(${days.length}, minmax(0, 1fr))` }}>
                    <div className="flex h-11 items-center px-3 text-[11px] font-semibold uppercase tracking-wide text-dim">Site</div>
                    {days.map((day) => {
                        const date = new Date(day + "T00:00:00");
                        const isToday = day === today;
                        return (
                            <div key={day} className={cn("flex h-11 flex-col items-center justify-center border-l border-line text-center leading-tight", isToday && "text-brand-bright")}>
                                {!dense && <span className={cn("text-[10px] font-medium uppercase", isToday ? "text-brand-bright" : "text-dim")}>{WEEKDAYS[date.getDay()]}</span>}
                                <span className={cn("font-semibold", dense ? "text-[11px]" : "text-xs", isToday ? "text-brand-bright" : "text-ink")}>{date.getDate()}</span>
                            </div>
                        );
                    })}
                </div>

                {listings.map((listing) => (
                    <SiteRow key={listing.id} listing={listing} days={days} today={today} siteWidth={siteWidth} onRemoveBlock={onRemoveBlock} />
                ))}
            </div>
        </div>
    );
}

function SiteRow({ listing, days, today, siteWidth, onRemoveBlock }: { listing: AvailabilityListing; days: string[]; today: string; siteWidth: number; onRemoveBlock?: (listingId: string, blockId: string) => void }) {
    const live = listing.status === "ACTIVE";
    const todayIndex = days.indexOf(today);
    const bars: { key: string; start: number; end: number; label: string; kind: "BOOKED" | "HOLD" | "BLOCKED"; href?: string; onRemove?: () => void }[] = [];

    for (const booking of listing.bookings) {
        const span = spanOf(booking, days);
        if (!span) continue;
        const status = booking.status ? bookingStatus({ status: booking.status as OrderStatus, endDate: booking.to }).label.toLowerCase() : booking.kind === "HOLD" ? "on hold" : "booked";
        bars.push({ key: `b-${booking.orderId}`, ...span, label: `${booking.campaignName ?? booking.advertiserName ?? "Booking"} · ${status}`, kind: booking.kind, href: `/publisher/bookings/${booking.orderId}` });
    }
    for (const block of listing.blocks) {
        const span = spanOf(block, days);
        if (!span) continue;
        bars.push({ key: `k-${block.id}`, ...span, label: block.reason ? `Blocked · ${block.reason}` : "Blocked", kind: "BLOCKED", onRemove: onRemoveBlock ? () => onRemoveBlock(listing.id, block.id) : undefined });
    }
    bars.sort((a, b) => a.start - b.start);

    /* Bars that overlap go on their own line so none is hidden under another. */
    const lanes: number[] = [];
    const placed = bars.map((bar) => {
        let lane = lanes.findIndex((end) => end < bar.start);
        if (lane === -1) {
            lanes.push(bar.end);
            lane = lanes.length - 1;
        } else lanes[lane] = bar.end;
        return { ...bar, lane };
    });
    const laneCount = Math.max(1, lanes.length);

    return (
        <div className="grid border-b border-line last:border-b-0" style={{ gridTemplateColumns: `${siteWidth}px 1fr` }}>
            <div className="flex min-h-[50px] flex-col justify-center px-3 py-2">
                <Link href={`/publisher/listings/${listing.id}`} className="truncate text-sm font-medium text-ink hover:underline">
                    {listing.title}
                </Link>
                <span className="truncate text-xs text-dim">
                    {listingFormat({ category: listing.category })}
                    {listing.city ? ` · ${listing.city}` : ""}
                </span>
            </div>
            <div className="relative" style={{ minHeight: 50 }}>
                <div className="absolute inset-0 grid" style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }}>
                    {days.map((day) => (
                        <div key={day} className="border-l border-line" />
                    ))}
                </div>
                {todayIndex >= 0 && <div aria-hidden className="absolute bottom-0 top-0 z-10 w-px bg-brand-bright" style={{ left: `calc(${((todayIndex + 0.5) / days.length) * 100}% )` }} />}
                {!live ? (
                    <div className="absolute inset-x-1 top-1/2 flex h-7 -translate-y-1/2 items-center rounded-[3px] bg-brand-soft px-2 text-xs text-brand-bright">
                        <span className="truncate">In review · unavailable for booking</span>
                    </div>
                ) : (
                    <div className="relative py-2" style={{ height: laneCount * 30 + 16 }}>
                        {placed.map((bar) => {
                            const left = `${(bar.start / days.length) * 100}%`;
                            const width = `${((bar.end - bar.start + 1) / days.length) * 100}%`;
                            const style: React.CSSProperties = { left: `calc(${left} + 2px)`, width: `calc(${width} - 4px)`, top: 8 + bar.lane * 30 };
                            const tone = bar.kind === "BOOKED" ? "bg-brand-soft text-brand-bright" : bar.kind === "HOLD" ? "bg-warning-soft text-warning" : "bg-[#ececea] text-ink";
                            const inner = (
                                <>
                                    <span className="truncate">{bar.label}</span>
                                    {bar.onRemove && (
                                        <button
                                            type="button"
                                            onClick={(event) => {
                                                event.preventDefault();
                                                bar.onRemove?.();
                                            }}
                                            className="ml-2 shrink-0 text-[11px] font-semibold underline underline-offset-2"
                                        >
                                            Unblock
                                        </button>
                                    )}
                                </>
                            );
                            return bar.href ? (
                                <Link key={bar.key} href={bar.href} style={style} className={cn("absolute z-20 flex h-6 items-center rounded-[3px] px-2 text-xs hover:opacity-90", tone)} title={bar.label}>
                                    {inner}
                                </Link>
                            ) : (
                                <div key={bar.key} style={style} className={cn("absolute z-20 flex h-6 items-center rounded-[3px] px-2 text-xs", tone)} title={bar.label}>
                                    {inner}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}

/** The legend the frame prints on the right of the range control. */
export function AvailabilityLegend() {
    const items: { label: string; className: string }[] = [
        { label: "Available", className: "bg-white border border-line" },
        { label: "Booked", className: "bg-brand-soft" },
        { label: "Hold", className: "bg-warning-soft" },
        { label: "Blocked", className: "bg-[#ececea]" },
    ];
    return (
        <ul className="flex items-center gap-4 text-xs text-dim">
            {items.map((item) => (
                <li key={item.label} className="flex items-center gap-1.5">
                    <span aria-hidden className={cn("size-2.5 rounded-full", item.className)} />
                    {item.label}
                </li>
            ))}
        </ul>
    );
}
