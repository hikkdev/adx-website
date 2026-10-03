"use client";

import * as React from "react";
import { CalendarCheck, ChevronLeft, ChevronRight } from "lucide-react";
import { messageOf } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import {
    addDays,
    AVAILABILITY_MAX_DAYS,
    browseService,
    DAY_STATE_LABEL,
    datesFit,
    dateSpan,
    dayDetail,
    dayState,
    fitLine,
    monthEnd,
    monthLabel,
    monthStart,
    monthWeeks,
    nextFreeLine,
    spanDays,
    utcToday,
    weekdayDate,
    type AvailabilityDay,
    type DayState,
    type ListingAvailability,
} from "@/services/browse";

/**
 * AV-1 (the owner, 27 Sep 2026): the listing page's availability — two
 * months of days, each free, partly booked (a screen with some of its loop
 * sold), booked, or blocked by the publisher, with a legend in words, the
 * next free day and, when the visitor brought dates, whether they fit and
 * the earliest run of the same length that does. Counted per day; a space
 * has no time-of-day slots.
 *
 * Two reads: the summary from today to the 186-day cap (the next free day,
 * the suggestion, and the days it covers), and — only for months past it —
 * the two months on screen.
 */

/** How far ahead the calendar pages. */
const MONTHS_AHEAD = 12;

const CELL: Record<DayState, string> = {
    free: "bg-success-soft text-success",
    partly: "bg-warning-soft text-warning",
    booked: "bg-brand-soft text-brand line-through decoration-2",
    blocked: "text-dim [background-image:repeating-linear-gradient(135deg,#eaeae7_0,#eaeae7_2px,#f8f8f6_2px,#f8f8f6_6px)]",
    past: "text-dim/50",
};

export interface AvailabilityCalendarProps {
    listingId: string;
    slotsTotal: number;
    /** A screen can be partly booked; a static wall cannot. */
    digital: boolean;
    /** The visitor's dates, when they brought some — checked against the days. */
    chosen?: { from: string; to: string } | null;
    /** Slots the visitor wants on each day. */
    quantity?: number;
    /** Take the suggested dates. */
    onApply?: (from: string, to: string) => void;
    /** For tests: today as the backend counts it. */
    today?: string;
}

type Read = { key: string; value: ListingAvailability | null; error: string | null };

export function AvailabilityCalendar({ listingId, slotsTotal, digital, chosen = null, quantity = 1, onApply, today: todayProp }: AvailabilityCalendarProps) {
    const today = todayProp ?? utcToday();
    const horizon = addDays(today, AVAILABILITY_MAX_DAYS - 1);
    const length = chosen ? spanDays(chosen.from, chosen.to) : 0;
    const firstMonth = monthStart(today);
    const lastMonth = monthStart(today, MONTHS_AHEAD - 1);
    const [shown, setShown] = React.useState(() => (chosen && chosen.from >= today && chosen.from <= horizon ? monthStart(chosen.from) : firstMonth));
    const [focused, setFocused] = React.useState<string>(() => (chosen && chosen.from >= today ? chosen.from : today));
    const [inspected, setInspected] = React.useState<string | null>(null);
    const focusNext = React.useRef(false);
    const gridRef = React.useRef<HTMLDivElement>(null);

    /* The summary: today to the cap, asked for the visitor's length and quantity. */
    const summaryKey = `${listingId}|${today}|${length}|${quantity}`;
    const [summary, setSummary] = React.useState<Read>({ key: "", value: null, error: null });
    React.useEffect(() => {
        let cancelled = false;
        browseService
            .availability(listingId, { from: today, to: horizon, ...(length > 0 ? { length } : {}), quantity })
            .then((value) => !cancelled && setSummary({ key: summaryKey, value, error: null }))
            .catch((caught: unknown) => !cancelled && setSummary({ key: summaryKey, value: null, error: messageOf(caught, "Could not read this space's calendar.") }));
        return () => {
            cancelled = true;
        };
    }, [listingId, today, horizon, length, quantity, summaryKey]);

    /* The months on screen, when they run past the summary. */
    const second = monthStart(shown, 1);
    const viewTo = monthEnd(second);
    const viewFrom = shown < today ? today : shown;
    const needsView = viewTo > horizon;
    const viewKey = `${listingId}|${viewFrom}|${viewTo}`;
    const [view, setView] = React.useState<Read>({ key: "", value: null, error: null });
    React.useEffect(() => {
        if (!needsView) return;
        let cancelled = false;
        browseService
            .availability(listingId, { from: viewFrom, to: viewTo })
            .then((value) => !cancelled && setView({ key: viewKey, value, error: null }))
            .catch((caught: unknown) => !cancelled && setView({ key: viewKey, value: null, error: messageOf(caught, "Could not read these months.") }));
        return () => {
            cancelled = true;
        };
    }, [listingId, needsView, viewFrom, viewTo, viewKey]);

    const current = summary.key === summaryKey ? summary : null;
    const currentView = needsView && view.key === viewKey ? view : null;
    const days = React.useMemo(() => {
        const map = new Map<string, AvailabilityDay>();
        for (const day of current?.value?.days ?? []) map.set(day.date, day);
        for (const day of currentView?.value?.days ?? []) map.set(day.date, day);
        return map;
    }, [current, currentView]);
    const loading = !current || (needsView && !currentView);
    const error = current?.error ?? currentView?.error ?? null;

    const stateOf = (date: string): DayState | null => {
        if (date < today) return "past";
        const day = days.get(date);
        return day ? dayState(day, slotsTotal) : null;
    };
    const detailOf = (date: string): string => {
        if (date < today) return `${weekdayDate(date)} · Past`;
        const day = days.get(date);
        return day ? `${weekdayDate(date)} · ${dayDetail(day, slotsTotal)}` : `${weekdayDate(date)} · Reading…`;
    };
    const inChosen = (date: string) => !!chosen && length > 0 && date >= chosen.from && date <= chosen.to;

    /* Arrow keys walk the days; the months follow the focus. */
    React.useEffect(() => {
        if (!focusNext.current) return;
        focusNext.current = false;
        gridRef.current?.querySelector<HTMLButtonElement>(`[data-date="${focused}"]`)?.focus();
    }, [focused, shown]);

    const moveFocus = (to: string) => {
        const clamped = to < firstMonth ? firstMonth : to > monthEnd(lastMonth) ? monthEnd(lastMonth) : to;
        if (clamped < shown) setShown(monthStart(clamped));
        else if (clamped > monthEnd(monthStart(shown, 1))) setShown(monthStart(clamped, -1));
        focusNext.current = true;
        setFocused(clamped);
        setInspected(clamped);
    };
    const onKeyDown = (event: React.KeyboardEvent) => {
        const step: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
        if (event.key in step) {
            event.preventDefault();
            moveFocus(addDays(focused, step[event.key]!));
        } else if (event.key === "Home" || event.key === "End") {
            event.preventDefault();
            moveFocus(event.key === "Home" ? monthStart(focused) : monthEnd(focused));
        } else if (event.key === "PageUp" || event.key === "PageDown") {
            event.preventDefault();
            moveFocus(addDays(focused, event.key === "PageUp" ? -28 : 28));
        }
    };
    const page = (by: number) => {
        const next = monthStart(shown, by);
        if (next < firstMonth || monthStart(next, 1) > lastMonth) return;
        setShown(next);
        if (focused < next || focused > monthEnd(monthStart(next, 1))) setFocused(next < today ? today : next);
    };

    const fits = current?.value && chosen && length > 0 ? datesFit(current.value.days, chosen.from, chosen.to, quantity) : null;
    const suggestion = current?.value ? fitLine(current.value.nextFit) : null;
    const nextFit = current?.value?.nextFit ?? null;
    const legend: DayState[] = digital && slotsTotal > 1 ? ["free", "partly", "booked", "blocked", "past"] : ["free", "booked", "blocked", "past"];

    return (
        <div className="rounded-2xl border border-line bg-white p-4 sm:p-6" data-testid="availability-calendar">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="flex items-center gap-2 text-sm font-semibold text-ink" data-testid="availability-next-free">
                    <CalendarCheck className="size-4 text-brand" aria-hidden />
                    {current?.value ? nextFreeLine(current.value, today) : error ? "Availability unavailable" : "Reading availability…"}
                </p>
                <div className="flex items-center gap-2">
                    <button type="button" onClick={() => page(-1)} disabled={shown <= firstMonth} aria-label="Earlier months" className="flex size-9 items-center justify-center rounded-full border border-line text-ink hover:border-ink disabled:cursor-not-allowed disabled:opacity-40">
                        <ChevronLeft className="size-4" aria-hidden />
                    </button>
                    <button type="button" onClick={() => page(1)} disabled={monthStart(shown, 1) >= lastMonth} aria-label="Later months" className="flex size-9 items-center justify-center rounded-full border border-line text-ink hover:border-ink disabled:cursor-not-allowed disabled:opacity-40">
                        <ChevronRight className="size-4" aria-hidden />
                    </button>
                </div>
            </div>

            {error && <p className="mt-3 text-sm text-dim">{error}</p>}

            <div ref={gridRef} onKeyDown={onKeyDown} className="mt-4 grid gap-6 md:grid-cols-2" aria-busy={loading}>
                {[shown, second].map((month) => (
                    <Month key={month} month={month} focused={focused} stateOf={stateOf} detailOf={detailOf} inChosen={inChosen} slotsTotal={slotsTotal} days={days} digital={digital} onInspect={(date) => { setFocused(date); setInspected(date); }} onHover={setInspected} />
                ))}
            </div>

            <p className="mt-4 min-h-5 text-sm text-ink" aria-live="polite" data-testid="availability-detail">
                {inspected ? detailOf(inspected) : <span className="text-dim">Tap or focus a day to see what is left on it.</span>}
            </p>

            <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-xs text-ink" aria-label="Legend" data-testid="availability-legend">
                {legend.map((state) => (
                    <li key={state} className="flex items-center gap-2">
                        <span className={cn("flex size-5 items-center justify-center rounded text-[10px] font-semibold", CELL[state], state === "past" && "border border-line")} aria-hidden>
                            {state === "past" ? "" : "7"}
                        </span>
                        {DAY_STATE_LABEL[state]}
                        {state === "partly" && <span className="text-dim">(some of the loop sold)</span>}
                    </li>
                ))}
                {chosen && length > 0 && (
                    <li className="flex items-center gap-2">
                        <span className="size-5 rounded ring-2 ring-inset ring-ink" aria-hidden />
                        Your dates
                    </li>
                )}
            </ul>

            {chosen && length > 0 && current?.value && fits !== null && (
                <div className={cn("mt-5 rounded-xl px-4 py-3 text-sm", fits ? "bg-success-soft text-ink" : "bg-brand-soft text-ink")} data-testid="availability-verdict" role="status">
                    {fits ? (
                        <p>
                            <span className="font-semibold">Your dates are free.</span> {dateSpan(chosen.from, chosen.to)} · {length} day{length === 1 ? "" : "s"}
                            {quantity > 1 ? ` · ${quantity} slots a day` : ""}
                        </p>
                    ) : (
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <p>
                                <span className="font-semibold">These dates are taken.</span>{" "}
                                {suggestion ?? `No run of ${length} free day${length === 1 ? "" : "s"} in the next six months.`}
                            </p>
                            {nextFit && onApply && (
                                <button type="button" onClick={() => onApply(nextFit.from, nextFit.to)} className="inline-flex h-10 shrink-0 items-center rounded-md bg-brand px-4 text-sm font-semibold text-white hover:bg-[#a51b1b]">
                                    Use {dateSpan(nextFit.from, nextFit.to)}
                                </button>
                            )}
                        </div>
                    )}
                </div>
            )}
            {chosen && length > 0 && current?.value && fits === null && chosen.from < today && <p className="mt-5 text-sm text-dim">Your dates have passed — pick new ones.</p>}
        </div>
    );
}

function Month({
    month,
    focused,
    stateOf,
    detailOf,
    inChosen,
    slotsTotal,
    days,
    digital,
    onInspect,
    onHover,
}: {
    month: string;
    focused: string;
    stateOf: (date: string) => DayState | null;
    detailOf: (date: string) => string;
    inChosen: (date: string) => boolean;
    slotsTotal: number;
    days: Map<string, AvailabilityDay>;
    digital: boolean;
    onInspect: (date: string) => void;
    onHover: (date: string | null) => void;
}) {
    const weeks = monthWeeks(month);
    const label = monthLabel(month);
    return (
        <div>
            <p className="text-center text-sm font-semibold text-ink" id={`month-${month}`}>
                {label}
            </p>
            <table role="grid" aria-labelledby={`month-${month}`} className="mt-3 w-full table-fixed border-separate border-spacing-1">
                <thead>
                    <tr>
                        {["M", "T", "W", "T", "F", "S", "S"].map((letter, index) => (
                            <th key={index} scope="col" className="pb-1 text-center text-[11px] font-semibold text-dim">
                                <abbr title={["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"][index]} className="no-underline">
                                    {letter}
                                </abbr>
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {weeks.map((week, row) => (
                        <tr key={row}>
                            {week.map((date, col) => {
                                if (!date) return <td key={col} />;
                                const state = stateOf(date);
                                const day = days.get(date);
                                const detail = detailOf(date);
                                const showLeft = digital && slotsTotal > 1 && state === "partly" && day;
                                return (
                                    <td key={col} className="p-0">
                                        <button
                                            type="button"
                                            data-date={date}
                                            data-state={state ?? "loading"}
                                            tabIndex={date === focused ? 0 : -1}
                                            aria-label={detail}
                                            title={detail}
                                            onClick={() => onInspect(date)}
                                            onFocus={() => onInspect(date)}
                                            onMouseEnter={() => onHover(date)}
                                            className={cn(
                                                "flex h-11 w-full flex-col items-center justify-center rounded-md text-sm font-medium tabular-nums focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ink",
                                                state ? CELL[state] : "animate-pulse bg-ground text-dim",
                                                inChosen(date) && "ring-2 ring-inset ring-ink"
                                            )}
                                        >
                                            <span aria-hidden>{Number(date.slice(8, 10))}</span>
                                            {showLeft && (
                                                <span aria-hidden className="text-[9px] font-semibold leading-none no-underline">
                                                    {day.left}/{slotsTotal}
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
