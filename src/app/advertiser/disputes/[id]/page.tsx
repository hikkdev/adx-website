"use client";

import * as React from "react";
import { useParams, useSearchParams } from "next/navigation";
import { LoadingLine } from "@/components/advertiser/bits";
import { DisputeDetailView } from "@/components/disputes/dispute-detail";

/** One dispute: the case, its conversation and evidence — or, once decided, the decision. */
export default function DisputePage() {
    return (
        <React.Suspense fallback={<LoadingLine>Loading the case…</LoadingLine>}>
            <Dispute />
        </React.Suspense>
    );
}

function Dispute() {
    const { id } = useParams<{ id: string }>();
    const params = useSearchParams();
    return <DisputeDetailView key={id} base="/advertiser" disputeId={id} justRaised={params.get("raised") === "1"} />;
}
