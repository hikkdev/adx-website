"use client";

import * as React from "react";
import { useParams } from "next/navigation";
import { PageHeading } from "@/components/workspace/page-heading";
import { useAdvertiser } from "@/app/advertiser/layout";
import { ErrorPanel, LoadingLine, useAsync } from "@/components/advertiser/bits";
import { CampaignCompleted, CampaignInFlight, type CampaignPageData } from "@/components/advertiser/campaign-views";
import { advertiserWorkspace, type AdvertiserOrder, type CampaignAnalytics, type Invoice, type OrderEvidence, type TrackingCode } from "@/services/advertiser-workspace";

/**
 * DR 12 · 07 · 02 · Campaign details (5204:72402) and 03 · Campaign history
 * (5204:72806) — one route, two drawings: a campaign still on its way
 * (status, its spaces, documents, summary, activity) and one that has run
 * (the delivered placements, the evidence, the overview). `GET /campaigns/:id`
 * with the invoice, the tracking codes, the analytics and each booked spot's
 * order and evidence beside it. The booking steps under this id are the
 * wizard's own pages; this page only links to them.
 */
export default function CampaignPage() {
    const params = useParams<{ id: string }>();
    const campaignId = params.id;
    const advertiser = useAdvertiser();
    const advertiserId = advertiser?.id ?? null;

    const state = useAsync(
        `campaign:${campaignId}:${advertiserId ?? ""}`,
        async (): Promise<CampaignPageData> => {
            const campaign = await advertiserWorkspace.campaign(campaignId);
            const paid = !!campaign.paidAt || ["SCHEDULED", "LIVE", "PAUSED", "COMPLETED"].includes(campaign.status);
            const measurable = ["LIVE", "PAUSED", "COMPLETED"].includes(campaign.status);
            const orderIds = campaign.spots.map((s) => s.orderId).filter((id): id is string => !!id).slice(0, 12);
            const [invoices, codes, analytics, orderRows] = await Promise.all([
                advertiserId && paid ? advertiserWorkspace.invoices(advertiserId).catch(() => [] as Invoice[]) : Promise.resolve([] as Invoice[]),
                paid && campaign.trackingMethod !== "NONE" ? advertiserWorkspace.trackingCodes(campaignId).catch(() => campaign.codes ?? ([] as TrackingCode[])) : Promise.resolve(campaign.codes ?? []),
                measurable ? advertiserWorkspace.campaignAnalytics(campaignId).catch(() => null as CampaignAnalytics | null) : Promise.resolve(null),
                Promise.all(
                    orderIds.map(async (orderId) => {
                        try {
                            const order = await advertiserWorkspace.order(orderId);
                            const evidence = await advertiserWorkspace.evidence(orderId).catch(() => null as OrderEvidence | null);
                            return [orderId, { order, evidence }] as const;
                        } catch {
                            return null;
                        }
                    })
                ),
            ]);
            const orders: CampaignPageData["orders"] = {};
            for (const row of orderRows) if (row) orders[row[0]] = row[1] as { order: AdvertiserOrder; evidence: OrderEvidence | null };
            const invoice = invoices.find((i) => i.campaignId === campaign.id && i.kind !== "CREDIT_NOTE" && i.status !== "VOID") ?? invoices.find((i) => i.campaignId === campaign.id) ?? null;
            return { campaign, invoice, codes, analytics, orders, advertiserName: advertiser?.name ?? "" };
        },
        "Could not read this campaign."
    );

    if (state.kind === "loading") return <LoadingLine>Loading the campaign…</LoadingLine>;
    if (state.kind === "error") {
        return (
            <>
                <PageHeading title="Campaign" />
                <ErrorPanel title="Could not read this campaign" message={state.message} />
            </>
        );
    }
    return state.value.campaign.status === "COMPLETED" ? <CampaignCompleted data={state.value} /> : <CampaignInFlight data={state.value} />;
}
