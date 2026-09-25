import { api } from "@/lib/api-client";

/**
 * RF-1 — the reservation fee (the owner, 25 Sep 2026). A big checkout can
 * be reserved before it is paid: the spots are held for `holdHours` once a
 * fee of `pct`% of the total lands, and the fee has to land within
 * `payWithinMinutes` of reserving. Going ahead folds the fee into the
 * checkout (the full-payment intent's amount is already total − fee);
 * walking away, or letting the hold lapse, keeps `retainPct`% of the fee.
 *
 * `GET /campaigns/:id/review` carries the offer; `GET /campaigns/:id` the
 * reservation as it stands. The calls here are shared by the booking
 * wizard's pay step and the workspace's campaign page.
 */
export type Money = string;

export interface ReservationFeeOffer {
    /** The policy switch itself; `offered` is that AND the threshold. */
    enabled: boolean;
    offered: boolean;
    /** The fee itself when offered, else null. */
    amount: Money | null;
    pct: number;
    minCheckoutValue: number;
    payWithinMinutes: number;
    holdHours: number;
    retainPct: number;
}

export type ReservationStatus = "DUE" | "PAID" | "ADJUSTED" | "SUPERSEDED" | "RETAINED" | "LAPSED";

export interface ReservationView {
    fee: Money;
    status: ReservationStatus | string;
    dueAt: string | null;
    paidAt: string | null;
    holdUntil: string | null;
    /** What ADX kept, once forfeited. */
    retained: Money | null;
    /** The checkout still to pay: the total less the fee when the fee is PAID. */
    payable: Money | null;
    paymentId: string | null;
}

export const reservationService = {
    /** `POST /campaigns/:id/reserve` — hold the spots against the fee; 409 RESERVATION_NOT_OFFERED under the threshold, RESERVATION_FEE_LAPSED past the hour. */
    reserve: <C, R>(campaignId: string) => api.post<{ campaign: C; review: R; reservation: ReservationView }>(`/campaigns/${encodeURIComponent(campaignId)}/reserve`, {}),
    /** `POST /campaigns/:id/reserve/pay` — the fee from the wallet balance. */
    payFromWallet: <C>(campaignId: string) => api.post<{ campaign: C; reservation: ReservationView }>(`/campaigns/${encodeURIComponent(campaignId)}/reserve/pay`, {}),
};

/** A reservation still in play: the fee due, or paid and holding the spots. */
export const reservationOpen = (reservation: Pick<ReservationView, "status"> | null | undefined): boolean => reservation?.status === "DUE" || reservation?.status === "PAID";

/** Whether the review's offer stands and no reservation is already in flight. */
export const reservationOffered = (offer: ReservationFeeOffer | null | undefined, reservation: Pick<ReservationView, "status"> | null | undefined): boolean =>
    !!offer?.offered && !!offer.amount && !reservationOpen(reservation);

/** "42 min" / "3 h 10 min" / "1 d 2 h" until `iso`; "now" once it has passed. */
export function countdown(iso: string | null | undefined, now: number = Date.now()): string {
    if (!iso) return "—";
    const ms = new Date(iso).getTime() - now;
    if (!Number.isFinite(ms) || ms <= 0) return "now";
    const minutes = Math.ceil(ms / 60_000);
    if (minutes < 60) return `${minutes} min`;
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    if (hours < 24) return rest ? `${hours} h ${rest} min` : `${hours} h`;
    const days = Math.floor(hours / 24);
    const restHours = hours % 24;
    return restHours ? `${days} d ${restHours} h` : `${days} d`;
}

/** The moment the countdown on a reservation runs to: the fee's due time while DUE, the hold's end while PAID. */
export function reservationDeadline(reservation: Pick<ReservationView, "status" | "dueAt" | "holdUntil">): string | null {
    if (reservation.status === "DUE") return reservation.dueAt;
    if (reservation.status === "PAID") return reservation.holdUntil;
    return null;
}

export const RESERVATION_WORDS: Record<string, { label: string; tone: "info" | "success" | "warning" | "neutral" | "danger" }> = {
    DUE: { label: "Reservation fee due", tone: "warning" },
    PAID: { label: "Spots reserved", tone: "success" },
    ADJUSTED: { label: "Reservation fee taken off the checkout", tone: "neutral" },
    SUPERSEDED: { label: "Paid in full instead", tone: "neutral" },
    RETAINED: { label: "Reservation forfeited", tone: "danger" },
    LAPSED: { label: "Reservation lapsed", tone: "neutral" },
};

/** The sentence the offer makes on the pay step. */
export function reservationOfferLine(offer: ReservationFeeOffer): string {
    return `Reserve these spots for ${offer.holdHours} hours — pay a reservation fee of INR ${offer.amount} (${offer.pct}% of the total) within ${offer.payWithinMinutes} minutes; it comes off the checkout when you go ahead, and ${offer.retainPct}% of it is kept if you don't.`;
}

/** The sentence the reservation's state makes, with the countdown in it. */
export function reservationLine(reservation: ReservationView, retainPct: number | null, now: number = Date.now()): string {
    switch (reservation.status) {
        case "DUE":
            return `Pay the INR ${reservation.fee} reservation fee within ${countdown(reservation.dueAt, now)} to hold these spots${retainPct === null ? "" : ` — ${retainPct}% of it is kept if you don't go ahead`}.`;
        case "PAID":
            return `INR ${reservation.fee} received. The spots are held for ${countdown(reservation.holdUntil, now)}; pay the balance of INR ${reservation.payable ?? "—"} by then and the fee comes off it${retainPct === null ? "" : `, or ${retainPct}% of it is kept`}.`;
        case "ADJUSTED":
            return `The INR ${reservation.fee} reservation fee came off the checkout.`;
        case "SUPERSEDED":
            return "The campaign was paid in full; the reservation was not needed.";
        case "RETAINED":
            return `The reservation was not taken up. ADX kept INR ${reservation.retained ?? "—"} of the INR ${reservation.fee} fee; the rest is in your wallet.`;
        case "LAPSED":
            return "The hour to pay the reservation fee passed, so the spots are no longer held. Reserve again, or pay in full to book.";
        default:
            return "";
    }
}
