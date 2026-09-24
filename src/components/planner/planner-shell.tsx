"use client";

import * as React from "react";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";

/** The four steps every campaign screen prints across the top (5204:69607). */
export const BAR_STEPS = ["Campaign brief", "Ad spaces", "Artwork & delivery", "Review & pay"] as const;

export function StepBar({ active }: { active: 1 | 2 | 3 | 4 }) {
    return (
        <div className="rounded-lg border border-line bg-white">
            <ol className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-4">
                {BAR_STEPS.map((label, index) => {
                    const n = (index + 1) as 1 | 2 | 3 | 4;
                    const on = n === active;
                    return (
                        <li key={label} className="flex h-6 min-w-[140px] flex-1 items-center gap-2" aria-current={on ? "step" : undefined}>
                            <span className={cn("flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold", on ? "bg-[#8d0b0c] text-white" : "bg-[#f2f2f4] text-dim")}>{n}</span>
                            <span className={cn("text-xs font-medium", on ? "text-ink" : "text-dim")}>{label}</span>
                        </li>
                    );
                })}
            </ol>
        </div>
    );
}

/**
 * The chrome of every planner and creative screen: the "‹ Campaigns" link,
 * the title with its line, the step bar, then whatever the screen draws.
 */
export function PlannerShell({
    title,
    subtitle,
    bar,
    backHref = "/advertiser",
    backLabel = "Campaigns",
    children,
}: {
    title: string;
    subtitle?: string;
    bar?: 1 | 2 | 3 | 4;
    /** Null draws no "‹ Campaigns" link — the request page (5204:69760) has none. */
    backHref?: string | null;
    backLabel?: string;
    children: React.ReactNode;
}) {
    return (
        <div className="-my-4 flex flex-col gap-6">
            <div className="flex flex-col gap-3">
                {backHref && (
                    <Link href={backHref} className="inline-flex h-5 items-center gap-1 text-sm text-dim hover:text-ink">
                        <ChevronLeft className="size-4" aria-hidden />
                        {backLabel}
                    </Link>
                )}
                <div>
                    <h1 className="text-2xl font-semibold leading-8 tracking-[-0.6px] text-ink">{title}</h1>
                    {subtitle && <p className="mt-1 text-sm text-dim">{subtitle}</p>}
                </div>
            </div>
            {bar && <StepBar active={bar} />}
            {children}
        </div>
    );
}

/** The white task card (5204:69721): 32px sides, the heading and its line, then the controls. */
export function TaskCard({ title, intro, children, className }: { title?: string; intro?: string; children: React.ReactNode; className?: string }) {
    return (
        <section className={cn("rounded-xl border border-[rgba(204,204,204,0.5)] bg-white px-8 pb-7 pt-8", className)}>
            {(title || intro) && (
                <div className="mb-6">
                    {title && <h2 className="text-lg font-semibold leading-6 text-ink">{title}</h2>}
                    {intro && <p className="mt-2 text-sm text-dim">{intro}</p>}
                </div>
            )}
            {children}
        </section>
    );
}

export interface StepAction {
    label: string;
    href?: string;
    onClick?: () => void;
    disabled?: boolean;
    busy?: boolean;
    /** Wider buttons for longer labels ("Continue with selected spaces"). */
    width?: number;
}

/** Back on the left, the primary on the right (5204:69755). Either may be left out. */
export function StepActions({ back, next, children }: { back?: StepAction | null; next?: StepAction | null; children?: React.ReactNode }) {
    return (
        <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
                {back && <ActionButton action={back} kind="secondary" />}
                {children}
            </div>
            {next && <ActionButton action={next} kind="primary" />}
        </div>
    );
}

export function ActionButton({ action, kind }: { action: StepAction; kind: "primary" | "secondary" }) {
    const className = cn(
        "inline-flex h-12 items-center justify-center rounded-md px-4 text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-60",
        kind === "primary" ? "bg-brand text-white hover:bg-[#a51b1b]" : "border border-line bg-white text-ink hover:border-ink"
    );
    const style = { minWidth: action.width ?? (kind === "primary" ? 240 : 100) };
    const label = action.busy ? "Saving…" : action.label;
    if (action.href && !action.onClick && !action.disabled) {
        return (
            <Link href={action.href} className={className} style={style}>
                {label}
            </Link>
        );
    }
    return (
        <button type="button" onClick={action.onClick} disabled={action.disabled || action.busy} className={className} style={style}>
            {label}
        </button>
    );
}

/** A row of the "not available" or "could not save" kind, in the card's own words. */
export function InlineError({ message }: { message: string | null }) {
    if (!message) return null;
    return (
        <p role="alert" className="rounded-md border border-[#f3c9c9] bg-[#fff5f5] px-4 py-3 text-sm text-[#8d0b0c]">
            {message}
        </p>
    );
}

export function LoadingLine({ children = "Loading…" }: { children?: React.ReactNode }) {
    return <p className="text-sm text-dim">{children}</p>;
}
