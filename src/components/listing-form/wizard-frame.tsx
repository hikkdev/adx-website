"use client";

import * as React from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { CHAPTERS } from "./form-model";

/**
 * The listing task's chrome (5204:75982): the breadcrumb, "Save and exit",
 * the four chapters with the current one in red, the white task card and
 * the two buttons under it. The edit pages (board 09) use the same card
 * without the chapters.
 */
export function ListingChrome({
    crumb,
    chapter,
    onSaveAndExit,
    saving,
    children,
}: {
    crumb: React.ReactNode;
    chapter: number | null;
    onSaveAndExit?: () => void;
    saving?: boolean;
    children: React.ReactNode;
}) {
    return (
        <div className="mx-auto w-full max-w-[1384px]">
            <div className="flex items-center justify-between gap-4">
                <p className="text-sm text-dim">
                    <Link href="/publisher/inventory" className="hover:text-ink">
                        My inventory
                    </Link>
                    <span className="mx-2">/</span>
                    <span>{crumb}</span>
                </p>
                {onSaveAndExit && (
                    <button type="button" onClick={onSaveAndExit} disabled={saving} className="inline-flex h-10 items-center rounded-md border border-line bg-white px-5 text-sm font-semibold text-ink shadow-sm hover:border-ink disabled:opacity-60">
                        {saving ? "Saving…" : "Save and exit"}
                    </button>
                )}
            </div>
            {chapter !== null && (
                <ol className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-4" aria-label="Chapters">
                    {CHAPTERS.map((c) => (
                        <li key={c.n} className={cn("text-sm", c.n === chapter ? "font-medium text-brand-bright" : "text-dim")} aria-current={c.n === chapter ? "step" : undefined}>
                            <span className="mr-2">{c.n}</span>
                            {c.label}
                        </li>
                    ))}
                </ol>
            )}
            <div className={chapter !== null ? "mt-4" : "mt-6"}>{children}</div>
        </div>
    );
}

/** The white task card: a 24px title, an optional line under it, then the step's controls. */
export function TaskCard({ title, subtitle, children, className }: { title: string; subtitle?: React.ReactNode; children: React.ReactNode; className?: string }) {
    return (
        <section className={cn("rounded-xl border border-line bg-white px-9 py-8", className)}>
            <h1 className="text-2xl font-semibold tracking-tight text-ink">{title}</h1>
            {subtitle && <p className="mt-2 text-sm text-dim">{subtitle}</p>}
            <div className="mt-6">{children}</div>
        </section>
    );
}

/** Back at the left, the red action at the right (5204:76531). */
export function StepActions({
    back,
    onBack,
    primary,
    onPrimary,
    primaryDisabled,
    busy,
    secondary,
    onSecondary,
    primaryHref,
    backHref,
    className,
}: {
    back?: string | null;
    onBack?: () => void;
    backHref?: string;
    primary: string;
    onPrimary?: () => void;
    primaryHref?: string;
    primaryDisabled?: boolean;
    busy?: boolean;
    secondary?: string;
    onSecondary?: () => void;
    className?: string;
}) {
    const backClass = "inline-flex h-[50px] min-w-[160px] items-center justify-center rounded-md border border-line bg-white px-6 text-sm font-semibold text-ink shadow-sm hover:border-ink";
    const primaryClass = cn("inline-flex h-[50px] min-w-[160px] items-center justify-center rounded-md px-6 text-sm font-semibold text-white transition-colors", primaryDisabled || busy ? "cursor-not-allowed bg-[#e3e3e6] text-dim" : "bg-brand hover:bg-brand/90");
    return (
        <div className={cn("mt-6 flex flex-wrap items-center justify-between gap-4", className)}>
            <div className="flex items-center gap-3">
                {back && (backHref ? (
                    <Link href={backHref} className={backClass}>
                        {back}
                    </Link>
                ) : (
                    <button type="button" onClick={onBack} className={backClass}>
                        {back}
                    </button>
                ))}
                {secondary && (
                    <button type="button" onClick={onSecondary} className={backClass}>
                        {secondary}
                    </button>
                )}
            </div>
            {primaryHref && !primaryDisabled ? (
                <Link href={primaryHref} className={primaryClass}>
                    {primary}
                </Link>
            ) : (
                <button type="button" onClick={onPrimary} disabled={primaryDisabled || busy} className={primaryClass} aria-disabled={primaryDisabled || busy}>
                    {busy ? "Working…" : primary}
                </button>
            )}
        </div>
    );
}

/** The red-on-white format line under a task title: "Standard hoarding". */
export function SelectedFormat({ children }: { children: React.ReactNode }) {
    return <p className="text-sm font-medium text-brand-bright">{children}</p>;
}
