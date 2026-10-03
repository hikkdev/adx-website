"use client";

import * as React from "react";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { Panel } from "@/components/workspace/page-heading";
import { brandButton, CardTitle, Chip, Crumbs, ErrorNote, Field, inputClass, KeyRow, Loading, outlineButton, textareaClass } from "@/components/publisher/parts";
import { useLoad } from "@/components/publisher/use-load";
import { ApplicantGate, Note, SpecList, useNow } from "@/components/partner/parts";
import { ApiError } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/services/publisher-workspace";
import {
    countdown,
    deadlinePassed,
    formatWhen,
    partnerMessage,
    partnerService,
    QUOTE_WORDS,
    quoteBody,
    quoteEditable,
    readable,
    requestOutcome,
    requestRef,
    signHref,
    signingFromError,
    standingQuote,
    type Quote,
    type QuoteRequest,
} from "@/services/partner";

/**
 * One quote request — the specs, the countdown, and the shop's quote: new,
 * edited, or withdrawn. One quote per request; sending again before the
 * deadline edits it, withdrawing leaves it re-sendable. The form closes
 * itself at the deadline rather than posting into a refusal. Read fresh by
 * id (`GET /print-partners/me/quote-requests/:id`), whatever its status.
 */
export default function PartnerQuotePage() {
    const { id } = useParams<{ id: string }>();
    const { data, error, loading, reload } = useLoad(`partner-quote:${id}`, () => readable(partnerService.quoteRequest(id), "Could not read this request."));
    /** The quote as the last send or withdrawal answered it. */
    const [mine, setMine] = React.useState<{ requestId: string; quote: Quote } | null>(null);
    const now = useNow();

    if (!data && loading) return <Loading label="Loading the request…" />;
    if (!data) {
        return (
            <>
                <Crumbs items={[{ label: "Quote requests", href: "/partner/quotes" }, { label: "Request" }]} />
                <div className="mt-6">
                    <ErrorNote message={error ?? "Could not read this request."} onRetry={reload} />
                </div>
            </>
        );
    }

    const request: QuoteRequest = mine && mine.requestId === data.id ? { ...data, myQuote: mine.quote } : data;
    const ref = requestRef(request);
    const outcome = requestOutcome(request, now);
    const closed = request.status !== "OPEN" || deadlinePassed(request.deadlineAt, now);
    const standing = standingQuote(request);

    return (
        <ApplicantGate what="Quote requests">
            <Crumbs items={[{ label: "Quote requests", href: "/partner/quotes" }, { label: ref }]} />
            <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-semibold tracking-tight text-ink">Booking {ref}</h1>
                    <p className="mt-2 text-sm text-dim">{[request.city, `Quotes close ${formatWhen(request.deadlineAt)}`].filter(Boolean).join(" · ")}</p>
                </div>
                <Chip tone={outcome.tone}>{outcome.label}</Chip>
            </div>
            {error && (
                <div className="mt-4">
                    <ErrorNote message={error} onRetry={reload} />
                </div>
            )}

            <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_360px]">
                <div className="grid min-w-0 content-start gap-6">
                    <Panel>
                        <div className="flex items-center justify-between gap-3">
                            <CardTitle>What ADX needs</CardTitle>
                            <span className={cn("text-sm font-semibold", closed ? "text-dim" : "text-warning")}>{request.status === "OPEN" ? countdown(request.deadlineAt, now) : outcome.label}</span>
                        </div>
                        <div className="mt-3">
                            <SpecList specs={request.specs} />
                        </div>
                        <div className="mt-2 border-t border-line pt-2">
                            {request.city && <KeyRow label="City" value={request.city} />}
                            <KeyRow label="Quotes close" value={formatWhen(request.deadlineAt)} />
                        </div>
                        {request.reinvitedAt && (
                            <Note tone="info" className="mt-4">
                                ADX asked again after the first deadline passed with no quote. This is the second and last window.
                            </Note>
                        )}
                    </Panel>

                    {request.status === "AWARDED" ? (
                        <Note tone={request.awarded ? "success" : "neutral"}>{request.awarded ? "Your quote was awarded. The job is in Jobs — accept it there to start." : "Another shop was awarded this print. Your quote stays on record."}</Note>
                    ) : request.status === "EXPIRED" ? (
                        <Note>This request expired without an award.</Note>
                    ) : request.status === "CANCELLED" ? (
                        <Note>ADX cancelled this request.</Note>
                    ) : closed ? (
                        <Note>Quotes closed at the deadline. ADX decides from what is in.</Note>
                    ) : null}

                    <Panel>
                        <CardTitle>How it is decided</CardTitle>
                        <p className="mt-2 text-sm text-dim">The lowest price wins; on a tie, the shorter turnaround, then a shop with a rate card on file. ADX may pick another quote only with a reason on record. Only ADX sees the other quotes.</p>
                    </Panel>
                </div>

                <div className="content-start">
                    <Panel className="lg:sticky lg:top-[81px]">
                        <CardTitle>{standing ? "Your quote" : "Quote this print"}</CardTitle>
                        {standing ? (
                            <div className="mt-3 flex items-center justify-between gap-3">
                                <p className="text-lg font-semibold text-ink">
                                    {formatMoney(standing.amount)} <span className="text-sm font-normal text-dim">· {standing.turnaroundDays} day{standing.turnaroundDays === 1 ? "" : "s"}</span>
                                </p>
                                <Chip tone={QUOTE_WORDS[standing.status].tone}>{QUOTE_WORDS[standing.status].label}</Chip>
                            </div>
                        ) : request.myQuote?.status === "WITHDRAWN" ? (
                            <p className="mt-2 text-sm text-dim">You withdrew your quote. Send another before the deadline if you change your mind.</p>
                        ) : closed ? (
                            <p className="mt-2 text-sm text-dim">You did not quote on this request.</p>
                        ) : null}
                        {standing?.note && <p className="mt-2 text-sm text-dim">“{standing.note}”</p>}
                        {quoteEditable(request, now) && <QuoteForm key={request.id} request={request} standing={standing} onChanged={(quote) => setMine({ requestId: request.id, quote })} onRefused={reload} />}
                    </Panel>
                </div>
            </div>
        </ApplicantGate>
    );
}

function QuoteForm({ request, standing, onChanged, onRefused }: { request: QuoteRequest; standing: Quote | null; onChanged: (quote: Quote) => void; onRefused: () => void }) {
    const router = useRouter();
    const [amount, setAmount] = React.useState(standing?.amount ?? "");
    const [turnaround, setTurnaround] = React.useState(standing ? String(standing.turnaroundDays) : "");
    const [note, setNote] = React.useState(standing?.note ?? "");
    const [busy, setBusy] = React.useState<"send" | "withdraw" | null>(null);
    const [failure, setFailure] = React.useState<string | null>(null);

    const refusal = (caught: unknown, fallback: string) => {
        const signing = signingFromError(caught);
        if (signing?.requestId) {
            toast.info("Quoting needs your service agreement signed first — Aadhaar OTP, about a minute.");
            router.push(signHref(signing.requestId, `/partner/quotes/${request.id}`));
            return;
        }
        setFailure(partnerMessage(caught, fallback));
        if (caught instanceof ApiError && (caught.code === "DEADLINE_PASSED" || caught.status === 409)) onRefused();
    };

    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        const result = quoteBody({ amount, turnaround, note });
        if ("problem" in result) return setFailure(result.problem);
        setBusy("send");
        setFailure(null);
        try {
            onChanged(await partnerService.submitQuote(request.id, result.body));
            toast.success(standing ? "Your quote is updated." : "Quote sent to ADX.");
        } catch (caught) {
            refusal(caught, "Could not send your quote.");
        } finally {
            setBusy(null);
        }
    };

    const withdraw = async () => {
        setBusy("withdraw");
        setFailure(null);
        try {
            onChanged(await partnerService.withdrawQuote(request.id));
            toast.success("Quote withdrawn. You can send another before the deadline.");
        } catch (caught) {
            refusal(caught, "Could not withdraw your quote.");
        } finally {
            setBusy(null);
        }
    };

    return (
        <form onSubmit={submit} className="mt-4 grid gap-4 border-t border-line pt-4">
            <div className="grid grid-cols-2 gap-3">
                <Field label="Price, all in (₹)" htmlFor="quote-amount">
                    <input id="quote-amount" value={amount} onChange={(event) => setAmount(event.target.value.replace(/[^\d.]/g, ""))} inputMode="decimal" placeholder="0.00" className={inputClass} />
                </Field>
                <Field label="Turnaround (days)" htmlFor="quote-days">
                    <input id="quote-days" value={turnaround} onChange={(event) => setTurnaround(event.target.value.replace(/[^\d]/g, "").slice(0, 3))} inputMode="numeric" placeholder="3" className={inputClass} />
                </Field>
            </div>
            <p className="-mt-2 text-xs text-dim">The price for the whole print as specified — material, printing and finishing. Turnaround runs from acceptance to ready for pickup; a shorter one wins a tie.</p>
            <Field label="Note to ADX (optional)" htmlFor="quote-note">
                <textarea id="quote-note" value={note} onChange={(event) => setNote(event.target.value)} rows={3} maxLength={500} placeholder="Material you would use, anything the specs leave open…" className={textareaClass} />
            </Field>
            {failure && (
                <p role="alert" className="text-sm text-danger">
                    {failure}
                </p>
            )}
            <button type="submit" disabled={busy !== null} className={cn(brandButton, "w-full")}>
                {busy === "send" ? "Sending…" : standing ? "Update my quote" : "Send my quote"}
            </button>
            {standing?.status === "SUBMITTED" && (
                <button type="button" onClick={() => void withdraw()} disabled={busy !== null} className={cn(outlineButton, "w-full")}>
                    {busy === "withdraw" ? "Withdrawing…" : "Withdraw my quote"}
                </button>
            )}
        </form>
    );
}
