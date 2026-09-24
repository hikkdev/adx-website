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
 * refused — because the request is the campaign's own record.
 */
export function RequestStatus({ campaign, reload }: CreativeProps) {
    const spots = campaign.spots.filter((spot) => spot.status !== "CANCELLED");
    const cards = useSpotCards(spots);
    const brief = briefOf(campaign);
    const stage = designRequestStage(campaign);
    const meta = STAGE_META[stage];
    const design = designedCreative(campaign);
    const notes = planPrefs.read(campaign.id).designNotes;
    const [asking, setAsking] = React.useState(false);
    const [note, setNote] = React.useState("");
    const [busy, setBusy] = React.useState<"accept" | "changes" | null>(null);
    const [error, setError] = React.useState<string | null>(null);

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
                    <Row label="Design payment" value="Not requested" />
                </div>
            </Card>

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
