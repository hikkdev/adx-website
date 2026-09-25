"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { messageOf } from "@/lib/api-client";
import { BookingCard, ErrorNote, primaryButton, secondaryButton } from "@/components/booking/booking-frame";
import { TextField } from "@/components/booking/fields";
import { launchGateway, reserveCheckoutWindow, returnHref } from "@/components/booking/pay-launch";
import { StepPage, accountNameOf, stepHref, useCampaignId, type ReadyCampaign } from "@/components/booking/step-page";
import { chargesOf, estimateCart, flightDays, rupees } from "@/services/booking";
import { GATEWAY_LABEL, paymentsService, pickGateway, type GatewayStatus } from "@/services/payments";

/**
 * Card payment (5204:67916): "Pay for your campaign" — the card details
 * card, the total including GST, "Authorise payment", "Choose another
 * method" and "Cancel and return to draft". The card number never touches
 * ADX: the fields are drawn as the frame has them but the gateway's secure
 * page, opened on Authorise, is where they are typed.
 */
export default function CardPage({ params }: { params: Promise<{ id: string }> }) {
    const id = useCampaignId(params);
    return (
        <StepPage id={id} step={4} back={null} stepper={false} title={() => "Pay for your campaign"} subtitle={(ready) => `${ready.campaign.name} · Review the amount before you authorise payment.`}>
            {(ready) => <CardDetails key={ready.campaign.id} ready={ready} />}
        </StepPage>
    );
}

function CardDetails({ ready }: { ready: ReadyCampaign }) {
    const router = useRouter();
    const { campaign, review, advertiser } = ready;
    const [gateways, setGateways] = React.useState<GatewayStatus[] | null>(null);
    const [busy, setBusy] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);
    const [fallback, setFallback] = React.useState<{ url: string; paymentId: string } | null>(null);

    React.useEffect(() => {
        let cancelled = false;
        paymentsService
            .gateways()
            .then((rows) => {
                if (!cancelled) setGateways(rows);
            })
            .catch(() => {
                if (!cancelled) setGateways([]);
            });
        return () => {
            cancelled = true;
        };
    }, []);

    const gateway = gateways ? pickGateway(gateways) : null;
    const charges = review ? chargesOf(review) : estimateCart(campaign.spots.map((spot) => ({ ratePerDay: spot.ratePerDay, print: campaign.fulfilment !== "ADVERTISER_SHIPS" })), flightDays(campaign.startDate, campaign.endDate));
    /* RF-1: a paid reservation fee already comes off the intent's amount on the server. */
    const reservation = campaign.reservation ?? null;
    const feePaid = reservation?.status === "PAID";
    const payable = feePaid && reservation?.payable ? Number(reservation.payable) : charges.total;

    const authorise = async () => {
        if (busy || !gateway) return;
        setBusy(true);
        setError(null);
        const win = reserveCheckoutWindow();
        try {
            const launched = await launchGateway(campaign.id, gateway.gateway, "CARD", win);
            if (!launched.opened && launched.url) {
                setFallback({ url: launched.url, paymentId: launched.intent.payment.id });
                setBusy(false);
                return;
            }
            router.push(returnHref(campaign.id, launched.intent.payment.id));
        } catch (caught) {
            win?.close();
            setError(messageOf(caught, "Could not open the payment page."));
            setBusy(false);
        }
    };

    return (
        <>
            <BookingCard title="Card details" description="Complete your payment to submit the campaign for artwork review.">
                <div className="mt-5 space-y-4">
                    <TextField label="Card number" placeholder="•••• •••• •••• ••••" disabled hint={gateway ? `Entered on ${GATEWAY_LABEL[gateway.gateway]}'s secure page, which opens when you authorise. ADX never sees your card number.` : "Entered on the gateway's secure page, which opens when you authorise."} />
                    <div className="grid gap-4 md:grid-cols-2">
                        <TextField label="Expiry date" placeholder="MM / YY" disabled />
                        <TextField label="Security code" placeholder="•••" disabled />
                    </div>
                    <TextField label="Name on card" defaultValue={advertiser?.name ?? accountNameOf(advertiser)} disabled />
                </div>
                <div className="mt-6 flex items-center justify-between rounded-md bg-ground px-4 py-5">
                    <span className="text-base font-medium text-ink">{feePaid ? "Balance including GST" : "Total including GST"}</span>
                    <span className="text-2xl font-semibold text-ink">{rupees(payable)}</span>
                </div>
                {feePaid && reservation && <p className="mt-2 text-xs text-dim">The campaign total is {rupees(charges.total)}; the {rupees(reservation.fee)} reservation fee you paid comes off it.</p>}
                <p className="mt-4 text-sm text-dim">Your bank may ask you to approve this payment. If you cancel, your campaign draft will stay saved.</p>
                {gateways && !gateway && <p className="mt-3 text-sm text-brand">No card gateway is set up yet — ask ADX, or pay by bank transfer from the previous page.</p>}
                {gateway?.testMode && <p className="mt-3 text-xs text-dim">{GATEWAY_LABEL[gateway.gateway]} is in test mode: no real money moves.</p>}
                <ErrorNote message={error} className="mt-4" />
                {fallback && (
                    <div className="mt-4 rounded-md bg-brand-soft px-4 py-3 text-sm text-ink">
                        Your browser blocked the payment window.{" "}
                        <a href={fallback.url} target="_blank" rel="noreferrer" className="font-semibold underline underline-offset-2">
                            Open the payment page ↗
                        </a>{" "}
                        and then{" "}
                        <Link href={returnHref(campaign.id, fallback.paymentId)} className="font-semibold underline underline-offset-2">
                            check the payment
                        </Link>
                        .
                    </div>
                )}
            </BookingCard>
            <div className="mt-6 flex flex-wrap gap-3">
                <button type="button" disabled={busy || !gateway} onClick={() => void authorise()} className={primaryButton}>
                    {busy ? "Opening…" : "Authorise payment"}
                </button>
                <Link href={stepHref(campaign.id, "pay")} className={secondaryButton}>
                    Choose another method
                </Link>
            </div>
            <div className="mt-3">
                <Link href={stepHref(campaign.id, "review")} className={secondaryButton}>
                    Cancel and return to draft
                </Link>
            </div>
        </>
    );
}
