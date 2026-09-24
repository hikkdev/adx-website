"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { CalendarDays, ChevronLeft, ChevronRight, List, Plus } from "lucide-react";
import { toast } from "sonner";
import { PageHeading } from "@/components/workspace/page-heading";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AvailabilityGrid, AvailabilityLegend } from "@/components/publisher/availability-grid";
import { brandButton, ErrorNote, Field, inputClass, Loading, outlineButton, StatusText } from "@/components/publisher/parts";
import { useLoad } from "@/components/publisher/use-load";
import { ApiError, messageOf } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { usePublisher } from "../layout";
import { bookingStatus, calendarWindow, dateRange, isoDay, listingFormat, publisherWorkspace, shiftAnchor, windowLabel, type AvailabilityListing, type CalendarView, type OrderStatus } from "@/services/publisher-workspace";

const VIEWS: { value: CalendarView; label: string }[] = [
    { value: "week", label: "Week" },
    { value: "2weeks", label: "2 weeks" },
    { value: "month", label: "Month" },
];

export default function AvailabilityPage() {
    return (
        <React.Suspense fallback={<Loading label="Loading your calendar…" />}>
            <AvailabilityView />
        </React.Suspense>
    );
}

/**
 * DR 12 · 10 · 03 · Availability (5204:87466): the calendar of every space —
 * a week, a fortnight or a month at a time — with bookings, holds and
 * blocked dates on each row, a list view of the same, and "Manage dates"
 * to block a space for dates it cannot be booked.
 */
function AvailabilityView() {
    const me = usePublisher();
    const router = useRouter();
    const search = useSearchParams();
    const today = isoDay(new Date());
    const view: CalendarView = search.get("view") === "week" ? "week" : search.get("view") === "month" ? "month" : "2weeks";
    const anchor = /^\d{4}-\d{2}-\d{2}$/.test(search.get("at") ?? "") ? (search.get("at") as string) : today;
    const mode: "grid" | "list" = search.get("mode") === "list" ? "list" : "grid";
    const window = React.useMemo(() => calendarWindow(anchor, view), [anchor, view]);
    const { data, error, loading, reload } = useLoad(`availability:${window.from}:${window.to}`, () => publisherWorkspace.availability(window.from, window.to));
    const [manage, setManage] = React.useState(false);

    const go = (next: { view?: CalendarView; at?: string; mode?: "grid" | "list" }) => {
        const params = new URLSearchParams();
        const v = next.view ?? view;
        const at = next.at ?? anchor;
        const m = next.mode ?? mode;
        if (v !== "2weeks") params.set("view", v);
        if (at !== today) params.set("at", at);
        if (m !== "grid") params.set("mode", m);
        const text = params.toString();
        router.replace(text ? `/publisher/availability?${text}` : "/publisher/availability");
    };

    const listings = data?.listings ?? [];

    const removeBlock = async (listingId: string, blockId: string) => {
        try {
            await publisherWorkspace.removeBlockedDate(listingId, blockId);
            toast.success("Dates unblocked");
            reload();
        } catch (caught) {
            toast.error(messageOf(caught, "Could not unblock those dates."));
        }
    };

    return (
        <>
            <PageHeading
                title="Availability"
                subtitle={`${me?.name ?? "Your spaces"} · ${listings.length} space${listings.length === 1 ? "" : "s"} · ${dateRange(window.from, window.to, { month: "long" })}`}
                actions={
                    <>
                        <button type="button" onClick={() => go({ mode: mode === "grid" ? "list" : "grid" })} className={cn(outlineButton, "gap-2")}>
                            {mode === "grid" ? <List className="size-4" aria-hidden /> : <CalendarDays className="size-4" aria-hidden />}
                            {mode === "grid" ? "List view" : "Calendar view"}
                        </button>
                        <button type="button" onClick={() => setManage(true)} className={cn(brandButton, "gap-2")}>
                            <Plus className="size-4" aria-hidden />
                            Manage dates
                        </button>
                    </>
                }
            />

            <div className="mt-6 flex flex-wrap items-center gap-3">
                <div role="tablist" aria-label="Calendar range" className="inline-flex items-center rounded-md border border-line bg-white p-0.5">
                    {VIEWS.map((option) => (
                        <button key={option.value} type="button" role="tab" aria-selected={view === option.value} onClick={() => go({ view: option.value })} className={cn("h-8 rounded-[5px] px-3.5 text-sm", view === option.value ? "bg-ink font-semibold text-white" : "text-ink hover:bg-ground")}>
                            {option.label}
                        </button>
                    ))}
                </div>
                <button type="button" onClick={() => go({ at: today })} className={cn(outlineButton, "h-9 px-3.5")}>
                    Today
                </button>
                <div className="flex items-center gap-1">
                    <button type="button" aria-label="Earlier" onClick={() => go({ at: shiftAnchor(anchor, view, -1) })} className="flex size-8 items-center justify-center rounded-md text-ink hover:bg-white">
                        <ChevronLeft className="size-4" aria-hidden />
                    </button>
                    <span className="min-w-[132px] text-center text-sm font-medium text-ink">{windowLabel(window.from, window.to, view)}</span>
                    <button type="button" aria-label="Later" onClick={() => go({ at: shiftAnchor(anchor, view, 1) })} className="flex size-8 items-center justify-center rounded-md text-ink hover:bg-white">
                        <ChevronRight className="size-4" aria-hidden />
                    </button>
                </div>
                <div className="ml-auto">
                    <AvailabilityLegend />
                </div>
            </div>

            <div className="mt-4">
                {!data && loading && <Loading label="Loading your calendar…" />}
                {error && <ErrorNote message={error} onRetry={reload} />}
                {data && listings.length === 0 && (
                    <div className="rounded-lg border border-dashed border-line bg-white px-6 py-10 text-center">
                        <p className="text-sm font-semibold text-ink">No spaces on the calendar yet</p>
                        <p className="mt-1 text-sm text-dim">Add an ad space and its bookings will appear here by date.</p>
                        <Link href="/publisher/listings/new" className={cn(outlineButton, "mt-5")}>
                            Add ad space
                        </Link>
                    </div>
                )}
                {data && listings.length > 0 && (mode === "grid" ? <AvailabilityGrid days={window.days} listings={listings} today={today} onRemoveBlock={data.blocksAvailable ? removeBlock : undefined} /> : <AvailabilityList listings={listings} onRemoveBlock={data.blocksAvailable ? removeBlock : undefined} />)}
                {data && listings.length > 0 && (
                    <div className={cn("flex items-center justify-between px-3 py-3 text-sm", loading && "opacity-60")}>
                        <span className="text-dim">
                            {listings.length} of {listings.length} spaces
                            {!data.blocksAvailable && " · Blocked dates are not available yet"}
                        </span>
                        <Link href="/publisher/inventory" className="font-medium text-brand-bright hover:underline">
                            View my inventory
                        </Link>
                    </div>
                )}
            </div>

            <ManageDates
                open={manage}
                onClose={() => setManage(false)}
                listings={listings}
                blocksAvailable={data?.blocksAvailable ?? true}
                defaultFrom={anchor}
                onChanged={reload}
            />
        </>
    );
}

/** The list view: a card per space with every range on it in words. */
function AvailabilityList({ listings, onRemoveBlock }: { listings: AvailabilityListing[]; onRemoveBlock?: (listingId: string, blockId: string) => void }) {
    return (
        <div className="grid gap-3">
            {listings.map((listing) => {
                const live = listing.status === "ACTIVE";
                const nothing = listing.bookings.length === 0 && listing.blocks.length === 0;
                return (
                    <section key={listing.id} className="rounded-lg border border-line bg-white px-5 py-4">
                        <div className="flex flex-wrap items-baseline justify-between gap-2">
                            <div>
                                <Link href={`/publisher/listings/${listing.id}`} className="text-sm font-semibold text-ink hover:underline">
                                    {listing.title}
                                </Link>
                                <p className="text-xs text-dim">
                                    {listingFormat({ category: listing.category })}
                                    {listing.city ? ` · ${listing.city}` : ""}
                                </p>
                            </div>
                            {!live && <StatusText tone="warning">In review · unavailable for booking</StatusText>}
                        </div>
                        {live && nothing && <p className="mt-3 text-sm text-dim">Available every day in this range.</p>}
                        {(listing.bookings.length > 0 || listing.blocks.length > 0) && (
                            <ul className="mt-3 divide-y divide-line">
                                {listing.bookings.map((booking) => {
                                    const status = booking.status ? bookingStatus({ status: booking.status as OrderStatus, endDate: booking.to }) : { label: booking.kind === "HOLD" ? "On hold" : "Booked", tone: "ink" as const };
                                    return (
                                        <li key={booking.orderId} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                                            <span className="text-ink">
                                                {dateRange(booking.from, booking.to)} · {booking.campaignName ?? booking.advertiserName ?? "Booking"}
                                            </span>
                                            <span className="flex items-center gap-4">
                                                <StatusText tone={status.tone}>{status.label}</StatusText>
                                                <Link href={`/publisher/bookings/${booking.orderId}`} className="font-semibold text-ink hover:underline">
                                                    View booking
                                                </Link>
                                            </span>
                                        </li>
                                    );
                                })}
                                {listing.blocks.map((block) => (
                                    <li key={block.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                                        <span className="text-ink">
                                            {dateRange(block.from, block.to)} · Blocked{block.reason ? ` · ${block.reason}` : ""}
                                        </span>
                                        {onRemoveBlock && (
                                            <button type="button" onClick={() => onRemoveBlock(listing.id, block.id)} className="font-semibold text-ink hover:underline">
                                                Unblock
                                            </button>
                                        )}
                                    </li>
                                ))}
                            </ul>
                        )}
                    </section>
                );
            })}
        </div>
    );
}

/** "Manage dates": block a space for dates it cannot be booked — `POST /listings/:id/blocked-dates`. */
function ManageDates({ open, onClose, listings, blocksAvailable, defaultFrom, onChanged }: { open: boolean; onClose: () => void; listings: AvailabilityListing[]; blocksAvailable: boolean; defaultFrom: string; onChanged: () => void }) {
    const [listingId, setListingId] = React.useState("");
    const [from, setFrom] = React.useState(defaultFrom);
    const [to, setTo] = React.useState(defaultFrom);
    const [reason, setReason] = React.useState("");
    const [busy, setBusy] = React.useState(false);
    const [note, setNote] = React.useState<{ tone: "error" | "info"; text: string } | null>(null);
    const chosen = listings.find((l) => l.id === listingId) ?? listings[0] ?? null;

    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!chosen) return;
        if (to < from) {
            setNote({ tone: "error", text: "The end date is before the start date." });
            return;
        }
        setBusy(true);
        setNote(null);
        try {
            await publisherWorkspace.addBlockedDate(chosen.id, { from, to, ...(reason.trim() ? { reason: reason.trim() } : {}) });
            toast.success(`${chosen.title} blocked ${dateRange(from, to)}`);
            setReason("");
            onChanged();
            onClose();
        } catch (caught) {
            if (caught instanceof ApiError && caught.status === 404) setNote({ tone: "info", text: "Blocking dates is not available yet. ADX is adding it — your bookings still show on the calendar." });
            else if (caught instanceof ApiError && caught.code === "DATES_BOOKED") setNote({ tone: "error", text: caught.message || "A booking already covers those dates." });
            else setNote({ tone: "error", text: messageOf(caught, "Could not block those dates.") });
        } finally {
            setBusy(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
            <DialogContent className="max-w-[560px] rounded-lg border-line p-6">
                <DialogHeader>
                    <DialogTitle className="text-lg font-semibold text-ink">Manage dates</DialogTitle>
                    <DialogDescription className="text-sm text-dim">Block a space for dates it cannot be booked — maintenance, a private campaign, a permit gap. Advertisers will not be able to pick those dates.</DialogDescription>
                </DialogHeader>
                {!blocksAvailable && <p className="rounded-md bg-info-soft px-3 py-2 text-sm text-info">Blocking dates is not available yet — ADX is adding it. Bookings still show on the calendar.</p>}
                <form onSubmit={submit} className="grid gap-4">
                    <Field label="Space" htmlFor="block-space">
                        <select id="block-space" value={chosen?.id ?? ""} onChange={(event) => setListingId(event.target.value)} className={inputClass}>
                            {listings.map((listing) => (
                                <option key={listing.id} value={listing.id}>
                                    {listing.title}
                                </option>
                            ))}
                        </select>
                    </Field>
                    <div className="grid grid-cols-2 gap-4">
                        <Field label="From" htmlFor="block-from">
                            <input id="block-from" type="date" value={from} onChange={(event) => setFrom(event.target.value)} className={inputClass} required />
                        </Field>
                        <Field label="To" htmlFor="block-to">
                            <input id="block-to" type="date" value={to} min={from} onChange={(event) => setTo(event.target.value)} className={inputClass} required />
                        </Field>
                    </div>
                    <Field label="Reason" hint="optional" htmlFor="block-reason">
                        <input id="block-reason" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Maintenance, private campaign…" className={inputClass} maxLength={120} />
                    </Field>
                    {chosen && chosen.blocks.length > 0 && (
                        <div>
                            <p className="text-sm font-medium text-ink">Already blocked</p>
                            <ul className="mt-2 divide-y divide-line rounded-md border border-line">
                                {chosen.blocks.map((block) => (
                                    <li key={block.id} className="flex items-center justify-between px-3 py-2 text-sm">
                                        <span className="text-ink">
                                            {dateRange(block.from, block.to)}
                                            {block.reason ? ` · ${block.reason}` : ""}
                                        </span>
                                        <button
                                            type="button"
                                            className="font-semibold text-ink hover:underline"
                                            onClick={async () => {
                                                try {
                                                    await publisherWorkspace.removeBlockedDate(chosen.id, block.id);
                                                    onChanged();
                                                } catch (caught) {
                                                    setNote({ tone: "error", text: messageOf(caught, "Could not unblock those dates.") });
                                                }
                                            }}
                                        >
                                            Unblock
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                    {note && (
                        <p role={note.tone === "error" ? "alert" : "status"} className={cn("rounded-md px-3 py-2 text-sm", note.tone === "error" ? "bg-danger-soft text-danger" : "bg-info-soft text-info")}>
                            {note.text}
                        </p>
                    )}
                    <div className="flex items-center justify-end gap-3">
                        <button type="button" onClick={onClose} className={outlineButton}>
                            Cancel
                        </button>
                        <button type="submit" disabled={busy || !chosen} className={brandButton}>
                            {busy ? "Blocking…" : "Block dates"}
                        </button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    );
}
