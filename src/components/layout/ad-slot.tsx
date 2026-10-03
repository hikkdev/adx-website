"use client";

import * as React from "react";
import Link from "next/link";
import { currentUrl, markPageView, recordClick, useImpression } from "@/lib/promotion-events";
import { cn } from "@/lib/utils";
import { adsOf, pickAd, type ResolvedAd } from "@/services/layouts";

const noSubscribe = () => () => undefined;
/** This page view's number — the same for every slot on the page, the next one on the next page. */
const readView = () => markPageView(currentUrl());
const serverView = () => null;

/**
 * An `ad_slot` block: the ads sold into the slot and running today, one at a
 * time — the next one on the next page view — each labelled "Ad" and
 * opening the buyer's link in a new tab (`rel="sponsored noopener"`). An
 * empty slot draws nothing: no placeholder, no "reserved" box.
 */
export function AdSlotBlock({ props, surface, className }: { props: Record<string, unknown>; surface: string; className?: string }) {
    const ads = React.useMemo(() => adsOf(props.ads), [props.ads]);
    const view = React.useSyncExternalStore(noSubscribe, readView, serverView);
    const ad = view === null ? null : pickAd(ads, view);
    if (!ad) return null;
    return <AdCard key={ad.adBookingId} ad={ad} surface={surface} className={className} />;
}

export function AdCard({ ad, surface, className }: { ad: ResolvedAd; surface: string; className?: string }) {
    const ref = React.useRef<HTMLDivElement>(null);
    useImpression(ref, { adBookingId: ad.adBookingId }, surface);
    const ratio = ad.media.width && ad.media.height ? `${ad.media.width} / ${ad.media.height}` : undefined;
    const body = (
        <>
            <div className="relative overflow-hidden rounded-xl bg-ground" style={ratio ? { aspectRatio: ratio } : undefined}>
                <img src={ad.media.url} alt={ad.media.altText ?? ad.headline ?? "Advertisement"} className="size-full object-cover" loading="lazy" />
                <span className="absolute left-2 top-2 rounded bg-white/95 px-1.5 py-0.5 text-[11px] font-bold uppercase tracking-[0.5px] text-ink shadow-sm">Ad</span>
            </div>
            {(ad.headline || ad.ctaLabel) && (
                <div className="mt-2 flex items-center justify-between gap-3">
                    {ad.headline && <p className="line-clamp-2 text-sm font-semibold text-ink">{ad.headline}</p>}
                    {ad.ctaLabel && ad.targetUrl && <span className="shrink-0 rounded-md border border-ink px-3 py-1.5 text-xs font-semibold text-ink">{ad.ctaLabel}</span>}
                </div>
            )}
        </>
    );
    return (
        <div ref={ref} className={cn("block", className)} data-testid="ad-slot" data-ad={ad.adBookingId}>
            <p className="mb-2 flex items-center justify-between text-xs text-dim">
                <span>Advertisement</span>
                <Link href="/advertise" className="hover:text-ink">
                    Advertise here
                </Link>
            </p>
            {ad.targetUrl ? (
                <a href={ad.targetUrl} target="_blank" rel="sponsored noopener" onClick={() => recordClick({ adBookingId: ad.adBookingId }, surface)} className="block">
                    {body}
                </a>
            ) : (
                body
            )}
        </div>
    );
}
