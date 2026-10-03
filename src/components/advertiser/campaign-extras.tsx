"use client";

import * as React from "react";
import Link from "next/link";
import { FeatureOff } from "@/components/platform/feature-off";
import { Panel } from "@/components/workspace/page-heading";
import { FLAG_LANDING_PAGES, useSwitchedOff } from "@/lib/flags";
import { advertiserWorkspace, rupees, type CampaignAnalytics, type Metric, type TrackingCode } from "@/services/advertiser-workspace";
import { landingPageUrl, pacingChip, percentLabel } from "@/services/campaigns";

/**
 * The tracking codes on a paid campaign — `GET /campaigns/:id/tracking-codes`
 * — each with the QR the server draws (`…/:code/image.svg`, fetched with the
 * bearer) and its counts.
 */
export function TrackingPanel({ campaignId, codes }: { campaignId: string; codes: TrackingCode[] }) {
    if (!codes.length) return null;
    return (
        <Panel className="mt-4 p-5">
            <h2 className="text-base font-semibold text-ink">Tracking codes</h2>
            <p className="mt-1 text-xs text-dim">Printed on the artwork. Scans, clicks and redemptions are counted by ADX.</p>
            <ul className="mt-4 grid gap-3 md:grid-cols-2">
                {codes.map((code) => (
                    <li key={code.id} className="flex gap-3 rounded-lg border border-line p-3">
                        <QrImage campaignId={campaignId} code={code.code} />
                        <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-ink">{code.promoCode ? `Promo ${code.promoCode}` : code.code}</p>
                            <p className="truncate text-xs text-dim">{code.printedUrl ?? code.shortUrl ?? code.url}</p>
                            <p className="mt-2 text-xs text-dim">
                                {code.scans} scan{code.scans === 1 ? "" : "s"} · {code.clicks} click{code.clicks === 1 ? "" : "s"}
                                {code.method === "VANITY_OR_PROMO" ? ` · ${code.redemptions} redemption${code.redemptions === 1 ? "" : "s"}` : ""}
                            </p>
                            <a href={code.printedUrl ?? code.url} target="_blank" rel="noreferrer" className="mt-1 inline-block text-xs font-medium text-ink underline underline-offset-4 hover:text-brand">
                                Open destination
                            </a>
                        </div>
                    </li>
                ))}
            </ul>
        </Panel>
    );
}

function QrImage({ campaignId, code }: { campaignId: string; code: string }) {
    const [image, setImage] = React.useState<{ code: string; url: string } | null>(null);
    React.useEffect(() => {
        let cancelled = false;
        let made: string | null = null;
        advertiserWorkspace
            .trackingCodeImage(campaignId, code)
            .then((blob) => {
                if (cancelled) return;
                made = URL.createObjectURL(blob);
                setImage({ code, url: made });
            })
            .catch(() => {
                /* The code's text stands in for the picture. */
            });
        return () => {
            cancelled = true;
            if (made) URL.revokeObjectURL(made);
        };
    }, [campaignId, code]);
    if (image?.code !== code) return <span className="flex size-16 shrink-0 items-center justify-center rounded-md bg-ground text-[10px] text-dim">QR</span>;
    return <img src={image.url} alt={`QR code ${code}`} className="size-16 shrink-0 rounded-md" />;
}

/** The performance strip on a running or finished campaign — `GET /campaigns/:id/analytics`, each figure with its basis, and the way into the full analytics. */
export function PerformanceStrip({ analytics, href }: { analytics: CampaignAnalytics | null; href?: string }) {
    if (!analytics) return null;
    const pacing = pacingChip(analytics.spend.onTrack);
    const tiles: { label: string; value: string; basis: string }[] = [
        metricTile("Estimated reach", analytics.reach),
        metricTile("Scans", analytics.scans),
        metricTile("Clicks", analytics.clicks),
        /* The server sends the click rate as a percentage already ("2.4" is 2.4%), as the app prints it. */
        { label: "Click rate", value: percentLabel(analytics.clickRate.value), basis: analytics.clickRate.basis },
        { label: "Spend to date", value: rupees(analytics.spend.toDate), basis: `of ${rupees(analytics.spend.committed)} committed · day ${analytics.daysElapsed} of ${analytics.daysTotal}${pacing ? ` · ${pacing.label}` : ""}` },
    ];
    return (
        <Panel className="mt-4 p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-base font-semibold text-ink">Performance</h2>
                {href && (
                    <Link href={href} className="text-sm font-semibold text-ink hover:text-brand">
                        See full analytics →
                    </Link>
                )}
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-3">
                {tiles.map((tile) => (
                    <div key={tile.label} className="rounded-lg bg-ground px-3 py-3">
                        <p className="text-xs text-dim">{tile.label}</p>
                        <p className="mt-1 text-lg font-semibold tracking-tight text-ink">{tile.value}</p>
                        <p className="mt-1 line-clamp-2 text-[11px] text-dim">{tile.basis}</p>
                    </div>
                ))}
            </div>
        </Panel>
    );
}

function metricTile(label: string, metric: Metric) {
    return { label, value: metric.value === null ? "—" : metric.value.toLocaleString("en-IN"), basis: metric.provenance === "UNAVAILABLE" ? "Not measured" : metric.basis };
}

/**
 * Lot E (Q7/Q106): the ADX page a QR campaign's codes land on when there is
 * no website of the advertiser's own — whether there is one, whether it is
 * live, its address, and the way into the editor. A campaign whose codes
 * forward to its own URL draws nothing.
 */
export function LandingPagePanel({ campaignId, trackingMethod, destinationUrl, landingPage, apiBase }: { campaignId: string; trackingMethod: string; destinationUrl: string | null; landingPage: { status: string; url: string } | null | undefined; apiBase: string }) {
    // The builder is `campaigns.landing-pages`: switched off, the panel says so and offers no way into the editor.
    const builderOff = useSwitchedOff(FLAG_LANDING_PAGES);
    if (trackingMethod !== "QR_OR_DEEPLINK") return null;
    if (destinationUrl && !landingPage) return null;
    const live = landingPage?.status === "PUBLISHED";
    const url = landingPage ? landingPageUrl(apiBase, landingPage) : null;
    return (
        <Panel className="mt-4 p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                    <h2 className="text-base font-semibold text-ink">Your ADX page</h2>
                    <p className="mt-1 text-sm text-dim">
                        {!landingPage
                            ? "Your codes have no website to land on, so a scan lands on ADX's plain thanks page. Draft an ADX page from your brief and publish it — scans still count either way."
                            : live
                              ? "Every code without a destination of its own lands here. Edits go live the moment you save them."
                              : "Drafted, not yet published. Until it is, a scan lands on ADX's plain thanks page."}
                    </p>
                    {url && live && (
                        <a href={url} target="_blank" rel="noreferrer" className="mt-2 inline-block break-all text-sm font-medium text-ink underline underline-offset-4 hover:text-brand">
                            {url}
                        </a>
                    )}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                    {landingPage && <span className={`inline-flex h-6 items-center rounded-md px-2 text-xs font-medium ${live ? "bg-success-soft text-success" : "bg-ground text-ink"}`}>{live ? "Published" : "Draft"}</span>}
                    {!builderOff && (
                        <Link href={`/advertiser/campaigns/${encodeURIComponent(campaignId)}/landing-page`} className="inline-flex h-9 items-center justify-center rounded-md border border-line bg-white px-4 text-sm font-medium text-ink hover:border-ink">
                            {landingPage ? "Edit the page" : "Draft an ADX page"}
                        </Link>
                    )}
                </div>
            </div>
            {builderOff && <FeatureOff flag={FLAG_LANDING_PAGES} className="mt-3 border-0 p-0 text-dim" />}
        </Panel>
    );
}
