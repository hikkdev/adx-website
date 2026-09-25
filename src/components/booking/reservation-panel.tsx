"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { rupees } from "@/services/booking";
import { countdown, reservationDeadline, reservationLine, RESERVATION_WORDS, type ReservationView } from "@/services/reservation";

/** A clock that ticks once a minute — enough for a countdown printed in minutes. */
export function useNow(everyMs = 30_000): number {
    const [now, setNow] = React.useState(() => Date.now());
    React.useEffect(() => {
        const timer = setInterval(() => setNow(Date.now()), everyMs);
        return () => clearInterval(timer);
    }, [everyMs]);
    return now;
}

const TONE: Record<string, string> = {
    info: "border-line bg-white",
    success: "border-[#bfe3cc] bg-[#f1faf4]",
    warning: "border-[#f3d9a4] bg-[#fff8ea]",
    neutral: "border-line bg-ground",
    danger: "border-[#f3c1c1] bg-[#fdf2f2]",
};

/**
 * RF-1: the reservation as it stands on a campaign — its state, the
 * sentence that explains it, and the countdown to the fee's due time (DUE)
 * or the hold's end (PAID). Drawn on the pay step and the campaign page;
 * the buttons are the caller's.
 */
export function ReservationPanel({ reservation, retainPct, className, children }: { reservation: ReservationView; retainPct: number | null; className?: string; children?: React.ReactNode }) {
    const now = useNow();
    const words = RESERVATION_WORDS[reservation.status] ?? { label: reservation.status, tone: "neutral" as const };
    const deadline = reservationDeadline(reservation);
    return (
        <div className={cn("rounded-md border px-4 py-3", TONE[words.tone], className)}>
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <p className="text-sm font-semibold text-ink">{words.label}</p>
                {deadline && (
                    <p className="text-sm tabular-nums text-ink">
                        <span className="text-dim">{reservation.status === "DUE" ? "Fee due in" : "Held for"}</span> {countdown(deadline, now)}
                    </p>
                )}
            </div>
            <p className="mt-1 text-sm text-ink">{reservationLine(reservation, retainPct, now)}</p>
            {reservation.status === "PAID" && reservation.payable && (
                <p className="mt-1 text-sm text-dim">
                    Balance to pay: <span className="font-semibold text-ink">{rupees(reservation.payable)}</span> · fee paid {rupees(reservation.fee)}
                </p>
            )}
            {children && <div className="mt-3 flex flex-wrap gap-2">{children}</div>}
        </div>
    );
}
