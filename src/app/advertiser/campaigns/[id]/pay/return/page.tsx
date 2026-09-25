"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { BookingCard, FactRows, primaryButton, secondaryButton } from "@/components/booking/booking-frame";
import { StepPage, accountNameOf, stepHref, useCampaignId, type ReadyCampaign } from "@/components/booking/step-page";
import { StatusPanel } from "@/components/booking/status-panel";
import { rupees } from "@/services/booking";
import { isClaimed, isPaid, lastPayment, paymentsService, pollPayment, type PaymentSummary } from "@/services/payments";

/**
 * Where the pay page lands after the gateway opened (5204:65893 "Checking
 * payment" and 5204:66161 "Payment not completed"). The gateway's own
 * return goes to the backend's status page; this one asks ADX — polling
 * `GET /payments/:id` until the webhook or the confirm settles it — and
 * moves on to the submitted page, or says the payment was not completed
 * with "Try payment again" and "Check payment status". RF-1: a reservation
 * fee (`?purpose=RESERVATION_FEE`) goes back to the pay step once it lands —
 * the spots are held, and the balance is paid from there.
 */
export default function ReturnPage({ params }: { params: Promise<{ id: string }> }) {
    const id = useCampaignId(params);
    return (
        <React.Suspense>
            <ReturnInner id={id} />
        </React.Suspense>
    );
}

function ReturnInner({ id }: { id: string }) {
    const search = useSearchParams();
    const paymentId = search.get("payment");
    const fee = search.get("purpose") === "RESERVATION_FEE";
    const collect = search.get("collect") === "1";
    const [heading, setHeading] = React.useState("Checking payment");
    return (
        <StepPage id={id} step={4} back={null} title={() => heading} subtitle={(ready) => `${accountNameOf(ready.advertiser)} · ${ready.campaign.name}`}>
            {(ready) => <Checking key={`${ready.campaign.id}:${paymentId ?? ""}`} ready={ready} paymentId={paymentId} fee={fee} collect={collect} onHeading={setHeading} />}
        </StepPage>
    );
}

type Phase = { kind: "checking" } | { kind: "failed"; payment: PaymentSummary } | { kind: "unsettled"; payment: PaymentSummary | null } | { kind: "missing" };

function Checking({ ready, paymentId, fee, collect, onHeading }: { ready: ReadyCampaign; paymentId: string | null; fee: boolean; collect: boolean; onHeading: (heading: string) => void }) {
    const router = useRouter();
    const { campaign } = ready;
    const remembered = React.useMemo(() => lastPayment.read(campaign.id), [campaign.id]);
    const wanted = paymentId ?? remembered?.id ?? null;
    const forFee = fee || remembered?.purpose === "RESERVATION_FEE";
    const [phase, setPhase] = React.useState<Phase>(wanted ? { kind: "checking" } : { kind: "missing" });
    const [payment, setPayment] = React.useState<PaymentSummary | null>(null);
    const [round, setRound] = React.useState(0);

    React.useEffect(() => {
        if (!wanted) return;
        const poll = pollPayment(wanted, { intervalMs: 3000, timeoutMs: 4 * 60 * 1000, onTick: setPayment, read: paymentsService.get });
        poll.done.then(({ payment: last, settled }) => {
            if (!last) {
                setPhase({ kind: "unsettled", payment: null });
                return;
            }
            if (settled && (isPaid(last.status) || isClaimed(last))) {
                if (forFee) {
                    toast.success(isClaimed(last) ? "Transfer recorded. The spots are held once ADX confirms it." : "Reservation fee received — the spots are held. Pay the balance when you are ready.");
                    router.replace(stepHref(campaign.id, "pay"));
                    return;
                }
                router.replace(`${stepHref(campaign.id, "submitted")}?payment=${encodeURIComponent(last.id)}`);
                return;
            }
            if (settled) {
                setPhase({ kind: "failed", payment: last });
                onHeading("Payment not completed");
            } else {
                setPhase({ kind: "unsettled", payment: last });
            }
        });
        return () => poll.stop();
    }, [wanted, round, campaign.id, router, onHeading, forFee]);

    const facts = [
        { label: "Payment reference", value: payment?.reference ?? campaign.reference },
        { label: "Campaign", value: campaign.name },
        { label: forFee ? "Reservation fee" : "Amount", value: rupees(payment?.amount ?? (forFee ? campaign.reservation?.fee : campaign.total) ?? null) },
    ];
    const support = (
        <Link href="/advertiser/help" className="mt-5 inline-block text-sm text-dim underline underline-offset-2 hover:text-ink">
            Contact payment support
        </Link>
    );

    if (phase.kind === "missing") {
        return (
            <BookingCard className="py-8">
                <StatusPanel tone="red" headline="No payment to check." lines={["This page needs a payment to look for. Start again from Review & pay."]}>
                    <Link href={stepHref(campaign.id, "pay")} className={`${primaryButton} mt-6`}>
                        Back to Review &amp; pay
                    </Link>
                </StatusPanel>
            </BookingCard>
        );
    }

    if (phase.kind === "failed") {
        return (
            <BookingCard className="py-8">
                <StatusPanel tone="red" headline="Your payment wasn't completed." lines={["Your campaign details and artwork are saved.", "If your bank shows a debit, check payment status before trying again.", "Otherwise, retry or choose another payment method."]} />
                <div className="mx-auto mt-6 max-w-[963px]">
                    <FactRows rows={facts} />
                    {phase.payment.failureReason && <p className="mt-3 text-center text-sm text-dim">{phase.payment.failureReason}</p>}
                    <div className="mt-6 flex flex-wrap justify-center gap-3">
                        <Link href={stepHref(campaign.id, "pay")} className={primaryButton}>
                            Try payment again
                        </Link>
                        <button
                            type="button"
                            onClick={() => {
                                setPhase({ kind: "checking" });
                                onHeading("Checking payment");
                                setRound((r) => r + 1);
                            }}
                            className={secondaryButton}
                        >
                            Check payment status
                        </button>
                    </div>
                    <div className="text-center">{support}</div>
                </div>
            </BookingCard>
        );
    }

    return (
        <BookingCard className="py-8">
            <StatusPanel
                tone="amber"
                headline={phase.kind === "unsettled" ? "Still waiting for the bank." : collect ? "Approve the request in your UPI app." : "We're checking your payment."}
                lines={
                    phase.kind === "unsettled"
                        ? ["ADX has not heard from the gateway yet. If you completed the payment, it will settle on its own; check again in a minute.", "Please don't make another payment for this campaign yet."]
                        : [collect ? "A collect request was sent to your UPI id — open your UPI app and approve it. Keep this page open while we confirm the result." : "Keep this page open while we confirm the result.", "Please don't make another payment for this campaign yet."]
                }
            />
            <div className="mx-auto mt-6 max-w-[963px]">
                <FactRows rows={facts} />
                <div className="mt-6 flex flex-wrap justify-center gap-3">
                    {remembered?.url && (
                        <a href={remembered.url} target="_blank" rel="noreferrer" className={secondaryButton}>
                            Open the payment page again ↗
                        </a>
                    )}
                    {phase.kind === "unsettled" && (
                        <button
                            type="button"
                            onClick={() => {
                                setPhase({ kind: "checking" });
                                setRound((r) => r + 1);
                            }}
                            className={secondaryButton}
                        >
                            Check payment status
                        </button>
                    )}
                </div>
                <div className="text-center">{support}</div>
            </div>
        </BookingCard>
    );
}
