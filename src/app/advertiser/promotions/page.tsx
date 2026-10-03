"use client";

import * as React from "react";
import Link from "next/link";
import { PageHeading, Panel } from "@/components/workspace/page-heading";
import { btnOutline, btnPrimary, Cell, ErrorPanel, LoadingLine, StatusChip, TablePanel, Td, Th, useAsync } from "@/components/advertiser/bits";
import { adHref, rowStats } from "@/components/promotions/ads/ad-helpers";
import { AdsClosed, AdsGate } from "@/components/promotions/ads/ads-gate";
import { featureOff, money, promotionsService, runLabel, statusOf, ctrLabel, type AdBookingView } from "@/services/promotions";

/**
 * LM-1 "Promote on ADX": the advertiser's display ads on ADX's own pages —
 * each with its slot, its days, where it stands, what it has done, and what
 * it cost — and the door to book another.
 */
export default function PromotionsPage() {
    const heading = (
        <PageHeading
            title="Promote on ADX"
            subtitle="Book ad space on ADX's own pages — the listing page sidebar and more. Pay per day, ADX checks the artwork, and you see every view and click."
            actions={
                <Link href="/advertiser/promotions/new" className={btnPrimary}>
                    Book an ad
                </Link>
            }
        />
    );
    return (
        <AdsGate heading={<PageHeading title="Promote on ADX" subtitle="Ad space on ADX's own pages." />}>
            <MyAds heading={heading} />
        </AdsGate>
    );
}

function MyAds({ heading }: { heading: React.ReactNode }) {
    const state = useAsync("promotions:ads:mine", () => readMine(), "Could not read your ads.");

    if (state.kind === "ready" && state.value === "CLOSED") {
        return (
            <>
                <PageHeading title="Promote on ADX" subtitle="Ad space on ADX's own pages." />
                <AdsClosed />
            </>
        );
    }
    if (state.kind === "loading") {
        return (
            <>
                {heading}
                <div className="mt-6">
                    <LoadingLine>Loading your ads…</LoadingLine>
                </div>
            </>
        );
    }
    if (state.kind === "error") {
        return (
            <>
                {heading}
                <ErrorPanel title="Could not read your ads" message={state.message} />
                <button type="button" onClick={state.reload} className={`${btnOutline} mt-4`}>
                    Try again
                </button>
            </>
        );
    }

    const ads = state.value as AdBookingView[];
    return (
        <>
            {heading}
            {ads.length === 0 ? (
                <Panel className="mt-6">
                    <p className="text-sm font-medium text-ink" data-testid="ads-empty">
                        No ads booked yet
                    </p>
                    <p className="mt-1 text-sm text-dim">Choose a slot, pick your days and upload your artwork. ADX checks it before it runs, and a rejected ad is refunded in full.</p>
                    <Link href="/advertiser/promotions/new" className={`${btnOutline} mt-4`}>
                        Book your first ad
                    </Link>
                </Panel>
            ) : (
                <>
                    <p className="mt-6 text-sm text-dim">
                        {ads.length} ad{ads.length === 1 ? "" : "s"}
                    </p>
                    <TablePanel className="mt-3">
                        <thead>
                            <tr>
                                <Th>Ad</Th>
                                <Th>Slot</Th>
                                <Th>Days</Th>
                                <Th>Status</Th>
                                <Th align="right" className="whitespace-nowrap">Views · clicks · CTR</Th>
                                <Th align="right">Total</Th>
                            </tr>
                        </thead>
                        <tbody>
                            {ads.map((ad) => (
                                <AdLine key={ad.id} ad={ad} />
                            ))}
                        </tbody>
                    </TablePanel>
                </>
            )}
        </>
    );
}

/** The list, or "CLOSED" when the server says the feature is off (503 FEATURE_OFF). */
async function readMine(): Promise<AdBookingView[] | "CLOSED"> {
    try {
        return await promotionsService.myAds();
    } catch (caught) {
        if (featureOff(caught)) return "CLOSED";
        throw caught;
    }
}

function AdLine({ ad }: { ad: AdBookingView }) {
    const status = statusOf(ad.status);
    const stats = rowStats(ad);
    return (
        <tr className="border-t border-line">
            <Td>
                <Link href={adHref(ad.id)} className="hover:text-brand">
                    <Cell title={<span className="font-medium">{ad.title || "Untitled ad"}</span>} line={ad.displayId ?? "Draft"} />
                </Link>
            </Td>
            <Td className="text-ink">{ad.slot?.label ?? ad.slotKey ?? "—"}</Td>
            <Td className="whitespace-nowrap text-ink">{runLabel(ad.startDate, ad.endDate)}</Td>
            <Td>
                <StatusChip label={status.label} tone={status.tone} className="whitespace-nowrap" />
            </Td>
            <Td align="right" className="whitespace-nowrap tabular-nums text-ink">
                {stats ? `${stats.impressions.toLocaleString("en-IN")} · ${stats.clicks.toLocaleString("en-IN")} · ${ctrLabel(stats)}` : <span className="text-dim">—</span>}
            </Td>
            <Td align="right" className="whitespace-nowrap tabular-nums text-ink">
                {money(ad.total)}
            </Td>
        </tr>
    );
}
