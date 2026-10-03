"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import { LoadingLine } from "@/components/advertiser/bits";
import { RaiseDispute } from "@/components/disputes/raise-dispute";

/** Raise a dispute — `?orderId=` fills the order when the case starts from a booking or a proof. */
export default function RaiseDisputePage() {
    return (
        <React.Suspense fallback={<LoadingLine>Loading…</LoadingLine>}>
            <Raise />
        </React.Suspense>
    );
}

function Raise() {
    const params = useSearchParams();
    return <RaiseDispute base="/publisher" persona="publisher" givenOrderId={params.get("orderId")} />;
}
