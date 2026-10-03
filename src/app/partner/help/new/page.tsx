"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import { LoadingLine } from "@/components/advertiser/bits";
import { ReportIssue } from "@/components/support/report-issue";

/** Report an issue — every category the desk takes, with an attachment. `?category=` preselects one. */
export default function PartnerNewRequestPage() {
    return (
        <React.Suspense fallback={<LoadingLine>Loading…</LoadingLine>}>
            <NewRequest />
        </React.Suspense>
    );
}

function NewRequest() {
    const params = useSearchParams();
    return <ReportIssue party="PRINT_PARTNER" initialCategory={params.get("category")} />;
}
