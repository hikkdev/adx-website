"use client";

import * as React from "react";
import Link from "next/link";
import { PageHeading } from "@/components/workspace/page-heading";
import { useAdvertiser } from "@/app/advertiser/layout";
import { btnOutline, btnPrimary, ErrorPanel, KeyValue, LoadingLine, StatusChip, useAsync } from "@/components/advertiser/bits";
import { FeatureOff } from "@/components/platform/feature-off";
import { FLAG_PAYMENT_GATEWAYS, useSwitchedOff } from "@/lib/flags";
import { configuredGateways, GATEWAY_LABEL, paymentsService, type BankTransferAvailability, type GatewayStatus } from "@/services/payments";
import { inr, isZero, PAYMENT_METHODS_DECISION, walletService, type WalletSnapshot } from "@/services/wallet";

/**
 * Payment methods — the app's screen about what this account genuinely has
 * (Q111): no saved cards, no UPI handles, no mandate. The ADX wallet is the
 * one rail money is held on; card and UPI go through whichever gateways ADX
 * has keys for (`GET /payments/gateways`, test mode or live); a bank transfer
 * is offered when ADX has named its receiving account
 * (`GET /payments/bank-transfer/details`). Information only — nothing to add.
 * While the platform has `payments.gateways` switched off, card, UPI and the
 * bank transfer (all three start as a payment intent) are one plain line.
 */
export default function PaymentMethodsPage() {
    const advertiser = useAdvertiser();
    const advertiserId = advertiser?.id ?? null;
    const gatewaysOff = useSwitchedOff(FLAG_PAYMENT_GATEWAYS);
    const state = useAsync(
        `methods:${advertiserId ?? ""}`,
        async () => {
            if (!advertiserId) return null;
            const [wallet, gateways, bank] = await Promise.all([
                walletService.wallet(advertiserId).catch(() => null as WalletSnapshot | null),
                paymentsService.gateways().catch(() => null as GatewayStatus[] | null),
                paymentsService.bankTransferDetails().catch(() => null as BankTransferAvailability | null),
            ]);
            return { wallet, gateways, bank };
        },
        "Could not read your payment methods."
    );

    const heading = (
        <>
            <Link href="/advertiser/billing" className="text-sm text-ink hover:text-brand">
                Back to wallet & billing
            </Link>
            <div className="mt-3 border-t border-line pt-5">
                <PageHeading title="Payment methods" subtitle="How a campaign or a plan is actually paid for today." />
            </div>
        </>
    );

    if (state.kind === "loading" || (state.kind === "ready" && !state.value)) {
        return (
            <>
                {heading}
                <div className="mt-6">
                    <LoadingLine>Loading your payment methods…</LoadingLine>
                </div>
            </>
        );
    }
    if (state.kind === "error") {
        return (
            <>
                {heading}
                <ErrorPanel title="Could not read your payment methods" message={state.message} />
            </>
        );
    }

    const { wallet, gateways, bank } = state.value!;
    const connected = gateways ? configuredGateways(gateways) : [];
    const bankOn = bank?.configured === true;

    return (
        <>
            {heading}
            <p className="mt-6 rounded-md bg-info-soft px-4 py-3 text-sm text-info">{PAYMENT_METHODS_DECISION}</p>

            <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
                <div className="min-w-0 space-y-4">
                    <MethodCard title="ADX wallet" line="The only rail the platform holds money on. Every campaign and every plan is charged here." chip={{ label: "Default", tone: "success" }}>
                        {wallet ? (
                            <div className="mt-3 border-t border-line pt-2">
                                <KeyValue label="Available to spend" value={<span className="tabular-nums">{inr(wallet.spendable)}</span>} strong />
                                {!isZero(wallet.goodwill) && <KeyValue label="Of which ADX goodwill credit" value={<span className="tabular-nums">{inr(wallet.goodwill)}</span>} />}
                                {!isZero(wallet.held) && <KeyValue label="Held for confirmed campaigns" value={<span className="tabular-nums">{inr(wallet.held)}</span>} />}
                            </div>
                        ) : (
                            <p className="mt-3 text-sm text-dim">Could not read the balance just now.</p>
                        )}
                    </MethodCard>

                    {gatewaysOff ? (
                        <FeatureOff flag={FLAG_PAYMENT_GATEWAYS}>Every campaign and plan can still be paid from your ADX wallet.</FeatureOff>
                    ) : (
                        <>
                            <MethodCard
                                title="Card and UPI"
                                line={connected.length > 0 ? `Through ${connected.map((row) => GATEWAY_LABEL[row.gateway]).join(", ")} — offered on the campaign and plan payment pages.` : gateways === null ? "Could not read which gateways are connected." : "Not connected — and this is the whole of what is missing."}
                                chip={{ label: connected.length > 0 ? `${connected.length} connected` : "Not connected", tone: connected.length > 0 ? "success" : "neutral" }}
                            >
                                {connected.length > 0 && (
                                    <div className="mt-3 border-t border-line pt-2">
                                        {connected.map((row) => (
                                            <KeyValue key={row.gateway} label={GATEWAY_LABEL[row.gateway]} value={row.testMode ? "Test mode" : "Live"} />
                                        ))}
                                    </div>
                                )}
                                <p className="mt-3 text-sm text-dim">
                                    {connected.length > 0
                                        ? "A card or UPI payment opens the gateway's own page in a new tab. The amount tops up your ADX wallet and the campaign or plan is paid from it the moment the gateway confirms — so every rupee still shows under Transactions with where it went. Nothing is saved against your account: no card on file, no auto-debit mandate."
                                        : "ADX has not connected a payment gateway yet. Until it does there is no card or UPI checkout, no card can be saved against your account, and no auto-debit mandate can be set up — so nothing here can charge you on its own."}
                                </p>
                            </MethodCard>

                            <MethodCard
                                title="Direct banking (NEFT / RTGS / IMPS)"
                                line={bankOn ? "Offered on the campaign and plan payment pages, with a reference to quote." : "Not offered right now."}
                                chip={{ label: bankOn ? "Offered" : "Not offered", tone: bankOn ? "success" : "neutral" }}
                            >
                                <p className="mt-3 text-sm text-dim">
                                    {bankOn
                                        ? "Choose it when you pay: ADX gives you its account and a reference for that payment. Transfer the exact amount, then enter the UTR your bank gave you. ADX confirms the transfer against its statement, usually within 24–48 hours."
                                        : "When ADX names its receiving account, a bank transfer appears as a way to pay on the campaign and plan payment pages."}
                                </p>
                            </MethodCard>
                        </>
                    )}

                    <MethodCard title="Bank accounts and withdrawals" line="No withdrawals. A bank account is for a refund only." chip={{ label: "Refunds only", tone: "neutral" }}>
                        <p className="mt-3 text-sm text-dim">
                            Your wallet holds credit for buying, not earnings, so there is nothing to withdraw. The one time money leaves an advertiser wallet is a refund, and when you ask for it by bank transfer ADX finance sends it to a verified account in your name, with your consent on record. Support arranges both.
                        </p>
                    </MethodCard>
                </div>

                <div className="grid grid-cols-1 content-start gap-4">
                    <section className="rounded-lg border border-line bg-white p-5">
                        <h2 className="text-sm font-semibold text-ink">Getting money back</h2>
                        <p className="mt-2 text-xs text-dim">A refund is the only way credit leaves this account. You raise it with ADX support, and an admin who did not raise it decides it — nothing about it is automatic.</p>
                        <p className="mt-2 text-xs text-dim">As wallet credit, the amount is released back to spend. As a bank transfer, it leaves your wallet on approval and finance pays it with the UTR recorded — if the transfer bounces, the money comes back to your wallet with the reason on the line.</p>
                        <Link href="/advertiser/billing/refunds" className={`${btnOutline} mt-4 w-full`}>
                            Refund requests
                        </Link>
                    </section>
                    <p className="px-1 text-xs text-dim">Nothing about money on ADX happens on its own. A person puts every credit on this wallet, and a person decides every rupee that leaves it.</p>
                    <Link href="/advertiser/billing" className={`${btnPrimary} w-full`}>
                        See what you have been charged
                    </Link>
                </div>
            </div>
        </>
    );
}

function MethodCard({ title, line, chip, children }: { title: string; line: string; chip: { label: string; tone: "success" | "neutral" }; children?: React.ReactNode }) {
    return (
        <section className="rounded-lg border border-line bg-white p-5">
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <h2 className="text-sm font-semibold text-ink">{title}</h2>
                    <p className="mt-0.5 text-xs text-dim">{line}</p>
                </div>
                <StatusChip label={chip.label} tone={chip.tone} />
            </div>
            {children}
        </section>
    );
}
