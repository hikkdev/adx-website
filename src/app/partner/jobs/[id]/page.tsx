"use client";

import * as React from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Phone } from "lucide-react";
import { toast } from "sonner";
import { Panel } from "@/components/workspace/page-heading";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { brandButton, CardTitle, Chip, Crumbs, ErrorNote, Field, KeyRow, Loading, outlineButton, textareaClass } from "@/components/publisher/parts";
import { useLoad } from "@/components/publisher/use-load";
import { ApplicantGate, Ladder, Note, openFile, PrivateImage, SpecList } from "@/components/partner/parts";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/services/publisher-workspace";
import {
    creditFor,
    declineProblem,
    formatDay,
    formatWhen,
    JOB_WORDS,
    jobMoves,
    jobRef,
    ladderSteps,
    partnerMessage,
    partnerService,
    readable,
    signHref,
    signingFromError,
    type LedgerEntry,
    type PrintJob,
} from "@/services/partner";

interface Loaded {
    job: PrintJob;
    entries: LedgerEntry[] | null;
}

async function readJob(id: string): Promise<Loaded> {
    const [job, earnings] = await Promise.all([readable(partnerService.job(id), "Could not read this job."), partnerService.earnings().catch(() => null)]);
    return { job, entries: earnings?.entries ?? null };
}

/**
 * One print job — the app's job sheet: the artwork, the ladder, the specs
 * and the price, the site and the agent who collects, and the one move the
 * rung allows. The ladder is the server's, forward only:
 *
 *   REQUESTED ─accept─▶ ACCEPTED ─printing─▶ PRINTING ─ready─▶ READY ─handover─▶ COLLECTED
 *        └────── decline { reason } ──────▶ CANCELLED
 *
 * The handover: the app scans the agent's pickup code; the web takes the
 * app's own fallback, "Paste the code instead" — the same
 * `POST …/handover { qrToken }`, and a wrong order's code is refused.
 */
export default function PartnerJobPage() {
    const { id } = useParams<{ id: string }>();
    const router = useRouter();
    const { data, error, loading, reload } = useLoad(`partner-job:${id}`, () => readJob(id));
    /** The job as the last move answered it; the order is kept from the read (a move's answer does not carry it). */
    const [moved, setMoved] = React.useState<PrintJob | null>(null);
    const [busy, setBusy] = React.useState<string | null>(null);
    const [failure, setFailure] = React.useState<string | null>(null);
    const [declining, setDeclining] = React.useState(false);

    const base = data?.job ?? null;
    const job = moved && base && moved.id === base.id && moved.updatedAt >= base.updatedAt ? { ...moved, order: moved.order ?? base.order } : base;

    const move = async (key: string, call: () => Promise<PrintJob>, done: string) => {
        setBusy(key);
        setFailure(null);
        try {
            setMoved(await call());
            toast.success(done);
        } catch (caught) {
            const signing = signingFromError(caught);
            if (signing?.requestId) {
                toast.info("Taking a job needs your service agreement signed first — Aadhaar OTP, about a minute.");
                router.push(signHref(signing.requestId, `/partner/jobs/${id}`));
                return;
            }
            setFailure(partnerMessage(caught, "That did not go through."));
        } finally {
            setBusy(null);
        }
    };

    if (!job && loading) return <Loading label="Loading the job…" />;
    if (!job) {
        return (
            <>
                <Crumbs items={[{ label: "Jobs", href: "/partner/jobs" }, { label: "Job" }]} />
                <div className="mt-6">
                    <ErrorNote message={error ?? "Could not read this job."} onRetry={reload} />
                </div>
            </>
        );
    }

    const ref = jobRef(job);
    const words = JOB_WORDS[job.status];
    const order = job.order ?? null;
    const moves = jobMoves(job.status);
    const earned = creditFor(job, data?.entries);
    const artwork = order?.artwork?.url ?? null;
    const place = order ? [order.site.address, order.site.city].filter(Boolean).join(", ") : null;
    const map = order && order.site.latitude !== null && order.site.longitude !== null ? `https://www.google.com/maps/search/?api=1&query=${order.site.latitude},${order.site.longitude}` : null;

    return (
        <ApplicantGate what="Print jobs">
            <Crumbs items={[{ label: "Jobs", href: "/partner/jobs" }, { label: ref }]} />
            <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                    <h1 className="text-2xl font-semibold tracking-tight text-ink">{order?.site.title ?? `Booking ${ref}`}</h1>
                    <p className="mt-2 text-sm text-dim">{[ref, order?.campaignName].filter(Boolean).join(" · ")}</p>
                </div>
                <Chip tone={words.tone}>{words.label}</Chip>
            </div>
            {error && (
                <div className="mt-4">
                    <ErrorNote message={error} onRetry={reload} />
                </div>
            )}

            <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_340px]">
                <div className="grid min-w-0 content-start gap-6">
                    <Panel>
                        <div className="flex items-center justify-between gap-3">
                            <CardTitle>Artwork</CardTitle>
                            {artwork && (
                                <button type="button" onClick={() => void openFile(artwork, order?.artwork?.fileName ?? `artwork-${ref}`)} className="text-sm font-semibold text-ink hover:underline">
                                    Open full size
                                </button>
                            )}
                        </div>
                        {artwork ? (
                            <PrivateImage src={artwork} alt="The artwork to print" className="mt-4 aspect-[4/3] w-full rounded-md bg-ground object-contain" />
                        ) : (
                            <p className="mt-2 text-sm text-dim">No artwork is attached yet. ADX adds the approved creative before the print is due — check back, or ask Help & support.</p>
                        )}
                        {order?.artwork?.widthPx && order.artwork.heightPx ? (
                            <p className="mt-2 text-xs text-dim">
                                {order.artwork.widthPx} × {order.artwork.heightPx} px{order.artwork.fileName ? ` · ${order.artwork.fileName}` : ""}
                            </p>
                        ) : null}
                    </Panel>

                    <Panel>
                        <CardTitle>Progress</CardTitle>
                        <div className="mt-5">
                            <Ladder steps={ladderSteps(job)} />
                        </div>
                        {job.status === "CANCELLED" && <Note className="mt-5">{job.declineReason ? `Declined: ${job.declineReason}` : "This job was cancelled."}</Note>}
                        {job.status === "READY" && (
                            <Note tone="info" className="mt-5">
                                The agent has been told the material is ready. When they arrive, enter the pickup code from their phone to hand it over.
                            </Note>
                        )}
                    </Panel>

                    <Panel>
                        <CardTitle>Specs and price</CardTitle>
                        <div className="mt-3">
                            <SpecList specs={job.specs} />
                        </div>
                        <div className="mt-3 border-t border-line pt-2">
                            {order?.site.size && <KeyRow label="Size" value={order.site.size} />}
                            <KeyRow label="Quoted cost" value={job.quotedCost ? formatMoney(job.quotedCost, { paise: "always" }) : "To agree"} strong />
                            <p className="text-xs text-dim">{job.quotedCost ? "Your quoted price — paid into your ADX wallet, net of tax, once ADX approves the cost." : "No price is on this job yet; agree it with ADX before printing."}</p>
                            {earned && <KeyRow label="Credited to your wallet" value={<span className="text-success">{formatMoney(earned.amount, { paise: "always" })}</span>} className="mt-2" />}
                            {earned && <p className="text-xs text-dim">{`${formatWhen(earned.createdAt)} · net of tax${earned.note ? ` · ${earned.note}` : ""}`}</p>}
                        </div>
                        {job.notes && (
                            <div className="mt-4 rounded-md bg-ground px-4 py-3">
                                <p className="text-xs font-semibold uppercase tracking-wide text-dim">Notes from ADX</p>
                                <p className="mt-1 text-sm text-ink">{job.notes}</p>
                            </div>
                        )}
                    </Panel>

                    {order && (
                        <Panel>
                            <div className="flex items-center justify-between gap-3">
                                <CardTitle>Where it goes up</CardTitle>
                                {map && (
                                    <a href={map} target="_blank" rel="noopener noreferrer" className="text-sm font-semibold text-ink hover:underline">
                                        Open in maps ↗
                                    </a>
                                )}
                            </div>
                            <p className="mt-2 text-sm font-medium text-ink">{order.site.title}</p>
                            {place && <p className="mt-0.5 text-sm text-dim">{place}</p>}
                            <div className="mt-3 border-t border-line pt-2">
                                {order.campaignName && <KeyRow label="Campaign" value={order.campaignName} />}
                                <KeyRow label="Booking" value={ref} />
                                {order.startDate && <KeyRow label="Goes up" value={`${formatDay(order.startDate)}${order.endDate ? ` – ${formatDay(order.endDate)}` : ""}`} />}
                            </div>
                            <div className="mt-3 border-t border-line pt-4">
                                <p className="text-sm font-medium text-dim">Collected by</p>
                                {order.agent ? (
                                    <div className="mt-2 flex items-center justify-between gap-4">
                                        <div>
                                            <p className="text-sm font-semibold text-ink">{order.agent.name ?? "ADX agent"}</p>
                                            {order.agent.mobile && <p className="text-xs text-dim">{order.agent.mobile}</p>}
                                        </div>
                                        {order.agent.mobile && (
                                            <a href={`tel:${order.agent.mobile}`} className={cn(outlineButton, "gap-2 px-4")}>
                                                <Phone className="size-4" aria-hidden />
                                                Call
                                            </a>
                                        )}
                                    </div>
                                ) : (
                                    <p className="mt-1 text-sm text-dim">ADX assigns the agent who collects; their name appears here once they are on the booking.</p>
                                )}
                            </div>
                        </Panel>
                    )}
                </div>

                <div className="content-start">
                    <Panel className="lg:sticky lg:top-[81px]">
                        <CardTitle>Next step</CardTitle>
                        {failure && (
                            <p role="alert" className="mt-3 text-sm text-danger">
                                {failure}
                            </p>
                        )}
                        {moves.accept && (
                            <>
                                <p className="mt-2 text-sm text-dim">ADX has sent this print to your shop. Accept it to start, or decline with a reason.</p>
                                <button type="button" disabled={busy !== null} onClick={() => void move("accept", () => partnerService.acceptJob(job.id), "Job accepted")} className={cn(brandButton, "mt-4 w-full")}>
                                    {busy === "accept" ? "Accepting…" : "Accept the job"}
                                </button>
                            </>
                        )}
                        {moves.printing && (
                            <>
                                <p className="mt-2 text-sm text-dim">Accepted. Mark it as printing when the press starts.</p>
                                <button type="button" disabled={busy !== null} onClick={() => void move("printing", () => partnerService.markPrinting(job.id), "Marked as printing")} className={cn(brandButton, "mt-4 w-full")}>
                                    {busy === "printing" ? "Saving…" : "Mark as printing"}
                                </button>
                            </>
                        )}
                        {moves.decline && (
                            <button type="button" disabled={busy !== null} onClick={() => setDeclining(true)} className={cn(outlineButton, "mt-3 w-full")}>
                                Decline
                            </button>
                        )}
                        {moves.ready && (
                            <>
                                <p className="mt-2 text-sm text-dim">When the print is finished, mark it ready — the agent is told to come and collect.</p>
                                <button type="button" disabled={busy !== null} onClick={() => void move("ready", () => partnerService.markReady(job.id), "Marked ready for pickup — the agent is told")} className={cn(brandButton, "mt-4 w-full")}>
                                    {busy === "ready" ? "Saving…" : "Mark ready for pickup"}
                                </button>
                            </>
                        )}
                        {moves.handover && <Handover job={job} onDone={(next) => setMoved(next)} />}
                        {job.status === "COLLECTED" && (
                            <Note tone="success" className="mt-3">
                                Handed over {formatWhen(job.handoverConfirmedAt ?? job.collectedAt)}. {job.costApprovedAt ? "The cost is approved and credited to your wallet." : "The print charge is credited to your wallet once ADX approves the cost."}
                            </Note>
                        )}
                        {job.status === "CANCELLED" && <p className="mt-2 text-sm text-dim">Nothing more to do on this job.</p>}
                        {(job.status === "PRINTING" || job.status === "READY") && (
                            <p className="mt-4 text-xs text-dim">
                                Printing has started, so this job can no longer be declined here. If something has gone wrong, contact ADX from{" "}
                                <Link href="/partner/help" className="underline underline-offset-2">
                                    Help & support
                                </Link>
                                .
                            </p>
                        )}
                    </Panel>
                </div>
            </div>

            <DeclineDialog
                open={declining && moves.decline}
                onClose={() => setDeclining(false)}
                onDeclined={(next) => {
                    setMoved(next);
                    setDeclining(false);
                }}
                job={job}
            />
        </ApplicantGate>
    );
}

/** The agent's pickup code, pasted: `POST …/handover { qrToken }` — the job goes COLLECTED with the scan on record. */
function Handover({ job, onDone }: { job: PrintJob; onDone: (job: PrintJob) => void }) {
    const [code, setCode] = React.useState("");
    const [busy, setBusy] = React.useState(false);
    const [failure, setFailure] = React.useState<string | null>(null);

    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!code.trim() || busy) return;
        setBusy(true);
        setFailure(null);
        try {
            onDone(await partnerService.handover(job.id, code));
            toast.success("Handed over. ADX has the handover on record.");
        } catch (caught) {
            setFailure(partnerMessage(caught, "Could not read that code."));
        } finally {
            setBusy(false);
        }
    };

    return (
        <form onSubmit={submit} id="handover" className="mt-2 scroll-mt-24">
            <p className="text-sm text-dim">Ask the agent to open the pickup code for this booking in their ADX app, and paste the code here.</p>
            <div className="mt-4">
                <Field label="Pickup code" htmlFor="handover-code">
                    <textarea id="handover-code" value={code} onChange={(event) => setCode(event.target.value)} rows={3} placeholder="Paste the code from the agent's phone" className={cn(textareaClass, "font-mono text-xs")} autoComplete="off" spellCheck={false} />
                </Field>
            </div>
            {failure && (
                <p role="alert" className="mt-3 text-sm text-danger">
                    {failure}
                </p>
            )}
            <button type="submit" disabled={busy || !code.trim()} className={cn(brandButton, "mt-4 w-full")}>
                {busy ? "Reading…" : "Hand over"}
            </button>
            <p className="mt-3 text-xs text-dim">Scanning the QR with a camera is in the ADX app on your phone — the same code, read for you.</p>
        </form>
    );
}

/** A reason is mandatory, and ADX reads it; a job from a quote request is reopened for the other shops. */
function DeclineDialog({ open, onClose, onDeclined, job }: { open: boolean; onClose: () => void; onDeclined: (job: PrintJob) => void; job: PrintJob }) {
    const [reason, setReason] = React.useState("");
    const [busy, setBusy] = React.useState(false);
    const [failure, setFailure] = React.useState<string | null>(null);

    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        const problem = declineProblem(reason);
        if (problem) return setFailure(problem);
        setBusy(true);
        setFailure(null);
        try {
            const next = await partnerService.declineJob(job.id, reason.trim());
            toast.success(next.reopenedRequestId ? "Job declined. ADX reopened the request for the other shops." : "Job declined.");
            setReason("");
            onDeclined(next);
        } catch (caught) {
            setFailure(partnerMessage(caught, "Could not decline the job."));
        } finally {
            setBusy(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={(next) => !next && !busy && onClose()}>
            <DialogContent className="max-w-[480px] rounded-lg border-line p-6">
                <DialogHeader>
                    <DialogTitle className="text-lg font-semibold text-ink">Decline this job?</DialogTitle>
                    <DialogDescription className="text-sm text-dim">Say why. ADX reads the reason, and if the job came from a quote request it is reopened for the other shops.</DialogDescription>
                </DialogHeader>
                <form onSubmit={submit} className="grid gap-4">
                    <Field label="Reason" htmlFor="decline-reason">
                        <textarea id="decline-reason" value={reason} onChange={(event) => setReason(event.target.value)} rows={4} maxLength={500} placeholder="Out of the material, no capacity this week, the size is beyond our press…" className={textareaClass} />
                    </Field>
                    {failure && (
                        <p role="alert" className="text-sm text-danger">
                            {failure}
                        </p>
                    )}
                    <div className="flex justify-end gap-3">
                        <button type="button" onClick={onClose} disabled={busy} className={outlineButton}>
                            Keep the job
                        </button>
                        <button type="submit" disabled={busy} className={cn(brandButton, "bg-danger hover:bg-danger/90")}>
                            {busy ? "Declining…" : "Decline the job"}
                        </button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    );
}
