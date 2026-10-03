"use client";

import * as React from "react";
import { Star } from "lucide-react";
import { ApiError, messageOf } from "@/lib/api-client";
import { FLAG_REVIEWS, useSwitchedOff } from "@/lib/flags";
import { cn } from "@/lib/utils";
import { btnSmall, inputClass } from "@/components/advertiser/bits";
import { campaignsService, STAR_WORDS } from "@/services/campaigns";

/**
 * "Rate this space" (Lot D, Q104) — on a spot whose run has COMPLETED: five
 * stars and a line, `POST /campaigns/:id/spots/:spotId/review`, once per
 * spot. The campaign read marks a spot `reviewed`; a second attempt the
 * read did not know about answers 409 REVIEW_EXISTS, which is read as the
 * answer. A filed review turns into a thank-you. While reviews are switched
 * off (`marketplace.reviews`) the card is not drawn at all.
 */
export function RateSpaceCard({ campaignId, spotId, spaceTitle, reviewed = false, className }: { campaignId: string; spotId: string; spaceTitle: string; reviewed?: boolean; className?: string }) {
    const [stars, setStars] = React.useState(0);
    const [hover, setHover] = React.useState(0);
    const [note, setNote] = React.useState("");
    const [busy, setBusy] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);
    const [done, setDone] = React.useState<"FILED" | "EARLIER" | null>(reviewed ? "EARLIER" : null);
    const reviewsOff = useSwitchedOff(FLAG_REVIEWS);

    const submit = async () => {
        if (stars < 1 || busy) return;
        setBusy(true);
        setError(null);
        try {
            await campaignsService.reviewSpot(campaignId, spotId, { rating: stars, ...(note.trim() ? { note: note.trim() } : {}) });
            setDone("FILED");
        } catch (caught) {
            if (caught instanceof ApiError && caught.code === "REVIEW_EXISTS") setDone("EARLIER");
            else setError(messageOf(caught, "Could not send that review. Try again in a moment."));
        } finally {
            setBusy(false);
        }
    };

    /* The kill switch: no rating door, and so no call. */
    if (reviewsOff) return null;

    if (done) {
        return <p className={cn("rounded-md bg-success-soft px-3 py-2 text-sm text-success", className)}>{done === "FILED" ? `Thanks — your review of ${spaceTitle} is on its page.` : "You reviewed this space earlier."}</p>;
    }

    const shown = hover || stars;
    return (
        <div className={cn("rounded-md border border-line bg-white px-4 py-3", className)}>
            <p className="text-sm font-semibold text-ink">Rate this space</p>
            <p className="mt-0.5 text-xs text-dim">How did {spaceTitle} do for you? Other advertisers read this on the space&apos;s page.</p>
            <div className="mt-2 flex flex-wrap items-center gap-3">
                <div role="radiogroup" aria-label="Your rating" className="flex items-center gap-1" onMouseLeave={() => setHover(0)}>
                    {[1, 2, 3, 4, 5].map((n) => (
                        <button key={n} type="button" role="radio" aria-checked={stars === n} aria-label={`${n} of 5 · ${STAR_WORDS[n]}`} onMouseEnter={() => setHover(n)} onClick={() => setStars(n)} className="rounded p-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-ink">
                            <Star className={cn("size-5", n <= shown ? "fill-[#eda100] text-[#eda100]" : "text-dim")} aria-hidden />
                        </button>
                    ))}
                </div>
                <span className="text-xs text-dim">{shown === 0 ? "Choose a star" : `${shown} of 5 · ${STAR_WORDS[shown]}`}</span>
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
                <label className="sr-only" htmlFor={`rate-${spotId}`}>
                    A line about it (optional)
                </label>
                <input id={`rate-${spotId}`} value={note} onChange={(e) => setNote(e.target.value)} placeholder="A line about it (optional) — bright, well placed, easy to find" maxLength={500} className={cn(inputClass, "h-9 min-w-[220px] flex-1")} />
                <button type="button" onClick={() => void submit()} disabled={stars < 1 || busy} className={btnSmall}>
                    {busy ? "Sending…" : "Send review"}
                </button>
            </div>
            {error && <p className="mt-2 text-xs text-danger">{error}</p>}
        </div>
    );
}
