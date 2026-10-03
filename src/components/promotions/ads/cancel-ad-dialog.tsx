"use client";

import * as React from "react";
import { messageOf } from "@/lib/api-client";
import { btnOutline, btnPrimary } from "@/components/advertiser/bits";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cancelRule, promotionsService, type AdBookingView } from "@/services/promotions";

/**
 * LM-1: cancelling an ad — a reason, and what happens to the money said
 * before the button (nothing paid; the full amount back before it starts;
 * nothing back once it has started).
 */
export function CancelAdDialog({ ad, open, onClose, onCancelled }: { ad: AdBookingView; open: boolean; onClose: () => void; onCancelled: (next: AdBookingView | null) => void }) {
    const [reason, setReason] = React.useState("");
    const [busy, setBusy] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);

    const cancel = async () => {
        if (reason.trim().length < 3) {
            setError("Say why, in a few words.");
            return;
        }
        setBusy(true);
        setError(null);
        try {
            const next = await promotionsService.cancelAd(ad.id, reason.trim());
            onCancelled(next && typeof next === "object" && "status" in next ? next : null);
        } catch (caught) {
            setError(messageOf(caught, "Could not cancel the ad."));
        } finally {
            setBusy(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={(next) => !next && !busy && onClose()}>
            <DialogContent className="max-w-[460px] rounded-lg border-line bg-white p-6">
                <DialogHeader>
                    <DialogTitle className="text-lg font-semibold text-ink">Cancel this ad?</DialogTitle>
                    <DialogDescription className="text-sm text-ink" data-testid="cancel-rule">
                        {cancelRule(ad)}
                    </DialogDescription>
                </DialogHeader>
                <label className="block">
                    <span className="block text-sm font-medium text-ink">Why are you cancelling?</span>
                    <textarea value={reason} onChange={(event) => setReason(event.target.value)} maxLength={500} className="mt-2 min-h-[88px] w-full rounded-md border border-line bg-white px-3 py-2 text-sm text-ink placeholder:text-dim focus:border-ink focus:outline-none" placeholder="The offer ended early" />
                </label>
                {error && (
                    <p role="alert" className="text-sm text-danger">
                        {error}
                    </p>
                )}
                <div className="flex justify-end gap-3">
                    <button type="button" onClick={onClose} disabled={busy} className={btnOutline}>
                        Keep it
                    </button>
                    <button type="button" onClick={() => void cancel()} disabled={busy} className={btnPrimary}>
                        {busy ? "Cancelling…" : "Cancel the ad"}
                    </button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
