import { describe, expect, it } from "vitest";
import {
    availabilityFallback,
    bookingEarning,
    bookingProgress,
    bookingRef,
    bookingStatus,
    calendarWindow,
    dateRange,
    daysBetween,
    deductions,
    describeSession,
    earningHeadline,
    formatMoney,
    isDigital,
    isValidIfsc,
    kycLabel,
    listingFormat,
    listingLine,
    listingSize,
    listingStatus,
    longDate,
    maskedPhone,
    methodLine,
    multiplyMoney,
    pendingClearsBy,
    rateForDays,
    shiftAnchor,
    spanOf,
    sumMoney,
    toApiAmount,
    windowLabel,
    withdrawalStatus,
    type Booking,
    type Earnings,
    type MyListing,
} from "./publisher-workspace";

const booking = (over: Partial<Booking> = {}): Booking => ({
    id: "cmu5tney600124kvvo64jo8cf",
    status: "PENDING_PUBLISHER",
    campaignName: "Aster Festive Launch",
    designUrl: null,
    startDate: "2026-10-12T00:00:00.000Z",
    endDate: "2026-10-25T00:00:00.000Z",
    notes: null,
    meetingPlace: null,
    slotTime: null,
    slotCounterCount: 0,
    publisherTimerExpiry: null,
    publisherAcceptedAt: null,
    slotConfirmedAt: null,
    adminApprovedAt: null,
    printReadyAt: null,
    installBy: null,
    agentId: null,
    listingId: "lst1",
    listing: { id: "lst1", title: "Whitefield billboard", address: "Whitefield", city: "Bengaluru", category: "OUTDOOR", widthFt: "40.00", heightFt: "20.00", ratePerDay: "428.57", subType: null, placement: null, illumination: "BACKLIT" },
    createdAt: "2026-10-01T00:00:00.000Z",
    ...over,
});

describe("money", () => {
    it("groups rupees the Indian way and keeps paise only when they are not zero", () => {
        expect(formatMoney("12600.00")).toBe("₹12,600");
        expect(formatMoney("1234567.50")).toBe("₹12,34,567.50");
        expect(formatMoney("-500.00")).toBe("−₹500");
        expect(formatMoney(18000)).toBe("₹18,000");
        expect(formatMoney(null)).toBe("—");
        expect(formatMoney("12.5", { paise: "always" })).toBe("₹12.50");
    });

    it("adds and multiplies without a float", () => {
        expect(sumMoney(["0.10", "0.10", "0.10", "0.10"])).toBe("0.40");
        expect(sumMoney(["100.00", null])).toBeNull();
        expect(multiplyMoney("428.57", 14)).toBe("5999.98");
        expect(rateForDays("600.00", 14)).toBe("8400.00");
    });

    it("turns a typed amount into the API's decimal string", () => {
        expect(toApiAmount("18,000")).toBe("18000.00");
        expect(toApiAmount("12.5")).toBe("12.50");
        expect(toApiAmount("")).toBeNull();
    });
});

describe("dates", () => {
    it("prints ranges as the frames do", () => {
        expect(dateRange("2026-10-12", "2026-10-25")).toBe("12–25 Oct 2026");
        expect(dateRange("2026-10-12T00:00:00.000Z", "2026-10-25T00:00:00.000Z", { month: "long" })).toBe("12–25 October 2026");
        expect(dateRange("2026-09-28", "2026-10-05")).toBe("28 Sep – 5 Oct 2026");
        expect(dateRange("2026-12-28", "2027-01-03")).toBe("28 Dec 2026 – 3 Jan 2027");
        expect(dateRange(null, null)).toBe("Dates to be agreed");
        expect(longDate("2026-08-20")).toBe("20 Aug 2026");
    });

    it("counts both ends of a run", () => {
        expect(daysBetween("2026-10-12", "2026-10-25")).toBe(14);
        expect(daysBetween("2026-10-05", "2026-10-05")).toBe(1);
        expect(daysBetween("2026-10-05", null)).toBeNull();
    });
});

describe("bookings", () => {
    it("names the status in the frames' words", () => {
        expect(bookingStatus(booking())).toEqual({ label: "Needs response", tone: "ink" });
        expect(bookingStatus(booking({ status: "PENDING_PRINT" })).label).toBe("Artwork review");
        expect(bookingStatus(booking({ status: "COMPLETED", endDate: "2026-08-14T00:00:00.000Z" }), Date.UTC(2026, 8, 25)).label).toBe("Completed");
        expect(bookingStatus(booking({ status: "COMPLETED", endDate: "2099-08-14T00:00:00.000Z" }), Date.UTC(2026, 8, 25)).label).toBe("Live");
        expect(bookingStatus(booking({ status: "PUBLISHER_REJECTED" })).label).toBe("Declined");
    });

    it("quotes a reference off the id", () => {
        expect(bookingRef(booking())).toBe("BKG-4JO8CF");
    });

    it("estimates an unstarted booking from the rate and reads a run from the ledger", () => {
        const expected = bookingEarning(booking(), null);
        expect(expected.source).toBe("EXPECTED");
        expect(earningHeadline(expected)).toBe("5999.98");

        const earnings: Earnings = {
            summary: { grossEarned: "0", commission: "0", taxWithheld: "0", netEarned: "0", daysEarned: 2, pendingClearance: "0", pendingDays: 0 },
            days: [
                { id: "d1", forDate: "2026-10-12", listing: { id: "lst1", title: "Whitefield billboard", city: "Bengaluru" }, gross: "500.00", commission: "50.00", taxWithheld: "5.00", net: "445.00", clearsAt: "2026-10-19", cleared: true },
                { id: "d2", forDate: "2026-10-13", listing: { id: "lst1", title: "Whitefield billboard", city: "Bengaluru" }, gross: "500.00", commission: "50.00", taxWithheld: "5.00", net: "445.00", clearsAt: "2026-10-20", cleared: false },
                { id: "d3", forDate: "2026-10-13", listing: { id: "other", title: "Other", city: null }, gross: "900.00", commission: "90.00", taxWithheld: "9.00", net: "801.00", clearsAt: "2026-10-20", cleared: false },
            ],
        };
        const accrued = bookingEarning(booking({ status: "COMPLETED" }), earnings);
        expect(accrued).toMatchObject({ source: "ACCRUED", gross: "1000.00", net: "890.00", days: 2, clearedDays: 1 });
        expect(deductions(accrued)).toBe("110.00");
        expect(pendingClearsBy(earnings)).toBe("2026-10-20");
    });

    it("draws the progress card from the status", () => {
        expect(bookingProgress(booking({ status: "PENDING_PRINT", publisherAcceptedAt: "2026-10-02" }), false).map((r) => r.value)).toEqual(["Complete", "Pending", "Pending"]);
        expect(bookingProgress(booking({ status: "PENDING_APPROVAL" }), true)).toEqual([
            { label: "Booking accepted", value: "Complete" },
            { label: "Artwork review", value: "Complete" },
            { label: "Playback confirmation", value: "In review" },
        ]);
    });
});

describe("listings", () => {
    const listing = (over: Partial<MyListing> = {}): MyListing => ({ id: "l", displayId: "LST-1", title: "MG Road display", category: "INDOOR", subType: "Digital LED wall", placement: null, address: "MG Road", city: "Bengaluru", status: "ACTIVE", ratePerDay: "600.00", widthFt: null, heightFt: null, illumination: "DIGITAL", occupied: false, createdAt: "2026-01-01", ...over });

    it("names the format and size", () => {
        expect(isDigital(listing())).toBe(true);
        expect(listingFormat(listing())).toBe("Digital indoor");
        expect(listingFormat(listing({ category: "OUTDOOR", illumination: "BACKLIT", subType: "Billboard" }))).toBe("Outdoor");
        expect(listingSize(listing({ widthFt: "40.00", heightFt: "20.50" }))).toBe("40 × 20.5 ft");
        expect(listingLine(listing({ widthFt: "40.00", heightFt: "20.00" }))).toBe("Bengaluru · 40 × 20 ft");
    });

    it("puts statuses on shelves", () => {
        expect(listingStatus("ACTIVE")).toEqual({ label: "Published", tone: "success" });
        expect(listingStatus("PENDING_REVIEW")).toEqual({ label: "In review", tone: "neutral" });
        expect(listingStatus("SUSPENDED").label).toBe("Suspended");
    });
});

describe("payouts", () => {
    it("shelves withdrawals and prints the account", () => {
        expect(withdrawalStatus("REQUESTED")).toMatchObject({ label: "Pending", shelf: "PENDING" });
        expect(withdrawalStatus("PAID")).toMatchObject({ label: "Paid", shelf: "PAID" });
        expect(withdrawalStatus("FAILED").shelf).toBe("CLOSED");
        expect(methodLine({ type: "BANK", bankName: "HDFC Bank", accountNumberMasked: "•••• 4821", upiVpa: null })).toBe("HDFC Bank · •••• 4821");
        expect(methodLine({ type: "UPI", bankName: null, accountNumberMasked: null, upiVpa: "metro@upi" })).toBe("metro@upi");
        expect(methodLine(null)).toBe("No payout account yet");
    });

    it("checks an IFSC's shape", () => {
        expect(isValidIfsc("HDFC0001234")).toBe(true);
        expect(isValidIfsc("hdfc0001234")).toBe(true);
        expect(isValidIfsc("HDFC1001234")).toBe(false);
        expect(isValidIfsc("HDFC00012")).toBe(false);
    });
});

describe("availability", () => {
    it("windows a fortnight from Monday, a month from the first", () => {
        const fortnight = calendarWindow("2026-10-14", "2weeks");
        expect(fortnight.from).toBe("2026-10-12");
        expect(fortnight.to).toBe("2026-10-25");
        expect(fortnight.days).toHaveLength(14);
        expect(windowLabel(fortnight.from, fortnight.to, "2weeks")).toBe("12 Oct to 25 Oct");
        const month = calendarWindow("2026-10-14", "month");
        expect(month.from).toBe("2026-10-01");
        expect(month.to).toBe("2026-10-31");
        expect(windowLabel(month.from, month.to, "month")).toBe("October 2026");
        expect(shiftAnchor("2026-10-14", "week", 1)).toBe("2026-10-21");
        expect(shiftAnchor("2026-10-14", "month", -1)).toBe("2026-09-01");
    });

    it("places a range on the day axis, clipped to the window", () => {
        const days = calendarWindow("2026-10-14", "2weeks").days;
        expect(spanOf({ from: "2026-10-12", to: "2026-10-25" }, days)).toEqual({ start: 0, end: 13 });
        expect(spanOf({ from: "2026-10-20T00:00:00.000Z", to: "2026-11-02T00:00:00.000Z" }, days)).toEqual({ start: 8, end: 13 });
        expect(spanOf({ from: "2026-11-02", to: "2026-11-05" }, days)).toBeNull();
    });

    it("draws bookings by space until the availability contract lands", () => {
        const listings: MyListing[] = [
            { id: "lst1", displayId: null, title: "Whitefield billboard", category: "OUTDOOR", subType: null, placement: null, address: "", city: "Bengaluru", status: "ACTIVE", ratePerDay: null, widthFt: null, heightFt: null, illumination: null, occupied: true, createdAt: "" },
            { id: "lst2", displayId: null, title: "East billboard", category: "OUTDOOR", subType: null, placement: null, address: "", city: "Bengaluru", status: "PENDING_REVIEW", ratePerDay: null, widthFt: null, heightFt: null, illumination: null, occupied: false, createdAt: "" },
        ];
        const window = availabilityFallback("2026-10-12", "2026-10-25", listings, [booking({ status: "PENDING_PRINT" }), booking({ id: "gone", status: "CANCELLED" }), booking({ id: "held" })]);
        expect(window.listings[0]!.bookings.map((b) => b.kind)).toEqual(["BOOKED", "HOLD"]);
        expect(window.listings[1]!.bookings).toEqual([]);
        expect(window.listings[1]!.status).toBe("PENDING_REVIEW");
    });
});

describe("account", () => {
    it("masks the phone and reads a device off the user agent", () => {
        expect(maskedPhone("+919876543210")).toBe("+91 98••• ••210");
        expect(describeSession("Mozilla/5.0 (Windows NT 10.0) Chrome/129")).toEqual({ name: "Chrome", platform: "Windows", kind: "desktop" });
        expect(describeSession("okhttp/4.9 ADX-user")).toMatchObject({ name: "ADX app", kind: "phone" });
        expect(kycLabel("NEEDS_INFO").label).toBe("More information needed");
    });
});
