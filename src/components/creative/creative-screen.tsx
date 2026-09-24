"use client";

import * as React from "react";
import Link from "next/link";
import { InlineError, LoadingLine, PlannerShell } from "@/components/planner/planner-shell";
import { useCampaign } from "@/components/planner/use-campaign";
import type { Campaign } from "@/services/planner";
import { BriefForm } from "@/components/creative/brief-form";
import { AudienceForm } from "@/components/creative/audience-form";
import { ReviewRequest } from "@/components/creative/review-request";
import { RequestSent } from "@/components/creative/request-sent";
import { RequestStatus } from "@/components/creative/request-status";
import { SelectedSpaces } from "@/components/creative/selected-spaces";
import { DatesAndCost } from "@/components/creative/dates-and-cost";

export type CreativeScreenId = "brief" | "audience" | "review" | "sent" | "request" | "spaces" | "dates";

export interface CreativeProps {
    campaign: Campaign;
    save: ReturnType<typeof useCampaign>["save"];
    replace: ReturnType<typeof useCampaign>["replace"];
    reload: () => void;
    /** Where "Done" and "Back to campaign draft" return to. */
    returnHref: string;
}

export function creativeHref(campaignId: string, screen: CreativeScreenId): string {
    const base = `/advertiser/campaigns/${encodeURIComponent(campaignId)}/creative`;
    return screen === "brief" ? base : `${base}/${screen}`;
}

/** "Campaign draft", "Awaiting payment", "Live" — the line under the campaign's name. */
export function statusLine(campaign: Campaign): string {
    const brand = campaign.brandName?.trim();
    const state =
        campaign.status === "DRAFT"
            ? "Campaign draft"
            : campaign.status === "PENDING_PAYMENT"
              ? "Awaiting payment"
              : campaign.status.charAt(0) + campaign.status.slice(1).toLowerCase().replace(/_/g, " ");
    return brand ? `${brand} · ${state}` : state;
}

/**
 * DR 12 · 05 · Creative assistance & campaign edits: the brief, the
 * audience, the request's review and its status, plus the two edits of a
 * booking — its spaces and its dates. Every screen reads the campaign by
 * id and writes back through the same `PATCH /campaigns/:id`.
 */
export function CreativeScreen({ campaignId, screen, returnTo }: { campaignId: string; screen: CreativeScreenId; returnTo?: string | null }) {
    const { state, campaign, save, replace, reload } = useCampaign(campaignId);
    const returnHref = returnTo && returnTo.startsWith("/") ? returnTo : `/advertiser/campaigns/${encodeURIComponent(campaignId)}/review`;
    const isRequest = screen === "request";
    const bar = screen === "spaces" || screen === "dates" ? 2 : isRequest ? undefined : 3;
    const title = isRequest ? "Design request" : (campaign?.name ?? "Campaign");
    const subtitle = campaign ? (isRequest ? `${campaign.name} · Creative assistance` : statusLine(campaign)) : undefined;

    return (
        <PlannerShell title={title} subtitle={subtitle} bar={bar} backHref={isRequest ? null : "/advertiser"}>
            {state.kind === "loading" && <LoadingLine>Loading your campaign…</LoadingLine>}
            {state.kind === "missing" && (
                <div className="rounded-xl border border-line bg-white p-8">
                    <p className="text-base font-semibold text-ink">This campaign is not in your workspace</p>
                    <p className="mt-2 text-sm text-dim">It may have been discarded, or it belongs to another account.</p>
                    <Link href="/advertiser" className="mt-4 inline-flex h-12 items-center rounded-md bg-brand px-6 text-sm font-medium text-white">
                        Back to campaigns
                    </Link>
                </div>
            )}
            {state.kind === "error" && <InlineError message={state.message} />}
            {campaign && screen === "brief" && <BriefForm campaign={campaign} save={save} replace={replace} reload={reload} returnHref={returnHref} />}
            {campaign && screen === "audience" && <AudienceForm campaign={campaign} save={save} replace={replace} reload={reload} returnHref={returnHref} />}
            {campaign && screen === "review" && <ReviewRequest campaign={campaign} save={save} replace={replace} reload={reload} returnHref={returnHref} />}
            {campaign && screen === "sent" && <RequestSent campaign={campaign} save={save} replace={replace} reload={reload} returnHref={returnHref} />}
            {campaign && screen === "request" && <RequestStatus campaign={campaign} save={save} replace={replace} reload={reload} returnHref={returnHref} />}
            {campaign && screen === "spaces" && <SelectedSpaces campaign={campaign} save={save} replace={replace} reload={reload} returnHref={returnHref} />}
            {campaign && screen === "dates" && <DatesAndCost campaign={campaign} save={save} replace={replace} reload={reload} returnHref={returnHref} />}
        </PlannerShell>
    );
}
