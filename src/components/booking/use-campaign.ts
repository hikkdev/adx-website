"use client";

import * as React from "react";
import { messageOf } from "@/lib/api-client";
import { bookingService, type AdvertiserProfile, type Campaign, type CampaignReview } from "@/services/booking";

export type CampaignState =
    | { kind: "loading" }
    | { kind: "error"; message: string; status?: number }
    | { kind: "ready"; campaign: Campaign; review: CampaignReview | null; advertiser: AdvertiserProfile | null };

/**
 * The campaign a step is editing, with its review (the priced cart) and
 * the advertiser it belongs to — read together, keyed on the id, and
 * re-read after every write so the page always shows what the server holds.
 */
export function useCampaign(id: string) {
    const [state, setState] = React.useState<CampaignState>({ kind: "loading" });
    const [tick, setTick] = React.useState(0);

    React.useEffect(() => {
        let cancelled = false;
        Promise.all([bookingService.get(id), bookingService.review(id).catch(() => null), bookingService.advertiser().catch(() => null)])
            .then(([campaign, review, advertiser]) => {
                if (!cancelled) setState({ kind: "ready", campaign, review, advertiser });
            })
            .catch((caught: unknown) => {
                if (!cancelled) setState({ kind: "error", message: messageOf(caught, "Could not read this campaign."), status: (caught as { status?: number })?.status });
            });
        return () => {
            cancelled = true;
        };
    }, [id, tick]);

    const reload = React.useCallback(() => setTick((t) => t + 1), []);

    /** A write answered the campaign: keep it, and re-price. */
    const applyCampaign = React.useCallback(
        (campaign: Campaign) => {
            setState((current) => (current.kind === "ready" ? { ...current, campaign } : current));
            bookingService
                .review(campaign.id)
                .then((review) => setState((current) => (current.kind === "ready" ? { ...current, review } : current)))
                .catch(() => undefined);
        },
        []
    );

    const applyReview = React.useCallback((review: CampaignReview) => {
        setState((current) => (current.kind === "ready" ? { ...current, review } : current));
    }, []);

    return { state, reload, applyCampaign, applyReview };
}
