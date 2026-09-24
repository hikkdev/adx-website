"use client";

import * as React from "react";
import Link from "next/link";
import { PageHeading, Panel } from "@/components/workspace/page-heading";
import { ActivityList, btnOutline, btnPrimary, btnSmall, DocRow, KeyValue, PrivateImage, StatusChip } from "@/components/advertiser/bits";
import { PerformanceStrip, TrackingPanel } from "@/components/advertiser/campaign-extras";
import {
    campaignActivity,
    campaignContinueHref,
    campaignStatusLabel,
    campaignStatusLine,
    categoryLabel,
    CREATIVE_LABEL,
    currentCreativeFor,
    dateRange,
    dayMonth,
    dayMonthLong,
    daysLabel,
    deliveryActivity,
    fileNameOf,
    PHOTO_KIND_LABEL,
    proofStatus,
    rupees,
    shortDate,
    spotLine,
    type AdvertiserOrder,
    type CampaignAnalytics,
    type CampaignDetail,
    type CampaignSpot,
    type Invoice,
    type OrderEvidence,
    type TrackingCode,
} from "@/services/advertiser-workspace";

export interface CampaignPageData {
    campaign: CampaignDetail;
    invoice: Invoice | null;
    codes: TrackingCode[];
    analytics: CampaignAnalytics | null;
    /** Each booked spot's order and evidence, by order id — the delivery side of the campaign. */
    orders: Record<string, { order: AdvertiserOrder; evidence: OrderEvidence | null }>;
    advertiserName: string;
}

const pastPayment = (campaign: CampaignDetail) => !!campaign.paidAt || ["SCHEDULED", "LIVE", "PAUSED", "COMPLETED"].includes(campaign.status);

/* ------------------------------------------------------------------ */
/* 02 · Campaign details (5204:72402)                                  */
/* ------------------------------------------------------------------ */

export function CampaignInFlight({ data }: { data: CampaignPageData }) {
    const { campaign, invoice, codes, analytics, orders, advertiserName } = data;
    const status = campaignStatusLabel(campaign);
    const paid = pastPayment(campaign);
    const placements = campaign.spots.filter((s) => s.status !== "CANCELLED");
    const city = campaign.city ?? campaign.targetLocation ?? placements[0]?.listing.city ?? null;
    const brief = currentCreativeFor(campaign.creatives, null);
    const uploaded = campaign.creatives.filter((c) => c.fileUrl && c.spotId);
    const artworkInReview = status.label === "Artwork in review";

    const primary =
        campaign.status === "DRAFT" ? (
            <Link href={campaignContinueHref(campaign)} className={btnPrimary}>
                Continue draft
            </Link>
        ) : campaign.status === "PENDING_PAYMENT" ? (
            <Link href={`/advertiser/campaigns/${campaign.id}/pay`} className={btnPrimary}>
                Pay now
            </Link>
        ) : campaign.status === "CANCELLED" ? null : (
            <Link href={`/advertiser/campaigns/${campaign.id}/creative`} className={btnPrimary}>
                Edit artwork
            </Link>
        );

    return (
        <>
            <nav className="text-sm text-dim" aria-label="Breadcrumb">
                <Link href="/advertiser" className="hover:text-ink">
                    Campaigns
                </Link>
                <span className="mx-2">/</span>
                <span className="text-ink">{campaign.name || "Untitled campaign"}</span>
            </nav>
            <div className="mt-6">
                <PageHeading
                    title={campaign.name || "Untitled campaign"}
                    subtitle={[campaign.reference, advertiserName || campaign.brandName, city].filter(Boolean).join(" · ")}
                    actions={
                        <>
                            {paid && (
                                <Link href={`/advertiser/proofs?campaign=${encodeURIComponent(campaign.name)}`} className={btnOutline}>
                                    View delivery proofs
                                </Link>
                            )}
                            {primary}
                        </>
                    }
                />
            </div>

            <Panel className="mt-6">
                <h2 className="text-base font-semibold text-ink">{status.label}</h2>
                <p className="mt-2 text-sm text-dim">{campaignStatusLine(campaign)}</p>
            </Panel>

            <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_270px]">
                <div className="min-w-0">
                    <h2 className="text-base font-semibold text-ink">Booked ad spaces</h2>
                    <p className="mt-1 text-xs text-dim">
                        {placements.length} placement{placements.length === 1 ? "" : "s"} · {dateRange(campaign.startDate, campaign.endDate)}
                    </p>
                    <div className="mt-4 space-y-3">
                        {placements.map((spot) => (
                            <SpotCard key={spot.id} spot={spot} campaign={campaign} order={spot.orderId ? orders[spot.orderId]?.order : undefined} paid={paid} />
                        ))}
                        {placements.length === 0 && (
                            <Panel>
                                <p className="text-sm text-dim">No spaces chosen yet.</p>
                                <Link href={`/advertiser/campaigns/${campaign.id}/spaces`} className={`${btnSmall} mt-3`}>
                                    Choose spaces
                                </Link>
                            </Panel>
                        )}
                    </div>

                    <h2 className="mt-8 text-base font-semibold text-ink">Campaign documents</h2>
                    <div className="mt-4 space-y-3">
                        <DocRow
                            title="Brand brief"
                            line={brief?.fileName ? `${brief.fileName} · Submitted ${dayMonth(brief.submittedAt)}` : campaign.creativePath === "ADX_DESIGN_AGENCY" ? "Design brief with ADX" : `${campaign.brandName ?? campaign.name}${campaign.goal ? ` · ${campaign.goal.toLowerCase().replace(/_/g, " ")}` : ""}`}
                            href={brief?.fileUrl && /^https?:/.test(brief.fileUrl) ? brief.fileUrl : `/advertiser/campaigns/${campaign.id}/details`}
                            external={!!brief?.fileUrl && /^https?:/.test(brief.fileUrl)}
                        />
                        <DocRow
                            title="Artwork pack"
                            line={uploaded.length ? `${uploaded.length} file${uploaded.length === 1 ? "" : "s"} · ${artworkInReview ? "In review" : uploaded.every((c) => c.status === "APPROVED") ? "Approved" : CREATIVE_LABEL[uploaded[0]!.status].label}` : "Not uploaded yet"}
                            href={`/advertiser/campaigns/${campaign.id}/creative`}
                        />
                        <DocRow
                            title="Payment receipt"
                            line={invoice ? `${invoice.number} · ${invoice.status === "PAID" || invoice.paymentId ? "Payment received" : "Issued"}` : campaign.paidAt ? `Paid ${shortDate(campaign.paidAt)} · invoice on its way` : "Issued once the campaign is paid"}
                            href={invoice ? `/advertiser/billing/invoices/${invoice.id}` : null}
                        />
                    </div>

                    {paid && <TrackingPanel campaignId={campaign.id} codes={codes} />}
                    {paid && <PerformanceStrip analytics={analytics} />}

                    <div className="mt-8 flex flex-wrap items-center justify-between gap-4">
                        <p className="text-sm text-dim">Need to change or cancel this campaign?</p>
                        <Link href={`/advertiser/requests/new?campaign=${campaign.id}&topic=${campaign.status === "CANCELLED" ? "PAYMENT" : "CHANGE"}`} className={btnOutline}>
                            Create a request
                        </Link>
                    </div>
                </div>

                <div className="space-y-4">
                    <Panel className="p-5">
                        <h2 className="text-base font-semibold text-ink">Campaign summary</h2>
                        <div className="mt-3">
                            <KeyValue label="Schedule" value={<span className="font-medium">{dateRange(campaign.startDate, campaign.endDate)}</span>} />
                            <KeyValue label="Duration" value={<span className="font-medium">{daysLabel(campaign.startDate, campaign.endDate)}</span>} />
                            <KeyValue label="Ad spaces" value={<span className="font-medium">{placements.length}</span>} />
                            <div className="my-2 border-t border-line" />
                            <KeyValue label={paid ? "Total paid" : "Total"} value={rupees(campaign.total)} strong />
                        </div>
                        {invoice ? (
                            <Link href={`/advertiser/billing/invoices/${invoice.id}`} className={`${btnOutline} mt-4`}>
                                View invoice
                            </Link>
                        ) : (
                            <p className="mt-4 text-xs text-dim">{paid ? "The invoice is being issued." : "The invoice is issued at payment."}</p>
                        )}
                    </Panel>
                    <Panel className="p-5">
                        <h2 className="text-base font-semibold text-ink">Activity</h2>
                        <div className="mt-3">
                            <ActivityList entries={campaignActivity(campaign)} />
                        </div>
                    </Panel>
                </div>
            </div>
        </>
    );
}

function SpotCard({ spot, campaign, order, paid }: { spot: CampaignSpot; campaign: CampaignDetail; order?: AdvertiserOrder; paid: boolean }) {
    const creative = currentCreativeFor(campaign.creatives, spot.id);
    const creativeLabel = creative ? CREATIVE_LABEL[creative.status] : { label: paid ? "Artwork not uploaded" : "Artwork after payment", tone: "neutral" as const };
    const proof = order ? proofStatus(order) : null;
    const showProof = order && (spot.status === "LIVE" || spot.status === "COMPLETED" || proof?.key === "VERIFIED" || proof?.key === "SUBMITTED");
    return (
        <div className="flex flex-wrap items-center gap-4 rounded-lg border border-line bg-white p-3">
            <PrivateImage src={spot.listing.photos?.[0]?.url ?? null} alt={spot.listing.title} className="size-16 shrink-0 rounded-md object-cover" />
            <div className="min-w-0 flex-1">
                <p className="text-base font-semibold text-ink">{spot.listing.title}</p>
                <p className="mt-0.5 text-xs text-dim">{spotLine(spot, campaign.startDate, campaign.endDate)}</p>
                <p className="mt-1 text-sm font-semibold text-ink">{rupees(spot.lineTotal)} media cost</p>
            </div>
            <div className="flex flex-col items-end gap-2">
                {showProof && proof ? (
                    <>
                        <StatusChip label={`Delivery proof · ${proof.label}`} tone={proof.tone} pill={false} className="text-xs" />
                        <Link href={`/advertiser/proofs/${order!.id}`} className={btnSmall}>
                            View proof
                        </Link>
                    </>
                ) : (
                    <>
                        <StatusChip label={creativeLabel.label} tone={creativeLabel.tone} pill={false} className="text-xs" />
                        {paid && (
                            <Link href={`/advertiser/campaigns/${campaign.id}/creative`} className={btnSmall}>
                                {creative?.fileUrl ? "Edit artwork" : "Upload artwork"}
                            </Link>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}

/* ------------------------------------------------------------------ */
/* 03 · Campaign history (5204:72806)                                  */
/* ------------------------------------------------------------------ */

export function CampaignCompleted({ data }: { data: CampaignPageData }) {
    const { campaign, invoice, codes, analytics, orders, advertiserName } = data;
    const status = campaignStatusLabel(campaign);
    const placements = campaign.spots.filter((s) => s.status !== "CANCELLED");
    const first = placements[0];
    const city = campaign.city ?? campaign.targetLocation ?? first?.listing.city ?? null;
    const category = first?.listing.mediaType?.category ?? first?.listing.category ?? null;
    const orderRows = placements.map((s) => (s.orderId ? orders[s.orderId] : undefined)).filter((r): r is { order: AdvertiserOrder; evidence: OrderEvidence | null } => !!r);
    const photos = orderRows.flatMap((r) => (r.evidence?.photos ?? []).map((p) => ({ ...p, publisher: r.order.listing.publisher?.name ?? null })));
    const hero = photos.find((p) => p.kind === "INSTALLATION")?.url ?? first?.listing.photos?.[0]?.url ?? null;
    const publishers = [...new Set(orderRows.map((r) => r.order.listing.publisher?.name).filter((n): n is string => !!n))];
    const allVerified = orderRows.length > 0 && orderRows.every((r) => proofStatus(r.order).key === "VERIFIED");
    const proofLine = orderRows.length === 0 ? "Not filed" : allVerified ? "Verified" : `${orderRows.filter((r) => proofStatus(r.order).key === "VERIFIED").length} of ${orderRows.length} verified`;
    const activity = orderRows.length ? deliveryActivity(orderRows[0]!.order, orderRows[0]!.evidence?.photos ?? []) : campaignActivity(campaign);
    const completedOn = campaign.endDate ?? orderRows[0]?.order.adminApprovedAt ?? null;

    return (
        <>
            <PageHeading
                title={campaign.name || "Untitled campaign"}
                subtitle={[category ? `${categoryLabel(category)} campaign` : null, city, dateRange(campaign.startDate, campaign.endDate)].filter(Boolean).join(" · ")}
                actions={
                    <>
                        <Link href="/advertiser" className={btnOutline}>
                            Back to campaigns
                        </Link>
                        <Link href={`/advertiser/proofs?campaign=${encodeURIComponent(campaign.name)}`} className={btnOutline}>
                            View delivery proofs
                        </Link>
                    </>
                }
            />

            <div className="mt-6 grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
                <div className="min-w-0">
                    <PrivateImage src={hero} alt={`${campaign.name} — delivered placement`} className="aspect-[612/226] w-full rounded-lg object-cover" />

                    <Panel className="mt-4 p-4">
                        <h2 className="text-base font-semibold text-ink">Delivered placement{placements.length === 1 ? "" : "s"}</h2>
                        <div className="mt-3 space-y-3">
                            {placements.map((spot) => {
                                const row = spot.orderId ? orders[spot.orderId] : undefined;
                                const proof = row ? proofStatus(row.order) : null;
                                return (
                                    <div key={spot.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-line p-3">
                                        <PrivateImage src={spot.listing.photos?.[0]?.url ?? null} alt={spot.listing.title} className="size-12 shrink-0 rounded-md object-cover" />
                                        <div className="min-w-0 flex-1">
                                            <p className="text-xs font-semibold text-ink">{spot.listing.title}</p>
                                            <div className="mt-1 flex flex-wrap gap-1.5">
                                                <StatusChip label={(spot.listing.mediaType?.category ?? spot.listing.category ?? "SPACE").toString().toUpperCase()} tone="danger" className="h-5 text-[10px]" />
                                                {spot.listing.city && <StatusChip label={spot.listing.city} className="h-5 text-[10px]" />}
                                                <StatusChip label={dateRange(campaign.startDate, campaign.endDate).replace(/ \d{4}$/, "")} className="h-5 text-[10px]" />
                                            </div>
                                            <p className="mt-1.5 text-xs font-semibold text-ink">{row?.order.listing.publisher?.name ? `Delivered by ${row.order.listing.publisher.name}` : "Delivery recorded by ADX"}</p>
                                        </div>
                                        {proof ? (
                                            row?.order.id ? (
                                                <Link href={`/advertiser/proofs/${row.order.id}`}>
                                                    <StatusChip label={proof.label} tone={proof.tone} className="h-7 px-4" />
                                                </Link>
                                            ) : (
                                                <StatusChip label={proof.label} tone={proof.tone} className="h-7 px-4" />
                                            )
                                        ) : (
                                            <StatusChip label="Completed" tone="success" className="h-7 px-4" />
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </Panel>

                    <div className="mt-8 px-4">
                        <h2 className="text-base font-semibold text-ink">Campaign evidence</h2>
                        <p className="mt-1 text-xs text-dim">Files provided by {publishers.length ? publishers.join(", ") : "the publisher"} for your booking</p>
                        <p className="mt-5 text-[11px] font-semibold uppercase tracking-wide text-ink">{allVerified ? "Verified documents" : "Documents"}</p>
                        <div className="mt-3 space-y-3">
                            {photos.map((photo) => (
                                <DocRow key={photo.id} title={photo.label || PHOTO_KIND_LABEL[photo.kind] || "Photo"} line={`${fileNameOf(photo.url) || photo.kind.toLowerCase()} · ${shortDate(photo.capturedAt)}`} href={/^https?:/.test(photo.url) ? photo.url : `/advertiser/proofs/${photo.orderId}`} external={/^https?:/.test(photo.url)} />
                            ))}
                            {photos.length === 0 && <p className="rounded-lg border border-line bg-white px-4 py-5 text-sm text-dim">No files were filed for this campaign.</p>}
                        </div>
                    </div>

                    <TrackingPanel campaignId={campaign.id} codes={codes} />
                    <PerformanceStrip analytics={analytics} />
                </div>

                <div className="space-y-4">
                    <section className="rounded-lg border border-line bg-white">
                        <div className="border-b border-line px-4 py-4">
                            <h2 className="text-base font-semibold text-ink">Campaign overview</h2>
                            <p className="mt-1 text-sm text-dim">{[advertiserName || campaign.brandName, campaign.name].filter(Boolean).join(" · ")}</p>
                            <div className="mt-2">
                                <StatusChip label={status.label} tone={status.tone} />
                            </div>
                        </div>
                        <div className="border-b border-line px-4 py-4">
                            <p className="text-sm font-semibold text-ink">
                                {dateRange(campaign.startDate, campaign.endDate, "long")} · {daysLabel(campaign.startDate, campaign.endDate)}
                            </p>
                        </div>
                        <div className="px-4 py-4">
                            <p className="text-sm font-semibold text-ink">Total paid, including GST</p>
                            <p className="mt-1 text-sm text-dim">{rupees(campaign.total)}</p>
                            <div className="mt-3 flex items-center justify-between">
                                <p className="text-sm font-semibold text-ink">Payment received</p>
                                <p className="text-sm text-ink">{rupees(campaign.total)}</p>
                            </div>
                            <div className="mt-2 h-1.5 rounded-full bg-ground">
                                <div className="h-1.5 rounded-full bg-brand" style={{ width: campaign.paidAt ? "100%" : "0%" }} />
                            </div>
                        </div>
                    </section>

                    <section className="rounded-lg border border-line bg-white px-4 py-4">
                        <h2 className="text-base font-semibold text-ink">Booking status</h2>
                        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-4">
                            <Stat label="Placements" value={`${placements.length} space${placements.length === 1 ? "" : "s"}`} />
                            <Stat label="Delivery proof" value={proofLine} />
                            <Stat label="Completed" value={dayMonthLong(completedOn)} />
                            <Stat label="Duration" value={daysLabel(campaign.startDate, campaign.endDate)} />
                        </dl>
                    </section>

                    <section className="rounded-lg border border-line bg-white px-4 py-4">
                        <h2 className="text-sm font-semibold text-ink">Delivery activity</h2>
                        <p className="mt-1 text-xs text-dim">
                            {dateRange(campaign.startDate, campaign.endDate, "long").replace(/ \d{4}$/, "")} · {activity.length} milestone{activity.length === 1 ? "" : "s"} recorded
                        </p>
                        <div className="mt-4">
                            <ActivityList entries={activity} />
                        </div>
                    </section>

                    {invoice ? (
                        <Link href={`/advertiser/billing/invoices/${invoice.id}`} className={btnOutline}>
                            View invoice
                        </Link>
                    ) : (
                        <span className={btnOutline} aria-disabled>
                            No invoice yet
                        </span>
                    )}
                </div>
            </div>
        </>
    );
}

function Stat({ label, value }: { label: string; value: string }) {
    return (
        <div>
            <dt className="text-xs font-semibold text-ink">{label}</dt>
            <dd className="mt-0.5 text-xs text-dim">{value}</dd>
        </div>
    );
}
