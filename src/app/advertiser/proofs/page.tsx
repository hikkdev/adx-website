"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { PageHeading } from "@/components/workspace/page-heading";
import { btnSmall, Cell, ErrorPanel, InitialsAvatar, LoadingLine, SelectBox, StatusChip, TablePanel, Td, Th, useAsync } from "@/components/advertiser/bits";
import {
    advertiserWorkspace,
    categoryLabel,
    dateRange,
    evidenceLine,
    initials,
    mayHaveEvidence,
    orderRef,
    PROOF_STATUSES,
    proofStatus,
    type AdvertiserOrder,
    type CampaignRow,
} from "@/services/advertiser-workspace";

/**
 * DR 12 · 07 · 04 · Delivery proofs (5204:73250): every booking the
 * advertiser's campaigns placed, with the evidence the publisher or agent
 * has filed and where the proof stands. `GET /orders/my?as=advertiser`,
 * with `GET /orders/:id/evidence` for the bookings that can have any.
 */
export default function DeliveryProofsPage() {
    return (
        <React.Suspense fallback={<LoadingLine>Loading delivery proofs…</LoadingLine>}>
            <ProofsPage />
        </React.Suspense>
    );
}

interface Loaded {
    orders: AdvertiserOrder[];
    campaigns: CampaignRow[];
    files: Record<string, number>;
}

async function loadProofs(): Promise<Loaded> {
    const [orders, campaigns] = await Promise.all([advertiserWorkspace.orders(), advertiserWorkspace.campaigns({ pageSize: 100 })]);
    const files: Record<string, number> = {};
    await Promise.all(
        orders.items
            .filter(mayHaveEvidence)
            .slice(0, 40)
            .map(async (order) => {
                try {
                    const evidence = await advertiserWorkspace.evidence(order.id);
                    files[order.id] = evidence.photos.length;
                } catch {
                    /* No evidence readable yet — the row says "Not submitted". */
                }
            })
    );
    return { orders: orders.items, campaigns: campaigns.items, files };
}

function ProofsPage() {
    const router = useRouter();
    const pathname = usePathname();
    const params = useSearchParams();
    const campaignFilter = params.get("campaign") ?? "";
    const statusFilter = params.get("status") ?? "";
    const state = useAsync("proofs", loadProofs, "Could not read your delivery proofs.");

    const setFilters = (next: { campaign?: string; status?: string }) => {
        const search = new URLSearchParams();
        const campaign = next.campaign ?? campaignFilter;
        const status = next.status ?? statusFilter;
        if (campaign) search.set("campaign", campaign);
        if (status) search.set("status", status);
        const query = search.toString();
        router.replace(query ? `${pathname}?${query}` : pathname);
    };

    if (state.kind === "loading") return <LoadingLine>Loading delivery proofs…</LoadingLine>;
    if (state.kind === "error") {
        return (
            <>
                <PageHeading title="Delivery proofs" />
                <ErrorPanel title="Could not read your delivery proofs" message={state.message} />
            </>
        );
    }

    const { orders, campaigns, files } = state.value;
    const names = [...new Set(orders.map((o) => o.campaignName).filter((n): n is string => !!n))].sort();
    const campaignByName = new Map(campaigns.map((c) => [c.name, c] as const));
    const rows = orders.filter((o) => (!campaignFilter || o.campaignName === campaignFilter) && (!statusFilter || proofStatus(o).key === statusFilter));
    const anyNotDue = rows.some((o) => proofStatus(o).key === "NOT_DUE");

    return (
        <>
            <PageHeading title="Delivery proofs" />
            <div className="mt-6 flex flex-wrap items-center gap-2.5">
                <SelectBox
                    label="Campaign"
                    value={campaignFilter}
                    onChange={(value) => setFilters({ campaign: value })}
                    options={[{ value: "", label: "All campaigns" }, ...names.map((n) => ({ value: n, label: n }))]}
                    className="w-[176px]"
                />
                <SelectBox
                    label="Proof status"
                    value={statusFilter}
                    onChange={(value) => setFilters({ status: value })}
                    options={[{ value: "", label: "All statuses" }, ...PROOF_STATUSES.map((s) => ({ value: s.key, label: s.label }))]}
                    className="w-[156px]"
                />
                <button type="button" onClick={() => router.replace(pathname)} className={btnSmall} disabled={!campaignFilter && !statusFilter}>
                    Clear filters
                </button>
            </div>

            <TablePanel className="mt-4">
                <thead>
                    <tr>
                        <Th>Space</Th>
                        <Th>Campaign</Th>
                        <Th>Campaign dates</Th>
                        <Th>Evidence</Th>
                        <Th>Proof status</Th>
                    </tr>
                </thead>
                <tbody>
                    {rows.map((order) => {
                        const status = proofStatus(order);
                        const campaign = order.campaignName ? campaignByName.get(order.campaignName) : undefined;
                        const publisher = order.listing.publisher?.name;
                        return (
                            <tr key={order.id} className="border-t border-line">
                                <Td>
                                    <div className="flex items-center gap-3">
                                        <InitialsAvatar text={initials(publisher ?? order.listing.title, "SP")} />
                                        <Cell
                                            title={
                                                <Link href={`/advertiser/proofs/${order.id}`} className="font-medium text-ink hover:text-brand">
                                                    {order.listing.title}
                                                </Link>
                                            }
                                            line={[orderRef(order), order.listing.city, publisher ?? categoryLabel(order.listing.category)].filter(Boolean).join(" · ")}
                                        />
                                    </div>
                                </Td>
                                <Td className="text-dim">
                                    {campaign ? (
                                        <Link href={`/advertiser/campaigns/${campaign.id}`} className="hover:text-brand">
                                            {order.campaignName}
                                        </Link>
                                    ) : (
                                        (order.campaignName ?? "—")
                                    )}
                                </Td>
                                <Td className="text-dim">{dateRange(order.startDate, order.endDate)}</Td>
                                <Td className="text-dim">{evidenceLine(files[order.id])}</Td>
                                <Td>
                                    <StatusChip label={status.label} tone={status.tone} />
                                </Td>
                            </tr>
                        );
                    })}
                    {rows.length === 0 && (
                        <tr className="border-t border-line">
                            <td colSpan={5} className="px-5 py-10 text-center text-sm text-dim">
                                {orders.length === 0 ? "No bookings yet. Delivery proofs appear here once a campaign is paid and its spaces are placed." : "No bookings match these filters."}
                            </td>
                        </tr>
                    )}
                </tbody>
            </TablePanel>

            {anyNotDue && <p className="mt-4 text-sm text-dim">Not due yet: your campaign has not started. Installation evidence and reports will appear here after the publisher submits them.</p>}
        </>
    );
}
