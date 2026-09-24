"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { CalendarDays } from "lucide-react";
import { apiBlob } from "@/lib/api-client";
import { PageHeading } from "@/components/workspace/page-heading";
import { useAdvertiser } from "@/app/advertiser/layout";
import { ActivityList, btnOutline, btnPrimary, DocRow, ErrorPanel, LoadingLine, PrivateImage, StatusChip, useAsync } from "@/components/advertiser/bits";
import {
    advertiserWorkspace,
    categoryLabel,
    dateRange,
    dayCount,
    deliveryActivity,
    fileNameOf,
    longDate,
    PHOTO_KIND_LABEL,
    proofStatus,
    shortDate,
    type AdvertiserOrder,
    type Invoice,
    type OrderEvidence,
} from "@/services/advertiser-workspace";

/**
 * DR 12 · 07 · 05 · Installation proof (5204:73066): one booking's delivery
 * proof — the installation photograph, the files the publisher or agent
 * filed, the note, and the milestones. `GET /orders/:id` and
 * `GET /orders/:id/evidence`; the invoice button finds the campaign's
 * invoice off `GET /advertisers/:id/invoices`.
 */
export default function InstallationProofPage() {
    const params = useParams<{ orderId: string }>();
    const orderId = params.orderId;
    const advertiser = useAdvertiser();
    const advertiserId = advertiser?.id ?? null;

    const state = useAsync(
        `proof:${orderId}:${advertiserId ?? ""}`,
        async () => {
            const [order, evidence, invoices] = await Promise.all([
                advertiserWorkspace.order(orderId),
                advertiserWorkspace.evidence(orderId).catch(() => null as OrderEvidence | null),
                advertiserId ? advertiserWorkspace.invoices(advertiserId).catch(() => [] as Invoice[]) : Promise.resolve([] as Invoice[]),
            ]);
            return { order, evidence, invoices };
        },
        "Could not read this delivery proof."
    );

    if (state.kind === "loading") return <LoadingLine>Loading the delivery proof…</LoadingLine>;
    if (state.kind === "error") {
        return (
            <>
                <PageHeading title="Delivery proof" />
                <ErrorPanel title="Could not read this delivery proof" message={state.message} />
            </>
        );
    }

    const { order, evidence, invoices } = state.value;
    return <ProofView order={order} evidence={evidence} invoices={invoices} />;
}

function ProofView({ order, evidence, invoices }: { order: AdvertiserOrder; evidence: OrderEvidence | null; invoices: Invoice[] }) {
    const status = proofStatus(order);
    const photos = evidence?.photos ?? [];
    const installation = photos.find((p) => p.kind === "INSTALLATION") ?? photos[0] ?? null;
    const hero = installation?.url ?? order.selfInstallInstallPhotoUrl ?? order.listing.photos?.[0]?.url ?? null;
    const publisher = order.listing.publisher?.name ?? "the publisher";
    const campaignId = order.campaignSpot?.campaignId ?? null;
    const invoice = campaignId ? invoices.find((i) => i.campaignId === campaignId && i.kind !== "CREDIT_NOTE") : undefined;
    const verifiedAt = order.adminApprovedAt ?? order.verification?.verifiedAt ?? null;
    const activity = deliveryActivity(order, photos);
    const campaignName = order.campaignName ?? "Campaign";
    const subtitle = [
        `${categoryLabel(order.listing.category)} campaign`,
        order.listing.city,
        status.key === "VERIFIED" ? `Completed ${longDate(order.endDate ?? verifiedAt)}` : status.label,
    ]
        .filter(Boolean)
        .join(" · ");
    const documents = photos.map((photo) => ({
        id: photo.id,
        title: photo.label || PHOTO_KIND_LABEL[photo.kind] || "Photo",
        line: `${fileNameOf(photo.url) || photo.kind.toLowerCase()} · ${shortDate(photo.capturedAt)}`,
        url: photo.url,
    }));
    for (const url of order.selfInstallConditionPhotoUrls ?? []) documents.push({ id: url, title: "Site condition photo", line: fileNameOf(url), url });
    if (order.selfInstallInstallPhotoUrl && !photos.length) documents.push({ id: "self-install", title: "Installation photo", line: fileNameOf(order.selfInstallInstallPhotoUrl), url: order.selfInstallInstallPhotoUrl });

    const openDocument = async (url: string) => {
        if (/^https?:\/\//i.test(url)) {
            window.open(url, "_blank", "noopener");
            return;
        }
        try {
            const blob = await apiBlob(url.replace(/^\/api\/v1/, ""));
            const objectUrl = URL.createObjectURL(blob);
            window.open(objectUrl, "_blank", "noopener");
            setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
        } catch {
            /* The row stays; nothing else to do. */
        }
    };

    return (
        <>
            <PageHeading
                title={`${campaignName} · Delivery proof`}
                subtitle={subtitle}
                actions={
                    <>
                        <Link href="/advertiser/proofs" className={btnOutline}>
                            Back to delivery proofs
                        </Link>
                        {invoice ? (
                            <Link href={`/advertiser/billing/invoices/${invoice.id}`} className={btnPrimary}>
                                View invoice
                            </Link>
                        ) : (
                            <span className={btnPrimary} aria-disabled title="No invoice for this campaign yet">
                                View invoice
                            </span>
                        )}
                    </>
                }
            />

            <div className="mt-6 grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
                <div>
                    <PrivateImage src={hero} alt={`${order.listing.title} — installation photograph`} className="aspect-[612/366] w-full rounded-lg object-cover" />
                    <div className="mt-8 px-4">
                        <h2 className="text-base font-semibold text-ink">Delivery evidence</h2>
                        <p className="mt-1 text-xs text-dim">Files provided by {publisher} for your booking</p>
                        <p className="mt-5 text-[11px] font-semibold uppercase tracking-wide text-ink">{status.key === "VERIFIED" ? "Verified documents" : "Submitted documents"}</p>
                        <div className="mt-3 space-y-3">
                            {documents.map((doc) => (
                                <DocRow key={doc.id} title={doc.title} line={doc.line} onClick={() => void openDocument(doc.url)} />
                            ))}
                            {documents.length === 0 && (
                                <p className="rounded-lg border border-line bg-white px-4 py-5 text-sm text-dim">
                                    {status.key === "NOT_DUE"
                                        ? "Nothing filed yet. Installation evidence and reports will appear here after the publisher submits them."
                                        : "No files on this booking yet."}
                                </p>
                            )}
                        </div>
                    </div>
                </div>

                <div className="space-y-4">
                    <section className="rounded-lg border border-line bg-white">
                        <div className="border-b border-line px-4 py-4">
                            <p className="text-xs text-dim">{verifiedAt ? `Verified ${longDate(verifiedAt)}` : status.label}</p>
                            <h2 className="mt-2 text-base font-semibold text-ink">{campaignName}</h2>
                            <p className="mt-1 text-sm text-dim">{[order.listing.title, order.listing.city].filter(Boolean).join(" · ")}</p>
                            <div className="mt-3">
                                <StatusChip label={status.label.toUpperCase()} tone={status.tone} />
                            </div>
                        </div>
                        <div className="border-b border-line px-4 py-4">
                            <h3 className="text-base font-semibold text-ink">Campaign period</h3>
                            <p className="mt-2 flex items-center gap-2 text-sm text-ink">
                                <CalendarDays className="size-4 text-dim" aria-hidden />
                                {dateRange(order.startDate, order.endDate, "long")}
                            </p>
                        </div>
                        <div className="px-4 py-4">
                            <h3 className="text-base font-semibold text-ink">Publisher delivery note</h3>
                            <p className="mt-3 text-sm leading-relaxed text-dim">{order.notes?.trim() || `No note from ${publisher} on this booking yet.`}</p>
                        </div>
                    </section>

                    <section className="rounded-lg border border-line bg-white px-4 py-4">
                        <h3 className="text-sm font-semibold text-ink">Delivery activity</h3>
                        <p className="mt-1 text-xs text-dim">
                            {dateRange(order.startDate, order.endDate, "long").replace(/ \d{4}$/, "")} · {activity.length} milestone{activity.length === 1 ? "" : "s"} recorded
                        </p>
                        <div className="mt-4">
                            <ActivityList entries={activity} empty="No milestones recorded yet." />
                        </div>
                    </section>

                    <Link href={`/advertiser/requests/new?topic=DELIVERY${campaignId ? `&campaign=${campaignId}` : ""}`} className="flex h-12 w-full items-center justify-center rounded-lg border border-line bg-white text-sm font-medium text-ink hover:border-ink">
                        Need help with this delivery?
                    </Link>
                </div>
            </div>
            <p className="sr-only">{dayCount(order.startDate, order.endDate)} days</p>
        </>
    );
}
