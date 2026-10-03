"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FileText, Upload, X } from "lucide-react";
import { messageOf } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { PageHeading } from "@/components/workspace/page-heading";
import { btnOutline, btnPrimary, inputClass } from "@/components/advertiser/bits";
import {
    DETAIL_MIN,
    DISPUTE_REASONS,
    disputesService,
    evidenceKindOf,
    MAX_DISPUTE_EVIDENCE,
    orderTag,
    raiseBody,
    raiseProblem,
    shortOrder,
    type DisputableOrder,
    type DisputeReason,
    type EvidenceKind,
    type OrderPersona,
} from "@/services/disputes";
import { attachmentProblem } from "@/services/support";

type Attachment = { key: string; name: string; kind: EvidenceKind; url: string | null; busy: boolean };

/**
 * The app's Raise a dispute: the order it is against, what went wrong, the
 * details, photos or receipts, and the resolution the person expects. A case
 * is against an order, never a typed name — the server reads the parties off
 * it. Opened from a booking or a proof (`?orderId=`), the order is filled;
 * opened from the list, the person picks one of their own. Files go up as
 * they are picked (private DISPUTE_EVIDENCE), so the case is created with
 * their URLs and never with a file still in flight.
 */
export function RaiseDispute({ base, persona, givenOrderId }: { base: "/advertiser" | "/publisher"; persona: OrderPersona; givenOrderId: string | null }) {
    const router = useRouter();
    const inputRef = React.useRef<HTMLInputElement>(null);
    const [orders, setOrders] = React.useState<DisputableOrder[] | null>(null);
    const [orderId, setOrderId] = React.useState<string | null>(givenOrderId);
    const [reason, setReason] = React.useState<DisputeReason>("PROOF_REJECTED");
    const [detail, setDetail] = React.useState("");
    const [expected, setExpected] = React.useState("");
    const [files, setFiles] = React.useState<Attachment[]>([]);
    const [busy, setBusy] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);

    React.useEffect(() => {
        let cancelled = false;
        disputesService
            .orders(persona)
            .then((rows) => {
                if (!cancelled) setOrders(rows);
            })
            .catch((caught: unknown) => {
                if (cancelled) return;
                setOrders([]);
                setError(messageOf(caught, "Could not load your orders."));
            });
        return () => {
            cancelled = true;
        };
    }, [persona]);

    const order = orders?.find((entry) => entry.id === orderId) ?? null;

    const attach = async (list: FileList | null) => {
        if (!list?.length) return;
        setError(null);
        let count = files.length;
        for (const file of Array.from(list)) {
            if (count >= MAX_DISPUTE_EVIDENCE) {
                setError(`Up to ${MAX_DISPUTE_EVIDENCE} files on a case.`);
                break;
            }
            const tooBig = attachmentProblem(file);
            if (tooBig) {
                setError(tooBig);
                continue;
            }
            count += 1;
            const key = `${file.name}-${file.size}-${Date.now()}`;
            setFiles((current) => [...current, { key, name: file.name, kind: evidenceKindOf(file), url: null, busy: true }]);
            try {
                const stored = await disputesService.upload(file);
                setFiles((current) => current.map((entry) => (entry.key === key ? { ...entry, url: stored.url, busy: false } : entry)));
            } catch (caught) {
                setFiles((current) => current.filter((entry) => entry.key !== key));
                setError(messageOf(caught, "The upload did not go through."));
            }
        }
        if (inputRef.current) inputRef.current.value = "";
    };

    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        const problem = raiseProblem({ orderId, detail });
        if (problem) return setError(problem);
        if (files.some((entry) => entry.busy)) return setError("A file is still uploading.");
        setBusy(true);
        setError(null);
        try {
            const dispute = await disputesService.raise(
                raiseBody({ orderId: orderId!, reason, detail, expected, evidence: files.filter((entry) => entry.url).map((entry) => ({ url: entry.url!, fileName: entry.name, kind: entry.kind })) })
            );
            router.push(`${base}/disputes/${dispute.id}?raised=1`);
        } catch (caught) {
            setError(messageOf(caught, "Could not raise the case."));
            setBusy(false);
        }
    };

    return (
        <>
            <PageHeading title="Raise a dispute" subtitle="ADX reviews the case with both sides and replies on its thread. New cases are picked up within three working days." />
            <form onSubmit={(event) => void submit(event)} className="mt-6 grid max-w-[760px] gap-4" noValidate>
                <section className="rounded-lg border border-line bg-white p-5">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-dim">Against</p>
                    {orders === null ? (
                        <p className="mt-2 text-sm text-dim">Loading your orders…</p>
                    ) : order ? (
                        <div className="mt-2 flex flex-wrap items-center justify-between gap-3 rounded-md border border-line px-3 py-3">
                            <div className="min-w-0">
                                <p className="text-xs font-medium text-dim">
                                    {shortOrder(order.id)} · {orderTag(order.status)}
                                </p>
                                <p className="truncate text-sm font-medium text-ink">{order.listing?.title ?? order.campaignName ?? "Order"}</p>
                                {order.campaignName && order.listing?.title && <p className="truncate text-xs text-dim">{order.campaignName}</p>}
                            </div>
                            {!givenOrderId && (
                                <button type="button" onClick={() => setOrderId(null)} className="text-sm font-medium text-ink underline underline-offset-4 hover:text-brand">
                                    Choose a different order
                                </button>
                            )}
                        </div>
                    ) : orderId ? (
                        <div className="mt-2 rounded-md border border-line px-3 py-3">
                            <p className="text-xs font-medium text-dim">{shortOrder(orderId)}</p>
                            <p className="text-sm text-ink">This order.</p>
                        </div>
                    ) : orders.length === 0 ? (
                        <p className="mt-2 text-sm text-dim">You have no orders to raise a case about yet.</p>
                    ) : (
                        <select value="" onChange={(event) => setOrderId(event.target.value || null)} className={cn(inputClass, "mt-2 appearance-none text-dim")} aria-label="The order this is about">
                            <option value="">Choose the order this is about</option>
                            {orders.map((entry) => (
                                <option key={entry.id} value={entry.id}>
                                    {entry.listing?.title ?? entry.campaignName ?? "Order"} · {shortOrder(entry.id)} · {orderTag(entry.status)}
                                </option>
                            ))}
                        </select>
                    )}
                </section>

                <section className="rounded-lg border border-line bg-white p-5">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-dim">What went wrong</p>
                    <div role="radiogroup" aria-label="What went wrong" className="mt-3 flex flex-wrap gap-2">
                        {DISPUTE_REASONS.map((entry) => (
                            <button
                                key={entry.id}
                                type="button"
                                role="radio"
                                aria-checked={reason === entry.id}
                                onClick={() => setReason(entry.id)}
                                className={cn("h-8 rounded-full border px-4 text-sm", reason === entry.id ? "border-ink bg-ink text-white" : "border-line bg-white text-ink hover:border-ink")}
                            >
                                {entry.label}
                            </button>
                        ))}
                    </div>

                    <label htmlFor="dispute-detail" className="mt-5 block text-[11px] font-semibold uppercase tracking-wide text-dim">
                        Details
                    </label>
                    <textarea
                        id="dispute-detail"
                        value={detail}
                        onChange={(event) => setDetail(event.target.value)}
                        rows={5}
                        maxLength={4000}
                        placeholder="What happened, when, and what you have already tried."
                        className="mt-2 w-full rounded-md border border-line bg-white px-3 py-2.5 text-sm text-ink placeholder:text-dim focus:border-ink focus:outline-none"
                    />
                    <p className="mt-1 text-xs text-dim">At least {DETAIL_MIN} characters.</p>

                    <p className="mt-5 text-[11px] font-semibold uppercase tracking-wide text-dim">Photos or receipts (optional)</p>
                    <div className="mt-2 grid gap-2">
                        {files.map((entry) => (
                            <div key={entry.key} className="flex items-center gap-3 rounded-md border border-line px-3 py-2.5">
                                <FileText className="size-4 text-dim" aria-hidden />
                                <span className="min-w-0 flex-1 truncate text-sm text-ink">{entry.name}</span>
                                <span className="text-xs text-dim">{entry.busy ? "Uploading…" : "Stored privately"}</span>
                                <button type="button" onClick={() => setFiles((current) => current.filter((f) => f.key !== entry.key))} aria-label={`Remove ${entry.name}`} className="text-dim hover:text-ink">
                                    <X className="size-4" aria-hidden />
                                </button>
                            </div>
                        ))}
                        {files.length < MAX_DISPUTE_EVIDENCE && (
                            <button
                                type="button"
                                onClick={() => inputRef.current?.click()}
                                onDragOver={(event) => event.preventDefault()}
                                onDrop={(event) => {
                                    event.preventDefault();
                                    void attach(event.dataTransfer.files);
                                }}
                                className="flex w-full flex-col items-center justify-center rounded-lg border border-dashed border-[#c9c9c6] bg-[#f6f6f4] px-6 py-6 text-center hover:border-dim"
                            >
                                <Upload className="size-5 text-ink" aria-hidden />
                                <span className="mt-2 text-sm text-ink">Add photos or receipts</span>
                                <span className="mt-0.5 text-xs text-dim">Images or PDF · up to {MAX_DISPUTE_EVIDENCE} files, 10 MB each</span>
                            </button>
                        )}
                        <input ref={inputRef} type="file" multiple accept="image/*,application/pdf" className="sr-only" aria-label="Add photos or receipts" onChange={(event) => void attach(event.target.files)} />
                    </div>

                    <label htmlFor="dispute-expected" className="mt-5 block text-[11px] font-semibold uppercase tracking-wide text-dim">
                        Expected resolution (optional)
                    </label>
                    <input id="dispute-expected" value={expected} onChange={(event) => setExpected(event.target.value)} maxLength={200} placeholder="Reinstall the creative, or a refund for the missing days" className={cn(inputClass, "mt-2")} />

                    {error && (
                        <p role="alert" className="mt-4 text-sm text-danger">
                            {error}
                        </p>
                    )}
                    <div className="mt-5 flex flex-wrap justify-end gap-2">
                        <Link href={`${base}/disputes`} className={btnOutline}>
                            Cancel
                        </Link>
                        <button type="submit" className={btnPrimary} disabled={busy || orders === null}>
                            {busy ? "Submitting…" : "Submit dispute"}
                        </button>
                    </div>
                </section>
            </form>
        </>
    );
}
