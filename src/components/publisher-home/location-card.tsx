"use client";

import Link from "next/link";
import { CalendarDays, Info, Phone, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { bookingStatus, formatMoney, type DashboardListing, type OrderStatus } from "@/services/publisher-workspace";
import { bookingRange, railProgress, stageRail, telHref } from "./home-model";

/**
 * The Location Card (DR 02·03 3949:4333) — what opens over the Overview's
 * map when a pin is chosen: the spot's title with the info mark, the stage
 * rail, then — where a booking holds the spot — who booked it and for how
 * much, the run, the stage as a pill, and the agent on it with a call link.
 * A free spot shows the title and View listing and nothing else.
 */
export function LocationCard({ spot, onClose, className }: { spot: DashboardListing; onClose: () => void; className?: string }) {
    const booking = spot.booking ?? null;
    const listingHref = `/publisher/listings/${encodeURIComponent(spot.id)}`;
    const stage = booking ? bookingStatus({ status: booking.status as OrderStatus, endDate: booking.endDate }) : null;
    const call = booking ? telHref(booking) : null;

    return (
        <div className={cn("rounded-xl border border-line bg-white p-5 shadow-card", className)} data-testid="location-card">
            <div className="flex items-center gap-2">
                <p className="min-w-0 flex-1 truncate text-base font-semibold text-ink">{spot.title}</p>
                <Link href={listingHref} aria-label="About this listing" className="text-dim hover:text-ink">
                    <Info className="size-[18px]" aria-hidden />
                </Link>
                <button type="button" onClick={onClose} aria-label="Close" className="text-dim hover:text-ink">
                    <X className="size-[18px]" aria-hidden />
                </button>
            </div>

            {booking && (
                <>
                    <StageRail status={booking.status} />
                    <div className="mt-4 space-y-2 rounded-lg bg-ground p-3.5">
                        <div className="flex items-center justify-between gap-3">
                            <p className="min-w-0 truncate text-sm font-semibold text-ink">{booking.advertiserName ?? booking.campaignName ?? "Booked"}</p>
                            {booking.amount && <p className="text-sm font-semibold tabular-nums text-brand">{formatMoney(booking.amount)}</p>}
                        </div>
                        {booking.campaignName && booking.advertiserName && <p className="truncate text-xs text-dim">{booking.campaignName}</p>}
                        <p className="flex items-center gap-1.5 text-xs text-dim">
                            <CalendarDays className="size-3.5" aria-hidden />
                            {bookingRange(booking)}
                        </p>
                        {stage && <span className={cn("inline-flex h-6 items-center rounded-full border px-3 text-xs font-medium", stage.tone === "success" ? "border-success text-success" : "border-warning text-warning")}>{stage.label}</span>}
                    </div>
                    {booking.agent && (
                        <div className="mt-3 flex items-center gap-3 rounded-lg bg-ground p-3.5">
                            <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-semibold text-ink">{booking.agent.name ?? "ADX agent"}</p>
                                <p className="text-xs text-dim">Agent</p>
                            </div>
                            {call && (
                                <a href={call} aria-label={`Call ${booking.agent.name ?? "the agent"}`} className="flex size-9 items-center justify-center rounded-full bg-brand-soft text-brand hover:bg-brand hover:text-white">
                                    <Phone className="size-4" aria-hidden />
                                </a>
                            )}
                        </div>
                    )}
                    <Link href={`/publisher/bookings/${encodeURIComponent(booking.orderId)}`} className="mt-3 block text-xs font-semibold text-ink underline underline-offset-4 decoration-line hover:decoration-ink">
                        Open the booking
                    </Link>
                </>
            )}

            <Link href={listingHref} className="mt-4 flex h-10 w-full items-center justify-center rounded-md bg-brand text-sm font-semibold text-white hover:bg-[#a51b1b]">
                View listing
            </Link>
        </div>
    );
}

/** The dots: done stages filled, the one in hand ringed, the rest hollow, on a rail filled as far as the work has got. */
function StageRail({ status }: { status: string }) {
    const stages = stageRail(status);
    const { filled, reached } = railProgress(status);
    return (
        <div className="relative mt-4 h-4" role="img" aria-label={`Stage ${reached + 1} of ${stages.length}: ${stages[reached]?.label ?? ""}`}>
            <div className="absolute inset-x-1 top-1/2 h-[3px] -translate-y-1/2 rounded bg-line">
                <div className="h-full rounded bg-brand" style={{ width: `${Math.round(filled * 100)}%` }} />
            </div>
            <div className="relative flex h-full items-center justify-between">
                {stages.map((stage) => (
                    <span key={stage.key} title={stage.label} className={cn("size-2.5 rounded-full border-2 bg-white", stage.state === "done" ? "border-brand bg-brand" : stage.state === "current" ? "border-brand" : "border-line")} />
                ))}
            </div>
        </div>
    );
}
