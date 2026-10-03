"use client";

import * as React from "react";
import Link from "next/link";
import { PageHeading } from "@/components/workspace/page-heading";
import { brandButton, Cell, Chip, DataTable, Empty, ErrorNote, Loading, TableRow, TitleCell } from "@/components/publisher/parts";
import { useLoad } from "@/components/publisher/use-load";
import { BoostsNotOpen, useBoostsOpen } from "@/components/promotions/boosts/gate";
import { placementsLabel } from "@/components/promotions/boosts/model";
import { publisherWorkspace, type MyListing } from "@/services/publisher-workspace";
import { featureOff, money, promotionsService, runLabel, statsOf, statusOf, type BoostView } from "@/services/promotions";

/**
 * LM-1 · Sponsored listings: every boost this publisher bought — the
 * listing, where it is shown first, its dates, its status, what it did and
 * what it cost — with the door to sponsor another. Closed (the switch off,
 * or the backend's 503 FEATURE_OFF), it says so and offers no buying door.
 */
export default function SponsoredListingsPage() {
    const open = useBoostsOpen();
    const { data, error, loading, reload } = useLoad(`boosts:mine:${open}`, () => (open === "open" ? readBoosts() : Promise.resolve<Read>({ closed: true })));
    const closed = open === "closed" || (open === "open" && !!data?.closed && !loading);
    const ready = open === "open" && data && !data.closed && !loading ? data : null;
    return (
        <>
            <PageHeading
                title="Sponsored listings"
                subtitle="Put a live listing first in search and in similar listings, labelled Sponsored."
                actions={
                    ready ? (
                        <Link href="/publisher/promotions/new" className={brandButton}>
                            Sponsor a listing
                        </Link>
                    ) : undefined
                }
            />
            {closed ? (
                <BoostsNotOpen />
            ) : error && !loading ? (
                <div className="mt-6">
                    <ErrorNote message={error} onRetry={reload} />
                </div>
            ) : ready ? (
                <BoostList boosts={ready.boosts} titles={ready.titles} />
            ) : (
                <Loading label="Loading your sponsored listings…" />
            )}
        </>
    );
}

type Read = { closed: true } | { closed: false; boosts: BoostView[]; titles: Map<string, MyListing> };

async function readBoosts(): Promise<Read> {
    try {
        const [boosts, listings] = await Promise.all([promotionsService.myBoosts(), publisherWorkspace.listings({ pageSize: 100 }).catch(() => null)]);
        return { closed: false, boosts, titles: new Map((listings?.items ?? []).map((row) => [row.id, row])) };
    } catch (caught) {
        if (featureOff(caught)) return { closed: true };
        throw caught;
    }
}

function BoostList({ boosts, titles }: { boosts: BoostView[]; titles: Map<string, MyListing> }) {
    const rows = [...boosts].sort((a, b) => (b.createdAt ?? b.startDate).localeCompare(a.createdAt ?? a.startDate));
    return (
        <div className="mt-6">
            {rows.length === 0 ? (
                <Empty title="No sponsored listings yet" text="Sponsor a live listing to show it first in the search results it matches, or at the head of the similar listings row. You pay a flat rate per day, plus GST." action={{ label: "Sponsor a listing", href: "/publisher/promotions/new" }} />
            ) : (
                <>
                    <p className="mb-4 text-sm text-dim">
                        {rows.length} sponsorship{rows.length === 1 ? "" : "s"} · Most recent first
                    </p>
                    <DataTable columns={[{ label: "Listing" }, { label: "Shown first in" }, { label: "Dates" }, { label: "Status" }, { label: "Views · clicks", align: "right" }, { label: "Total", align: "right" }, { label: "", align: "right" }]}>
                        {rows.map((boost) => (
                            <BoostRow key={boost.id} boost={boost} listing={titles.get(boost.listingId) ?? null} />
                        ))}
                    </DataTable>
                </>
            )}
        </div>
    );
}

function BoostRow({ boost, listing }: { boost: BoostView; listing: MyListing | null }) {
    const status = statusOf(boost.status);
    const title = boost.listing?.title ?? listing?.title ?? "Listing";
    const stats = boost.stats ? statsOf(boost.stats) : null;
    const href = `/publisher/promotions/${encodeURIComponent(boost.id)}`;
    return (
        <TableRow>
            <Cell>
                <TitleCell title={title} line={[boost.displayId, boost.city ?? listing?.city].filter(Boolean).join(" · ") || null} href={href} />
            </Cell>
            <Cell>
                <span className="text-sm text-ink">{placementsLabel(boost.placements)}</span>
            </Cell>
            <Cell>
                <span className="whitespace-nowrap text-sm text-ink">{runLabel(boost.startDate, boost.endDate)}</span>
            </Cell>
            <Cell>
                <Chip tone={status.tone}>{status.label}</Chip>
            </Cell>
            <Cell align="right">
                <span className="whitespace-nowrap tabular-nums text-sm text-ink">{stats ? `${stats.impressions.toLocaleString("en-IN")} · ${stats.clicks.toLocaleString("en-IN")}` : "—"}</span>
            </Cell>
            <Cell align="right">
                <span className="whitespace-nowrap tabular-nums text-sm text-ink">{money(boost.total)}</span>
            </Cell>
            <Cell align="right">
                <Link href={href} className="whitespace-nowrap text-sm font-semibold text-ink hover:underline">
                    {boost.status === "PENDING_PAYMENT" ? "Pay" : "View"}
                </Link>
            </Cell>
        </TableRow>
    );
}
