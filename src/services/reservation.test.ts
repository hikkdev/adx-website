import { describe, expect, it } from "vitest";
import { countdown, reservationDeadline, reservationLine, reservationOfferLine, reservationOffered, reservationOpen, type ReservationFeeOffer, type ReservationView } from "./reservation";

const offer = (over: Partial<ReservationFeeOffer> = {}): ReservationFeeOffer => ({ enabled: true, offered: true, amount: "1298.00", pct: 5, minCheckoutValue: 20000, payWithinMinutes: 60, holdHours: 24, retainPct: 10, ...over });

const reservation = (over: Partial<ReservationView> = {}): ReservationView => ({
    fee: "1298.00",
    status: "DUE",
    dueAt: "2026-09-25T10:00:00.000Z",
    paidAt: null,
    holdUntil: "2026-09-26T09:00:00.000Z",
    retained: null,
    payable: "24662.00",
    paymentId: null,
    ...over,
});

const at = (iso: string) => new Date(iso).getTime();

describe("RF-1: the countdown", () => {
    it("prints minutes, hours and days, and 'now' once the moment has passed", () => {
        expect(countdown("2026-09-25T10:00:00.000Z", at("2026-09-25T09:18:00.000Z"))).toBe("42 min");
        expect(countdown("2026-09-25T10:00:00.000Z", at("2026-09-25T06:50:00.000Z"))).toBe("3 h 10 min");
        expect(countdown("2026-09-25T10:00:00.000Z", at("2026-09-25T07:00:00.000Z"))).toBe("3 h");
        expect(countdown("2026-09-27T10:00:00.000Z", at("2026-09-26T08:00:00.000Z"))).toBe("1 d 2 h");
        expect(countdown("2026-09-25T10:00:00.000Z", at("2026-09-25T10:00:01.000Z"))).toBe("now");
        expect(countdown(null)).toBe("—");
    });

    it("runs to the fee's due time while DUE and to the hold's end while PAID", () => {
        expect(reservationDeadline(reservation())).toBe("2026-09-25T10:00:00.000Z");
        expect(reservationDeadline(reservation({ status: "PAID" }))).toBe("2026-09-26T09:00:00.000Z");
        expect(reservationDeadline(reservation({ status: "LAPSED" }))).toBeNull();
    });
});

describe("RF-1: the offer and the state", () => {
    it("offers reserving only when the policy says so and nothing is already in flight", () => {
        expect(reservationOffered(offer(), null)).toBe(true);
        expect(reservationOffered(offer({ offered: false, amount: null }), null)).toBe(false);
        expect(reservationOffered(offer(), reservation())).toBe(false);
        expect(reservationOffered(offer(), reservation({ status: "PAID" }))).toBe(false);
        expect(reservationOffered(offer(), reservation({ status: "LAPSED" }))).toBe(true);
        expect(reservationOffered(null, null)).toBe(false);
        expect(reservationOpen(reservation({ status: "RETAINED" }))).toBe(false);
    });

    it("says what the owner decided, figures in place", () => {
        expect(reservationOfferLine(offer())).toBe("Reserve these spots for 24 hours — pay a reservation fee of INR 1298.00 (5% of the total) within 60 minutes; it comes off the checkout when you go ahead, and 10% of it is kept if you don't.");
        expect(reservationLine(reservation(), 10, at("2026-09-25T09:18:00.000Z"))).toBe("Pay the INR 1298.00 reservation fee within 42 min to hold these spots — 10% of it is kept if you don't go ahead.");
        expect(reservationLine(reservation({ status: "PAID" }), null, at("2026-09-25T09:00:00.000Z"))).toBe("INR 1298.00 received. The spots are held for 1 d; pay the balance of INR 24662.00 by then and the fee comes off it.");
        expect(reservationLine(reservation({ status: "RETAINED", retained: "129.80" }), 10)).toContain("ADX kept INR 129.80 of the INR 1298.00 fee");
        expect(reservationLine(reservation({ status: "LAPSED" }), 10)).toContain("Reserve again, or pay in full");
    });
});
