"use client";

import * as React from "react";
import { Sparkles } from "lucide-react";
import { messageOf } from "@/lib/api-client";
import { listingEditorService, type DescriptionBucket, type DescriptionContext } from "@/services/listing-editor";

/**
 * "Generate with AI" under the description (DR 02 step 5 in the app,
 * `listing-flow/description-assist.tsx`), over `/ai/listing-description`.
 * Two rules, both the server's:
 *
 * - no provider configured, or a read that failed: nothing is drawn. A
 *   button that explains it cannot work reads as broken.
 * - text in the box: the button refuses. Drafting over a publisher's own
 *   words is the one way this can destroy something, so clearing the box is
 *   the deliberate act that says the old wording is finished with.
 *
 * The allowance is per description — the wizard's draft key before the
 * listing exists, the listing's id after.
 */
export function DescriptionAssist({ bucket, current, context, onDrafted }: { bucket: DescriptionBucket; current: string; context: DescriptionContext; onDrafted: (text: string) => void }) {
    const bucketKey = "listingId" in bucket ? `l:${bucket.listingId}` : `d:${bucket.draftKey}`;
    const [quota, setQuota] = React.useState<{ key: string; available: boolean; used: number; quota: number; paid: boolean } | null>(null);
    const [busy, setBusy] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);
    const bucketRef = React.useRef(bucket);
    React.useEffect(() => {
        bucketRef.current = bucket;
    });

    React.useEffect(() => {
        let live = true;
        listingEditorService
            .descriptionQuota(bucketRef.current)
            .then((answer) => {
                if (live) setQuota({ key: bucketKey, ...answer });
            })
            .catch(() => {
                // An optional aid on a form that works without it: it fails quiet.
                if (live) setQuota({ key: bucketKey, available: false, used: 0, quota: 0, paid: false });
            });
        return () => {
            live = false;
        };
    }, [bucketKey]);

    if (!quota || quota.key !== bucketKey || !quota.available) return null;

    const hasText = current.trim() !== "";
    const spent = quota.used >= quota.quota;
    const left = Math.max(0, quota.quota - quota.used);

    const generate = async () => {
        setBusy(true);
        setError(null);
        try {
            const draft = await listingEditorService.generateDescription(bucket, current, context);
            onDrafted(draft.text);
            setQuota((q) => (q ? { ...q, used: draft.used, quota: draft.quota } : q));
        } catch (caught) {
            setError(messageOf(caught, "Could not write a draft just now."));
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="mt-3 flex flex-wrap items-center gap-3">
            <button type="button" onClick={() => void generate()} disabled={hasText || spent || busy} className="inline-flex h-9 items-center gap-2 rounded-md border border-line bg-white px-4 text-sm font-semibold text-ink hover:border-ink disabled:cursor-not-allowed disabled:opacity-50">
                <Sparkles className="size-4 text-brand-bright" aria-hidden />
                {busy ? "Writing…" : "Generate with AI"}
            </button>
            <p className="min-w-0 flex-1 text-xs text-dim">
                {hasText
                    ? "Clear the box first — generating will not write over what you have typed."
                    : spent
                      ? quota.paid
                          ? "You have used every draft for this description. Edit what you have, or write your own."
                          : "You have used your free drafts for this description. A subscription gives you more."
                      : `A starting point in four or five lines, from what you have filled in. ${left} left for this listing — edit it afterwards, it is yours.`}
            </p>
            {error && (
                <p role="alert" className="w-full text-xs text-danger">
                    {error}
                </p>
            )}
        </div>
    );
}
