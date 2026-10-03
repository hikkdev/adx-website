"use client";

import * as React from "react";
import Link from "next/link";
import { CalendarX2, Camera, FileCheck2, TrendingDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { isoDay as todayIso, listingEditorService, PRICING_UNITS, type BlockedDate, type ListingVerification, type MyListing, type RateGateVerdict } from "@/services/listing-editor";
import { formatMoney, longDate } from "@/services/publisher-workspace";
import { ELEVATIONS, siteLabelOf, TRAFFIC_GRADES, VEHICLE_KINDS, VISIBILITY_RANGES } from "@/services/listing-site-questions";
import { belowFloorCopy, belowFloorNotice, lastVerificationLine, rightsLine, verificationLine } from "./listing-model";

/**
 * The listing page's cards — the app's Listing details
 * (`bookings/view-listing-screen.tsx`) on the website: the specs, the price,
 * the selling story and the spot itself on the left; on the right, what
 * needs the publisher — below ADX's floor, the right to the space, the
 * re-verification clock — and the blocked dates.
 */

function Card({ title, kicker, children, className, tone }: { title?: string; kicker?: React.ReactNode; children: React.ReactNode; className?: string; tone?: "warning" | "danger" }) {
    return (
        <section className={cn("rounded-xl border bg-white p-5", tone === "danger" ? "border-danger/30" : tone === "warning" ? "border-warning/40" : "border-line", className)}>
            {kicker && <p className={cn("flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.08em]", tone === "danger" ? "text-danger" : tone === "warning" ? "text-warning" : "text-dim")}>{kicker}</p>}
            {title && <h2 className={cn("text-base font-semibold text-ink", kicker && "mt-1.5")}>{title}</h2>}
            <div className={title || kicker ? "mt-3" : undefined}>{children}</div>
        </section>
    );
}

function Spec({ label, value }: { label: string; value: React.ReactNode }) {
    return (
        <div className="flex items-start justify-between gap-6 border-t border-line py-2.5 first:border-t-0 first:pt-0">
            <span className="shrink-0 text-sm text-dim">{label}</span>
            <span className="text-right text-sm text-ink">{value ?? "—"}</span>
        </div>
    );
}

const Hint = ({ children }: { children: React.ReactNode }) => <p className="mt-3 text-xs leading-5 text-dim">{children}</p>;

const trim = (value: string | null | undefined) => (value ? (value.includes(".") ? value.replace(/\.?0+$/, "") : value) : null);

/** Listing specs · Pricing · The selling story · The spot itself. */
export function ListingSpecs({ listing, formatName, instant }: { listing: MyListing; formatName: string | null; instant: boolean }) {
    const rights = rightsLine(listing);
    const unit = PRICING_UNITS.find((u) => u.id === listing.pricingUnit);
    const dimensions = listing.widthFt && listing.heightFt ? `${trim(listing.widthFt)} × ${trim(listing.heightFt)} ft` : (listing.size ?? null);
    const slots = listing.slotsTotal ?? 1;
    return (
        <div className="grid gap-5">
            <Card title="Listing specs">
                <Spec label="Format" value={[listing.category.charAt(0) + listing.category.slice(1).toLowerCase(), formatName ?? listing.subType].filter(Boolean).join(" · ")} />
                <Spec label="Dimensions" value={dimensions} />
                {listing.areaSqFt && <Spec label="Area" value={`${trim(listing.areaSqFt)} sq ft`} />}
                <Spec label="Min. booking" value={listing.minBookingDays ? `${listing.minBookingDays} days` : "No minimum set"} />
                <Spec label="Availability" value={listing.availableNow ? (listing.occupied ? "Booked now" : "Available now") : listing.availableFrom ? `From ${longDate(listing.availableFrom)}` : "Not available"} />
                {(listing.availableHoursFrom || listing.availableHoursTo) && <Spec label="Hours" value={`${listing.availableHoursFrom ?? "—"} to ${listing.availableHoursTo ?? "—"}`} />}
                {rights && <Spec label="Held on" value={rights.value} />}
                {slots > 1 && <Spec label="Advertisers at once" value={`${slots} · the rate is per slot`} />}
                {instant && <Spec label="Bookings" value={listing.instantBooking ? "Accepted automatically" : "Reviewed by you"} />}
                {slots <= 1 && <Hint>ADX books a space for a run of days rather than in slots, so there is no per-day slot count here. A confirmed booking holds the whole space for its dates.</Hint>}
            </Card>

            <Card title="Pricing">
                <Spec label="Your rate per day" value={listing.ratePerDay ? formatMoney(listing.ratePerDay, { paise: "always" }) : "Not set"} />
                {listing.basePrice && unit && <Spec label="What you entered" value={`${formatMoney(listing.basePrice, { paise: "always" })} ${unit.label.toLowerCase()}`} />}
                {listing.ratePerDaySetAt && <Spec label="Rate set" value={longDate(listing.ratePerDaySetAt)} />}
                <Hint>This is what you are paid for a day. GST is added on top of it for the advertiser by ADX, not taken out of it — and ADX's commission comes off each day as the campaign runs, which you can see on the booking that day belongs to.</Hint>
            </Card>

            {(listing.uniqueSellingPoint || listing.targetAudience || listing.footfallNote || listing.estimatedDailyFootfall || listing.peakPeriodNote) && (
                <Card title="The selling story">
                    {listing.uniqueSellingPoint && <Spec label="Why it works" value={listing.uniqueSellingPoint} />}
                    {listing.targetAudience && <Spec label="Who sees it" value={listing.targetAudience} />}
                    {listing.footfallNote && <Spec label="Footfall" value={listing.footfallNote} />}
                    {listing.estimatedDailyFootfall ? <Spec label="Daily footfall" value={`~${listing.estimatedDailyFootfall.toLocaleString("en-IN")} people`} /> : null}
                    {listing.peakPeriodNote && <Spec label="Peak" value={listing.peakPeriodNote} />}
                </Card>
            )}

            {(listing.illumination || listing.facing || listing.elevation || listing.visibility || listing.trafficGrade || typeof listing.estimatedDailyFootfall === "number" || listing.widthPx || listing.vehicleType) && (
                <Card title="The space itself">
                    {listing.illumination && <Spec label="Illuminated" value={listing.illumination} />}
                    {listing.facing && <Spec label="Facing" value={listing.facing} />}
                    {/* The listing-data-gaps lot: the site questions' codes in words; older words as they were stored. */}
                    {typeof listing.estimatedDailyFootfall === "number" && <Spec label="Daily footfall" value={`About ${listing.estimatedDailyFootfall.toLocaleString("en-IN")} people`} />}
                    {listing.trafficGrade && <Spec label="Traffic" value={siteLabelOf(TRAFFIC_GRADES, listing.trafficGrade) ?? listing.trafficGrade} />}
                    {listing.visibility && <Spec label="Seen from" value={siteLabelOf(VISIBILITY_RANGES, listing.visibility) ?? listing.visibility} />}
                    {listing.elevation && <Spec label="Placed at" value={siteLabelOf(ELEVATIONS, listing.elevation) ?? listing.elevation} />}
                    {listing.widthPx && listing.heightPx && <Spec label="Screen" value={`${listing.widthPx} × ${listing.heightPx} px`} />}
                    {listing.vehicleType && <Spec label="Vehicle" value={siteLabelOf(VEHICLE_KINDS, listing.vehicleType) ?? listing.vehicleType} />}
                </Card>
            )}
        </div>
    );
}

/**
 * "Below the floor" — Lot E, only while the gate (`GET /rate-cards/gate/:id`)
 * says the rate is under the floor of a card it names. A failed read is
 * silence: a warning the page could not verify is worse than none. Raise
 * the rate opens the price with the floor already in it, per day.
 */
export function BelowFloorCard({ listing }: { listing: Pick<MyListing, "id" | "occupied"> }) {
    const [verdict, setVerdict] = React.useState<{ id: string; verdict: RateGateVerdict | null } | null>(null);
    React.useEffect(() => {
        let live = true;
        listingEditorService
            .rateGate(listing.id)
            .then((next) => live && setVerdict({ id: listing.id, verdict: next }))
            .catch(() => live && setVerdict({ id: listing.id, verdict: null }));
        return () => {
            live = false;
        };
    }, [listing.id]);
    const notice = verdict?.id === listing.id ? belowFloorNotice(verdict.verdict, { occupied: listing.occupied }) : null;
    if (!notice) return null;
    return (
        <Card tone="warning" kicker={<><TrendingDown className="size-3.5" aria-hidden />Below the floor</>}>
            <p className="text-sm text-ink" data-testid="below-floor-copy">
                {belowFloorCopy(notice)}
            </p>
            <Link href={`/publisher/listings/${encodeURIComponent(listing.id)}/edit/price?rate=${encodeURIComponent(notice.floorRatePerDay)}`} className="mt-4 inline-flex h-10 items-center rounded-md bg-brand px-5 text-sm font-semibold text-white hover:bg-[#a51b1b]">
                Raise the rate
            </Link>
        </Card>
    );
}

/** QR-24: the lease, licence or permit — its state, and the way to renew it (the documents section files the paper and the new end date). */
export function RightsCard({ listing }: { listing: Pick<MyListing, "id" | "rightsBasis" | "rightsValidUntil" | "rightsLapsedAt"> }) {
    const rights = rightsLine(listing);
    const onTerm = !!listing.rightsBasis && listing.rightsBasis !== "OWNED";
    return (
        <Card tone={rights?.tone === "danger" ? "danger" : rights?.tone === "warning" ? "warning" : undefined} kicker={<><FileCheck2 className="size-3.5" aria-hidden />Your right to this space</>}>
            {rights && <p className="text-sm font-semibold text-ink">{rights.value}</p>}
            <p className={cn("text-sm", rights ? "mt-1 text-dim" : "text-dim")} data-testid={rights?.tone === "danger" ? "listing-rights-lapsed" : rights?.tone === "warning" ? "listing-rights-ending" : undefined}>
                {rights?.note ?? "Say whether you own this space or hold it on a lease, a licence or a permit, and until when. ADX reminds you before a term runs out."}
            </p>
            <Link href={`/publisher/listings/${encodeURIComponent(listing.id)}/edit/documents`} className={cn("mt-4 inline-flex h-10 items-center rounded-md px-5 text-sm font-semibold", rights?.tone === "danger" ? "bg-brand text-white hover:bg-[#a51b1b]" : "border border-line bg-white text-ink hover:border-ink")}>
                {onTerm ? "Renew or update" : "Say how you hold it"}
            </Link>
        </Card>
    );
}

/**
 * QR-26: the re-verification clock — the last check, when the next falls
 * due, and where to do it. A re-verification is a photograph taken at the
 * space with the phone's location stamped on it, matched against the pin;
 * a browser cannot prove it stood there, so the page says to do it in the
 * ADX app and why.
 */
export function VerificationCard({ listing }: { listing: Pick<MyListing, "id" | "status" | "removability" | "verifiedAt" | "verificationExpiresAt"> }) {
    const line = verificationLine(listing);
    const shown = line !== null;
    const [last, setLast] = React.useState<{ id: string; row: ListingVerification | null } | null>(null);
    React.useEffect(() => {
        if (!shown) return;
        let live = true;
        listingEditorService
            .verifications(listing.id)
            .then((rows) => {
                const newest = [...rows].sort((a, b) => b.capturedAt.localeCompare(a.capturedAt))[0] ?? null;
                if (live) setLast({ id: listing.id, row: newest });
            })
            .catch(() => live && setLast({ id: listing.id, row: null }));
        return () => {
            live = false;
        };
    }, [listing.id, shown]);
    if (!line) return null;
    const sent = last?.id === listing.id ? lastVerificationLine(last.row) : null;
    return (
        <Card tone={line.tone === "danger" ? "danger" : line.tone === "warning" ? "warning" : undefined} kicker={<><Camera className="size-3.5" aria-hidden />Is the space still standing?</>}>
            <p className="text-sm text-ink" data-testid={line.tone === "danger" ? "listing-verification-lapsed" : line.tone === "warning" ? "listing-verification-due" : "listing-verification-fresh"}>
                {line.note}
            </p>
            {sent && <p className="mt-2 text-xs text-dim">{sent}</p>}
            <div className="mt-4 rounded-lg bg-ground px-3.5 py-3">
                <p className="text-sm font-semibold text-ink">Verify it again in the ADX app</p>
                <p className="mt-1 text-xs leading-5 text-dim">Stand at the space, open it under My listings and choose “Verify it again now”. The app takes one photograph with your phone&apos;s location stamped on it and checks it against the pin — a browser cannot prove the photograph was taken there today.</p>
            </div>
        </Card>
    );
}

/** The blocked dates ahead on this space, and the calendar where they are set. */
export function AvailabilityCard({ listingId }: { listingId: string }) {
    const [blocks, setBlocks] = React.useState<{ id: string; rows: BlockedDate[] | null } | null>(null);
    React.useEffect(() => {
        let live = true;
        listingEditorService
            .blockedDates(listingId)
            .then((answer) => live && setBlocks({ id: listingId, rows: answer.blocks }))
            .catch(() => live && setBlocks({ id: listingId, rows: null }));
        return () => {
            live = false;
        };
    }, [listingId]);
    const today = todayIso(new Date().toISOString());
    const ahead = blocks?.id === listingId && blocks.rows ? blocks.rows.filter((b) => b.to.slice(0, 10) >= today).sort((a, b) => a.from.localeCompare(b.from)) : null;
    return (
        <Card kicker={<><CalendarX2 className="size-3.5" aria-hidden />Blocked dates</>}>
            <p className="text-sm text-dim">
                {ahead === null
                    ? "Block the days this space cannot be booked — maintenance, a festival, your own use."
                    : ahead.length === 0
                      ? "Nothing blocked ahead. Block the days this space cannot be booked — maintenance, a festival, your own use."
                      : `${ahead.length} blocked range${ahead.length === 1 ? "" : "s"} ahead — the next from ${longDate(ahead[0]!.from)} to ${longDate(ahead[0]!.to)}.`}
            </p>
            <Link href="/publisher/availability" className="mt-4 inline-flex h-10 items-center rounded-md border border-line bg-white px-5 text-sm font-semibold text-ink hover:border-ink">
                Open the calendar
            </Link>
        </Card>
    );
}
