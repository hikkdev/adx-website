"use client";

import * as React from "react";
import { toast } from "sonner";
import { ApiError, messageOf } from "@/lib/api-client";
import { listingEditorService, rupees, trimDecimal, type Listing, type SuggestedRateAnswer } from "@/services/listing-editor";

/** "×1.15" for a multiplier, "+₹200" or "−₹50" for an adjustment. */
export function factorEffect(factor: { kind: "BASE_ADJUST" | "MULTIPLIER"; value: string }): string {
    if (factor.kind === "MULTIPLIER") return `×${trimDecimal(factor.value)}`;
    const negative = factor.value.trim().startsWith("-");
    return `${negative ? "−" : "+"}₹${trimDecimal(factor.value.trim().replace(/^[-+]/, ""))}`;
}

/**
 * Lot E: the rate ADX's applied advisory factors make of the comparables
 * around the spot (`GET /listings/me/:id/suggested-rate`), beside what it
 * charges today, and the one button that takes it. Drawn only when there
 * is an offer that differs; 409 (no comparables) and 400 (no pin) are
 * silence, not errors.
 */
export function SuggestedRateCard({ listingId, onAccepted }: { listingId: string; onAccepted: (listing: Listing) => void }) {
    const [answer, setAnswer] = React.useState<SuggestedRateAnswer | null>(null);
    const [busy, setBusy] = React.useState(false);
    const [refresh, setRefresh] = React.useState(0);

    React.useEffect(() => {
        let live = true;
        listingEditorService
            .suggestedRate(listingId)
            .then((next) => {
                if (live) setAnswer(next);
            })
            .catch((caught: unknown) => {
                if (live && !(caught instanceof ApiError && (caught.status === 409 || caught.status === 400 || caught.status === 404))) toast.error(messageOf(caught, "Could not read ADX's suggested rate."));
                if (live) setAnswer(null);
            });
        return () => {
            live = false;
        };
    }, [listingId, refresh]);

    if (!answer || !answer.differs) return null;

    const accept = async () => {
        setBusy(true);
        try {
            const listing = await listingEditorService.acceptSuggestedRate(listingId);
            toast.success(`Rate set to ${rupees(answer.offer.ratePerDay)} a day`);
            onAccepted(listing);
            setRefresh((n) => n + 1);
        } catch (caught) {
            toast.error(messageOf(caught, "Could not accept the suggested rate."));
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="rounded-lg border border-line bg-ground p-4">
            <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                    <p className="text-sm font-semibold text-ink">ADX suggests {rupees(answer.offer.ratePerDay)} a day</p>
                    <p className="mt-1 text-xs text-dim">
                        {answer.currentRatePerDay ? `You charge ${rupees(answer.currentRatePerDay)} a day now. ` : ""}
                        From {rupees(answer.offer.base)} a day for comparable spots nearby
                        {answer.offer.applied.length ? `, adjusted for ${answer.offer.applied.map((f) => `${f.name} (${factorEffect(f)})`).join(", ")}` : ""}.{answer.offer.cappedOut ? " Capped at the most ADX will move a rate." : ""}
                    </p>
                </div>
                <button type="button" onClick={accept} disabled={busy} className="inline-flex h-9 items-center rounded-md border border-line bg-white px-4 text-sm font-semibold text-ink hover:border-ink disabled:opacity-60">
                    {busy ? "Applying…" : "Accept suggested rate"}
                </button>
            </div>
        </div>
    );
}
