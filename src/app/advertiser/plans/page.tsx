"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ApiError, messageOf } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { PageHeading } from "@/components/workspace/page-heading";
import { useAdvertiser } from "@/app/advertiser/layout";
import { btnOutline, btnPrimary, btnSmall, ErrorPanel, KeyValue, LoadingLine, useAsync } from "@/components/advertiser/bits";
import { AgeGate, useAgeGate } from "@/components/checkout/age-gate";
import { CycleToggle, PlanOption } from "@/components/packages/plan-option";
import { PlanStatusCard } from "@/components/packages/plan-status-card";
import {
    activePlanOf,
    catalogueRefusal,
    currentPlanNote,
    cycleSummary,
    isPositive,
    packagesService,
    packageTermLine,
    pctLabel,
    planMoney,
    type ActivePackageRead,
    type BillingCycle,
    type CatalogueAddOn,
    type CataloguePackage,
    type PackageSale,
    type PackageTier,
    type PricedSale,
} from "@/services/packages";

/**
 * Plans — the app's package catalogue (Lot J-M) on the web: the three
 * plans as cards (POPULAR, the price over "/mo", the entitlements as ticks,
 * CURRENT PLAN on the running tier), the add-ons, the Monthly / Annual
 * toggle the policy offers with its SAVE badge, and the total from
 * `POST /packages/quote` — the server's arithmetic, GST and the annual
 * discount itemised, and the term rule the activation will apply.
 *
 * A tier the active read lists in `trialAvailable` carries "Start an N-day
 * free trial". Choose creates the sale for yourself (`POST /packages/sales`)
 * and opens its page, where the terms are accepted and it is paid; a sale
 * already waiting for payment is named at the top rather than joined by a
 * second. Buying is an order (29 Sep 2026): the age gate asks a missing
 * date of birth before the sale is made; a free trial is never held.
 */
export default function PlansPage() {
    const advertiser = useAdvertiser();
    const advertiserId = advertiser?.id ?? null;
    const state = useAsync(
        `plans:${advertiserId ?? ""}`,
        async () => {
            if (!advertiserId) return null;
            /* The catalogue failing is said on the page; the plan you hold and a plan waiting for payment still show. */
            const [catalogue, active, pending] = await Promise.all([
                packagesService
                    .catalogue()
                    .then((value) => ({ value, error: null as string | null }))
                    .catch((caught: unknown) => ({ value: null, error: catalogueRefusal(caught) })),
                packagesService.active().catch(() => null),
                packagesService.pending().catch(() => null),
            ]);
            return { catalogue, active, pending };
        },
        "Could not load the plans."
    );

    const heading = <PageHeading title="Plans" subtitle="A package for the campaigns you run, with the extras you want beside it." />;

    if (state.kind === "loading" || (state.kind === "ready" && !state.value)) {
        return (
            <>
                {heading}
                <div className="mt-6">
                    <LoadingLine>Loading the plans…</LoadingLine>
                </div>
            </>
        );
    }
    if (state.kind === "error") {
        return (
            <>
                {heading}
                <ErrorPanel title="Could not load the plans" message={state.message} />
                <button type="button" onClick={state.reload} className={`${btnOutline} mt-4`}>
                    Try again
                </button>
            </>
        );
    }

    const { catalogue, active, pending } = state.value!;
    if (!catalogue.value) {
        return (
            <>
                {heading}
                <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
                    <div className="min-w-0 space-y-6">
                        {pending && <PendingSale sale={pending} />}
                        <ErrorPanel title="Could not read the plan catalogue" message={catalogue.error ?? "Try again in a moment."} className="mt-0" />
                        <button type="button" onClick={state.reload} className={btnOutline}>
                            Try again
                        </button>
                    </div>
                    <div className="grid grid-cols-1 content-start gap-4">
                        <PlanStatusCard active={active} onChanged={state.reload} />
                    </div>
                </div>
            </>
        );
    }
    return (
        <>
            {heading}
            <Catalogue advertiserId={advertiserId!} packages={catalogue.value.packages} addOns={catalogue.value.addOns} active={active} pending={pending} reload={state.reload} />
        </>
    );
}

/** A sale already waiting for payment — named at the top rather than joined by a second. */
function PendingSale({ sale }: { sale: PackageSale }) {
    return (
        <Link href={`/advertiser/plans/${encodeURIComponent(sale.id)}`} className="block rounded-lg border border-warning/30 bg-warning-soft p-5 hover:border-warning">
            <p className="text-sm font-semibold text-ink">Your {sale.packageName} plan is waiting</p>
            <p className="mt-1 text-sm text-dim">
                {planMoney(sale.total)} including GST · {sale.reference}. Review and pay it, rather than starting another.
            </p>
        </Link>
    );
}

function Catalogue({ advertiserId, packages, addOns, active, pending, reload }: { advertiserId: string; packages: CataloguePackage[]; addOns: CatalogueAddOn[]; active: ActivePackageRead | null; pending: PackageSale | null; reload: () => void }) {
    const router = useRouter();
    const policy = active?.policy ?? null;
    const current = activePlanOf(active);
    const trialAvailable = active?.trialAvailable ?? {};

    /* The popular plan starts chosen; a cycle the policy does not offer is never asked for. */
    const [picked, setPicked] = React.useState<PackageTier | null>(null);
    const tier = picked ?? packages.find((plan) => plan.isPopular)?.tier ?? packages[0]?.tier ?? null;
    const [wantedCycle, setWantedCycle] = React.useState<BillingCycle>("MONTHLY");
    const cycles = policy?.cyclesOffered?.length ? policy.cyclesOffered : (["MONTHLY", "ANNUAL"] as BillingCycle[]);
    const cycle = cycles.includes(wantedCycle) ? wantedCycle : cycles[0]!;
    const [chosen, setChosen] = React.useState<string[]>([]);

    const quoteKey = `${tier}:${cycle}:${[...chosen].sort().join(",")}`;
    const [quote, setQuote] = React.useState<{ key: string; priced: PricedSale | null; error: string | null } | null>(null);
    const [busy, setBusy] = React.useState(false);
    const [trialBusy, setTrialBusy] = React.useState<PackageTier | null>(null);
    const [error, setError] = React.useState<string | null>(null);
    const age = useAgeGate();

    /* The total reprices on every change, and the server does the arithmetic — the number shown is the number charged. */
    React.useEffect(() => {
        if (!tier) return;
        let alive = true;
        packagesService
            .quote({ tier, addOnCodes: chosen, cycle })
            .then((priced) => {
                if (alive) setQuote({ key: quoteKey, priced, error: null });
            })
            .catch((caught: unknown) => {
                if (!alive) return;
                /* 400 CYCLE_NOT_OFFERED names the cycles that are: move to the first and ask again. */
                const offered = caught instanceof ApiError && caught.code === "CYCLE_NOT_OFFERED" ? (caught.details as { cyclesOffered?: BillingCycle[] } | undefined)?.cyclesOffered : undefined;
                if (offered?.[0] && offered[0] !== cycle) setWantedCycle(offered[0]);
                setQuote({ key: quoteKey, priced: null, error: messageOf(caught, "Could not price that choice.") });
            });
        return () => {
            alive = false;
        };
    }, [tier, cycle, chosen, quoteKey]);

    const priced = quote?.key === quoteKey ? quote.priced : null;
    const quoteError = quote?.key === quoteKey ? quote.error : null;
    const plan = packages.find((candidate) => candidate.tier === tier) ?? null;
    const summary = cycleSummary(cycle);

    const choose = async () => {
        if (!tier || !priced || !age.ready(() => void choose())) return;
        setBusy(true);
        setError(null);
        try {
            const sale = await packagesService.sell({ advertiserId, tier, addOnCodes: chosen, cycle });
            router.push(`/advertiser/plans/${encodeURIComponent(sale.id)}`);
        } catch (caught) {
            if (!age.caught(caught, () => void choose())) setError(caught instanceof ApiError && caught.status === 429 ? "Too many plans set up in a short while. Wait a minute and try again." : messageOf(caught, "Could not set the plan up."));
            setBusy(false);
        }
    };

    const startTrial = async (trialTier: PackageTier) => {
        setTrialBusy(trialTier);
        setError(null);
        try {
            const sale = await packagesService.trial(trialTier);
            toast.success("Your free trial has started.");
            router.push(`/advertiser/plans/${encodeURIComponent(sale.id)}`);
        } catch (caught) {
            setError(messageOf(caught, "Could not start the trial."));
            setTrialBusy(null);
        }
    };

    const toggleAddOn = (code: string) => setChosen((codes) => (codes.includes(code) ? codes.filter((c) => c !== code) : [...codes, code]));

    return (
        <div className="mt-6 space-y-6">
            {pending && <PendingSale sale={pending} />}

            <section aria-labelledby="choose-plan">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <h2 id="choose-plan" className="text-base font-semibold text-ink">
                        Choose a plan
                    </h2>
                    {policy && <CycleToggle value={cycle} cycles={cycles} savePct={policy.annualDiscountPct} onChange={setWantedCycle} />}
                </div>
                {packages.length === 0 ? (
                    <p className="mt-4 rounded-lg border border-line bg-white p-5 text-sm text-dim">No plans are on sale right now. Ask ADX support when the next ones open.</p>
                ) : (
                    <div role="radiogroup" aria-label="Plans" className="mt-4 grid gap-4 md:grid-cols-3">
                        {packages.map((candidate) => (
                            <PlanOption
                                key={candidate.id}
                                plan={candidate}
                                selected={candidate.tier === tier}
                                current={current?.tier === candidate.tier}
                                onSelect={() => setPicked(candidate.tier)}
                                footer={
                                    trialAvailable[candidate.tier] ? (
                                        <button type="button" onClick={() => void startTrial(candidate.tier)} disabled={trialBusy !== null} className={`${btnSmall} w-full`}>
                                            {trialBusy === candidate.tier ? "Starting…" : `Start ${trialAvailable[candidate.tier]}-day free trial`}
                                        </button>
                                    ) : null
                                }
                            />
                        ))}
                    </div>
                )}
                <p className="mt-3 text-xs text-dim">The benefits a plan lists are what it includes; ADX arranges them with you and your agent.</p>
            </section>

            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
                <div className="min-w-0 space-y-6">
                    {addOns.length > 0 && (
                        <section aria-labelledby="add-ons">
                            <h2 id="add-ons" className="text-base font-semibold text-ink">
                                Add-ons
                            </h2>
                            <ul className="mt-3 divide-y divide-line rounded-lg border border-line bg-white">
                                {addOns.map((addOn) => {
                                    const on = chosen.includes(addOn.code);
                                    return (
                                        <li key={addOn.id}>
                                            <label className="flex cursor-pointer items-center gap-4 px-5 py-4">
                                                <input type="checkbox" checked={on} onChange={() => toggleAddOn(addOn.code)} className="peer sr-only" />
                                                <span className={cn("flex size-5 shrink-0 items-center justify-center rounded border", on ? "border-brand bg-brand" : "border-dim bg-white")} aria-hidden>
                                                    {on && (
                                                        <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                                                            <path d="M1 4l2.5 2.5L9 1" stroke="white" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                                                        </svg>
                                                    )}
                                                </span>
                                                <span className="min-w-0 flex-1">
                                                    <span className="block text-sm font-medium text-ink">{addOn.name}</span>
                                                    {addOn.description && <span className="block text-xs text-dim">{addOn.description}</span>}
                                                </span>
                                                <span className="shrink-0 text-sm text-dim">+{planMoney(addOn.pricePerMonth)}/mo</span>
                                            </label>
                                        </li>
                                    );
                                })}
                            </ul>
                        </section>
                    )}
                    <PlanStatusCard active={active} onChanged={reload} />
                </div>
                <div className="grid grid-cols-1 content-start gap-4">
                    {plan && (
                        <section className="overflow-hidden rounded-lg border border-line bg-white" aria-labelledby="plan-total">
                            <div className="flex items-center justify-between gap-3 bg-ink px-5 py-4 text-white">
                                <div>
                                    <p className="text-sm font-semibold">{summary.title}</p>
                                    <p className="text-xs text-white/60">{summary.line}</p>
                                </div>
                                <p className="text-2xl font-semibold tabular-nums">{priced ? `${planMoney(priced.perMonth)}/mo` : "—"}</p>
                            </div>
                            <div className="px-5 py-4">
                                <h2 id="plan-total" className="sr-only">
                                    What you pay
                                </h2>
                                {priced ? (
                                    <>
                                        {priced.lines.map((line) => (
                                            <KeyValue key={`${line.kind}-${line.code}`} label={`${line.label}${line.months > 1 ? ` × ${line.months} months` : ""}`} value={planMoney(line.amount)} />
                                        ))}
                                        <div className="my-1 border-t border-line" />
                                        <KeyValue label="Subtotal" value={planMoney(priced.subtotal)} />
                                        {isPositive(priced.discountAmount) && <KeyValue label={`Annual discount ${pctLabel(priced.discountPct)}%`} value={`−${planMoney(priced.discountAmount)}`} />}
                                        <KeyValue label={`GST ${pctLabel(priced.gstPct)}%`} value={planMoney(priced.gstAmount)} />
                                        <div className="my-1 border-t border-line" />
                                        <KeyValue label="You pay" value={<span className="text-lg">{planMoney(priced.total)}</span>} strong />
                                        {priced.term && <p className="mt-2 text-xs text-dim">{packageTermLine(priced.term, plan.name)}</p>}
                                    </>
                                ) : (
                                    <p className="text-sm text-dim">{quoteError ?? "Pricing your choice…"}</p>
                                )}
                                {current && <p className="mt-3 rounded-md bg-info-soft px-3 py-2 text-xs text-info">{currentPlanNote(current, policy)}</p>}
                                <AgeGate gate={age} className="mt-3" />
                                {error && (
                                    <p role="alert" className="mt-3 text-sm text-danger">
                                        {error}
                                    </p>
                                )}
                                <button type="button" onClick={() => void choose()} disabled={busy || !priced || age.blocked} className={`${btnPrimary} mt-4 w-full`}>
                                    {busy ? "Setting it up…" : priced ? `Choose ${plan.name} · ${planMoney(priced.total)}` : "Choose"}
                                </button>
                                <p className="mt-2 text-center text-xs text-dim">You accept the plan terms and pay on the next page.</p>
                            </div>
                        </section>
                    )}
                </div>
            </div>
        </div>
    );
}
