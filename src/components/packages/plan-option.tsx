"use client";

import * as React from "react";
import { Check, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { StatusChip } from "@/components/advertiser/bits";
import { entitlementLines, planMoney, type BillingCycle, type CataloguePackage } from "@/services/packages";

/**
 * One plan in the catalogue — the app's PlanCard: the name, POPULAR and
 * CURRENT PLAN, the price over "/mo", the description, the entitlements as
 * ticks (copy, not a gate — a false one struck through), and a footer the
 * page fills (the free-trial door). The whole card chooses the plan.
 */
export function PlanOption({ plan, selected, current, onSelect, footer }: { plan: CataloguePackage; selected: boolean; current: boolean; onSelect: () => void; footer?: React.ReactNode }) {
    const lines = entitlementLines(plan.entitlements);
    return (
        <div className={cn("flex h-full flex-col rounded-lg border bg-white transition-colors", selected ? "border-brand shadow-card" : "border-line hover:border-ink")}>
            <button type="button" role="radio" aria-checked={selected} onClick={onSelect} className="flex flex-1 flex-col p-5 text-left">
                <span className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-base font-semibold text-ink">{plan.name}</span>
                    <span className="flex gap-1.5">
                        {current && <StatusChip label="Current plan" tone="success" />}
                        {plan.isPopular && <StatusChip label="Popular" tone="danger" />}
                    </span>
                </span>
                <span className="mt-3 flex items-baseline gap-1">
                    <span className={cn("text-[28px] font-semibold tabular-nums", selected ? "text-brand" : "text-ink")}>{planMoney(plan.pricePerMonth)}</span>
                    <span className="text-sm text-dim">/mo</span>
                </span>
                {plan.description && <span className="mt-2 text-sm text-dim">{plan.description}</span>}
                {lines.length > 0 && (
                    <span className="mt-4 grid gap-2">
                        {lines.map((line) => (
                            <span key={line.key} className="flex items-start gap-2 text-sm">
                                {line.granted ? <Check className="mt-0.5 size-3.5 shrink-0 text-success" aria-hidden /> : <X className="mt-0.5 size-3.5 shrink-0 text-dim" aria-hidden />}
                                <span className={line.granted ? "text-ink" : "text-dim line-through"}>{line.label}</span>
                            </span>
                        ))}
                    </span>
                )}
            </button>
            {footer && <div className="px-5 pb-5">{footer}</div>}
        </div>
    );
}

/** Monthly / Annual, the annual segment carrying SAVE <pct>% — only the cycles the policy offers; one cycle draws nothing. */
export function CycleToggle({ value, cycles, savePct, onChange }: { value: BillingCycle; cycles: BillingCycle[]; savePct: number; onChange: (next: BillingCycle) => void }) {
    if (cycles.length < 2) return null;
    return (
        <div role="radiogroup" aria-label="Billing cycle" className="inline-flex h-[38px] items-center rounded-full bg-[#3a3a3d] p-[3px]">
            {cycles.map((cycle) => {
                const active = cycle === value;
                return (
                    <button key={cycle} type="button" role="radio" aria-checked={active} onClick={() => onChange(cycle)} className={cn("flex h-8 items-center gap-2 rounded-full px-4 text-xs font-semibold transition-colors", active ? "bg-white text-ink" : "text-white/85 hover:text-white")}>
                        {cycle === "MONTHLY" ? "Monthly" : "Annual"}
                        {cycle === "ANNUAL" && savePct > 0 && <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-bold", active ? "bg-brand-soft text-brand" : "bg-white/15 text-white")}>SAVE {savePct}%</span>}
                    </button>
                );
            })}
        </div>
    );
}
