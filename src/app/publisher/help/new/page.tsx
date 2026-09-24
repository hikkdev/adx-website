"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Panel } from "@/components/workspace/page-heading";
import { brandButton, CardTitle, ErrorNote, Loading, Segmented, textareaClass } from "@/components/publisher/parts";
import { UploadBox } from "@/components/publisher/upload-box";
import { useLoad } from "@/components/publisher/use-load";
import { messageOf } from "@/lib/api-client";
import { bookingRef, dateRange, formatMoney, ISSUE_TABS, longDate, publisherWorkspace, type Booking, type MyListing, type UploadedFile, type Withdrawal } from "@/services/publisher-workspace";

type Kind = (typeof ISSUE_TABS)[number]["value"];

interface Related {
    bookings: Booking[];
    listings: MyListing[];
    payouts: Withdrawal[];
}

async function readRelated(): Promise<Related> {
    const [bookings, listings, payouts] = await Promise.all([
        publisherWorkspace.bookings({ pageSize: 100 }).then((page) => page.items).catch(() => [] as Booking[]),
        publisherWorkspace.listings({ pageSize: 100 }).then((page) => page.items).catch(() => [] as MyListing[]),
        publisherWorkspace.withdrawals().catch(() => [] as Withdrawal[]),
    ]);
    return { bookings, listings, payouts };
}

export default function NewRequestPage() {
    return (
        <React.Suspense fallback={<Loading label="Loading…" />}>
            <NewRequestView />
        </React.Suspense>
    );
}

/**
 * DR 12 · 10 · 19 · Report an issue (5204:91183): the request type, the
 * booking, listing or payout it is about, what happened, an attachment —
 * `POST /support/tickets` with the matching category and, for a booking,
 * `relatedOrderId`.
 */
function NewRequestView() {
    const router = useRouter();
    const search = useSearchParams();
    const initial: Kind = search.get("type") === "listing" ? "LISTING" : search.get("type") === "payout" ? "PAYOUT" : "BOOKING";
    const { data, error, loading, reload } = useLoad("related", readRelated);
    const [kind, setKind] = React.useState<Kind>(initial);
    const [ref, setRef] = React.useState(search.get("ref") ?? "");
    const [text, setText] = React.useState("");
    const [attachment, setAttachment] = React.useState<UploadedFile | null>(null);
    const [busy, setBusy] = React.useState(false);
    const [failure, setFailure] = React.useState<string | null>(null);

    const options: { id: string; label: string }[] = !data
        ? []
        : kind === "BOOKING"
          ? data.bookings.map((b) => ({ id: b.id, label: `${bookingRef(b)} · ${b.listing?.title ?? "Space"} · ${dateRange(b.startDate, b.endDate)}` }))
          : kind === "LISTING"
            ? data.listings.map((l) => ({ id: l.id, label: `${l.displayId ?? l.title}${l.displayId ? ` · ${l.title}` : ""}` }))
            : data.payouts.map((p) => ({ id: p.id, label: `${p.reference} · ${formatMoney(p.netAmount)} · ${longDate(p.requestedAt)}` }));
    const chosen = options.find((o) => o.id === ref) ?? null;
    const tab = ISSUE_TABS.find((t) => t.value === kind)!;

    const send = async (event: React.FormEvent) => {
        event.preventDefault();
        setFailure(null);
        if (text.trim().length < 5) return setFailure("Say what happened in a sentence or two.");
        setBusy(true);
        try {
            const ticket = await publisherWorkspace.createTicket({
                category: tab.category,
                title: chosen ? `${tab.label}: ${chosen.label.split(" · ").slice(0, 2).join(" · ")}` : `${tab.label} request`,
                description: chosen ? `${chosen.label}\n\n${text.trim()}` : text.trim(),
                ...(kind === "BOOKING" && chosen ? { relatedOrderId: chosen.id } : {}),
                ...(attachment ? { attachmentUrls: [attachment.url] } : {}),
            });
            toast.success("Request sent. Support answers on this thread.");
            router.replace(`/publisher/help/${ticket.id}`);
        } catch (caught) {
            setFailure(messageOf(caught, "Could not send the request."));
            setBusy(false);
        }
    };

    return (
        <>
            <h1 className="text-2xl font-semibold tracking-tight text-ink">Report an issue</h1>
            <form onSubmit={send}>
                <Panel className="mt-6">
                    <CardTitle>Request type</CardTitle>
                    <div className="mt-4">
                        <Segmented
                            label="Request type"
                            value={kind}
                            onChange={(next) => {
                                setKind(next);
                                setRef("");
                            }}
                            options={ISSUE_TABS.map((t) => ({ value: t.value, label: t.label }))}
                        />
                    </div>

                    <div className="relative mt-5 rounded-md border border-line bg-white px-3 pb-2 pt-5">
                        <label htmlFor="req-ref" className="absolute left-3 top-1.5 text-[11px] text-dim">
                            {tab.label}
                        </label>
                        {!data && loading ? (
                            <p className="text-sm text-dim">Loading…</p>
                        ) : (
                            <select id="req-ref" value={ref} onChange={(event) => setRef(event.target.value)} className="w-full bg-transparent text-sm text-ink focus:outline-none">
                                <option value="">{options.length === 0 ? `No ${tab.label.toLowerCase()} to choose from` : `Choose the ${tab.label.toLowerCase()} this is about`}</option>
                                {options.map((option) => (
                                    <option key={option.id} value={option.id}>
                                        {option.label}
                                    </option>
                                ))}
                            </select>
                        )}
                    </div>
                    {error && (
                        <div className="mt-3">
                            <ErrorNote message={error} onRetry={reload} />
                        </div>
                    )}

                    <label htmlFor="req-text" className="mt-5 block text-xs text-dim">
                        What happened?
                    </label>
                    <textarea id="req-text" value={text} onChange={(event) => setText(event.target.value)} rows={3} maxLength={4000} placeholder="Please confirm the artwork review status for this booking." className={`${textareaClass} mt-2`} />

                    <p className="mt-5 text-[11px] font-semibold uppercase tracking-wide text-dim">Attachment (optional)</p>
                    <UploadBox className="mt-2" purpose="SUPPORT_ATTACHMENT" value={attachment} onChange={setAttachment} hint="Max 10MB per file" />

                    {failure && (
                        <p role="alert" className="mt-4 text-sm text-danger">
                            {failure}
                        </p>
                    )}
                    <div className="mt-5 flex flex-wrap items-center gap-4">
                        <button type="submit" disabled={busy} className={brandButton}>
                            {busy ? "Sending…" : "Send request"}
                        </button>
                        <Link href="/publisher/help" className="text-sm font-medium text-ink underline underline-offset-4">
                            Cancel
                        </Link>
                    </div>
                </Panel>
            </form>
        </>
    );
}
