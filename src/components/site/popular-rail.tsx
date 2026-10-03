"use client";

import * as React from "react";
import Link from "next/link";
import { ChevronRight, LocateFixed } from "lucide-react";
import { Rail } from "@/components/site/rail";
import { SpaceCard } from "@/components/site/space-card";
import { useAuth } from "@/lib/auth";
import { useCart } from "@/lib/cart";
import { browseService, scansOf, type BrowseCard, type BrowseQuery } from "@/services/browse";

/**
 * "Popular near you" — the app's explore home row: the six best-rated live
 * spaces for the place (`sort=RATING`), around the browser's position when
 * "Near me" is on, else in the city being browsed, else across India — and
 * the heading says which. The web never asks for a location on its own;
 * the row offers "Use my location" instead.
 */
export function PopularRail({ city, near, onUseLocation, className, title: override }: { city: string; near: BrowseQuery["near"]; onUseLocation?: () => void; className?: string; /** LM-1: the layout's title for the row. */ title?: string | null }) {
    const key = JSON.stringify({ city, near });
    const [answer, setAnswer] = React.useState<{ key: string; items: BrowseCard[] } | null>(null);

    React.useEffect(() => {
        let cancelled = false;
        const place: BrowseQuery = near ? { near } : city ? { city } : {};
        browseService
            .browse({ ...place, sort: "RATING", pageSize: 6 })
            .then((page) => !cancelled && setAnswer({ key, items: page.items }))
            .catch(() => !cancelled && setAnswer({ key, items: [] }));
        return () => {
            cancelled = true;
        };
    }, [key, city, near]);

    const items = answer?.key === key ? answer.items : null;
    if (items !== null && items.length === 0) return null;
    const title = override ?? (near ? "Popular near you" : city ? `Popular in ${city}` : "Popular on ADX");

    return (
        <div className={className}>
            <Rail title={title} titleClassName="text-2xl font-bold tracking-tight">
                {items === null
                    ? Array.from({ length: 4 }).map((_, index) => <div key={index} className="h-[356px] w-[300px] shrink-0 animate-pulse rounded-[14px] border border-line bg-white" />)
                    : items.map((card) => (
                          <div key={card.id} className="w-[300px] shrink-0 snap-start">
                              <SpaceCard card={card} />
                          </div>
                      ))}
            </Rail>
            <p className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-dim">
                <span>The best-rated live spaces{near ? " within " + (near.radiusKm ?? 15) + " km" : city ? ` in ${city}` : ""}.</span>
                {!near && onUseLocation && (
                    <button type="button" onClick={onUseLocation} className="inline-flex items-center gap-1.5 font-medium text-ink underline underline-offset-2 hover:text-brand">
                        <LocateFixed className="size-4" aria-hidden />
                        Use my location
                    </button>
                )}
            </p>
        </div>
    );
}

/**
 * The strip under the app's explore home: how many campaigns are live and
 * how many scans the month has brought (owner decision 106 — the API's own
 * figure, labelled scans), and what is waiting in the cart. Signed-in
 * advertisers only; a read that fails costs its line, not the strip.
 */
export function CampaignStrip({ className }: { className?: string }) {
    const { status, parties } = useAuth();
    const { lines } = useCart();
    const advertiser = status === "signed-in" && parties.includes("ADVERTISER");
    const [figures, setFigures] = React.useState<{ live: number | null; scans: number | null } | null>(null);

    React.useEffect(() => {
        if (!advertiser) return;
        let cancelled = false;
        Promise.all([
            browseService
                .liveCampaigns()
                .then((page) => (typeof page.total === "number" ? page.total : page.items.length))
                .catch(() => null),
            browseService
                .portfolio(new Date().getDate())
                .then(scansOf)
                .catch(() => null),
        ]).then(([live, scans]) => !cancelled && setFigures({ live, scans }));
        return () => {
            cancelled = true;
        };
    }, [advertiser]);

    if (!advertiser) return null;
    return (
        <Link href="/advertiser" className={`flex items-center gap-4 rounded-xl bg-[#243039] px-5 py-3.5 text-white hover:bg-[#1c262e] ${className ?? ""}`} data-testid="campaign-strip">
            <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">{figures?.live == null ? "Your campaigns" : `${figures.live} campaign${figures.live === 1 ? "" : "s"} live`}</p>
                <p className="text-sm text-[#bcbdbe]">
                    {figures?.scans == null ? "Bookings, creatives and what each one did" : `${figures.scans.toLocaleString("en-IN")} scan${figures.scans === 1 ? "" : "s"} this month`}
                    {lines.length > 0 && ` · ${lines.length} space${lines.length === 1 ? "" : "s"} waiting in your next campaign`}
                </p>
            </div>
            <ChevronRight className="size-5 shrink-0 text-[#bcbdbe]" aria-hidden />
        </Link>
    );
}
