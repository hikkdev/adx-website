"use client";

import * as React from "react";
import Link from "next/link";
import { Check, ChevronLeft, Minus, Paperclip, Star } from "lucide-react";
import { messageOf } from "@/lib/api-client";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { PageHeading } from "@/components/workspace/page-heading";
import { btnOutline, btnPrimary, btnSmall, ErrorPanel, LoadingLine, StatusChip } from "@/components/advertiser/bits";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PrivateFileImage, PrivateFileLink } from "@/components/support/private-file";
import {
    canRate,
    canReopen,
    conversationOf,
    disputesService,
    evidenceKindOf,
    isClosed,
    orderTag,
    outcomeLabel,
    reasonLabel,
    reinstallLine,
    reopenLine,
    resolvedSummary,
    shortDate,
    shortOrder,
    STAR_WORDS,
    STATE_LABEL,
    stateOf,
    timelineOf,
    timeOf,
    type DisputeDetail,
} from "@/services/disputes";
import { attachmentProblem } from "@/services/support";

/**
 * The app's Dispute detail and Dispute resolved on one route, chosen by
 * status: an open case shows the three-row timeline, the conversation (ADX
 * Ops, the other party and you, with evidence in time order) and the reply
 * box with its attach control; a decided one shows the decision, the
 * settlement timeline, reopen while the window is open and — for the
 * raiser, once — rate the resolution. A credit reads "approved" until ADX
 * finance releases it: nothing that moves money is automatic.
 */
export function DisputeDetailView({ base, disputeId, justRaised }: { base: "/advertiser" | "/publisher"; disputeId: string; justRaised: boolean }) {
    const { user } = useAuth();
    const [dispute, setDispute] = React.useState<DisputeDetail | null>(null);
    const [error, setError] = React.useState<string | null>(null);
    const [loadFailed, setLoadFailed] = React.useState<string | null>(null);
    const [draft, setDraft] = React.useState("");
    const [busy, setBusy] = React.useState<null | "send" | "attach" | "reopen">(null);
    const [showThread, setShowThread] = React.useState(false);
    const [rating, setRating] = React.useState(false);
    const [tick, setTick] = React.useState(0);
    const inputRef = React.useRef<HTMLInputElement>(null);

    React.useEffect(() => {
        let cancelled = false;
        disputesService
            .get(disputeId)
            .then((next) => {
                if (!cancelled) {
                    setDispute(next);
                    setLoadFailed(null);
                }
            })
            .catch((caught: unknown) => {
                if (!cancelled) setLoadFailed(messageOf(caught, "Could not read this case."));
            });
        return () => {
            cancelled = true;
        };
    }, [disputeId, tick]);

    const reload = () => setTick((n) => n + 1);
    const orderHref = (orderId: string) => (base === "/advertiser" ? `/advertiser/proofs/${orderId}` : `/publisher/bookings/${orderId}`);

    if (!dispute) {
        return (
            <>
                <Back base={base} />
                {loadFailed ? <ErrorPanel title="Could not read this case" message={loadFailed} /> : <div className="mt-6"><LoadingLine>Loading the case…</LoadingLine></div>}
            </>
        );
    }

    const closed = isClosed(dispute.status);
    const state = stateOf(dispute.status);
    const me = user?.id;
    const isRaiser = dispute.raisedByUserId === me;

    const send = async (event: React.FormEvent) => {
        event.preventDefault();
        const body = draft.trim();
        if (!body) return;
        setBusy("send");
        setError(null);
        try {
            await disputesService.message(dispute.id, body);
            setDraft("");
            reload();
        } catch (caught) {
            setError(messageOf(caught, "Could not send that."));
        } finally {
            setBusy(null);
        }
    };

    const attach = async (file: File | undefined) => {
        if (!file) return;
        const tooBig = attachmentProblem(file);
        if (tooBig) return setError(tooBig);
        setBusy("attach");
        setError(null);
        try {
            const stored = await disputesService.upload(file);
            await disputesService.evidence(dispute.id, { url: stored.url, kind: evidenceKindOf(file), fileName: file.name });
            reload();
        } catch (caught) {
            setError(messageOf(caught, "Could not add that."));
        } finally {
            setBusy(null);
            if (inputRef.current) inputRef.current.value = "";
        }
    };

    const reopen = async () => {
        setBusy("reopen");
        setError(null);
        try {
            await disputesService.reopen(dispute.id);
            setShowThread(false);
            reload();
        } catch (caught) {
            setError(messageOf(caught, "Could not reopen the case."));
        } finally {
            setBusy(null);
        }
    };

    const heading = (
        <PageHeading
            title={`Dispute ${dispute.displayId}`}
            subtitle={[reasonLabel(dispute.reason), dispute.order?.listing?.title ?? dispute.order?.campaignName, `raised ${shortDate(dispute.createdAt)}`].filter(Boolean).join(" · ")}
            actions={<StatusChip label={dispute.status === "REJECTED" ? "Closed" : STATE_LABEL[state]} tone={state === "OPEN" ? "danger" : state === "UNDER_REVIEW" ? "warning" : "success"} />}
        />
    );

    if (closed && !showThread) {
        const rejected = dispute.status === "REJECTED";
        const reinstall = reinstallLine(dispute);
        const rated = dispute.resolutionRating ?? null;
        return (
            <>
                <Back base={base} />
                <div className="mt-4">{heading}</div>
                {error && <p className="mt-4 text-sm text-danger">{error}</p>}
                <section className="mt-6 max-w-[760px] rounded-lg border border-line bg-white p-6">
                    <div className="flex items-start gap-4">
                        <span className={cn("flex size-12 shrink-0 items-center justify-center rounded-full text-white", rejected ? "bg-dim" : "bg-success")}>{rejected ? <Minus className="size-6" aria-hidden /> : <Check className="size-6" aria-hidden />}</span>
                        <div>
                            <p className="text-lg font-semibold text-ink">{rejected ? "Dispute closed" : "Dispute resolved"}</p>
                            <p className="mt-1 text-sm text-dim">{resolvedSummary(dispute)}</p>
                        </div>
                    </div>

                    <div className="mt-5 rounded-md border border-line px-4 py-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="text-sm font-medium text-ink">{dispute.order?.listing?.title ?? dispute.order?.campaignName ?? "Order"}</p>
                            <StatusChip label="Closed" />
                        </div>
                        {dispute.orderId && <p className="text-xs text-dim">{shortOrder(dispute.orderId)}</p>}
                        <p className="mt-2 text-sm text-ink">Outcome: {outcomeLabel(dispute.outcome)}</p>
                    </div>

                    <ol className="mt-5 space-y-3">
                        {dispute.creditedAmount && <Row tone={dispute.creditStatus === "RELEASED" ? "success" : "pending"} label={dispute.creditStatus === "RELEASED" ? "Credit released" : "Credit awaiting finance"} pill={dispute.creditStatus === "RELEASED" && dispute.creditReleasedAt ? shortDate(dispute.creditReleasedAt) : "Approved"} />}
                        <Row tone="primary" label={`Decision: ${outcomeLabel(dispute.outcome).toLowerCase()}`} pill={dispute.resolvedAt ? shortDate(dispute.resolvedAt) : ""} />
                        {reinstall && (
                            <Row
                                tone={dispute.reinstallPending ? "pending" : "success"}
                                label={reinstall}
                                pill={dispute.reinstallPending ? "Pending" : dispute.reinstallStatus === "SKIPPED" ? "Skipped" : "Done"}
                                link={dispute.reinstallPending && dispute.orderId ? { label: "View the order", href: orderHref(dispute.orderId) } : undefined}
                            />
                        )}
                        <Row tone="empty" label={reopenLine(dispute)} />
                    </ol>

                    <div className="mt-6 flex flex-wrap gap-2">
                        <button type="button" onClick={() => setShowThread(true)} className={btnOutline}>
                            Show the conversation
                        </button>
                        {isRaiser && canReopen(dispute) && (
                            <button type="button" onClick={() => void reopen()} className={btnOutline} disabled={busy !== null}>
                                {busy === "reopen" ? "Reopening…" : "Reopen this case"}
                            </button>
                        )}
                        {isRaiser && canRate(dispute) ? (
                            <button type="button" onClick={() => setRating(true)} className={btnOutline}>
                                Rate the resolution
                            </button>
                        ) : isRaiser && rated !== null ? (
                            <span className="inline-flex h-10 items-center gap-1.5 rounded-md bg-ground px-4 text-sm font-medium text-ink">
                                <Star className="size-4 fill-brand text-brand" aria-hidden />
                                You rated {rated}/5
                            </span>
                        ) : null}
                        {dispute.orderId && (
                            <Link href={orderHref(dispute.orderId)} className={btnPrimary}>
                                View order
                            </Link>
                        )}
                    </div>
                </section>
                <RateDialog
                    open={rating}
                    onClose={() => setRating(false)}
                    onSubmit={async (stars, note) => {
                        await disputesService.rate(dispute.id, note ? { rating: stars, note } : { rating: stars });
                        setRating(false);
                        reload();
                    }}
                />
            </>
        );
    }

    const timeline = timelineOf(dispute);
    const turns = conversationOf(dispute, me);

    return (
        <>
            <Back base={base} />
            <div className="mt-4">{heading}</div>
            {justRaised && <p className="mt-4 rounded-md bg-success-soft px-4 py-3 text-sm text-ink">Your case is raised. ADX Ops picks up new cases within three working days and replies here.</p>}
            <div className="mt-6 grid max-w-[1000px] gap-4 lg:grid-cols-[260px_1fr]">
                <section className="h-fit rounded-lg border border-line bg-white p-5">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-dim">Case timeline</p>
                    <ol className="mt-3 space-y-4">
                        {timeline.map((row) => (
                            <li key={row.label} className="flex items-start gap-3">
                                <span className={cn("mt-1 size-2.5 shrink-0 rounded-full", row.current ? "bg-brand-bright ring-4 ring-brand-soft" : row.done ? "bg-ink" : "bg-line")} aria-hidden />
                                <span className="min-w-0 flex-1">
                                    <span className={cn("block text-sm", row.current ? "font-semibold text-ink" : row.done ? "text-ink" : "text-dim")}>{row.label}</span>
                                    {row.value && <span className="block text-xs text-dim">{row.value}</span>}
                                </span>
                            </li>
                        ))}
                    </ol>
                    {dispute.orderId && (
                        <div className="mt-5 border-t border-line pt-4">
                            <p className="text-[11px] font-semibold uppercase tracking-wide text-dim">Against</p>
                            <p className="mt-1 text-sm text-ink">{dispute.order?.listing?.title ?? dispute.order?.campaignName ?? "Order"}</p>
                            <p className="text-xs text-dim">
                                {shortOrder(dispute.orderId)}
                                {dispute.order ? ` · ${orderTag(dispute.order.status)}` : ""}
                            </p>
                            <Link href={orderHref(dispute.orderId)} className="mt-2 inline-block text-sm font-medium text-ink underline underline-offset-4 hover:text-brand">
                                View order
                            </Link>
                        </div>
                    )}
                    {closed && (
                        <button type="button" onClick={() => setShowThread(false)} className={cn(btnSmall, "mt-5")}>
                            Back to the decision
                        </button>
                    )}
                </section>

                <section className="rounded-lg border border-line bg-white p-5">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-dim">Conversation</p>
                    <div className="mt-3 rounded-md bg-ground px-4 py-3">
                        <p className="whitespace-pre-line text-sm text-ink">{dispute.detail}</p>
                        {dispute.expectedResolution && <p className="mt-2 text-xs text-dim">Expected: {dispute.expectedResolution}</p>}
                    </div>
                    {turns.length === 0 && <p className="mt-4 text-sm text-dim">No replies yet. ADX Ops picks up new cases within three working days.</p>}
                    <ol className="mt-4 space-y-4">
                        {turns.map((turn) => (
                            <li key={turn.id} className={cn("flex flex-col", turn.mine ? "items-end" : "items-start")}>
                                <div className={cn("max-w-[80%] rounded-lg px-4 py-3", turn.mine ? "bg-brand-soft" : turn.fromOps ? "bg-ground" : "border border-line bg-white")}>
                                    {turn.kind === "evidence" && turn.fileKind === "IMG" ? (
                                        <>
                                            <PrivateFileImage url={turn.url} alt={turn.body} className="max-h-[240px] w-auto max-w-full rounded-md object-contain" />
                                            <p className="mt-1 truncate text-xs text-dim">{turn.body}</p>
                                        </>
                                    ) : turn.kind === "evidence" ? (
                                        <PrivateFileLink url={turn.url} name={turn.body} className="text-ink" onError={setError} />
                                    ) : (
                                        <p className="whitespace-pre-line text-sm text-ink">{turn.body}</p>
                                    )}
                                </div>
                                <p className="mt-1 text-xs text-dim">
                                    {turn.fromOps ? `${turn.author} · ADX Ops` : turn.author} · {shortDate(turn.at)}, {timeOf(turn.at)}
                                </p>
                            </li>
                        ))}
                    </ol>

                    <form onSubmit={(event) => void send(event)} className="mt-6 border-t border-line pt-4">
                        <label htmlFor="dispute-reply" className="text-[11px] font-semibold uppercase tracking-wide text-dim">
                            Reply or add evidence
                        </label>
                        <textarea
                            id="dispute-reply"
                            value={draft}
                            onChange={(event) => setDraft(event.target.value)}
                            rows={3}
                            maxLength={4000}
                            placeholder="Add what ADX should know"
                            className="mt-2 w-full rounded-md border border-line bg-white px-3 py-2.5 text-sm text-ink placeholder:text-dim focus:border-ink focus:outline-none"
                        />
                        {error && (
                            <p role="alert" className="mt-2 text-sm text-danger">
                                {error}
                            </p>
                        )}
                        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                            <button type="button" onClick={() => inputRef.current?.click()} className={cn(btnSmall, "gap-1.5")} disabled={busy !== null}>
                                <Paperclip className="size-4" aria-hidden />
                                {busy === "attach" ? "Adding…" : "Add evidence"}
                            </button>
                            <button type="submit" className={btnPrimary} disabled={busy !== null || !draft.trim()}>
                                {busy === "send" ? "Sending…" : "Send reply"}
                            </button>
                        </div>
                        <input ref={inputRef} type="file" accept="image/*,application/pdf" className="sr-only" aria-label="Add evidence" onChange={(event) => void attach(event.target.files?.[0])} />
                    </form>
                </section>
            </div>
        </>
    );
}

function Back({ base }: { base: string }) {
    return (
        <Link href={`${base}/disputes`} className="inline-flex items-center gap-1 text-sm text-dim hover:text-ink">
            <ChevronLeft className="size-4" aria-hidden />
            Disputes
        </Link>
    );
}

function Row({ tone, label, pill, link }: { tone: "success" | "pending" | "primary" | "empty"; label: string; pill?: string; link?: { label: string; href: string } }) {
    return (
        <li className="flex items-center gap-3">
            <span className={cn("size-2.5 shrink-0 rounded-full", tone === "success" ? "bg-success" : tone === "pending" ? "bg-warning" : tone === "primary" ? "bg-brand-bright" : "border border-line bg-white")} aria-hidden />
            <span className="min-w-0 flex-1 text-sm text-ink">
                {label}
                {link && (
                    <Link href={link.href} className="ml-2 font-medium underline underline-offset-4 hover:text-brand">
                        {link.label}
                    </Link>
                )}
            </span>
            {pill && <span className="rounded bg-ground px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-dim">{pill}</span>}
        </li>
    );
}

/** Five stars and an optional line — the raiser's score of how ADX handled the case, given once. */
function RateDialog({ open, onClose, onSubmit }: { open: boolean; onClose: () => void; onSubmit: (stars: number, note?: string) => Promise<void> }) {
    const [stars, setStars] = React.useState(0);
    const [note, setNote] = React.useState("");
    const [busy, setBusy] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);

    const submit = async () => {
        if (!stars) return;
        setBusy(true);
        setError(null);
        try {
            await onSubmit(stars, note.trim() || undefined);
        } catch (caught) {
            setError(messageOf(caught, "Could not send your rating."));
        } finally {
            setBusy(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={(next) => !next && !busy && onClose()}>
            <DialogContent className="max-w-[440px] rounded-lg border-line p-6">
                <DialogHeader>
                    <DialogTitle className="text-lg font-semibold text-ink">How did ADX handle this case?</DialogTitle>
                    <DialogDescription className="text-sm text-dim">A score of ADX&apos;s handling, not of the other party. You can give it once.</DialogDescription>
                </DialogHeader>
                <StarPicker value={stars} onChange={setStars} />
                <textarea
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                    maxLength={500}
                    rows={3}
                    placeholder="Anything ADX should know? (optional)"
                    aria-label="A note with your rating"
                    className="w-full rounded-md border border-line bg-white px-3 py-2.5 text-sm text-ink placeholder:text-dim focus:border-ink focus:outline-none"
                />
                {error && (
                    <p role="alert" className="text-sm text-danger">
                        {error}
                    </p>
                )}
                <div className="flex justify-end gap-3">
                    <button type="button" onClick={onClose} className={btnOutline} disabled={busy}>
                        Cancel
                    </button>
                    <button type="button" onClick={() => void submit()} className={btnPrimary} disabled={busy || !stars}>
                        {busy ? "Sending…" : "Send rating"}
                    </button>
                </div>
            </DialogContent>
        </Dialog>
    );
}

/** Five stars with the word under them. */
export function StarPicker({ value, onChange }: { value: number; onChange: (stars: number) => void }) {
    return (
        <div className="flex flex-col items-center gap-1">
            <div role="radiogroup" aria-label="Rating" className="flex gap-1">
                {[1, 2, 3, 4, 5].map((index) => (
                    <button key={index} type="button" role="radio" aria-checked={index === value} aria-label={`${index} star${index === 1 ? "" : "s"}`} onClick={() => onChange(index)} className="p-1">
                        <Star className={cn("size-8", index <= value ? "fill-brand text-brand" : "text-line")} aria-hidden />
                    </button>
                ))}
            </div>
            <p className="h-5 text-sm text-dim">{STAR_WORDS[value] ?? ""}</p>
        </div>
    );
}
