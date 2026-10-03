"use client";

import * as React from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { targetHref, type Target } from "@/services/layouts";

/**
 * Where a block's target goes: a site link, an outside link in a new tab,
 * or — when the target goes nowhere safe — a plain box, so the words still
 * show. PB-1: a PAGE target is the page's current address.
 */
export function TargetLink({ target, className, children, label }: { target: Target | null; className?: string; children: React.ReactNode; label?: string }) {
    const to = targetHref(target);
    if (!to) return <div className={className}>{children}</div>;
    if (to.external)
        return (
            <a href={to.href} target="_blank" rel="noopener" className={className} aria-label={label}>
                {children}
            </a>
        );
    return (
        <Link href={to.href} className={className} aria-label={label}>
            {children}
        </Link>
    );
}

export const BUTTON_PRIMARY = "inline-flex h-12 items-center justify-center rounded-[8px] bg-brand px-6 text-sm font-semibold text-white transition-colors hover:bg-[#a51b1b]";
export const BUTTON_SECONDARY = "inline-flex h-12 items-center justify-center rounded-[8px] border border-ink bg-white px-6 text-sm font-semibold text-ink transition-colors hover:bg-ground";

/** A call-to-action button — drawn only when its target goes somewhere. */
export function CtaButton({ label, target, style = "PRIMARY", className }: { label: string; target: Target | null; style?: "PRIMARY" | "SECONDARY"; className?: string }) {
    if (!targetHref(target)) return null;
    return (
        <TargetLink target={target} className={cn(style === "PRIMARY" ? BUTTON_PRIMARY : BUTTON_SECONDARY, className)}>
            {label}
        </TargetLink>
    );
}
