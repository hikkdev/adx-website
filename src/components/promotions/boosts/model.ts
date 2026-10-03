import { walletCovers } from "@/services/campaigns";
import {
    BOOST_PLACEMENTS,
    PLACEMENT_MEANING,
    dayLabel,
    dayOf,
    money,
    utcToday,
    type BoostAvailability,
    type BoostPlacement,
    type BoostPlacementInfo,
    type BoostView,
    type Money,
    type PromotionStatus,
    type SlotDay,
} from "@/services/promotions";

/**
 * LM-1 on the publisher's side: the pure arithmetic of buying a sponsored
 * listing — the chosen placements' days merged into one calendar, the
 * capacity and the shortest run they share, what the earnings wallet
 * covers, and the sentences each status says. The pages draw these.
 */

/** An unpaid boost is released this long after it is created. */
export const RELEASE_MINUTES = 60;

/**
 * The chosen placements' days as one calendar: a day has as much room as
 * the fullest chosen placement leaves on it (the smaller `left`), and as
 * many booked as the busiest one. A day only one placement answers keeps
 * that placement's figure — the server's quote checks every day again.
 */
export function mergePlacementDays(availability: BoostAvailability, chosen: BoostPlacement[]): SlotDay[] {
    const merged = new Map<string, SlotDay>();
    for (const placement of new Set(chosen)) {
        for (const day of availability[placement] ?? []) {
            const seen = merged.get(day.date);
            merged.set(day.date, seen ? { date: day.date, booked: Math.max(seen.booked, day.booked), left: Math.min(seen.left, day.left) } : { ...day });
        }
    }
    return [...merged.values()].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

/** The chosen placements' shared capacity: the smallest `maxConcurrent`; 0 when none is chosen. */
export function mergedCapacity(placements: Pick<BoostPlacementInfo, "placement" | "maxConcurrent">[], chosen: BoostPlacement[]): number {
    const rows = placements.filter((row) => chosen.includes(row.placement));
    if (rows.length === 0) return 0;
    return Math.min(...rows.map((row) => Math.max(0, Number(row.maxConcurrent) || 0)));
}

/** The shortest run the chosen placements all accept: the longest of their minimums. */
export function mergedMinDays(placements: Pick<BoostPlacementInfo, "placement" | "minDays">[], chosen: BoostPlacement[]): number {
    const rows = placements.filter((row) => chosen.includes(row.placement));
    return Math.max(1, ...rows.map((row) => Number(row.minDays) || 1));
}

/** The placements in the contract's order, whatever order they were ticked in. */
export const orderedPlacements = (chosen: BoostPlacement[]): BoostPlacement[] => BOOST_PLACEMENTS.filter((placement) => chosen.includes(placement));

/** "Top of search + Top of similar listings" */
export function placementsLabel(placements: BoostPlacement[] | null | undefined): string {
    const names = orderedPlacements(placements ?? []).map((placement) => PLACEMENT_MEANING[placement].title);
    return names.length ? names.join(" + ") : "—";
}

/** A listing a publisher may sponsor: live on the marketplace. */
export const sponsorable = (listing: { status: string }): boolean => listing.status === "ACTIVE";

/** Whether the earnings wallet's withdrawable balance pays the whole total. */
export const earningsCover = (withdrawable: Money | null | undefined, total: Money | null | undefined): boolean => walletCovers(withdrawable, total);

/** When an unpaid boost is released: creation plus an hour; null when the creation time is unknown. */
export function releaseAt(createdAt: string | null | undefined): Date | null {
    if (!createdAt) return null;
    const at = Date.parse(createdAt);
    return Number.isNaN(at) ? null : new Date(at + RELEASE_MINUTES * 60_000);
}

/** "14:35" in the viewer's clock. */
const clock = (at: Date): string => at.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false });

/** The line under an unpaid boost: pay within the hour, or the days go back on sale. */
export function releaseLine(createdAt: string | null | undefined, payBy?: string | null): string {
    const named = payBy ? Date.parse(payBy) : NaN;
    const at = Number.isNaN(named) ? releaseAt(createdAt) : new Date(named);
    return at
        ? `Pay by ${clock(at)} — an unpaid sponsorship is released ${RELEASE_MINUTES} minutes after it is created, and its days go back on sale.`
        : `An unpaid sponsorship is released ${RELEASE_MINUTES} minutes after it is created, and its days go back on sale.`;
}

/**
 * What cancelling does to the money, in the publisher's words: the refund
 * of a paid boost that has not started goes to the earnings wallet.
 */
export function boostCancelRule(boost: { status: PromotionStatus; startDate: string; total: Money }, today: string = utcToday()): string {
    if (boost.status === "DRAFT" || boost.status === "PENDING_PAYMENT") return "Nothing has been paid, so nothing is refunded. The days go back on sale.";
    if (boost.status === "LIVE" || dayOf(boost.startDate) <= today) return "It has already started: it stops now and nothing is refunded.";
    return `It has not started yet, so the full ${money(boost.total)} goes back to your earnings wallet.`;
}

/** The refund line a cancelled boost carries. */
export function refundLine(boost: Pick<BoostView, "status" | "paidAt" | "refundedAt" | "total">): string | null {
    if (boost.status !== "CANCELLED") return null;
    if (boost.refundedAt) return `${money(boost.total)} was refunded to your earnings wallet on ${dayLabel(boost.refundedAt)}.`;
    if (boost.paidAt) return "It had already started when it was cancelled, so nothing was refunded.";
    return "It was never paid for, so there was nothing to refund.";
}

/** The one sentence at the head of a boost's page, per status. */
export function statusLine(boost: Pick<BoostView, "status" | "startDate" | "endDate" | "cancelledAt" | "createdAt">): string {
    switch (boost.status) {
        case "PENDING_PAYMENT":
            return "Waiting for payment. Your dates are held until it is paid or released.";
        case "SCHEDULED":
            return `Paid. It starts on ${dayLabel(boost.startDate)} and runs to ${dayLabel(boost.endDate)}.`;
        case "LIVE":
            return `Live — your listing is shown first, labelled Sponsored, until ${dayLabel(boost.endDate)}.`;
        case "ENDED":
            return `Ended. It ran to ${dayLabel(boost.endDate)}.`;
        case "CANCELLED":
            return boost.cancelledAt ? `Cancelled on ${dayLabel(boost.cancelledAt)}.` : "Cancelled.";
        case "REJECTED":
            return "ADX did not accept this sponsorship.";
        default:
            return "";
    }
}

/** The four steps a boost walks, and how far this one got. */
export const BOOST_STEPS = [
    { key: "PENDING_PAYMENT", label: "Pay" },
    { key: "SCHEDULED", label: "Scheduled" },
    { key: "LIVE", label: "Live" },
    { key: "ENDED", label: "Ended" },
] as const;

/** The index of the step a status stands on; −1 off the ladder (cancelled, rejected). */
export function stepIndex(status: PromotionStatus): number {
    return BOOST_STEPS.findIndex((step) => step.key === status);
}

/**
 * The rate each placement was charged at, as the booking carries it; when
 * it carries none, the day rate the subtotal works out to, as one row.
 */
export function chargedRates(boost: BoostView & { ratePerDay?: unknown }): { label: string; rate: Money }[] {
    const carried = boost.ratePerDay;
    if (carried && typeof carried === "object") {
        const rows = orderedPlacements(boost.placements)
            .map((placement) => ({ label: PLACEMENT_MEANING[placement].title, rate: (carried as Record<string, unknown>)[placement] }))
            .filter((row): row is { label: string; rate: Money } => typeof row.rate === "string" || typeof row.rate === "number")
            .map((row) => ({ label: row.label, rate: String(row.rate) }));
        if (rows.length) return rows;
    }
    const subtotal = Number(boost.subtotal);
    if (boost.days > 0 && Number.isFinite(subtotal)) return [{ label: placementsLabel(boost.placements), rate: (Math.round((subtotal / boost.days) * 100) / 100).toFixed(2) }];
    return [];
}

/** The payment this browser opened for a boost, so its page can offer the gateway's page again. */
const PAYMENT_KEY = "adx.web.boost-payment";

export const boostPayment = {
    remember(boostId: string, payment: { id: string; url: string | null }) {
        try {
            window.sessionStorage.setItem(`${PAYMENT_KEY}.${boostId}`, JSON.stringify(payment));
        } catch {
            /* ignore */
        }
    },
    read(boostId: string): { id: string; url: string | null } | null {
        try {
            const raw = window.sessionStorage.getItem(`${PAYMENT_KEY}.${boostId}`);
            return raw ? (JSON.parse(raw) as { id: string; url: string | null }) : null;
        } catch {
            return null;
        }
    },
};
