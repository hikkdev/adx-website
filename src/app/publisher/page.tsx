"use client";

import * as React from "react";
import Link from "next/link";
import { PageHeading, Panel } from "@/components/workspace/page-heading";
import { brandButton, Cell, DataTable, ErrorNote, Loading, outlineButton, StatusText, TableRow, TitleCell } from "@/components/publisher/parts";
import { useLoad } from "@/components/publisher/use-load";
import { usePublisher } from "./layout";
import {
    bookingEarning,
    bookingRef,
    bookingStatus,
    dateRange,
    earningHeadline,
    formatMoney,
    isUpcoming,
    listingFormat,
    listingShelf,
    longDate,
    pendingClearsBy,
    publisherWorkspace,
    type Booking,
    type Earnings,
    type MyListing,
    type PayoutMethod,
    type WalletSnapshot,
} from "@/services/publisher-workspace";

interface Overview {
    listings: MyListing[];
    bookings: Booking[];
    wallet: WalletSnapshot | null;
    earnings: Earnings | null;
    methods: PayoutMethod[];
}

async function readOverview(): Promise<Overview> {
    const [listings, bookings, wallet, earnings, methods] = await Promise.all([
        publisherWorkspace.listings({ pageSize: 100 }).then((page) => page.items),
        publisherWorkspace.bookings({ pageSize: 100 }).then((page) => page.items),
        publisherWorkspace.wallet().catch(() => null),
        publisherWorkspace.earnings().catch(() => null),
        publisherWorkspace.methods().catch(() => [] as PayoutMethod[]),
    ]);
    return { listings, bookings, wallet, earnings, methods };
}

/**
 * DR 12 · 10 · 01 · Overview (5204:85443): the inventory count, the pending
 * payout, and the upcoming bookings with what each one earns. A workspace
 * that is not set up yet keeps its checklist at the top until it is.
 */
export default function PublisherOverview() {
    const me = usePublisher();
    const { data, error, loading, reload } = useLoad("overview", readOverview);

    if (!data && loading) return <Loading label="Loading your overview…" />;
    if (!data) return <ErrorNote message={error ?? "Could not read your workspace."} onRetry={reload} />;

    const published = data.listings.filter((l) => listingShelf(l.status) === "PUBLISHED");
    const inReview = data.listings.filter((l) => listingShelf(l.status) === "IN_REVIEW");
    const upcoming = data.bookings.filter(isUpcoming).sort((a, b) => (a.startDate ?? "").localeCompare(b.startDate ?? ""));
    const pending = data.wallet?.pendingClearance ?? data.earnings?.summary.pendingClearance ?? null;
    const clearsBy = pendingClearsBy(data.earnings);
    const verified = me?.kycStatus === "VERIFIED";
    const setUp = verified && data.listings.length > 0 && data.methods.length > 0;

    return (
        <>
            <PageHeading
                title="Overview"
                actions={
                    <Link href="/publisher/listings/new" className={brandButton}>
                        Add ad space
                    </Link>
                }
            />
            {error && <ErrorNote message={error} onRetry={reload} />}

            {!setUp && <SetupChecklist verified={verified} kycStatus={me?.kycStatus} listings={data.listings.length} methods={data.methods.length} />}

            <div className="mt-8 grid gap-10 lg:grid-cols-2">
                <section aria-labelledby="inventory-heading">
                    <div className="flex items-center justify-between">
                        <h2 id="inventory-heading" className="text-base font-semibold text-ink">
                            Inventory
                        </h2>
                        <Link href="/publisher/inventory" className="text-sm font-medium text-ink hover:underline">
                            Manage inventory
                        </Link>
                    </div>
                    <div className="mt-5 flex items-end gap-6">
                        <Figure value={published.length} label={`Published space${published.length === 1 ? "" : "s"}`} />
                        <Figure value={inReview.length} label="In review" />
                    </div>
                    <p className="mt-3 text-sm text-dim">
                        {inReview[0] ? `${inReview[0].title} · In review` : published[0] ? `${published[0].title} · Published` : data.listings.length === 0 ? "No spaces yet. Add your first ad space to start receiving bookings." : `${data.listings.length} space${data.listings.length === 1 ? "" : "s"} in your inventory`}
                    </p>
                </section>

                <section aria-labelledby="payout-heading">
                    <div className="flex items-center justify-between">
                        <h2 id="payout-heading" className="text-base font-semibold text-ink">
                            Pending payout
                        </h2>
                        <Link href="/publisher/earnings" className="text-sm font-medium text-ink hover:underline">
                            View earnings
                        </Link>
                    </div>
                    <p className="mt-5 text-2xl font-semibold text-ink">{formatMoney(pending ?? "0.00")}</p>
                    <p className="mt-3 text-sm text-dim">
                        {clearsBy ? `After campaign completion · ${longDate(clearsBy)}` : data.wallet && Number(data.wallet.withdrawable) > 0 ? `${formatMoney(data.wallet.withdrawable)} available to withdraw` : "Earnings clear seven days after each verified campaign day."}
                    </p>
                </section>
            </div>

            <section className="mt-10" aria-labelledby="upcoming-heading">
                <div className="flex items-end justify-between gap-4">
                    <div>
                        <h2 id="upcoming-heading" className="text-base font-semibold text-ink">
                            Upcoming bookings
                        </h2>
                        <p className="mt-1 text-sm text-dim">
                            {upcoming.length} upcoming booking{upcoming.length === 1 ? "" : "s"}
                        </p>
                    </div>
                    <Link href="/publisher/bookings" className="text-sm font-medium text-ink hover:underline">
                        View all bookings
                    </Link>
                </div>
                <div className="mt-4">
                    {upcoming.length === 0 ? (
                        <Panel>
                            <p className="text-sm font-medium text-ink">No upcoming bookings</p>
                            <p className="mt-1 text-sm text-dim">Requests from advertisers appear here the moment they come in.</p>
                        </Panel>
                    ) : (
                        <DataTable columns={[{ label: "Ad space" }, { label: "Campaign" }, { label: "Dates" }, { label: "Earnings", align: "right" }, { label: "Status" }, { label: "", align: "right" }]}>
                            {upcoming.slice(0, 6).map((booking) => {
                                const status = bookingStatus(booking);
                                const earning = earningHeadline(bookingEarning(booking, data.earnings));
                                return (
                                    <TableRow key={booking.id}>
                                        <Cell>
                                            <TitleCell title={booking.listing?.title ?? "Space"} line={`${bookingRef(booking)}${booking.listing ? ` · ${listingFormat(booking.listing)}` : ""}`} />
                                        </Cell>
                                        <Cell>
                                            <span className="text-dim">{booking.campaignName ?? "Campaign"}</span>
                                        </Cell>
                                        <Cell>
                                            <span className="whitespace-nowrap text-dim">{dateRange(booking.startDate, booking.endDate)}</span>
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
            </section>
        </>
    );
}

function Figure({ value, label }: { value: number; label: string }) {
    return (
        <p className="flex items-baseline gap-2">
            <span className="text-2xl font-semibold text-ink">{value}</span>
            <span className="text-sm text-dim">{label}</span>
        </p>
    );
}

/** DR 12 · 03 · 05 (5204:62068): the setup checklist, kept above the overview until the workspace is ready. */
function SetupChecklist({ verified, kycStatus, listings, methods }: { verified: boolean; kycStatus: string | undefined; listings: number; methods: number }) {
    const kycStarted = !!kycStatus && kycStatus !== "NOT_STARTED" && kycStatus !== "PENDING_UPLOAD" && kycStatus !== "AWAITING_DOCUMENTS";
    return (
        <Panel className="mt-6">
            <h2 className="text-base font-semibold text-ink">Finish setting up your workspace</h2>
            <p className="mt-1 text-sm text-dim">You can prepare a listing while your business information is reviewed.</p>
            <ol className="mt-5 space-y-3">
                <Step
                    n={1}
                    title="Add and verify your business"
                    text="Provide business and contact details, then submit supporting documents."
                    done={verified}
                    note={verified ? "Verified" : kycStarted ? "In review" : undefined}
                    action={{ label: verified ? "View business profile" : kycStarted ? "See verification status" : "Start business setup", href: verified ? "/publisher/profile" : "/publisher/profile/verify" }}
                />
                <Step n={2} title="Create your first listing" text="Add a space, set your price and availability, and submit it for review." done={listings > 0} note={listings > 0 ? `${listings} listing${listings === 1 ? "" : "s"}` : undefined} action={{ label: listings > 0 ? "Open my inventory" : "Add an ad space", href: listings > 0 ? "/publisher/inventory" : "/publisher/listings/new" }} />
                <Step n={3} title="Set up your payout account" text="Add the bank account where you want to receive your earnings." done={methods > 0} note={methods > 0 ? "Added" : undefined} action={{ label: methods > 0 ? "View bank details" : "Add bank details", href: "/publisher/earnings/bank" }} />
            </ol>
        </Panel>
    );
}

function Step({ n, title, text, done, note, action }: { n: number; title: string; text: string; done: boolean; note?: string; action: { label: string; href: string } }) {
    return (
        <li className="flex flex-wrap items-center justify-between gap-4 rounded-lg bg-ground px-5 py-4">
            <div>
                <p className="text-sm font-semibold text-ink">
                    {n}. {title}
                    {note && <span className={`ml-3 rounded-md px-2 py-0.5 text-xs font-semibold ${done ? "bg-success-soft text-success" : "bg-warning-soft text-warning"}`}>{note}</span>}
                </p>
                <p className="mt-1 text-sm text-dim">{text}</p>
            </div>
            <Link href={action.href} className={outlineButton}>
                {action.label}
            </Link>
        </li>
    );
}
