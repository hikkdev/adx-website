"use client";

import * as React from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { toast } from "sonner";
import { PageHeading, Panel } from "@/components/workspace/page-heading";
import { btnOutline, btnPrimary, ErrorPanel, KeyValue, LoadingLine, StatusChip, useAsync } from "@/components/advertiser/bits";
import { AdCreative } from "@/components/promotions/ads/ad-creative";
import { adHref, adStatusLine, citiesLabel, editHref, showsStats, surfacesLabel } from "@/components/promotions/ads/ad-helpers";
import { AdPayPanel } from "@/components/promotions/ads/ad-pay-panel";
import { AdsClosed, AdsGate } from "@/components/promotions/ads/ads-gate";
import { CancelAdDialog } from "@/components/promotions/ads/cancel-ad-dialog";
import { QuoteBlock } from "@/components/promotions/ads/quote-block";
import { StatsPanel } from "@/components/promotions/stats-panel";
import { isPaid, pollPayment } from "@/services/payments";
import { canCancel, canEditAd, canPay, dayLabel, featureOff, promotionsService, runLabel, specFor, statsOf, statusOf, type AdBookingView } from "@/services/promotions";

/**
 * LM-1: one display ad — where it stands and what happens next, the ad as
 * it will appear (with its "Ad" label), where and when it runs, the money,
 * the pay step while it waits for payment, and what it has done.
 */
export default function AdDetailPage() {
    return (
        <React.Suspense fallback={<LoadingLine />}>
            <Detail />
        </React.Suspense>
    );
}

const back = (
    <Link href="/advertiser/promotions" className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-dim hover:text-ink">
        <ChevronLeft className="size-4" aria-hidden />
        Promote on ADX
    </Link>
);

async function readAd(id: string): Promise<AdBookingView | "CLOSED"> {
    try {
        return await promotionsService.ad(id);
    } catch (caught) {
        if (featureOff(caught)) return "CLOSED";
        throw caught;
    }
}

function Detail() {
    const params = useParams<{ id: string }>();
    const id = params.id;
    const heading = (
        <>
            {back}
            <PageHeading title="Your ad" />
        </>
    );
    return (
        <AdsGate heading={heading}>
            <Body id={id} heading={heading} />
        </AdsGate>
    );
}

function Body({ id, heading }: { id: string; heading: React.ReactNode }) {
    const router = useRouter();
    const search = useSearchParams();
    const paymentId = search.get("payment");
    const state = useAsync(`promotions:ad:${id}`, () => readAd(id), "Could not read this ad.");
    const [override, setOverride] = React.useState<AdBookingView | null>(null);
    const [cancelling, setCancelling] = React.useState(false);
    const [payNote, setPayNote] = React.useState<{ paymentId: string; text: string; failed: boolean } | null>(null);
    const reload = state.reload;

    React.useEffect(() => {
        if (!paymentId) return;
        const poll = pollPayment(paymentId);
        let cancelled = false;
        void poll.done.then(({ payment, settled }) => {
            if (cancelled) return;
            if (settled && payment && isPaid(payment.status)) {
                toast.success("Payment received — the ad is with ADX for review.");
                setPayNote(null);
            } else {
                setPayNote({ paymentId, text: payment?.failureReason ? `The payment did not go through: ${payment.failureReason}` : settled ? "The payment did not go through. You can try again." : "The payment has not settled yet. If you paid, it will show here shortly.", failed: true });
            }
            setOverride(null);
            reload();
            router.replace(adHref(id), { scroll: false });
        });
        return () => {
            cancelled = true;
            poll.stop();
        };
    }, [paymentId, id, reload, router]);

    if (state.kind === "loading") {
        return (
            <>
                {heading}
                <div className="mt-6">
                    <LoadingLine>Loading the ad…</LoadingLine>
                </div>
            </>
        );
    }
    if (state.kind === "error") {
        return (
            <>
                {heading}
                <ErrorPanel title="Could not read this ad" message={state.message} />
                <button type="button" onClick={state.reload} className={`${btnOutline} mt-4`}>
                    Try again
                </button>
            </>
        );
    }
    if (state.value === "CLOSED") {
        return (
            <>
                {heading}
                <AdsClosed />
            </>
        );
    }

    const ad = override ?? state.value;
    const status = statusOf(ad.status);
    const line = adStatusLine(ad);
    const spec = ad.slot?.spec ? specFor(ad.slot.spec, null) : null;
    const cityNames = namesOf(ad);
    const changed = (next: AdBookingView | null) => {
        if (next) setOverride(next);
        else {
            setOverride(null);
            reload();
        }
    };

    return (
        <>
            {back}
            <PageHeading
                title={ad.title || "Untitled ad"}
                subtitle={[ad.displayId, ad.slot?.label].filter(Boolean).join(" · ") || undefined}
                actions={
                    <>
                        <StatusChip label={status.label} tone={status.tone} className="h-8 px-3 text-sm" />
                        {canEditAd(ad.status) && (
                            <Link href={editHref(ad.id)} className={ad.status === "REJECTED" ? btnPrimary : btnOutline}>
                                {ad.status === "REJECTED" ? "Edit and resubmit" : "Finish and submit"}
                            </Link>
                        )}
                        {canCancel(ad.status) && (
                            <button type="button" onClick={() => setCancelling(true)} className={btnOutline}>
                                Cancel ad
                            </button>
                        )}
                    </>
                }
            />

            <Panel className="mt-6">
                <p className="text-sm font-semibold text-ink" data-testid="ad-status-title">
                    {line.title}
                </p>
                <p className="mt-1 text-sm text-dim" data-testid="ad-status-line">
                    {line.line}
                </p>
            </Panel>

            {paymentId && (
                <Panel className="mt-4">
                    <p className="text-sm font-medium text-ink" aria-live="polite">
                        Waiting for the payment to settle…
                    </p>
                    <p className="mt-1 text-sm text-dim">Finish paying in the other window. This page updates by itself.</p>
                </Panel>
            )}
            {payNote && !paymentId && (
                <p role="alert" className="mt-4 text-sm text-danger">
                    {payNote.text}
                </p>
            )}

            <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
                <div className="space-y-6">
                    {canPay(ad.status) && !paymentId && <AdPayPanel ad={ad} onChanged={changed} />}
                    <section className="rounded-lg border border-line bg-white p-6">
                        <h2 className="text-base font-semibold text-ink">As it will appear</h2>
                        <p className="mt-1 text-sm text-dim">Every paid placement on ADX carries the “Ad” label.</p>
                        <div className="mt-4 flex justify-center rounded-md bg-ground p-4">
                            <AdCreative src={ad.media?.url ?? null} spec={spec ?? (ad.media?.width && ad.media?.height ? { width: ad.media.width, height: ad.media.height } : null)} headline={ad.headline} ctaLabel={ad.ctaLabel} targetUrl={ad.targetUrl} alt={ad.media?.altText ?? undefined} />
                        </div>
                    </section>
                    {showsStats(ad.status) && <StatsPanel stats={statsOf(ad.stats)} />}
                </div>
                <aside className="space-y-4">
                    <section className="rounded-lg border border-line bg-white p-4">
                        <p className="text-sm font-semibold text-ink">Where and when</p>
                        <div className="mt-2">
                            <KeyValue label="Slot" value={ad.slot?.label ?? ad.slotKey ?? "—"} />
                            {ad.slot?.surfaces && <KeyValue label="Shows on" value={surfacesLabel(ad.slot.surfaces)} />}
                            <KeyValue label="Days" value={runLabel(ad.startDate, ad.endDate)} />
                            <KeyValue label="Cities" value={citiesLabel(ad.cityIds, cityNames)} />
                            <KeyValue
                                label="Link"
                                value={
                                    ad.targetUrl ? (
                                        <a href={ad.targetUrl} target="_blank" rel="noreferrer" className="break-all text-ink underline">
                                            {ad.targetUrl}
                                        </a>
                                    ) : (
                                        "—"
                                    )
                                }
                            />
                        </div>
                    </section>
                    <QuoteBlock quote={{ days: ad.days, ratePerDay: ad.ratePerDay, subtotal: ad.subtotal, gstAmount: ad.gstAmount, total: ad.total }} fromServer>
                        {(ad.paidAt || ad.refundedAt || ad.cancelledAt) && (
                            <div className="pt-2">
                                {ad.paidAt && <KeyValue label="Paid on" value={dayLabel(ad.paidAt)} />}
                                {ad.refundedAt && <KeyValue label="Refunded on" value={dayLabel(ad.refundedAt)} />}
                                {ad.cancelledAt && <KeyValue label="Cancelled on" value={dayLabel(ad.cancelledAt)} />}
                            </div>
                        )}
                    </QuoteBlock>
                </aside>
            </div>

            <CancelAdDialog
                ad={ad}
                open={cancelling}
                onClose={() => setCancelling(false)}
                onCancelled={(next) => {
                    setCancelling(false);
                    toast.success("The ad is cancelled.");
                    changed(next);
                }}
            />
        </>
    );
}

/** City names the view carries (`cities: [{ id | slug, name }]`), when it carries them. */
function namesOf(ad: AdBookingView): Record<string, string> {
    const rows = (ad as AdBookingView & { cities?: { id?: string; slug?: string; name?: string }[] }).cities;
    const names: Record<string, string> = {};
    if (Array.isArray(rows)) for (const row of rows) if (row?.name) names[row.id ?? row.slug ?? ""] = row.name;
    return names;
}
