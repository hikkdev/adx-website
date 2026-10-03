"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Phone, RefreshCw } from "lucide-react";
import { Panel } from "@/components/workspace/page-heading";
import { brandButton, CardTitle, Crumbs, ErrorNote, KeyRow, Loading, outlineButton } from "@/components/publisher/parts";
import { StageLadder } from "@/components/publisher/stage-ladder";
import { useLoad } from "@/components/publisher/use-load";
import { cn } from "@/lib/utils";
import { etaLine, isTracked, publisherBookings, sinceWhen, stagesDone, stagesFor, type AgentLocation, type BookingFull } from "@/services/publisher-bookings";
import { bookingRef, dateTime, installsThemselves } from "@/services/publisher-workspace";

const TrackingMap = dynamic(() => import("@/components/publisher/tracking-map").then((m) => m.TrackingMap), { ssr: false, loading: () => <div className="h-[280px] w-full animate-pulse bg-ground" /> });

/** How often the installer's position is asked again while the page is open and the work is live. */
const REFRESH_MS = 30_000;

async function readTrack(id: string): Promise<{ booking: BookingFull; location: AgentLocation | null }> {
    const booking = await publisherBookings.booking(id);
    // An order with no installer has nothing to report — a failure here never takes the page down.
    const location = await publisherBookings.agentLocation(id).catch(() => null);
    return { booking, location };
}

/**
 * Track installation — the app's screen on the web: a map of the space and
 * the installer's last shared position (`GET /orders/:id/agent-location`,
 * with the ETA when ADX lets the parties see it), the installer with a call
 * button, the five-stage ladder, the agreed arrangement and the installer's
 * own checklist where ops attached one. A stale fix is labelled with its
 * age rather than hidden. The position is asked again every 30 seconds
 * while the page is open and the work is still live.
 */
export default function TrackPage() {
    const { id } = useParams<{ id: string }>();
    const { data, error, loading, reload } = useLoad(`track:${id}`, () => readTrack(id));
    const live = !!data && ["SLOT_CONFIRMED", "IN_PROGRESS"].includes(data.booking.status);

    React.useEffect(() => {
        if (!live) return;
        const timer = setInterval(() => {
            if (document.visibilityState === "visible") reload();
        }, REFRESH_MS);
        return () => clearInterval(timer);
    }, [live, reload]);

    if (!data && loading) return <Loading label="Finding your installer…" />;
    if (!data) {
        return (
            <>
                <Crumbs items={[{ label: "Bookings", href: "/publisher/bookings" }, { label: "Track installation" }]} />
                <div className="mt-6">
                    <ErrorNote message={error ?? "Could not read this booking."} onRetry={reload} />
                </div>
            </>
        );
    }

    const { booking, location } = data;
    const listing = booking.listing ?? null;
    const agent = booking.agent?.user ?? null;
    const stages = stagesFor(booking);
    const spot = listing?.latitude != null && listing?.longitude != null ? { latitude: listing.latitude, longitude: listing.longitude, label: listing.title } : null;
    const installer = location?.latitude != null && location?.longitude != null ? { latitude: location.latitude, longitude: location.longitude, label: agent?.name ? `${agent.name} · last seen` : "Your installer" } : null;
    const eta = etaLine(location);
    const self = installsThemselves(booking);

    return (
        <>
            <Crumbs items={[{ label: "Bookings", href: "/publisher/bookings" }, { label: bookingRef(booking), href: `/publisher/bookings/${booking.id}` }, { label: "Track installation" }]} />
            <div className="mt-6 flex flex-wrap items-start justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-semibold tracking-tight text-ink">Track installation</h1>
                    <p className="mt-1 text-sm text-dim">
                        {stagesDone(stages)} of {stages.length} steps done · {bookingRef(booking)} · {booking.campaignName ?? "Campaign"}
                    </p>
                </div>
                <button type="button" onClick={reload} disabled={loading} className={cn(outlineButton, "gap-2")}>
                    <RefreshCw className={cn("size-4", loading && "animate-spin")} aria-hidden />
                    {loading ? "Checking…" : "Check again"}
                </button>
            </div>

            {error && (
                <div className="mt-4">
                    <ErrorNote message={error} onRetry={reload} />
                </div>
            )}

            <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_300px]">
                <div className="grid content-start gap-6">
                    <section className="overflow-hidden rounded-lg border border-line bg-white">
                        {spot || installer ? (
                            <TrackingMap spot={spot} installer={installer} />
                        ) : (
                            <div className="flex h-[200px] items-center justify-center bg-ground px-6 text-center text-sm text-dim">This space has no map position on its listing, and the installer has not shared one yet — there is nothing to centre a map on.</div>
                        )}
                        <div className="px-6 py-4">
                            <p className="text-base font-semibold text-ink">{listing?.title ?? "Your space"}</p>
                            <p className="text-sm text-dim">{[listing?.address, listing?.city].filter(Boolean).join(", ") || "Address not on file"}</p>
                            {spot && !installer && agent && <p className="mt-2 text-xs text-dim">The installer&apos;s pin appears once they share their position.</p>}
                        </div>
                    </section>

                    <Panel>
                        <CardTitle>Installation progress</CardTitle>
                        <StageLadder stages={stages} className="mt-4" />
                    </Panel>

                    {booking.milestones && booking.milestones.length > 0 && (
                        <Panel>
                            <CardTitle>The installer&apos;s steps</CardTitle>
                            <ul className="mt-3 divide-y divide-line">
                                {booking.milestones.map((milestone) => (
                                    <li key={milestone.id} className="flex items-center justify-between gap-4 py-2.5">
                                        <span className="text-sm text-ink">{milestone.template?.title ?? `Step ${milestone.order}`}</span>
                                        <span className={cn("text-xs", milestone.status === "COMPLETED" ? "text-success" : "text-dim")}>
                                            {milestone.status === "COMPLETED" ? `Done${milestone.completedAt ? ` ${dateTime(milestone.completedAt)}` : ""}` : milestone.status === "IN_PROGRESS" ? "In progress" : milestone.status === "SKIPPED" ? "Skipped by ADX" : "Not started"}
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        </Panel>
                    )}
                </div>

                <div className="grid content-start gap-6">
                    {agent ? (
                        <Panel>
                            <p className="text-xs font-medium uppercase tracking-wide text-dim">Your installer</p>
                            <p className="mt-1 text-lg font-semibold text-ink">{agent.name ?? "ADX installer"}</p>
                            {agent.mobile && <p className="text-sm text-dim">{agent.mobile}</p>}
                            <p className="mt-3 text-sm text-ink">{location?.updatedAt ? `${eta ? `${eta} ` : ""}Last shared their position ${sinceWhen(location.updatedAt)}.` : "They have not shared their position yet."}</p>
                            {agent.mobile && (
                                <a href={`tel:${agent.mobile}`} className={cn(brandButton, "mt-4 w-full gap-2")}>
                                    <Phone className="size-4" aria-hidden />
                                    Call {agent.name?.split(" ")[0] ?? "the installer"}
                                </a>
                            )}
                        </Panel>
                    ) : self ? (
                        <Panel>
                            <CardTitle>You are installing this one</CardTitle>
                            <p className="mt-2 text-sm text-dim">You chose to put this up yourself, so there is no installer on the way. The steps are on the booking.</p>
                        </Panel>
                    ) : (
                        <Panel>
                            <CardTitle>No installer yet</CardTitle>
                            <p className="mt-2 text-sm text-dim">ADX offers the job to an installer once your prints are ready. Their name and number appear here as soon as somebody takes it.</p>
                        </Panel>
                    )}

                    {(booking.slotTime || booking.meetingPlace) && (
                        <Panel>
                            <CardTitle>The arrangement</CardTitle>
                            <div className="mt-2">
                                {booking.slotTime && <KeyRow label={booking.status === "SLOT_PROPOSED" ? "Proposed time" : "Agreed time"} value={dateTime(booking.slotTime)} strong />}
                                {booking.meetingPlace && <KeyRow label="Collecting from" value={booking.meetingPlace} />}
                                {booking.checkIn && <KeyRow label="Checked in" value={`${dateTime(booking.checkIn.checkedInAt)} · ${Math.round(booking.checkIn.distanceM)} m from the spot`} />}
                            </div>
                        </Panel>
                    )}

                    {!isTracked(booking.status) && !self && <p className="text-xs text-dim">The installer&apos;s position is shared from the time they are booked in.</p>}

                    <Link href={`/publisher/bookings/${booking.id}`} className={outlineButton}>
                        Back to the booking
                    </Link>
                </div>
            </div>
        </>
    );
}
