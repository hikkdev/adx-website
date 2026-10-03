"use client";

import * as React from "react";
import Link from "next/link";
import { CheckCircle2, ChevronLeft } from "lucide-react";
import { messageOf } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { PageHeading } from "@/components/workspace/page-heading";
import { btnOutline, btnPrimary } from "@/components/advertiser/bits";
import { StarPicker } from "@/components/disputes/dispute-detail";
import type { Party } from "@/services/party";
import { helpHref, ticketHref, ticketsHref } from "@/components/account/routes";
import { AttachmentPicker, type PickedAttachment } from "./attachment-picker";
import { FEEDBACK_CATEGORIES, feedbackProblem, ratingTicket, STOOD_OUT, supportService, ticketReference, type FeedbackCategory, type SupportTicket } from "@/services/support";

/**
 * The app's Suggest a feature: Idea / Problem / Content issue, what the
 * person would like, and an optional screenshot. Feedback is a support
 * ticket with `kind: 'FEEDBACK'` and an FB- number — the desk works it from
 * the same queue, the person finds it in their tickets, and the thanks
 * prints the number the create call returned.
 */
export function FeedbackForm({ party }: { party: Party }) {
    const [category, setCategory] = React.useState<FeedbackCategory>("IDEA");
    const [text, setText] = React.useState("");
    const [screenshot, setScreenshot] = React.useState<PickedAttachment | null>(null);
    const [busy, setBusy] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);
    const [sent, setSent] = React.useState<SupportTicket | null>(null);

    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        const problem = feedbackProblem(text);
        if (problem) return setError(problem);
        if (screenshot?.busy) return setError("The screenshot is still uploading.");
        setBusy(true);
        setError(null);
        try {
            setSent(await supportService.create({ kind: "FEEDBACK", description: text.trim(), category, attachmentUrls: screenshot?.url ? [screenshot.url] : [] }));
        } catch (caught) {
            setError(messageOf(caught, "Could not send your feedback."));
        } finally {
            setBusy(false);
        }
    };

    if (sent) return <Submitted party={party} ticket={sent} title="Thanks, it's logged" line="ADX reads every suggestion. If it needs an answer, it comes on this ticket." />;

    return (
        <>
            <Back party={party} />
            <div className="mt-4">
                <PageHeading title="Suggest a feature" subtitle="An idea, a problem, or something wrong in what ADX shows" />
            </div>
            <form onSubmit={(event) => void submit(event)} className="mt-6 max-w-[720px] rounded-lg border border-line bg-white p-6" noValidate>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-dim">Category</p>
                <Chips options={FEEDBACK_CATEGORIES} value={category} onChange={setCategory} />
                <label htmlFor="feedback-text" className="mt-5 block text-[11px] font-semibold uppercase tracking-wide text-dim">
                    Tell us more
                </label>
                <textarea
                    id="feedback-text"
                    value={text}
                    onChange={(event) => setText(event.target.value)}
                    rows={5}
                    maxLength={4000}
                    placeholder="What would make ADX better for you?"
                    className="mt-2 w-full rounded-md border border-line bg-white px-3 py-2.5 text-sm text-ink placeholder:text-dim focus:border-ink focus:outline-none"
                />
                <p className="mt-5 text-[11px] font-semibold uppercase tracking-wide text-dim">Screenshot (optional)</p>
                <AttachmentPicker className="mt-2" value={screenshot} onChange={setScreenshot} label="Add a screenshot" accept="image/*" onError={setError} />
                {error && (
                    <p role="alert" className="mt-4 text-sm text-danger">
                        {error}
                    </p>
                )}
                <div className="mt-5 flex flex-wrap justify-between gap-3">
                    <Link href={`${helpHref(party)}/rate`} className="self-center text-sm font-medium text-ink underline underline-offset-4 hover:text-brand">
                        Rate your week with ADX
                    </Link>
                    <button type="submit" className={btnPrimary} disabled={busy}>
                        {busy ? "Sending…" : "Submit feedback"}
                    </button>
                </div>
            </form>
        </>
    );
}

/**
 * The app's Rate your experience: "How was your week with ADX?", five stars
 * with a word under them, what stood out, and an optional line. It rides
 * the ticket domain — a FEEDBACK ticket with the score as a column and the
 * chips as tags — so ADX can count it rather than read prose.
 */
export function RateExperience({ party }: { party: Party }) {
    const [stars, setStars] = React.useState(0);
    const [tags, setTags] = React.useState<string[]>([]);
    const [note, setNote] = React.useState("");
    const [busy, setBusy] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);
    const [sent, setSent] = React.useState<SupportTicket | null>(null);

    const toggle = (tag: string) => setTags((current) => (current.includes(tag) ? current.filter((entry) => entry !== tag) : [...current, tag]));

    const send = async (event: React.FormEvent) => {
        event.preventDefault();
        if (stars === 0) return setError("Pick a star first — that is the part ADX reads.");
        setBusy(true);
        setError(null);
        try {
            setSent(await supportService.create(ratingTicket(stars, tags, note)));
        } catch (caught) {
            setError(messageOf(caught, "Could not send that."));
        } finally {
            setBusy(false);
        }
    };

    if (sent) return <Submitted party={party} ticket={sent} title="Thanks for the rating" line="It goes to the team that runs ADX, beside everyone else's." />;

    return (
        <>
            <Back party={party} />
            <div className="mt-4">
                <PageHeading title="Rate your experience" />
            </div>
            <form onSubmit={(event) => void send(event)} className="mt-6 max-w-[560px] rounded-lg border border-line bg-white p-6" noValidate>
                <p className="text-center text-base font-semibold text-ink">How was your week with ADX?</p>
                <div className="mt-3">
                    <StarPicker value={stars} onChange={setStars} />
                </div>
                <p className="mt-4 text-[11px] font-semibold uppercase tracking-wide text-dim">What stood out</p>
                <div className="mt-2 flex flex-wrap gap-2">
                    {STOOD_OUT.map((tag) => (
                        <button key={tag} type="button" aria-pressed={tags.includes(tag)} onClick={() => toggle(tag)} className={cn("h-8 rounded-full border px-4 text-sm", tags.includes(tag) ? "border-ink bg-ink text-white" : "border-line bg-white text-ink hover:border-ink")}>
                            {tag}
                        </button>
                    ))}
                </div>
                <label htmlFor="rate-note" className="mt-5 block text-[11px] font-semibold uppercase tracking-wide text-dim">
                    Anything else
                </label>
                <textarea id="rate-note" value={note} onChange={(event) => setNote(event.target.value)} rows={3} maxLength={4000} placeholder="Optional, but it helps" className="mt-2 w-full rounded-md border border-line bg-white px-3 py-2.5 text-sm text-ink placeholder:text-dim focus:border-ink focus:outline-none" />
                {error && (
                    <p role="alert" className="mt-4 text-sm text-danger">
                        {error}
                    </p>
                )}
                <div className="mt-5 flex justify-end">
                    <button type="submit" className={btnPrimary} disabled={busy}>
                        {busy ? "Sending…" : "Send feedback"}
                    </button>
                </div>
            </form>
        </>
    );
}

/** The submitted state: the check, the thanks, the FB- number and the way to the ticket. */
function Submitted({ party, ticket, title, line }: { party: Party; ticket: SupportTicket; title: string; line: string }) {
    return (
        <>
            <Back party={party} />
            <section className="mt-6 flex max-w-[560px] flex-col items-center gap-3 rounded-lg border border-line bg-white px-6 py-10 text-center">
                <CheckCircle2 className="size-12 text-success" aria-hidden />
                <p className="text-lg font-semibold text-ink">{title}</p>
                <p className="text-sm text-dim">{line}</p>
                <Link href={ticketHref(party, ticket.id)} className="rounded-full bg-ground px-3 py-1 text-sm font-semibold text-ink hover:text-brand">
                    {ticketReference(ticket)}
                </Link>
                <div className="mt-2 flex flex-wrap justify-center gap-2">
                    <Link href={ticketsHref(party)} className={btnOutline}>
                        View my tickets
                    </Link>
                    <Link href={helpHref(party)} className={btnPrimary}>
                        Back to help
                    </Link>
                </div>
            </section>
        </>
    );
}

function Back({ party }: { party: Party }) {
    return (
        <Link href={helpHref(party)} className="inline-flex items-center gap-1 text-sm text-dim hover:text-ink">
            <ChevronLeft className="size-4" aria-hidden />
            Help &amp; support
        </Link>
    );
}

export function Chips<T extends string>({ options, value, onChange }: { options: { id: T; label: string }[]; value: T; onChange: (value: T) => void }) {
    return (
        <div role="radiogroup" className="mt-2 flex flex-wrap gap-2">
            {options.map((option) => (
                <button key={option.id} type="button" role="radio" aria-checked={value === option.id} onClick={() => onChange(option.id)} className={cn("h-8 rounded-full border px-4 text-sm", value === option.id ? "border-ink bg-ink text-white" : "border-line bg-white text-ink hover:border-ink")}>
                    {option.label}
                </button>
            ))}
        </div>
    );
}
