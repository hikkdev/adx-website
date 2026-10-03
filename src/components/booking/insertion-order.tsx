"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { messageOf } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { AgreementText } from "@/components/booking/agreement-text";
import { ErrorNote, smallButton } from "@/components/booking/booking-frame";
import { agreementStanding, bookingService, renderSchedule, signatureWanted, signHref, signingOpen, type AdvertiserProfile, type Campaign, type CampaignReview } from "@/services/booking";

/** Where the insertion order stands, in one chip — the app's words. */
export function insertionOrderChip(review: CampaignReview): { label: string; tone: "success" | "warning" } | null {
    const standing = agreementStanding(review, "INSERTION_ORDER");
    const wanted = signatureWanted(review);
    const request = review.signing?.request ?? null;
    if (wanted) return { label: request && signingOpen(request.status) ? "Awaiting your signature" : "Signature needed", tone: "warning" };
    if (review.signing?.required && review.signing.satisfied) return { label: "Signed", tone: "success" };
    if (!standing) return null;
    if (standing.current) return { label: `Accepted · version ${standing.templateVersion ?? "—"}`, tone: "success" };
    return { label: standing.accepted ? "New version to accept" : "Not yet accepted", tone: "warning" };
}

/** Whether the insertion order lets the payment through: accepted on the live version, and signed when the policy asks. */
export function insertionOrderSettled(review: CampaignReview | null): boolean {
    if (!review) return false;
    const standing = agreementStanding(review, "INSERTION_ORDER");
    return (standing === null || standing.current) && !signatureWanted(review);
}

/**
 * Lot D (Q123) / DS-3: the insertion order on the pay step — the versioned
 * text ADX published, with this campaign's sites printed into it, read here
 * and accepted with a click the server records (`POST
 * /advertisers/:id/agreements/insertion-order`). Above the policy's
 * threshold the click opens an e-signature instead: the person goes to the
 * signing page and comes back here (`?next=`), and "I have signed" asks ADX
 * to ask Digio where it stands, then re-reads the review.
 */
export function InsertionOrderPanel({ campaign, review, advertiser, returnTo, onChanged }: { campaign: Campaign; review: CampaignReview; advertiser: AdvertiserProfile | null; returnTo: string; onChanged: () => void }) {
    const router = useRouter();
    const chip = insertionOrderChip(review);
    const settled = insertionOrderSettled(review);
    const wanted = signatureWanted(review);
    const request = review.signing?.request ?? null;
    const standing = agreementStanding(review, "INSERTION_ORDER");
    const [open, setOpen] = React.useState(!settled);
    const [read, setRead] = React.useState(false);
    const [loaded, setLoaded] = React.useState(false);
    const [busy, setBusy] = React.useState<"ACCEPT" | "REFRESH" | null>(null);
    const [error, setError] = React.useState<string | null>(null);
    const [note, setNote] = React.useState<string | null>(null);
    const schedule = React.useMemo(() => renderSchedule(campaign, review.lines), [campaign, review.lines]);

    const accept = async () => {
        if (!advertiser || busy) return;
        setBusy("ACCEPT");
        setError(null);
        try {
            const answer = await bookingService.acceptInsertionOrder(advertiser.id, campaign.id);
            if (answer && typeof answer === "object" && "accepted" in answer && answer.accepted === false && answer.signing?.id) {
                /* DS-3: above the threshold the accept opens a signing request — straight to it. */
                router.push(signHref(answer.signing.id, returnTo));
                return;
            }
            onChanged();
        } catch (caught) {
            setError(messageOf(caught, "Could not record your acceptance. Try again in a moment."));
        } finally {
            setBusy(null);
        }
    };

    const checkAgain = async () => {
        if (!request || busy) return;
        setBusy("REFRESH");
        setError(null);
        setNote(null);
        try {
            const fresh = await bookingService.refreshSigning(request.id);
            if (signingOpen(fresh.status)) setNote("Digio has not recorded your signature yet. Finish it on the signing page, then check again.");
            onChanged();
        } catch (caught) {
            setError(messageOf(caught, "Could not ask where the signature stands."));
        } finally {
            setBusy(null);
        }
    };

    if (!standing && !review.signing) return null;

    return (
        <section className="rounded-md border border-line bg-white px-4 py-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                    <p className="text-sm font-semibold text-ink">Insertion order</p>
                    <p className="mt-1 text-sm text-dim">
                        {wanted
                            ? "This campaign is above the amount that needs a signed insertion order — Aadhaar OTP through Digio, about a minute. Sign it and the payment opens."
                            : settled
                              ? "The terms of this booking, listing its exact sites, dates and rates."
                              : standing?.accepted
                                ? "ADX published a new version since you accepted it. Read and accept it before paying."
                                : "The terms of this booking, listing its exact sites, dates and rates. Read and accept it before paying."}
                    </p>
                </div>
                {chip && <span className={cn("inline-flex h-6 shrink-0 items-center rounded-md px-2 text-xs font-medium", chip.tone === "success" ? "bg-success-soft text-success" : "bg-warning-soft text-warning")}>{chip.label}</span>}
            </div>

            <button type="button" onClick={() => setOpen((v) => !v)} className="mt-3 text-sm font-medium text-ink underline underline-offset-2 hover:text-brand" aria-expanded={open}>
                {open ? "Hide the insertion order" : "Read the insertion order"}
            </button>
            {open && <AgreementText kind="INSERTION_ORDER" schedule={schedule} onRead={() => setRead(true)} onLoaded={(template) => setLoaded(!!template)} className="mt-3" maxHeight={280} />}

            <div className="mt-3 flex flex-wrap items-center gap-2">
                {!settled && !wanted && (
                    <>
                        <button type="button" onClick={() => void accept()} disabled={!advertiser || !loaded || !read || busy !== null || !open} className={smallButton}>
                            {busy === "ACCEPT" ? "Recording…" : standing?.accepted ? "Accept the new version" : "Accept the insertion order"}
                        </button>
                        {open && loaded && !read && <span className="text-xs text-dim">Scroll to the end of the text to accept.</span>}
                        {!open && <span className="text-xs text-dim">Open the text to read and accept it.</span>}
                    </>
                )}
                {wanted && request && signingOpen(request.status) && (
                    <>
                        <Link href={signHref(request.id, returnTo)} className={cn(smallButton, "border-brand text-brand")}>
                            Sign the insertion order
                        </Link>
                        <button type="button" onClick={() => void checkAgain()} disabled={busy !== null} className={smallButton}>
                            {busy === "REFRESH" ? "Checking…" : "I have signed — check again"}
                        </button>
                    </>
                )}
                {wanted && (!request || !signingOpen(request.status)) && (
                    <button type="button" onClick={() => void accept()} disabled={!advertiser || busy !== null} className={smallButton}>
                        {busy === "ACCEPT" ? "Starting…" : request ? "Start a new signature" : "Sign the insertion order"}
                    </button>
                )}
            </div>
            {wanted && request && !signingOpen(request.status) && <p className="mt-2 text-xs text-dim">The last signing request ended ({request.status.toLowerCase().replace(/_/g, " ")}). Start a new one to continue.</p>}
            {note && <p className="mt-2 text-xs text-dim">{note}</p>}
            <ErrorNote message={error} className="mt-3" />
        </section>
    );
}
