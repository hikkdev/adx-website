import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/api-client";
import { artworkProblems, boostAvailabilityOf, boostQuoteOf, cancelRule, ctrLabel, fullDays, fullDaysOf, quoteOf, runDays, runLabel, specFor, statsOf } from "./promotions";

describe("LM-1: the quote", () => {
    it("is days × the rate, plus 18% GST to the paisa", () => {
        expect(quoteOf("1500.00", 7)).toEqual({ days: 7, ratePerDay: "1500.00", subtotal: "10500.00", gstAmount: "1890.00", total: "12390.00" });
        expect(quoteOf("333.33", 3)).toEqual({ days: 3, ratePerDay: "333.33", subtotal: "999.99", gstAmount: "180.00", total: "1179.99" });
        expect(quoteOf("1500", 0)).toBeNull();
        expect(quoteOf("abc", 3)).toBeNull();
    });

    it("adds the chosen placements' rates for a sponsored listing", () => {
        const placements = [
            { placement: "SEARCH_TOP" as const, ratePerDay: "500.00" },
            { placement: "SIMILAR_TOP" as const, ratePerDay: "300.00" },
        ];
        expect(boostQuoteOf(placements, ["SEARCH_TOP", "SIMILAR_TOP"], 10)).toMatchObject({ ratePerDay: "800.00", subtotal: "8000.00", gstAmount: "1440.00", total: "9440.00" });
        expect(boostQuoteOf(placements, ["SIMILAR_TOP"], 2)?.total).toBe("708.00");
        expect(boostQuoteOf(placements, [], 2)).toBeNull();
        expect(boostQuoteOf([placements[0]!], ["SIMILAR_TOP"], 2)).toBeNull();
    });

    it("counts both ends of a run", () => {
        expect(runDays("2026-10-11", "2026-10-17")).toBe(7);
        expect(runDays("2026-10-11", "2026-10-11")).toBe(1);
        expect(runDays("2026-10-12", "2026-10-11")).toBe(0);
        expect(runLabel("2026-10-11T00:00:00.000Z", "2026-10-17T00:00:00.000Z")).toBe("11 Oct 2026 – 17 Oct 2026 · 7 days");
    });

    it("names the full days of a run", () => {
        const days = [
            { date: "2026-10-10", left: 0 },
            { date: "2026-10-11", left: 2 },
            { date: "2026-10-12", left: 0 },
        ];
        expect(fullDays(days, "2026-10-11", "2026-10-12")).toEqual(["2026-10-12"]);
        const caught = new ApiError(409, "SLOT_FULL", "Full", { fullDays: ["2026-10-12T00:00:00.000Z"] });
        expect(fullDaysOf(caught)).toEqual(["2026-10-12"]);
        expect(fullDaysOf(new ApiError(409, "PLACEMENT_FULL", "Full", { full: [{ date: "2026-10-13" }] }))).toEqual(["2026-10-13"]);
        expect(fullDaysOf(new ApiError(400, "VALIDATION", "x"))).toBeNull();
    });
});

describe("LM-1: the artwork check in the browser", () => {
    const spec = specFor("AD_SIDEBAR", [])!;

    it("passes a file of the slot's shape and size", () => {
        expect(spec).toMatchObject({ width: 600, height: 750 });
        expect(artworkProblems({ type: "image/png", size: 400_000, width: 1200, height: 1500 }, spec)).toEqual([]);
    });

    it("says what is wrong: the format, the weight, the shape, the size", () => {
        const problems = artworkProblems({ type: "image/gif", size: 9 * 1024 * 1024, width: 300, height: 300 }, spec);
        expect(problems).toHaveLength(4);
        expect(problems[0]).toMatch(/JPEG, PNG or WebP/);
        expect(problems[1]).toMatch(/9 MB/);
        expect(problems[2]).toMatch(/600:750/);
        expect(problems[3]).toMatch(/at least 600 × 750/);
    });

    it("prefers the server's specs to the fallback", () => {
        expect(specFor("AD_SIDEBAR", [{ key: "AD_SIDEBAR", label: "x", width: 300, height: 375, minWidth: 300, minHeight: 375, maxBytes: 1, formats: [] }])?.width).toBe(300);
    });
});

describe("LM-1: the cancel rule, stated before the button", () => {
    it("says what happens to the money", () => {
        expect(cancelRule({ status: "PENDING_PAYMENT", startDate: "2026-10-20", total: "1180.00" }, "2026-10-01")).toMatch(/Nothing has been paid/);
        expect(cancelRule({ status: "SCHEDULED", startDate: "2026-10-20", total: "1180.00" }, "2026-10-01")).toMatch(/full ₹1,180.00 goes back/);
        expect(cancelRule({ status: "SCHEDULED", startDate: "2026-10-01", total: "1180.00" }, "2026-10-01")).toMatch(/nothing is refunded/);
        expect(cancelRule({ status: "LIVE", startDate: "2026-10-20", total: "1180.00" }, "2026-10-01")).toMatch(/nothing is refunded/);
    });
});

describe("LM-1: reading the answers", () => {
    it("reads the boost availability however it is spelt", () => {
        const days = [{ date: "2026-10-11", booked: 1, left: 1 }];
        expect(boostAvailabilityOf({ placements: [{ placement: "SEARCH_TOP", days }] })).toEqual({ SEARCH_TOP: days });
        expect(boostAvailabilityOf({ placements: { SIMILAR_TOP: { days } } })).toEqual({ SIMILAR_TOP: days });
        expect(boostAvailabilityOf({ SEARCH_TOP: days })).toEqual({ SEARCH_TOP: days });
        expect(boostAvailabilityOf({ days: [{ date: "2026-10-11", SEARCH_TOP: 2, SIMILAR_TOP: 0 }] })).toEqual({
            SEARCH_TOP: [{ date: "2026-10-11", booked: 0, left: 2 }],
            SIMILAR_TOP: [{ date: "2026-10-11", booked: 0, left: 0 }],
        });
        expect(boostAvailabilityOf({ days: [{ date: "2026-10-11", left: { SEARCH_TOP: 1 } }] })).toEqual({ SEARCH_TOP: [{ date: "2026-10-11", booked: 0, left: 1 }] });
        expect(boostAvailabilityOf(null)).toEqual({});
    });

    it("reads the stats strictly and works the click-through rate", () => {
        const stats = statsOf({ impressions: 400, clicks: 10, ctr: 0.025, byDay: [{ date: "2026-10-11T00:00:00.000Z", impressions: "200", clicks: 4 }, { junk: true }] });
        expect(stats).toEqual({ impressions: 400, clicks: 10, ctr: 0.025, byDay: [{ date: "2026-10-11", impressions: 200, clicks: 4 }] });
        expect(ctrLabel(stats)).toBe("2.5%");
        expect(ctrLabel(statsOf(null))).toBe("—");
    });
});
