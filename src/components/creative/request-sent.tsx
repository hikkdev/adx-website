"use client";

import * as React from "react";
import { creativeHref, type CreativeProps } from "@/components/creative/creative-screen";
import { StepActions } from "@/components/planner/planner-shell";
import { briefOf } from "@/services/creatives";

/** 04 · Design request sent (5204:68899): the confirmation, and the two ways on. */
export function RequestSent({ campaign }: CreativeProps) {
    const sent = Boolean(briefOf(campaign));
    return (
        <>
            <section className="rounded-xl border border-[rgba(204,204,204,0.5)] bg-white px-8 py-8">
                <h2 className="text-lg font-semibold leading-6 text-ink">{sent ? "Your design brief has been sent" : "No design brief has been sent yet"}</h2>
                <p className="mt-2 text-sm text-dim">{sent ? "The next step is to review the quote from the ADX design team." : "Write the brief and send it, and ADX will quote the artwork."}</p>
            </section>
            <StepActions
                back={{ label: "View request", href: creativeHref(campaign.id, sent ? "request" : "brief"), width: 130 }}
                next={{ label: "Back to campaign draft", href: `/advertiser/campaigns/${encodeURIComponent(campaign.id)}/artwork` }}
            />
        </>
    );
}
