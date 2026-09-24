"use client";

import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { BookingCard, BookingHeader, primaryButton, secondaryButton } from "@/components/booking/booking-frame";
import { StatusPanel } from "@/components/booking/status-panel";
import { useCampaign } from "@/components/booking/use-campaign";
import { accountNameOf, useCampaignId } from "@/components/booking/step-page";
import { creativeFor, formatFlight, rupees } from "@/services/booking";
import { isClaimed, paymentsService, type PaymentSummary } from "@/services/payments";

/**
 * Campaign submitted (5204:66435): "Payment received" over the campaign's
 * facts — id, brand, spaces, dates, amount paid, where the creatives stand,
 * what gates the launch — and what happens next. A bank transfer that is
 * claimed but not yet confirmed says so instead.
 */
export default function SubmittedPage({ params }: { params: Promise<{ id: string }> }) {
    const id = useCampaignId(params);
    return (
        <React.Suspense>
            <Submitted id={id} />
        </React.Suspense>
    );
}

function Submitted({ id }: { id: string }) {
    const search = useSearchParams();
    const paymentId = search.get("payment");
    const { state } = useCampaign(id);
    const [payment, setPayment] = React.useState<PaymentSummary | null>(null);

    React.useEffect(() => {
        if (!paymentId) return;
        let cancelled = false;
        paymentsService
            .get(paymentId)
            .then((row) => {
                if (!cancelled) setPayment(row);
            })
            .catch(() => undefined);
        return () => {
            cancelled = true;
        };
    }, [paymentId]);

    if (state.kind !== "ready") {
        return (
            <div className="mx-auto max-w-[1008px]">
                <BookingHeader title={state.kind === "error" ? "Could not read this campaign" : "Loading…"} subtitle={state.kind === "error" ? state.message : undefined} />
            </div>
        );
    }

    const { campaign, advertiser } = state;
    const claimed = !!payment && isClaimed(payment);
    const uploaded = campaign.spots.filter((spot) => creativeFor(campaign.creatives, spot.id)?.fileUrl).length;
    const approval = campaign.launchBlockedBy?.includes("KYC") ? "Account verification required before launch" : "Publisher approval of artwork before launch";
    const creatives = campaign.creativePath === "ADX_DESIGN_AGENCY" ? "ADX designs the artwork · quote to follow" : uploaded > 0 ? `${uploaded} file${uploaded === 1 ? "" : "s"} uploaded · Under review` : "No artwork yet · upload from the campaign";
    const rows = [
        { label: "Campaign ID", value: campaign.reference },
        { label: "Brand", value: campaign.brandName ?? accountNameOf(advertiser) },
        { label: "Ad spaces", value: `${campaign.spots.length} space${campaign.spots.length === 1 ? "" : "s"} selected` },
        { label: "Dates", value: formatFlight(campaign.startDate, campaign.endDate) },
        { label: claimed ? "Amount claimed" : "Amount paid", value: rupees(payment?.amount ?? campaign.total ?? null) },
        { label: "Creatives", value: creatives },
        { label: "Approval", value: approval },
    ];

    return (
        <div className="mx-auto max-w-[1008px]">
            <StatusPanel
                tone="amber"
                headline={claimed ? "Transfer recorded" : "Payment received"}
                lines={claimed ? ["ADX confirms your bank transfer within 24–48 hours.", "Your spaces are held meanwhile; we'll notify you when it clears."] : ["Your artwork is under review.", "We'll notify you when it is approved."]}
                className="pt-4"
            />
            <BookingCard className="mt-10 px-6 py-8">
                <dl className="divide-y divide-line">
                    {rows.map((row) => (
                        <div key={row.label} className="flex items-center justify-between gap-4 px-3 py-3 text-sm">
                            <dt className="text-dim">{row.label}</dt>
                            <dd className="text-right font-medium text-ink">{row.value}</dd>
                        </div>
                    ))}
                </dl>
                <h2 className="mt-6 text-base font-semibold text-ink">What happens next</h2>
                <p className="mt-2 text-sm text-dim">Your publisher checks the artwork, then coordinates production and delivery. Follow approvals and delivery proofs in your campaign.</p>
            </BookingCard>
            <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
                <Link href="/advertiser" className={secondaryButton}>
                    All campaigns
                </Link>
                <Link href={`/advertiser/campaigns/${encodeURIComponent(campaign.id)}`} className={primaryButton}>
                    View campaign
                </Link>
            </div>
        </div>
    );
}
