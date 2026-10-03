import { afterEach, describe, expect, it, vi } from "vitest";
import {
    addDays,
    availabilitySearch,
    browseService,
    cardAvailability,
    DAY_STATE_LABEL,
    datesFit,
    dateSpan,
    dayDetail,
    dayState,
    fitLine,
    monthEnd,
    monthLabel,
    monthStart,
    monthWeeks,
    nextFreeLine,
    shortDate,
    spanDays,
    utcToday,
    weekdayDate,
    type AvailabilityDay,
} from "./browse";

const day = (date: string, left: number, blocked = false, total = 1): AvailabilityDay => ({ date, held: total - left, left, blocked });

describe("AV-1: a day's state", () => {
    it("is free when every slot is left, partly booked in between, booked at none, blocked when the publisher closed it", () => {
        expect(dayState({ left: 6, blocked: false }, 6)).toBe("free");
        expect(dayState({ left: 4, blocked: false }, 6)).toBe("partly");
        expect(dayState({ left: 0, blocked: false }, 6)).toBe("booked");
        expect(dayState({ left: 0, blocked: true }, 6)).toBe("blocked");
        expect(dayState({ left: 1, blocked: false }, 1)).toBe("free");
        expect(dayState({ left: 0, blocked: false }, 1)).toBe("booked");
    });

    it("says the state in words, and a screen's slots left beside it", () => {
        expect(DAY_STATE_LABEL.blocked).toBe("Blocked by the publisher");
        expect(dayDetail({ left: 4, blocked: false }, 6)).toBe("Partly booked · 4 of 6 slots left");
        expect(dayDetail({ left: 6, blocked: false }, 6)).toBe("Free · 6 of 6 slots left");
        expect(dayDetail({ left: 0, blocked: true }, 6)).toBe("Blocked by the publisher");
        expect(dayDetail({ left: 0, blocked: false }, 1)).toBe("Booked");
    });
});

describe("AV-1: dates", () => {
    it("counts, prints and pages days the way the backend counts them (UTC)", () => {
        expect(utcToday(new Date("2026-09-27T20:00:00Z"))).toBe("2026-09-27");
        expect(addDays("2026-09-30", 1)).toBe("2026-10-01");
        expect(spanDays("2026-10-16", "2026-10-22")).toBe(7);
        expect(spanDays("2026-10-22", "2026-10-16")).toBe(0);
        expect(shortDate("2026-10-11")).toBe("11 Oct");
        expect(weekdayDate("2026-10-11")).toBe("Sun 11 Oct");
        expect(dateSpan("2026-10-16", "2026-10-22")).toBe("16–22 Oct");
        expect(dateSpan("2026-10-28", "2026-11-03")).toBe("28 Oct – 3 Nov");
        expect(dateSpan("2026-12-28", "2027-01-03")).toBe("28 Dec 2026 – 3 Jan 2027");
        expect(monthLabel("2026-10-11")).toBe("October 2026");
        expect(monthStart("2026-12-15", 1)).toBe("2027-01-01");
        expect(monthEnd("2026-02-03")).toBe("2026-02-28");
    });

    it("lays a month out Monday first", () => {
        const weeks = monthWeeks("2026-10-01");
        /* 1 Oct 2026 is a Thursday. */
        expect(weeks[0]).toEqual([null, null, null, "2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04"]);
        expect(weeks.flat().filter(Boolean)).toHaveLength(31);
        expect(weeks.every((week) => week.length === 7)).toBe(true);
    });

    it("says when the space is next free", () => {
        expect(nextFreeLine({ nextFreeDate: "2026-09-27", from: "2026-09-27", to: "2027-03-31" }, "2026-09-27")).toBe("Free today");
        expect(nextFreeLine({ nextFreeDate: "2026-10-11", from: "2026-09-27", to: "2027-03-31" }, "2026-09-27")).toBe("Next free from 11 Oct");
        expect(nextFreeLine({ nextFreeDate: null, from: "2026-09-27", to: "2027-03-31" }, "2026-09-27")).toBe("No free day until 31 Mar");
    });

    it("checks the visitor's dates against the days read, and suggests the next fit", () => {
        const days = [day("2026-10-01", 1), day("2026-10-02", 0), day("2026-10-03", 1), day("2026-10-04", 0, true)];
        expect(datesFit(days, "2026-10-01", "2026-10-01")).toBe(true);
        expect(datesFit(days, "2026-10-01", "2026-10-03")).toBe(false);
        expect(datesFit(days, "2026-10-04", "2026-10-04")).toBe(false);
        expect(datesFit(days, "2026-10-03", "2026-10-09")).toBeNull();
        const screen = [day("2026-10-01", 2, false, 6), day("2026-10-02", 1, false, 6)];
        expect(datesFit(screen, "2026-10-01", "2026-10-02", 1)).toBe(true);
        expect(datesFit(screen, "2026-10-01", "2026-10-02", 2)).toBe(false);
        expect(fitLine({ from: "2026-10-16", to: "2026-10-22" })).toBe("Free for 7 days from 16 Oct: 16–22 Oct");
        expect(fitLine(null)).toBeNull();
    });

    it("asks the read with the range, the length and the quantity", () => {
        expect(availabilitySearch({ from: "2026-10-01", to: "2026-11-30", length: 7, quantity: 2 })).toBe("?from=2026-10-01&to=2026-11-30&length=7&quantity=2");
        expect(availabilitySearch({ from: "1 Oct" })).toBe("");
    });
});

describe("AV-1: the card's label", () => {
    const wall = { display: "STATIC" as const, slotsLeft: 1, freeDays: 31, windowDays: 31 };
    const screen = { display: "DIGITAL" as const, slotsLeft: 4, freeDays: 31, windowDays: 31 };

    it("a static wall: booked, partly booked with the free days, or nothing when free", () => {
        expect(cardAvailability({ ...wall, slotsLeft: 0, freeDays: 0 }, true)).toEqual({ text: "Booked on these dates", tone: "booked" });
        expect(cardAvailability({ ...wall, slotsLeft: 0, freeDays: 21 }, true)).toEqual({ text: "Partly booked · 21 of 31 days free", tone: "partly" });
        expect(cardAvailability(wall, true)).toBeNull();
    });

    it("a screen keeps its slots, with the free days when only some have room", () => {
        expect(cardAvailability(screen, true)).toEqual({ text: "4 slots left", tone: "free" });
        expect(cardAvailability({ ...screen, slotsLeft: 0, freeDays: 0 }, true)).toEqual({ text: "Booked", tone: "booked" });
        expect(cardAvailability({ ...screen, slotsLeft: 0, freeDays: 21 }, true)).toEqual({ text: "Booked · 21 of 31 days free", tone: "partly" });
    });

    it("says nothing about a wall on an undated browse, and only a screen's slots", () => {
        expect(cardAvailability({ display: "STATIC", slotsLeft: 0, freeDays: 0, windowDays: 1 })).toBeNull();
        expect(cardAvailability({ display: "DIGITAL", slotsLeft: 2, freeDays: 1, windowDays: 1 })).toEqual({ text: "2 slots left", tone: "free" });
        /* A window of more than a day is a dated browse, even without the URL's dates. */
        expect(cardAvailability({ display: "STATIC", slotsLeft: 0, freeDays: 3, windowDays: 7 })?.text).toBe("Partly booked · 3 of 7 days free");
    });
});

describe("AV-1: the availability read", () => {
    afterEach(() => vi.restoreAllMocks());

    it("asks the public route by the listing's id", async () => {
        const fetchMock = vi.fn(async () => new Response(JSON.stringify({ success: true, data: { listingId: "l1", days: [] } }), { status: 200, headers: { "Content-Type": "application/json" } }));
        vi.stubGlobal("fetch", fetchMock);
        await browseService.availability("LST-1709-2660", { from: "2026-10-01", to: "2026-10-31", length: 7 });
        const url = String((fetchMock.mock.calls[0] as unknown as [string])[0]);
        expect(url).toContain("/listings/browse/LST-1709-2660/availability?from=2026-10-01&to=2026-10-31&length=7");
        vi.unstubAllGlobals();
    });
});
