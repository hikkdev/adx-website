"use client";

import * as React from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { Panel } from "@/components/workspace/page-heading";
import { brandButton, CardTitle, ErrorNote, Field, inputClass, KeyRow, Loading, outlineButton, textareaClass } from "@/components/publisher/parts";
import { useLoad } from "@/components/publisher/use-load";
import { messageOf } from "@/lib/api-client";
import { bookingEarning, bookingRef, dateRange, earningHeadline, formatMoney, publisherWorkspace } from "@/services/publisher-workspace";

const REASONS: { value: string; message: string }[] = [
    { value: "Space unavailable for these dates", message: "The requested dates are no longer available." },
    { value: "Rate or terms not acceptable", message: "The booking terms do not work for this space. Please get in touch through ADX if you would like to discuss." },
    { value: "Campaign not suitable for this space", message: "This campaign is not a fit for the space and its audience." },
    { value: "Space under maintenance", message: "The space is under maintenance and cannot be booked for these dates." },
    { value: "Other", message: "" },
];

/**
 * DR 12 · 10 · 06 · Decline booking · Confirmation (5204:91668): the
 * request's dates and earnings, a reason, and the message the advertiser
 * will read. "Decline booking" posts `reject-publisher` and returns to the
 * booking, which then draws the declined record.
 */
export default function DeclinePage() {
    const { id } = useParams<{ id: string }>();
    const router = useRouter();
    const { data, error, loading, reload } = useLoad(`decline:${id}`, async () => {
        const [booking, earnings] = await Promise.all([publisherWorkspace.booking(id), publisherWorkspace.earnings().catch(() => null)]);
        return { booking, earnings };
    });
    const [reason, setReason] = React.useState(REASONS[0]!.value);
    const [message, setMessage] = React.useState(REASONS[0]!.message);
    const [busy, setBusy] = React.useState(false);
    const [failure, setFailure] = React.useState<string | null>(null);

    if (!data && loading) return <Loading label="Loading the request…" />;
    if (!data) return <ErrorNote message={error ?? "Could not read this booking."} onRetry={reload} />;

    const { booking } = data;
    const earning = earningHeadline(bookingEarning(booking, data.earnings));

    if (booking.status !== "PENDING_PUBLISHER") {
        return (
            <>
                <h1 className="text-2xl font-semibold tracking-tight text-ink">This request is no longer open</h1>
                <p className="mt-1 text-sm text-dim">It has already been answered, or the advertiser withdrew it.</p>
                <Link href={`/publisher/bookings/${booking.id}`} className={`${outlineButton} mt-6`}>
                    View booking
                </Link>
            </>
        );
    }

    const pickReason = (value: string) => {
        const next = REASONS.find((r) => r.value === value) ?? REASONS[0]!;
        const untouched = REASONS.some((r) => r.message === message.trim()) || message.trim() === "";
        setReason(next.value);
        if (untouched) setMessage(next.message);
    };

    const decline = async (event: React.FormEvent) => {
        event.preventDefault();
        setBusy(true);
        setFailure(null);
        try {
            const text = message.trim();
            await publisherWorkspace.reject(booking.id, text ? `${reason} — ${text}` : reason);
            toast.success("Booking request declined");
            router.replace(`/publisher/bookings/${booking.id}`);
        } catch (caught) {
            setFailure(messageOf(caught, "Could not decline the request."));
            setBusy(false);
        }
    };

    return (
        <>
            <h1 className="text-2xl font-semibold tracking-tight text-ink">Decline this booking request?</h1>
            <p className="mt-1 text-sm text-dim">
                {bookingRef(booking)} · {booking.campaignName ?? "Campaign"}
                {booking.listing ? ` · ${booking.listing.title}` : ""}
            </p>

            <form onSubmit={decline}>
                <Panel className="mt-6">
                    <CardTitle>Review before declining</CardTitle>
                    <p className="mt-2 text-sm text-dim">The advertiser will be told that you cannot fulfil this booking. No installation work should begin for a declined request.</p>
                    <div className="mt-2">
                        <KeyRow label="Requested dates" value={dateRange(booking.startDate, booking.endDate)} strong />
                        <KeyRow label="Space earnings" value={formatMoney(earning)} strong />
                    </div>
                    <div className="mt-3 grid gap-4">
                        <Field label="Reason for declining" htmlFor="decline-reason">
                            <select id="decline-reason" value={reason} onChange={(event) => pickReason(event.target.value)} className={inputClass}>
                                {REASONS.map((option) => (
                                    <option key={option.value} value={option.value}>
                                        {option.value}
                                    </option>
                                ))}
                            </select>
                        </Field>
                        <Field label="Message to the advertiser" htmlFor="decline-message">
                            <textarea id="decline-message" value={message} onChange={(event) => setMessage(event.target.value)} rows={2} maxLength={500} className={textareaClass} placeholder="A line the advertiser will read with your response" />
                        </Field>
                    </div>
                    <p className="mt-3 text-sm text-dim">Your response will be shown with the booking request.</p>
                    {failure && (
                        <p role="alert" className="mt-3 text-sm text-danger">
                            {failure}
                        </p>
                    )}
                </Panel>
                <div className="mt-6 flex flex-wrap gap-3">
                    <Link href={`/publisher/bookings/${booking.id}`} className={outlineButton}>
                        Keep request
                    </Link>
                    <button type="submit" disabled={busy} className={brandButton}>
                        {busy ? "Declining…" : "Decline booking"}
                    </button>
                </div>
            </form>
        </>
    );
}
