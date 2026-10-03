"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { toast } from "sonner";
import { ApiError, messageOf } from "@/lib/api-client";
import { PageHeading } from "@/components/workspace/page-heading";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAdvertiser } from "@/app/advertiser/layout";
import { btnOutline, btnPrimary, ErrorPanel, KeyValue, LoadingLine, StatusChip, TablePanel, Td, Th, useAsync } from "@/components/advertiser/bits";
import { BrandFormDialog, BrandLogo } from "@/components/brands/brand-form-dialog";
import { dateRange, rupees } from "@/services/advertiser-workspace";
import { addedLabel, awarenessLabel, brandCampaignStatus, brandPatch, brandPill, brandsService, newCampaignHref, sectorLabel, type BrandDetail } from "@/services/brands";

/**
 * A brand — DR 06's Brand detail (4420:8204): the brand's card (logo, name,
 * its industry and sub-category), Brand details (industry, sub-category,
 * awareness, when it was added — the first three are the newest campaign's,
 * so a brand without a campaign shows only what it has), its campaigns with
 * what they have spent between them, and the doors: a new campaign with the
 * brand already on it, edit, archive — and, archived, restore
 * (`PATCH { isActive }`, the same call either way).
 */
export default function BrandPage() {
    const params = useParams<{ id: string }>();
    const brandId = params.id;
    const advertiser = useAdvertiser();
    const advertiserId = advertiser?.id ?? null;
    const state = useAsync(`brand:${advertiserId ?? ""}:${brandId}`, async () => (advertiserId ? brandsService.get(advertiserId, brandId) : null), "Could not read this brand.");

    const back = (
        <Link href="/advertiser/brands" className="text-sm text-ink hover:text-brand">
            Back to brands
        </Link>
    );

    if (state.kind === "loading" || (state.kind === "ready" && !state.value)) {
        return (
            <>
                {back}
                <div className="mt-6">
                    <LoadingLine>Loading the brand…</LoadingLine>
                </div>
            </>
        );
    }
    if (state.kind === "error") {
        return (
            <>
                {back}
                <div className="mt-3 border-t border-line pt-5">
                    <PageHeading title="Brand" />
                </div>
                <ErrorPanel title="Could not read this brand" message={state.message} />
            </>
        );
    }
    return <BrandView advertiserId={advertiserId!} brand={state.value!} back={back} reload={state.reload} />;
}

function BrandView({ advertiserId, brand, back, reload }: { advertiserId: string; brand: BrandDetail; back: React.ReactNode; reload: () => void }) {
    const [editing, setEditing] = React.useState(false);
    const [confirming, setConfirmingState] = React.useState<"archive" | "restore" | null>(null);
    const [busy, setBusy] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);
    const setConfirming = (next: "archive" | "restore" | null) => {
        setError(null);
        setConfirmingState(next);
    };
    const pill = brandPill(brand);
    const awareness = awarenessLabel(brand.awareness);

    const setActive = async (isActive: boolean) => {
        setBusy(true);
        setError(null);
        try {
            await brandsService.update(advertiserId, brand.id, { isActive });
            setConfirming(null);
            toast.success(isActive ? `${brand.name} is active again.` : `${brand.name} is archived.`);
            reload();
        } catch (caught) {
            setError(caught instanceof ApiError && caught.status === 403 ? "You cannot change this brand from this account." : messageOf(caught, "That did not go through. Try again."));
        } finally {
            setBusy(false);
        }
    };

    return (
        <>
            {back}
            <div className="mt-3 border-t border-line pt-5">
                <PageHeading
                    title={brand.name}
                    subtitle={`${brand.industry ?? sectorLabel(brand.sector)} · added ${addedLabel(brand)}`}
                    actions={
                        brand.archived ? (
                            <button type="button" onClick={() => setConfirming("restore")} className={btnOutline}>
                                Restore brand
                            </button>
                        ) : (
                            <>
                                <button type="button" onClick={() => setEditing(true)} className={btnOutline}>
                                    Edit
                                </button>
                                <button type="button" onClick={() => setConfirming("archive")} className={btnOutline}>
                                    Archive
                                </button>
                                <Link href={newCampaignHref(brand.id)} className={btnPrimary}>
                                    New campaign for this brand
                                </Link>
                            </>
                        )
                    }
                />
            </div>

            {brand.archived && <p className="mt-4 rounded-md bg-ground px-4 py-3 text-sm text-dim">This brand is archived. Its campaigns stay as they were, and it no longer appears when you book. Restore it to book under it again.</p>}

            <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
                <div className="min-w-0 space-y-4">
                    <section className="flex items-center gap-4 rounded-lg border border-line bg-white p-5">
                        <BrandLogo src={brand.logoUrl} name={brand.name} className="size-[52px]" />
                        <div className="min-w-0 flex-1">
                            <p className="truncate text-base font-semibold text-ink">{brand.name}</p>
                            <div className="mt-1.5 flex flex-wrap items-center gap-2">
                                {brand.industry && <span className="inline-flex h-6 items-center rounded-full bg-brand-soft px-2.5 text-xs font-medium text-brand">{brand.industry}</span>}
                                {brand.subCategory && <span className="inline-flex h-6 items-center rounded-md bg-ground px-2 text-[11px] font-semibold uppercase tracking-wide text-dim">{brand.subCategory}</span>}
                                {brand.website && (
                                    <a href={brand.website} target="_blank" rel="noreferrer" className="truncate text-xs text-dim underline underline-offset-2 hover:text-ink">
                                        {brand.website.replace(/^https?:\/\//, "")}
                                    </a>
                                )}
                            </div>
                        </div>
                        <StatusChip label={pill.label} tone={pill.tone} />
                    </section>
                </div>
                <div className="grid grid-cols-1 content-start gap-4">
                    <section className="rounded-lg border border-line bg-white p-5" aria-labelledby="brand-details">
                        <h2 id="brand-details" className="text-sm font-semibold text-ink">
                            Brand details
                        </h2>
                        <div className="mt-2 divide-y divide-line">
                            {brand.industry && <KeyValue label="Industry" value={brand.industry} className="py-2.5" />}
                            {brand.subCategory && <KeyValue label="Sub-category" value={brand.subCategory} className="py-2.5" />}
                            {awareness && <KeyValue label="Awareness" value={awareness} className="py-2.5" />}
                            <KeyValue label="Sector" value={sectorLabel(brand.sector)} className="py-2.5" />
                            <KeyValue label="Added" value={addedLabel(brand)} className="py-2.5" />
                        </div>
                        {!brand.industry && !awareness && <p className="mt-2 text-xs text-dim">Industry, sub-category and awareness are recorded with the brand's first campaign.</p>}
                    </section>
                </div>
            </div>

            <section className="mt-8" aria-labelledby="brand-campaigns">
                <h2 id="brand-campaigns" className="text-base font-semibold text-ink">
                    Campaigns
                </h2>
                <p className="mt-1 text-xs text-dim">
                    {brand.campaigns.total} campaign{brand.campaigns.total === 1 ? "" : "s"} · {brand.campaigns.live} live · {brand.campaigns.scheduled} scheduled
                </p>
                <TablePanel className="mt-3">
                    <thead>
                        <tr>
                            <Th>Campaign</Th>
                            <Th>Schedule</Th>
                            <Th align="right">Budget</Th>
                            <Th>Status</Th>
                        </tr>
                    </thead>
                    <tbody>
                        {brand.campaignList.map((line) => {
                            const status = brandCampaignStatus(line.status);
                            return (
                                <tr key={line.id} className="border-t border-line">
                                    <Td>
                                        <Link href={`/advertiser/campaigns/${encodeURIComponent(line.id)}`} className="text-sm font-medium text-ink hover:text-brand">
                                            {line.name}
                                        </Link>
                                        <p className="mt-0.5 text-xs text-dim">
                                            {line.spots} space{line.spots === 1 ? "" : "s"}
                                        </p>
                                    </Td>
                                    <Td className="text-ink">{dateRange(line.startDate, line.endDate)}</Td>
                                    <Td align="right" className="whitespace-nowrap tabular-nums text-ink">
                                        {rupees(line.budget)}
                                    </Td>
                                    <Td>
                                        <StatusChip label={status.label} tone={status.tone} pill={false} />
                                    </Td>
                                </tr>
                            );
                        })}
                        {brand.campaignList.length === 0 && (
                            <tr className="border-t border-line">
                                <td colSpan={4} className="px-5 py-10 text-center text-sm text-dim">
                                    No campaigns for this brand yet.
                                </td>
                            </tr>
                        )}
                        <tr className="border-t border-dashed border-line">
                            <Td className="font-medium text-dim">Total spend</Td>
                            <Td />
                            <Td align="right" className="whitespace-nowrap text-base font-semibold tabular-nums text-ink">
                                {rupees(brand.lifetimeSpend)}
                            </Td>
                            <Td />
                        </tr>
                    </tbody>
                </TablePanel>
            </section>

            <BrandFormDialog
                open={editing}
                onClose={() => setEditing(false)}
                brand={brand}
                onSave={async (input) => {
                    const patch = brandPatch(brand, input);
                    if (Object.keys(patch).length > 0) await brandsService.update(advertiserId, brand.id, patch);
                    setEditing(false);
                    toast.success("Brand saved.");
                    reload();
                }}
            />

            <Dialog open={confirming !== null} onOpenChange={(next) => !next && !busy && setConfirming(null)}>
                <DialogContent className="max-w-[440px] rounded-lg border-line bg-white p-6">
                    <DialogHeader>
                        <DialogTitle className="text-lg font-semibold text-ink">{confirming === "restore" ? "Restore this brand?" : "Archive this brand?"}</DialogTitle>
                        <DialogDescription className="text-sm text-dim">
                            {confirming === "restore" ? "It moves back to Active and appears again when you book." : "It moves to Archived and stops appearing when you book. Its campaigns are not touched."}
                        </DialogDescription>
                    </DialogHeader>
                    {error && (
                        <p role="alert" className="text-sm text-danger">
                            {error}
                        </p>
                    )}
                    <div className="flex justify-end gap-3">
                        <button type="button" onClick={() => setConfirming(null)} disabled={busy} className={btnOutline}>
                            {confirming === "restore" ? "Cancel" : "Keep it"}
                        </button>
                        <button type="button" onClick={() => void setActive(confirming === "restore")} disabled={busy} className={btnPrimary}>
                            {busy ? "Please wait…" : confirming === "restore" ? "Restore brand" : "Archive brand"}
                        </button>
                    </div>
                </DialogContent>
            </Dialog>
        </>
    );
}
