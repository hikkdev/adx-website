"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { toast } from "sonner";
import { ApiError, isFeatureOff, messageOf } from "@/lib/api-client";
import { apiConfig } from "@/lib/api-config";
import { FLAG_PAYMENT_GATEWAYS, useSwitchedOff } from "@/lib/flags";
import { cn } from "@/lib/utils";
import { FeatureOff } from "@/components/platform/feature-off";
import { PageHeading } from "@/components/workspace/page-heading";
import { btnOutline, btnPrimary, ErrorPanel, KeyValue, LoadingLine, StatusChip, useAsync } from "@/components/advertiser/bits";
import { ChoiceCard } from "@/components/booking/fields";
import { AgeGate, useAgeGate } from "@/components/checkout/age-gate";
import { BankTransferPanel } from "@/components/packages/bank-transfer-panel";
import { TermsDialog } from "@/components/packages/terms-dialog";
import { advertiserWorkspace, type Invoice } from "@/services/advertiser-workspace";
import { checkoutUrl, GATEWAY_LABEL, isPaid, paymentsService, pollPayment, type BankTransferDetails, type GatewayStatus, type PaymentGateway, type PaymentSummary } from "@/services/payments";
import {
    chosenRail,
    CYCLE_LABEL,
    isPositive,
    lastPlanPayment,
    packagesService,
    pctLabel,
    planDate,
    planMoney,
    payRails,
    payRefusal,
    saleStatusLabel,
    termsAccepted,
    termsLine,
    termsStanding,
    walletShortfall,
    type PackagePolicy,
    type PackageSale,
    type PayWith,
} from "@/services/packages";
import { walletService, type WalletSnapshot } from "@/services/wallet";

/**
 * One plan sale — the app's package payment screen (Lot J-M, Lot C, Lot D)
 * on the web: the lines, the discount and the GST, the total and the
 * reference; the plan terms read and accepted before any money moves (the
 * server refuses both doors until they are, `assertSaleTermsAccepted`); then
 * the doors the policy opens — the ADX wallet (`POST /packages/sales/:id/pay`),
 * a card/UPI gateway (`POST /payments/intents { packageSaleId, gateway }`, the
 * gateway's page in a new tab, `GET /payments/:id` until it is CAPTURED — the
 * capture tops up the wallet and pays the plan server-side), or a bank
 * transfer with its reference and UTR claim. Paid, it is the receipt; a free
 * trial says it is one; a cancelled or ended sale says there is nothing to pay.
 * While the platform has `payments.gateways` switched off, the gateway and
 * bank doors (both open with an intent) give way to one plain line; the
 * wallet door stays. Every door is an order (29 Sep 2026): the age gate asks
 * a missing date of birth before money moves, and holds them for someone
 * under 18.
 */
export default function PlanSalePage() {
    const params = useParams<{ id: string }>();
    const saleId = params.id;
    const state = useAsync(
        `plan-sale:${saleId}`,
        async () => {
            const sale = await packagesService.get(saleId);
            const [wallet, gateways, active, bank, invoices] = await Promise.all([
                walletService.wallet(sale.advertiserId).catch(() => null as WalletSnapshot | null),
                paymentsService.gateways().catch(() => [] as GatewayStatus[]),
                packagesService.active().catch(() => null),
                paymentsService.bankTransferDetails().catch(() => null),
                sale.status === "ACTIVE" ? advertiserWorkspace.invoices(sale.advertiserId).catch(() => [] as Invoice[]) : Promise.resolve([] as Invoice[]),
            ]);
            return { sale, wallet, gateways, policy: active?.policy ?? null, bank: bank?.configured ? bank.details : null, invoice: invoices.find((row) => row.packageSaleId === sale.id && row.kind !== "CREDIT_NOTE") ?? null };
        },
        "Could not load this plan."
    );

    const back = (
        <Link href="/advertiser/plans" className="text-sm text-ink hover:text-brand">
            Back to plans
        </Link>
    );

    if (state.kind === "loading") {
        return (
            <>
                {back}
                <div className="mt-6">
                    <LoadingLine>Loading your plan…</LoadingLine>
                </div>
            </>
        );
    }
    if (state.kind === "error") {
        return (
            <>
                {back}
                <div className="mt-3 border-t border-line pt-5">
                    <PageHeading title="Your plan" />
                </div>
                <ErrorPanel title="Could not load this plan" message={state.message} />
            </>
        );
    }
    const loaded = state.value;
    return <SaleView key={`${loaded.sale.id}:${loaded.sale.status}`} {...loaded} back={back} reload={state.reload} />;
}

type Waiting = { payment: PaymentSummary; url: string | null };

function SaleView({ sale: initial, wallet, gateways, policy, bank, invoice, back, reload }: { sale: PackageSale; wallet: WalletSnapshot | null; gateways: GatewayStatus[]; policy: PackagePolicy | null; bank: BankTransferDetails | null; invoice: Invoice | null; back: React.ReactNode; reload: () => void }) {
    const [sale, setSale] = React.useState(initial);
    const [payWith, setPayWith] = React.useState<PayWith | null>(null);
    const [busy, setBusy] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);
    const [reading, setReading] = React.useState(false);
    const [claimed, setClaimed] = React.useState<PaymentSummary | null>(null);
    /* A gateway payment this browser opened for the sale — resumed after a reload. */
    const [waiting, setWaiting] = React.useState<Waiting | null>(() => {
        if (initial.status === "ACTIVE") return null;
        const remembered = lastPlanPayment.read(initial.id);
        return remembered ? { payment: { id: remembered.id } as PaymentSummary, url: remembered.url } : null;
    });
    const [round, setRound] = React.useState(0);

    const paid = sale.status === "ACTIVE";
    const trial = sale.paidMethod === "TRIAL";
    const closed = sale.status === "CANCELLED" || sale.status === "EXPIRED";
    const status = saleStatusLabel(sale);
    const standing = termsStanding(sale);
    const agreed = termsAccepted(standing);
    const gatewaysOff = useSwitchedOff(FLAG_PAYMENT_GATEWAYS);
    const age = useAgeGate();
    const rails = payRails({ policy, gateways, bankConfigured: !!bank, spendable: wallet?.spendable ?? null, total: sale.total, gatewaysOff });
    const chosen = chosenRail(payWith, rails);
    const short = wallet ? walletShortfall(wallet.spendable, sale.total) : null;
    const walletAllowed = policy?.payment.walletAllowed ?? false;
    const policyFailed = policy === null;
    const noDoor = policy !== null && rails.length === 0;
    /* Switched off, the plain line says why the gateway and bank doors are gone — the note under the doors does not say it again. */
    const walletRail = rails.some((rail) => rail.id === "WALLET");
    const viaGateway = chosen !== null && chosen !== "WALLET" && chosen !== "BANK_TRANSFER";

    /* Wait on the gateway: `GET /payments/:id` every three seconds until CAPTURED or FAILED. */
    const waitingId = waiting?.payment.id ?? null;
    React.useEffect(() => {
        if (!waitingId) return;
        const poll = pollPayment(waitingId, {
            intervalMs: 3000,
            timeoutMs: 10 * 60 * 1000,
            onTick: (payment) => setWaiting((current) => (current && current.payment.id === payment.id ? { ...current, payment } : current)),
        });
        poll.done.then(async ({ payment, settled }) => {
            if (!payment || !settled) return;
            if (isPaid(payment.status)) {
                lastPlanPayment.forget(sale.id);
                const fresh = await packagesService.get(sale.id).catch(() => null);
                setWaiting(null);
                setBusy(false);
                if (fresh) setSale(fresh);
                if (fresh?.status === "ACTIVE") toast.success("Payment received. Your plan is active.");
                else setError(`${GATEWAY_LABEL[payment.gateway]} took ${planMoney(payment.amount)} and it is in your wallet, but the plan could not be activated from it. ADX ops have been told; try paying from the wallet, or contact support.`);
                return;
            }
            if (payment.status === "FAILED") {
                lastPlanPayment.forget(sale.id);
                setWaiting(null);
                setBusy(false);
                setError(`${GATEWAY_LABEL[payment.gateway]} did not take the payment${payment.failureReason ? `: ${payment.failureReason}` : "."} Nothing was charged.`);
            }
        });
        return () => poll.stop();
    }, [waitingId, round, sale.id]);

    const payFromWallet = async () => {
        if (!age.ready(() => void payFromWallet())) return;
        setBusy(true);
        setError(null);
        try {
            const result = await packagesService.pay(sale.id);
            setSale(result);
            if (result.status === "ACTIVE") toast.success("Paid from your wallet. Your plan is active.");
        } catch (caught) {
            if (age.caught(caught, () => void payFromWallet())) return;
            setError(caught instanceof ApiError ? payRefusal(caught.code, caught.message) : messageOf(caught, "Could not take the payment."));
            if (caught instanceof ApiError && caught.code === "AGREEMENT_REQUIRED") reload();
        } finally {
            setBusy(false);
        }
    };

    const payThroughGateway = async (gateway: PaymentGateway) => {
        /* 29 Sep 2026: the age gate first — before the window, so a missing date of birth leaves no empty tab behind. */
        if (!age.ready(() => void payThroughGateway(gateway))) return;
        /* The window is taken on the click, before anything is awaited — a browser blocks one opened later. */
        let win: Window | null = null;
        try {
            win = window.open("", "adx-plan-checkout");
            if (win) win.document.body.innerHTML = '<p style="font-family:system-ui;padding:24px;color:#77787d">Opening the secure payment page…</p>';
        } catch {
            win = null;
        }
        setBusy(true);
        setError(null);
        try {
            const intent = await packagesService.createIntent({ packageSaleId: sale.id, gateway });
            const url = checkoutUrl(intent, apiConfig.baseUrl);
            if (!url) throw new ApiError(0, "NO_CHECKOUT", `${GATEWAY_LABEL[gateway]} did not hand back a page to open. Try again, or choose another way to pay.`);
            lastPlanPayment.remember(sale.id, { id: intent.payment.id, url });
            if (win && !win.closed) win.location.href = url;
            else setError(`Your browser blocked the payment tab. Use "Open the payment page" below.`);
            setWaiting({ payment: intent.payment, url });
        } catch (caught) {
            win?.close();
            /* The kill switch says nothing here: the plain line replaces the gateway doors once the 503 lands. */
            if (!age.caught(caught, () => void payThroughGateway(gateway))) setError(isFeatureOff(caught, FLAG_PAYMENT_GATEWAYS) ? null : caught instanceof ApiError ? payRefusal(caught.code, caught.message) : messageOf(caught, "Could not start the payment."));
            setBusy(false);
        }
    };

    const stopWaiting = () => {
        lastPlanPayment.forget(sale.id);
        setWaiting(null);
        setBusy(false);
    };

    const heading = paid ? (trial ? "Your free trial is running" : "Your plan is active") : `${sale.packageName} plan`;
    const subtitle = paid
        ? trial
            ? `${sale.packageName} is on trial until ${planDate(sale.endsAt)}. Nothing has been charged.`
            : `${sale.packageName} is live on your account.`
        : sale.agentId
          ? "Your agent has put this together for you."
          : "Chosen by you, from the catalogue.";

    return (
        <>
            {back}
            <div className="mt-3 border-t border-line pt-5">
                <PageHeading title={heading} subtitle={subtitle} actions={<StatusChip label={status.label} tone={status.tone} />} />
            </div>

            <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
                <div className="min-w-0 space-y-4">
                    {error && (
                        <p role="alert" className="rounded-md border border-[#f3c1c1] bg-[#fdf2f2] px-3 py-2 text-sm text-[#b42318]">
                            {error}
                        </p>
                    )}

                    {waiting && !paid && (
                        <section className="rounded-lg border border-info/30 bg-info-soft p-5">
                            <p className="text-sm font-semibold text-ink">Finish the payment in the tab that opened</p>
                            <p className="mt-1 text-sm text-dim">
                                {waiting.payment.gateway ? `${GATEWAY_LABEL[waiting.payment.gateway]} has the checkout${waiting.payment.reference ? ` for ${waiting.payment.reference}` : ""}.` : "The gateway has the checkout."} ADX activates the plan the moment it goes through — this page checks every few seconds.
                            </p>
                            <div className="mt-4 flex flex-wrap gap-2">
                                {waiting.url && (
                                    <a href={waiting.url} target="adx-plan-checkout" rel="noreferrer" className={btnPrimary}>
                                        Open the payment page
                                    </a>
                                )}
                                <button type="button" onClick={() => setRound((r) => r + 1)} className={btnOutline}>
                                    I have paid — check again
                                </button>
                                <button type="button" onClick={stopWaiting} className={btnOutline}>
                                    Cancel and pay another way
                                </button>
                            </div>
                        </section>
                    )}

                    {claimed && !paid && (
                        <section className="rounded-lg border border-success/30 bg-success-soft p-5">
                            <p className="text-sm font-semibold text-ink">Transfer recorded</p>
                            <p className="mt-1 text-sm text-dim">
                                ADX has your UTR{claimed.bankTransfer?.utr ? ` ${claimed.bankTransfer.utr}` : ""} for {claimed.reference}. The plan starts once ADX confirms the money against its statement, usually within 24–48 hours.
                            </p>
                        </section>
                    )}

                    <section className="rounded-lg border border-line bg-white" aria-labelledby="sale-lines">
                        <h2 id="sale-lines" className="border-b border-line px-5 py-4 text-sm font-semibold text-ink">
                            {paid ? "What you paid for" : "What you are paying for"}
                        </h2>
                        <div className="px-5 py-3">
                            {sale.lines.map((line) => (
                                <div key={`${line.kind}-${line.code}`} className="flex items-start justify-between gap-4 py-2">
                                    <div className="min-w-0">
                                        <p className="text-sm text-ink">{line.label}</p>
                                        <p className="text-xs text-dim">
                                            {planMoney(line.pricePerMonth)} / month{line.months > 1 ? ` × ${line.months} months` : ""}
                                        </p>
                                    </div>
                                    <span className="shrink-0 text-sm tabular-nums text-ink">{planMoney(line.amount)}</span>
                                </div>
                            ))}
                            <div className="my-2 border-t border-line" />
                            <KeyValue label="Subtotal" value={planMoney(sale.subtotal)} />
                            {isPositive(sale.discountAmount) && <KeyValue label={`Annual discount ${pctLabel(sale.discountPct)}%`} value={`−${planMoney(sale.discountAmount)}`} />}
                            <KeyValue label={`GST ${pctLabel(sale.gstPct)}%`} value={planMoney(sale.gstAmount)} />
                            <div className="my-2 border-t border-line" />
                            <div className="flex items-baseline justify-between gap-4 py-1">
                                <span className="text-base font-semibold text-ink">{paid ? "Amount paid" : "Amount due"}</span>
                                <span className="text-2xl font-semibold tabular-nums text-ink">{planMoney(sale.total)}</span>
                            </div>
                            <p className="text-xs text-dim">Reference {sale.reference}</p>
                        </div>
                    </section>

                    {closed ? (
                        <section className="rounded-lg border border-line bg-white p-5">
                            <p className="text-sm text-dim">
                                {sale.status === "CANCELLED" ? "This plan was cancelled, so there is nothing to pay. Choose a new one from Plans." : "This plan has run to the end of its term. Renewing it is a new sale — choose it again from Plans."}
                            </p>
                            <Link href="/advertiser/plans" className={`${btnOutline} mt-4`}>
                                Go to plans
                            </Link>
                        </section>
                    ) : paid ? (
                        <section className="rounded-lg border border-line bg-white p-5">
                            <KeyValue label="Billing" value={CYCLE_LABEL[sale.cycle] ?? sale.cycle} />
                            <KeyValue label={trial ? "Trial ends" : "Runs until"} value={planDate(sale.endsAt)} />
                            {sale.paidAt && !trial && <KeyValue label="Paid on" value={planDate(sale.paidAt)} />}
                            <p className="mt-3 rounded-md bg-info-soft px-3 py-2 text-xs text-info">
                                {trial
                                    ? "When the trial ends the plan lapses. The first paid term is chosen from Plans — nothing is charged unless you buy one."
                                    : policy?.autoRenewAllowed
                                      ? "Nothing renews itself unless you switch auto-renew on in Wallet & billing. When the term ends the plan lapses, and the next one is chosen from Plans."
                                      : "Nothing renews itself. When the term ends the plan lapses, and the next one is chosen from Plans — ADX holds no mandate to charge you automatically."}
                            </p>
                            <div className="mt-4 flex flex-wrap gap-2">
                                <Link href="/advertiser/billing" className={btnPrimary}>
                                    Done
                                </Link>
                                {invoice && (
                                    <Link href={`/advertiser/billing/invoices/${encodeURIComponent(invoice.id)}`} className={btnOutline}>
                                        View invoice
                                    </Link>
                                )}
                            </div>
                        </section>
                    ) : (
                        <section className="rounded-lg border border-line bg-white" aria-labelledby="pay-with">
                            <h2 id="pay-with" className="border-b border-line px-5 py-4 text-sm font-semibold text-ink">
                                Pay with
                            </h2>
                            <div className="space-y-3 px-5 py-4">
                                {walletAllowed && (
                                    <p className="text-sm text-dim">
                                        Your ADX wallet: <span className="font-medium text-ink">{wallet ? `${planMoney(wallet.spendable)} available` : "balance not read"}</span>
                                        {wallet && isPositive(wallet.goodwill) ? ` · ${planMoney(wallet.goodwill)} of that is ADX credit, spent first` : ""}
                                    </p>
                                )}
                                {rails.length > 0 && (
                                    <div role="radiogroup" aria-label="Pay with" className="space-y-2">
                                        {rails.map((rail) => (
                                            <ChoiceCard key={rail.id} checked={chosen === rail.id} onSelect={() => setPayWith(rail.id)} title={rail.title} description={rail.description} disabled={!!waiting} />
                                        ))}
                                    </div>
                                )}
                                {gatewaysOff && !policyFailed && <FeatureOff flag={FLAG_PAYMENT_GATEWAYS}>{walletRail ? "Pay from your ADX wallet, or come back later." : "The plan is held for you — come back later."}</FeatureOff>}

                                {policyFailed ? (
                                    <div className="rounded-md bg-warning-soft px-3 py-2 text-sm text-warning">
                                        Could not read the payment options.{" "}
                                        <button type="button" onClick={reload} className="font-medium underline underline-offset-2">
                                            Try again
                                        </button>
                                    </div>
                                ) : noDoor && !gatewaysOff ? (
                                    <p className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">No payment method is available right now. The plan is held for you; ADX will open a way to pay, or contact support.</p>
                                ) : !walletAllowed ? (
                                    gatewaysOff ? null : <p className="rounded-md bg-info-soft px-3 py-2 text-sm text-info">Paying from your wallet is not offered right now; a plan is paid through a gateway.</p>
                                ) : short ? (
                                    <p className={cn("rounded-md px-3 py-2 text-sm", rails.length > 0 ? "bg-warning-soft text-warning" : "bg-danger-soft text-danger")}>
                                        Your wallet is {planMoney(short)} short.{" "}
                                        {rails.length > 0 ? "Pay the whole amount another way — a card or UPI payment tops up the wallet and activates the plan in one go." : "Ask ADX to record a transfer, then come back — the plan is held for you."}
                                    </p>
                                ) : null}

                                <button type="button" onClick={() => setReading(true)} className={cn("flex w-full items-center justify-between gap-3 rounded-md px-4 py-3 text-left text-sm", agreed ? "bg-success-soft text-success" : "bg-warning-soft text-warning")}>
                                    <span>{termsLine(standing)}</span>
                                    <span className="shrink-0 font-semibold underline underline-offset-2">{agreed ? "Read again" : "Read and accept"}</span>
                                </button>

                                <AgeGate gate={age} />

                                {chosen === "BANK_TRANSFER" && bank ? (
                                    <BankTransferPanel
                                        saleId={sale.id}
                                        details={bank}
                                        total={sale.total}
                                        disabled={!agreed || age.blocked}
                                        age={age}
                                        onClaimed={(payment) => {
                                            setClaimed(payment);
                                            toast.success("Transfer recorded. The plan starts once ADX confirms it.");
                                        }}
                                    />
                                ) : (
                                    <button
                                        type="button"
                                        onClick={() => void (viaGateway ? payThroughGateway(chosen as PaymentGateway) : payFromWallet())}
                                        disabled={busy || !agreed || chosen === null || !!waiting || policyFailed || age.blocked}
                                        className={`${btnPrimary} w-full`}
                                    >
                                        {busy && !waiting
                                            ? "Please wait…"
                                            : policyFailed
                                              ? "Payment options not read"
                                              : noDoor
                                                ? "No payment method is available right now"
                                                : viaGateway
                                                  ? `Pay ${planMoney(sale.total)} with ${GATEWAY_LABEL[chosen as PaymentGateway]}`
                                                  : `Pay ${planMoney(sale.total)} from wallet`}
                                    </button>
                                )}
                                {!agreed && chosen !== "BANK_TRANSFER" && <p className="text-center text-xs text-dim">Accept the plan terms to pay.</p>}
                            </div>
                        </section>
                    )}
                </div>

                <div className="grid grid-cols-1 content-start gap-4">
                    <section className="rounded-lg border border-line bg-white p-5">
                        <h2 className="text-sm font-semibold text-ink">{sale.packageName}</h2>
                        <div className="mt-2">
                            <KeyValue label="Billing" value={CYCLE_LABEL[sale.cycle] ?? sale.cycle} />
                            <KeyValue label="Term" value={`${sale.months} month${sale.months === 1 ? "" : "s"}`} />
                            {sale.startsAt && <KeyValue label="Starts" value={planDate(sale.startsAt)} />}
                            {sale.endsAt && <KeyValue label="Ends" value={planDate(sale.endsAt)} />}
                            <KeyValue label="Created" value={planDate(sale.createdAt)} />
                        </div>
                    </section>
                    {!gatewaysOff && <p className="px-1 text-xs text-dim">A card or UPI payment tops up your ADX wallet and pays the plan from it, so every rupee shows in Wallet & billing with where it went. Nothing is saved against your account.</p>}
                </div>
            </div>

            <TermsDialog
                open={reading}
                saleId={sale.id}
                standing={standing}
                onClose={() => setReading(false)}
                onAccepted={() => {
                    setReading(false);
                    toast.success("Plan terms accepted.");
                    packagesService
                        .get(sale.id)
                        .then(setSale)
                        .catch(() => reload());
                }}
            />
        </>
    );
}
