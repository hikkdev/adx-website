"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { isFeatureOff, messageOf } from "@/lib/api-client";
import { FLAG_PAYMENT_GATEWAYS, useSwitchedOff } from "@/lib/flags";
import { useAdvertiser } from "@/app/advertiser/layout";
import { btnOutline, btnPrimary, KeyValue, useAsync } from "@/components/advertiser/bits";
import { AgeGate, useAgeGate } from "@/components/checkout/age-gate";
import { FeatureOff } from "@/components/platform/feature-off";
import { launchPromotionGateway, reserveCheckoutWindow } from "@/components/promotions/pay";
import { bookingService } from "@/services/booking";
import { walletCovers } from "@/services/campaigns";
import { GATEWAY_LABEL, paymentsService, pickGateway } from "@/services/payments";
import { featureOff, money, promotionsService, type AdBookingView } from "@/services/promotions";
import { adHref } from "./ad-helpers";

/**
 * LM-1: paying for a submitted ad. The ADX wallet first when it covers the
 * total (the booking moves straight to review); otherwise card or UPI
 * through the gateway — the window is taken on the click, the intent opened
 * with `adBookingId`, and the ad's page waits on `?payment=` until the
 * webhook settles it. An unpaid booking lets its days go after 60 minutes.
 * While the platform has `payments.gateways` switched off (the intent is
 * what it guards), card and UPI give way to one plain line; the wallet stays.
 * 29 Sep 2026: both doors go through the age gate — a missing date of birth
 * is asked first, and someone under 18 is held.
 */
export function AdPayPanel({ ad, onChanged }: { ad: AdBookingView; onChanged: (next: AdBookingView | null) => void }) {
    const router = useRouter();
    const advertiser = useAdvertiser();
    const advertiserId = advertiser?.id ?? null;
    const wallet = useAsync(`promo-wallet:${advertiserId ?? ""}`, async () => (advertiserId ? bookingService.wallet(advertiserId) : null), "Could not read your wallet.");
    const gateways = useAsync("promo-gateways", () => paymentsService.gateways(), "Could not read the ways to pay.");
    const [busy, setBusy] = React.useState<"wallet" | "gateway" | null>(null);
    const [error, setError] = React.useState<string | null>(null);
    const [manualUrl, setManualUrl] = React.useState<string | null>(null);
    const gatewaysOff = useSwitchedOff(FLAG_PAYMENT_GATEWAYS);
    const age = useAgeGate();

    const payBy = payByLabel((ad as AdBookingView & { payBy?: string | null }).payBy);
    const spendable = wallet.kind === "ready" ? (wallet.value?.spendable ?? null) : null;
    const covers = walletCovers(spendable, ad.total);
    const gateway = !gatewaysOff && gateways.kind === "ready" ? pickGateway(gateways.value) : null;

    const payFromWallet = async () => {
        if (!age.ready(() => void payFromWallet())) return;
        setBusy("wallet");
        setError(null);
        try {
            const next = await promotionsService.payAdFromWallet(ad.id);
            toast.success("Paid from your wallet — the ad is with ADX for review.");
            onChanged(next && typeof next === "object" && "status" in next ? next : null);
        } catch (caught) {
            if (!age.caught(caught, () => void payFromWallet())) setError(featureOff(caught) ? "Advertising on ADX is not open right now." : messageOf(caught, "Could not pay from the wallet."));
        } finally {
            setBusy(null);
        }
    };

    const payByGateway = async () => {
        if (!gateway || !age.ready(() => void payByGateway())) return;
        const win = reserveCheckoutWindow();
        setBusy("gateway");
        setError(null);
        try {
            const launched = await launchPromotionGateway({ adBookingId: ad.id }, gateway.gateway, win);
            if (!launched.opened && launched.url) setManualUrl(launched.url);
            router.replace(adHref(ad.id, launched.intent.payment.id), { scroll: false });
        } catch (caught) {
            /* The kill switch says nothing here: the plain line replaces card and UPI once the 503 lands. */
            if (!age.caught(caught, () => void payByGateway())) setError(isFeatureOff(caught, FLAG_PAYMENT_GATEWAYS) ? null : messageOf(caught, "Could not open the payment page."));
        } finally {
            setBusy(null);
        }
    };

    return (
        <section className="rounded-lg border border-brand bg-white p-6" data-testid="ad-pay">
            <h2 className="text-base font-semibold text-ink">Pay {money(ad.total)}</h2>
            <p className="mt-1 text-sm text-dim">
                Your days are held while you pay. An unpaid booking is released 60 minutes after it was submitted{payBy ? ` — pay by ${payBy}` : ""}.
            </p>
            <div className="mt-4 rounded-md bg-ground px-4 py-2">
                <KeyValue label="ADX wallet — spendable" value={wallet.kind === "loading" ? "Reading…" : spendable !== null ? money(spendable) : "—"} />
            </div>
            <AgeGate gate={age} className="mt-3" />
            {error && (
                <p role="alert" className="mt-3 text-sm text-danger">
                    {error}
                </p>
            )}
            <div className="mt-4 flex flex-wrap gap-3">
                {covers && (
                    <button type="button" onClick={() => void payFromWallet()} disabled={busy !== null || age.blocked} className={btnPrimary}>
                        {busy === "wallet" ? "Paying…" : `Pay ${money(ad.total)} from wallet`}
                    </button>
                )}
                {gateway && (
                    <button type="button" onClick={() => void payByGateway()} disabled={busy !== null || age.blocked} className={covers ? btnOutline : btnPrimary}>
                        {busy === "gateway" ? "Opening…" : "Pay by card or UPI"}
                    </button>
                )}
            </div>
            {gateway && <p className="mt-2 text-xs text-dim">Card and UPI go through {GATEWAY_LABEL[gateway.gateway]} in a new window; this page waits for the result.</p>}
            {gatewaysOff && (
                <FeatureOff flag={FLAG_PAYMENT_GATEWAYS} className="mt-4">
                    {wallet.kind === "loading" ? undefined : covers ? (
                        "Pay from your ADX wallet, or come back later."
                    ) : (
                        <>
                            Your wallet does not cover this.{" "}
                            <Link href="/advertiser/billing" className="font-semibold text-ink underline">
                                See your wallet
                            </Link>{" "}
                            for how to add money, or come back later.
                        </>
                    )}
                </FeatureOff>
            )}
            {manualUrl && (
                <p className="mt-3 text-sm text-ink">
                    Your browser kept the payment window closed.{" "}
                    <a href={manualUrl} target="_blank" rel="noreferrer" className="font-semibold text-brand underline">
                        Open the payment page
                    </a>
                </p>
            )}
            {!gatewaysOff && wallet.kind !== "loading" && gateways.kind !== "loading" && !covers && !gateway && (
                <p className="mt-3 text-sm text-dim">
                    Your wallet does not cover this and card payments are not set up yet.{" "}
                    <Link href="/advertiser/billing" className="font-semibold text-ink underline">
                        See your wallet
                    </Link>{" "}
                    for how to add money.
                </p>
            )}
        </section>
    );
}

/** "4:35 pm" — when the held days are let go, in the viewer's own clock. */
function payByLabel(value: string | null | undefined): string | null {
    if (!value) return null;
    const at = new Date(value);
    if (Number.isNaN(at.getTime())) return null;
    return at.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
}
