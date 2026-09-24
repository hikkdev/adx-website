"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ApiError, messageOf } from "@/lib/api-client";
import { listingEditorService, requestedUpdatesOf, type ListingDocumentKind, type MyListing, type RequestedUpdate } from "@/services/listing-editor";
import { Note, Problem } from "./fields";
import type { StoredFile } from "./form-model";
import { DropZone, FileRow } from "./uploads";
import { ListingChrome, StepActions, TaskCard } from "./wizard-frame";

type Answer = { file: StoredFile | null; note: string };

/**
 * 26 · Requested updates (5204:82071): ADX's send-back reason, one request
 * at a time, each with the control that answers it — a clearer photo, a
 * corrected paper, a written clarification. "Submit corrected proof"
 * files the papers (`POST /supply/listings/:id/documents`) and sends the
 * listing back for review (`POST /listings/:id/submit`).
 */
export function ListingFixes({ listingId }: { listingId: string }) {
    const router = useRouter();
    const [state, setState] = React.useState<{ key: string; listing: MyListing | null; error: string | null }>({ key: "", listing: null, error: null });
    const [answers, setAnswers] = React.useState<Record<number, Answer>>({});
    const [busy, setBusy] = React.useState(false);
    const [problem, setProblem] = React.useState<string | null>(null);
    const filed = React.useRef<Set<number>>(new Set());

    React.useEffect(() => {
        let cancelled = false;
        listingEditorService
            .myListing(listingId)
            .then((listing) => {
                if (!cancelled) setState({ key: listingId, listing, error: listing ? null : "That listing is not in your inventory." });
            })
            .catch((caught: unknown) => {
                if (!cancelled) setState({ key: listingId, listing: null, error: caught instanceof ApiError && caught.status === 404 ? "That listing is not in your inventory." : messageOf(caught, "Could not load this listing.") });
            });
        return () => {
            cancelled = true;
        };
    }, [listingId]);

    const listing = state.key === listingId ? state.listing : null;
    const updates = React.useMemo(() => requestedUpdatesOf(listing?.rejectionReason), [listing?.rejectionReason]);
    const answer = (index: number): Answer => answers[index] ?? { file: null, note: "" };
    const write = (index: number, patch: Partial<Answer>) => setAnswers((current) => ({ ...current, [index]: { ...answer(index), ...patch } }));

    const kindFor = (update: RequestedUpdate): ListingDocumentKind => {
        const lower = `${update.title} ${update.detail}`.toLowerCase();
        if (/noc|owner permission|permission/.test(lower)) return "OWNER_NOC";
        if (/address proof|utility|bill|receipt/.test(lower)) return "ADDRESS_PROOF";
        if (/permit/.test(lower)) return "MUNICIPAL_PERMIT";
        if (/agreement|lease|licence|license/.test(lower)) return "DISPLAY_AGREEMENT";
        if (/\brc\b|registration/.test(lower)) return "VEHICLE_RC";
        return "OTHER";
    };

    const submit = async () => {
        if (!listing) return;
        const unanswered = updates.filter((u) => (u.kind === "ADDRESS" ? !answer(u.index).note.trim() && !answer(u.index).file : !answer(u.index).file));
        if (unanswered.length) {
            setProblem(`Still needed: ${unanswered.map((u) => u.title).join(", ")}.`);
            return;
        }
        setBusy(true);
        setProblem(null);
        try {
            for (const update of updates) {
                const a = answer(update.index);
                if (!a.file || filed.current.has(update.index)) continue;
                await listingEditorService.addDocument(listing.id, { kind: update.kind === "DOCUMENT" ? kindFor(update) : "OTHER", url: a.file.url });
                filed.current.add(update.index);
            }
            if (listing.status === "DRAFT") await listingEditorService.submit(listing.id);
            toast.success("Corrected proof sent to ADX");
            router.push(`/publisher/listings/${encodeURIComponent(listingId)}/status`);
        } catch (caught) {
            setProblem(messageOf(caught, "Could not send the corrected proof."));
        } finally {
            setBusy(false);
        }
    };

    const verb = (update: RequestedUpdate) => (update.kind === "PHOTO" ? "Replace the location photo" : update.kind === "DOCUMENT" ? `Replace the ${update.title.toLowerCase()}` : update.kind === "ADDRESS" ? "Clarify the address" : update.title);

    return (
        <ListingChrome crumb="Add a listing" chapter={4}>
            <TaskCard title="Requested updates" subtitle="Resolve each request below, then send the corrected proof back to ADX.">
                {state.key === listingId && state.error && <Problem>{state.error}</Problem>}
                {listing && updates.length === 0 && <Note>ADX left no written request on this listing. Ask from Help & support what to correct.</Note>}
                <div className="space-y-8">
                    {updates.map((update) => {
                        const a = answer(update.index);
                        return (
                            <section key={update.index}>
                                <h2 className="text-base font-semibold text-ink">
                                    {update.index}. {verb(update)}
                                </h2>
                                <p className="mt-2 text-sm text-dim">{update.kind === "PHOTO" ? "Upload one sharper wide-context photo for this request." : update.kind === "DOCUMENT" ? "Upload one corrected file for this request." : update.kind === "ADDRESS" ? "Add a short clarification for the address mismatch." : "Answer this request below."}</p>
                                <div className="mt-3 rounded-lg border border-line bg-white px-3.5 py-3.5">
                                    <p className="text-sm font-semibold text-ink">{update.title}</p>
                                    <p className="mt-0.5 text-xs text-dim">{update.detail}</p>
                                </div>
                                {update.kind === "DOCUMENT" && <p className="mt-4 text-sm font-semibold text-ink">Corrected {update.title.toLowerCase().includes("noc") || update.title.toLowerCase().includes("permission") ? "NOC" : "file"}</p>}
                                <div className="mt-3">
                                    {a.file ? (
                                        <FileRow file={a.file} status={{ label: "Ready to send", tone: "success" }} onRemove={() => write(update.index, { file: null })} />
                                    ) : update.kind === "PHOTO" ? (
                                        <DropZone title="Add a clearer location photo" caption="JPG or PNG" accept="image/*" purpose="VERIFICATION" buttonLabel={null} onStored={(file) => write(update.index, { file })} className="min-h-[130px]" />
                                    ) : update.kind === "DOCUMENT" ? (
                                        <DropZone title={`Drop corrected ${update.title.toLowerCase().includes("noc") || update.title.toLowerCase().includes("permission") ? "NOC" : "file"} here or browse`} caption="PDF or JPG · Max 5 MB" accept="application/pdf,image/*" purpose="VERIFICATION" max={5 * 1024 * 1024} onStored={(file) => write(update.index, { file })} className="min-h-[200px]" />
                                    ) : (
                                        <div className="space-y-3">
                                            <textarea value={a.note} onChange={(event) => write(update.index, { note: event.target.value })} rows={5} placeholder={update.kind === "ADDRESS" ? "Explain why the document address differs from this ad space address." : "Write your answer for the reviewer."} className="block w-full rounded-md border border-line bg-white px-4 py-3 text-sm text-ink placeholder:text-dim focus:border-ink focus:outline-none" />
                                            <Note className="text-xs">ADX has no field for a written note on the listing yet, so this stays here for your call with the reviewer. A file below is filed with the listing.</Note>
                                            <DropZone title="Attach a supporting file" caption="PDF or JPG · optional" accept="application/pdf,image/*" purpose="VERIFICATION" buttonLabel={null} onStored={(file) => write(update.index, { file })} compact className="min-h-[96px]" />
                                        </div>
                                    )}
                                </div>
                            </section>
                        );
                    })}
                </div>
                {problem && <div className="mt-5"><Problem>{problem}</Problem></div>}
            </TaskCard>
            <StepActions back="Back" backHref={`/publisher/listings/${encodeURIComponent(listingId)}/status`} primary="Submit corrected proof" onPrimary={() => void submit()} busy={busy} primaryDisabled={!listing || updates.length === 0} />
        </ListingChrome>
    );
}
