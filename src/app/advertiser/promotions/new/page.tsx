"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import { LoadingLine } from "@/components/advertiser/bits";
import { AdFormPage } from "@/components/promotions/ads/ad-form-page";

/** LM-1 "Book an ad"; `?edit=<id>` opens a draft or a turned-down ad. */
export default function NewAdPage() {
    return (
        <React.Suspense fallback={<LoadingLine />}>
            <FromSearch />
        </React.Suspense>
    );
}

function FromSearch() {
    const params = useSearchParams();
    return <AdFormPage editId={params.get("edit")} />;
}
