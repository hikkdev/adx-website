"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { compact, dayLabel, foldSlices, niceCeil, shareLabel, type Provenance } from "@/services/campaigns";

/*
 * The analytics pages' parts — tiles, the window chips, the daily columns,
 * the donut and the small profile bars — drawn in plain SVG and HTML on the
 * DR 12 tokens. One series is the brand red; several take the reference
 * categorical order (blue, orange, aqua, yellow, magenta, green) and never
 * cycle: past five, the rest fold into "Other" in a neutral grey. Text
 * always wears the ink tokens; colour sits on the marks and the swatches.
 */

const BRAND = "#bd2020";
const SERIES = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300"];
const OTHER = "#a8a7a1";
const GRID = "#eaeae7";

export const seriesColour = (label: string, index: number): string => (label === "Other" ? OTHER : (SERIES[index] ?? OTHER));

/* ------------------------------------------------------------------ */
/* Tiles                                                               */
/* ------------------------------------------------------------------ */

export function StatTile({ label, value, basis, provenance = "MEASURED", chip, delta, deltaCaption, testId }: { label: string; value: string; basis?: string; provenance?: Provenance; chip?: { label: string; tone: "success" | "warning" } | null; delta?: string | null; deltaCaption?: string; testId?: string }) {
    return (
        <div className="rounded-lg border border-line bg-white px-4 py-4" data-testid={testId}>
            <p className="text-xs text-dim">{label}</p>
            <div className="mt-1 flex flex-wrap items-center gap-2">
                <p className="text-2xl font-semibold tracking-tight text-ink">{value}</p>
                {chip && <span className={cn("inline-flex h-5 items-center rounded-full px-2 text-[11px] font-semibold", chip.tone === "success" ? "bg-success-soft text-success" : "bg-warning-soft text-warning")}>{chip.label}</span>}
            </div>
            {delta && (
                <p className="mt-0.5 text-xs font-semibold text-ink">
                    {delta}
                    {deltaCaption && <span className="font-normal text-dim"> {deltaCaption}</span>}
                </p>
            )}
            {basis && (
                <p className="mt-1 line-clamp-2 text-[11px] text-dim">
                    {provenance === "ESTIMATED" ? "Estimated · " : provenance === "REPORTED" ? "Reported · " : ""}
                    {basis}
                </p>
            )}
        </div>
    );
}

/** The window chips: 7, 30 or 90 days, each the comparison window too. */
export function WindowChips({ value, onChange, options = [7, 30, 90] }: { value: number; onChange: (days: number) => void; options?: readonly number[] }) {
    return (
        <div role="tablist" aria-label="Time range" className="inline-flex h-[34px] items-center rounded-full bg-[#3a3a3d] p-[3px]">
            {options.map((days) => {
                const active = days === value;
                return (
                    <button key={days} type="button" role="tab" aria-selected={active} onClick={() => onChange(days)} className={cn("h-7 rounded-full px-4 text-xs font-semibold transition-colors", active ? "bg-white text-ink" : "text-white/85 hover:text-white")}>
                        {days} days
                    </button>
                );
            })}
        </div>
    );
}

/* ------------------------------------------------------------------ */
/* Daily columns                                                       */
/* ------------------------------------------------------------------ */

/**
 * One column a day, one series: the columns grow from a hairline baseline,
 * capped at 24px wide with a rounded top; the axis carries 0, half and the
 * clean top. Hover (or focus) a day for its figures; "Show as a table"
 * lists every day for anyone who cannot read the marks.
 */
export function DailyColumns({ points, unit, caption, extra }: { points: { day: string; value: number }[]; unit: string; caption: string; extra?: (day: string) => string | null }) {
    const [hover, setHover] = React.useState<number | null>(null);
    const [table, setTable] = React.useState(false);
    const peak = Math.max(0, ...points.map((p) => p.value));
    const top = niceCeil(peak);
    const labelEvery = points.length > 14 ? Math.ceil(points.length / 7) : 1;
    const total = points.reduce((sum, p) => sum + p.value, 0);
    const active = hover !== null ? points[hover] : null;

    return (
        <div>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-xs text-dim">{caption}</p>
                <p className="text-xs text-dim">
                    {total.toLocaleString("en-IN")} {unit} in all · peak {peak.toLocaleString("en-IN")} a day
                </p>
            </div>
            {points.length === 0 || peak === 0 ? (
                <p className="mt-4 rounded-md bg-ground px-4 py-6 text-center text-sm text-dim">{points.length === 0 ? "No days recorded in this window yet." : `No ${unit} in these ${points.length} days yet — the columns appear with the first one.`}</p>
            ) : (
                <div className="mt-3 flex gap-2">
                    <div className="flex h-40 w-10 shrink-0 flex-col justify-between pb-5 text-right text-[10px] tabular-nums text-dim" aria-hidden>
                        <span>{compact(top)}</span>
                        <span>{Number.isInteger(top / 2) ? compact(top / 2) : ""}</span>
                        <span>0</span>
                    </div>
                    <div className="relative min-w-0 flex-1">
                        <div className="pointer-events-none absolute inset-x-0 top-0 h-[140px]" aria-hidden>
                            {[0, 0.5, 1].map((f) => (
                                <div key={f} className="absolute inset-x-0 border-t" style={{ top: `${f * 100}%`, borderColor: GRID }} />
                            ))}
                        </div>
                        <div className="relative flex h-[140px] items-end gap-[2px]" onMouseLeave={() => setHover(null)}>
                            {points.map((point, index) => {
                                const height = top > 0 ? (point.value / top) * 100 : 0;
                                return (
                                    <button
                                        key={point.day}
                                        type="button"
                                        onMouseEnter={() => setHover(index)}
                                        onFocus={() => setHover(index)}
                                        onBlur={() => setHover(null)}
                                        className="flex h-full min-w-0 flex-1 items-end justify-center focus:outline-none"
                                        aria-label={`${dayLabel(point.day)}: ${point.value.toLocaleString("en-IN")} ${unit}`}
                                    >
                                        <span
                                            className="block w-full max-w-[24px] rounded-t-[4px] transition-opacity"
                                            style={{ height: `${Math.max(height, point.value > 0 ? 2 : 0.6)}%`, background: point.value > 0 ? BRAND : GRID, opacity: hover === null || hover === index ? 1 : 0.45 }}
                                        />
                                    </button>
                                );
                            })}
                        </div>
                        <div className="mt-1 flex h-4 gap-[2px] text-[10px] text-dim" aria-hidden>
                            {points.map((point, index) => (
                                <span key={point.day} className="min-w-0 flex-1 overflow-visible whitespace-nowrap text-center">
                                    {index % labelEvery === 0 ? dayLabel(point.day).split(" ")[0] : ""}
                                </span>
                            ))}
                        </div>
                        {active && hover !== null && (
                            <div className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 rounded-md border border-line bg-white px-3 py-2 text-xs shadow-card" style={{ left: `${((hover + 0.5) / points.length) * 100}%` }}>
                                <p className="font-semibold text-ink">{dayLabel(active.day)}</p>
                                <p className="text-ink">
                                    {active.value.toLocaleString("en-IN")} {unit}
                                </p>
                                {extra?.(active.day) && <p className="text-dim">{extra(active.day)}</p>}
                            </div>
                        )}
                    </div>
                </div>
            )}
            {points.length > 0 && peak > 0 && (
                <button type="button" onClick={() => setTable((v) => !v)} className="mt-2 text-xs font-medium text-dim underline underline-offset-2 hover:text-ink">
                    {table ? "Hide the table" : "Show as a table"}
                </button>
            )}
            {table && (
                <div className="mt-2 max-h-56 overflow-y-auto rounded-md border border-line">
                    <table className="w-full text-xs">
                        <thead>
                            <tr className="bg-ground text-dim">
                                <th className="px-3 py-2 text-left font-medium">Day</th>
                                <th className="px-3 py-2 text-right font-medium">{unit.charAt(0).toUpperCase() + unit.slice(1)}</th>
                                {extra && <th className="px-3 py-2 text-right font-medium">Spend</th>}
                            </tr>
                        </thead>
                        <tbody>
                            {points.map((point) => (
                                <tr key={point.day} className="border-t border-line">
                                    <td className="px-3 py-1.5 text-ink">{dayLabel(point.day)}</td>
                                    <td className="px-3 py-1.5 text-right tabular-nums text-ink">{point.value.toLocaleString("en-IN")}</td>
                                    {extra && <td className="px-3 py-1.5 text-right tabular-nums text-dim">{extra(point.day) ?? "—"}</td>}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}

/* ------------------------------------------------------------------ */
/* Donut                                                               */
/* ------------------------------------------------------------------ */

/**
 * A donut with its legend: one arc per slice, a 2px surface gap between
 * arcs, the largest slice's share in the centre, and every slice named in
 * the legend with its number — a wedge without a number is a shape, not a
 * measurement. `share` takes each count as a percentage already.
 */
export function Donut({ slices, unit = "count", centre, testId }: { slices: { label: string; count: number }[]; unit?: "count" | "share"; centre?: { value: string; label: string }; testId?: string }) {
    const [hover, setHover] = React.useState<string | null>(null);
    const arcs = foldSlices(slices);
    const total = arcs.reduce((sum, slice) => sum + slice.count, 0);
    const size = 148;
    const stroke = 24;
    const r = (size - stroke) / 2;
    const circumference = 2 * Math.PI * r;
    const gap = arcs.length > 1 ? 2 : 0;
    let offset = 0;
    const focused = hover ? arcs.find((a) => a.label === hover) : null;
    const middle = focused ? { value: unit === "share" ? `${shareLabel(focused.count)}%` : focused.count.toLocaleString("en-IN"), label: focused.label } : centre;

    return (
        <div className="flex flex-wrap items-center gap-6" data-testid={testId}>
            <div className="relative shrink-0" style={{ width: size, height: size }}>
                <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={arcs.map((a) => `${a.label} ${unit === "share" ? `${shareLabel(a.count)}%` : a.count}`).join(", ")}>
                    <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={GRID} strokeWidth={stroke} />
                    {total > 0 &&
                        arcs.map((slice, index) => {
                            const length = (slice.count / total) * circumference;
                            const drawn = Math.max(length - gap, 0.5);
                            const arc = (
                                <circle
                                    key={slice.label}
                                    cx={size / 2}
                                    cy={size / 2}
                                    r={r}
                                    fill="none"
                                    stroke={seriesColour(slice.label, index)}
                                    strokeWidth={hover === slice.label ? stroke + 4 : stroke}
                                    strokeDasharray={`${drawn} ${circumference - drawn}`}
                                    strokeDashoffset={-offset}
                                    transform={`rotate(-90 ${size / 2} ${size / 2})`}
                                    onMouseEnter={() => setHover(slice.label)}
                                    onMouseLeave={() => setHover(null)}
                                    style={{ opacity: hover === null || hover === slice.label ? 1 : 0.5, transition: "opacity 120ms" }}
                                />
                            );
                            offset += length;
                            return arc;
                        })}
                </svg>
                {middle && (
                    <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-8 text-center">
                        <span className="text-lg font-semibold text-ink">{middle.value}</span>
                        <span className="line-clamp-2 text-[11px] leading-tight text-dim">{middle.label}</span>
                    </div>
                )}
            </div>
            <ul className="min-w-[200px] flex-1 space-y-1.5">
                {unit === "count" && (
                    <li className="text-sm font-semibold text-ink">
                        {total.toLocaleString("en-IN")} in all
                    </li>
                )}
                {arcs.map((slice, index) => (
                    <li key={slice.label} className="flex items-center gap-2 text-xs" onMouseEnter={() => setHover(slice.label)} onMouseLeave={() => setHover(null)}>
                        <span className="size-2.5 shrink-0 rounded-full" style={{ background: seriesColour(slice.label, index) }} aria-hidden />
                        <span className="min-w-0 flex-1 truncate text-dim">{slice.label}</span>
                        <span className="tabular-nums text-ink">{unit === "share" ? `${shareLabel(slice.count)}%` : `${slice.count.toLocaleString("en-IN")} · ${total ? Math.round((slice.count / total) * 100) : 0}%`}</span>
                    </li>
                ))}
            </ul>
        </div>
    );
}

/* ------------------------------------------------------------------ */
/* Small profile bars and share bars                                   */
/* ------------------------------------------------------------------ */

/** A footfall profile — shares by weekday or by hour — as small columns; the peak is the scale and is named. */
export function ProfileBars({ bars, caption, testId }: { bars: { label: string; value: number }[]; caption: string; testId?: string }) {
    const peak = Math.max(...bars.map((bar) => bar.value), 0);
    const every = bars.length > 12 ? 3 : 1;
    return (
        <div data-testid={testId}>
            <p className="text-xs font-medium text-ink">{caption}</p>
            <div className="mt-2 flex h-16 items-end gap-[2px]" role="img" aria-label={`${caption}: ${bars.map((bar) => `${bar.label} ${shareLabel(bar.value)}%`).join(", ")}`}>
                {bars.map((bar) => (
                    <div key={bar.label} className="flex h-full min-w-0 flex-1 items-end justify-center" title={`${bar.label} · ${shareLabel(bar.value)}%`}>
                        <span className="block w-full max-w-[18px] rounded-t-[3px]" style={{ height: `${peak > 0 ? Math.max((bar.value / peak) * 100, bar.value > 0 ? 4 : 1) : 1}%`, background: bar.value > 0 ? SERIES[0] : GRID }} />
                    </div>
                ))}
            </div>
            <div className="mt-1 flex gap-[2px] text-[10px] text-dim" aria-hidden>
                {bars.map((bar, index) => (
                    <span key={bar.label} className="min-w-0 flex-1 text-center">
                        {index % every === 0 ? bar.label : ""}
                    </span>
                ))}
            </div>
            <p className="mt-1 text-[11px] text-dim">Peak {shareLabel(peak)}% of footfall</p>
        </div>
    );
}

/** A labelled meter per row — what was bought, by media type. */
export function ShareBars({ rows }: { rows: { label: string; share: number; value: string }[] }) {
    return (
        <ul className="space-y-3">
            {rows.map((row) => (
                <li key={row.label}>
                    <div className="flex items-baseline justify-between gap-3 text-sm">
                        <span className="min-w-0 text-ink">{row.label}</span>
                        <span className="shrink-0 whitespace-nowrap tabular-nums text-dim">
                            {shareLabel(row.share)}% · {row.value}
                        </span>
                    </div>
                    <div className="mt-1 h-1.5 rounded-full bg-ground">
                        <div className="h-1.5 rounded-full" style={{ width: `${Math.min(Math.max(row.share, 0), 100)}%`, background: BRAND }} />
                    </div>
                </li>
            ))}
        </ul>
    );
}
