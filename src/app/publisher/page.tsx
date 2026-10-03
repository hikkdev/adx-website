"use client";

import * as React from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { BadgeCheck, BookOpen, ClipboardList, QrCode, Search } from "lucide-react";
import { Panel } from "@/components/workspace/page-heading";
import { Cell, DataTable, ErrorNote, Loading, outlineButton, StatusText, TableRow, TitleCell } from "@/components/publisher/parts";
import { useLoad } from "@/components/publisher/use-load";
import { OccupancyGauge } from "@/components/publisher-home/occupancy-gauge";
import { LocationCard } from "@/components/publisher-home/location-card";
import { ListingDoor } from "@/components/publisher-home/listing-door";
import { LicenceCard, ReuploadCard, SetupCard, SuspensionBanners, TermsCard } from "@/components/publisher-home/setup-cards";
import { matchSpots, needsReupload, placedSpots, termsOutstanding } from "@/components/publisher-home/home-model";
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
    type PublisherDashboard,
    type PublisherProfile,
    type WalletSnapshot,
} from "@/services/publisher-workspace";

const SpotsMap = dynamic(() => import("@/components/publisher-home/spots-map").then((m) => m.SpotsMap), {
    ssr: false,
    loading: () => <div className="h-[400px] animate-pulse rounded-lg border border-line bg-[#f1f1ee]" />,
});

interface Overview {
    profile: PublisherProfile | null;
    dashboard: PublisherDashboard | null;
    listings: MyListing[];
    bookings: Booking[];
    wallet: WalletSnapshot | null;
    earnings: Earnings | null;
    methods: PayoutMethod[];
}

async function readOverview(): Promise<Overview> {
    const [profile, dashboard, listings, bookings, wallet, earnings, methods] = await Promise.all([
        publisherWorkspace.profile().catch(() => null),
        // The gauge and the map: their own read, and never a reason the Overview fails to draw.
        publisherWorkspace.dashboard().catch(() => null),
        publisherWorkspace.listings({ pageSize: 100 }).then((page) => page.items),
        publisherWorkspace.bookings({ pageSize: 100 }).then((page) => page.items),
        publisherWorkspace.wallet().catch(() => null),
        publisherWorkspace.earnings().catch(() => null),
        publisherWorkspace.methods().catch(() => [] as PayoutMethod[]),
    ]);
    return { profile, dashboard, listings, bookings, wallet, earnings, methods };
}

/** QR-5: "Continue unverified" puts the set-up card away for this visit (this tab), as the app does. */
const UNVERIFIED_KEY = "adx.web.publisher.continueUnverified";
function readUnverifiedOk(): boolean {
    try {
        return window.sessionStorage.getItem(UNVERIFIED_KEY) === "1";
    } catch {
        return false;
    }
}

/**
 * DR 12 · 10 · 01 · Overview (5204:85443), with the ADX app's publisher home
 * on it (DR 01): what cannot wait first — Lot A's suspension banners — then
 * the greeting, the occupancy gauge and the map of the publisher's own
 * spaces with the Location Card, then the next steps (the licence to
 * display, the set-up checklist with the server's readiness, a flagged
 * re-upload, the platform terms), and the frame's inventory count, pending
 * payout and upcoming bookings.
 */
export default function PublisherOverview() {
    const me = usePublisher();
    const router = useRouter();
    const { data, error, loading, reload } = useLoad("overview", readOverview);
    const [selected, setSelected] = React.useState<string | null>(null);
    const [query, setQuery] = React.useState("");
    // The first render is "Loading…" on the server and in the browser alike, so reading the tab's storage here cannot mismatch.
    const [unverifiedOk, setUnverifiedOk] = React.useState(() => typeof window !== "undefined" && readUnverifiedOk());

    if (!data && loading) return <Loading label="Loading your overview…" />;
    if (!data) return <ErrorNote message={error ?? "Could not read your workspace."} onRetry={reload} />;

    const profile = data.profile;
    const dashboard = data.dashboard;
    const readiness = profile?.readiness ?? null;
    const kycStatus = profile?.kycStatus ?? me?.kycStatus;
    const verified = profile?.verified ?? kycStatus === "VERIFIED";
    const name = (dashboard?.name ?? profile?.name ?? me?.name ?? "").split(" ")[0] ?? "";

    const published = data.listings.filter((l) => listingShelf(l.status) === "PUBLISHED");
    const inReview = data.listings.filter((l) => listingShelf(l.status) === "IN_REVIEW");
    const upcoming = data.bookings.filter(isUpcoming).sort((a, b) => (a.startDate ?? "").localeCompare(b.startDate ?? ""));
    const pending = data.wallet?.pendingClearance ?? data.earnings?.summary.pendingClearance ?? null;
    const clearsBy = pendingClearsBy(data.earnings);

    const setUp = readiness ? readiness.percent >= 100 && data.listings.length > 0 && data.methods.length > 0 : verified && data.listings.length > 0 && data.methods.length > 0;
    const showSetup = !setUp && !unverifiedOk;

    const spots = dashboard?.listings ?? [];
    const shown = matchSpots(spots, query);
    const open = selected ? (spots.find((spot) => spot.id === selected) ?? null) : null;
    const placed = placedSpots(spots).length;

    const continueUnverified = () => {
        try {
            window.sessionStorage.setItem(UNVERIFIED_KEY, "1");
        } catch {
            /* Private mode: the card goes away for this render only. */
        }
        setUnverifiedOk(true);
    };

    const search = (event: React.FormEvent) => {
        event.preventDefault();
        router.push(query.trim() ? `/publisher/inventory?q=${encodeURIComponent(query.trim())}` : "/publisher/inventory");
    };

    return (
        <>
            {error && <ErrorNote message={error} onRetry={reload} />}
            <SuspensionBanners scopes={profile?.suspensionScopes} reason={profile?.suspensionReason} />

            <div className={profile?.suspensionScopes?.length || error ? "mt-6" : undefined}>
                <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight text-ink">
                            {dashboard?.greeting ?? "Welcome"}
                            {name ? `, ${name}` : ""}
                            {verified && <BadgeCheck className="size-5 text-success" aria-label="KYC verified" />}
                        </h1>
                        <p className="mt-2 text-sm text-dim">Your listing performance today</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                        <Link href="/publisher/listings/bulk" className={outlineButton}>
                            Add many at once
                        </Link>
                        <ListingDoor readiness={readiness} />
                    </div>
                </div>
            </div>

            <section className="mt-6 grid gap-6 lg:grid-cols-[320px_1fr]" aria-label="Today">
                <Panel className="flex flex-col">
                    <div className="flex flex-1 items-center justify-center py-2">
                        <OccupancyGauge rate={dashboard?.occupancy.rate ?? null} occupancy={dashboard?.occupancy ?? null} />
                    </div>
                    <div className="mt-6 grid grid-cols-3 border-t border-line pt-4 text-center">
                        <Tile href="/publisher/inventory" icon={<ClipboardList className="size-5" aria-hidden />} label="Listings" />
                        <Tile href="/publisher/training" icon={<BookOpen className="size-5" aria-hidden />} label="Training" />
                        <Tile href="/publisher/access" icon={<QrCode className="size-5" aria-hidden />} label="My QR code" />
                    </div>
                    {dashboard && dashboard.awaiting > 0 && (
                        <Link href="/publisher/bookings" className="mt-4 flex items-center justify-between rounded-md bg-brand-soft px-3 py-2 text-sm font-semibold text-brand hover:bg-brand hover:text-white">
                            {dashboard.awaiting} booking{dashboard.awaiting === 1 ? "" : "s"} waiting for your answer
                            <span aria-hidden>→</span>
                        </Link>
                    )}
                    {!dashboard && <p className="mt-4 text-xs text-dim">Today&apos;s figures could not be read just now.</p>}
                </Panel>

                <div>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <form onSubmit={search} className="relative w-full max-w-[360px]" role="search">
                            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-dim" aria-hidden />
                            <input
                                value={query}
                                onChange={(event) => {
                                    setQuery(event.target.value);
                                    setSelected(null);
                                }}
                                placeholder="Search your spaces"
                                aria-label="Search your spaces"
                                className="h-10 w-full rounded-md border border-line bg-white pl-9 pr-3 text-sm text-ink placeholder:text-dim focus:border-ink focus:outline-none"
                            />
                        </form>
                        <div className="flex flex-wrap items-center gap-4 text-xs text-dim">
                            <Legend colour="#bd2020" label="Booked today" />
                            <Legend colour="#141518" label="Live, free" />
                            <Legend colour="#b8b9bc" label="Not live" />
                            {spots.length > 0 && (
                                <Link href={query.trim() ? `/publisher/inventory?q=${encodeURIComponent(query.trim())}` : "/publisher/inventory"} className="font-semibold text-ink hover:underline">
                                    {query.trim() ? `${shown.length} of ${spots.length} spaces` : `${spots.length} space${spots.length === 1 ? "" : "s"}`}
                                </Link>
                            )}
                        </div>
                    </div>
                    <div className="relative mt-3">
                        <SpotsMap spots={shown} selected={selected} onSelect={setSelected} height={400} />
                        {open && <LocationCard spot={open} onClose={() => setSelected(null)} className="z-[500] mt-3 md:absolute md:right-3 md:top-3 md:mt-0 md:w-[340px]" />}
                    </div>
                    {spots.length > 0 && placed < spots.length && <p className="mt-2 text-xs text-dim">{spots.length - placed} of your spaces have no map pin yet — they are listed in your inventory.</p>}
                </div>
            </section>

            <div className="mt-6 grid gap-6">
                <LicenceCard licence={profile?.licence} />
                {showSetup && <SetupCard readiness={readiness} kycStatus={kycStatus} listings={data.listings.length} methods={data.methods.length} onContinueUnverified={continueUnverified} />}
                {profile && needsReupload(profile) && <ReuploadCard />}
                {profile && termsOutstanding(profile) && <TermsCard onAccepted={reload} />}
            </div>

            <div className="mt-10 grid gap-10 lg:grid-cols-2">
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

/** One of DR 01's three tiles under the gauge. */
function Tile({ href, icon, label }: { href: string; icon: React.ReactNode; label: string }) {
    return (
        <Link href={href} className="flex flex-col items-center gap-2 rounded-md py-2 text-brand hover:bg-ground">
            {icon}
            <span className="text-xs font-medium text-ink">{label}</span>
        </Link>
    );
}

function Legend({ colour, label }: { colour: string; label: string }) {
    return (
        <span className="inline-flex items-center gap-1.5">
            <span className="size-2 rounded-full" style={{ background: colour }} aria-hidden />
            {label}
        </span>
    );
}
