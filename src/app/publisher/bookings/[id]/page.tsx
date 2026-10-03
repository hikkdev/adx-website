"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ChevronLeft, Eye, MapPin, Phone } from "lucide-react";
import { toast } from "sonner";
import { Panel } from "@/components/workspace/page-heading";
import { brandButton, CardTitle, ChoiceCard, Crumbs, ErrorNote, KeyRow, Loading, outlineButton, StatusText } from "@/components/publisher/parts";
import { CounterDialog } from "@/components/publisher/counter-dialog";
import { CreativePreview } from "@/components/publisher/creative-preview";
import { PrivateImage } from "@/components/files/private-file";
import { RateInstaller } from "@/components/publisher/rate-installer";
import { StageLadder } from "@/components/publisher/stage-ladder";
import { useLoad } from "@/components/publisher/use-load";
import { ApiError, messageOf } from "@/lib/api-client";
import { FLAG_SPOT_INSIGHTS, useFlag } from "@/lib/flags";
import { cn } from "@/lib/utils";
import { etaLine, isTracked, publisherBookings, runState, sinceWhen, stagesFor, timeLeft, type AgentLocation, type BookingFull } from "@/services/publisher-bookings";
import {
    bookingEarning,
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
    type Earnings,
    type Evidence,
    type InstallBy,
    type SpotInsights,
} from "@/services/publisher-workspace";

interface Loaded {
    booking: BookingFull;
    earnings: Earnings | null;
    evidence: Evidence | null;
    insights: SpotInsights | null;
}

const BEFORE_WORK = new Set(["DRAFT", "PENDING_PUBLISHER", "PUBLISHER_REJECTED", "PENDING_PRINT", "CANCELLED"]);

/**
 * Spot insights are dark-launched (`publisher.spot-insights`, off until there
 * is data): read only while the switch is on, and any failure — a 503
 * FEATURE_OFF from a switch flipped since included — reads as none.
 */
async function readBooking(id: string, insightsOn: boolean): Promise<Loaded> {
    const booking = await publisherBookings.booking(id);
    const [earnings, evidence, insights] = await Promise.all([
        publisherWorkspace.earnings().catch(() => null),
        BEFORE_WORK.has(booking.status) ? Promise.resolve(null) : publisherWorkspace.evidence(id).catch(() => null),
        insightsOn && booking.status === "COMPLETED" ? publisherWorkspace.insights(id).catch(() => null) : Promise.resolve(null),
    ]);
    return { booking, earnings, evidence, insights };
}

/**
 * One booking (board 10, frames 05–12): the new request to accept or
 * decline, the declined record, the accepted booking with its fulfilment
 * plan and progress, and the completed booking with its payout. Which one
 * is drawn follows the order's status; the server owns the state machine.
 * The app's pieces sit on top: the five-stage ladder, the installer on
 * their way (Track installation), the countdowns the platform is running,
 * the creative and its brief, the "accepted for you" note, and rating the
 * installer once the work is signed off.
 */
export default function BookingPage() {
    const { id } = useParams<{ id: string }>();
    const insightsOn = useFlag(FLAG_SPOT_INSIGHTS);
    /* The switch is in the key: the read runs again, with or without insights, when it flips. */
    const { data, error, loading, reload } = useLoad(`booking:${id}:${insightsOn ? "insights" : "plain"}`, () => readBooking(id, insightsOn));

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

/** Who puts it up, in the words the app's Booking details table uses. */
function fulfilmentWords(booking: Pick<BookingFull, "installBy" | "status">, digital: boolean): string {
    if (installsThemselves(booking)) return digital ? "You schedule it" : "You install it";
    if (booking.installBy === "ADX") return digital ? "ADX-assisted setup" : "ADX installation";
    return "Not chosen yet";
}

/** A clock that moves once a minute, so a countdown on the page stays true without a reload. */
function useMinuteClock(): number {
    const [now, setNow] = React.useState(() => Date.now());
    React.useEffect(() => {
        const timer = setInterval(() => setNow(Date.now()), 30_000);
        return () => clearInterval(timer);
    }, []);
    return now;
}

function SummaryCard({ data, children, status }: { data: Loaded; children?: React.ReactNode; status?: boolean }) {
    const { booking, headline, advertiser, days, digital } = useFacts(data);
    const words = bookingStatus(booking);
    return (
        <Panel>
            <CardTitle>Booking summary</CardTitle>
            <div className="mt-3">
                <KeyRow label="Booking ID" value={bookingRef(booking)} />
                <KeyRow label="Advertiser" value={advertiser ?? "—"} />
                <KeyRow label="Run dates" value={dateRange(booking.startDate, booking.endDate)} />
                <KeyRow label="Duration" value={days ? `${days} day${days === 1 ? "" : "s"}` : "—"} />
                <KeyRow label="Fulfilment" value={fulfilmentWords(booking, digital)} />
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
    const now = useMinuteClock();
    const deadline = respondBy(booking.publisherTimerExpiry);
    const left = timeLeft(booking.publisherTimerExpiry, now);

    const accept = async () => {
        setBusy(true);
        setFailure(null);
        try {
            await publisherWorkspace.accept(booking.id);
            toast.success("Booking accepted");
            reload();
        } catch (caught) {
            setFailure(caught instanceof ApiError && caught.code === "WRONG_STATUS" ? "This request is no longer open — it may have timed out or been withdrawn. Refresh to see where it stands." : messageOf(caught, "Could not accept the booking."));
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
                <CardTitle>
                    {deadline ? `Respond by ${deadline}` : "Respond soon"}
                    {left && <span className={cn("ml-2 text-sm font-medium", left === "The window has passed" ? "text-danger" : "text-warning")}>· {left}</span>}
                </CardTitle>
                <p className="mt-2 text-sm text-dim">
                    {booking.startDate ? `The campaign is scheduled to start on ${longDate(booking.startDate, { month: "long" })}. ` : ""}
                    Accepting holds your space for these dates; ADX looks elsewhere if the window passes. Review the space, dates and fulfilment before accepting.
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
                    </Panel>
                    <CreativePreview designUrl={booking.designUrl} brief={booking.notes} />
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
                        <KeyRow label="Booking ID" value={bookingRef(booking)} strong />
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
            <Crumbs items={[{ label: "Bookings", href: "/publisher/bookings" }, { label: bookingRef(booking) }]} />
            <h1 className="mt-6 text-2xl font-semibold tracking-tight text-ink">Booking request declined</h1>
            <p className="mt-1 text-sm text-dim">
                {bookingRef(booking)} · {booking.campaignName ?? "Campaign"}
            </p>
            <Panel className="mt-6">
                <CardTitle>Your response is recorded</CardTitle>
                <p className="mt-2 text-sm text-dim">ADX has told the advertiser and is showing them other spaces. Your space is free again for these dates.</p>
                <div className="mt-3">
                    <KeyRow label="Booking ID" value={bookingRef(booking)} />
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
            <Crumbs items={[{ label: "Bookings", href: "/publisher/bookings" }, { label: bookingRef(booking) }]} />
            <h1 className="mt-6 text-2xl font-semibold tracking-tight text-ink">Booking cancelled</h1>
            <p className="mt-1 text-sm text-dim">
                {bookingRef(booking)} · {booking.campaignName ?? "Campaign"}
            </p>
            <Panel className="mt-6">
                <CardTitle>This booking was cancelled</CardTitle>
                <p className="mt-2 text-sm text-dim">ADX cancelled this booking. {booking.cancellationReason?.trim() || "Support can tell you why."} Nothing further is needed from you.</p>
                <div className="mt-3">
                    <KeyRow label="Booking ID" value={bookingRef(booking)} />
                    <KeyRow label="Space" value={listing?.title ?? "—"} />
                    <KeyRow label="Dates" value={dateRange(booking.startDate, booking.endDate)} />
                    {booking.cancelledAt && <KeyRow label="Cancelled on" value={longDate(booking.cancelledAt)} />}
                </div>
            </Panel>
            <div className="mt-6 flex flex-wrap gap-3">
                <Link href="/publisher/bookings" className={brandButton}>
                    Back to bookings
                </Link>
                <Link href={`/publisher/help/new?type=booking&ref=${booking.id}`} className={outlineButton}>
                    Ask support why
                </Link>
            </div>
        </>
    );
}

/* ------------------------------------------------------------------ */
/* 08 · 09 · Accepted — plan fulfilment, follow the installer          */
/* ------------------------------------------------------------------ */

type NoticeFacts = { digital: boolean; agent: string | null; slot: string; autoAccepted: boolean; installBy: InstallBy | null; agentWindow: string | null };

const NOTICE: Record<string, (facts: NoticeFacts) => { title: string; text: string }> = {
    PENDING_PRINT: ({ digital, autoAccepted, installBy }) =>
        installBy
            ? {
                  title: digital ? "ADX is preparing the creative" : "ADX is printing",
                  text:
                      installBy === "PUBLISHER"
                          ? digital
                              ? "You are scheduling this one. ADX tells you when the creative is ready to load."
                              : "You are installing this one. ADX tells you when the prints are ready to collect."
                          : "An ADX installer will put it up. ADX offers the job to one once the prints are ready.",
              }
            : autoAccepted
              ? {
                    title: "Accepted for you",
                    text: `This space accepts bookings automatically, so ADX did not wait for you. Before it prints anything, say whether you are ${digital ? "scheduling the playback yourself or want ADX's help" : "installing this one yourself or want an ADX installer to do it"}.`,
                }
              : { title: "Who will put this up?", text: `You have accepted the booking. Before ADX prints anything, say whether you are ${digital ? "scheduling the playback yourself or want ADX's help" : "installing this one yourself or want an ADX installer to do it"}.` },
    SELF_INSTALL: ({ digital }) => ({ title: digital ? "Ready for playback" : "Ready for installation", text: digital ? "The creative is approved. Schedule it on your screen controller and submit a photo of it playing as your proof." : "The prints are ready. Photograph them when you collect them, the spot before you start, and the advertisement once it is up — those photos are what ADX pays against." }),
    PENDING_AGENT: ({ agentWindow }) => ({ title: "ADX is finding you an installer", text: `Your prints are ready and ADX is offering the job to installers near you. The first to take it suggests a time — you can agree it or ask for another.${agentWindow ? ` ${agentWindow}` : ""}` }),
    AGENT_REJECTED: ({ agentWindow }) => ({ title: "ADX is finding another installer", text: `The last installer could not take the job. ADX has offered it to the next one nearby.${agentWindow ? ` ${agentWindow}` : ""}` }),
    SLOT_PROPOSED: ({ agent, slot }) => ({ title: "Does this time work?", text: `${agent ?? "Your installer"} suggested ${slot}. Confirm it, or ask for another time.` }),
    SLOT_CONFIRMED: ({ agent, slot }) => ({ title: "Booked in", text: `${agent ?? "Your installer"} will be at your space on ${slot}.` }),
    IN_PROGRESS: ({ agent }) => ({ title: "Being installed", text: `${agent ?? "The installer"} has checked in at your space. Photos of the work appear below as they are filed.` }),
    PENDING_OTP: () => ({ title: "The installer needs your code", text: "ADX has sent you a six-digit code. Read it out to the installer once you are happy the advertisement is up and looks right — it is your confirmation, so look at what they filed first." }),
    PENDING_APPROVAL: () => ({ title: "Installation done — with ADX for sign-off", text: "ADX is checking the photos. Your earnings start accruing the day it is signed off; nothing is needed from you." }),
};

function Accepted({ data, reload }: { data: Loaded; reload: () => void }) {
    const { booking, listing, digital } = useFacts(data);
    const { evidence } = data;
    const now = useMinuteClock();
    const agentName = booking.agent?.user?.name ?? null;
    const agentPhone = booking.agent?.user?.mobile ?? null;
    const slot = dateTime(booking.slotTime);
    const agentLeft = timeLeft(booking.agentTimerExpiry, now);
    const agentWindow = booking.agentTimerExpiry && agentLeft ? `The installer holding the offer has until ${dateTime(booking.agentTimerExpiry)} to answer · ${agentLeft}.` : null;
    const notice = (NOTICE[booking.status] ?? NOTICE.PENDING_PRINT!)({ digital, agent: agentName, slot, autoAccepted: !!booking.autoAcceptedAt, installBy: booking.installBy, agentWindow });
    const [busy, setBusy] = React.useState<string | null>(null);
    const [failure, setFailure] = React.useState<string | null>(null);
    const [countering, setCountering] = React.useState(false);
    const [counterFailure, setCounterFailure] = React.useState<string | null>(null);
    const canChoose = booking.status === "PENDING_PRINT" && !booking.printReadyAt;
    const selfLane = installsThemselves(booking);
    const adxLane = !selfLane && booking.status !== "PENDING_PRINT";
    const stages = stagesFor(booking);
    const photos = evidence?.photos ?? [];
    const onTheWay = booking.status === "SLOT_CONFIRMED" || booking.status === "IN_PROGRESS";

    const run = async (key: string, action: () => Promise<unknown>, done: string): Promise<boolean> => {
        setBusy(key);
        setFailure(null);
        try {
            await action();
            toast.success(done);
            reload();
            return true;
        } catch (caught) {
            const message = caught instanceof ApiError && caught.code === "WRONG_STATUS" ? "This step is no longer open on the booking. Refresh to see where it stands." : caught instanceof ApiError && caught.code === "FULFILMENT_LOCKED" ? "ADX has already printed for this booking, so the choice is settled. Ask support if it needs changing." : messageOf(caught, "That did not go through.");
            if (key === "counter") setCounterFailure(message);
            else setFailure(message);
            return false;
        } finally {
            setBusy(null);
        }
    };

    const choose = (installBy: InstallBy) => {
        if (!canChoose || booking.installBy === installBy) return;
        void run("choose", () => publisherWorkspace.chooseFulfilment(booking.id, installBy), installBy === "PUBLISHER" ? (digital ? "You will schedule the playback" : "You will install it yourself") : digital ? "ADX will help with the setup" : "ADX installation requested");
    };

    const counter = async (note: string) => {
        setCounterFailure(null);
        const ok = await run("counter", () => publisherWorkspace.counterSlot(booking.id, note || undefined), "Asked the installer for another time");
        if (ok) setCountering(false);
    };

    const primary =
        selfLane && booking.status === "SELF_INSTALL"
            ? { href: `/publisher/bookings/${booking.id}/proof`, label: digital ? "Submit playback proof" : "Submit installation proof" }
            : photos.length > 0 || booking.status === "PENDING_APPROVAL" || booking.status === "PENDING_OTP"
              ? { href: `/publisher/bookings/${booking.id}/proof`, label: "See the proof of work" }
              : listing
                ? { href: `/publisher/listings/${listing.id}`, label: "View space specifications" }
                : null;

    return (
        <>
            <Crumbs items={[{ label: "Bookings", href: "/publisher/bookings" }, { label: bookingRef(booking) }]} />
            <h1 className="mt-6 text-2xl font-semibold tracking-tight text-ink">{listing?.title ?? "Booking"}</h1>
            <p className="mt-1 text-sm text-dim">
                {bookingRef(booking)} · {booking.campaignName ?? "Campaign"}
                {listing?.city ? ` · ${listing.city}` : ""}
            </p>

            <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_300px]">
                <div className="grid content-start gap-6">
                    <Panel className={cn(booking.autoAcceptedAt && !booking.installBy && booking.status === "PENDING_PRINT" && "border-brand-bright bg-[#fff7f7]")}>
                        <CardTitle>{notice.title}</CardTitle>
                        <p className="mt-2 text-sm text-dim">{notice.text}</p>
                        {booking.status === "SLOT_PROPOSED" && (
                            <div className="mt-4 flex flex-wrap gap-3">
                                <button type="button" disabled={busy !== null} onClick={() => void run("confirm", () => publisherWorkspace.confirmSlot(booking.id), "Time confirmed")} className={brandButton}>
                                    {busy === "confirm" ? "Confirming…" : "That works"}
                                </button>
                                <button
                                    type="button"
                                    disabled={busy !== null}
                                    onClick={() => {
                                        setCounterFailure(null);
                                        setCountering(true);
                                    }}
                                    className={outlineButton}
                                >
                                    Suggest another time
                                </button>
                            </div>
                        )}
                        {booking.status === "PENDING_OTP" && (
                            <Link href={`/publisher/bookings/${booking.id}/proof`} className={cn(outlineButton, "mt-4")}>
                                See the proof of work
                            </Link>
                        )}
                    </Panel>

                    {booking.status === "PENDING_PRINT" && (
                        <Panel>
                            <CardTitle>{digital ? "Schedule the creative" : "Plan installation"}</CardTitle>
                            <p className="mt-1 text-sm text-dim">{digital ? `Schedule playback after artwork approval for ${dateRange(booking.startDate, booking.endDate)}.` : "Say who puts it up. Per booking — you can hang this one yourself and ask ADX for the next."}</p>
                            <div className="mt-4 grid gap-3">
                                <ChoiceCard name="fulfilment" checked={booking.installBy === "PUBLISHER"} disabled={!canChoose || busy === "choose"} onSelect={() => choose("PUBLISHER")} title={digital ? "Publisher schedules playback" : "Install it yourself"} hint={digital ? "Schedule from your screen controller" : "You collect the prints and put them up, with photographs at each step"} />
                                <ChoiceCard name="fulfilment" checked={booking.installBy === "ADX"} disabled={!canChoose || busy === "choose"} onSelect={() => choose("ADX")} title={digital ? "Request setup assistance" : "Request ADX installation"} hint={digital ? "ADX helps coordinate the creative handover" : "An ADX installer collects the prints, meets you at the spot and installs it"} />
                            </div>
                            {!canChoose && booking.installBy && <p className="mt-3 text-xs text-dim">The fulfilment method is locked once the prints are ordered. Ask support if it needs changing.</p>}
                            {canChoose && !booking.installBy && <p className="mt-3 text-xs text-dim">Choose one — the booking cannot move on without it. Neither costs you anything: ADX&apos;s installation fee is on the advertiser&apos;s bill, not yours.</p>}
                        </Panel>
                    )}

                    {adxLane && (
                        <Panel>
                            <div className="flex flex-wrap items-center justify-between gap-2">
                                <CardTitle>Installer</CardTitle>
                                {isTracked(booking.status) && (
                                    <Link href={`/publisher/bookings/${booking.id}/track`} className="inline-flex items-center gap-1.5 text-sm font-semibold text-ink hover:underline">
                                        <MapPin className="size-4" aria-hidden />
                                        Track installation
                                    </Link>
                                )}
                            </div>
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
                                <p className="mt-2 text-sm text-dim">No installer has accepted the job yet. Their name and number appear here as soon as one does.</p>
                            )}
                            {booking.slotTime && (
                                <div className="mt-3">
                                    <KeyRow label={booking.status === "SLOT_PROPOSED" ? "Proposed time" : "Installation time"} value={slot} strong />
                                </div>
                            )}
                            {booking.meetingPlace && <KeyRow label="Collecting from" value={booking.meetingPlace} />}
                            {booking.status === "SLOT_PROPOSED" && booking.slotCounterCount > 0 && (
                                <p className="mt-2 text-xs text-dim">
                                    You have asked for a different time {booking.slotCounterCount} {booking.slotCounterCount === 1 ? "time" : "times"} already. ADX steps in if this keeps going.
                                </p>
                            )}
                            {onTheWay && <InstallerWhereabouts bookingId={booking.id} />}
                        </Panel>
                    )}

                    <CreativePreview designUrl={booking.designUrl} brief={booking.notes} />

                    {booking.selfInstallNotes && (
                        <Panel>
                            <CardTitle>Your installation notes</CardTitle>
                            <p className="mt-2 whitespace-pre-line text-sm text-dim">{booking.selfInstallNotes}</p>
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
                                    <PrivateImage key={photo.id} src={photo.url} alt={photo.label ?? `Photo ${index + 1}`} className="aspect-[16/10] w-full rounded-md object-cover" />
                                ))}
                            </div>
                        </Panel>
                    )}

                    {failure && <ErrorNote message={failure} onRetry={reload} />}

                    <div className="flex flex-wrap gap-3">
                        {primary && (
                            <Link href={primary.href} className={brandButton}>
                                {primary.label}
                            </Link>
                        )}
                        {isTracked(booking.status) && !adxLane && (
                            <Link href={`/publisher/bookings/${booking.id}/track`} className={outlineButton}>
                                Track installation
                            </Link>
                        )}
                        <Link href="/publisher/bookings" className={outlineButton}>
                            Back to bookings
                        </Link>
                    </div>
                </div>

                <div className="grid content-start gap-6">
                    <SummaryCard data={data} status />
                    <Panel>
                        <CardTitle>Progress</CardTitle>
                        <StageLadder stages={stages} className="mt-4" />
                    </Panel>
                </div>
            </div>

            <CounterDialog
                open={countering}
                onClose={() => setCountering(false)}
                onSend={(note) => void counter(note)}
                busy={busy === "counter"}
                installer={agentName}
                proposed={slot}
                counters={booking.slotCounterCount}
                failure={counterFailure}
            />
        </>
    );
}

/** Where the installer last was, on the booking itself — the full map is on Track installation. */
function InstallerWhereabouts({ bookingId }: { bookingId: string }) {
    const [location, setLocation] = React.useState<AgentLocation | null | undefined>(undefined);
    React.useEffect(() => {
        let active = true;
        publisherBookings
            .agentLocation(bookingId)
            .then((answer) => {
                if (active) setLocation(answer);
            })
            .catch(() => {
                if (active) setLocation(null);
            });
        return () => {
            active = false;
        };
    }, [bookingId]);
    if (location === undefined) return null;
    const eta = etaLine(location);
    return <p className="mt-3 text-xs text-dim">{location?.updatedAt ? `${eta ? `${eta} ` : ""}They last shared their position ${sinceWhen(location.updatedAt)}.` : "The installer has not shared their position yet."}</p>;
}

/* ------------------------------------------------------------------ */
/* 12 · Completed booking — Live or finished                           */
/* ------------------------------------------------------------------ */

function Completed({ data }: { data: Loaded }) {
    const { booking, listing, digital, earning, advertiser } = useFacts(data);
    /* A dark feature is not announced: switched off, the summary is simply not drawn. */
    const insightsOn = useFlag(FLAG_SPOT_INSIGHTS);
    const insights = insightsOn ? data.insights : null;
    const { live } = runState(booking);
    const photo = listing?.photos?.[0]?.url ?? null;
    const [downloading, setDownloading] = React.useState(false);
    const fulfilment = installsThemselves(booking) ? (digital ? "Publisher scheduled playback" : "Publisher installation") : digital ? "ADX-assisted setup" : "ADX installation";
    const cleared = earning.source === "ACCRUED" && earning.clearedDays === earning.days;
    const agentName = booking.agent?.user?.name ?? null;

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

            <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_300px]">
                <div className="grid content-start gap-6">
                    <Panel>
                        <p className="text-sm font-semibold text-ink">{live ? "Campaign running · earnings accruing daily" : cleared ? "Campaign completed · payout settled" : earning.source === "ACCRUED" ? "Campaign completed · earnings clearing" : "Campaign completed"}</p>

                        <div className="mt-4 flex items-center gap-4 rounded-lg border border-line px-4 py-3">
                            {photo ? <img src={photo} alt="" className="size-[52px] rounded-md object-cover" /> : <span className="size-[52px] rounded-md bg-ground" aria-hidden />}
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
                            <KeyRow label="Booking ID" value={bookingRef(booking)} strong />
                            <KeyRow label="Advertiser" value={advertiser ?? "—"} strong />
                            <KeyRow label="Run dates" value={dateRange(booking.startDate, booking.endDate)} strong />
                            <KeyRow label="Fulfilment" value={fulfilment} strong />
                            {agentName && <KeyRow label="Installed by" value={agentName} strong />}
                            {booking.adminApprovedAt && <KeyRow label="Signed off" value={longDate(booking.adminApprovedAt)} strong />}
                            {booking.selfInstallNotes && <KeyRow label="Installation notes" value={<span className="whitespace-pre-line">{booking.selfInstallNotes}</span>} />}
                        </div>

                        {insights && (
                            <>
                                <p className="mt-6 text-sm font-semibold text-ink">{live ? "Performance" : "Final summary"}</p>
                                <div className="mt-2 grid grid-cols-3 gap-3">
                                    <Figure label="Scans" value={insights.scans.toLocaleString("en-IN")} />
                                    <Figure label="Estimated reach" value={insights.estimatedReach === null ? "—" : insights.estimatedReach.toLocaleString("en-IN")} />
                                    <Figure label="Interactions" value={insights.interactions.toLocaleString("en-IN")} />
                                </div>
                                <p className="mt-2 text-xs text-dim">
                                    {insights.estimatedReach === null
                                        ? "Scans and interactions are counted on this space's codes. No reach: your listing states no daily footfall."
                                        : "Scans and interactions are counted on this space's codes; reach is the footfall stated on your listing × the days run × the faces booked — an estimate, not a count."}
                                </p>
                            </>
                        )}
                    </Panel>

                    <RateInstaller bookingId={booking.id} agentName={agentName} />

                    <CreativePreview designUrl={booking.designUrl} brief={booking.notes} awaiting={false} />
                </div>

                <div className="grid content-start gap-6">
                    <Panel>
                        <CardTitle>Progress</CardTitle>
                        <StageLadder stages={stagesFor(booking)} className="mt-4" />
                    </Panel>
                    <Panel>
                        <CardTitle>The work</CardTitle>
                        <p className="mt-1 text-sm text-dim">The photos filed against this booking, and a dispute if something is wrong with them.</p>
                        <div className="mt-4 grid gap-2">
                            <Link href={`/publisher/bookings/${booking.id}/proof`} className={cn(outlineButton, "w-full")}>
                                See the proof of work
                            </Link>
                            <Link href={`/publisher/bookings/${booking.id}/track`} className={cn(outlineButton, "w-full")}>
                                Installation record
                            </Link>
                        </div>
                    </Panel>
                </div>
            </div>

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
