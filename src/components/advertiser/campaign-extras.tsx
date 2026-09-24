"use client";

import * as React from "react";
import { Panel } from "@/components/workspace/page-heading";
import { advertiserWorkspace, rupees, type CampaignAnalytics, type Metric, type TrackingCode } from "@/services/advertiser-workspace";

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

/** The performance strip on a running or finished campaign — `GET /campaigns/:id/analytics`, each figure with its basis. */
export function PerformanceStrip({ analytics }: { analytics: CampaignAnalytics | null }) {
    if (!analytics) return null;
    const tiles: { label: string; value: string; basis: string }[] = [
        metricTile("Estimated reach", analytics.reach),
        metricTile("Scans", analytics.scans),
        metricTile("Clicks", analytics.clicks),
        { label: "Click rate", value: analytics.clickRate.value === null ? "—" : `${(analytics.clickRate.value * (analytics.clickRate.value <= 1 ? 100 : 1)).toFixed(1)}%`, basis: analytics.clickRate.basis },
        { label: "Spend to date", value: rupees(analytics.spend.toDate), basis: `of ${rupees(analytics.spend.committed)} committed · day ${analytics.daysElapsed} of ${analytics.daysTotal}` },
    ];
    return (
        <Panel className="mt-4 p-5">
            <h2 className="text-base font-semibold text-ink">Performance</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
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
