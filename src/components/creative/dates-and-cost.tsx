"use client";

import * as React from "react";
import type { CreativeProps } from "@/components/creative/creative-screen";
import { DateField } from "@/components/planner/fields";
import { InlineError, StepActions, TaskCard } from "@/components/planner/planner-shell";
import { messageOf } from "@/lib/api-client";
import { rupees } from "@/services/browse";
import { flightDays, isoDate, isoToday, plannerService, type CampaignReview } from "@/services/planner";

/** The frame's cost rows off the review: media, each fee by its label, GST, the total. */
export function costRows(review: CampaignReview): { label: string; amount: string; strong?: boolean }[] {
    const fees = new Map<string, number>();
    for (const line of review.lines) for (const fee of line.fees) fees.set(fee.label, (fees.get(fee.label) ?? 0) + Number(fee.amount));
    const taxed = Number(review.spotsSubtotal) + Number(review.feesTotal) - Number(review.discount || 0);
    const rate = taxed > 0 ? Math.round((Number(review.gstAmount) / taxed) * 100) : null;
    const rows: { label: string; amount: string; strong?: boolean }[] = [{ label: "Media rent", amount: rupees(review.spotsSubtotal) }];
    for (const [label, amount] of fees) rows.push({ label, amount: rupees(amount) });
    if (fees.size === 0 && Number(review.feesTotal) > 0) rows.push({ label: "Print, installation & platform fee", amount: rupees(review.feesTotal) });
    if (Number(review.discount) > 0) rows.push({ label: "Discount", amount: `−${rupees(review.discount)}` });
    rows.push({ label: rate ? `GST (${rate}%)` : "GST", amount: rupees(review.gstAmount) });
    rows.push({ label: "Total including GST", amount: rupees(review.total), strong: true });
    return rows;
}

/**
 * 06 · Dates and cost (5204:69454): the flight's two dates, and what the
 * selected spaces cost over them — `GET /campaigns/:id/review`, re-read
 * after every change. A changed date is saved at once (`PATCH`), and the
 * spots are re-rated for the new length (`PUT …/spots` with the same
 * spaces), so the cost on screen is the cost the booking will hold.
 */
export function DatesAndCost({ campaign, save, replace, returnHref }: CreativeProps) {
    const [from, setFrom] = React.useState(isoDate(campaign.startDate) || isoToday(7));
    const [to, setTo] = React.useState(isoDate(campaign.endDate) || isoToday(20));
    const [review, setReview] = React.useState<{ key: string; value: CampaignReview | null; error: string | null }>({ key: "", value: null, error: null });
    const [saving, setSaving] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);
    const spots = campaign.spots.filter((spot) => spot.status !== "CANCELLED");
    const key = `${campaign.id}:${isoDate(campaign.startDate)}:${isoDate(campaign.endDate)}:${spots.map((s) => s.listingId).join(",")}`;

    React.useEffect(() => {
        let cancelled = false;
        plannerService
            .review(campaign.id)
            .then((value) => {
                if (!cancelled) setReview({ key, value, error: null });
            })
            .catch((caught: unknown) => {
                if (!cancelled) setReview({ key, value: null, error: messageOf(caught, "Could not price these dates.") });
            });
        return () => {
            cancelled = true;
        };
    }, [campaign.id, key]);

    const apply = async (nextFrom: string, nextTo: string) => {
        setFrom(nextFrom);
        setTo(nextTo);
        if (!nextFrom || !nextTo || nextTo < nextFrom) return;
        setSaving(true);
        setError(null);
        try {
            await save({ startDate: nextFrom, endDate: nextTo });
            if (spots.length > 0) {
                const rerated = await plannerService.setSpots(
                    campaign.id,
                    spots.map((spot) => ({ listingId: spot.listingId, quantity: spot.quantity, matchScore: spot.matchScore }))
                );
                replace(rerated);
            }
        } catch (caught) {
            setError(messageOf(caught, "Could not save these dates."));
        } finally {
            setSaving(false);
        }
    };

    const days = flightDays(from, to);
    const current = review.key === key ? review.value : null;
    const locked = campaign.status !== "DRAFT";

    return (
        <>
            <TaskCard title="Dates and cost" intro="The same schedule applies to the selected spaces.">
                <div className="grid gap-5 md:grid-cols-2">
                    <DateField label="Start date" value={from} onChange={(iso) => void apply(iso, iso > to ? iso : to)} min={isoToday()} disabled={locked} />
                    <DateField label="End date" value={to} onChange={(iso) => void apply(from, iso)} min={from} disabled={locked} />
                </div>
                <p className="mt-3 text-sm text-dim">
                    {days > 0 ? `${days} day${days === 1 ? "" : "s"}` : "Choose an end date on or after the start"}
                    {saving ? " · Saving…" : ""}
                    {locked ? " · Dates are fixed once the campaign leaves draft." : ""}
                </p>
                {error && (
                    <div className="mt-3">
                        <InlineError message={error} />
                    </div>
                )}

                <h3 className="mt-6 text-lg font-semibold leading-6 text-ink">Cost for these dates</h3>
                <div className="mt-6 rounded-lg bg-ground px-5 py-5">
                    {current ? (
                        <dl className="space-y-3">
                            {costRows(current).map((row) => (
                                <React.Fragment key={row.label}>
                                    {row.strong && <div className="h-px bg-line" />}
                                    <div className={row.strong ? "flex items-center justify-between text-base font-semibold text-ink" : "flex items-center justify-between text-sm text-dim"}>
                                        <dt>{row.label}</dt>
                                        <dd className={row.strong ? "tabular-nums" : "tabular-nums text-ink"}>{row.amount}</dd>
                                    </div>
                                </React.Fragment>
                            ))}
                        </dl>
                    ) : review.error ? (
                        <p className="text-sm text-dim">{review.error}</p>
                    ) : (
                        <p className="text-sm text-dim">{spots.length === 0 ? "No spaces on this booking yet — the cost follows the spaces you choose." : "Pricing these dates…"}</p>
                    )}
                    {current && current.clashes.length > 0 && (
                        <p className="mt-4 text-sm text-[#8d0b0c]">No slot left on these dates at {current.clashes.map((c) => c.title).join(", ")}. Try other dates or change spaces.</p>
                    )}
                </div>
            </TaskCard>
            <StepActions next={{ label: "Done", href: returnHref, disabled: saving }} />
        </>
    );
}
