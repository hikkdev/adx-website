"use client";

import * as React from "react";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { PageHeading } from "@/components/workspace/page-heading";
import { btnOutline, ErrorPanel, LoadingLine, useAsync } from "@/components/advertiser/bits";
import { featureOff, promotionsService, type AdBookingView, type AdSlotInfo, type MediaSpec } from "@/services/promotions";
import { AdForm } from "./ad-form";
import { adHref } from "./ad-helpers";
import { AdsClosed, AdsGate } from "./ads-gate";

type Loaded = "CLOSED" | { slots: AdSlotInfo[]; specs: MediaSpec[] | null; ad: AdBookingView | null };

async function readForm(editId: string | null): Promise<Loaded> {
    try {
        const [slots, specs, ad] = await Promise.all([
            promotionsService.slots(),
            // The browser's check is a courtesy: without the specs read, the contract's sizes stand in.
            promotionsService.specs().catch(() => null),
            editId ? promotionsService.ad(editId) : Promise.resolve(null),
        ]);
        return { slots, specs: specs && specs.length > 0 ? specs : null, ad };
    } catch (caught) {
        if (featureOff(caught)) return "CLOSED";
        throw caught;
    }
}

/**
 * "Book an ad" — new, or `editId` for a draft or a turned-down ad. The id is
 * read once: the form writes `?edit=` into the address after the first save
 * so a reload lands on the draft, without reloading the form under it.
 */
export function AdFormPage({ editId }: { editId: string | null }) {
    const [id] = React.useState(editId);
    const back = (
        <Link href={id ? adHref(id) : "/advertiser/promotions"} className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-dim hover:text-ink">
            <ChevronLeft className="size-4" aria-hidden />
            {id ? "Back to the ad" : "Promote on ADX"}
        </Link>
    );
    const heading = (
        <>
            {back}
            <PageHeading title={id ? "Edit your ad" : "Book an ad"} subtitle="Choose a slot, your days and where it shows, then add the words, the link and the artwork." />
        </>
    );
    return (
        <AdsGate heading={heading}>
            <Body id={id} heading={heading} />
        </AdsGate>
    );
}

function Body({ id, heading }: { id: string | null; heading: React.ReactNode }) {
    const state = useAsync(`promotions:form:${id ?? "new"}`, () => readForm(id), "Could not open the form.");
    if (state.kind === "loading") {
        return (
            <>
                {heading}
                <div className="mt-6">
                    <LoadingLine>Reading the slots on sale…</LoadingLine>
                </div>
            </>
        );
    }
    if (state.kind === "error") {
        return (
            <>
                {heading}
                <ErrorPanel title={id ? "Could not read this ad" : "Could not read the slots on sale"} message={state.message} />
                <button type="button" onClick={state.reload} className={`${btnOutline} mt-4`}>
                    Try again
                </button>
            </>
        );
    }
    if (state.value === "CLOSED") {
        return (
            <>
                {heading}
                <AdsClosed />
            </>
        );
    }
    const { slots, specs, ad } = state.value;
    return (
        <>
            {heading}
            <AdForm slots={slots} specs={specs} initial={ad} />
        </>
    );
}
