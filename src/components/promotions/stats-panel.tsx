"use client";

import * as React from "react";
import { ctrLabel, dayLabel, type PromotionStats } from "@/services/promotions";

/**
 * LM-1: what a paid placement did — impressions (seen at least half on
 * screen for a second), clicks, and the click-through rate, then the same
 * by day as a small bar table. Honest when there is nothing yet.
 */
export function StatsPanel({ stats, className }: { stats: PromotionStats | null | undefined; className?: string }) {
    const days = stats?.byDay ?? [];
    const peak = Math.max(1, ...days.map((day) => day.impressions));
    return (
        <section className={`rounded-lg border border-line bg-white p-6 ${className ?? ""}`} data-testid="promotion-stats">
            <h2 className="text-base font-semibold text-ink">Performance</h2>
            <dl className="mt-4 grid grid-cols-3 gap-4">
                <Figure label="Impressions" value={(stats?.impressions ?? 0).toLocaleString("en-IN")} />
                <Figure label="Clicks" value={(stats?.clicks ?? 0).toLocaleString("en-IN")} />
                <Figure label="Click-through rate" value={ctrLabel(stats)} />
            </dl>
            <p className="mt-2 text-xs text-dim">An impression counts when at least half of it is on screen for a second, once per page view.</p>
            {days.length === 0 ? (
                <p className="mt-5 text-sm text-dim">No views yet — the figures start on the first day it runs.</p>
            ) : (
                <div className="mt-5 overflow-x-auto">
                    <table className="w-full min-w-[480px] text-sm">
                        <thead>
                            <tr>
                                <th className="bg-ground px-3 py-2 text-left text-xs font-medium text-dim">Day</th>
                                <th className="bg-ground px-3 py-2 text-left text-xs font-medium text-dim">Impressions</th>
                                <th className="bg-ground px-3 py-2 text-right text-xs font-medium text-dim">Clicks</th>
                                <th className="bg-ground px-3 py-2 text-right text-xs font-medium text-dim">CTR</th>
                            </tr>
                        </thead>
                        <tbody>
                            {days.map((day) => (
                                <tr key={day.date} className="border-t border-line">
                                    <td className="whitespace-nowrap px-3 py-2 text-ink">{dayLabel(day.date)}</td>
                                    <td className="px-3 py-2">
                                        <div className="flex items-center gap-2">
                                            <span className="h-2 rounded-full bg-brand" style={{ width: `${Math.max(2, Math.round((day.impressions / peak) * 160))}px` }} aria-hidden />
                                            <span className="tabular-nums text-ink">{day.impressions.toLocaleString("en-IN")}</span>
                                        </div>
                                    </td>
                                    <td className="px-3 py-2 text-right tabular-nums text-ink">{day.clicks.toLocaleString("en-IN")}</td>
                                    <td className="px-3 py-2 text-right tabular-nums text-dim">{ctrLabel({ impressions: day.impressions, clicks: day.clicks, ctr: null })}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </section>
    );
}

function Figure({ label, value }: { label: string; value: string }) {
    return (
        <div className="rounded-md bg-ground px-4 py-3">
            <dt className="text-xs text-dim">{label}</dt>
            <dd className="mt-1 text-xl font-semibold tabular-nums text-ink">{value}</dd>
        </div>
    );
}
