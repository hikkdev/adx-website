"use client";

import * as React from "react";
import Link from "next/link";
import { FileText, Plus, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { PageHeading, Panel } from "@/components/workspace/page-heading";
import { brandButton, CardTitle, ErrorNote, inputClass, Loading, outlineButton } from "@/components/publisher/parts";
import { usePartnerAccount } from "@/components/partner/partner-context";
import { openFile } from "@/components/partner/parts";
import { cn } from "@/lib/utils";
import { emptyRateDraft, formatDay, isApplicant, partnerMessage, partnerService, rateCardBody, rateDraftOf, type PartnerProfile, type RateDraft } from "@/services/partner";

/**
 * The rate card — "a file plus structured rows". A shop with one on file is
 * asked first; a shop without is asked to quote with the others. Either
 * half is a rate card on its own: the shop's price list (a PDF or a photo,
 * private, purpose PARTNER_RATE_CARD) and rows — one per material, per
 * unit, at a rate, with a minimum where there is one.
 * `PUT /print-partners/me/rate-card` replaces the card whole.
 */
export default function PartnerRateCardPage() {
    const { partner, loaded, error, reload } = usePartnerAccount();
    if (!loaded) return <Loading label="Loading your rate card…" />;
    if (!partner) return <ErrorNote message={error ?? "Could not read your rate card."} onRetry={reload} />;
    return <RateCardEditor key={partner.rateCard.updatedAt ?? "none"} partner={partner} />;
}

function RateCardEditor({ partner }: { partner: PartnerProfile }) {
    const { replace } = usePartnerAccount();
    const card = partner.rateCard;
    const [drafts, setDrafts] = React.useState<RateDraft[]>(() => (card.rows.length ? card.rows.map(rateDraftOf) : [emptyRateDraft()]));
    const [file, setFile] = React.useState<{ id: string; url: string | null; name: string | null } | null>(card.fileId ? { id: card.fileId, url: card.fileUrl, name: null } : null);
    const [uploading, setUploading] = React.useState(false);
    const [busy, setBusy] = React.useState(false);
    const [failure, setFailure] = React.useState<string | null>(null);
    const [problems, setProblems] = React.useState<Record<number, string>>({});
    const inputRef = React.useRef<HTMLInputElement>(null);
    const back = isApplicant(partner) ? "/partner/apply" : "/partner/profile";

    const edit = (index: number, patch: Partial<RateDraft>) => setDrafts((current) => current.map((row, at) => (at === index ? { ...row, ...patch } : row)));

    const pick = async (chosen: File | undefined) => {
        if (!chosen) return;
        setFailure(null);
        setUploading(true);
        try {
            const stored = await partnerService.upload(chosen, "PARTNER_RATE_CARD");
            setFile({ id: stored.id, url: stored.url, name: chosen.name });
        } catch (caught) {
            setFailure(partnerMessage(caught, "The upload did not go through."));
        } finally {
            setUploading(false);
            if (inputRef.current) inputRef.current.value = "";
        }
    };

    const save = async () => {
        setFailure(null);
        const result = rateCardBody(drafts, file?.id ?? null);
        setProblems(result.problems);
        if (!result.body) {
            if (result.problem) setFailure(result.problem);
            return;
        }
        setBusy(true);
        try {
            const rateCard = await partnerService.setRateCard(result.body);
            replace({ ...partner, rateCard });
            toast.success("Rate card saved. ADX asks shops with a rate card first.");
        } catch (caught) {
            setFailure(partnerMessage(caught, "Could not save the rate card."));
        } finally {
            setBusy(false);
        }
    };

    return (
        <>
            <PageHeading
                title="Rate card"
                subtitle="A shop with a rate card on file is asked first. Upload your price list, list your rates, or both."
                actions={
                    <Link href={back} className={outlineButton}>
                        Back
                    </Link>
                }
            />
            {card.updatedAt && <p className="mt-2 text-xs text-dim">Last saved {formatDay(card.updatedAt)}.</p>}

            <div className="mt-6 grid gap-6">
                <Panel>
                    <CardTitle>Price list file</CardTitle>
                    <p className="mt-1 text-sm text-dim">A PDF or a photograph of your printed price list. Only ADX can open it.</p>
                    {file ? (
                        <div className="mt-4 flex flex-wrap items-center gap-3 rounded-lg border border-line px-4 py-3">
                            <span className="flex size-10 items-center justify-center rounded-md bg-ground text-dim">
                                <FileText className="size-5" aria-hidden />
                            </span>
                            <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-medium text-ink">{file.name ?? "A file is on record"}</p>
                                <p className="text-xs text-dim">{file.name ? "Uploaded — save the rate card to keep it" : "Stored privately with ADX"}</p>
                            </div>
                            {file.url && (
                                <button type="button" onClick={() => void openFile(file.url!, file.name ?? "rate-card")} className="text-sm font-semibold text-ink hover:underline">
                                    Open
                                </button>
                            )}
                            <button type="button" onClick={() => setFile(null)} className="text-sm font-semibold text-danger hover:underline">
                                Remove
                            </button>
                        </div>
                    ) : null}
                    <button type="button" disabled={uploading} onClick={() => inputRef.current?.click()} className={cn(outlineButton, "mt-4 gap-2")}>
                        <Upload className="size-4" aria-hidden />
                        {uploading ? "Uploading…" : file ? "Replace the file" : "Choose a file"}
                    </button>
                    <input ref={inputRef} type="file" accept="application/pdf,image/jpeg,image/png,image/webp" className="sr-only" aria-label="Choose the price list file" onChange={(event) => void pick(event.target.files?.[0])} />
                </Panel>

                <Panel>
                    <CardTitle>Rates</CardTitle>
                    <p className="mt-1 text-sm text-dim">One line per material. The rate is per unit — sq ft, piece, running ft. Size class, minimum and notes are optional.</p>
                    <div className="mt-4 overflow-x-auto">
                        <table className="w-full min-w-[820px] text-sm">
                            <thead>
                                <tr className="text-left text-xs font-medium text-dim">
                                    <th scope="col" className="pb-2 pr-2 font-medium">Material</th>
                                    <th scope="col" className="pb-2 pr-2 font-medium">Size class</th>
                                    <th scope="col" className="w-[110px] pb-2 pr-2 font-medium">Unit</th>
                                    <th scope="col" className="w-[120px] pb-2 pr-2 font-medium">Rate (₹)</th>
                                    <th scope="col" className="w-[100px] pb-2 pr-2 font-medium">Minimum</th>
                                    <th scope="col" className="pb-2 pr-2 font-medium">Notes</th>
                                    <th scope="col" className="w-10 pb-2">
                                        <span className="sr-only">Remove</span>
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {drafts.map((row, index) => (
                                    <React.Fragment key={index}>
                                        <tr>
                                            <td className="py-1 pr-2">
                                                <input aria-label={`Line ${index + 1} material`} value={row.material} onChange={(e) => edit(index, { material: e.target.value })} placeholder="Flex, vinyl, backlit…" className={inputClass} maxLength={80} />
                                            </td>
                                            <td className="py-1 pr-2">
                                                <input aria-label={`Line ${index + 1} size class`} value={row.sizeClass} onChange={(e) => edit(index, { sizeClass: e.target.value })} placeholder="Up to 10×20 ft" className={inputClass} maxLength={60} />
                                            </td>
                                            <td className="py-1 pr-2">
                                                <input aria-label={`Line ${index + 1} unit`} value={row.unit} onChange={(e) => edit(index, { unit: e.target.value })} placeholder="sq ft" className={inputClass} maxLength={30} />
                                            </td>
                                            <td className="py-1 pr-2">
                                                <input aria-label={`Line ${index + 1} rate in rupees`} value={row.ratePerUnit} onChange={(e) => edit(index, { ratePerUnit: e.target.value.replace(/[^\d.]/g, "") })} inputMode="decimal" placeholder="0.00" className={inputClass} />
                                            </td>
                                            <td className="py-1 pr-2">
                                                <input aria-label={`Line ${index + 1} minimum quantity`} value={row.minQty} onChange={(e) => edit(index, { minQty: e.target.value.replace(/[^\d]/g, "") })} inputMode="numeric" placeholder="50" className={inputClass} />
                                            </td>
                                            <td className="py-1 pr-2">
                                                <input aria-label={`Line ${index + 1} notes`} value={row.notes} onChange={(e) => edit(index, { notes: e.target.value })} placeholder="Includes eyelets" className={inputClass} maxLength={300} />
                                            </td>
                                            <td className="py-1 text-right">
                                                {drafts.length > 1 && (
                                                    <button type="button" onClick={() => setDrafts((current) => current.filter((_, at) => at !== index))} aria-label={`Remove line ${index + 1}`} className="flex size-9 items-center justify-center rounded-md text-dim hover:bg-ground hover:text-danger">
                                                        <Trash2 className="size-4" aria-hidden />
                                                    </button>
                                                )}
                                            </td>
                                        </tr>
                                        {problems[index] && (
                                            <tr>
                                                <td colSpan={7} className="pb-2 text-xs text-danger" role="alert">
                                                    Line {index + 1}: {problems[index]}
                                                </td>
                                            </tr>
                                        )}
                                    </React.Fragment>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <button type="button" onClick={() => setDrafts((current) => [...current, emptyRateDraft()])} className={cn(outlineButton, "mt-4 gap-2")}>
                        <Plus className="size-4" aria-hidden />
                        Add a line
                    </button>
                </Panel>

                {failure && (
                    <p role="alert" className="text-sm text-danger">
                        {failure}
                    </p>
                )}
                <div className="flex flex-wrap gap-3">
                    <button type="button" onClick={() => void save()} disabled={busy || uploading} className={brandButton}>
                        {busy ? "Saving…" : "Save the rate card"}
                    </button>
                    <Link href={back} className={outlineButton}>
                        Cancel
                    </Link>
                </div>
            </div>
        </>
    );
}
