"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { PageHeading } from "@/components/workspace/page-heading";
import { Cell, DataTable, Empty, ErrorNote, Loading, outlineButton, Segmented, StatusText, TableRow, TitleCell } from "@/components/publisher/parts";
import { useLoad } from "@/components/publisher/use-load";
import { bookingEarning, bookingRef, bookingStatus, COMPLETED_STATUSES, dateRange, earningHeadline, formatMoney, publisherWorkspace, UPCOMING_STATUSES, type Earnings } from "@/services/publisher-workspace";

type Tab = "ALL" | "UPCOMING" | "COMPLETED";

const FACET: Record<Tab, string | undefined> = {
    ALL: undefined,
    UPCOMING: UPCOMING_STATUSES.join(","),
    COMPLETED: COMPLETED_STATUSES.join(","),
};

/**
 * DR 12 · 10 · 04 · Bookings (5204:86964): every booking on the publisher's
 * spaces, most recent first, with the campaign, its dates, what the space
 * earns and where it stands. The chips are status facets on `/orders/my`.
 */
export default function BookingsPage() {
    return (
        <React.Suspense fallback={<Loading label="Loading your bookings…" />}>
            <BookingsView />
        </React.Suspense>
    );
}

function BookingsView() {
    const router = useRouter();
    const search = useSearchParams();
    const tab: Tab = search.get("tab") === "upcoming" ? "UPCOMING" : search.get("tab") === "completed" ? "COMPLETED" : "ALL";
    const { data, error, loading, reload } = useLoad(`bookings:${tab}`, () => publisherWorkspace.bookings({ status: FACET[tab], sort: "NEWEST", pageSize: 100 }));
    const earnings = useLoad<Earnings | null>("earnings", () => publisherWorkspace.earnings().catch(() => null));

    const setTab = (next: Tab) => router.replace(next === "ALL" ? "/publisher/bookings" : `/publisher/bookings?tab=${next.toLowerCase()}`);
    const rows = data?.items ?? [];

    return (
        <>
            <PageHeading
                title="Bookings"
                actions={
                    <Link href="/publisher/availability" className={outlineButton}>
                        Open calendar
                    </Link>
                }
            />
            {data && (
                <p className="mt-6 text-sm text-dim">
                    {data.total} booking{data.total === 1 ? "" : "s"} · Most recent first
                </p>
            )}
            <div className="mt-4">
                <Segmented
                    label="Booking shelves"
                    value={tab}
                    onChange={setTab}
                    options={[
                        { value: "ALL", label: "All bookings" },
                        { value: "UPCOMING", label: "Upcoming" },
                        { value: "COMPLETED", label: "Completed" },
                    ]}
                />
            </div>

            <div className="mt-6">
                {!data && loading && <Loading label="Loading your bookings…" />}
                {error && <ErrorNote message={error} onRetry={reload} />}
                {data && rows.length === 0 && <Empty title={tab === "ALL" ? "No bookings yet" : tab === "UPCOMING" ? "Nothing upcoming" : "Nothing completed yet"} text={tab === "ALL" ? "When an advertiser books one of your spaces, the request appears here for you to accept." : undefined} />}
                {data && rows.length > 0 && (
                    <DataTable columns={[{ label: "Booking" }, { label: "Campaign dates" }, { label: "Your earnings", align: "right" }, { label: "Status" }, { label: "", align: "right" }]}>
                        {rows.map((booking) => {
                            const status = bookingStatus(booking);
                            const earning = earningHeadline(bookingEarning(booking, earnings.data));
                            return (
                                <TableRow key={booking.id}>
                                    <Cell>
                                        <TitleCell title={booking.listing?.title ?? "Space"} line={`${bookingRef(booking)}${booking.listing?.city ? ` · ${booking.listing.city}` : ""}`} href={`/publisher/bookings/${booking.id}`} />
                                    </Cell>
                                    <Cell>
                                        <p className="whitespace-nowrap text-ink">{dateRange(booking.startDate, booking.endDate)}</p>
                                        <p className="mt-0.5 text-xs text-dim">{booking.campaignName ?? "Campaign"}</p>
                                    </Cell>
                                    <Cell align="right">
                                        <span className="whitespace-nowrap text-ink">{formatMoney(earning)}</span>
                                    </Cell>
                                    <Cell>
                                        <StatusText tone={status.tone}>{status.label}</StatusText>
                                    </Cell>
                                    <Cell align="right">
                                        <Link href={`/publisher/bookings/${booking.id}`} className="whitespace-nowrap text-sm font-semibold text-ink hover:underline">
                                            View booking
                                        </Link>
                                    </Cell>
                                </TableRow>
                            );
                        })}
                    </DataTable>
                )}
            </div>
        </>
    );
}
