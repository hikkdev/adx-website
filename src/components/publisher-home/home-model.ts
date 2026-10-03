import type { DashboardBooking, DashboardListing, PublisherProfile, PublisherReadiness, SigningSlice } from "@/services/publisher-workspace";
import { longDate } from "@/services/publisher-workspace";

/**
 * The Overview's rules, as the ADX app's publisher home draws them
 * (`mobile/user-app/src/features/publisher/publisher-home.tsx`,
 * `publisher-dashboard.tsx`, `location-card.tsx`,
 * `mobile/shared/components/readiness.tsx`,
 * `mobile/shared/features/legal/suspension-banner.tsx`): which suspension
 * banners show, what the readiness checklist says, the gauge's arc, the
 * Location Card's stage rail — pure, so the website and the phone agree.
 */

/* ── Lot A: suspension banners ─────────────────────────────────────────── */

export type DrawnScope = "BLOCK_NEW" | "STOP_OPEN_WORK" | "STOP_ACCRUAL" | "FREEZE_WALLET";

export const SUSPENSION_BANNERS: Record<DrawnScope, { title: string; tone: "warning" | "danger" }> = {
    BLOCK_NEW: { title: "New bookings are paused", tone: "warning" },
    STOP_OPEN_WORK: { title: "Work in progress was stopped", tone: "danger" },
    STOP_ACCRUAL: { title: "Earnings are paused", tone: "warning" },
    FREEZE_WALLET: { title: "Withdrawals are paused", tone: "danger" },
};

const SCOPE_ORDER: DrawnScope[] = ["BLOCK_NEW", "STOP_OPEN_WORK", "STOP_ACCRUAL", "FREEZE_WALLET"];

/**
 * The scopes that draw, in the strip's order. BLOCK_SIGNIN never draws (the
 * account is signed out), and a scope this build does not know draws nothing
 * rather than a blank banner.
 */
export function activeSuspensions(scopes: readonly string[] | null | undefined): DrawnScope[] {
    const present = new Set(scopes ?? []);
    return SCOPE_ORDER.filter((scope) => present.has(scope));
}

/* ── DS-3: the licence to display ──────────────────────────────────────── */

export const signingPending = (slice: SigningSlice | null | undefined): slice is SigningSlice => Boolean(slice && slice.required && !slice.satisfied);

/** Whether the licence can be signed now — an open request — or is waiting on a fresh one from ADX. */
export function licenceState(slice: SigningSlice | null | undefined): "NONE" | "SIGN" | "WAITING" {
    if (!signingPending(slice)) return "NONE";
    return slice.requestId && (slice.status === "REQUESTED" || slice.status === "PARTIALLY_SIGNED") ? "SIGN" : "WAITING";
}

/** The e-sign page for a request, coming back to the Overview when it is done. */
export const signHref = (requestId: string, next = "/publisher"): string => `/sign/${encodeURIComponent(requestId)}?next=${encodeURIComponent(next)}`;

/* ── QR-3: readiness ───────────────────────────────────────────────────── */

/** 29 Sep 2026: the basics a listing needs are the name, the email and the address — the date of birth is asked only to order. */
const BASIC_WORDS: Record<string, string> = { name: "name", email: "email", address: "address" };

/** "name", "name and email", "name, email and address". */
export function joinBasics(words: readonly string[]): string {
    if (words.length <= 1) return words[0] ?? "";
    return `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`;
}

export const missingWords = (readiness: Pick<PublisherReadiness, "profile">): string => joinBasics(readiness.profile.missing.map((key) => BASIC_WORDS[key] ?? key));

export interface ReadinessStep {
    key: "profile" | "kyc";
    label: string;
    done: boolean;
    detail: string;
}

/** The checklist's rows, in the ladder's order, with what each unlocks (`readinessSteps` in the app). */
export function readinessSteps(readiness: PublisherReadiness): ReadinessStep[] {
    return [
        {
            key: "profile",
            label: "Your details",
            done: readiness.profile.complete,
            detail: readiness.profile.complete ? "Name, email and address are in — you can list spaces, and they can go live." : `Add your ${missingWords(readiness)} to start listing spaces.`,
        },
        {
            key: "kyc",
            label: "Identity check",
            done: readiness.kyc.verified,
            detail: readiness.kyc.verified
                ? "Verified. Advertisers see the tick, and your spaces are shown first."
                : readiness.kyc.status === "NEEDS_INFO"
                  ? "ADX needs some documents again. Your spaces still go live, marked unverified, until it clears."
                  : readiness.kyc.status === "REJECTED"
                    ? "Not accepted. Talk to ADX support. Your spaces still go live, marked unverified."
                    : "Optional. Verified publishers get the tick and are shown first to advertisers; until then your profile and spaces are marked unverified.",
        },
    ];
}

/**
 * The card's one button: the details while they are missing — the business
 * profile holds the name, email and address — then the identity check. Null
 * once there is nothing left.
 */
export function readinessAction(readiness: PublisherReadiness): { label: string; href: string } | null {
    if (readiness.percent >= 100) return null;
    if (!readiness.profile.complete) return { label: "Complete your details", href: "/publisher/profile" };
    if (!readiness.kyc.verified) return { label: "Verify your identity", href: "/publisher/profile/verify" };
    return null;
}

/** "Continue unverified" is offered once the basics are in and only the check is left. */
export const offersContinueUnverified = (readiness: PublisherReadiness): boolean => readiness.profile.complete && !readiness.kyc.verified && readiness.percent < 100;

/* ── Lot D (Q42): the flagged re-upload ─────────────────────────────────── */

export const needsReupload = (profile: Pick<PublisherProfile, "kycStatus">): boolean => profile.kycStatus === "NEEDS_INFO";

/** U8/QR-22: the platform terms are still to be accepted. */
export const termsOutstanding = (profile: Pick<PublisherProfile, "platformAgreementAcceptedAt" | "activatedAt">): boolean => !profile.platformAgreementAcceptedAt && !profile.activatedAt;

/* ── The gauge ─────────────────────────────────────────────────────────── */

/** A half ring, the filled arc proportional to the rate (0–100). */
export function gaugeArc(rate: number, cx = 100, cy = 100, r = 84): string {
    const clamped = Math.max(0, Math.min(100, rate));
    const angle = Math.PI * (1 - clamped / 100);
    const x = cx + r * Math.cos(angle);
    const y = cy - r * Math.sin(angle);
    const large = clamped > 50 ? 1 : 0;
    return `M ${cx - r} ${cy} A ${r} ${r} 0 ${large} 1 ${x.toFixed(2)} ${y.toFixed(2)}`;
}

/** "4 of 10 live spaces booked today" under the gauge. */
export function occupancyLine(occupancy: { occupied: number; live: number }): string {
    if (occupancy.live === 0) return "No live spaces yet";
    return `${occupancy.occupied} of ${occupancy.live} live space${occupancy.live === 1 ? "" : "s"} booked today`;
}

/* ── The Location Card ─────────────────────────────────────────────────── */

export type StageState = "done" | "current" | "todo";

/** The booking tracker's five stages, in the frame's order (`order-milestones.ts`). */
export const STAGE_LABELS: { key: string; label: string }[] = [
    { key: "SCHEDULED", label: "Scheduled" },
    { key: "ASSIGNED", label: "Installer assigned" },
    { key: "INSTALLING", label: "Installation in progress" },
    { key: "VERIFYING", label: "Verification pending" },
    { key: "COMPLETED", label: "Completed" },
];

const POSITION: Record<string, number> = {
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

/** Each stage's state from the status alone — the same table the booking's tracker reads. */
export function stageRail(status: string): { key: string; label: string; state: StageState }[] {
    const position = POSITION[status] ?? 0;
    return STAGE_LABELS.map((row, index) => ({ ...row, state: position < 0 ? "todo" : index < position ? "done" : index === position ? "current" : "todo" }));
}

/** How far the rail is filled, 0–1, and the stage a screen reader names. */
export function railProgress(status: string): { filled: number; reached: number } {
    const stages = stageRail(status);
    const done = stages.filter((stage) => stage.state === "done").length;
    const current = stages.findIndex((stage) => stage.state === "current");
    const reached = Math.min(current >= 0 ? current : done, stages.length - 1);
    return { filled: stages.length > 1 ? reached / (stages.length - 1) : 0, reached };
}

/** "7 Sep – 7 Oct 2026", or what can be said when a date is missing. */
export function bookingRange(booking: Pick<DashboardBooking, "startDate" | "endDate">): string {
    if (!booking.startDate && !booking.endDate) return "Dates not set";
    const from = booking.startDate ? longDate(booking.startDate).replace(/ \d{4}$/, "") : "—";
    const to = booking.endDate ? longDate(booking.endDate) : "open";
    return `${from} – ${to}`;
}

/** The dialler link on the agent's number, or null when there is none. */
export function telHref(booking: Pick<DashboardBooking, "agent">): string | null {
    const phone = booking.agent?.phone?.trim();
    return phone ? `tel:${phone.replace(/[^\d+]/g, "")}` : null;
}

/** The pins: booked today in red, live and free in ink, not live in grey. */
export function pinTone(spot: Pick<DashboardListing, "occupied" | "status">): "booked" | "free" | "off" {
    if (spot.occupied) return "booked";
    return spot.status === "ACTIVE" ? "free" : "off";
}

/** The spots the map can place — those with a pin. */
export const placedSpots = <T extends Pick<DashboardListing, "latitude" | "longitude">>(spots: T[]): (T & { latitude: number; longitude: number })[] =>
    spots.filter((spot): spot is T & { latitude: number; longitude: number } => typeof spot.latitude === "number" && typeof spot.longitude === "number");

/** The spots whose title matches the search, for the map's own filter. */
export function matchSpots<T extends Pick<DashboardListing, "title">>(spots: T[], query: string): T[] {
    const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (words.length === 0) return spots;
    return spots.filter((spot) => words.every((word) => spot.title.toLowerCase().includes(word)));
}
