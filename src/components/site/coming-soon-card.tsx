"use client";

import * as React from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { comingSoonCopy, geoService, stageLabel, waitlistOutcome, type WaitlistSide } from "@/services/browse";

/**
 * "Coming soon in <city>" — drawn where the spaces would be when the city
 * searched is catalogued but not open for bookings (the browse answers
 * `comingSoon: { city, slug, stage }`), instead of "no matching spaces",
 * which would be untrue of a city with fifty listings waiting for launch
 * day. The app's `ComingSoonCard`: the stage as the eyebrow, what it means,
 * and "Notify me" → `POST /app/geo/waitlist { citySlug, side }`, which
 * takes the name and number from the caller's own account — so a visitor
 * is asked to sign in first and brought back here.
 */
export function ComingSoonCard({
    city,
    side = "ADVERTISER",
    onLive,
    className,
}: {
    city: { city: string; slug: string; stage: string };
    side?: WaitlistSide;
    /** `409 ALREADY_LIVE`: the city launched since the page was read — read it again. */
    onLive?: () => void;
    className?: string;
}) {
    const { status } = useAuth();
    const [busy, setBusy] = React.useState(false);
    const [outcome, setOutcome] = React.useState<{ tone: "ok" | "no"; text: string } | null>(null);
    const copy = comingSoonCopy(city.city, city.stage);

    const notify = async () => {
        setBusy(true);
        try {
            const answer = await geoService.joinWaitlist(city.slug, side);
            setOutcome({ tone: "ok", text: `We'll tell you when ${answer.city || city.city} launches.` });
        } catch (caught) {
            const result = waitlistOutcome(caught, city.city);
            setOutcome({ tone: result.tone, text: result.text });
            if (result.live) onLive?.();
        } finally {
            setBusy(false);
        }
    };

    const next = typeof window === "undefined" ? "/spaces" : window.location.pathname + window.location.search;

    return (
        <div className={cn("rounded-2xl border border-line bg-info-soft px-8 py-10 text-center shadow-card", className)} data-testid="coming-soon">
            <p className="text-xs font-bold uppercase tracking-[0.8px] text-info">{stageLabel(city.stage)}</p>
            <p className="mt-2 text-xl font-semibold text-ink">{copy.title}</p>
            <p className="mx-auto mt-2 max-w-md text-sm text-dim">{copy.body}</p>
            {copy.closed ? null : outcome ? (
                <p className={cn("mt-5 text-sm font-medium", outcome.tone === "ok" ? "text-success" : "text-dim")} role="status">
                    {outcome.text}
                </p>
            ) : status === "signed-in" ? (
                <button type="button" onClick={() => void notify()} disabled={busy} className="mt-6 rounded-[11px] bg-brand px-6 py-3 text-sm font-semibold text-white hover:bg-[#a51b1b] disabled:opacity-60">
                    {busy ? "Adding you…" : "Notify me"}
                </button>
            ) : (
                <div className="mt-6">
                    <Link href={`/sign-in?next=${encodeURIComponent(next)}`} className="inline-block rounded-[11px] bg-brand px-6 py-3 text-sm font-semibold text-white hover:bg-[#a51b1b]">
                        Sign in to be told when it opens
                    </Link>
                    <p className="mt-2 text-xs text-dim">ADX tells you on the number and email on your account.</p>
                </div>
            )}
        </div>
    );
}
