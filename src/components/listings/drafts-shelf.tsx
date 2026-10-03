"use client";

import * as React from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { outlineButton } from "@/components/publisher/parts";
import { messageOf } from "@/lib/api-client";
import { listingEditorService, type ListingDraft } from "@/services/listing-editor";
import { relativeTime } from "@/services/publisher-workspace";

/** "just now", "3 hours ago", "2 days ago". */
function savedAgo(iso: string): string {
    const ago = relativeTime(iso);
    return ago === "Active now" ? "just now" : ago;
}

/**
 * QR-8: the spaces saved half-way, above the list on the All shelf — each
 * with Continue (the wizard picks it up at the step it stopped on, phone or
 * web) and Throw away, which asks first because a draft thrown away is gone.
 */
export function DraftsShelf({ drafts, onChanged }: { drafts: ListingDraft[]; onChanged: () => void }) {
    const [confirm, setConfirm] = React.useState<ListingDraft | null>(null);
    const [busy, setBusy] = React.useState(false);

    if (drafts.length === 0) return null;

    const discard = async () => {
        if (!confirm) return;
        setBusy(true);
        try {
            await listingEditorService.deleteDraft(confirm.id);
            toast.success("Draft thrown away");
            setConfirm(null);
            onChanged();
        } catch (caught) {
            toast.error(messageOf(caught, "Could not remove the draft."));
        } finally {
            setBusy(false);
        }
    };

    return (
        <section aria-labelledby="drafts-heading" className="mb-6">
            <h2 id="drafts-heading" className="text-xs font-semibold uppercase tracking-[0.08em] text-dim">
                Saved for later · {drafts.length}
            </h2>
            <ul className="mt-3 divide-y divide-line overflow-hidden rounded-lg border border-line bg-white">
                {drafts.map((draft) => (
                    <li key={draft.id} className="flex flex-wrap items-center justify-between gap-4 px-4 py-3.5">
                        <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-ink">{draft.title?.trim() || "Untitled space"}</p>
                            <p className="mt-0.5 text-xs text-dim">
                                {draft.displayId} · {draft.category ? `${draft.category.charAt(0).toUpperCase()}${draft.category.slice(1).toLowerCase()} · ` : ""}saved {savedAgo(draft.updatedAt)}
                            </p>
                        </div>
                        <div className="flex items-center gap-4">
                            <span className="inline-flex h-[22px] items-center rounded-[4px] bg-ground px-2 text-[11px] font-semibold uppercase tracking-wide text-dim">Draft</span>
                            <button type="button" onClick={() => setConfirm(draft)} className="text-sm font-medium text-dim hover:text-ink">
                                Throw away
                            </button>
                            <Link href={`/publisher/listings/new?draft=${encodeURIComponent(draft.id)}`} className={outlineButton}>
                                Continue
                            </Link>
                        </div>
                    </li>
                ))}
            </ul>
            <Dialog open={confirm !== null} onOpenChange={(next) => !next && setConfirm(null)}>
                <DialogContent className="max-w-[440px] rounded-lg border-line p-6">
                    <DialogHeader>
                        <DialogTitle className="text-lg font-semibold text-ink">Throw this draft away?</DialogTitle>
                        <DialogDescription className="text-sm text-dim">
                            {confirm?.title?.trim() || "This space"} ({confirm?.displayId}) will be gone for good — on the website and in the ADX app.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="mt-2 flex justify-end gap-3">
                        <button type="button" onClick={() => setConfirm(null)} className={outlineButton}>
                            Keep it
                        </button>
                        <button type="button" onClick={() => void discard()} disabled={busy} className="inline-flex h-10 items-center rounded-md bg-danger px-5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50">
                            {busy ? "Throwing away…" : "Throw away"}
                        </button>
                    </div>
                </DialogContent>
            </Dialog>
        </section>
    );
}
