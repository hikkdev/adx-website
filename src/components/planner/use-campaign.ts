"use client";

import * as React from "react";
import { ApiError, messageOf } from "@/lib/api-client";
import { plannerService, type Campaign, type CampaignPatch } from "@/services/planner";

export type CampaignState = { kind: "loading" } | { kind: "missing" } | { kind: "error"; message: string } | { kind: "ready"; campaign: Campaign };

/**
 * One campaign for a screen: read by id, saved a screen at a time. The
 * campaign is the state — every save answers the whole record, so a step
 * never has to guess what the last one wrote.
 */
export function useCampaign(id: string | null) {
    const [state, setState] = React.useState<{ key: string | null; value: CampaignState }>({ key: null, value: { kind: "loading" } });
    const [tick, setTick] = React.useState(0);

    React.useEffect(() => {
        if (!id) return;
        let cancelled = false;
        plannerService
            .get(id)
            .then((campaign) => {
                if (!cancelled) setState({ key: id, value: { kind: "ready", campaign } });
            })
            .catch((caught: unknown) => {
                if (cancelled) return;
                if (caught instanceof ApiError && caught.status === 404) setState({ key: id, value: { kind: "missing" } });
                else setState({ key: id, value: { kind: "error", message: messageOf(caught, "Could not read this campaign.") } });
            });
        return () => {
            cancelled = true;
        };
    }, [id, tick]);

    const save = React.useCallback(
        async (patch: CampaignPatch): Promise<Campaign> => {
            if (!id) throw new ApiError(0, "NO_CAMPAIGN", "This campaign has not been created yet.");
            const next = await plannerService.patch(id, patch);
            setState((current) => {
                const previous = current.value.kind === "ready" ? current.value.campaign : null;
                /* A PATCH answers the row without the detail view's extras; keep what the read carried. */
                return { key: id, value: { kind: "ready", campaign: previous ? { ...previous, ...next, spots: next.spots ?? previous.spots, creatives: next.creatives ?? previous.creatives, codes: next.codes ?? previous.codes, pois: next.pois ?? previous.pois } : next } };
            });
            return next;
        },
        [id]
    );

    const replace = React.useCallback(
        (campaign: Campaign) => {
            setState({ key: id, value: { kind: "ready", campaign } });
        },
        [id]
    );

    const reload = React.useCallback(() => setTick((n) => n + 1), []);

    const value: CampaignState = !id ? { kind: "loading" } : state.key === id ? state.value : { kind: "loading" };
    return { state: value, campaign: value.kind === "ready" ? value.campaign : null, save, replace, reload };
}
