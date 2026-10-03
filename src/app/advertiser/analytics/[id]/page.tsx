"use client";

import * as React from "react";
import Link from "next/link";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import { PageHeading, Panel } from "@/components/workspace/page-heading";
import { btnOutline, ErrorPanel, LoadingLine, StatusChip, TablePanel, Td, Th, useAsync } from "@/components/advertiser/bits";
import { DailyColumns, Donut, ProfileBars, ShareBars, StatTile, WindowChips } from "@/components/advertiser/analytics-parts";
import { campaignStatusLabel } from "@/services/advertiser-workspace";
import {
    agreementLine,
    audienceFacetsOffered,
    audienceSlices,
    campaignsService,
    compact,
    deltaLabel,
    formatMoney,
    INTERACTION_FACETS,
    interactionSlices,
    interactionTotal,
    pacingChip,
    percentLabel,
    profileBars,
    shareLabel,
    vendorLine,
    windowOf,
    type AudienceFacet,
    type CampaignAnalytics,
    type CampaignAudience,
    type CampaignStatus,
    type InteractionFacet,
} from "@/services/campaigns";

/**
 * One campaign's analytics — `GET /campaigns/:id/analytics?days=` — as the
 * app's analytics screen draws it when opened on a campaign: the window
 * (7, 30 or 90 days) against the one before it, the on-track chip, the
 * daily scans, the vendor's audience panel (GeoIQ / Azira — modelled, and
 * said so), where the money went, what people did on the ADX page after the
 * scan, and each site's figures.
 */
export default function CampaignAnalyticsPage() {
    return (
        <React.Suspense fallback={<LoadingLine>Loading the analytics…</LoadingLine>}>
            <OneCampaign />
        </React.Suspense>
    );
}

function OneCampaign() {
    const params = useParams<{ id: string }>();
    const id = decodeURIComponent(params.id);
    const router = useRouter();
    const pathname = usePathname();
    const search = useSearchParams();
    const days = windowOf(search.get("days"));
    const state = useAsync(`campaign-analytics:${id}:${days}`, () => campaignsService.analytics(id, days), "Could not read this campaign's analytics.");

    const setDays = (next: number) => router.replace(next === 7 ? pathname : `${pathname}?days=${next}`);

    if (state.kind === "loading") return <LoadingLine>Crunching the numbers…</LoadingLine>;
    if (state.kind === "error") {
        return (
            <>
                <Crumbs name="Campaign" />
                <div className="mt-6">
                    <PageHeading title="Campaign analytics" />
                </div>
                <ErrorPanel title="Could not read this campaign's analytics" message={state.message} />
            </>
        );
    }
    return <AnalyticsView id={id} analytics={state.value} days={days} onDays={setDays} />;
}

function Crumbs({ name }: { name: string }) {
    return (
        <nav className="text-sm text-dim" aria-label="Breadcrumb">
            <Link href="/advertiser/analytics" className="hover:text-ink">
                Analytics
            </Link>
            <span className="mx-2">/</span>
            <span className="text-ink">{name}</span>
        </nav>
    );
}

function AnalyticsView({ id, analytics, days, onDays }: { id: string; analytics: CampaignAnalytics; days: number; onDays: (days: number) => void }) {
    const [facet, setFacet] = React.useState<InteractionFacet>("byDevice");
    const status = analytics.status ? campaignStatusLabel({ status: analytics.status as CampaignStatus }) : null;
    const notRun = analytics.status === "DRAFT" || analytics.status === "PENDING_PAYMENT";
    const caption = `vs the ${days} days before`;
    const spendByDay = new Map(analytics.series.map((point) => [point.day, point.spend]));
    const mix = analytics.mix ?? [];
    const bySpot = analytics.bySpot ?? [];
    const byMarket = analytics.byMarket ?? [];

    return (
        <>
            <Crumbs name={analytics.name ?? "Campaign"} />
            <div className="mt-6">
                <PageHeading
                    title={analytics.name ?? "Campaign analytics"}
                    subtitle={[analytics.reference, `day ${analytics.daysElapsed} of ${analytics.daysTotal}`].filter(Boolean).join(" · ")}
                    actions={
                        <>
                            <WindowChips value={days} onChange={onDays} />
                            <Link href={`/advertiser/campaigns/${encodeURIComponent(id)}`} className={btnOutline}>
                                View campaign
                            </Link>
                        </>
                    }
                />
            </div>
            {status && (
                <div className="mt-3">
                    <StatusChip label={status.label} tone={status.tone} />
                </div>
            )}
            {notRun && <p className="mt-4 rounded-md bg-ground px-4 py-3 text-sm text-dim">This campaign has not run yet, so there is nothing measured. Its figures start the day it goes live.</p>}

            <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <StatTile label="Total reach" value={analytics.reach.value === null ? "Not measured" : compact(analytics.reach.value)} basis={analytics.reach.basis} provenance={analytics.reach.provenance} delta={deltaLabel(analytics.comparison?.totalReach)} deltaCaption={caption} testId="analytics-reach" />
                <StatTile label="Click rate" value={percentLabel(analytics.clickRate.value)} basis={analytics.clickRate.basis} provenance={analytics.clickRate.provenance} delta={deltaLabel(analytics.comparison?.clickRate)} deltaCaption={caption} />
                <StatTile label="Spots live" value={`${analytics.spotsLive} of ${analytics.spotsBooked}`} basis="Sites running today" />
                <StatTile label="Budget spent" value={formatMoney(analytics.spend.toDate, { paise: "never" })} basis={`of ${formatMoney(analytics.spend.committed, { paise: "never" })} committed`} chip={pacingChip(analytics.spend.onTrack)} delta={deltaLabel(analytics.comparison?.budgetSpent)} deltaCaption={caption} testId="analytics-budget" />
            </div>

            <Panel className="mt-4">
                <h2 className="text-base font-semibold text-ink">Performance</h2>
                <div className="mt-3">
                    <DailyColumns points={analytics.series.map((point) => ({ day: point.day, value: Number(point.scans) || 0 }))} unit="scans" caption="Scans a day, this campaign only." extra={(day) => (spendByDay.has(day) ? `${formatMoney(spendByDay.get(day))} spent` : null)} />
                </div>
                <p className="mt-3 text-xs text-dim">
                    {analytics.scans.value === null ? "Scans are not tracked on this campaign." : `${analytics.scans.value.toLocaleString("en-IN")} scans and ${analytics.clicks.value?.toLocaleString("en-IN") ?? "no"} clicks through to your page so far.`}
                    {analytics.redemptions.value !== null && analytics.redemptions.value > 0 ? ` ${analytics.redemptions.value.toLocaleString("en-IN")} promo redemptions.` : ""}
                </p>
            </Panel>

            <div className="mt-4 grid gap-4 xl:grid-cols-2">
                {analytics.audience ? (
                    <AudienceBreakdown audience={analytics.audience} />
                ) : (
                    <Panel>
                        <h2 className="text-base font-semibold text-ink">Audience breakdown</h2>
                        <p className="mt-2 text-sm text-dim">No audience vendor is configured, so ADX draws no demographic split — it would be invented. What people did after the scan is below, measured by ADX.</p>
                    </Panel>
                )}

                {mix.length > 0 && (
                    <Panel>
                        <h2 className="text-base font-semibold text-ink">Where the money went</h2>
                        <div className="mt-4">
                            <ShareBars rows={mix.map((row) => ({ label: row.label, share: row.share, value: formatMoney(row.spend, { paise: "never" }) }))} />
                        </div>
                        <p className="mt-3 text-xs text-dim">By media type — what was bought, not who saw it.</p>
                    </Panel>
                )}

                {analytics.interactions && (
                    <Panel>
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <h2 className="text-base font-semibold text-ink">Digital interactions</h2>
                            <FacetChips options={INTERACTION_FACETS} value={facet} onChange={setFacet} label="Interactions by" />
                        </div>
                        {interactionTotal(analytics.interactions) === 0 ? (
                            <p className="mt-4 text-sm text-dim">Nothing recorded yet — this counts views, button presses and form submissions on the ADX landing page, once someone scans.</p>
                        ) : (
                            <div className="mt-4">
                                <Donut slices={interactionSlices(analytics.interactions, facet)} testId="interactions-donut" />
                            </div>
                        )}
                        <p className="mt-3 text-xs text-dim">{analytics.interactions.basis}. What people did after the scan, not who saw the hoarding.</p>
                    </Panel>
                )}

                {byMarket.length > 1 && (
                    <Panel>
                        <h2 className="text-base font-semibold text-ink">By market</h2>
                        <ul className="mt-3 divide-y divide-line">
                            {byMarket.map((row) => (
                                <li key={row.market ?? "none"} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                                    <span>
                                        <span className="block text-ink">{row.market ?? "No city recorded"}</span>
                                        <span className="block text-xs text-dim">
                                            {row.spots} spot{row.spots === 1 ? "" : "s"} · {row.scans.toLocaleString("en-IN")} scan{row.scans === 1 ? "" : "s"} · {row.clicks.toLocaleString("en-IN")} click{row.clicks === 1 ? "" : "s"}
                                        </span>
                                    </span>
                                    <span className="tabular-nums text-ink">{formatMoney(row.spend, { paise: "never" })}</span>
                                </li>
                            ))}
                        </ul>
                    </Panel>
                )}
            </div>

            {bySpot.length > 0 && (
                <>
                    <h2 className="mt-8 text-base font-semibold text-ink">By site</h2>
                    <TablePanel className="mt-3">
                        <thead>
                            <tr>
                                <Th>Site</Th>
                                <Th align="right">Rate</Th>
                                <Th align="right">Scans</Th>
                                <Th align="right">Clicks</Th>
                                <Th align="right">Footfall stated</Th>
                                <Th align="right">Spend</Th>
                            </tr>
                        </thead>
                        <tbody>
                            {bySpot.map((row) => (
                                <tr key={row.spotId} className="border-t border-line">
                                    <Td>
                                        <p className="text-sm font-medium text-ink">{row.title}</p>
                                        <p className="text-xs text-dim">{[row.city, `${row.days} day${row.days === 1 ? "" : "s"}`].filter(Boolean).join(" · ")}</p>
                                    </Td>
                                    <Td align="right" className="tabular-nums">
                                        {formatMoney(row.ratePerDay, { paise: "never" })}/day
                                    </Td>
                                    <Td align="right" className="tabular-nums">
                                        {row.scans.toLocaleString("en-IN")}
                                    </Td>
                                    <Td align="right" className="tabular-nums">
                                        {row.clicks.toLocaleString("en-IN")}
                                    </Td>
                                    <Td align="right" className="tabular-nums">
                                        {row.estimatedDailyFootfall ? `${compact(row.estimatedDailyFootfall)} a day` : <span className="text-dim">Not stated</span>}
                                    </Td>
                                    <Td align="right" className="tabular-nums">
                                        {formatMoney(row.spend, { paise: "never" })}
                                    </Td>
                                </tr>
                            ))}
                        </tbody>
                    </TablePanel>
                    <p className="mt-2 text-xs text-dim">The footfall is what each publisher stated for their site; a site without one adds nothing to the reach estimate.</p>
                </>
            )}
        </>
    );
}

function FacetChips<T extends string>({ options, value, onChange, label }: { options: { id: T; label: string }[]; value: T; onChange: (value: T) => void; label: string }) {
    return (
        <div role="tablist" aria-label={label} className="flex flex-wrap gap-1.5">
            {options.map((option) => (
                <button key={option.id} type="button" role="tab" aria-selected={option.id === value} onClick={() => onChange(option.id)} className={cn("h-8 rounded-full border px-3 text-xs font-medium transition-colors", option.id === value ? "border-ink bg-ink text-white" : "border-line bg-white text-ink hover:border-ink")}>
                    {option.label}
                </button>
            ))}
        </div>
    );
}

/**
 * Q109: the vendor's Audience Breakdown — the donut with the largest share
 * in its centre, a chip per facet the vendor carries, the daily footfall,
 * footfall by weekday and by hour, and whose panel it is, for which month,
 * over how many of the booked sites.
 */
function AudienceBreakdown({ audience }: { audience: CampaignAudience }) {
    const offered = audienceFacetsOffered(audience);
    const [facet, setFacet] = React.useState<AudienceFacet>(offered[0]?.id ?? "ageBands");
    const shown = offered.some((option) => option.id === facet) ? facet : (offered[0]?.id ?? facet);
    const slices = audienceSlices(audience, shown);
    const top = slices[0];
    const agreement = agreementLine(audience);
    return (
        <Panel>
            <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-base font-semibold text-ink">Audience breakdown</h2>
                {offered.length > 1 && <FacetChips options={offered} value={shown} onChange={setFacet} label="Audience by" />}
            </div>
            <div className="mt-4">{slices.length > 0 ? <Donut slices={slices} unit="share" centre={top ? { value: `${shareLabel(top.count)}%`, label: top.label } : undefined} testId="audience-donut" /> : <p className="text-sm text-dim">{audience.basis}</p>}</div>
            {audience.footfall.daily !== null && (
                <p className="mt-4 text-sm text-ink">
                    {compact(audience.footfall.daily)} a day across the {audience.spotsWithData === 1 ? "site" : `${audience.spotsWithData} sites`} with a panel
                </p>
            )}
            <div className="mt-4 grid gap-5 md:grid-cols-2">
                {audience.footfall.byWeekday && <ProfileBars bars={profileBars(audience.footfall.byWeekday, "byWeekday")} caption="Footfall by weekday" testId="audience-by-weekday" />}
                {audience.footfall.byHour && <ProfileBars bars={profileBars(audience.footfall.byHour, "byHour")} caption="Footfall by hour" testId="audience-by-hour" />}
            </div>
            {agreement && <p className="mt-3 text-sm text-ink">{agreement}</p>}
            <p className="mt-3 text-xs text-dim">
                Panel · {vendorLine(audience)} · {audience.period} · {audience.spotsWithData} of {audience.spotsTotal} booked site{audience.spotsTotal === 1 ? "" : "s"}. Modelled by the vendor from a device panel, not measured by ADX; shares are weighted by the days each site ran.
            </p>
        </Panel>
    );
}
