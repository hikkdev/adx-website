"use client";

import * as React from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { messageOf } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { brandButton, CardTitle, Chip, Crumbs, ErrorNote, KeyRow, Loading, outlineButton, textareaClass } from "@/components/publisher/parts";
import { useLoad } from "@/components/publisher/use-load";
import { StatsPanel } from "@/components/promotions/stats-panel";
import { BoostsNotOpen } from "@/components/promotions/boosts/gate";
import { BOOST_STEPS, boostCancelRule, boostPayment, chargedRates, placementsLabel, refundLine, statusLine, stepIndex } from "@/components/promotions/boosts/model";
import { BoostPayPanel } from "@/components/promotions/boosts/pay-panel";
import { isPaid, pollPayment, type PaymentSummary } from "@/services/payments";
import { publisherWorkspace } from "@/services/publisher-workspace";
import { canCancel, canPay, dayLabel, featureOff, money, PLACEMENT_MEANING, promotionsService, runLabel, statsOf, statusOf, type BoostView } from "@/services/promotions";

/**
 * LM-1 · One sponsored listing: where it stands on its four steps (pay →
 * scheduled → live → ended; cancelled with its refund line), the listing,
 * the placements and the dates, the money (the rate by placement, the days,
 * the subtotal, GST, the total), the pay panel while it waits for payment,
 * the cancel dialog that states what happens to the money first, and what
 * it did. `?payment=` is a gateway payment to wait for.
 */
export default function SponsoredListingPage() {
    return (
        <React.Suspense fallback={<Loading />}>
            <SponsoredListing />
        </React.Suspense>
    );
}

type Read = { closed: true } | { closed: false; boost: BoostView; listingTitle: string | null };

function SponsoredListing() {
    const params = useParams<{ id: string }>();
    const id = String(params?.id ?? "");
    const search = useSearchParams();
    const paymentId = search.get("payment");
    const { data, error, loading, reload } = useLoad(`boost:${id}`, async (): Promise<Read> => {
        try {
            const boost = await promotionsService.boost(id);
            let listingTitle = boost.listing?.title ?? null;
            if (!listingTitle) {
                const listings = await publisherWorkspace.listings({ pageSize: 100 }).catch(() => null);
                listingTitle = listings?.items.find((row) => row.id === boost.listingId)?.title ?? null;
            }
            return { closed: false, boost, listingTitle };
        } catch (caught) {
            if (featureOff(caught)) return { closed: true };
            throw caught;
        }
    });

    const boost = data && !data.closed ? data.boost : null;
    const status = boost ? statusOf(boost.status) : null;

    return (
        <div className="mx-auto w-full max-w-[1384px]">
            <Crumbs items={[{ label: "Sponsored listings", href: "/publisher/promotions" }, { label: boost?.displayId ?? "Sponsorship" }]} />
            <div className="mt-2 flex flex-wrap items-center gap-3">
                <h1 className="text-2xl font-semibold tracking-tight text-ink">{data && !data.closed ? (data.listingTitle ?? "Sponsored listing") : "Sponsored listing"}</h1>
                {status && <Chip tone={status.tone}>{status.label}</Chip>}
            </div>
            {boost && <p className="mt-1 text-sm text-dim">{[boost.displayId, placementsLabel(boost.placements), runLabel(boost.startDate, boost.endDate)].filter(Boolean).join(" · ")}</p>}

            {!data && loading && <Loading />}
            {error && !data && (
                <div className="mt-6">
                    <ErrorNote message={error} onRetry={reload} />
                </div>
            )}
            {data?.closed && <BoostsNotOpen />}
            {boost && data && !data.closed && <BoostBody boost={boost} listingTitle={data.listingTitle} paymentId={paymentId} reload={reload} />}
        </div>
    );
}

function BoostBody({ boost: loaded, listingTitle, paymentId, reload }: { boost: BoostView; listingTitle: string | null; paymentId: string | null; reload: () => void }) {
    const router = useRouter();
    const [boost, setBoost] = React.useState(loaded);
    const [seen, setSeen] = React.useState(loaded);
    if (seen !== loaded) {
        setSeen(loaded);
        setBoost(loaded);
    }
    const [cancelOpen, setCancelOpen] = React.useState(false);
    const stats = boost.stats ? statsOf(boost.stats) : null;
    const rates = chargedRates(boost);
    const refund = refundLine(boost);
    const step = stepIndex(boost.status);
    const listingHref = `/publisher/listings/${encodeURIComponent(boost.listingId)}`;
    const leavePayment = React.useCallback(() => router.replace(`/publisher/promotions/${encodeURIComponent(loaded.id)}`), [router, loaded.id]);

    return (
        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
            <div className="grid content-start gap-6">
                {paymentId && canPay(boost.status) && <PaymentWatch key={paymentId} boostId={boost.id} paymentId={paymentId} onSettled={reload} onDone={leavePayment} />}

                <section className="rounded-lg border border-line bg-white p-6" data-testid="boost-status">
                    <CardTitle>Status</CardTitle>
                    {step >= 0 ? (
                        <ol className="mt-4 grid grid-cols-4 gap-2" aria-label="Steps">
                            {BOOST_STEPS.map((row, index) => (
                                <li key={row.key} aria-current={index === step ? "step" : undefined}>
                                    <span className={cn("block h-1.5 rounded-full", index <= step ? "bg-brand" : "bg-ground")} aria-hidden />
                                    <span className={cn("mt-2 block text-xs", index === step ? "font-semibold text-ink" : index < step ? "text-ink" : "text-dim")}>{row.label}</span>
                                </li>
                            ))}
                        </ol>
                    ) : null}
                    <p className="mt-4 text-sm text-ink">{statusLine(boost)}</p>
                    {boost.cancelReason && <p className="mt-1 text-sm text-dim">Reason: {boost.cancelReason}</p>}
                    {boost.reviewNote && <p className="mt-1 text-sm text-dim">ADX: {boost.reviewNote}</p>}
                    {refund && <p className="mt-1 text-sm text-dim" data-testid="refund-line">{refund}</p>}
                </section>

                {canPay(boost.status) && !paymentId && <BoostPayPanel boost={boost} onPaid={(next) => { setBoost(next); reload(); }} />}

                <section className="rounded-lg border border-line bg-white p-6">
                    <CardTitle>What you bought</CardTitle>
                    <div className="mt-3 divide-y divide-line">
                        <KeyRow
                            label="Listing"
                            value={
                                <Link href={listingHref} className="font-medium hover:underline">
                                    {listingTitle ?? boost.listing?.displayId ?? "Your listing"}
                                </Link>
                            }
                        />
                        <KeyRow label="City and category" value={[boost.city, boost.category ? boost.category.charAt(0) + boost.category.slice(1).toLowerCase() : null].filter(Boolean).join(" · ") || "—"} />
                        <KeyRow label="Dates" value={runLabel(boost.startDate, boost.endDate)} />
                        {boost.paidAt && <KeyRow label="Paid" value={dayLabel(boost.paidAt)} />}
                    </div>
                    <ul className="mt-4 grid gap-3 md:grid-cols-2">
                        {boost.placements.map((placement) => (
                            <li key={placement} className="h-full rounded-md bg-ground px-4 py-3">
                                <p className="text-sm font-semibold text-ink">{PLACEMENT_MEANING[placement]?.title ?? placement}</p>
                                <p className="mt-1 text-xs text-dim">{PLACEMENT_MEANING[placement]?.line}</p>
                            </li>
                        ))}
                    </ul>
                </section>

                <StatsPanel stats={stats} />
            </div>

            <aside className="grid content-start gap-6 lg:sticky lg:top-6 lg:self-start">
                <section className="rounded-lg border border-line bg-white p-6" data-testid="boost-money">
                    <CardTitle>Money</CardTitle>
                    <div className="mt-3">
                        {rates.map((row) => (
                            <KeyRow key={row.label} label={`${row.label} · per day`} value={money(row.rate)} />
                        ))}
                        <KeyRow label="Days" value={boost.days} />
                        <KeyRow label="Subtotal" value={money(boost.subtotal)} />
                        <KeyRow label="GST (18%)" value={money(boost.gstAmount)} />
                        <KeyRow label="Total" value={money(boost.total)} strong className="border-t border-line pt-3" />
                    </div>
                </section>
                {canCancel(boost.status) && (
                    <section className="rounded-lg border border-line bg-white p-6">
                        <CardTitle>Cancel</CardTitle>
                        <p className="mt-1 text-sm text-dim">{boostCancelRule(boost)}</p>
                        <button type="button" onClick={() => setCancelOpen(true)} className={`${outlineButton} mt-4 w-full`}>
                            Cancel this sponsorship
                        </button>
                    </section>
                )}
            </aside>

            <CancelDialog
                open={cancelOpen}
                boost={boost}
                onClose={() => setCancelOpen(false)}
                onCancelled={(next) => {
                    setBoost(next);
                    setCancelOpen(false);
                    reload();
                }}
            />
        </div>
    );
}

/** Waits for the gateway's payment to settle, then reads the boost again. */
function PaymentWatch({ boostId, paymentId, onSettled, onDone }: { boostId: string; paymentId: string; onSettled: () => void; onDone: () => void }) {
    const [phase, setPhase] = React.useState<{ kind: "checking" } | { kind: "failed"; payment: PaymentSummary | null } | { kind: "unsettled" }>({ kind: "checking" });
    const [round, setRound] = React.useState(0);
    const remembered = React.useMemo(() => {
        const row = boostPayment.read(boostId);
        return row?.id === paymentId ? row : null;
    }, [boostId, paymentId]);

    React.useEffect(() => {
        const poll = pollPayment(paymentId, { intervalMs: 3000, timeoutMs: 4 * 60 * 1000 });
        poll.done.then(({ payment, settled }) => {
            if (payment && settled && isPaid(payment.status)) {
                toast.success("Payment received — your sponsorship is scheduled.");
                onSettled();
                onDone();
                return;
            }
            setPhase(settled ? { kind: "failed", payment } : { kind: "unsettled" });
        });
        return () => poll.stop();
    }, [paymentId, round, onSettled, onDone]);

    return (
        <section className="rounded-lg border border-line bg-white p-6" role="status" data-testid="payment-watch">
            <CardTitle>{phase.kind === "checking" ? "Checking the payment" : phase.kind === "failed" ? "The payment was not completed" : "The payment has not come through yet"}</CardTitle>
            <p className="mt-1 text-sm text-dim">
                {phase.kind === "checking"
                    ? "Finish paying in the payment window. This page moves on by itself once ADX hears from the gateway."
                    : phase.kind === "failed"
                      ? (phase.payment?.failureReason ?? "Nothing was charged. Try again, or pay from your earnings.")
                      : "If your bank shows a debit, it will settle shortly. Check again, or pay another way."}
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
                {phase.kind === "checking" && remembered?.url && (
                    <a href={remembered.url} target="adx-checkout" className={outlineButton}>
                        Open the payment page again
                    </a>
                )}
                {phase.kind === "unsettled" && (
                    <button type="button" onClick={() => { setPhase({ kind: "checking" }); setRound((n) => n + 1); }} className={outlineButton}>
                        Check again
                    </button>
                )}
                {phase.kind !== "checking" && (
                    <button type="button" onClick={onDone} className={brandButton}>
                        Choose how to pay
                    </button>
                )}
            </div>
        </section>
    );
}

function CancelDialog({ open, boost, onClose, onCancelled }: { open: boolean; boost: BoostView; onClose: () => void; onCancelled: (next: BoostView) => void }) {
    const [reason, setReason] = React.useState("");
    const [busy, setBusy] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);

    const submit = async () => {
        if (busy || !reason.trim()) return;
        setBusy(true);
        setError(null);
        try {
            const next = await promotionsService.cancelBoost(boost.id, reason.trim());
            toast.success("Sponsorship cancelled.");
            onCancelled(next);
        } catch (caught) {
            setError(messageOf(caught, "Could not cancel this sponsorship."));
        } finally {
            setBusy(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
            <DialogContent className="max-w-[520px] rounded-lg border-line p-6">
                <DialogHeader>
                    <DialogTitle className="text-lg font-semibold text-ink">Cancel this sponsorship?</DialogTitle>
                    <DialogDescription className="text-sm text-ink">{boostCancelRule(boost)}</DialogDescription>
                </DialogHeader>
                <label htmlFor="boost-cancel-reason" className="mt-2 block text-sm font-medium text-ink">
                    Why are you cancelling?
                </label>
                <textarea id="boost-cancel-reason" rows={3} value={reason} onChange={(event) => setReason(event.target.value)} className={textareaClass} placeholder="A line for ADX's records" />
                {error && <ErrorNote message={error} />}
                <div className="mt-2 flex justify-end gap-3">
                    <button type="button" onClick={onClose} className={outlineButton}>
                        Keep it
                    </button>
                    <button type="button" onClick={submit} disabled={busy || !reason.trim()} className={brandButton}>
                        {busy ? "Cancelling…" : "Cancel sponsorship"}
                    </button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
