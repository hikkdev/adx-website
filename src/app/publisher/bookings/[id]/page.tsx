"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ChevronLeft, Eye, Phone } from "lucide-react";
import { toast } from "sonner";
import { Panel } from "@/components/workspace/page-heading";
import { brandButton, CardTitle, ChoiceCard, Crumbs, ErrorNote, KeyRow, Loading, outlineButton, StatusText } from "@/components/publisher/parts";
import { useLoad } from "@/components/publisher/use-load";
import { ApiError, messageOf } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import {
    bookingEarning,
    bookingProgress,
    bookingRef,
    bookingStatus,
    dateRange,
    dateTime,
    daysBetween,
    deductions,
    earningHeadline,
    formatMoney,
    installsThemselves,
    isDigital,
    listingLine,
    longDate,
    openBlob,
    publisherWorkspace,
    respondBy,
    type BookingDetail,
    type Earnings,
    type Evidence,
    type InstallBy,
    type SpotInsights,
} from "@/services/publisher-workspace";

interface Loaded {
    booking: BookingDetail;
    earnings: Earnings | null;
    evidence: Evidence | null;
    insights: SpotInsights | null;
}

const BEFORE_WORK = new Set(["DRAFT", "PENDING_PUBLISHER", "PUBLISHER_REJECTED", "PENDING_PRINT", "CANCELLED"]);

async function readBooking(id: string): Promise<Loaded> {
    const booking = await publisherWorkspace.booking(id);
    const [earnings, evidence, insights] = await Promise.all([
        publisherWorkspace.earnings().catch(() => null),
        BEFORE_WORK.has(booking.status) ? Promise.resolve(null) : publisherWorkspace.evidence(id).catch(() => null),
        booking.status === "COMPLETED" ? publisherWorkspace.insights(id).catch(() => null) : Promise.resolve(null),
    ]);
    return { booking, earnings, evidence, insights };
}

/**
 * One booking (board 10, frames 05–12): the new request to accept or
 * decline, the declined record, the accepted booking with its fulfilment
 * plan and progress, and the completed booking with its payout. Which one
 * is drawn follows the order's status; the server owns the state machine.
 */
export default function BookingPage() {
    const { id } = useParams<{ id: string }>();
    const { data, error, loading, reload } = useLoad(`booking:${id}`, () => readBooking(id));

    if (!data && loading) return <Loading label="Loading the booking…" />;
    if (!data) {
        return (
            <>
                <Crumbs items={[{ label: "Bookings", href: "/publisher/bookings" }, { label: "Booking" }]} />
                <div className="mt-6">
                    <ErrorNote message={error ?? "Could not read this booking."} onRetry={reload} />
                </div>
            </>
        );
    }

    const { booking } = data;
    switch (booking.status) {
        case "PENDING_PUBLISHER":
            return <NewRequest data={data} reload={reload} />;
        case "PUBLISHER_REJECTED":
            return <Declined data={data} />;
        case "CANCELLED":
            return <Cancelled data={data} />;
        case "COMPLETED":
            return <Completed data={data} />;
        default:
            return <Accepted data={data} reload={reload} />;
    }
}

/* ------------------------------------------------------------------ */
/* Shared pieces                                                       */
/* ------------------------------------------------------------------ */

function useFacts(data: Loaded) {
    const { booking, earnings } = data;
    const listing = booking.listing ?? null;
    const digital = listing ? isDigital(listing) : false;
    const earning = bookingEarning(booking, earnings);
    const headline = earningHeadline(earning);
    const advertiser = booking.advertiser?.name ?? booking.campaign?.advertiser?.name ?? null;
    const days = daysBetween(booking.startDate, booking.endDate);
    return { booking, listing, digital, earning, headline, advertiser, days };
}

function SummaryCard({ data, children, status }: { data: Loaded; children?: React.ReactNode; status?: boolean }) {
    const { booking, headline, advertiser, days } = useFacts(data);
    const words = bookingStatus(booking);
    return (
        <Panel>
            <CardTitle>Booking summary</CardTitle>
            <div className="mt-3">
                <KeyRow label="Advertiser" value={advertiser ?? "—"} />
                <KeyRow label="Run dates" value={dateRange(booking.startDate, booking.endDate)} />
                <KeyRow label="Duration" value={days ? `${days} day${days === 1 ? "" : "s"}` : "—"} />
                <div className="my-1 border-t border-line" />
                <KeyRow label="Your space earning" value={formatMoney(headline)} strong />
                {status && <KeyRow label="Status" value={<StatusText tone={words.tone}>{words.label}</StatusText>} strong />}
            </div>
            {children}
        </Panel>
    );
}

/* ------------------------------------------------------------------ */
/* 05 · New booking request                                            */
/* ------------------------------------------------------------------ */

function NewRequest({ data, reload }: { data: Loaded; reload: () => void }) {
    const { booking, listing, digital, headline, advertiser, days } = useFacts(data);
    const [busy, setBusy] = React.useState(false);
    const [failure, setFailure] = React.useState<string | null>(null);
    const deadline = respondBy(booking.publisherTimerExpiry);

    const accept = async () => {
        setBusy(true);
        setFailure(null);
        try {
            await publisherWorkspace.accept(booking.id);
            toast.success("Booking accepted");
            reload();
        } catch (caught) {
            setFailure(messageOf(caught, "Could not accept the booking."));
        } finally {
            setBusy(false);
        }
    };

    return (
        <>
            <Crumbs items={[{ label: "Bookings", href: "/publisher/bookings" }, { label: "New request" }]} />
            <h1 className="mt-6 text-2xl font-semibold tracking-tight text-ink">New booking request</h1>
            <p className="mt-1 text-sm text-dim">
                {bookingRef(booking)} · {booking.campaignName ?? "Campaign"}
            </p>

            <Panel className="mt-6">
                <CardTitle>{deadline ? `Respond by ${deadline}` : "Respond soon"}</CardTitle>
                <p className="mt-2 text-sm text-dim">
                    {booking.startDate ? `The campaign is scheduled to start on ${longDate(booking.startDate, { month: "long" })}. ` : ""}
                    Review the space, dates and fulfilment before accepting.
                </p>
            </Panel>

            <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_268px]">
                <div className="grid content-start gap-6">
                    <Panel>
                        <CardTitle>{listing?.title ?? "Your space"}</CardTitle>
                        {listing && <p className="mt-1 text-sm text-dim">{listingLine(listing, { format: true })}</p>}
                        <div className="mt-3">
                            <KeyRow label="Campaign dates" value={dateRange(booking.startDate, booking.endDate)} strong />
                            <KeyRow label="Duration" value={days ? `${days} day${days === 1 ? "" : "s"}` : "—"} strong />
                        </div>
                        {booking.notes && (
                            <p className="mt-3 rounded-md bg-ground px-3 py-2 text-sm text-dim">
                                <span className="font-medium text-ink">From the advertiser:</span> {booking.notes}
                            </p>
                        )}
                    </Panel>
                    <Panel>
                        <CardTitle>{digital ? "Playback requested" : "Installation requested"}</CardTitle>
                        <p className="mt-2 text-sm text-dim">{digital ? "Playback on your screen is included in this booking. Confirm how the creative will be scheduled after accepting." : "ADX installation is included in this booking. Confirm the installation plan after accepting the request."}</p>
                    </Panel>
                    <div>
                        <Link href="/publisher/bookings" className={outlineButton}>
                            Back to bookings
                        </Link>
                    </div>
                </div>
                <Panel className="h-fit">
                    <CardTitle>Booking summary</CardTitle>
                    <div className="mt-3">
                        <KeyRow label="Advertiser" value={advertiser ?? "—"} strong />
                        <KeyRow label="Your space earning" value={formatMoney(headline)} strong />
                        <KeyRow label="Status" value="Needs response" strong />
                    </div>
                    <div className="mt-4 border-t border-line pt-4">
                        <button type="button" onClick={accept} disabled={busy} className={cn(brandButton, "w-full")}>
                            {busy ? "Accepting…" : "Accept booking"}
                        </button>
                        <Link href={`/publisher/bookings/${booking.id}/decline`} className={cn(outlineButton, "mt-3 w-full")}>
                            Decline request
                        </Link>
                        {failure && (
                            <p role="alert" className="mt-3 text-xs text-danger">
                                {failure}
                            </p>
                        )}
                    </div>
                </Panel>
            </div>
        </>
    );
}

/* ------------------------------------------------------------------ */
/* 07 · Declined / Cancelled                                           */
/* ------------------------------------------------------------------ */

function Declined({ data }: { data: Loaded }) {
    const { booking, listing } = useFacts(data);
    return (
        <>
            <h1 className="text-2xl font-semibold tracking-tight text-ink">Booking request declined</h1>
            <p className="mt-1 text-sm text-dim">
                {bookingRef(booking)} · {booking.campaignName ?? "Campaign"}
            </p>
            <Panel className="mt-6">
                <CardTitle>Your response is recorded</CardTitle>
                <p className="mt-2 text-sm text-dim">The advertiser can now choose another space or contact support.</p>
                <div className="mt-3">
                    <KeyRow label="Space" value={listing?.title ?? "—"} />
                    <KeyRow label="Dates" value={dateRange(booking.startDate, booking.endDate)} />
                    <KeyRow label="Status" value="Declined" />
                    <KeyRow label="Reason" value={booking.publisherRejectionReason ?? booking.cancellationReason ?? "No reason given"} />
                </div>
                <p className="mt-2 text-sm text-dim">Keep your availability up to date to avoid requests for dates you cannot fulfil.</p>
            </Panel>
            <div className="mt-6 flex flex-wrap gap-3">
                <Link href="/publisher/bookings" className={brandButton}>
                    Back to bookings
                </Link>
                <Link href="/publisher/availability" className={outlineButton}>
                    Manage availability
                </Link>
            </div>
        </>
    );
}

function Cancelled({ data }: { data: Loaded }) {
    const { booking, listing } = useFacts(data);
    return (
        <>
            <h1 className="text-2xl font-semibold tracking-tight text-ink">Booking cancelled</h1>
            <p className="mt-1 text-sm text-dim">
                {bookingRef(booking)} · {booking.campaignName ?? "Campaign"}
            </p>
            <Panel className="mt-6">
                <CardTitle>This booking was cancelled</CardTitle>
                <p className="mt-2 text-sm text-dim">{booking.cancellationReason ?? "ADX or the advertiser cancelled this booking. Nothing further is needed from you."}</p>
                <div className="mt-3">
                    <KeyRow label="Space" value={listing?.title ?? "—"} />
                    <KeyRow label="Dates" value={dateRange(booking.startDate, booking.endDate)} />
                    {booking.cancelledAt && <KeyRow label="Cancelled on" value={longDate(booking.cancelledAt)} />}
                </div>
            </Panel>
            <div className="mt-6">
                <Link href="/publisher/bookings" className={brandButton}>
                    Back to bookings
                </Link>
            </div>
        </>
    );
}

/* ------------------------------------------------------------------ */
/* 08 · 09 · Accepted — plan fulfilment, follow the installer          */
/* ------------------------------------------------------------------ */

const NOTICE: Record<string, (facts: { digital: boolean; agent: string | null; slot: string }) => { title: string; text: string }> = {
    PENDING_PRINT: () => ({ title: "Artwork review is pending", text: "This booking has been accepted. Plan fulfilment now and check that the artwork is approved before the campaign starts." }),
    SELF_INSTALL: ({ digital }) => ({ title: digital ? "Ready for playback" : "Ready for installation", text: digital ? "The creative is approved. Schedule it on your screen controller and submit a photo of it playing as your proof." : "The artwork is approved. Collect the prints, photograph the spot before and after, and submit your installation proof." }),
    PENDING_AGENT: () => ({ title: "ADX is assigning an installer", text: "An installer near your space will be offered the job. Their name and a proposed time appear here as soon as one accepts." }),
    AGENT_REJECTED: () => ({ title: "ADX is assigning another installer", text: "The first installer could not take the job. It has been offered to the next one nearby." }),
    SLOT_PROPOSED: ({ agent, slot }) => ({ title: "The installer proposed a time", text: `${agent ?? "Your installer"} suggested ${slot}. Confirm it, or ask for another time.` }),
    SLOT_CONFIRMED: ({ agent, slot }) => ({ title: "Installation scheduled", text: `${agent ?? "Your installer"} will be at your space on ${slot}.` }),
    IN_PROGRESS: ({ agent }) => ({ title: "Installation in progress", text: `${agent ?? "The installer"} has checked in at your space. Photos of the work appear below as they are filed.` }),
    PENDING_OTP: () => ({ title: "Your six-digit code is needed", text: "ADX sent a code to your phone. Read it out to the installer so they can close the job — that is your confirmation the work was done." }),
    PENDING_APPROVAL: () => ({ title: "Installation proof is in review", text: "ADX is checking the photos. Your earnings start accruing the day it is signed off." }),
};

function Accepted({ data, reload }: { data: Loaded; reload: () => void }) {
    const { booking, listing, digital } = useFacts(data);
    const { evidence } = data;
    const agentName = booking.agent?.user?.name ?? null;
    const agentPhone = booking.agent?.user?.mobile ?? null;
    const slot = dateTime(booking.slotTime);
    const notice = (NOTICE[booking.status] ?? NOTICE.PENDING_PRINT!)({ digital, agent: agentName, slot });
    const [busy, setBusy] = React.useState<string | null>(null);
    const [failure, setFailure] = React.useState<string | null>(null);
    const canChoose = booking.status === "PENDING_PRINT";
    const selfLane = installsThemselves(booking);
    const adxLane = !selfLane && !["PENDING_PRINT"].includes(booking.status);
    const progress = bookingProgress(booking, digital);
    const photos = evidence?.photos ?? [];

    const run = async (key: string, action: () => Promise<unknown>, done: string) => {
        setBusy(key);
        setFailure(null);
        try {
            await action();
            toast.success(done);
            reload();
        } catch (caught) {
            setFailure(caught instanceof ApiError && caught.code === "WRONG_STATUS" ? "This step is no longer open on the booking." : messageOf(caught, "That did not go through."));
        } finally {
            setBusy(null);
        }
    };

    const choose = (installBy: InstallBy) => {
        if (!canChoose || booking.installBy === installBy) return;
        void run("choose", () => publisherWorkspace.chooseFulfilment(booking.id, installBy), installBy === "PUBLISHER" ? (digital ? "You will schedule the playback" : "You will install it yourself") : digital ? "ADX will help with the setup" : "ADX installation requested");
    };

    const counter = () => {
        const note = window.prompt("What time would suit you better? This goes to the installer.") ?? "";
        if (note === "" && !window.confirm("Ask the installer for another time without a note?")) return;
        void run("counter", () => publisherWorkspace.counterSlot(booking.id, note.trim() || undefined), "Asked for another time");
    };

    const primary = selfLane && booking.status === "SELF_INSTALL" ? { href: `/publisher/bookings/${booking.id}/proof`, label: digital ? "Submit playback proof" : "Submit installation proof" } : photos.length > 0 || booking.status === "PENDING_APPROVAL" ? { href: `/publisher/bookings/${booking.id}/proof`, label: "View installation proof" } : listing ? { href: `/publisher/listings/${listing.id}`, label: "View space specifications" } : null;

    return (
        <>
            <Crumbs items={[{ label: "Bookings", href: "/publisher/bookings" }, { label: booking.campaignName ?? "Booking" }]} />
            <h1 className="mt-6 text-2xl font-semibold tracking-tight text-ink">{listing?.title ?? "Booking"}</h1>
            <p className="mt-1 text-sm text-dim">
                {bookingRef(booking)} · {booking.campaignName ?? "Campaign"}
                {listing?.city ? ` · ${listing.city}` : ""}
            </p>

            <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_268px]">
                <div className="grid content-start gap-6">
                    <Panel>
                        <CardTitle>{notice.title}</CardTitle>
                        <p className="mt-2 text-sm text-dim">{notice.text}</p>
                    </Panel>

                    <Panel>
                        <CardTitle>{digital ? "Schedule the creative" : "Plan installation"}</CardTitle>
                        <p className="mt-1 text-sm text-dim">{digital ? `Schedule playback after artwork approval for ${dateRange(booking.startDate, booking.endDate)}.` : "Confirm the installation method before your campaign starts."}</p>
                        <div className="mt-4 grid gap-3">
                            <ChoiceCard name="fulfilment" checked={booking.installBy === "PUBLISHER"} disabled={!canChoose || busy === "choose"} onSelect={() => choose("PUBLISHER")} title={digital ? "Publisher schedules playback" : "Install it yourself"} hint={digital ? "Schedule from your screen controller" : "You collect and install"} />
                            <ChoiceCard name="fulfilment" checked={booking.installBy === "ADX"} disabled={!canChoose || busy === "choose"} onSelect={() => choose("ADX")} title={digital ? "Request setup assistance" : "Request ADX installation"} hint={digital ? "ADX helps coordinate the creative handover" : "Installation included in this booking"} />
                        </div>
                        {!canChoose && booking.installBy && <p className="mt-3 text-xs text-dim">The fulfilment method is locked once the prints are ordered.</p>}
                        {canChoose && !booking.installBy && <p className="mt-3 text-xs text-dim">Choose one — the booking cannot move on without it.</p>}
                    </Panel>

                    {adxLane && (
                        <Panel>
                            <CardTitle>Installer</CardTitle>
                            {agentName ? (
                                <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                                    <div>
                                        <p className="text-sm font-medium text-ink">{agentName}</p>
                                        <p className="text-xs text-dim">{booking.agent?.city ? `ADX installer · ${booking.agent.city}` : "ADX installer"}</p>
                                    </div>
                                    {agentPhone && (
                                        <a href={`tel:${agentPhone}`} className={cn(outlineButton, "h-9 gap-2 px-4")}>
                                            <Phone className="size-4" aria-hidden />
                                            Call
                                        </a>
                                    )}
                                </div>
                            ) : (
                                <p className="mt-2 text-sm text-dim">No installer has accepted the job yet.</p>
                            )}
                            {booking.slotTime && (
                                <div className="mt-3">
                                    <KeyRow label={booking.status === "SLOT_PROPOSED" ? "Proposed time" : "Installation time"} value={slot} strong />
                                </div>
                            )}
                            {booking.status === "SLOT_PROPOSED" && (
                                <div className="mt-3 flex flex-wrap gap-3">
                                    <button type="button" disabled={busy !== null} onClick={() => void run("confirm", () => publisherWorkspace.confirmSlot(booking.id), "Time confirmed")} className={brandButton}>
                                        {busy === "confirm" ? "Confirming…" : "Confirm time"}
                                    </button>
                                    <button type="button" disabled={busy !== null} onClick={counter} className={outlineButton}>
                                        Suggest another time
                                    </button>
                                </div>
                            )}
                            {booking.meetingPlace && <p className="mt-3 text-xs text-dim">Meeting at: {booking.meetingPlace}</p>}
                        </Panel>
                    )}

                    {photos.length > 0 && (
                        <Panel>
                            <div className="flex items-center justify-between">
                                <CardTitle>Photos filed so far</CardTitle>
                                <Link href={`/publisher/bookings/${booking.id}/proof`} className="text-sm font-medium text-ink hover:underline">
                                    View all
                                </Link>
                            </div>
                            <div className="mt-3 grid grid-cols-3 gap-3">
                                {photos.slice(0, 3).map((photo, index) => (
                                     
                                    <img key={photo.id} src={photo.url} alt={photo.label ?? `Photo ${index + 1}`} className="aspect-[16/10] w-full rounded-md object-cover" />
                                ))}
                            </div>
                        </Panel>
                    )}

                    {failure && <ErrorNote message={failure} />}

                    <div className="flex flex-wrap gap-3">
                        {primary && (
                            <Link href={primary.href} className={brandButton}>
                                {primary.label}
                            </Link>
                        )}
                        <Link href="/publisher/bookings" className={outlineButton}>
                            Back to bookings
                        </Link>
                    </div>
                </div>

                <div className="grid content-start gap-6">
                    <SummaryCard data={data} />
                    <Panel>
                        <CardTitle>Progress</CardTitle>
                        <div className="mt-3">
                            {progress.map((row) => (
                                <KeyRow key={row.label} label={row.label} value={row.value} strong />
                            ))}
                        </div>
                    </Panel>
                </div>
            </div>
        </>
    );
}

/* ------------------------------------------------------------------ */
/* 12 · Completed booking                                              */
/* ------------------------------------------------------------------ */

function Completed({ data }: { data: Loaded }) {
    const { booking, listing, digital, earning, advertiser } = useFacts(data);
    const { insights } = data;
    const words = bookingStatus(booking);
    const live = words.label === "Live";
    const photo = listing?.photos?.[0]?.url ?? null;
    const [downloading, setDownloading] = React.useState(false);
    const fulfilment = installsThemselves(booking) ? (digital ? "Publisher scheduled playback" : "Publisher installation") : digital ? "ADX-assisted setup" : "ADX installation";
    const cleared = earning.source === "ACCRUED" && earning.clearedDays === earning.days;

    const download = async () => {
        setDownloading(true);
        try {
            openBlob(await publisherWorkspace.reportPdf(booking.id), `booking-report-${bookingRef(booking)}.pdf`);
        } catch (caught) {
            toast.error(messageOf(caught, "Could not fetch the report."));
        } finally {
            setDownloading(false);
        }
    };

    return (
        <>
            <Link href="/publisher/bookings" className="inline-flex items-center gap-1 text-sm text-dim hover:text-ink">
                <ChevronLeft className="size-4" aria-hidden />
                Bookings
            </Link>
            <h1 className="mt-4 text-2xl font-semibold tracking-tight text-ink">
                {live ? "Live booking" : "Completed booking"} · {bookingRef(booking)}
            </h1>

            <Panel className="mt-6">
                <p className="text-sm font-semibold text-ink">{live ? "Campaign running · earnings accruing daily" : cleared ? "Campaign completed · payout settled" : earning.source === "ACCRUED" ? "Campaign completed · earnings clearing" : "Campaign completed"}</p>

                <div className="mt-4 flex items-center gap-4 rounded-lg border border-line px-4 py-3">
                    {photo ? (
                         
                        <img src={photo} alt="" className="size-[52px] rounded-md object-cover" />
                    ) : (
                        <span className="size-[52px] rounded-md bg-ground" aria-hidden />
                    )}
                    <div className="min-w-0 flex-1">
                        <p className="truncate text-base font-semibold text-ink">{listing?.title ?? "Space"}</p>
                        <p className="truncate text-sm text-dim">
                            {booking.campaignName ?? "Campaign"}
                            {listing?.city ? ` · ${listing.city}` : ""}
                        </p>
                    </div>
                    {listing && (
                        <Link href={`/publisher/listings/${listing.id}`} aria-label="View the space" className="text-dim hover:text-ink">
                            <Eye className="size-5" aria-hidden />
                        </Link>
                    )}
                </div>

                <p className="mt-6 text-sm font-semibold text-ink">Payout</p>
                <div className="mt-2 rounded-lg border border-line px-4 py-2">
                    <KeyRow label={earning.source === "EXPECTED" ? "Space rental (expected)" : "Space rental"} value={formatMoney(earning.gross)} />
                    <KeyRow label="Deductions" value={earning.source === "ACCRUED" ? formatMoney(deductions(earning)) : "Settled as each day accrues"} />
                    <div className="border-t border-line" />
                    <KeyRow label={earning.source === "ACCRUED" ? (cleared ? "Cleared to your wallet" : `Earned · ${earning.clearedDays} of ${earning.days} days cleared`) : "Nothing accrued yet"} value={earning.source === "ACCRUED" ? formatMoney(earning.net) : "—"} strong />
                </div>

                <p className="mt-6 text-sm font-semibold text-ink">Booking details</p>
                <div className="mt-2 rounded-lg border border-line px-4 py-2">
                    <KeyRow label="Advertiser" value={advertiser ?? "—"} strong />
                    <KeyRow label="Run dates" value={dateRange(booking.startDate, booking.endDate)} strong />
                    <KeyRow label="Fulfilment" value={fulfilment} strong />
                    {booking.adminApprovedAt && <KeyRow label="Signed off" value={longDate(booking.adminApprovedAt)} strong />}
                </div>

                {insights && (
                    <>
                        <p className="mt-6 text-sm font-semibold text-ink">Insights</p>
                        <div className="mt-2 grid grid-cols-3 gap-3">
                            <Figure label="Scans" value={insights.scans.toLocaleString("en-IN")} />
                            <Figure label="Estimated reach" value={insights.estimatedReach === null ? "—" : insights.estimatedReach.toLocaleString("en-IN")} />
                            <Figure label="Interactions" value={insights.interactions.toLocaleString("en-IN")} />
                        </div>
                    </>
                )}
            </Panel>

            <div className="mt-6 flex flex-wrap justify-end gap-3">
                <button type="button" onClick={download} disabled={downloading} className={outlineButton}>
                    {downloading ? "Preparing report…" : "Download report (PDF)"}
                </button>
                <Link href="/publisher/bookings" className={outlineButton}>
                    Back to bookings
                </Link>
                <Link href="/publisher/earnings" className={brandButton}>
                    View payout
                </Link>
            </div>
        </>
    );
}

function Figure({ label, value }: { label: string; value: string }) {
    return (
        <div className="rounded-lg border border-line px-4 py-3">
            <p className="text-xs text-dim">{label}</p>
            <p className="mt-1 text-lg font-semibold text-ink">{value}</p>
        </div>
    );
}
