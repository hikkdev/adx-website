"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { messageOf } from "@/lib/api-client";
import { PageHeading } from "@/components/workspace/page-heading";
import { btnOutline, btnPrimary } from "@/components/advertiser/bits";
import type { Party } from "@/services/party";
import { helpHref, ticketHref } from "@/components/account/routes";
import { AttachmentPicker, type PickedAttachment } from "./attachment-picker";
import { Chips } from "./feedback";
import { ISSUE_CATEGORIES, issueProblem, supportService, type IssueCategory } from "@/services/support";

/**
 * The app's Report an issue: a category, what happened, an attachment. The
 * ticket's title is the first line of what happened — the server derives
 * it — and the answer arrives on the thread this form hands over to.
 */
export function ReportIssue({ party, initialCategory }: { party: Party; initialCategory?: string | null }) {
    const router = useRouter();
    const preset = ISSUE_CATEGORIES.find((c) => c.id === initialCategory)?.id ?? "APP_BUG";
    const [category, setCategory] = React.useState<IssueCategory>(preset);
    const [description, setDescription] = React.useState("");
    const [attachment, setAttachment] = React.useState<PickedAttachment | null>(null);
    const [busy, setBusy] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);

    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        const problem = issueProblem(description);
        if (problem) return setError(problem);
        if (attachment?.busy) return setError("The file is still uploading.");
        setBusy(true);
        setError(null);
        try {
            const ticket = await supportService.create({ kind: "ISSUE", description: description.trim(), category, attachmentUrls: attachment?.url ? [attachment.url] : [] });
            router.push(ticketHref(party, ticket.id));
        } catch (caught) {
            setError(messageOf(caught, "Could not raise the ticket."));
            setBusy(false);
        }
    };

    return (
        <>
            <PageHeading title="Report an issue" subtitle="ADX Support answers on the ticket this opens" />
            <form onSubmit={(event) => void submit(event)} className="mt-6 max-w-[720px] rounded-lg border border-line bg-white p-6" noValidate>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-dim">Category</p>
                <Chips options={ISSUE_CATEGORIES} value={category} onChange={setCategory} />
                <label htmlFor="issue-text" className="mt-5 block text-[11px] font-semibold uppercase tracking-wide text-dim">
                    What happened
                </label>
                <textarea
                    id="issue-text"
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                    rows={5}
                    maxLength={4000}
                    placeholder="Describe the issue. Include the job or order number if there is one."
                    className="mt-2 w-full rounded-md border border-line bg-white px-3 py-2.5 text-sm text-ink placeholder:text-dim focus:border-ink focus:outline-none"
                />
                <p className="mt-5 text-[11px] font-semibold uppercase tracking-wide text-dim">Attachment (optional)</p>
                <AttachmentPicker className="mt-2" value={attachment} onChange={setAttachment} onError={setError} />
                {error && (
                    <p role="alert" className="mt-4 text-sm text-danger">
                        {error}
                    </p>
                )}
                <div className="mt-5 flex justify-end gap-2">
                    <Link href={helpHref(party)} className={btnOutline}>
                        Cancel
                    </Link>
                    <button type="submit" className={btnPrimary} disabled={busy}>
                        {busy ? "Sending…" : "Report issue"}
                    </button>
                </div>
            </form>
        </>
    );
}
