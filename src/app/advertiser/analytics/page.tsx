"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { PageHeading, Panel } from "@/components/workspace/page-heading";
import { btnOutline, btnPrimary, Cell, ErrorPanel, inputClass, LoadingLine, StatusChip, TablePanel, Td, Th, useAsync } from "@/components/advertiser/bits";
import { DailyColumns, StatTile, WindowChips } from "@/components/advertiser/analytics-parts";
import { campaignStatusLabel, dateRange } from "@/services/advertiser-workspace";
import { campaignsService, compact, deltaLabel, formatMoney, pacingChip, percentLabel, windowOf, type CampaignStatus } from "@/services/campaigns";

/**
 * Analytics across every campaign — the app's "See full analytics"
 * (`GET /campaigns/analytics`): four tiles with this window against the one
 * before it, the daily scans, and the campaigns themselves, searchable by
 * name, brand or reference, each opening its own analytics. Nothing here
 * is modelled: a figure that cannot be measured says so on its tile.
 */
export default function AnalyticsPage() {
    return (
        <React.Suspense fallback={<LoadingLine>Loading your analytics…</LoadingLine>}>
            <Portfolio />
        </React.Suspense>
    );
}

function Portfolio() {
    const router = useRouter();
    const pathname = usePathname();
    const params = useSearchParams();
    const days = windowOf(params.get("days"));
    const applied = (params.get("q") ?? "").trim();
    const [search, setSearch] = React.useState(applied);

    const state = useAsync(`portfolio:${days}:${applied}`, () => campaignsService.portfolio({ days, ...(applied ? { search: applied } : {}) }), "Could not read your analytics.");

    const go = (next: { days?: number; q?: string }) => {
        const query = new URLSearchParams();
        const d = next.days ?? days;
        const q = next.q ?? applied;
        if (d !== 7) query.set("days", String(d));
        if (q) query.set("q", q);
        const qs = query.toString();
        router.replace(qs ? `${pathname}?${qs}` : pathname);
    };

    const heading = <PageHeading title="Analytics" subtitle="Everything you have run, and what it did." actions={<WindowChips value={days} onChange={(d) => go({ days: d })} />} />;

    if (state.kind === "loading") {
        return (
            <>
                {heading}
                <LoadingLine>Crunching the numbers…</LoadingLine>
            </>
        );
    }
    if (state.kind === "error") {
        return (
            <>
                {heading}
                <ErrorPanel title="Could not read your analytics" message={state.message} />
            </>
        );
    }

    const portfolio = state.value;
    const caption = `vs the ${days} days before`;
    const spendByDay = new Map(portfolio.series.map((point) => [point.day, point.spend]));

    return (
        <>
            {heading}
            <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <StatTile label="Total reach" value={portfolio.totalReach.value === null ? "Not measured" : compact(portfolio.totalReach.value)} basis={portfolio.totalReach.basis} provenance={portfolio.totalReach.provenance} delta={deltaLabel(portfolio.comparison?.totalReach)} deltaCaption={caption} testId="analytics-reach" />
                <StatTile label="Click rate" value={percentLabel(portfolio.clickRate.value)} basis={portfolio.clickRate.basis} provenance={portfolio.clickRate.provenance} delta={deltaLabel(portfolio.comparison?.clickRate)} deltaCaption={caption} />
                <StatTile label="Active campaigns" value={String(portfolio.activeCampaigns.value)} basis={portfolio.activeCampaigns.basis} />
                <StatTile label="Budget spent" value={formatMoney(portfolio.budgetSpent.value, { paise: "never" })} basis={portfolio.budgetSpent.basis} chip={pacingChip(portfolio.budgetSpent.onTrack)} delta={deltaLabel(portfolio.comparison?.budgetSpent)} deltaCaption={caption} testId="analytics-budget" />
            </div>

            <Panel className="mt-4">
                <h2 className="text-base font-semibold text-ink">Performance</h2>
                <div className="mt-3">
                    <DailyColumns points={portfolio.series.map((point) => ({ day: point.day, value: Number(point.scans) || 0 }))} unit="scans" caption={`Scans a day across every campaign, last ${days} days.`} extra={(day) => (spendByDay.has(day) ? `${formatMoney(spendByDay.get(day))} spent` : null)} />
                </div>
            </Panel>

            <div className="mt-8 flex flex-wrap items-end justify-between gap-3">
                <div>
                    <h2 className="text-base font-semibold text-ink">Campaigns</h2>
                    <p className="mt-1 text-xs text-dim">Open one to see its own figures — the audience, the interactions and each site.</p>
                </div>
                <form
                    className="flex w-full max-w-[460px] gap-2"
                    onSubmit={(event) => {
                        event.preventDefault();
                        go({ q: search.trim() });
                    }}
                >
                    <label className="sr-only" htmlFor="analytics-search">
                        Search campaigns
                    </label>
                    <input id="analytics-search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name, brand or ADX-CMP reference" className={inputClass} maxLength={120} />
                    <button type="submit" className={btnPrimary}>
                        Search
                    </button>
                    {applied && (
                        <button
                            type="button"
                            className={btnOutline}
                            onClick={() => {
                                setSearch("");
                                go({ q: "" });
                            }}
                        >
                            Clear
                        </button>
                    )}
                </form>
            </div>

            <TablePanel className="mt-4">
                <thead>
                    <tr>
                        <Th>Campaign</Th>
                        <Th>Status</Th>
                        <Th>Run</Th>
                        <Th align="right">Spend</Th>
                        <Th align="right">Scans</Th>
                        <Th />
                    </tr>
                </thead>
                <tbody>
                    {portfolio.campaigns.map((row) => {
                        const status = campaignStatusLabel({ status: row.status as CampaignStatus });
                        return (
                            <tr key={row.id} className="border-t border-line">
                                <Td>
                                    <Cell title={<span className="font-medium">{row.name}</span>} line={[row.brandName, row.reference].filter(Boolean).join(" · ")} />
                                </Td>
                                <Td>
                                    <StatusChip label={status.label} tone={status.tone} pill={false} />
                                </Td>
                                <Td>
                                    <Cell title={row.startDate && row.endDate ? dateRange(row.startDate, row.endDate) : "Not scheduled"} line={`${row.spots} spot${row.spots === 1 ? "" : "s"}`} />
                                </Td>
                                <Td align="right" className="tabular-nums">
                                    {formatMoney(row.spend, { paise: "never" })}
                                </Td>
                                <Td align="right" className="tabular-nums">
                                    <Cell title={row.scans === null ? "Not tracked" : row.scans.toLocaleString("en-IN")} line={row.clickRate !== null ? `${percentLabel(row.clickRate)} click rate` : undefined} />
                                </Td>
                                <Td align="right">
                                    <Link href={`/advertiser/analytics/${encodeURIComponent(row.id)}${days !== 7 ? `?days=${days}` : ""}`} className="whitespace-nowrap text-sm font-semibold text-ink hover:text-brand">
                                        View analytics
                                    </Link>
                                </Td>
                            </tr>
                        );
                    })}
                    {portfolio.campaigns.length === 0 && (
                        <tr>
                            <td colSpan={6} className="px-5 py-8 text-center text-sm text-dim">
                                {applied ? `Nothing matched “${applied}”.` : "No campaigns have run yet, so there is nothing to report."}
                            </td>
                        </tr>
                    )}
                </tbody>
            </TablePanel>
        </>
    );
}
