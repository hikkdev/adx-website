"use client";

import * as React from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { Check } from "lucide-react";
import { Panel } from "@/components/workspace/page-heading";
import { brandButton, CardTitle, Chip, Crumbs, ErrorNote, KeyRow, Loading, outlineButton } from "@/components/publisher/parts";
import { useLoad } from "@/components/publisher/use-load";
import { AgeGate, useAgeGate } from "@/components/checkout/age-gate";
import { MoneyRow } from "@/components/subscriptions/plan-parts";
import { FeatureOff } from "@/components/platform/feature-off";
import { ApiError, isFeatureOff, messageOf } from "@/lib/api-client";
import { apiConfig } from "@/lib/api-config";
import { FLAG_PAYMENT_GATEWAYS, useSwitchedOff } from "@/lib/flags";
import { cn } from "@/lib/utils";
import { checkoutUrl, GATEWAY_LABEL, paymentsService, pollPayment, type GatewayStatus, type PaymentGateway, type PaymentSummary } from "@/services/payments";
import { formatMoney, publisherWorkspace, type WalletSnapshot } from "@/services/publisher-workspace";
import {
    commissionLine,
    cycleLabel,
    orderHandoff,
    orderStatusLabel,
    orderStatusTone,
    paidMethodLabel,
    payDoors,
    payNote,
    pctLabel,
    shortDate,
    subscriptionsService,
    termLine,
    type MySubscription,
    type PayWith,
    type Subscription,
    type SubscriptionOrder,
    type SubscriptionPolicy,
    type TermHint,
} from "@/services/subscriptions";

interface Loaded {
    order: SubscriptionOrder;
    wallet: WalletSnapshot | null;
    gateways: GatewayStatus[];
    mine: MySubscription | null;
}

async function readOrder(id: string): Promise<Loaded> {
    const order = await subscriptionsService.get(id);
    const [wallet, gateways, mine] = await Promise.all([publisherWorkspace.wallet().catch(() => null), paymentsService.gateways().catch(() => [] as GatewayStatus[]), subscriptionsService.me().catch(() => null)]);
    return { order, wallet, gateways, mine };
}

/**
 * One subscription order — the app's pay sheet and receipt on the web.
 * Awaiting payment: the order's money (subtotal, discount, GST, total), the
 * term rule applied at payment, and the doors the policy opens — the ADX
 * wallet's withdrawable money when it covers the total, or a gateway whose
 * capture tops the wallet up and pays the order server-side. Paid: the
 * receipt (a free trial's too). Cancelled or expired: nothing to pay. While
 * the platform has `payments.gateways` switched off (the intent is what it
 * guards), no gateway is a door and one plain line says so; the wallet stays.
 * Paying is an order (29 Sep 2026): the age gate asks a missing date of
 * birth before money moves, and holds both doors for someone under 18.
 */
export default function SubscriptionOrderPage() {
    const { id } = useParams<{ id: string }>();
    return (
        <React.Suspense fallback={<Loading label="Loading your order…" />}>
            <OrderView id={id} />
        </React.Suspense>
    );
}

function OrderView({ id }: { id: string }) {
    const search = useSearchParams();
    const { data, error, loading, reload } = useLoad(`subscription-order:${id}`, () => readOrder(id));
    const [handoff] = React.useState(() => (typeof window === "undefined" ? null : orderHandoff.read(id)));

    if (!data && loading) return <Loading label="Loading your order…" />;
    if (!data) {
        return (
            <>
                <Crumbs items={[{ label: "Subscription", href: "/publisher/subscription" }, { label: "Order" }]} />
                <div className="mt-6">
                    <ErrorNote message={error ?? "Could not read this order."} onRetry={reload} />
                </div>
            </>
        );
    }

    const { order, mine } = data;
    const policy: SubscriptionPolicy | null = mine?.policy ?? handoff?.policy ?? null;
    const option = mine?.options.find((row) => row.tier === order.tier);
    const term: TermHint | null = handoff?.term ?? (option?.rule ? { rule: option.rule, startsAt: option.startsAt } : null);
    const trialRow: Subscription | null = handoff?.trial ?? (order.paidMethod === "TRIAL" ? ([mine?.running, ...(mine?.upcoming ?? [])].find((row) => row && row.id === order.subscriptionId) ?? null) : null);

    if (order.status === "PAID") return <Receipt order={order} term={term} trial={order.paidMethod === "TRIAL" || search.get("trial") === "1" ? trialRow : null} policy={policy} />;
    return <Pay data={data} term={term} policy={policy} reload={reload} resumePayment={search.get("payment") ?? handoff?.paymentId ?? null} />;
}

/* ------------------------------------------------------------------ */
/* The pay page                                                        */
/* ------------------------------------------------------------------ */

function OrderLines({ order, paid }: { order: SubscriptionOrder; paid: boolean }) {
    return (
        <>
            <div className="flex items-baseline justify-between gap-6 py-1.5">
                <span className="text-sm text-ink">
                    {order.planName} plan
                    <span className="block text-xs text-dim">
                        {formatMoney(order.pricePerMonth)} / month{order.months > 1 ? ` × ${order.months} months` : ""}
                    </span>
                </span>
                <span className="text-sm tabular-nums text-ink">{formatMoney(order.subtotal, { paise: "always" })}</span>
            </div>
            <div className="my-1 border-t border-line" />
            {Number(order.discountAmount) > 0 && <MoneyRow label={`Annual discount ${pctLabel(order.discountPct)}`} value={order.discountAmount} negative />}
            <MoneyRow label={`GST ${pctLabel(order.gstPct)}`} value={order.gstAmount} />
            <div className="my-1 border-t border-line" />
            <MoneyRow label={paid ? "Amount paid" : "Amount due"} value={order.total} strong />
        </>
    );
}

/** Take the checkout window on the click, before anything is awaited — browsers block one opened after an await. */
function reserveWindow(): Window | null {
    try {
        const win = window.open("", "adx-plan-checkout");
        if (win) {
            win.document.title = "Opening the payment page…";
            win.document.body.innerHTML = '<p style="font-family:system-ui;padding:24px;color:#77787d">Opening the secure payment page…</p>';
        }
        return win;
    } catch {
        return null;
    }
}

function Pay({ data, term, policy, reload, resumePayment }: { data: Loaded; term: TermHint | null; policy: SubscriptionPolicy | null; reload: () => void; resumePayment: string | null }) {
    const { order, wallet, gateways } = data;
    const closed = order.status === "CANCELLED" || order.status === "EXPIRED";
    const gatewaysOff = useSwitchedOff(FLAG_PAYMENT_GATEWAYS);
    const doors = payDoors(order.total, policy, wallet, gateways, { gatewaysOff });
    const note = payNote(order.total, doors, wallet?.withdrawable ?? null);
    const [choice, setChoice] = React.useState<PayWith | null>(null);
    const chosen: PayWith | null = choice && doors.rails.some((rail) => rail.id === choice) ? choice : (doors.rails[0]?.id ?? null);
    const viaGateway = chosen !== null && chosen !== "WALLET";
    const [busy, setBusy] = React.useState(false);
    const [failure, setFailure] = React.useState<string | null>(null);
    const [pending, setPending] = React.useState<{ payment: PaymentSummary; url: string | null } | null>(null);
    const poller = React.useRef<{ stop: () => void } | null>(null);
    const age = useAgeGate();

    const settle = React.useCallback(
        async (payment: PaymentSummary) => {
            poller.current?.stop();
            const poll = pollPayment(payment.id, { intervalMs: 3000, timeoutMs: 10 * 60 * 1000, onTick: (tick) => setPending((current) => (current ? { ...current, payment: tick } : current)) });
            poller.current = poll;
            const { payment: result } = await poll.done;
            poller.current = null;
            if (!result) return;
            if (result.status === "CAPTURED") {
                const fresh = await subscriptionsService.get(order.id).catch(() => null);
                setPending(null);
                setBusy(false);
                if (fresh?.status === "PAID") {
                    reload();
                    return;
                }
                setFailure(`${GATEWAY_LABEL[result.gateway]} took ${formatMoney(result.amount)} and it is in your wallet, but the plan could not be activated from it. ADX has been told; try paying from the wallet, or contact support.`);
                return;
            }
            if (result.status === "FAILED") {
                setFailure(`${GATEWAY_LABEL[result.gateway]} did not take the payment${result.failureReason ? `: ${result.failureReason}` : "."} Nothing was charged.`);
                setPending(null);
                setBusy(false);
            }
        },
        [order.id, reload]
    );

    React.useEffect(() => () => poller.current?.stop(), []);

    // Coming back to the page with a payment already opened: pick the checking up again.
    React.useEffect(() => {
        if (!resumePayment || closed) return;
        let active = true;
        paymentsService
            .get(resumePayment)
            .then((payment) => {
                if (!active || payment.status === "FAILED") return;
                setPending({ payment, url: orderHandoff.read(order.id)?.checkoutUrl ?? null });
                setBusy(true);
                void settle(payment);
            })
            .catch(() => undefined);
        return () => {
            active = false;
        };
    }, [resumePayment, closed, order.id, settle]);

    const payFromWallet = async () => {
        if (!age.ready(() => void payFromWallet())) return;
        setBusy(true);
        setFailure(null);
        try {
            const paid = await subscriptionsService.pay(order.id);
            if (paid.status === "PAID") reload();
            else setBusy(false);
        } catch (caught) {
            if (age.caught(caught, () => void payFromWallet())) {
                setBusy(false);
                return;
            }
            setFailure(caught instanceof ApiError && caught.code === "INSUFFICIENT_FUNDS" ? `${caught.message} Money still clearing, held, or set aside for a withdrawal cannot buy a plan — pay through a gateway instead.` : messageOf(caught, "Could not take the payment."));
            setBusy(false);
        }
    };

    const payThroughGateway = async (gateway: PaymentGateway) => {
        /* The age gate before the window, so a missing date of birth leaves no empty tab behind. */
        if (!age.ready(() => void payThroughGateway(gateway))) return;
        const win = reserveWindow();
        setBusy(true);
        setFailure(null);
        try {
            const intent = await subscriptionsService.createIntent(order.id, gateway);
            const url = checkoutUrl(intent, apiConfig.baseUrl);
            orderHandoff.save(order.id, { paymentId: intent.payment.id, checkoutUrl: url });
            if (url && win && !win.closed) win.location.href = url;
            else win?.close();
            if (!url) throw new ApiError(0, "NO_CHECKOUT", `${GATEWAY_LABEL[gateway]} did not hand back a page to open. Nothing was charged — try again, or pay another way.`);
            setPending({ payment: intent.payment, url });
            void settle(intent.payment);
        } catch (caught) {
            win?.close();
            /* The kill switch says nothing here: the plain line replaces the gateway doors once the 503 lands. */
            if (!age.caught(caught, () => void payThroughGateway(gateway))) setFailure(isFeatureOff(caught, FLAG_PAYMENT_GATEWAYS) ? null : messageOf(caught, "Could not start the payment."));
            setBusy(false);
        }
    };

    const stopWaiting = () => {
        poller.current?.stop();
        poller.current = null;
        setPending(null);
        setBusy(false);
    };

    return (
        <>
            <Crumbs items={[{ label: "Subscription", href: "/publisher/subscription" }, { label: order.reference }]} />
            <div className="mt-6 flex flex-wrap items-start justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-semibold tracking-tight text-ink">{closed ? `${order.planName} plan` : "Pay for your plan"}</h1>
                    <p className="mt-1 text-sm text-dim">
                        {order.planName} · {cycleLabel(order.cycle)} · reference {order.reference}
                    </p>
                </div>
                <Chip tone={orderStatusTone(order.status)}>{orderStatusLabel(order.status)}</Chip>
            </div>

            <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_360px]">
                <div className="grid content-start gap-6">
                    {closed ? (
                        <Panel>
                            <CardTitle>Nothing to pay</CardTitle>
                            <p className="mt-2 text-sm text-dim">{order.status === "CANCELLED" ? "This order was cancelled, so there is nothing to pay. Choose a plan again when you are ready." : "This order was not paid inside its week and has expired. Choose a plan again when you are ready."}</p>
                            <Link href="/publisher/subscription/plans" className={cn(brandButton, "mt-4")}>
                                Choose a plan
                            </Link>
                        </Panel>
                    ) : pending ? (
                        <Panel>
                            <CardTitle>Finish the payment on {GATEWAY_LABEL[pending.payment.gateway]}&apos;s page</CardTitle>
                            <p className="mt-2 text-sm text-dim">The checkout for {pending.payment.reference} opened in another tab. ADX activates the plan the moment the payment goes through — this page follows it on its own.</p>
                            <div className="mt-4 flex flex-wrap gap-3">
                                {pending.url && (
                                    <a href={pending.url} target="adx-plan-checkout" rel="noopener" className={brandButton}>
                                        Open the payment page again
                                    </a>
                                )}
                                <button type="button" onClick={() => void settle(pending.payment)} className={outlineButton}>
                                    I have paid — check again
                                </button>
                                <button type="button" onClick={stopWaiting} className={outlineButton}>
                                    Pay another way
                                </button>
                            </div>
                        </Panel>
                    ) : (
                        <Panel>
                            <CardTitle>Pay with</CardTitle>
                            {doors.walletAllowed && wallet && <KeyRow label="Withdrawable in your ADX wallet" value={formatMoney(wallet.withdrawable)} />}
                            {doors.rails.length > 0 && (
                                <div role="radiogroup" aria-label="How to pay" className="mt-3 grid gap-3">
                                    {doors.rails.map((rail) => {
                                        const on = rail.id === chosen;
                                        return (
                                            <button key={rail.id} type="button" role="radio" aria-checked={on} onClick={() => setChoice(rail.id)} className={cn("flex items-start gap-3 rounded-lg border px-4 py-3.5 text-left transition-colors", on ? "border-brand-bright bg-[#fff7f7]" : "border-line hover:border-dim")}>
                                                <span aria-hidden className={cn("mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border-2", on ? "border-brand-bright" : "border-line")}>
                                                    {on && <span className="size-2 rounded-full bg-brand-bright" />}
                                                </span>
                                                <span>
                                                    <span className="block text-sm font-semibold text-ink">{rail.title}</span>
                                                    <span className="block text-xs text-dim">{rail.description}</span>
                                                </span>
                                            </button>
                                        );
                                    })}
                                </div>
                            )}
                            {doors.gatewaysOff && !doors.unknown && (
                                <FeatureOff flag={FLAG_PAYMENT_GATEWAYS} className="mt-4">
                                    {doors.rails.length > 0 ? "Pay from your ADX wallet, or come back later." : note ? undefined : "Come back later — the order is held for a week."}
                                </FeatureOff>
                            )}
                            {note && <p className={cn("mt-4 rounded-md px-3 py-2 text-sm", note.tone === "danger" ? "bg-danger-soft text-danger" : note.tone === "warning" ? "bg-warning-soft text-warning" : "bg-info-soft text-info")}>{note.text}</p>}
                            <AgeGate gate={age} className="mt-4" />
                            {failure && (
                                <div className="mt-4">
                                    <ErrorNote message={failure} onRetry={doors.unknown ? reload : undefined} />
                                </div>
                            )}
                            <button type="button" disabled={busy || chosen === null || age.blocked} onClick={() => (viaGateway ? void payThroughGateway(chosen as PaymentGateway) : void payFromWallet())} className={cn(brandButton, "mt-5 w-full")}>
                                {busy ? "Working…" : doors.unknown ? "Payment options not read" : doors.noDoor ? "No way to pay is open right now" : viaGateway ? `Pay ${formatMoney(order.total)} with ${GATEWAY_LABEL[chosen as PaymentGateway]}` : `Pay ${formatMoney(order.total)} from your wallet`}
                            </button>
                            {doors.unknown && (
                                <button type="button" onClick={reload} className={cn(outlineButton, "mt-3 w-full")}>
                                    Read the payment options again
                                </button>
                            )}
                        </Panel>
                    )}
                </div>

                <div className="grid content-start gap-6">
                    <Panel>
                        <CardTitle>Order summary</CardTitle>
                        <div className="mt-3">
                            <OrderLines order={order} paid={false} />
                        </div>
                        {term && !closed && <p className="mt-3 text-xs text-dim">{termLine(term, order.planName, { prorate: policy?.prorateOnChange })}</p>}
                        {!closed && <p className="mt-2 text-xs text-dim">The order is held for a week from {shortDate(order.createdAt)}.</p>}
                    </Panel>
                    <Link href="/publisher/subscription" className={outlineButton}>
                        Back to your subscription
                    </Link>
                </div>
            </div>
        </>
    );
}

/* ------------------------------------------------------------------ */
/* The receipt                                                         */
/* ------------------------------------------------------------------ */

function Receipt({ order, term, trial, policy }: { order: SubscriptionOrder; term: TermHint | null; trial: Subscription | null; policy: SubscriptionPolicy | null }) {
    const isTrial = order.paidMethod === "TRIAL" || trial !== null;
    const startsAt = order.startsAt ?? term?.startsAt ?? trial?.startsAt ?? null;
    return (
        <>
            <Crumbs items={[{ label: "Subscription", href: "/publisher/subscription" }, { label: order.reference }]} />
            <Panel className="mx-auto mt-6 max-w-[640px] text-center">
                <span className="mx-auto flex size-14 items-center justify-center rounded-full bg-brand text-white">
                    <Check className="size-7" strokeWidth={3} aria-hidden />
                </span>
                <h1 className="mt-4 text-2xl font-semibold tracking-tight text-ink">{isTrial ? `${order.planName} trial started` : `${order.planName} plan activated`}</h1>
                <p className="mt-2 text-sm text-dim">
                    {isTrial
                        ? `Your free trial of ${order.planName}${trial?.endsAt ? ` runs until ${shortDate(trial.endsAt)}` : " is running"}. Nothing has been charged.`
                        : term
                          ? termLine({ rule: term.rule, startsAt, credit: term.credit ?? null }, order.planName)
                          : `${order.planName} starts on ${shortDate(startsAt)}.`}
                </p>
                <div className="mt-6 text-left">
                    <KeyRow label="Plan" value={isTrial ? `${order.planName} · Free trial` : `${order.planName} · ${cycleLabel(order.cycle)}`} />
                    <KeyRow label="Commission" value={commissionLine(order.ratePct) ?? "—"} />
                    <KeyRow label="Starts" value={shortDate(startsAt)} />
                    {isTrial && trial?.endsAt && <KeyRow label="Ends" value={shortDate(trial.endsAt)} />}
                    <KeyRow label="Paid" value={`${shortDate(order.paidAt)}${order.paidMethod ? ` · ${paidMethodLabel(order.paidMethod)}` : ""}`} />
                    <KeyRow label="Reference" value={order.reference} />
                    <div className="my-1 border-t border-line" />
                    <OrderLines order={order} paid />
                </div>
                <p className="mt-4 rounded-md bg-info-soft px-4 py-3 text-left text-sm text-info">
                    {isTrial
                        ? "When the trial ends the plan lapses and your commission goes back to the platform rate — ADX will remind you before, and the first paid term is bought here."
                        : policy?.autoRenewAllowed
                          ? "Nothing renews itself unless you switch auto-renew on from your subscription. When the term ends the plan lapses and your commission goes back to the platform rate — ADX will remind you before."
                          : "Nothing renews itself. When the term ends the plan lapses and your commission goes back to the platform rate — ADX will remind you before, and the next term is bought here."}
                </p>
                <div className="mt-6 flex flex-wrap justify-center gap-3">
                    <Link href="/publisher/subscription" className={brandButton}>
                        Done
                    </Link>
                    <button type="button" onClick={() => window.print()} className={outlineButton}>
                        Print receipt
                    </button>
                </div>
            </Panel>
        </>
    );
}
