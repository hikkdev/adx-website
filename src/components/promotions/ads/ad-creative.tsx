"use client";

import * as React from "react";
import { PrivateImage } from "@/components/advertiser/bits";
import { cn } from "@/lib/utils";
import type { MediaSpec } from "@/services/promotions";

/**
 * LM-1: the ad as a visitor will see it — the artwork in the slot's shape,
 * the "Ad" label every paid placement carries, the headline and the button.
 * With no artwork yet, the shape is drawn empty so the proportions show.
 */
export function AdCreative({ src, spec, headline, ctaLabel, targetUrl, alt, className }: { src: string | null; spec: Pick<MediaSpec, "width" | "height"> | null; headline?: string | null; ctaLabel?: string | null; targetUrl?: string | null; alt?: string; className?: string }) {
    const ratio = spec ? `${spec.width} / ${spec.height}` : "4 / 5";
    const wide = spec ? spec.width / spec.height > 2 : false;
    return (
        <figure className={cn("overflow-hidden rounded-lg border border-line bg-white", wide ? "w-full" : "w-full max-w-[300px]", className)} data-testid="ad-creative">
            <div className="relative bg-ground" style={{ aspectRatio: ratio }}>
                {src ? <PrivateImage src={src} alt={alt || headline || "The ad's artwork"} className="absolute inset-0 size-full object-cover" /> : <div className="absolute inset-0 flex items-center justify-center text-xs text-dim">No artwork yet</div>}
                <span className="absolute left-2 top-2 rounded bg-white/95 px-1.5 py-0.5 text-[11px] font-semibold text-ink shadow-sm">Ad</span>
            </div>
            {(headline?.trim() || ctaLabel?.trim()) && (
                <figcaption className="flex items-center justify-between gap-3 p-3">
                    <span className="min-w-0 text-sm font-medium text-ink">{headline?.trim()}</span>
                    {ctaLabel?.trim() && (
                        <span className="inline-flex h-8 shrink-0 items-center rounded-md bg-ink px-3 text-xs font-semibold text-white" title={targetUrl ?? undefined}>
                            {ctaLabel.trim()}
                        </span>
                    )}
                </figcaption>
            )}
        </figure>
    );
}
