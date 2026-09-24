"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { PageHeading } from "@/components/workspace/page-heading";
import { brandButton, Cell, DataTable, Empty, ErrorNote, Loading, outlineButton, Segmented, StatusText, TableRow, TitleCell } from "@/components/publisher/parts";
import { useLoad } from "@/components/publisher/use-load";
import { formatMoney, listingFormat, listingLine, listingShelf, listingStatus, publisherWorkspace, rateForDays, type ListingShelf } from "@/services/publisher-workspace";

type Tab = "ALL" | "PUBLISHED" | "IN_REVIEW";

const RATE_DAYS = 14;

/**
 * DR 12 · 10 · 02 · My inventory (5204:86066): every space the publisher
 * has listed, on three shelves (all, published, in review), with its
 * format, its rate for a fortnight and where it stands. "Manage space"
 * opens the listing page; "Add ad space" the listing flow.
 */
export default function InventoryPage() {
    return (
        <React.Suspense fallback={<Loading label="Loading your spaces…" />}>
            <InventoryView />
        </React.Suspense>
    );
}

function InventoryView() {
    const router = useRouter();
    const search = useSearchParams();
    const tab: Tab = search.get("tab") === "published" ? "PUBLISHED" : search.get("tab") === "review" ? "IN_REVIEW" : "ALL";
    const { data, error, loading, reload } = useLoad("inventory", () => publisherWorkspace.listings({ pageSize: 100 }));

    const setTab = (next: Tab) => router.replace(next === "ALL" ? "/publisher/inventory" : `/publisher/inventory?tab=${next === "PUBLISHED" ? "published" : "review"}`);

    const rows = data?.items ?? [];
    const published = rows.filter((row) => listingShelf(row.status) === "PUBLISHED");
    const inReview = rows.filter((row) => listingShelf(row.status) === "IN_REVIEW");
    const shown = tab === "ALL" ? rows : rows.filter((row) => listingShelf(row.status) === (tab as ListingShelf));

    return (
        <>
            <PageHeading
                title="My inventory"
                actions={
                    <>
                        <Link href="/publisher/availability" className={outlineButton}>
                            Availability
                        </Link>
                        <Link href="/publisher/listings/new" className={brandButton}>
                            Add ad space
                        </Link>
                    </>
                }
            />
            {data && (
                <p className="mt-6 text-sm text-dim">
                    {rows.length} space{rows.length === 1 ? "" : "s"} · {published.length} published · {inReview.length} in review
                </p>
            )}
            <div className="mt-4">
                <Segmented
                    label="Inventory shelves"
                    value={tab}
                    onChange={setTab}
                    options={[
                        { value: "ALL", label: "All spaces" },
                        { value: "PUBLISHED", label: "Published" },
                        { value: "IN_REVIEW", label: "In review" },
                    ]}
                />
            </div>

            <div className="mt-6">
                {!data && loading && <Loading label="Loading your spaces…" />}
                {error && <ErrorNote message={error} onRetry={reload} />}
                {data && shown.length === 0 && (
                    <Empty
                        title={rows.length === 0 ? "No spaces yet" : tab === "PUBLISHED" ? "Nothing published yet" : "Nothing in review"}
                        text={rows.length === 0 ? "Add your first ad space. Set its price and availability, and submit it for review." : undefined}
                        action={rows.length === 0 ? { label: "Add ad space", href: "/publisher/listings/new" } : undefined}
                    />
                )}
                {data && shown.length > 0 && (
                    <DataTable columns={[{ label: "Ad space" }, { label: "Format" }, { label: `Rate / ${RATE_DAYS} days`, align: "right" }, { label: "Status" }, { label: "", align: "right" }]}>
                        {shown.map((listing) => {
                            const status = listingStatus(listing.status);
                            return (
                                <TableRow key={listing.id}>
                                    <Cell>
                                        <TitleCell title={listing.title} line={listingLine(listing)} href={`/publisher/listings/${listing.id}`} />
                                    </Cell>
                                    <Cell>
                                        <span className="text-ink">{listingFormat(listing)}</span>
                                    </Cell>
                                    <Cell align="right">
                                        <span className="whitespace-nowrap text-ink">{listing.ratePerDay ? formatMoney(rateForDays(listing.ratePerDay, RATE_DAYS)) : "Rate not set"}</span>
                                    </Cell>
                                    <Cell>
                                        <StatusText tone={status.tone}>{status.label}</StatusText>
                                    </Cell>
                                    <Cell align="right">
                                        <Link href={`/publisher/listings/${listing.id}`} className="whitespace-nowrap text-sm font-semibold text-ink hover:underline">
                                            Manage space
                                        </Link>
                                    </Cell>
                                </TableRow>
                            );
                        })}
                    </DataTable>
                )}
            </div>

            {data && rows.length > 0 && (
                <div className="mt-6 flex justify-end">
                    <Link href="/publisher/availability" className={outlineButton}>
                        Open calendar
                    </Link>
                </div>
            )}
        </>
    );
}
