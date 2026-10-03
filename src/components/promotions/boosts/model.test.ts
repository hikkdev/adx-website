import { describe, expect, it } from "vitest";
import type { BoostPlacementInfo } from "@/services/promotions";
import { boostCancelRule, chargedRates, earningsCover, mergedCapacity, mergedMinDays, mergePlacementDays, placementsLabel, refundLine, releaseAt, releaseLine, sponsorable, statusLine, stepIndex } from "./model";

const PLACEMENTS: BoostPlacementInfo[] = [
    { placement: "SEARCH_TOP", label: "Top of search", ratePerDay: "500.00", minDays: 3, maxConcurrent: 3 },
    { placement: "SIMILAR_TOP", label: "Top of similar", ratePerDay: "300.00", minDays: 7, maxConcurrent: 2 },
];

describe("merging the chosen placements' days", () => {
    it("takes the smaller room and the larger booked count per day, in date order", () => {
        const merged = mergePlacementDays(
            {
                SEARCH_TOP: [
                    { date: "2026-10-02", booked: 1, left: 2 },
                    { date: "2026-10-01", booked: 3, left: 0 },
                ],
                SIMILAR_TOP: [
                    { date: "2026-10-01", booked: 0, left: 2 },
                    { date: "2026-10-02", booked: 2, left: 0 },
                    { date: "2026-10-03", booked: 0, left: 2 },
                ],
            },
            ["SIMILAR_TOP", "SEARCH_TOP"]
        );
        expect(merged).toEqual([
            { date: "2026-10-01", booked: 3, left: 0 },
            { date: "2026-10-02", booked: 2, left: 0 },
            { date: "2026-10-03", booked: 0, left: 2 },
        ]);
    });

    it("ignores the placements that were not chosen", () => {
        const merged = mergePlacementDays({ SEARCH_TOP: [{ date: "2026-10-01", booked: 0, left: 3 }], SIMILAR_TOP: [{ date: "2026-10-01", booked: 2, left: 0 }] }, ["SEARCH_TOP"]);
        expect(merged).toEqual([{ date: "2026-10-01", booked: 0, left: 3 }]);
    });

    it("answers the shared capacity and shortest run", () => {
        expect(mergedCapacity(PLACEMENTS, ["SEARCH_TOP", "SIMILAR_TOP"])).toBe(2);
        expect(mergedCapacity(PLACEMENTS, ["SEARCH_TOP"])).toBe(3);
        expect(mergedCapacity(PLACEMENTS, [])).toBe(0);
        expect(mergedMinDays(PLACEMENTS, ["SEARCH_TOP", "SIMILAR_TOP"])).toBe(7);
        expect(mergedMinDays(PLACEMENTS, [])).toBe(1);
    });
});

describe("the words and the money", () => {
    it("names placements in the contract's order", () => {
        expect(placementsLabel(["SIMILAR_TOP", "SEARCH_TOP"])).toBe("Top of search + Top of similar listings");
        expect(placementsLabel([])).toBe("—");
    });

    it("sponsors only live listings, and pays from earnings only when they cover the total", () => {
        expect(sponsorable({ status: "ACTIVE" })).toBe(true);
        expect(sponsorable({ status: "PENDING_REVIEW" })).toBe(false);
        expect(earningsCover("1180.00", "1180.00")).toBe(true);
        expect(earningsCover("1179.99", "1180.00")).toBe(false);
        expect(earningsCover(null, "1.00")).toBe(false);
    });

    it("states the cancel rule for the publisher's earnings wallet", () => {
        expect(boostCancelRule({ status: "PENDING_PAYMENT", startDate: "2026-10-05", total: "1180.00" }, "2026-10-01")).toMatch(/Nothing has been paid/);
        expect(boostCancelRule({ status: "SCHEDULED", startDate: "2026-10-05", total: "1180.00" }, "2026-10-01")).toBe("It has not started yet, so the full ₹1,180.00 goes back to your earnings wallet.");
        expect(boostCancelRule({ status: "SCHEDULED", startDate: "2026-10-01", total: "1180.00" }, "2026-10-01")).toMatch(/nothing is refunded/);
        expect(boostCancelRule({ status: "LIVE", startDate: "2026-10-05", total: "1180.00" }, "2026-10-01")).toMatch(/stops now/);
    });

    it("says what a cancelled boost did with the money", () => {
        expect(refundLine({ status: "CANCELLED", paidAt: "2026-10-01T00:00:00Z", refundedAt: "2026-10-02T09:00:00Z", total: "590.00" })).toBe("₹590.00 was refunded to your earnings wallet on 2 Oct 2026.");
        expect(refundLine({ status: "CANCELLED", paidAt: "2026-10-01T00:00:00Z", refundedAt: null, total: "590.00" })).toMatch(/nothing was refunded/);
        expect(refundLine({ status: "CANCELLED", paidAt: null, refundedAt: null, total: "590.00" })).toMatch(/never paid/);
        expect(refundLine({ status: "LIVE", paidAt: null, refundedAt: null, total: "590.00" })).toBeNull();
    });

    it("says each status in a line and places it on the ladder", () => {
        const base = { startDate: "2026-10-05T00:00:00.000Z", endDate: "2026-10-11T00:00:00.000Z", cancelledAt: null, createdAt: undefined };
        expect(statusLine({ ...base, status: "SCHEDULED" })).toBe("Paid. It starts on 5 Oct 2026 and runs to 11 Oct 2026.");
        expect(statusLine({ ...base, status: "LIVE" })).toMatch(/labelled Sponsored, until 11 Oct 2026/);
        expect(stepIndex("PENDING_PAYMENT")).toBe(0);
        expect(stepIndex("ENDED")).toBe(3);
        expect(stepIndex("CANCELLED")).toBe(-1);
    });

    it("releases an unpaid boost an hour after it was made", () => {
        expect(releaseAt("2026-10-01T10:00:00.000Z")?.toISOString()).toBe("2026-10-01T11:00:00.000Z");
        expect(releaseAt(null)).toBeNull();
        expect(releaseAt("not a date")).toBeNull();
    });

    it("reads the charged rate by placement, or works it out from the subtotal", () => {
        const boost = { id: "b", displayId: null, listingId: "l", placements: ["SEARCH_TOP", "SIMILAR_TOP"], city: null, category: "OUTDOOR", startDate: "", endDate: "", days: 4, subtotal: "3200.00", gstAmount: "576.00", total: "3776.00", status: "SCHEDULED", reviewNote: null, paidAt: null, refundedAt: null, cancelledAt: null, cancelReason: null } as const;
        expect(chargedRates({ ...boost, placements: [...boost.placements], ratePerDay: { SEARCH_TOP: "500.00", SIMILAR_TOP: "300.00" } })).toEqual([
            { label: "Top of search", rate: "500.00" },
            { label: "Top of similar listings", rate: "300.00" },
        ]);
        expect(chargedRates({ ...boost, placements: [...boost.placements] })).toEqual([{ label: "Top of search + Top of similar listings", rate: "800.00" }]);
    });
});

describe("the release line", () => {
    it("prefers the server's payBy over creation plus an hour", () => {
        expect(releaseLine("2026-10-01T10:00:00.000Z")).toMatch(/^Pay by \d\d:\d\d/);
        expect(releaseLine(null)).toMatch(/^An unpaid sponsorship is released 60 minutes/);
        expect(releaseLine(null, "2026-10-01T10:30:00.000Z")).toMatch(/^Pay by \d\d:\d\d/);
    });
});
