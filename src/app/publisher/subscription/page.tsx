"use client";

import * as React from "react";
import Link from "next/link";
import { Check, X } from "lucide-react";
import { toast } from "sonner";
import { PageHeading, Panel } from "@/components/workspace/page-heading";
import { brandButton, CardTitle, Cell, Chip, DataTable, ErrorNote, KeyRow, Loading, outlineButton, TableRow, TitleCell } from "@/components/publisher/parts";
import { useLoad } from "@/components/publisher/use-load";
import { AgeGate, useAgeGate } from "@/components/checkout/age-gate";
import { PlanCard } from "@/components/subscriptions/plan-parts";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { ApiError, messageOf } from "@/lib/api-client";
import { FeatureOff } from "@/components/platform/feature-off";
import { FLAG_PUBLISHER_PLANS, useFlagsLoaded, useSwitchedOff } from "@/lib/flags";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/services/publisher-workspace";
import {
    commissionLine,
    cycleLabel,
    entitlementLines,
    isSwitchedOff,
    onSale,
    orderHref,
    orderStatusLabel,
    orderStatusTone,
    renewsAtBoughtPrice,
    shortDate,
    subscriptionsService,
    type MySubscription,
    type SubscriptionOrder,
} from "@/services/subscriptions";

type Read = { kind: "mine"; mine: MySubscription } | { kind: "off" };

async function readMine(): Promise<Read> {
    try {
        return { kind: "mine", mine: await subscriptionsService.me() };
    } catch (caught) {
        if (isSwitchedOff(caught)) return { kind: "off" };
        throw caught;
    }
}

/**
 * The publisher's subscription — the app's My subscription on the web:
 * the running plan (its commission, when it ends, what it grants, the
 * auto-renew switch while the policy offers it), a term in its grace
 * window, the terms queued after it, and every order with Pay now and
 * Cancel on a pending one. Behind the `revenue.publisher-plans` kill switch:
 * switched off — the flags answer says so, or a read just came back 503
 * FEATURE_OFF — the page says so and shows what ADX sells, read-only; the
 * nav item hides on the same reading. Switching auto-renew on is an order
 * (29 Sep 2026): the age gate asks a missing date of birth first; switching
 * it off is never held.
 */
export default function SubscriptionPage() {
    const loaded = useFlagsLoaded();
    const off = useSwitchedOff(FLAG_PUBLISHER_PLANS);
    if (!loaded) return <Loading label="Loading your subscription…" />;
    return off ? <NotOffered /> : <Mine />;
}

function Heading({ action }: { action?: React.ReactNode }) {
    return <PageHeading title="Subscription" subtitle="A lower commission on every booking, and the doors a plan opens." actions={action} />;
}

/** The switch is off: a quiet state, and the catalogue — not behind the switch — read-only. */
function NotOffered() {
    const { data } = useLoad("plans:readonly", () => subscriptionsService.plans().catch(() => []));
    const plans = onSale(data ?? []);
    return (
        <>
            <Heading />
            <FeatureOff flag={FLAG_PUBLISHER_PLANS} className="mt-6">
                Your bookings earn at the platform rate meanwhile; nothing is needed from you. {plans.length > 0 ? "These are the plans ADX offers — they can be bought here once plans open." : ""}
            </FeatureOff>
            {plans.length > 0 && (
                <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {plans.map((plan) => (
                        <PlanCard key={plan.id} plan={plan} selected={false} current={false} />
                    ))}
                </div>
            )}
        </>
    );
}

function Mine() {
    const { data, error, loading, reload } = useLoad("subscription:me", readMine);
    const [cancelling, setCancelling] = React.useState<SubscriptionOrder | null>(null);
    const [cancelBusy, setCancelBusy] = React.useState(false);
    const [cancelFailure, setCancelFailure] = React.useState<string | null>(null);
    const [renewBusy, setRenewBusy] = React.useState(false);
    const [renewOverride, setRenewOverride] = React.useState<{ id: string; value: boolean } | null>(null);
    const [failure, setFailure] = React.useState<string | null>(null);
    /* Quiet until tried: the same switch turns auto-renew off, over a plan already running. */
    const age = useAgeGate({ upfront: false });

    if (!data && loading) return <Loading label="Loading your subscription…" />;
    if (!data) {
        return (
            <>
                <Heading />
                <div className="mt-6">
                    <ErrorNote message={error ?? "Could not read your subscription."} onRetry={reload} />
                </div>
            </>
        );
    }
    if (data.kind === "off") return <NotOffered />;

    const mine = data.mine;
    const running = mine.running;
    const grace = mine.grace ?? null;
    const lines = entitlementLines(mine.plan?.entitlements);
    const pending = mine.orders.filter((order) => order.status === "PENDING_PAYMENT");
    const autoRenewOffered = !!mine.policy?.autoRenewAllowed;
    const autoRenewValue = running ? (renewOverride?.id === running.id ? renewOverride.value : running.autoRenew) : false;
    const autoRenewOn = autoRenewOffered && autoRenewValue;
    const boughtFor = running && renewsAtBoughtPrice(mine.policy) ? (mine.orders.find((order) => order.subscriptionId === running.id) ?? null) : null;

    const setAutoRenew = async (next: boolean) => {
        if (!running) return;
        if (next && !age.ready(() => void setAutoRenew(true))) return;
        setRenewBusy(true);
        setFailure(null);
        setRenewOverride({ id: running.id, value: next });
        try {
            const updated = await subscriptionsService.setAutoRenew(next);
            setRenewOverride({ id: running.id, value: updated?.autoRenew ?? next });
            toast.success(next ? "Auto-renew is on" : "Auto-renew is off");
        } catch (caught) {
            setRenewOverride(null);
            if (!age.caught(caught, () => void setAutoRenew(next))) {
                setFailure(caught instanceof ApiError && caught.code === "AUTO_RENEW_NOT_OFFERED" ? "ADX no longer offers auto-renew. The page has been read again." : messageOf(caught, "Could not change auto-renew."));
                reload();
            }
        } finally {
            setRenewBusy(false);
        }
    };

    const cancel = async () => {
        if (!cancelling) return;
        setCancelBusy(true);
        setCancelFailure(null);
        try {
            await subscriptionsService.cancel(cancelling.id);
            toast.success(`Order ${cancelling.reference} cancelled`);
            setCancelling(null);
            reload();
        } catch (caught) {
            setCancelFailure(messageOf(caught, "Could not cancel the order."));
        } finally {
            setCancelBusy(false);
        }
    };

    return (
        <>
            <Heading
                action={
                    <Link href="/publisher/subscription/plans" className={running ? outlineButton : brandButton}>
                        {running ? "Change plan" : "See the plans"}
                    </Link>
                }
            />
            {(failure || error) && (
                <div className="mt-4">
                    <ErrorNote message={failure ?? error!} onRetry={reload} />
                </div>
            )}

            <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_300px]">
                <div className="grid content-start gap-6">
                    {running ? (
                        <Panel>
                            <div className="flex flex-wrap items-start justify-between gap-3">
                                <div>
                                    <CardTitle>{running.planName} plan</CardTitle>
                                    <p className="mt-1 text-sm text-dim">{[commissionLine(running.ratePct), `${formatMoney(running.pricePerMonth)} / month`, running.source === "ADMIN_GRANT" ? "granted by ADX" : null].filter(Boolean).join(" · ")}</p>
                                </div>
                                <Chip tone="success">Running</Chip>
                            </div>
                            <div className="mt-3 border-t border-line pt-2">
                                <KeyRow label="Started" value={shortDate(running.startsAt)} />
                                <KeyRow label={running.endsAt ? "Ends on" : "Ends"} value={running.endsAt ? shortDate(running.endsAt) : "No end date"} />
                            </div>
                            {lines.length > 0 && (
                                <>
                                    <p className="mt-4 text-sm font-medium text-dim">What it grants</p>
                                    <ul className="mt-2 grid gap-1.5 sm:grid-cols-2">
                                        {lines.map((line) => (
                                            <li key={line.key} className={cn("flex items-start gap-2 text-sm", line.granted ? "text-ink" : "text-dim line-through")}>
                                                {line.granted ? <Check className="mt-0.5 size-4 shrink-0 text-success" aria-hidden /> : <X className="mt-0.5 size-4 shrink-0 text-dim" aria-hidden />}
                                                {line.label}
                                            </li>
                                        ))}
                                    </ul>
                                </>
                            )}
                            {autoRenewOffered && running.endsAt ? (
                                <div className="mt-4 flex items-center justify-between gap-4 border-t border-line pt-4">
                                    <div>
                                        <p className="text-sm font-medium text-ink">Auto-renew</p>
                                        <p className="mt-0.5 text-xs text-dim">{autoRenewOn ? `Renews from your wallet on ${shortDate(running.endsAt)} ${boughtFor ? `for ${formatMoney(boughtFor.total)}` : "at the plan's current price"}.` : `Ends on ${shortDate(running.endsAt)}.`}</p>
                                    </div>
                                    <Switch checked={autoRenewOn} disabled={renewBusy} onCheckedChange={(next) => void setAutoRenew(next)} aria-label="Auto-renew" />
                                </div>
                            ) : running.endsAt ? (
                                <p className="mt-4 border-t border-line pt-4 text-xs text-dim">Nothing renews itself: buy the next term before this one ends and it queues after it.</p>
                            ) : null}
                            {autoRenewOffered && running.endsAt && <AgeGate gate={age} className="mt-3" />}
                        </Panel>
                    ) : grace ? (
                        <Panel>
                            <div className="flex flex-wrap items-start justify-between gap-3">
                                <div>
                                    <CardTitle>{grace.planName} plan</CardTitle>
                                    <p className="mt-1 text-sm text-dim">
                                        Ended {shortDate(grace.endsAt)} · in grace until {shortDate(grace.until)}
                                    </p>
                                </div>
                                <Chip tone="warning">In grace</Chip>
                            </div>
                            <p className="mt-3 text-sm text-dim">The term has ended, and ADX keeps its doors open until {shortDate(grace.until)}. Buy the next term before then and nothing lapses.</p>
                            <Link href="/publisher/subscription/plans" className={cn(brandButton, "mt-4")}>
                                Buy the next term
                            </Link>
                        </Panel>
                    ) : (
                        <Panel>
                            <CardTitle>No plan yet</CardTitle>
                            <p className="mt-2 text-sm text-dim">A plan lowers ADX&apos;s commission on every booking and opens live chat with support. Terms are bought one at a time{autoRenewOffered ? "; auto-renew is yours to switch on once a term runs" : "; nothing renews itself"}.</p>
                            {Object.keys(mine.trialAvailable ?? {}).length > 0 && <p className="mt-2 text-sm text-ink">A free trial is open to you on the plans page.</p>}
                            <Link href="/publisher/subscription/plans" className={cn(brandButton, "mt-4")}>
                                See the plans
                            </Link>
                        </Panel>
                    )}

                    {mine.upcoming.length > 0 && (
                        <section>
                            <h2 className="text-base font-semibold text-ink">Coming up</h2>
                            <div className="mt-3 grid gap-3">
                                {mine.upcoming.map((next) => (
                                    <Panel key={next.id} className="flex flex-wrap items-center justify-between gap-3 py-4">
                                        <div>
                                            <p className="text-sm font-medium text-ink">{next.planName} plan</p>
                                            <p className="text-xs text-dim">{[`Starts ${shortDate(next.startsAt)}`, next.endsAt ? `ends ${shortDate(next.endsAt)}` : null, commissionLine(next.ratePct)].filter(Boolean).join(" · ")}</p>
                                        </div>
                                        <Chip tone="info">Queued</Chip>
                                    </Panel>
                                ))}
                            </div>
                        </section>
                    )}

                    <section>
                        <h2 className="text-base font-semibold text-ink">Orders</h2>
                        {pending.length > 0 && (
                            <p className="mt-2 rounded-md bg-warning-soft px-4 py-3 text-sm text-warning">
                                {pending.length === 1 ? "An order is waiting for payment. It is held for a week from the day it was made." : `${pending.length} orders are waiting for payment. Each is held for a week from the day it was made.`}
                            </p>
                        )}
                        <div className="mt-3">
                            {mine.orders.length === 0 ? (
                                <Panel>
                                    <p className="text-sm text-dim">Nothing yet. Your first order appears here the moment you choose a plan.</p>
                                </Panel>
                            ) : (
                                <DataTable columns={[{ label: "Order" }, { label: "Amount", align: "right" }, { label: "Status" }, { label: "", align: "right" }]}>
                                    {mine.orders.map((order) => (
                                        <TableRow key={order.id}>
                                            <Cell>
                                                <TitleCell title={`${order.planName} · ${cycleLabel(order.cycle)}`} line={`${order.reference} · ${shortDate(order.createdAt)}${order.status === "PAID" && order.startsAt ? ` · starts ${shortDate(order.startsAt)}` : ""}`} href={orderHref(order.id)} />
                                            </Cell>
                                            <Cell align="right">
                                                <span className="whitespace-nowrap text-ink">{formatMoney(order.total)}</span>
                                            </Cell>
                                            <Cell>
                                                <Chip tone={orderStatusTone(order.status)}>{orderStatusLabel(order.status)}</Chip>
                                            </Cell>
                                            <Cell align="right">
                                                {order.status === "PENDING_PAYMENT" ? (
                                                    <span className="inline-flex items-center gap-4">
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                setCancelFailure(null);
                                                                setCancelling(order);
                                                            }}
                                                            className="text-sm font-semibold text-dim hover:text-ink"
                                                        >
                                                            Cancel
                                                        </button>
                                                        <Link href={orderHref(order.id)} className="whitespace-nowrap text-sm font-semibold text-brand hover:underline">
                                                            Pay now
                                                        </Link>
                                                    </span>
                                                ) : (
                                                    <Link href={orderHref(order.id)} className="whitespace-nowrap text-sm font-semibold text-ink hover:underline">
                                                        {order.status === "PAID" ? "Receipt" : "View"}
                                                    </Link>
                                                )}
                                            </Cell>
                                        </TableRow>
                                    ))}
                                </DataTable>
                            )}
                        </div>
                    </section>
                </div>

                <div className="grid content-start gap-6">
                    <Panel>
                        <CardTitle>How plans work</CardTitle>
                        <ul className="mt-3 grid gap-2 text-sm text-dim">
                            <li>A plan lowers the commission ADX takes from each campaign-day your spaces earn.</li>
                            <li>A new plan starts today, queues after the current term, or replaces it — the plans page says which before you pay.</li>
                            {mine.policy?.graceDays ? <li>After a term ends, ADX keeps its doors open for {mine.policy.graceDays} days.</li> : null}
                            <li>Pay from your ADX wallet&apos;s withdrawable money, or by card or UPI through a gateway.</li>
                        </ul>
                    </Panel>
                </div>
            </div>

            <Dialog open={cancelling !== null} onOpenChange={(next) => !next && !cancelBusy && setCancelling(null)}>
                <DialogContent className="max-w-[440px] rounded-lg border-line bg-white p-6">
                    <DialogHeader>
                        <DialogTitle className="text-lg font-semibold text-ink">Cancel this order?</DialogTitle>
                        <DialogDescription className="text-sm text-dim">
                            {cancelling ? `${cancelling.planName} · ${cycleLabel(cancelling.cycle)}, ${formatMoney(cancelling.total)}. Nothing has been paid; the order is simply closed, and a plan can be chosen again any time.` : ""}
                        </DialogDescription>
                    </DialogHeader>
                    {cancelFailure && (
                        <p role="alert" className="text-sm text-danger">
                            {cancelFailure}
                        </p>
                    )}
                    <div className="flex justify-end gap-3">
                        <button type="button" onClick={() => setCancelling(null)} disabled={cancelBusy} className={outlineButton}>
                            Keep it
                        </button>
                        <button type="button" onClick={() => void cancel()} disabled={cancelBusy} className={cn(brandButton)}>
                            {cancelBusy ? "Cancelling…" : "Cancel the order"}
                        </button>
                    </div>
                </DialogContent>
            </Dialog>
        </>
    );
}
