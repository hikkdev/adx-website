"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { ctaStripOf, targetHref, type CtaTone } from "@/services/layouts";
import { TargetLink } from "./target-link";

const TONE: Record<CtaTone, { band: string; button: string }> = {
    BRAND: { band: "bg-brand text-white", button: "bg-white text-ink hover:bg-ground" },
    INK: { band: "bg-ink text-white", button: "bg-white text-ink hover:bg-ground" },
    PAPER: { band: "bg-paper text-ink", button: "bg-brand text-white hover:bg-[#a51b1b]" },
};

/** PB-4 · `cta_strip`: a band across the page with one thing to do — in the brand red, in ink, or on paper. */
export function CtaStripBlock({ props }: { props: Record<string, unknown> }) {
    const strip = ctaStripOf(props);
    if (!strip) return null;
    const tone = TONE[strip.tone];
    return (
        <section data-testid="cta-strip" className={cn("flex flex-col items-start gap-6 rounded-2xl px-6 py-10 sm:flex-row sm:items-center sm:justify-between sm:px-10", tone.band)}>
            <div className="min-w-0">
                <p className="text-2xl font-bold leading-tight tracking-tight sm:text-[32px] sm:leading-10">{strip.headline}</p>
                {strip.body && <p className="mt-2 max-w-[640px] text-base leading-6 opacity-90">{strip.body}</p>}
            </div>
            {targetHref(strip.target) && (
                <TargetLink target={strip.target} className={cn("inline-flex h-12 shrink-0 items-center justify-center rounded-[8px] px-6 text-sm font-semibold transition-colors", tone.button)}>
                    {strip.ctaLabel}
                </TargetLink>
            )}
        </section>
    );
}
