"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Users } from "lucide-react";
import { Chip, DateField, Divider } from "@/components/planner/fields";
import { InlineError, StepActions, TaskCard } from "@/components/planner/planner-shell";
import type { StepProps } from "@/components/planner/planner-step";
import { messageOf } from "@/lib/api-client";
import { rupees } from "@/services/browse";
import { BUDGET_SHORTCUTS, flightDays, footfallEstimate, formatCount, isoDate, isoToday, moneyString, plannerHref, plannerService, STEP_META, type InventoryMatch } from "@/services/planner";

/** The ring the frame draws around the estimate (5204:71466's "Native footfall estimate graphic"). */
function FootfallRing({ value, label }: { value: string; label: string }) {
    return (
        <div className="relative mx-auto flex size-[204px] items-center justify-center rounded-2xl bg-gradient-to-b from-[#fdf3f3] to-white">
            <svg className="absolute inset-0" width="204" height="204" viewBox="0 0 204 204" aria-hidden>
                <circle cx="102" cy="102" r="78" fill="none" stroke="#fce9e8" strokeWidth="10" />
                <path d="M102 24 A78 78 0 0 0 30 130" fill="none" stroke="#bd2020" strokeWidth="10" strokeLinecap="round" />
            </svg>
            <div className="flex size-[132px] flex-col items-center justify-center rounded-full bg-white shadow-card">
                <Users className="size-5 text-brand" aria-hidden />
                <p className="mt-1 text-[26px] font-semibold leading-8 text-ink">{value}</p>
                <p className="text-xs text-dim">{label}</p>
            </div>
        </div>
    );
}

/**
 * 06 · Budget & schedule (5204:71466): the budget with its shortcuts, the
 * dates, and the footfall planning estimate — the daily footfall the
 * matching spaces state, over the flight.
 */
export function BudgetStep({ campaign, save }: StepProps) {
    const router = useRouter();
    const [budget, setBudget] = React.useState<string>(campaign.budget ? String(Math.round(Number(campaign.budget))) : "");
    const [from, setFrom] = React.useState<string>(isoDate(campaign.startDate) || isoToday(7));
    const [to, setTo] = React.useState<string>(isoDate(campaign.endDate) || isoToday(20));
    const [matches, setMatches] = React.useState<{ key: string; rows: InventoryMatch[] | null; error: string | null }>({ key: "", rows: null, error: null });
    const [busy, setBusy] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);

    const targeted = Boolean(campaign.targetingMethod) && (campaign.targetLatitude !== null || Boolean(campaign.targetMarket) || campaign.pois.length > 0);

    React.useEffect(() => {
        if (!targeted) return;
        let cancelled = false;
        plannerService
            .inventory(campaign.id, { sort: "MOST_REACH", limit: 50 })
            .then((rows) => {
                if (!cancelled) setMatches({ key: campaign.id, rows, error: null });
            })
            .catch((caught: unknown) => {
                if (!cancelled) setMatches({ key: campaign.id, rows: null, error: messageOf(caught, "Could not read the matching spaces.") });
            });
        return () => {
            cancelled = true;
        };
    }, [campaign.id, targeted]);

    const days = flightDays(from, to);
    const money = moneyString(budget);
    const ready = Boolean(money) && days > 0;
    const estimate = matches.rows ? footfallEstimate(matches.rows, days) : null;
    const budgetNumber = Number(budget.replace(/[^\d]/g, "")) || 0;

    const submit = async () => {
        if (!ready || busy) return;
        setBusy(true);
        setError(null);
        try {
            await save({ budget: money, startDate: from, endDate: to, step: STEP_META.budget.appStep });
            router.push(plannerHref(campaign.id, "spaces"));
        } catch (caught) {
            setError(messageOf(caught, "Could not save the budget and dates."));
            setBusy(false);
        }
    };

    return (
        <>
            <TaskCard title="Budget and schedule">
                <div>
                    <label htmlFor="budget" className="block text-sm font-medium text-ink">
                        Campaign budget
                    </label>
                    <div className="mt-2 flex min-h-12 items-center rounded-lg border border-line bg-white px-4 focus-within:border-ink">
                        <span className="text-sm text-ink">₹</span>
                        <input
                            id="budget"
                            inputMode="numeric"
                            value={budgetNumber ? budgetNumber.toLocaleString("en-IN") : ""}
                            onChange={(e) => setBudget(e.target.value.replace(/[^\d]/g, ""))}
                            placeholder="50,000"
                            className="ml-0.5 min-w-0 flex-1 bg-transparent py-3 text-sm text-ink outline-none placeholder:text-dim"
                        />
                    </div>
                    <p className="mt-3 text-sm text-dim">Your final quote will itemize the selected spaces, production, installation and tax.</p>
                    <div className="mt-4 flex flex-wrap gap-3">
                        {BUDGET_SHORTCUTS.map((amount) => (
                            <Chip key={amount} label={rupees(amount)} on={budget === amount} onClick={() => setBudget(amount)} />
                        ))}
                    </div>
                </div>

                <div className="my-6">
                    <Divider />
                </div>

                <div>
                    <h3 className="text-lg font-semibold leading-6 text-ink">Campaign dates</h3>
                    <div className="mt-4 grid gap-4 md:grid-cols-2">
                        <DateField label="Starts" value={from} onChange={(iso) => { setFrom(iso); if (iso > to) setTo(iso); }} min={isoToday()} native />
                        <DateField label="Ends" value={to} onChange={setTo} min={from} native />
                    </div>
                    <p className="mt-4 text-sm text-dim">
                        {days > 0 ? `${days} day${days === 1 ? "" : "s"}` : "Choose an end date on or after the start"} · availability and lead times are checked against the spaces you select.
                    </p>
                </div>

                <div className="my-6">
                    <Divider />
                </div>

                <div className="text-center">
                    {estimate ? (
                        <>
                            <FootfallRing value={formatCount(estimate.daily)} label="Footfall" />
                            <p className="mt-3 text-sm font-semibold text-ink">Footfall planning estimate</p>
                            <p className="mt-2 text-sm text-dim">
                                Indicative estimate from your brief: the daily footfall stated by {estimate.counted} of the {estimate.of} matching spaces, about {formatCount(estimate.total)} over {days} day{days === 1 ? "" : "s"}. Review reach for each selected space.
                            </p>
                        </>
                    ) : (
                        <>
                            <FootfallRing value="—" label="Footfall" />
                            <p className="mt-3 text-sm font-semibold text-ink">Footfall planning estimate</p>
                            <p className="mt-2 text-sm text-dim">
                                {!targeted
                                    ? "Set a location first — the estimate adds up the footfall of the spaces that match it."
                                    : matches.error
                                      ? matches.error
                                      : matches.rows === null
                                        ? "Reading the matching spaces…"
                                        : "None of the matching spaces states a footfall yet. Review reach for each selected space."}
                            </p>
                        </>
                    )}
                </div>
                {error && (
                    <div className="mt-4">
                        <InlineError message={error} />
                    </div>
                )}
            </TaskCard>
            <StepActions back={{ label: "Back", href: plannerHref(campaign.id, "triggers") }} next={{ label: STEP_META.budget.continueLabel, onClick: submit, disabled: !ready, busy }} />
        </>
    );
}
