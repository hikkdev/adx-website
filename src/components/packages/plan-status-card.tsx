"use client";

import * as React from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ApiError, messageOf } from "@/lib/api-client";
import { Switch } from "@/components/ui/switch";
import { btnOutline, btnPrimary, StatusChip } from "@/components/advertiser/bits";
import { AgeGate, useAgeGate } from "@/components/checkout/age-gate";
import { activePlanOf, autoRenewOffered, packagesService, planDate, planMetaLine, renewalLine, renewsAtBoughtPrice, type ActivePackageRead } from "@/services/packages";

/**
 * The plan card (Lot J-M / J2-M on the app's billing home): the running
 * plan with its term, the Auto-renew switch while the policy offers it
 * (`PATCH /packages/active`), a term ended inside the grace window, a free
 * trial said as one — or "No plan yet" with the door to the catalogue.
 * A refusal (409 AUTO_RENEW_NOT_OFFERED when the policy changed under the
 * page) is printed and the plan read again. Switching auto-renew on is an
 * order (29 Sep 2026): the age gate asks a missing date of birth first;
 * switching it off is never held.
 */
export function PlanStatusCard(props: { active: ActivePackageRead | null; onChanged: () => void; chooseHref?: string }) {
    const plan = activePlanOf(props.active);
    /* A fresh read of the plan is a fresh card: the switch starts from what the server holds. */
    return <PlanCardBody key={`${plan?.saleId ?? "none"}:${plan?.autoRenew ? "on" : "off"}`} {...props} />;
}

function PlanCardBody({ active, onChanged, chooseHref }: { active: ActivePackageRead | null; onChanged: () => void; chooseHref?: string }) {
    const plan = activePlanOf(active);
    const grace = !plan ? (active?.grace ?? null) : null;
    const trial = plan?.paidMethod === "TRIAL";
    const offered = autoRenewOffered(plan, active?.policy);
    const [autoRenew, setAutoRenew] = React.useState<boolean>(!!plan?.autoRenew);
    const [busy, setBusy] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);
    const [boughtFor, setBoughtFor] = React.useState<string | null>(null);
    /* Quiet until tried: the card also switches auto-renew off, and stands over a plan already running. */
    const age = useAgeGate({ upfront: false });

    /* K-M: the renewal line's amount, read off the sale only when the policy prices renewals at what the term was bought for. */
    const saleId = plan?.saleId ?? null;
    const wantsBoughtPrice = offered && renewsAtBoughtPrice(active?.policy);
    React.useEffect(() => {
        if (!saleId || !wantsBoughtPrice) return;
        let cancelled = false;
        packagesService
            .get(saleId)
            .then((sale) => {
                if (!cancelled) setBoughtFor(sale.total);
            })
            .catch(() => undefined);
        return () => {
            cancelled = true;
        };
    }, [saleId, wantsBoughtPrice]);

    const toggle = async (next: boolean) => {
        if (next && !age.ready(() => void toggle(true))) return;
        setBusy(true);
        setError(null);
        const before = autoRenew;
        setAutoRenew(next);
        try {
            const updated = await packagesService.setAutoRenew(next);
            setAutoRenew(updated.autoRenew ?? next);
            toast.success(next ? "Auto-renew is on." : "Auto-renew is off. The plan ends with its term.");
        } catch (caught) {
            setAutoRenew(before);
            if (!age.caught(caught, () => void toggle(next))) {
                setError(caught instanceof ApiError && caught.code === "AUTO_RENEW_NOT_OFFERED" ? "Auto-renew is not offered on this plan any more." : messageOf(caught, "Could not change auto-renew."));
                onChanged();
            }
        } finally {
            setBusy(false);
        }
    };

    const title = plan ? `${plan.packageName} plan` : grace ? `${grace.packageName} plan` : "Your plan";
    return (
        <section className="rounded-lg border border-line bg-white p-5" aria-labelledby="plan-card-title">
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <h2 id="plan-card-title" className="text-sm font-semibold text-ink">
                        {title}
                    </h2>
                    <p className="mt-1 text-xs text-dim">
                        {plan
                            ? planMetaLine(plan)
                            : grace
                              ? `Ended ${planDate(grace.endsAt)} · in grace until ${planDate(grace.until)}`
                              : "No plan yet. A package covers the campaigns you run each month, with the extras you want beside it."}
                    </p>
                </div>
                {plan ? <StatusChip label={trial ? "Free trial" : "Active"} tone="success" /> : grace ? <StatusChip label="In grace" tone="warning" /> : null}
            </div>

            {grace && <p className="mt-3 text-xs text-dim">The term has ended, and ADX keeps its doors open until {planDate(grace.until)}. Choose the next plan before then and nothing lapses.</p>}

            {plan && plan.addOns.length > 0 && <p className="mt-3 text-xs text-dim">With {plan.addOns.join(", ")}</p>}

            {plan && offered && (
                <div className="mt-4 flex items-center justify-between gap-4 border-t border-line pt-4">
                    <div className="min-w-0">
                        <p className="text-sm font-medium text-ink">Auto-renew</p>
                        <p className="mt-0.5 text-xs text-dim">{renewalLine({ endsAt: plan.endsAt, autoRenew }, active?.policy, boughtFor)}</p>
                    </div>
                    <Switch checked={autoRenew} onCheckedChange={(value) => void toggle(value)} disabled={busy} aria-label="Auto-renew" className="data-[state=checked]:bg-brand" />
                </div>
            )}

            {plan && offered && <AgeGate gate={age} className="mt-3" />}

            {plan && !plan.enforced && <p className="mt-3 text-xs text-dim">Your plan is recorded and charged, but nothing in ADX gates on its entitlements yet — the benefits are arranged with your agent.</p>}

            {error && (
                <p role="alert" className="mt-3 text-sm text-danger">
                    {error}
                </p>
            )}

            {chooseHref && (
                <Link href={chooseHref} className={`${plan ? btnOutline : btnPrimary} mt-4 w-full`}>
                    {plan ? "Change plan" : "Choose a plan"}
                </Link>
            )}
        </section>
    );
}
