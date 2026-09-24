"use client";

import * as React from "react";
import Link from "next/link";
import { BookingCard, BookingHeader, BookingStepper } from "./booking-frame";
import { useCampaign, type CampaignState } from "./use-campaign";
import type { AdvertiserProfile, Campaign, CampaignReview } from "@/services/booking";

export interface ReadyCampaign {
    campaign: Campaign;
    review: CampaignReview | null;
    advertiser: AdvertiserProfile | null;
    reload: () => void;
    applyCampaign: (campaign: Campaign) => void;
    applyReview: (review: CampaignReview) => void;
}

const STATUS_LABEL: Record<string, string> = {
    DRAFT: "Campaign draft",
    PENDING_PAYMENT: "Ready to pay",
    SCHEDULED: "Scheduled",
    LIVE: "Live",
    PAUSED: "Paused",
    COMPLETED: "Completed",
    CANCELLED: "Cancelled",
};

/**
 * One booking step: reads the campaign, draws the header and the stepper,
 * then hands the page what it read. A campaign that cannot be read says so
 * in place; one that is no longer a draft is sent to its own page.
 */
export function StepPage({
    id,
    step,
    title,
    subtitle,
    back = { href: "/advertiser", label: "Campaigns" },
    stepper = true,
    children,
}: {
    id: string;
    step: 1 | 2 | 3 | 4;
    title?: (ready: ReadyCampaign) => string;
    subtitle?: (ready: ReadyCampaign) => string;
    back?: { href: string; label: string } | null | ((ready: ReadyCampaign) => { href: string; label: string } | null);
    /** The card-details page (5204:67916) draws no stepper. */
    stepper?: boolean;
    children: (ready: ReadyCampaign) => React.ReactNode;
}) {
    const { state, reload, applyCampaign, applyReview } = useCampaign(id);
    return (
        <StepBody state={state} step={step} id={id} title={title} subtitle={subtitle} back={back} stepper={stepper}>
            {(ready) => children({ ...ready, reload, applyCampaign, applyReview })}
        </StepBody>
    );
}

function StepBody({ state, step, id, title, subtitle, back, stepper, children }: { state: CampaignState; step: 1 | 2 | 3 | 4; id: string; title?: (r: ReadyCampaign) => string; subtitle?: (r: ReadyCampaign) => string; back: StepPageBack; stepper: boolean; children: (ready: Omit<ReadyCampaign, "reload" | "applyCampaign" | "applyReview">) => React.ReactNode }) {
    if (state.kind === "loading") {
        return (
            <div className="mx-auto max-w-[1008px]">
                <BookingHeader back={{ href: "/advertiser", label: "Campaigns" }} title="Loading your campaign…" />
                {stepper && <BookingStepper current={step} className="mt-6" />}
            </div>
        );
    }
    if (state.kind === "error") {
        return (
            <div className="mx-auto max-w-[1008px]">
                <BookingHeader back={{ href: "/advertiser", label: "Campaigns" }} title={state.status === 404 ? "Campaign not found" : "Could not read this campaign"} subtitle={state.message} />
                <BookingCard className="mt-6">
                    <p className="text-sm text-dim">{state.status === 404 ? "This campaign is not in your account, or it was discarded." : "Try again in a moment."}</p>
                    <Link href="/advertiser" className="mt-4 inline-flex text-sm font-medium text-ink underline underline-offset-2">
                        Back to campaigns
                    </Link>
                </BookingCard>
            </div>
        );
    }
    const ready = { campaign: state.campaign, review: state.review, advertiser: state.advertiser } as ReadyCampaign;
    const accountName = state.advertiser?.companyName ?? state.advertiser?.name ?? "Your account";
    const backLink = typeof back === "function" ? back(ready) : back;
    return (
        <div className="mx-auto max-w-[1008px]">
            <BookingHeader back={backLink} title={title ? title(ready) : state.campaign.name || "Untitled campaign"} subtitle={subtitle ? subtitle(ready) : `${accountName} · ${STATUS_LABEL[state.campaign.status] ?? state.campaign.status}`} />
            {stepper && <BookingStepper current={step} campaignId={id} className="mt-6" />}
            <div className={stepper ? "mt-4" : "mt-6"}>{children(ready)}</div>
        </div>
    );
}

type StepPageBack = { href: string; label: string } | null | ((ready: ReadyCampaign) => { href: string; label: string } | null);

/** The id from the route, decoded once. */
export function useCampaignId(params: Promise<{ id: string }>): string {
    const { id } = React.use(params);
    return decodeURIComponent(id);
}

export const accountNameOf = (advertiser: AdvertiserProfile | null): string => advertiser?.companyName ?? advertiser?.name ?? "Your account";

export const stepHref = (id: string, path: string) => `/advertiser/campaigns/${encodeURIComponent(id)}/${path}`;
