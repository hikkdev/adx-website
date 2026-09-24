"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { SelectButton } from "@/components/planner/fields";
import { InlineError, StepActions, TaskCard } from "@/components/planner/planner-shell";
import type { StepProps } from "@/components/planner/planner-step";
import { messageOf } from "@/lib/api-client";
import { rupees } from "@/services/browse";
import { formatDate, joinNames, mediaSubtotal, PERSONAS, perWeek, plannerHref, plannerService, STEP_META, targetSummary, type InventoryMatch } from "@/services/planner";

/** The chip on a shortlist card: the venue or media type, as the frame prints "BILLBOARD" / "MALL". */
function chipOf(match: InventoryMatch): string {
    const word = match.venueTypeName || match.mediaTypeName || match.mediaTypeCategory || "SPACE";
    return word.split(/[/—–-]/)[0]!.trim().toUpperCase().slice(0, 18);
}

/** "40 × 20 ft · Static print" / "24 × 14 ft · Digital screen" — the format line under the chip. */
function formatLine(match: InventoryMatch): string {
    const digital = /digital|led|screen/i.test(match.mediaTypeName ?? "") || match.mediaTypeCategory === "MEDIA";
    const kind = digital ? "Digital screen" : "Static print";
    /* The backend prints "24×14 ft"; the frame spaces the sign. */
    const size = match.size?.replace(/\s*[×x]\s*/i, " × ");
    return size ? `${size} · ${kind}` : kind;
}

function areaOf(match: InventoryMatch): string {
    return match.address?.split(",")[0]?.trim() || match.city || "";
}

/**
 * 07 · Choose ad spaces (5204:71746): the brief's own shortlist
 * (`GET /campaigns/:id/inventory`), two cards to a row, each added or
 * removed with one press; the chosen ones go on the campaign
 * (`PUT /campaigns/:id/spots`) with "Continue with selected spaces".
 */
export function SpacesStep({ campaign, replace }: StepProps) {
    const router = useRouter();
    const [result, setResult] = React.useState<{ key: string; rows: InventoryMatch[] | null; error: string | null }>({ key: "", rows: null, error: null });
    const [selected, setSelected] = React.useState<Map<string, InventoryMatch>>(() => {
        const held = new Map<string, InventoryMatch>();
        for (const spot of campaign.spots) {
            if (spot.status === "CANCELLED") continue;
            held.set(spot.listingId, {
                listingId: spot.listingId,
                title: spot.listing.title,
                city: spot.listing.city,
                address: spot.listing.address,
                photoUrl: spot.listing.photos[0]?.url ?? null,
                mediaTypeName: spot.listing.mediaType?.name ?? null,
                mediaTypeCategory: spot.listing.mediaType?.category ?? null,
                venueTypeName: null,
                size: spot.listing.widthFt && spot.listing.heightFt ? `${Math.round(Number(spot.listing.widthFt))} × ${Math.round(Number(spot.listing.heightFt))} ft` : null,
                ratePerDay: spot.ratePerDay,
                lineTotal: spot.lineTotal,
                distanceMeters: null,
                estimatedDailyFootfall: spot.listing.estimatedDailyFootfall,
                matchScore: spot.matchScore ?? 0,
                reasons: [],
                clashes: false,
            });
        }
        return held;
    });
    const [busy, setBusy] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);

    React.useEffect(() => {
        let cancelled = false;
        plannerService
            .inventory(campaign.id, { sort: "BEST_MATCH", limit: 50 })
            .then((rows) => {
                if (!cancelled) setResult({ key: campaign.id, rows, error: null });
            })
            .catch((caught: unknown) => {
                if (!cancelled) setResult({ key: campaign.id, rows: null, error: messageOf(caught, "Could not read the matching spaces.") });
            });
        return () => {
            cancelled = true;
        };
    }, [campaign.id]);

    /* The shortlist leaves out what the campaign already holds; draw those first, marked selected. */
    const held = [...selected.values()].filter((match) => !(result.rows ?? []).some((row) => row.listingId === match.listingId));
    const rows = [...held, ...(result.rows ?? [])];
    const chosen = [...selected.values()];
    const subtotal = mediaSubtotal(chosen);
    const persona = PERSONAS.find((p) => p.id === campaign.persona)?.title ?? "Audience not set";

    const toggle = (match: InventoryMatch) => {
        setSelected((current) => {
            const next = new Map(current);
            if (next.has(match.listingId)) next.delete(match.listingId);
            else next.set(match.listingId, match);
            return next;
        });
    };

    const submit = async () => {
        if (chosen.length === 0 || busy) return;
        setBusy(true);
        setError(null);
        try {
            const next = await plannerService.setSpots(
                campaign.id,
                chosen.map((match) => ({ listingId: match.listingId, matchScore: Math.round(match.matchScore) || null }))
            );
            replace(next);
            await plannerService.patch(campaign.id, { step: STEP_META.spaces.appStep }).catch(() => undefined);
            router.push(plannerHref(campaign.id, "tracking"));
        } catch (caught) {
            setError(messageOf(caught, "Could not hold those spaces on the campaign."));
            setBusy(false);
        }
    };

    return (
        <>
            <TaskCard title="Choose your ad spaces" intro="Compare the format, artwork requirements and rates before you continue.">
                <div className="rounded-lg bg-ground px-4 py-4">
                    <div className="flex items-center justify-between gap-4">
                        <p className="text-sm font-semibold text-ink">{targetSummary(campaign)}</p>
                        <Link href={plannerHref(campaign.id, "location")} className="text-sm font-medium text-ink underline underline-offset-2 hover:text-brand">
                            Edit targeting
                        </Link>
                    </div>
                    <p className="mt-2 text-sm text-dim">
                        {formatDate(campaign.startDate)} <span className="mx-1">—</span> {formatDate(campaign.endDate)} <span className="mx-1">·</span> {persona}
                    </p>
                </div>

                {result.rows === null && !result.error && <p className="mt-6 text-sm text-dim">Matching spaces to your brief…</p>}
                {result.error && (
                    <div className="mt-6">
                        <InlineError message={result.error} />
                    </div>
                )}
                {result.rows && rows.length === 0 && (
                    <div className="mt-6 rounded-lg border border-line px-5 py-6">
                        <p className="text-sm font-medium text-ink">No space matches this brief yet</p>
                        <p className="mt-1 text-sm text-dim">Widen the radius or choose another market, or browse every space and add from there.</p>
                        <Link href="/spaces" className="mt-3 inline-block text-sm font-semibold text-brand">
                            Explore ad spaces ↗
                        </Link>
                    </div>
                )}

                {rows.length > 0 && (
                    <ul className="mt-6 grid gap-6 xl:grid-cols-2">
                        {rows.map((match) => {
                            const on = selected.has(match.listingId);
                            return (
                                <li key={match.listingId} className="rounded-xl border border-line bg-white p-2.5 shadow-card">
                                    <div className="relative h-[210px] overflow-hidden rounded-lg bg-[#f1f1ee]">
                                        {match.photoUrl ? <img src={match.photoUrl} alt={match.title} className="size-full object-cover" loading="lazy" /> : <div className="flex size-full items-center justify-center text-sm text-dim">No photo yet</div>}
                                        {match.matchScore > 0 && <span className="absolute left-3 top-3 rounded-full bg-white/95 px-2.5 py-1 text-xs font-semibold text-ink">{Math.round(match.matchScore)}% match</span>}
                                        {match.clashes && <span className="absolute right-3 top-3 rounded-full bg-[#fff5f5] px-2.5 py-1 text-xs font-semibold text-[#8d0b0c]">No slot left on these dates</span>}
                                    </div>
                                    <div className="px-2.5 pb-2 pt-3.5">
                                        <p className="text-sm font-semibold text-ink">{match.title}</p>
                                        <div className="mt-2 flex items-center gap-2">
                                            <span className="rounded bg-brand-soft px-2 py-1 text-xs font-semibold text-brand-bright">{chipOf(match)}</span>
                                            <span className="text-xs text-dim">{areaOf(match)}</span>
                                        </div>
                                        <p className="mt-2.5 text-xs text-dim">{formatLine(match)}</p>
                                        <div className="mt-2.5 flex items-center justify-between">
                                            <p className="text-base font-semibold text-ink">{perWeek(match.ratePerDay)}</p>
                                            <SelectButton selected={on} title={match.title} onClick={() => toggle(match)} />
                                        </div>
                                        <Link href={`/spaces/${encodeURIComponent(match.listingId)}`} className="mt-2.5 inline-block text-xs font-medium text-ink underline underline-offset-2 hover:text-brand">
                                            View full listing
                                        </Link>
                                    </div>
                                </li>
                            );
                        })}
                    </ul>
                )}

                <div className="mt-6 rounded-lg bg-ground px-5 py-5">
                    <div className="flex items-center justify-between gap-4">
                        <p className="text-lg font-semibold text-ink">
                            {chosen.length} space{chosen.length === 1 ? "" : "s"} selected
                        </p>
                        <p className="text-lg font-semibold tabular-nums text-ink">{rupees(subtotal)}</p>
                    </div>
                    <p className="mt-2 text-sm text-dim">{chosen.length ? joinNames(chosen.map((m) => m.title)) : "Select at least one space to continue."}</p>
                    <p className="mt-2 text-sm text-dim">
                        Campaign budget <span className="font-semibold text-ink">{campaign.budget ? rupees(campaign.budget) : "—"}</span> · Media subtotal above; production and tax follow at review.
                        {campaign.budget && subtotal > Number(campaign.budget) && <span className="text-[#8d0b0c]"> The selection is over the budget.</span>}
                    </p>
                </div>
                {error && (
                    <div className="mt-4">
                        <InlineError message={error} />
                    </div>
                )}
            </TaskCard>
            <StepActions
                back={{ label: "Back", href: plannerHref(campaign.id, "budget") }}
                next={{ label: STEP_META.spaces.continueLabel, onClick: submit, disabled: chosen.length === 0, busy, width: 300 }}
            />
        </>
    );
}
