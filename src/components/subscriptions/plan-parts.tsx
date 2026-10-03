"use client";

import * as React from "react";
import { Check, X } from "lucide-react";
import { Chip } from "@/components/publisher/parts";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/services/publisher-workspace";
import { commissionLine, entitlementLines, type Plan, type SubscriptionCycle } from "@/services/subscriptions";

/**
 * The publisher plan card as the ADX app draws it (DR 02's plan card, the
 * agent app's package sale): the name with its POPULAR chip, the price over
 * "/mo", the commission the tier grants, the entitlements as ticks, CURRENT
 * PLAN on the tier already held — and, where the policy offers one, the
 * free-trial button inside the card.
 */
export function PlanCard({ plan, selected, current, onSelect, footer }: { plan: Plan; selected: boolean; current: boolean; onSelect?: () => void; footer?: React.ReactNode }) {
    const lines = entitlementLines(plan.entitlements);
    const rate = commissionLine(plan.ratePct);
    return (
        <div className={cn("flex h-full flex-col rounded-lg border bg-white p-5 transition-colors", selected ? "border-brand-bright bg-[#fff7f7] shadow-card" : "border-line", onSelect && !selected && "hover:border-dim")}>
            <button type="button" onClick={onSelect} disabled={!onSelect} aria-pressed={onSelect ? selected : undefined} className="flex flex-1 flex-col text-left disabled:cursor-default">
                <span className="flex flex-wrap items-center gap-2">
                    <span className="text-base font-semibold text-ink">{plan.name}</span>
                    {plan.isPopular && <Chip tone="ink">Popular</Chip>}
                    {current && <Chip tone="success">Current plan</Chip>}
                </span>
                <span className="mt-3 flex items-baseline gap-1">
                    <span className="text-2xl font-semibold tracking-tight text-ink">{formatMoney(plan.pricePerMonth)}</span>
                    <span className="text-sm text-dim">/mo</span>
                </span>
                {rate && <span className="mt-1 text-sm font-medium text-ink">{rate}</span>}
                {plan.description && <span className="mt-2 text-sm text-dim">{plan.description}</span>}
                {lines.length > 0 && (
                    <ul className="mt-4 grid gap-1.5">
                        {lines.map((line) => (
                            <li key={line.key} className={cn("flex items-start gap-2 text-sm", line.granted ? "text-ink" : "text-dim line-through")}>
                                {line.granted ? <Check className="mt-0.5 size-4 shrink-0 text-success" aria-hidden /> : <X className="mt-0.5 size-4 shrink-0 text-dim" aria-hidden />}
                                <span>
                                    {line.label}
                                    <span className="sr-only">{line.granted ? " — included" : " — not included"}</span>
                                </span>
                            </li>
                        ))}
                    </ul>
                )}
            </button>
            {footer && <div className="mt-4 border-t border-line pt-4">{footer}</div>}
        </div>
    );
}

/** Monthly / Annual, the SAVE badge printing the policy's discount; a policy offering one cycle draws nothing. */
export function CycleToggle({ value, onChange, cycles, savePct }: { value: SubscriptionCycle; onChange: (cycle: SubscriptionCycle) => void; cycles: SubscriptionCycle[]; savePct: number }) {
    const offered = (["MONTHLY", "ANNUAL"] as const).filter((cycle) => cycles.includes(cycle));
    if (offered.length < 2) return null;
    return (
        <div role="tablist" aria-label="Billing cycle" className="inline-flex items-center rounded-full bg-[#2f2f31] p-[3px]">
            {offered.map((cycle) => {
                const on = cycle === value;
                return (
                    <button key={cycle} type="button" role="tab" aria-selected={on} onClick={() => onChange(cycle)} className={cn("flex h-8 items-center gap-2 whitespace-nowrap rounded-full px-5 text-xs font-semibold transition-colors", on ? "bg-white text-ink" : "text-white/90 hover:text-white")}>
                        {cycle === "MONTHLY" ? "Monthly" : "Annual"}
                        {cycle === "ANNUAL" && savePct > 0 && <span className={cn("rounded-full px-1.5 py-0.5 text-[10px]", on ? "bg-success-soft text-success" : "bg-white/15 text-white")}>SAVE {savePct}%</span>}
                    </button>
                );
            })}
        </div>
    );
}

/** A money row of a quote or an order: the label, the amount, the total in bold. */
export function MoneyRow({ label, value, strong, negative }: { label: string; value: string | null | undefined; strong?: boolean; negative?: boolean }) {
    return (
        <div className="flex items-baseline justify-between gap-6 py-1.5">
            <span className={cn("text-sm", strong ? "font-semibold text-ink" : "text-dim")}>{label}</span>
            <span className={cn("text-right tabular-nums", strong ? "text-lg font-semibold text-ink" : "text-sm text-ink")}>
                {negative ? "−" : ""}
                {formatMoney(value, { paise: "always" })}
            </span>
        </div>
    );
}
