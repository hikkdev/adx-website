"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";
import { PageHeading } from "@/components/workspace/page-heading";
import { Cell, DataTable, Empty, ErrorNote, Loading, outlineButton, Segmented, StatusText, TableRow, TitleCell } from "@/components/publisher/parts";
import { useLoad } from "@/components/publisher/use-load";
import { cn } from "@/lib/utils";
import { BOOKING_FILTERS, filterCounts, filterFromParam, matchesFilter, matchesSearch, needsPublisher, publisherBookings, waitingLine, type BookingFilter } from "@/services/publisher-bookings";
import { bookingEarning, bookingRef, bookingStatus, dateRange, formatMoney, publisherWorkspace, type Booking, type Earnings } from "@/services/publisher-workspace";

/**
 * DR 12 · 10 · 04 · Bookings (5204:86964) with the app's list on top of it:
 * a search over campaigns, spaces and booking ids, the four chips — All,
 * Pending, Active, Completed — counted over every booking, and how many are
 * waiting on the publisher. The whole list is read once (every page of
 * `/orders/my`) and the chips and the search fold over it here, as the app
 * does, so a count never stops at the first hundred.
 */
export default function BookingsPage() {
    return (
        <React.Suspense fallback={<Loading label="Loading your bookings…" />}>
            <BookingsView />
        </React.Suspense>
    );
}

async function readBookings(): Promise<{ rows: Booking[]; earnings: Earnings | null }> {
    const [rows, earnings] = await Promise.all([publisherBookings.all(), publisherWorkspace.earnings().catch(() => null)]);
    return { rows, earnings };
}

function BookingsView() {
    const router = useRouter();
    const search = useSearchParams();
    const filter = filterFromParam(search.get("tab"));
    const [query, setQuery] = React.useState(search.get("q") ?? "");
    const { data, error, loading, reload } = useLoad("bookings:all", readBookings);
    const [now] = React.useState(() => Date.now());

    const setFilter = (next: BookingFilter) => {
        const params = new URLSearchParams();
        if (next !== "ALL") params.set("tab", next.toLowerCase());
        if (query.trim()) params.set("q", query.trim());
        const text = params.toString();
        router.replace(text ? `/publisher/bookings?${text}` : "/publisher/bookings");
    };

    const all = data?.rows ?? [];
    const counts = filterCounts(all, now);
    const rows = all.filter((booking) => matchesFilter(booking, filter, now) && matchesSearch(booking, query));
    const waiting = all.filter(needsPublisher).length;
    const label = BOOKING_FILTERS.find((row) => row.value === filter)?.label.toLowerCase() ?? "all";

    return (
        <>
            <PageHeading
                title="Bookings"
                subtitle="Track your spaces from request to live."
                actions={
                    <Link href="/publisher/availability" className={outlineButton}>
                        Open calendar
                    </Link>
                }
            />

            {waiting > 0 && (
                <p role="status" className="mt-6 rounded-md bg-warning-soft px-4 py-3 text-sm text-warning">
                    {waitingLine(waiting)}{" "}
                    <button type="button" onClick={() => setFilter("PENDING")} className="font-semibold underline underline-offset-4">
                        Show them
                    </button>
                </p>
            )}

            <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
                <Segmented label="Booking shelves" value={filter} onChange={setFilter} options={BOOKING_FILTERS.map((row) => ({ value: row.value, label: row.label, count: data ? counts[row.value] : undefined }))} />
                <label className="relative w-full max-w-[340px]">
                    <span className="sr-only">Search bookings</span>
                    <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-dim" aria-hidden />
                    <input
                        type="search"
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        placeholder="Campaign, space or booking id"
                        className="h-10 w-full rounded-md border border-line bg-white pl-9 pr-9 text-sm text-ink placeholder:text-dim focus:border-ink focus:outline-none"
                    />
                    {query && (
                        <button type="button" onClick={() => setQuery("")} aria-label="Clear the search" className="absolute right-2 top-1/2 flex size-6 -translate-y-1/2 items-center justify-center rounded text-dim hover:text-ink">
                            <X className="size-4" aria-hidden />
                        </button>
                    )}
                </label>
            </div>

            {data && (
                <p className="mt-4 text-sm text-dim">
                    {rows.length} of {all.length} booking{all.length === 1 ? "" : "s"} · Most recent first
                </p>
            )}

            <div className="mt-4">
                {!data && loading && <Loading label="Loading your bookings…" />}
                {error && <ErrorNote message={error} onRetry={reload} />}
                {data && all.length === 0 && <Empty title="No bookings yet" text="When an advertiser books one of your spaces, the request appears here for you to accept." />}
                {data && all.length > 0 && rows.length === 0 && <Empty title={`Nothing under ${label}${query.trim() ? ` matching “${query.trim()}”` : ""}`} text="Try another chip, or clear the search." />}
                {data && rows.length > 0 && (
                    <DataTable columns={[{ label: "Booking" }, { label: "Campaign dates" }, { label: "Your earnings", align: "right" }, { label: "Status" }, { label: "", align: "right" }]}>
                        {rows.map((booking) => (
                            <BookingRow key={booking.id} booking={booking} earnings={data.earnings} now={now} />
                        ))}
                    </DataTable>
                )}
            </div>
        </>
    );
}

function BookingRow({ booking, earnings, now }: { booking: Booking; earnings: Earnings | null; now: number }) {
    const status = bookingStatus(booking, now);
    const earning = bookingEarning(booking, earnings);
    const amount = earning.source === "ACCRUED" ? earning.net : earning.source === "EXPECTED" ? earning.gross : null;
    const yours = needsPublisher(booking);
    return (
        <TableRow>
            <Cell>
                <TitleCell title={booking.listing?.title ?? "Space"} line={`${bookingRef(booking)}${booking.listing?.city ? ` · ${booking.listing.city}` : ""}`} href={`/publisher/bookings/${booking.id}`} />
            </Cell>
            <Cell>
                <p className="whitespace-nowrap text-ink">{dateRange(booking.startDate, booking.endDate)}</p>
                <p className="mt-0.5 text-xs text-dim">{booking.campaignName ?? "Campaign"}</p>
            </Cell>
            <Cell align="right">
                {amount ? (
                    <>
                        <span className={cn("whitespace-nowrap", earning.source === "EXPECTED" ? "text-dim" : "text-ink")}>{formatMoney(amount)}</span>
                        <p className="mt-0.5 text-xs text-dim">{earning.source === "EXPECTED" ? "Expected" : "Earned"}</p>
                    </>
                ) : (
                    <span className="whitespace-nowrap text-xs text-dim">On your statement</span>
                )}
            </Cell>
            <Cell>
                <StatusText tone={status.tone}>{status.label}</StatusText>
                {yours && <p className="mt-0.5 text-xs font-medium text-warning">Waiting on you</p>}
                {booking.status === "CANCELLED" && booking.cancellationReason?.trim() && <p className="mt-0.5 max-w-[220px] truncate text-xs text-danger">{booking.cancellationReason}</p>}
            </Cell>
            <Cell align="right">
                <Link href={`/publisher/bookings/${booking.id}`} className="whitespace-nowrap text-sm font-semibold text-ink hover:underline">
                    View booking
                </Link>
            </Cell>
        </TableRow>
    );
}
