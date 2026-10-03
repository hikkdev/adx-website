"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { isFeatureOff, messageOf } from "@/lib/api-client";
import { FLAG_PAYMENT_GATEWAYS, useSwitchedOff } from "@/lib/flags";
import { cn } from "@/lib/utils";
import { FeatureOff } from "@/components/platform/feature-off";
import { AgeGate, useAgeGate } from "@/components/checkout/age-gate";
import { brandButton, CardTitle, ErrorNote, KeyRow, outlineButton } from "@/components/publisher/parts";
import { launchPromotionGateway, reserveCheckoutWindow } from "@/components/promotions/pay";
import { publisherWorkspace, type WalletSnapshot } from "@/services/publisher-workspace";
import { paymentsService, pickGateway, type GatewayStatus } from "@/services/payments";
import { money, promotionsService, type BoostView } from "@/services/promotions";
import { boostPayment, earningsCover, releaseLine } from "./model";

type Read = { wallet: WalletSnapshot | null; gateways: GatewayStatus[] | null };

/**
 * LM-1: paying for a sponsored listing that waits for payment. The earnings
 * wallet pays it at once when what is withdrawable covers the total (→
 * SCHEDULED); otherwise — or by choice — card or UPI through the gateway:
 * the window is taken synchronously on the click, the intent opened with
 * `listingBoostId`, and the boost's page polls the payment (`?payment=`).
 * While the platform has `payments.gateways` switched off (the intent is
 * what it guards), the card-or-UPI half is one plain line; earnings still pay.
 * 29 Sep 2026: both halves go through the age gate — a missing date of birth
 * is asked first, and someone under 18 is held.
 */
export function BoostPayPanel({ boost, onPaid, className }: { boost: BoostView; onPaid: (next: BoostView) => void; className?: string }) {
    const router = useRouter();
    const [read, setRead] = React.useState<Read | null>(null);
    const [busy, setBusy] = React.useState<"wallet" | "gateway" | null>(null);
    const [error, setError] = React.useState<string | null>(null);
    const gatewaysOff = useSwitchedOff(FLAG_PAYMENT_GATEWAYS);
    const age = useAgeGate();

    React.useEffect(() => {
        let cancelled = false;
        Promise.all([publisherWorkspace.wallet().catch(() => null), paymentsService.gateways().catch(() => null)]).then(([wallet, gateways]) => {
            if (!cancelled) setRead({ wallet, gateways });
        });
        return () => {
            cancelled = true;
        };
    }, []);

    const wallet = read?.wallet ?? null;
    const frozen = !!wallet?.frozenAt;
    const covers = !!wallet && !frozen && earningsCover(wallet.withdrawable, boost.total);
    const gateway = !gatewaysOff && read?.gateways ? pickGateway(read.gateways) : null;

    const payFromWallet = async () => {
        if (busy || !covers || !age.ready(() => void payFromWallet())) return;
        setBusy("wallet");
        setError(null);
        try {
            const next = await promotionsService.payBoostFromWallet(boost.id);
            toast.success("Paid from your earnings wallet.");
            onPaid(next);
        } catch (caught) {
            if (!age.caught(caught, () => void payFromWallet())) setError(messageOf(caught, "Could not pay from your earnings wallet."));
        } finally {
            setBusy(null);
        }
    };

    const payByGateway = async () => {
        if (busy || !gateway || !age.ready(() => void payByGateway())) return;
        const win = reserveCheckoutWindow();
        setBusy("gateway");
        setError(null);
        try {
            const launched = await launchPromotionGateway({ listingBoostId: boost.id }, gateway.gateway, win);
            boostPayment.remember(boost.id, { id: launched.intent.payment.id, url: launched.url });
            if (!launched.opened && launched.url) toast.message("Your browser kept the payment window closed — open it from the next page.");
            router.push(`/publisher/promotions/${encodeURIComponent(boost.id)}?payment=${encodeURIComponent(launched.intent.payment.id)}`);
        } catch (caught) {
            win?.close();
            /* The kill switch says nothing here: the plain line replaces card and UPI once the 503 lands. */
            if (!age.caught(caught, () => void payByGateway())) setError(isFeatureOff(caught, FLAG_PAYMENT_GATEWAYS) ? null : messageOf(caught, "Could not open the payment page."));
            setBusy(null);
        }
    };

    return (
        <section className={cn("rounded-lg border border-line bg-white p-6", className)} data-testid="boost-pay">
            <CardTitle>Pay {money(boost.total)}</CardTitle>
            <p className="mt-1 text-sm text-dim">{releaseLine(boost.createdAt, (boost as BoostView & { payBy?: string | null }).payBy)}</p>

            <div className="mt-5 grid gap-4 md:grid-cols-2">
                <div className="flex h-full flex-col rounded-lg border border-line p-4">
                    <p className="text-sm font-semibold text-ink">From your earnings wallet</p>
                    <KeyRow label="Withdrawable" value={read ? (wallet ? money(wallet.withdrawable) : "Could not read") : "Reading…"} className="py-1" />
                    <p className="min-h-10 text-xs text-dim">
                        {!read
                            ? ""
                            : frozen
                              ? "Your earnings wallet is frozen, so it cannot pay right now."
                              : covers
                                ? "Paid at once; it is scheduled straight away."
                                : wallet
                                  ? `Not enough withdrawable earnings to cover the total${gatewaysOff ? "." : " — pay by card or UPI."}`
                                  : `Your earnings wallet could not be read${gatewaysOff ? "." : " — pay by card or UPI."}`}
                    </p>
                    <button type="button" onClick={payFromWallet} disabled={!covers || !!busy || age.blocked} className={cn(covers ? brandButton : outlineButton, "mt-auto w-full")}>
                        {busy === "wallet" ? "Paying…" : "Pay from earnings"}
                    </button>
                </div>
                {gatewaysOff ? (
                    <FeatureOff flag={FLAG_PAYMENT_GATEWAYS} className="h-full">
                        {!read ? undefined : covers ? "Pay from your earnings wallet, or come back later." : "Come back later."}
                    </FeatureOff>
                ) : (
                    <div className="flex h-full flex-col rounded-lg border border-line p-4">
                        <p className="text-sm font-semibold text-ink">Card or UPI</p>
                        <KeyRow label="Amount" value={money(boost.total)} className="py-1" />
                        <p className="min-h-10 text-xs text-dim">
                            {!read ? "" : gateway ? "Opens the secure payment page in a new window; this page checks the payment when you are back." : "No card or UPI gateway is set up yet — ask ADX."}
                        </p>
                        <button type="button" onClick={payByGateway} disabled={!gateway || !!busy || age.blocked} className={cn(covers ? outlineButton : brandButton, "mt-auto w-full")}>
                            {busy === "gateway" ? "Opening…" : "Pay by card or UPI"}
                        </button>
                    </div>
                )}
            </div>
            <AgeGate gate={age} className="mt-4" />
            {error && (
                <div className="mt-4">
                    <ErrorNote message={error} />
                </div>
            )}
        </section>
    );
}
