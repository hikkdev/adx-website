"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import { PageHeading } from "@/components/workspace/page-heading";
import { Cell, DataTable, Empty, ErrorNote, Loading, outlineButton, Segmented, StatusText, TableRow, TitleCell } from "@/components/publisher/parts";
import { useLoad } from "@/components/publisher/use-load";
import { ListingDoor } from "@/components/publisher-home/listing-door";
import { DraftsShelf } from "@/components/listings/drafts-shelf";
import { ListingPills } from "@/components/listings/listing-pills";
import { shelfChips, shelfFromParam, shelfOf } from "@/components/listings/listing-model";
import { FLAG_INSTANT_BOOKING, useFlag } from "@/lib/flags";
import { listingEditorService, type ListingDraft } from "@/services/listing-editor";
import { formatMoney, listingFormat, listingLine, listingStatus, publisherWorkspace, rateForDays, type InventoryShelf, type PublisherReadiness } from "@/services/publisher-workspace";

const RATE_DAYS = 14;
const PAGE_SIZE = 20;

/**
 * DR 12 · 10 · 02 · My inventory (5204:86066) on the app's DR 06 shelves
 * (4428:1741): All, Available, Occupied, Inactive — each with the server's
 * count over the search — a page of twenty at a time, the search as the
 * server's `q`, and on every row the pills the app draws (verification due,
 * rights ending, the instant-booking bolt, below the floor). The spaces
 * saved half-way sit above the list on the All shelf, with Continue and
 * Throw away. The URL is the state: `?shelf=`, `?q=`, `?page=`.
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
    const params = useSearchParams();
    const instant = useFlag(FLAG_INSTANT_BOOKING);
    const shelf = shelfFromParam(params.get("shelf"));
    const q = (params.get("q") ?? "").trim();
    const page = Math.max(1, Number(params.get("page")) || 1);
    const [typed, setTyped] = React.useState(q);
    const [typedFor, setTypedFor] = React.useState(q);
    if (typedFor !== q) {
        // The URL changed under the box (back, a link): the box follows it — unless it already says the same.
        setTypedFor(q);
        if (typed.trim() !== q) setTyped(q);
    }

    const go = React.useCallback(
        (next: { shelf?: "ALL" | InventoryShelf; q?: string; page?: number }) => {
            const search = new URLSearchParams();
            const s = next.shelf ?? shelf;
            const text = next.q ?? q;
            const p = next.page ?? 1;
            if (s !== "ALL") search.set("shelf", s.toLowerCase());
            if (text) search.set("q", text);
            if (p > 1) search.set("page", String(p));
            const query = search.toString();
            router.replace(query ? `/publisher/inventory?${query}` : "/publisher/inventory");
        },
        [router, shelf, q]
    );

    /* The search goes to the server a moment after typing stops: the page is one of many. */
    React.useEffect(() => {
        const text = typed.trim();
        if (text === q) return;
        const timer = setTimeout(() => go({ q: text, page: 1 }), 400);
        return () => clearTimeout(timer);
    }, [typed, q, go]);

    const key = `${shelf}|${q}|${page}`;
    const { data, error, loading, reload } = useLoad(`inventory:${key}`, () => publisherWorkspace.listings({ q: q || undefined, shelf: shelf === "ALL" ? undefined : shelf, page, pageSize: PAGE_SIZE }));
    const drafts = useLoad("inventory:drafts", () => listingEditorService.drafts().catch(() => [] as ListingDraft[]));
    const profile = useLoad("inventory:profile", () => publisherWorkspace.profile().catch(() => null));
    const readiness: PublisherReadiness | null = profile.data?.readiness ?? null;

    const rows = data?.items ?? [];
    const total = data?.total ?? 0;
    const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    const first = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
    const last = Math.min(total, page * PAGE_SIZE);
    const showDrafts = shelf === "ALL" && !q && page === 1;
    const draftRows = showDrafts ? (drafts.data ?? []) : [];

    return (
        <>
            <PageHeading
                title="My inventory"
                subtitle="Manage your billboard and ad space listings"
                actions={
                    <>
                        <Link href="/publisher/availability" className={outlineButton}>
                            Availability
                        </Link>
                        <Link href="/publisher/listings/bulk" className={outlineButton}>
                            Add many at once
                        </Link>
                        <ListingDoor readiness={readiness} />
                    </>
                }
            />

            <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
                <Segmented label="Inventory shelves" value={shelf} onChange={(next) => go({ shelf: next, page: 1 })} options={shelfChips(data?.counts)} />
                <label className="relative w-full max-w-[320px]">
                    <span className="sr-only">Search listings</span>
                    <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-dim" aria-hidden />
                    <input value={typed} onChange={(event) => setTyped(event.target.value)} placeholder="Search listings" className="h-10 w-full rounded-md border border-line bg-white pl-9 pr-3 text-sm text-ink placeholder:text-dim focus:border-ink focus:outline-none" />
                </label>
            </div>

            <div className="mt-6">
                {showDrafts && <DraftsShelf drafts={draftRows} onChanged={drafts.reload} />}
                {!data && loading && <Loading label="Loading your spaces…" />}
                {error && <ErrorNote message={error} onRetry={reload} />}
                {data && rows.length === 0 && (
                    <Empty
                        title={q ? "Nothing matches that" : shelf === "ALL" ? (draftRows.length ? "Nothing listed yet — your drafts are above" : "No spaces yet") : `Nothing ${shelf.toLowerCase()} right now`}
                        text={q ? "Try a wider search, or clear it." : shelf === "ALL" ? "Adding one takes a few short steps, and ADX tells you how your price compares to spaces nearby as you go." : "The other shelves show the rest of your spaces."}
                        action={!q && shelf === "ALL" && draftRows.length === 0 && (readiness?.canList ?? true) ? { label: "Add ad space", href: "/publisher/listings/new" } : undefined}
                    />
                )}
                {data && rows.length > 0 && (
                    <DataTable columns={[{ label: "Ad space" }, { label: "Format" }, { label: `Rate / ${RATE_DAYS} days`, align: "right" }, { label: "Status" }, { label: "", align: "right" }]}>
                        {rows.map((listing) => {
                            const status = listingStatus(listing.status);
                            const onShelf = shelfOf(listing);
                            return (
                                <TableRow key={listing.id} className={loading ? "opacity-60" : undefined}>
                                    <Cell>
                                        <TitleCell title={listing.title} line={[listing.displayId, listingLine(listing)].filter(Boolean).join(" · ")} href={`/publisher/listings/${listing.id}`} />
                                        <ListingPills row={listing} instant={instant} className="mt-1.5" />
                                    </Cell>
                                    <Cell>
                                        <span className="text-ink">{listingFormat(listing)}</span>
                                    </Cell>
                                    <Cell align="right">
                                        <span className="whitespace-nowrap text-ink">{listing.ratePerDay ? formatMoney(rateForDays(listing.ratePerDay, RATE_DAYS)) : "Rate not set"}</span>
                                        {listing.ratePerDay && <span className="block text-xs text-dim">{formatMoney(listing.ratePerDay)}/day</span>}
                                    </Cell>
                                    <Cell>
                                        <StatusText tone={status.tone}>{status.label}</StatusText>
                                        {listing.status === "ACTIVE" && <span className="block text-xs text-dim">{onShelf === "OCCUPIED" ? "Booked now" : "Available"}</span>}
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

            {data && total > 0 && (
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                    <p className="text-sm text-dim">
                        {first}–{last} of {total} space{total === 1 ? "" : "s"}
                    </p>
                    {pages > 1 && (
                        <div className="flex items-center gap-2">
                            <button type="button" onClick={() => go({ page: page - 1 })} disabled={page <= 1} className={outlineButton}>
                                Previous
                            </button>
                            <span className="text-sm text-dim">
                                Page {page} of {pages}
                            </span>
                            <button type="button" onClick={() => go({ page: page + 1 })} disabled={page >= pages} className={outlineButton}>
                                Next
                            </button>
                        </div>
                    )}
                </div>
            )}

            {data && total > 0 && (
                <div className="mt-6 flex justify-end">
                    <Link href="/publisher/availability" className={outlineButton}>
                        Open calendar
                    </Link>
                </div>
            )}
        </>
    );
}
