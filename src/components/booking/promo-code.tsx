"use client";

import * as React from "react";
import { ApiError, messageOf } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { bookingService, rupees, type CampaignReview, type PromoDiscount } from "@/services/booking";
import { smallButton } from "./booking-frame";

/**
 * "Have a promo code?" (5204:64952): the link opens a field with Apply; a
 * code that stands shows its saving and "Remove code". Wired to
 * `POST /campaigns/:id/promo` and its DELETE; while the backend has no
 * promo door the control stays and says so.
 */
export function PromoCode({ campaignId, promo, onReview, className }: { campaignId: string; promo: PromoDiscount | null; onReview: (review: CampaignReview, promo: PromoDiscount | null) => void; className?: string }) {
    const [open, setOpen] = React.useState(!!promo);
    const [code, setCode] = React.useState("");
    const [busy, setBusy] = React.useState(false);
    const [message, setMessage] = React.useState<{ tone: "error" | "info"; text: string } | null>(null);

    const apply = async () => {
        const trimmed = code.trim().toUpperCase();
        if (!trimmed || busy) return;
        setBusy(true);
        setMessage(null);
        try {
            const answer = await bookingService.applyPromo(campaignId, trimmed);
            onReview(answer.review, answer.promo);
            setCode("");
        } catch (caught) {
            if (caught instanceof ApiError && caught.status === 404 && caught.code !== "PROMO_NOT_FOUND") {
                setMessage({ tone: "info", text: "Promo codes are not available yet." });
            } else {
                setMessage({ tone: "error", text: messageOf(caught, "That code could not be applied.") });
            }
        } finally {
            setBusy(false);
        }
    };

    const remove = async () => {
        if (busy) return;
        setBusy(true);
        setMessage(null);
        try {
            const answer = await bookingService.removePromo(campaignId);
            onReview(answer.review, null);
        } catch (caught) {
            setMessage({ tone: "error", text: messageOf(caught, "Could not remove the code.") });
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className={className}>
            {!open && (
                <button type="button" onClick={() => setOpen(true)} className="text-sm font-medium text-brand underline underline-offset-2">
                    Have a promo code?
                </button>
            )}
            {open && !promo && (
                <div>
                    <p className="text-sm font-medium text-ink">Promo code</p>
                    <div className="mt-2 flex gap-2">
                        <input
                            value={code}
                            onChange={(event) => setCode(event.target.value)}
                            onKeyDown={(event) => event.key === "Enter" && void apply()}
                            placeholder="Enter your code"
                            aria-label="Promo code"
                            className="h-9 min-w-0 flex-1 rounded-md border border-line bg-white px-3 text-sm uppercase text-ink placeholder:normal-case placeholder:text-dim focus:border-ink focus:outline-none"
                        />
                        <button type="button" onClick={() => void apply()} disabled={busy || !code.trim()} className={smallButton}>
                            {busy ? "Applying…" : "Apply"}
                        </button>
                    </div>
                </div>
            )}
            {promo && (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-brand-soft px-3 py-2.5">
                    <p className="text-sm text-ink">
                        <span className="font-semibold">{promo.code}</span> applied · you save {rupees(promo.amount)}
                    </p>
                    <button type="button" onClick={() => void remove()} disabled={busy} className="text-sm font-medium text-brand underline underline-offset-2">
                        Remove code
                    </button>
                </div>
            )}
            {message && <p className={cn("mt-2 text-sm", message.tone === "error" ? "text-[#b42318]" : "text-dim")}>{message.text}</p>}
        </div>
    );
}
