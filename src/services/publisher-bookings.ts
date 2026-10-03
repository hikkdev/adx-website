import { api } from "@/lib/api-client";
import { longDate, dateTime, type Booking, type BookingDetail, type BookingsPage, type EvidenceKind, type OrderStatus } from "@/services/publisher-workspace";

/**
 * The publisher's bookings as the ADX app draws them
 * (`mobile/user-app/src/features/publisher/bookings/*`): the four chips with
 * the "waiting on you" count, the search, the five-stage progress ladder,
 * where the installer is (`GET /orders/:id/agent-location`), and the
 * one-time rating of the installer (`/orders/:id/rate-agent*`). The order's
 * `status` is the state machine and the server owns it; nothing here moves
 * a booking on its own.
 */

/* ------------------------------------------------------------------ */
/* The detail read, with the fields the web type did not declare       */
/* ------------------------------------------------------------------ */

/** `GET /orders/:id` joins more than the workspace type says; these are the fields the booking pages read beyond it. */
export interface BookingFull extends BookingDetail {
    /** The installer's own accept window — the countdown on "Finding you an agent". */
    agentTimerExpiry?: string | null;
}

/* ------------------------------------------------------------------ */
/* The list — four chips, a search, and who is waiting on whom         */
/* ------------------------------------------------------------------ */

export type BookingFilter = "ALL" | "PENDING" | "ACTIVE" | "COMPLETED";

export const BOOKING_FILTERS: { value: BookingFilter; label: string }[] = [
    { value: "ALL", label: "All" },
    { value: "PENDING", label: "Pending" },
    { value: "ACTIVE", label: "Active" },
    { value: "COMPLETED", label: "Completed" },
];

/** Waiting on a decision — the publisher's, an installer's or ADX's. */
const PENDING: OrderStatus[] = ["DRAFT", "PENDING_PUBLISHER", "PENDING_PRINT", "PENDING_AGENT", "AGENT_REJECTED", "SLOT_PROPOSED"];
/** Work in hand. A signed-off run still going (COMPLETED before its end date) is active too. */
const ACTIVE: OrderStatus[] = ["SELF_INSTALL", "SLOT_CONFIRMED", "IN_PROGRESS", "PENDING_OTP", "PENDING_APPROVAL"];

/** A signed-off booking is Live until its end date and Completed after it; no end date reads as still running. */
export function runState(booking: Pick<Booking, "status" | "endDate">, now: number = Date.now()): { live: boolean; finished: boolean } {
    if (booking.status !== "COMPLETED") return { live: false, finished: false };
    const ends = booking.endDate ? new Date(booking.endDate).getTime() : NaN;
    const finished = Number.isFinite(ends) && ends <= now;
    return { live: !finished, finished };
}

export function matchesFilter(booking: Pick<Booking, "status" | "endDate">, filter: BookingFilter, now: number = Date.now()): boolean {
    if (filter === "ALL") return true;
    const state = runState(booking, now);
    if (filter === "COMPLETED") return state.finished || booking.status === "CANCELLED" || booking.status === "PUBLISHER_REJECTED";
    if (filter === "ACTIVE") return state.live || ACTIVE.includes(booking.status);
    return PENDING.includes(booking.status);
}

/** Campaign, space, address, city, the BKG-… id and the tail of the row id — everything a row prints. */
export function matchesSearch(booking: Pick<Booking, "id" | "displayId" | "campaignName" | "listing">, query: string): boolean {
    const needle = query.trim().toLowerCase();
    if (!needle) return true;
    return [booking.campaignName, booking.listing?.title, booking.listing?.address, booking.listing?.city, booking.id.slice(-6), booking.displayId]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(needle));
}

const NEEDS_YOU: OrderStatus[] = ["PENDING_PUBLISHER", "SLOT_PROPOSED", "SELF_INSTALL", "PENDING_OTP"];

/**
 * Whether the booking is waiting on the publisher. PENDING_PRINT is theirs
 * only while nobody has said who installs it — once they have, the same
 * status means ADX is printing.
 */
export function needsPublisher(booking: Pick<Booking, "status" | "installBy">): boolean {
    if (booking.status === "PENDING_PRINT") return !booking.installBy;
    return NEEDS_YOU.includes(booking.status);
}

export function filterCounts(bookings: Pick<Booking, "status" | "endDate">[], now: number = Date.now()): Record<BookingFilter, number> {
    const counts: Record<BookingFilter, number> = { ALL: 0, PENDING: 0, ACTIVE: 0, COMPLETED: 0 };
    for (const booking of bookings) for (const { value } of BOOKING_FILTERS) if (matchesFilter(booking, value, now)) counts[value] += 1;
    return counts;
}

/** `?tab=` as the page reads it; the older `upcoming` link lands on Pending. */
export function filterFromParam(tab: string | null | undefined): BookingFilter {
    switch ((tab ?? "").toLowerCase()) {
        case "pending":
        case "upcoming":
            return "PENDING";
        case "active":
            return "ACTIVE";
        case "completed":
            return "COMPLETED";
        default:
            return "ALL";
    }
}

/** "3 bookings are waiting on you." — null when none is. */
export function waitingLine(count: number): string | null {
    if (count <= 0) return null;
    return `${count} booking${count === 1 ? " is" : "s are"} waiting on you.`;
}

/* ------------------------------------------------------------------ */
/* The five-stage ladder                                               */
/* ------------------------------------------------------------------ */

export type StageState = "done" | "current" | "todo";

export interface Stage {
    key: "SCHEDULED" | "ASSIGNED" | "INSTALLING" | "VERIFYING" | "COMPLETED";
    label: string;
    state: StageState;
    /** What is known at this stage — a date, a name, a time. */
    detail: string | null;
}

/**
 * Where a status sits on the five. SELF_INSTALL is past "assigned" — the
 * publisher is the installer; a proposed slot is still settling who and
 * when; a signed-off booking ticks every row; a cancelled one ticks none.
 */
const POSITION: Record<OrderStatus, number> = {
    DRAFT: 0,
    PENDING_PUBLISHER: 0,
    PUBLISHER_REJECTED: 0,
    PENDING_PRINT: 0,
    PENDING_AGENT: 1,
    AGENT_REJECTED: 1,
    SLOT_PROPOSED: 1,
    SELF_INSTALL: 2,
    SLOT_CONFIRMED: 2,
    IN_PROGRESS: 2,
    PENDING_OTP: 3,
    PENDING_APPROVAL: 3,
    COMPLETED: 5,
    CANCELLED: -1,
};

const stageState = (position: number, index: number): StageState => (position < 0 ? "todo" : index < position ? "done" : index === position ? "current" : "todo");

const day = (iso: string | null | undefined): string | null => (iso ? (longDate(iso) === "—" ? null : longDate(iso)) : null);
const when = (iso: string | null | undefined): string | null => (iso ? (dateTime(iso) === "—" ? null : dateTime(iso)) : null);

/** The app's five rows — Scheduled, Installer assigned, Installation in progress, Verification pending, Completed — each with what is known. */
export function stagesFor(booking: Pick<BookingDetail, "status" | "installBy" | "startDate" | "publisherAcceptedAt" | "slotTime" | "adminApprovedAt" | "agent" | "verification">): Stage[] {
    const position = POSITION[booking.status] ?? 0;
    const agentName = booking.agent?.user?.name ?? null;
    const installer =
        booking.installBy === "PUBLISHER" || booking.status === "SELF_INSTALL"
            ? "You are installing this one"
            : agentName
              ? `${agentName} is on it`
              : booking.status === "PENDING_AGENT" || booking.status === "AGENT_REJECTED"
                ? "ADX is finding an installer"
                : null;
    const rows: Omit<Stage, "state">[] = [
        { key: "SCHEDULED", label: "Scheduled", detail: day(booking.startDate) ? `Runs from ${day(booking.startDate)}` : booking.publisherAcceptedAt ? `Accepted ${day(booking.publisherAcceptedAt)}` : null },
        { key: "ASSIGNED", label: "Installer assigned", detail: installer },
        { key: "INSTALLING", label: "Installation in progress", detail: when(booking.slotTime) ? `Booked in for ${when(booking.slotTime)}` : null },
        {
            key: "VERIFYING",
            label: "Verification pending",
            detail: booking.status === "PENDING_OTP" ? "Waiting on your six-digit code" : booking.status === "PENDING_APPROVAL" ? "With ADX for sign-off" : booking.verification?.verifiedAt ? `Filed ${when(booking.verification.verifiedAt)}` : null,
        },
        { key: "COMPLETED", label: "Completed", detail: booking.status === "COMPLETED" && booking.adminApprovedAt ? `Signed off ${day(booking.adminApprovedAt)}` : null },
    ];
    return rows.map((row, index) => ({ ...row, state: stageState(position, index) }));
}

export const stagesDone = (stages: Stage[]): number => stages.filter((stage) => stage.state === "done").length;

/* ------------------------------------------------------------------ */
/* Where the installer is                                              */
/* ------------------------------------------------------------------ */

export interface AgentLocation {
    latitude: number | null;
    longitude: number | null;
    updatedAt: string | null;
    /** LT-1: how far the installer is, when ADX lets the parties see it; absent on an older backend. */
    eta?: { minutes: number; distanceM: number } | null;
}

/** "About 12 minutes away (4.8 km)." — "At your site now." inside 150 m; null when there is nothing to say. */
export function etaLine(location: AgentLocation | null | undefined): string | null {
    if (!location?.eta) return null;
    const { minutes, distanceM } = location.eta;
    if (distanceM < 150) return "At your site now.";
    const km = distanceM >= 1000 ? `${(distanceM / 1000).toFixed(1)} km` : `${distanceM} m`;
    return `About ${minutes} minute${minutes === 1 ? "" : "s"} away (${km}).`;
}

/** "20 minutes ago" — the age of a shared position. */
export function sinceWhen(iso: string, now: number = Date.now()): string {
    const at = new Date(iso).getTime();
    if (Number.isNaN(at)) return "a while ago";
    const minutes = Math.round((now - at) / 60_000);
    if (minutes < 1) return "just now";
    if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
    const hours = Math.round(minutes / 60);
    if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
    const days = Math.round(hours / 24);
    return `${days} day${days === 1 ? "" : "s"} ago`;
}

/** The countdown on a timer the platform is running: "25 minutes left", or "The window has passed". */
export function timeLeft(iso: string | null | undefined, now: number = Date.now()): string | null {
    if (!iso) return null;
    const at = new Date(iso).getTime();
    if (Number.isNaN(at)) return null;
    const minutes = Math.round((at - now) / 60_000);
    if (minutes <= 0) return "The window has passed";
    if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} left`;
    const hours = Math.round(minutes / 60);
    if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} left`;
    const days = Math.round(hours / 24);
    return `${days} day${days === 1 ? "" : "s"} left`;
}

/** Whether the booking has reached the part where an installer's position is worth asking for. */
export const isTracked = (status: OrderStatus): boolean => ["SLOT_PROPOSED", "SLOT_CONFIRMED", "IN_PROGRESS", "PENDING_OTP", "PENDING_APPROVAL", "COMPLETED"].includes(status);

/* ------------------------------------------------------------------ */
/* Rating the installer                                                */
/* ------------------------------------------------------------------ */

export interface AgentRatingEligibility {
    askable: boolean;
    reason: "NO_AGENT" | "NOT_YET" | "ALREADY_RATED" | null;
}

export const STAR_WORDS = ["", "Poor", "Fair", "Good", "Very good", "Excellent"] as const;

/* ------------------------------------------------------------------ */
/* The creative, the proof, the dispute                                */
/* ------------------------------------------------------------------ */

/** How the advertiser's artwork can be drawn: a picture, a video for a screen, a PDF, or a link. */
export function creativeKind(url: string | null | undefined): "image" | "video" | "pdf" | "file" | null {
    if (!url) return null;
    const path = url.split("?")[0]!.toLowerCase();
    if (/\.(png|jpe?g|webp|gif|avif|svg)$/.test(path)) return "image";
    if (/\.(mp4|webm|mov|m4v)$/.test(path)) return "video";
    if (path.endsWith(".pdf")) return "pdf";
    return "file";
}

/** Which of the self-install steps are already on file — a retry never files the prints or the "before" photos twice. */
export function selfInstallFiled(counts: Partial<Record<EvidenceKind, number>> | null | undefined): { prints: boolean; condition: boolean } {
    return { prints: (counts?.PICKUP ?? 0) > 0, condition: (counts?.CONDITION ?? 0) > 0 };
}

/** The most "before" photos one proof takes. */
export const MAX_BEFORE_PHOTOS = 6;

/** Where "Raise a dispute" goes — the Disputes area's raise page, on this booking. */
export const disputeHref = (orderId: string): string => `/publisher/disputes/new?orderId=${encodeURIComponent(orderId)}`;

/* ------------------------------------------------------------------ */
/* The service                                                         */
/* ------------------------------------------------------------------ */

/** A bound of its own, so a wrong `total` cannot spin the walk forever: 20 pages of 100. */
const MAX_PAGES = 20;

export const publisherBookings = {
    /**
     * Every booking on the publisher's spaces, newest first — the pages of
     * `GET /orders/my?as=publisher` walked, so the chips count the whole list
     * rather than the first hundred.
     */
    all: async (read: (page: number) => Promise<BookingsPage> = (page) => api.get<BookingsPage>(`/orders/my?as=publisher&sort=NEWEST&page=${page}&pageSize=100`)): Promise<Booking[]> => {
        const first = await read(1);
        const rows = [...(first.items ?? [])];
        for (let page = 2; rows.length < (first.total ?? 0) && page <= MAX_PAGES; page += 1) {
            const next = await read(page);
            if (!next.items?.length) break;
            rows.push(...next.items);
        }
        return rows;
    },
    booking: (id: string) => api.get<BookingFull>(`/orders/${encodeURIComponent(id)}`),
    agentLocation: (id: string) => api.get<AgentLocation>(`/orders/${encodeURIComponent(id)}/agent-location`),
    rateEligibility: (id: string) => api.get<AgentRatingEligibility>(`/orders/${encodeURIComponent(id)}/rate-agent/eligibility`),
    rateAgent: (id: string, body: { rating: number; note?: string }) =>
        api.post<{ id: string; rating: number; note: string | null; createdAt: string }>(`/orders/${encodeURIComponent(id)}/rate-agent`, { rating: body.rating, ...(body.note?.trim() ? { note: body.note.trim() } : {}) }),
};
