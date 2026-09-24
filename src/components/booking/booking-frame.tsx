"use client";

import * as React from "react";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { STEP_ROUTES } from "@/services/booking";

/**
 * The chrome every booking step shares (5204:62521 and its siblings): the
 * "‹ Campaigns" back link, the campaign's name with the account and its
 * state under it, then the four-step stepper — 1 Campaign brief · 2 Ad
 * spaces · 3 Artwork & delivery · 4 Review & pay — drawn on every step.
 */
export function BookingHeader({ back, title, subtitle }: { back?: { href: string; label: string } | null; title: string; subtitle?: string }) {
    return (
        <div>
            {back && (
                <Link href={back.href} className="inline-flex items-center gap-1 text-sm text-dim hover:text-ink">
                    <ChevronLeft className="size-4" aria-hidden />
                    {back.label}
                </Link>
            )}
            <h1 className={cn("text-2xl font-semibold tracking-tight text-ink", back && "mt-3")}>{title}</h1>
            {subtitle && <p className="mt-1.5 text-sm text-dim">{subtitle}</p>}
        </div>
    );
}

const STEPS = ["Campaign brief", "Ad spaces", "Artwork & delivery", "Review & pay"] as const;

export function BookingStepper({ current, campaignId, className }: { current: 1 | 2 | 3 | 4; campaignId?: string; className?: string }) {
    return (
        <ol className={cn("grid grid-cols-4 rounded-lg border border-line bg-white px-4 shadow-card", className)} aria-label="Booking steps">
            {STEPS.map((label, index) => {
                const step = (index + 1) as 1 | 2 | 3 | 4;
                const active = step === current;
                const inner = (
                    <>
                        <span className={cn("flex size-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold", active ? "bg-brand text-white" : "bg-ground text-dim")}>{step}</span>
                        <span className={cn("truncate text-xs", active ? "font-medium text-ink" : "text-dim")}>{label}</span>
                    </>
                );
                return (
                    <li key={label} className="flex h-14 items-center" aria-current={active ? "step" : undefined}>
                        {campaignId ? (
                            <Link href={`/advertiser/campaigns/${encodeURIComponent(campaignId)}/${STEP_ROUTES[index]}`} className="flex min-w-0 items-center gap-2.5 rounded-md py-2 pr-3 hover:bg-ground">
                                {inner}
                            </Link>
                        ) : (
                            <span className="flex min-w-0 items-center gap-2.5 py-2 pr-3">{inner}</span>
                        )}
                    </li>
                );
            })}
        </ol>
    );
}

/** A white card on the workspace ground, the way every step draws its content. */
export function BookingCard({ children, className, title, description }: { children?: React.ReactNode; className?: string; title?: string; description?: React.ReactNode }) {
    return (
        <section className={cn("rounded-lg border border-line bg-white p-6 shadow-card", className)}>
            {title && <h2 className="text-base font-semibold text-ink">{title}</h2>}
            {description && <p className="mt-1.5 text-sm text-dim">{description}</p>}
            {children}
        </section>
    );
}

/** Back on the left, the primary on the right — the row under every step's card. */
export function StepFooter({ back, next, children, className }: { back?: { href?: string; label: string; onClick?: () => void } | null; next?: { label: string; onClick?: () => void; href?: string; disabled?: boolean; busy?: boolean } | null; children?: React.ReactNode; className?: string }) {
    return (
        <div className={cn("flex flex-wrap items-center justify-between gap-3", className)}>
            <div className="flex items-center gap-3">
                {back &&
                    (back.href ? (
                        <Link href={back.href} className={secondaryButton}>
                            {back.label}
                        </Link>
                    ) : (
                        <button type="button" onClick={back.onClick} className={secondaryButton}>
                            {back.label}
                        </button>
                    ))}
                {children}
            </div>
            {next &&
                (next.href && !next.disabled ? (
                    <Link href={next.href} className={primaryButton}>
                        {next.label}
                    </Link>
                ) : (
                    <button type="button" onClick={next.onClick} disabled={next.disabled || next.busy} className={primaryButton}>
                        {next.busy ? "Please wait…" : next.label}
                    </button>
                ))}
        </div>
    );
}

export const primaryButton = "inline-flex h-12 items-center justify-center rounded-md bg-brand px-8 text-sm font-semibold text-white hover:bg-[#a51b1b] disabled:cursor-not-allowed disabled:opacity-50";
export const secondaryButton = "inline-flex h-12 items-center justify-center rounded-md border border-line bg-white px-6 text-sm font-medium text-ink hover:border-ink disabled:cursor-not-allowed disabled:opacity-50";
export const smallButton = "inline-flex h-9 items-center justify-center rounded-md border border-line bg-white px-3.5 text-sm font-medium text-ink hover:border-ink disabled:cursor-not-allowed disabled:opacity-50";

/** Label on the left, value on the right — the review's two-column facts. */
export function KeyRows({ rows, className, labelWidth = "w-[150px]" }: { rows: { label: string; value: React.ReactNode; muted?: boolean }[]; className?: string; labelWidth?: string }) {
    return (
        <dl className={cn("space-y-2", className)}>
            {rows.map((row) => (
                <div key={row.label} className="flex gap-4 text-sm">
                    <dt className={cn("shrink-0 text-dim", labelWidth)}>{row.label}</dt>
                    <dd className={cn("min-w-0", row.muted ? "text-dim" : "text-ink")}>{row.value}</dd>
                </div>
            ))}
        </dl>
    );
}

/** The grey facts block on the payment pages: PAYMENT REFERENCE … on the left, the value on the right. */
export function FactRows({ rows }: { rows: { label: string; value: React.ReactNode }[] }) {
    return (
        <dl className="space-y-1.5">
            {rows.map((row) => (
                <div key={row.label} className="flex items-center justify-between gap-4 rounded-md bg-ground px-3 py-3">
                    <dt className="text-xs uppercase tracking-wide text-dim">{row.label}</dt>
                    <dd className="text-sm font-semibold text-ink">{row.value}</dd>
                </div>
            ))}
        </dl>
    );
}

/** A section's "Edit" with the pencil, the way the review draws it. */
export function EditLink({ href, onClick, label = "Edit" }: { href?: string; onClick?: () => void; label?: string }) {
    const inner = (
        <>
            <span className="underline underline-offset-2">{label}</span>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
                <path d="M11.3 2.7a1.5 1.5 0 0 1 2.1 2.1L6 12.2l-2.8.7.7-2.8 7.4-7.4Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
                <path d="M2 14h12" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
            </svg>
        </>
    );
    const className = "inline-flex items-center gap-1.5 text-sm text-dim hover:text-ink";
    return href ? (
        <Link href={href} className={className}>
            {inner}
        </Link>
    ) : (
        <button type="button" onClick={onClick} className={className}>
            {inner}
        </button>
    );
}

export function ErrorNote({ message, className }: { message: string | null; className?: string }) {
    if (!message) return null;
    return (
        <p role="alert" className={cn("rounded-md border border-[#f3c1c1] bg-[#fdf2f2] px-3 py-2 text-sm text-[#b42318]", className)}>
            {message}
        </p>
    );
}
