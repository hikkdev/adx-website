"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { messageOf } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { monthEnd, monthLabel, monthStart, monthWeeks } from "@/services/browse";
import { addDays, fullDays, runDays, runLabel, utcToday, type SlotDay } from "@/services/promotions";

/**
 * LM-1: the per-day availability of an ad slot or a sponsored placement,
 * and the run picked on it — the first tap is the first day, the second the
 * last. Each day shows how many places are left on it (the capacity is
 * counted per day, so the busiest day of a run decides). One read covers
 * today to the 186-day cap the backend answers; nothing past it is sold.
 */
export const PROMOTION_HORIZON_DAYS = 186;

export interface DaysCalendarProps {
    /** Reads the days in [from, to] — the slot's availability, or the placements' merged. */
    load: (from: string, to: string) => Promise<SlotDay[]>;
    /** Re-read when this changes (a different slot, different placements). */
    loadKey: string;
    capacity: number;
    value: { from: string; to: string } | null;
    onChange: (next: { from: string; to: string } | null) => void;
    minDays?: number;
    /** For tests: today as the backend counts it. */
    today?: string;
}

export function DaysCalendar({ load, loadKey, capacity, value, onChange, minDays = 1, today: todayProp }: DaysCalendarProps) {
    const today = todayProp ?? utcToday();
    const horizon = addDays(today, PROMOTION_HORIZON_DAYS - 1);
    const [shown, setShown] = React.useState(() => monthStart(value?.from ?? today));
    const [pending, setPending] = React.useState<string | null>(null);
    const [read, setRead] = React.useState<{ key: string; days: Map<string, SlotDay> | null; error: string | null }>({ key: "", days: null, error: null });
    const loadRef = React.useRef(load);
    React.useEffect(() => {
        loadRef.current = load;
    });

    const readKey = `${loadKey}|${today}`;
    React.useEffect(() => {
        let cancelled = false;
        loadRef
            .current(today, horizon)
            .then((rows) => !cancelled && setRead({ key: readKey, days: new Map(rows.map((row) => [row.date, row])), error: null }))
            .catch((caught: unknown) => !cancelled && setRead({ key: readKey, days: null, error: messageOf(caught, "Could not read the free days.") }));
        return () => {
            cancelled = true;
        };
    }, [readKey, today, horizon]);

    const current = read.key === readKey ? read : null;
    const days = current?.days ?? null;
    const lastMonth = monthStart(horizon);
    const second = monthStart(shown, 1);

    const pick = (date: string) => {
        if (!pending) {
            setPending(date);
            onChange({ from: date, to: date });
            return;
        }
        if (date < pending) {
            setPending(date);
            onChange({ from: date, to: date });
            return;
        }
        onChange({ from: pending, to: date });
        setPending(null);
    };

    const full = value && days ? fullDays([...days.values()], value.from, value.to) : [];
    const length = value ? runDays(value.from, value.to) : 0;
    const tooShort = value && !pending && length > 0 && length < minDays;

    return (
        <div className="rounded-lg border border-line bg-white p-4" data-testid="days-calendar">
            <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-ink">{current?.error ? "Availability unavailable" : days ? "Tap the first day, then the last" : "Reading the free days…"}</p>
                <div className="flex items-center gap-2">
                    <button type="button" onClick={() => setShown(monthStart(shown, -1))} disabled={shown <= monthStart(today)} aria-label="Earlier months" className="flex size-9 items-center justify-center rounded-full border border-line text-ink hover:border-ink disabled:cursor-not-allowed disabled:opacity-40">
                        <ChevronLeft className="size-4" aria-hidden />
                    </button>
                    <button type="button" onClick={() => setShown(monthStart(shown, 1))} disabled={second >= lastMonth} aria-label="Later months" className="flex size-9 items-center justify-center rounded-full border border-line text-ink hover:border-ink disabled:cursor-not-allowed disabled:opacity-40">
                        <ChevronRight className="size-4" aria-hidden />
                    </button>
                </div>
            </div>
            {current?.error && <p className="mt-2 text-sm text-dim">{current.error}</p>}
            <div className="mt-4 grid gap-6 md:grid-cols-2" aria-busy={!current}>
                {[shown, second].map((month) => (
                    <Month key={month} month={month} today={today} horizon={horizon} days={days} capacity={capacity} value={value} onPick={pick} />
                ))}
            </div>
            <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-xs text-ink" aria-label="Legend">
                <li className="flex items-center gap-2">
                    <span className="size-4 rounded bg-success-soft" aria-hidden />
                    Room left (the number is how many places)
                </li>
                <li className="flex items-center gap-2">
                    <span className="size-4 rounded bg-brand-soft" aria-hidden />
                    Full
                </li>
                <li className="flex items-center gap-2">
                    <span className="size-4 rounded ring-2 ring-inset ring-ink" aria-hidden />
                    Your dates
                </li>
            </ul>
            <div className="mt-4 min-h-5 text-sm" aria-live="polite">
                {value ? (
                    full.length > 0 ? (
                        <p className="text-danger" data-testid="calendar-full">
                            {full.length === 1 ? "One day" : `${full.length} days`} in this run {full.length === 1 ? "is" : "are"} full ({full.slice(0, 4).join(", ")}{full.length > 4 ? "…" : ""}). Pick a run around {full.length === 1 ? "it" : "them"}.
                        </p>
                    ) : tooShort ? (
                        <p className="text-danger">The shortest run here is {minDays} days.</p>
                    ) : (
                        <p className="text-ink">
                            <span className="font-semibold">{pending ? "Now tap the last day." : "Your dates:"}</span> {runLabel(value.from, value.to)}
                        </p>
                    )
                ) : (
                    <p className="text-dim">No dates picked yet.</p>
                )}
            </div>
        </div>
    );
}

function Month({ month, today, horizon, days, capacity, value, onPick }: { month: string; today: string; horizon: string; days: Map<string, SlotDay> | null; capacity: number; value: { from: string; to: string } | null; onPick: (date: string) => void }) {
    const weeks = monthWeeks(month);
    return (
        <div>
            <p className="text-center text-sm font-semibold text-ink">{monthLabel(month)}</p>
            <table role="grid" aria-label={monthLabel(month)} className="mt-3 w-full table-fixed border-separate border-spacing-1">
                <thead>
                    <tr>
                        {["M", "T", "W", "T", "F", "S", "S"].map((letter, index) => (
                            <th key={index} scope="col" className="pb-1 text-center text-[11px] font-semibold text-dim">
                                {letter}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {weeks.map((week, row) => (
                        <tr key={row}>
                            {week.map((date, col) => {
                                if (!date || date > monthEnd(month)) return <td key={col} />;
                                const outside = date < today || date > horizon;
                                const day = days?.get(date);
                                const left = day ? Math.max(0, day.left) : null;
                                const isFull = left !== null && left <= 0;
                                const chosen = !!value && date >= value.from && date <= value.to;
                                const label = outside ? `${date} · not on sale` : left === null ? `${date} · reading…` : isFull ? `${date} · full` : `${date} · ${left} of ${capacity} left`;
                                return (
                                    <td key={col} className="p-0">
                                        <button
                                            type="button"
                                            disabled={outside}
                                            data-date={date}
                                            aria-label={label}
                                            aria-pressed={chosen}
                                            title={label}
                                            onClick={() => onPick(date)}
                                            className={cn(
                                                "flex h-11 w-full flex-col items-center justify-center rounded-md text-sm font-medium tabular-nums",
                                                outside ? "cursor-not-allowed text-dim/50" : left === null ? "animate-pulse bg-ground text-dim" : isFull ? "bg-brand-soft text-brand line-through" : "bg-success-soft text-success hover:ring-1 hover:ring-ink",
                                                chosen && "ring-2 ring-inset ring-ink"
                                            )}
                                        >
                                            <span aria-hidden>{Number(date.slice(8, 10))}</span>
                                            {!outside && left !== null && !isFull && (
                                                <span aria-hidden className="text-[9px] font-semibold leading-none">
                                                    {left} left
                                                </span>
                                            )}
                                        </button>
                                    </td>
                                );
                            })}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
