"use client";

import * as React from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { PageHeading } from "@/components/workspace/page-heading";
import { ErrorPanel, LoadingLine, useAsync } from "@/components/advertiser/bits";
import { LandingPageSection } from "@/components/advertiser/landing-page-editor";
import { FeatureGate, FeatureOff } from "@/components/platform/feature-off";
import { FLAG_LANDING_PAGES } from "@/lib/flags";
import { advertiserWorkspace } from "@/services/advertiser-workspace";

/**
 * The ADX landing page for one campaign (Lot E, Q7/Q106) — the page a QR
 * lands on when the advertiser has no website of their own: drafted from
 * the brief (`POST /campaigns/:id/landing-page/generate`), edited, previewed
 * beside the form and published at `/p/:slug`. `?next=` is where "Back"
 * goes — the booking step that sent the person here, else the campaign.
 * Behind the `campaigns.landing-pages` kill switch: switched off, the page
 * keeps its heading and says so instead of reading or drafting anything.
 */
export default function LandingPageRoute() {
    return (
        <React.Suspense fallback={<LoadingLine>Loading the page…</LoadingLine>}>
            <LandingPageScreen />
        </React.Suspense>
    );
}

/** Only a path inside the workspace is followed back — never another site. */
const safeNext = (next: string | null, fallback: string): string => (next && next.startsWith("/advertiser/") && !next.startsWith("//") ? next : fallback);

function LandingPageScreen() {
    const params = useParams<{ id: string }>();
    const id = decodeURIComponent(params.id);
    const search = useSearchParams();
    const back = safeNext(search.get("next"), `/advertiser/campaigns/${encodeURIComponent(id)}`);
    const state = useAsync(
        `landing:${id}`,
        async () => {
            const [campaign, advertiser] = await Promise.all([advertiserWorkspace.campaign(id), advertiserWorkspace.advertiser().catch(() => null)]);
            return { campaign, phone: advertiser?.mobile ?? null };
        },
        "Could not read this campaign."
    );

    if (state.kind === "loading") return <LoadingLine>Loading the page…</LoadingLine>;
    if (state.kind === "error") {
        return (
            <>
                <PageHeading title="Your ADX page" />
                <ErrorPanel title="Could not read this campaign" message={state.message} />
            </>
        );
    }

    const { campaign, phone } = state.value;
    const destination = typeof campaign.trackingConfig?.destinationUrl === "string" ? campaign.trackingConfig.destinationUrl : null;
    return (
        <>
            <Link href={back} className="inline-flex items-center gap-1 text-sm text-dim hover:text-ink">
                <ChevronLeft className="size-4" aria-hidden />
                Back
            </Link>
            <div className="mt-3">
                <PageHeading title="Your ADX page" subtitle={`${campaign.name || "Untitled campaign"} · ${campaign.reference}`} />
            </div>
            {campaign.trackingMethod !== "QR_OR_DEEPLINK" && <p className="mt-4 rounded-md bg-warning-soft px-4 py-3 text-sm text-ink">This campaign does not measure with QR codes, so nothing lands on this page. Choose QR codes in its measurement plan for the page to be used.</p>}
            {campaign.trackingMethod === "QR_OR_DEEPLINK" && destination && (
                <p className="mt-4 rounded-md bg-ground px-4 py-3 text-sm text-ink">
                    Your codes forward to <span className="font-medium">{destination}</span>. The ADX page is where a code with no destination of its own lands — clear the destination URL in the measurement plan to use it.
                </p>
            )}
            <div className="mt-6">
                <FeatureGate
                    flag={FLAG_LANDING_PAGES}
                    off={
                        <FeatureOff flag={FLAG_LANDING_PAGES}>
                            Meanwhile a scan with no destination of its own lands on ADX&apos;s plain thanks page — it still counts.
                        </FeatureOff>
                    }
                >
                    <LandingPageSection campaignId={campaign.id} advertiserPhone={phone} />
                </FeatureGate>
            </div>
        </>
    );
}
