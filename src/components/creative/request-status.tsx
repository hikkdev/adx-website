"use client";

import * as React from "react";
import Link from "next/link";
import { creativeHref, type CreativeProps } from "@/components/creative/creative-screen";
import { useSpotCards } from "@/components/creative/use-spot-cards";
import { LabeledTextarea } from "@/components/planner/fields";
import { InlineError } from "@/components/planner/planner-shell";
import { messageOf } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { artworkSpec, audienceLabel, briefOf, CREATIVE_STATUS_META, creativesService, deliverablesLine, designedCreative, designRequestStage, spaceNames, STAGE_META } from "@/services/creatives";
import { planPrefs } from "@/services/planner";
import { rupees } from "@/services/booking";

function Row({ label, value }: { label: string; value: React.ReactNode }) {
    return (
        <div className="flex items-baseline justify-between gap-6 text-sm">
            <span className="text-dim">{label}</span>
            <span className="text-right font-medium text-ink">{value}</span>
        </div>
    );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <section className="rounded-xl border border-[rgba(204,204,204,0.5)] bg-white px-6 py-6">
            <h2 className="text-lg font-semibold leading-6 text-ink">{title}</h2>
            <div className="mt-4 space-y-3">{children}</div>
        </section>
    );
}

const TONE: Record<string, string> = {
    neutral: "bg-ground text-dim",
    info: "bg-[#e8f0fe] text-[#1a4fb4]",
    success: "bg-[#e6f4ec] text-[#1a6b3a]",
    warning: "bg-[#fff4e0] text-[#8a5a00]",
    danger: "bg-[#fdecec] text-[#8d0b0c]",
};

/**
 * 07 · Design request · Status and next steps (5204:69760). The frame
 * draws the "Awaiting quote" state; the same page carries the rest of the
 * story off the campaign — the design ADX made, awaiting your approval
 * (accept, or send back with a note), sent back, accepted, approved or
 * refused — because the request is the campaign's own record. DQ-1: the
 * desk's quote sits at the top while it awaits an answer — Accept starts
 * the design and puts "Design by ADX" on the charges; Decline leaves the
 * campaign to the advertiser's own artwork.
 */
export function RequestStatus({ campaign, replace, reload }: CreativeProps) {
    const spots = campaign.spots.filter((spot) => spot.status !== "CANCELLED");
    const cards = useSpotCards(spots);
    const brief = briefOf(campaign);
    const stage = designRequestStage(campaign);
    const meta = STAGE_META[stage];
    const design = designedCreative(campaign);
    const notes = planPrefs.read(campaign.id).designNotes;
    const [asking, setAsking] = React.useState(false);
    const [note, setNote] = React.useState("");
    const [busy, setBusy] = React.useState<"accept" | "changes" | "quote-accept" | "quote-decline" | null>(null);
    const [error, setError] = React.useState<string | null>(null);
    const quote = campaign.designQuoteStatus ? { amount: campaign.designQuoteAmount ?? null, status: campaign.designQuoteStatus, note: campaign.designQuoteNote ?? null, quotedAt: campaign.designQuotedAt ?? null, respondedAt: campaign.designQuoteRespondedAt ?? null } : null;

    const answerQuote = async (decision: "ACCEPTED" | "DECLINED") => {
        if (busy) return;
        setBusy(decision === "ACCEPTED" ? "quote-accept" : "quote-decline");
        setError(null);
        try {
            const updated = await creativesService.respondToQuote(campaign.id, decision);
            replace(updated);
            reload();
        } catch (caught) {
            setError(messageOf(caught, "Could not record your answer to the quote."));
        } finally {
            setBusy(null);
        }
    };

    const run = async (action: "accept" | "changes") => {
        if (!design || busy) return;
        setBusy(action);
        setError(null);
        try {
            if (action === "accept") await creativesService.accept(campaign.id, design.id);
            else await creativesService.requestChanges(campaign.id, design.id, note.trim());
            setAsking(false);
            setNote("");
            reload();
        } catch (caught) {
            setError(messageOf(caught, "Could not record that."));
        } finally {
            setBusy(null);
        }
    };

    const deliverables = deliverablesLine(spots.map((spot) => artworkSpec(spot, cards[spot.listingId] ?? null)));

    return (
        <div className="space-y-6">
            <Card title={meta.title}>
                <p className="text-sm text-dim">{meta.line}</p>
                <div className="space-y-4 pt-1">
                    <Row label="Campaign" value={campaign.name} />
                    <Row label="Selected spaces" value={spots.length ? spaceNames(spots) : "None yet"} />
                    <Row label="Request status" value={meta.status} />
                    <Row label="Design payment" value={quote?.status === "ACCEPTED" ? `${rupees(quote.amount)} · on the campaign's charges` : quote?.status === "QUOTED" ? `${rupees(quote.amount)} quoted` : quote?.status === "DECLINED" ? "Quote declined" : "Not requested"} />
                </div>
            </Card>

            {quote?.status === "QUOTED" && (
                <Card title="ADX's quote for the design work">
                    <p className="text-3xl font-semibold tracking-tight text-ink">{rupees(quote.amount)}</p>
                    <p className="text-xs text-dim">Plus GST · {quote.quotedAt ? `quoted ${new Date(quote.quotedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}` : "quoted by the ADX desk"}</p>
                    {quote.note && (
                        <p className="rounded-md bg-ground px-4 py-3 text-sm text-ink">
                            <span className="text-dim">From ADX · </span>
                            {quote.note}
                        </p>
                    )}
                    <p className="text-sm text-dim">Accept and the design starts; the fee is added to your campaign&apos;s charges as &ldquo;Design by ADX&rdquo; and paid with the booking. Decline and the campaign stays as it is — you supply the artwork yourself.</p>
                    {error && <InlineError message={error} />}
                    <div className="flex flex-wrap gap-3">
                        <button type="button" onClick={() => void answerQuote("ACCEPTED")} disabled={busy !== null} className="inline-flex h-12 items-center rounded-md bg-brand px-6 text-sm font-medium text-white hover:bg-[#a51b1b] disabled:opacity-60">
                            {busy === "quote-accept" ? "Accepting…" : `Accept the ${rupees(quote.amount)} quote`}
                        </button>
                        <button type="button" onClick={() => void answerQuote("DECLINED")} disabled={busy !== null} className="inline-flex h-12 items-center rounded-md border border-line bg-white px-6 text-sm font-medium text-ink hover:border-ink disabled:opacity-60">
                            {busy === "quote-decline" ? "Declining…" : "Decline"}
                        </button>
                    </div>
                </Card>
            )}

            {design && (
                <Card title={stage === "ARTWORK_READY" ? "Approve the design ADX made" : "The design ADX made"}>
                    <div className="flex items-center gap-3">
                        <span className={cn("rounded-full px-2.5 py-1 text-xs font-semibold", TONE[CREATIVE_STATUS_META[design.status].tone])}>{CREATIVE_STATUS_META[design.status].label}</span>
                        {design.submittedAt && <span className="text-xs text-dim">{new Date(design.submittedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</span>}
                    </div>
                    {design.fileUrl && (
                        <a href={design.fileUrl} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-lg border border-line bg-ground">
                            <img src={design.fileUrl} alt="The design ADX made" className="mx-auto max-h-[420px] w-auto object-contain" />
                        </a>
                    )}
                    {design.fileName && <p className="text-xs text-dim">{design.fileName}</p>}
                    {design.reviewNote && (
                        <p className="rounded-md bg-ground px-4 py-3 text-sm text-ink">
                            <span className="text-dim">{stage === "CHANGES_REQUESTED" ? "Your note · " : "Note from ADX · "}</span>
                            {design.reviewNote}
                        </p>
                    )}
                    {error && <InlineError message={error} />}
                    {stage === "ARTWORK_READY" &&
                        (asking ? (
                            <div className="space-y-3">
                                <LabeledTextarea label="What should change?" value={note} onChange={setNote} rows={3} placeholder="The logo is too small and the offer should read 20% off" />
                                <div className="flex flex-wrap gap-3">
                                    <button type="button" onClick={() => void run("changes")} disabled={note.trim().length < 3 || busy !== null} className="inline-flex h-12 items-center rounded-md bg-brand px-6 text-sm font-medium text-white hover:bg-[#a51b1b] disabled:opacity-60">
                                        {busy === "changes" ? "Sending…" : "Send it back"}
                                    </button>
                                    <button type="button" onClick={() => setAsking(false)} disabled={busy !== null} className="inline-flex h-12 items-center rounded-md border border-line bg-white px-6 text-sm font-medium text-ink hover:border-ink">
                                        Cancel
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <div className="flex flex-wrap gap-3">
                                <button type="button" onClick={() => void run("accept")} disabled={busy !== null} className="inline-flex h-12 items-center rounded-md bg-brand px-6 text-sm font-medium text-white hover:bg-[#a51b1b] disabled:opacity-60">
                                    {busy === "accept" ? "Approving…" : "Approve this design"}
                                </button>
                                <button type="button" onClick={() => setAsking(true)} disabled={busy !== null} className="inline-flex h-12 items-center rounded-md border border-line bg-white px-6 text-sm font-medium text-ink hover:border-ink">
                                    Request changes
                                </button>
                            </div>
                        ))}
                </Card>
            )}

            <Card title="Submitted creative brief">
                {brief ? (
                    <>
                        <p className="text-sm text-dim">{brief.objective}</p>
                        <p className="text-sm font-medium text-ink">Audience · {audienceLabel(campaign.persona) ?? "Not chosen"}</p>
                        <p className="text-sm text-dim">{brief.keyMessage}</p>
                        {notes && <p className="text-sm text-dim">Notes · {notes}</p>}
                        <p className="text-sm text-dim">Deliverables · {deliverables}</p>
                    </>
                ) : (
                    <p className="text-sm text-dim">
                        No brief yet.{" "}
                        <Link href={creativeHref(campaign.id, "brief")} className="font-medium text-brand underline underline-offset-2">
                            Write the design brief
                        </Link>
                    </p>
                )}
            </Card>

            <Card title="What you can do now">
                {stage === "ARTWORK_READY" ? (
                    <>
                        <p className="text-sm text-dim">Approve the design above, or send it back with what to change. Nothing prints until you approve it.</p>
                        <p className="text-sm text-dim">Once approved, the ADX desk checks the artwork against each space and the booking can go to payment.</p>
                    </>
                ) : stage === "APPROVED" ? (
                    <>
                        <p className="text-sm text-dim">The artwork is approved. Return to the campaign to complete the booking and pay.</p>
                        <p className="text-sm text-dim">Printing starts after payment; installation proofs land under Delivery proofs.</p>
                    </>
                ) : stage === "QUOTED" ? (
                    <>
                        <p className="text-sm text-dim">Answer the quote above. Nothing is designed, and nothing is charged, until you accept it.</p>
                        <p className="text-sm text-dim">The design fee is paid with the campaign, not separately.</p>
                    </>
                ) : stage === "QUOTE_DECLINED" ? (
                    <>
                        <p className="text-sm text-dim">Your media campaign remains a draft. Upload your own artwork from the campaign, or contact support for a fresh quote.</p>
                    </>
                ) : stage === "DESIGNING" ? (
                    <>
                        <p className="text-sm text-dim">ADX is designing from your brief. The design appears here for your approval; nothing prints until you approve it.</p>
                    </>
                ) : (
                    <>
                        <p className="text-sm text-dim">Your media campaign remains a draft. Design work starts after you approve the separate quote.</p>
                        <p className="text-sm text-dim">You will review the quoted deliverables and cost before committing. Once artwork is ready, return to the campaign to upload it and complete your booking.</p>
                    </>
                )}
            </Card>

            <div className="flex flex-col items-start gap-6">
                <Link href={`/advertiser/campaigns/${encodeURIComponent(campaign.id)}/details`} className="inline-flex h-12 items-center rounded-md bg-brand px-7 text-sm font-medium text-white hover:bg-[#a51b1b]">
                    View campaign draft
                </Link>
                <Link href="/advertiser/help" className="inline-flex h-12 items-center rounded-md border border-line bg-white px-6 text-sm font-medium text-ink hover:border-ink">
                    Contact support
                </Link>
            </div>
        </div>
    );
}
