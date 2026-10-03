"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Panel } from "@/components/workspace/page-heading";
import { brandButton, CardTitle, Crumbs, ErrorNote, Loading, outlineButton } from "@/components/publisher/parts";
import { useLoad } from "@/components/publisher/use-load";
import { AgeGate, useAgeGate } from "@/components/checkout/age-gate";
import { CycleToggle, MoneyRow, PlanCard } from "@/components/subscriptions/plan-parts";
import { ApiError, messageOf } from "@/lib/api-client";
import { FeatureOff } from "@/components/platform/feature-off";
import { FLAG_PUBLISHER_PLANS, useFlagsLoaded, useSwitchedOff } from "@/lib/flags";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/services/publisher-workspace";
import {
    cycleLabel,
    initialTier,
    offeredCycle,
    onSale,
    orderHandoff,
    orderHref,
    pctLabel,
    subscriptionsService,
    termLine,
    type MySubscription,
    type Plan,
    type PlanTier,
    type SubscriptionCycle,
    type SubscriptionPolicy,
    type SubscriptionQuote,
} from "@/services/subscriptions";

async function readPlans(on: boolean): Promise<{ plans: Plan[]; mine: MySubscription | null }> {
    const [catalogue, mine] = await Promise.all([subscriptionsService.plans(), on ? subscriptionsService.me().catch(() => null) : Promise.resolve(null)]);
    return { plans: onSale(catalogue), mine };
}

/**
 * Choose a plan — the app's Plans screen on the web. The cycle toggle shows
 * the cycles the policy offers with its annual discount; every change is
 * priced by the server (`/revenue/subscription-orders/quote`): the total with
 * GST, and the term rule as a sentence. A tier held open-ended answers 409
 * ALREADY_ON_PLAN and the page says so instead of offering a button the
 * order would refuse. A tier the `me` read names in `trialAvailable` carries
 * its free trial. Subscribe creates the order and opens its pay page —
 * an order (29 Sep 2026), so the age gate asks a missing date of birth
 * first and holds it for someone under 18; a free trial is never held.
 */
export default function PlansPage() {
    const loaded = useFlagsLoaded();
    // The kill switch (`revenue.publisher-plans`): the catalogue is not behind it, buying is.
    const on = !useSwitchedOff(FLAG_PUBLISHER_PLANS);
    const router = useRouter();
    const { data, error, loading, reload } = useLoad(`plans:${loaded}:${on}`, () => readPlans(on));
    const [tierChoice, setTier] = React.useState<PlanTier | null>(null);
    const [cycleChoice, setCycle] = React.useState<SubscriptionCycle>("MONTHLY");
    const [quoted, setQuoted] = React.useState<{ key: string; quote: SubscriptionQuote | null; refusal: string | null } | null>(null);
    const [busy, setBusy] = React.useState(false);
    const [trialBusy, setTrialBusy] = React.useState<PlanTier | null>(null);
    const [failure, setFailure] = React.useState<string | null>(null);
    const age = useAgeGate();

    const plans = data?.plans ?? [];
    const mine = data?.mine ?? null;
    const policy: SubscriptionPolicy | null = quoted?.quote?.policy ?? mine?.policy ?? null;
    const tier = tierChoice ?? initialTier(plans, mine?.running);
    const cycle = offeredCycle(cycleChoice, policy);
    const key = `${tier}:${cycle}`;

    React.useEffect(() => {
        if (!on || !tier) return;
        let active = true;
        subscriptionsService
            .quote({ tier, cycle })
            .then((quote) => {
                if (active) setQuoted({ key: `${tier}:${cycle}`, quote, refusal: null });
            })
            .catch((caught: unknown) => {
                if (!active) return;
                const offered = caught instanceof ApiError && caught.code === "CYCLE_NOT_OFFERED" ? (caught.details as { cyclesOffered?: SubscriptionCycle[] } | undefined)?.cyclesOffered : undefined;
                if (offered?.[0] && offered[0] !== cycle) setCycle(offered[0]);
                setQuoted({ key: `${tier}:${cycle}`, quote: null, refusal: messageOf(caught, "Could not price this plan.") });
            });
        return () => {
            active = false;
        };
    }, [on, tier, cycle]);

    if (!loaded || (!data && loading)) return <Loading label="Loading the plans…" />;
    if (!data) return <ErrorNote message={error ?? "Could not load the plans."} onRetry={reload} />;

    const current = quoted?.key === key ? quoted : null;
    const quote = current?.quote ?? null;
    const chosen = plans.find((plan) => plan.tier === tier) ?? null;
    const running = mine?.running ?? null;
    const trials = on ? (mine?.trialAvailable ?? {}) : {};

    const subscribe = async () => {
        if (!tier || !quote || !age.ready(() => void subscribe())) return;
        setBusy(true);
        setFailure(null);
        try {
            const created = await subscriptionsService.order({ tier, cycle });
            orderHandoff.save(created.order.id, { term: { rule: created.term.rule, startsAt: created.term.startsAt, credit: created.term.credit ?? null }, policy: quote.policy ?? policy });
            router.push(orderHref(created.order.id));
        } catch (caught) {
            if (!age.caught(caught, () => void subscribe())) setFailure(messageOf(caught, "Could not create the order."));
            setBusy(false);
        }
    };

    const startTrial = async (trialTier: PlanTier) => {
        setTrialBusy(trialTier);
        setFailure(null);
        try {
            const started = await subscriptionsService.trial({ tier: trialTier });
            orderHandoff.save(started.order.id, { trial: started.subscription, policy });
            router.push(`${orderHref(started.order.id)}?trial=1`);
        } catch (caught) {
            setFailure(caught instanceof ApiError && (caught.code === "TRIAL_ALREADY_USED" || caught.code === "TRIAL_NOT_OFFERED") ? `${caught.message} Pick a plan to buy instead.` : messageOf(caught, "Could not start the trial."));
            setTrialBusy(null);
        }
    };

    return (
        <>
            <Crumbs items={[{ label: "Subscription", href: "/publisher/subscription" }, { label: "Choose a plan" }]} />
            <div className="mt-6 flex flex-wrap items-end justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-semibold tracking-tight text-ink">Choose a plan</h1>
                    <p className="mt-1 text-sm text-dim">{policy?.autoRenewAllowed ? "A lower commission on every booking. Auto-renew is yours to switch on from your subscription." : "A lower commission on every booking. Nothing renews itself — a term ends when it ends."}</p>
                </div>
                {policy && <CycleToggle value={cycle} onChange={setCycle} cycles={policy.cyclesOffered} savePct={policy.annualDiscountPct} />}
            </div>

            {failure && (
                <div className="mt-4">
                    <ErrorNote message={failure} />
                </div>
            )}

            {plans.length === 0 ? (
                <Panel className="mt-6">
                    <p className="text-sm text-dim">No plans are on sale right now.</p>
                </Panel>
            ) : (
                <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {plans.map((plan) => (
                        <PlanCard
                            key={plan.id}
                            plan={plan}
                            selected={plan.tier === tier}
                            current={running?.tier === plan.tier}
                            onSelect={() => setTier(plan.tier)}
                            footer={
                                trials[plan.tier] ? (
                                    <button type="button" onClick={() => void startTrial(plan.tier)} disabled={trialBusy !== null} className={cn(outlineButton, "w-full")}>
                                        {trialBusy === plan.tier ? "Starting…" : `Start a ${trials[plan.tier]}-day free trial`}
                                    </button>
                                ) : undefined
                            }
                        />
                    ))}
                </div>
            )}

            {chosen && (
                <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_360px]">
                    <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg bg-ink px-6 py-5 text-white">
                        <div>
                            <p className="text-sm font-semibold">
                                {chosen.name} · {cycleLabel(cycle)}
                            </p>
                            <p className="mt-0.5 text-xs text-white/70">
                                {cycle === "MONTHLY" ? "1 month, paid once" : "12 months, one payment"}
                                {quote ? ` · GST ${pctLabel(quote.gstPct)} included` : ""}
                            </p>
                        </div>
                        <p className="text-2xl font-semibold tabular-nums">{quote ? formatMoney(quote.total) : `${formatMoney(chosen.pricePerMonth)}/mo`}</p>
                    </div>

                    <Panel>
                        {!on ? (
                            <FeatureOff flag={FLAG_PUBLISHER_PLANS} className="border-0 p-0">
                                The plans above are what ADX offers; check back soon.
                            </FeatureOff>
                        ) : quote ? (
                            <>
                                <MoneyRow label="Subtotal" value={quote.subtotal} />
                                {Number(quote.discountAmount) > 0 && <MoneyRow label={`Annual discount ${pctLabel(quote.discountPct)}`} value={quote.discountAmount} negative />}
                                <MoneyRow label={`GST ${pctLabel(quote.gstPct)}`} value={quote.gstAmount} />
                                <div className="my-1 border-t border-line" />
                                <MoneyRow label="You pay" value={quote.total} strong />
                                <p className="mt-2 text-xs text-dim">{termLine(quote.term, quote.plan.name, { prorate: quote.policy?.prorateOnChange })}</p>
                                {quote.term.credit && <p className="mt-1 text-xs text-success">{formatMoney(quote.term.credit.amount)} for {quote.term.credit.remainingDays} unused days of {quote.term.credit.planName} comes back to your wallet.</p>}
                                <AgeGate gate={age} className="mt-4" />
                                <button type="button" onClick={() => void subscribe()} disabled={busy || age.blocked} className={cn(brandButton, "mt-4 w-full")}>
                                    {busy ? "Creating the order…" : `Subscribe · ${formatMoney(quote.total)}`}
                                </button>
                                <p className="mt-2 text-xs text-dim">You choose how to pay on the next page. Nothing is charged until you do.</p>
                            </>
                        ) : current?.refusal ? (
                            <>
                                <p role="status" className="rounded-md bg-warning-soft px-3 py-2 text-sm text-warning">
                                    {current.refusal}
                                </p>
                                <p className="mt-3 text-xs text-dim">Choose another plan above to see its price.</p>
                            </>
                        ) : (
                            <Loading label="Pricing this plan…" />
                        )}
                    </Panel>
                </div>
            )}

            <div className="mt-6">
                <Link href="/publisher/subscription" className={outlineButton}>
                    Back to your subscription
                </Link>
            </div>
        </>
    );
}
