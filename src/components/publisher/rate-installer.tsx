"use client";

import * as React from "react";
import { Star } from "lucide-react";
import { Panel } from "@/components/workspace/page-heading";
import { brandButton, CardTitle, Field, inputClass } from "@/components/publisher/parts";
import { ApiError, messageOf } from "@/lib/api-client";
import { FLAG_REVIEWS, useSwitchedOff } from "@/lib/flags";
import { cn } from "@/lib/utils";
import { publisherBookings, STAR_WORDS, type AgentRatingEligibility } from "@/services/publisher-bookings";

/**
 * "Rate your installer" — the app's review moment on a Live or Completed
 * booking an ADX installer put up. Drawn only when
 * `GET /orders/:id/rate-agent/eligibility` says it may be asked; a
 * publisher rates an installer once, ever, so ALREADY_RATED says so, and
 * NO_AGENT, NOT_YET or a failed read draw nothing at all. While reviews are
 * switched off (`marketplace.reviews`) nothing is read and nothing is drawn.
 */
export function RateInstaller({ bookingId, agentName }: { bookingId: string; agentName: string | null }) {
    const [eligibility, setEligibility] = React.useState<AgentRatingEligibility | null>(null);
    const [stars, setStars] = React.useState(0);
    const [hover, setHover] = React.useState(0);
    const [note, setNote] = React.useState("");
    const [busy, setBusy] = React.useState(false);
    const [failure, setFailure] = React.useState<string | null>(null);
    const [filed, setFiled] = React.useState(false);
    const name = agentName ?? "your installer";
    const reviewsOff = useSwitchedOff(FLAG_REVIEWS);

    React.useEffect(() => {
        /* The kill switch: no eligibility read while reviews are off. */
        if (reviewsOff) return;
        let active = true;
        publisherBookings
            .rateEligibility(bookingId)
            .then((answer) => {
                if (active) setEligibility(answer && typeof answer.askable === "boolean" ? answer : null);
            })
            .catch(() => {
                if (active) setEligibility(null);
            });
        return () => {
            active = false;
        };
    }, [bookingId, reviewsOff]);

    if (reviewsOff) return null;
    if (filed) {
        return (
            <Panel>
                <p className="text-sm text-success">Thanks — your rating of {name} is on their record.</p>
            </Panel>
        );
    }
    if (!eligibility) return null;
    if (!eligibility.askable) {
        if (eligibility.reason !== "ALREADY_RATED") return null;
        return (
            <Panel>
                <p className="text-sm text-dim">You rated {name} earlier. ADX asks once per installer.</p>
            </Panel>
        );
    }

    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (stars < 1 || busy) return;
        setBusy(true);
        setFailure(null);
        try {
            await publisherBookings.rateAgent(bookingId, { rating: stars, note });
            setFiled(true);
        } catch (caught) {
            if (caught instanceof ApiError && caught.code === "REVIEW_EXISTS") setEligibility({ askable: false, reason: "ALREADY_RATED" });
            else setFailure(messageOf(caught, "Could not send that rating. Try again."));
        } finally {
            setBusy(false);
        }
    };

    const shown = hover || stars;
    return (
        <Panel>
            <CardTitle>Rate your installer</CardTitle>
            <p className="mt-1 text-sm text-dim">How did {name} do? Your stars count towards their rating, and ADX asks only once per installer.</p>
            <form onSubmit={submit} className="mt-4 grid gap-4">
                <div>
                    <div role="radiogroup" aria-label="Stars" className="flex items-center gap-1" onMouseLeave={() => setHover(0)}>
                        {[1, 2, 3, 4, 5].map((value) => (
                            <button
                                key={value}
                                type="button"
                                role="radio"
                                aria-checked={stars === value}
                                aria-label={`${value} star${value === 1 ? "" : "s"} · ${STAR_WORDS[value]}`}
                                onClick={() => setStars(value)}
                                onMouseEnter={() => setHover(value)}
                                className="rounded p-0.5 text-[#d8d8d4] transition-colors hover:text-[#f5a524] focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink"
                            >
                                <Star className={cn("size-7", value <= shown && "fill-[#f5a524] text-[#f5a524]")} aria-hidden />
                            </button>
                        ))}
                    </div>
                    <p className="mt-1 text-xs text-dim">{shown === 0 ? "Choose a star" : `${shown} of 5 · ${STAR_WORDS[shown]}`}</p>
                </div>
                <Field label="A line for them (optional)" htmlFor={`rate-note-${bookingId}`}>
                    <input id={`rate-note-${bookingId}`} value={note} onChange={(event) => setNote(event.target.value.slice(0, 300))} className={inputClass} placeholder="On time, tidy, careful with the print" />
                </Field>
                {failure && (
                    <p role="alert" className="text-sm text-danger">
                        {failure}
                    </p>
                )}
                <div>
                    <button type="submit" disabled={stars < 1 || busy} className={brandButton}>
                        {busy ? "Sending…" : "Send rating"}
                    </button>
                </div>
            </form>
        </Panel>
    );
}
