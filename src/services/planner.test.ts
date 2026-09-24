import { describe, expect, it } from "vitest";
import {
    autocompleteSearch,
    ensureUrl,
    flightDays,
    footfallEstimate,
    formatDate,
    formatDateRange,
    isUrl,
    joinNames,
    marketPatch,
    mediaSubtotal,
    moneyString,
    nextStep,
    perWeek,
    pickerSearch,
    poiPatch,
    previousStep,
    radiusPatch,
    targetSummary,
    utmContent,
    withUtm,
} from "./planner";

describe("the flight", () => {
    it("counts both ends, off either date shape the backend sends", () => {
        expect(flightDays("2026-10-12", "2026-10-25")).toBe(14);
        expect(flightDays("2026-10-12T00:00:00.000Z", "2026-10-12T00:00:00.000Z")).toBe(1);
        expect(flightDays("2026-10-25", "2026-10-12")).toBe(0);
        expect(flightDays(null, "2026-10-12")).toBe(0);
    });

    it("prints dates the way the frames do", () => {
        expect(formatDate("2026-10-12")).toBe("12 Oct 2026");
        expect(formatDateRange("2026-10-12", "2026-10-25")).toBe("12–25 Oct 2026");
        expect(formatDateRange("2026-09-28", "2026-10-05")).toBe("28 Sep – 5 Oct 2026");
        expect(formatDateRange("2026-12-28", "2027-01-03")).toBe("28 Dec 2026 – 3 Jan 2027");
        expect(formatDateRange(null, null)).toBe("Dates not set");
    });
});

describe("money and counts", () => {
    it("sends budgets as the backend's money string", () => {
        expect(moneyString("₹50,000")).toBe("50000");
        expect(moneyString("12600.50")).toBe("12600.50");
        expect(moneyString("")).toBeNull();
        expect(moneyString("0")).toBeNull();
    });

    it("prints the weekly rate and the media subtotal", () => {
        expect(perWeek("3000")).toBe("₹21,000 / week");
        expect(perWeek(null)).toBe("Rate on request");
        expect(mediaSubtotal([{ lineTotal: "12000.00" }, { lineTotal: "6000" }])).toBe(18000);
    });

    it("estimates footfall only from spaces that state a figure", () => {
        expect(footfallEstimate([{ estimatedDailyFootfall: 5000 }, { estimatedDailyFootfall: null }, { estimatedDailyFootfall: 2000 }], 14)).toEqual({ daily: 7000, total: 98000, counted: 2, of: 3 });
        expect(footfallEstimate([{ estimatedDailyFootfall: null }], 14)).toBeNull();
    });

    it("joins names as a sentence", () => {
        expect(joinNames(["Whitefield billboard", "Phoenix Mall Atrium"])).toBe("Whitefield billboard and Phoenix Mall Atrium");
        expect(joinNames(["A", "B", "C"])).toBe("A, B and C");
        expect(joinNames([])).toBe("");
    });
});

describe("tracking", () => {
    it("tags a destination the way the backend's withUtm does, keeping the advertiser's own tags", () => {
        expect(withUtm("https://asterhome.example/festive", "aster-festive-oct26", "whitefield-billboard")).toBe(
            "https://asterhome.example/festive?utm_source=adx&utm_medium=ooh&utm_campaign=aster-festive-oct26&utm_content=whitefield-billboard"
        );
        expect(withUtm("https://x.example/?utm_campaign=mine", null, "c")).toBe("https://x.example/?utm_campaign=mine&utm_source=adx&utm_medium=ooh&utm_content=c");
        expect(withUtm("not a url", null, "c")).toBeNull();
    });

    it("slugs a space's name for utm_content and completes a bare vanity address", () => {
        expect(utmContent("Whitefield roadside billboard")).toBe("whitefield-roadside-billboard");
        expect(ensureUrl("asterhome.example/festive")).toBe("https://asterhome.example/festive");
        expect(ensureUrl("http://a.b")).toBe("http://a.b");
        expect(isUrl("https://a.b")).toBe(true);
        expect(isUrl("ftp://a.b")).toBe(false);
    });
});

describe("targeting", () => {
    it("clears the other two shapes whichever one is saved", () => {
        expect(radiusPatch({ location: "Whitefield, Bengaluru", latitude: 12.97, longitude: 77.75, km: 10 })).toMatchObject({
            targetingMethod: "RADIUS",
            targetRadiusKm: 10,
            targetMarket: null,
            pois: [],
        });
        expect(marketPatch("Bengaluru")).toMatchObject({ targetingMethod: "MARKET_OR_DMA", targetMarket: "Bengaluru", targetLatitude: null, pois: [] });
        expect(poiPatch([{ label: "Phoenix Mall", address: null, latitude: 1, longitude: 2 }])).toMatchObject({
            targetingMethod: "POI_VENUE",
            targetLocation: "Phoenix Mall",
            targetLatitude: null,
            targetMarket: null,
        });
    });

    it("summarises the target for the shortlist's brief line", () => {
        expect(targetSummary({ targetingMethod: "RADIUS", targetLocation: "Whitefield, Bengaluru", targetMarket: null, targetRadiusKm: 10, pois: [] })).toBe("Whitefield, Bengaluru · 10 km");
        expect(targetSummary({ targetingMethod: "MARKET_OR_DMA", targetLocation: "Mumbai", targetMarket: "Mumbai", targetRadiusKm: null, pois: [] })).toBe("Mumbai");
        expect(targetSummary({ targetingMethod: "POI_VENUE", targetLocation: null, targetMarket: null, targetRadiusKm: null, pois: [] })).toBe("No venues pinned");
    });

    it("builds the geo query strings the app sends", () => {
        expect(pickerSearch({ stages: ["LAUNCHED"], q: "Beng", limit: 20 })).toBe("?stage=LAUNCHED&q=Beng&limit=20");
        expect(autocompleteSearch({ input: " Whitefield ", near: { latitude: 12.9, longitude: 77.6 } })).toBe("?input=Whitefield&latitude=12.9&longitude=77.6");
    });
});

describe("the steps", () => {
    it("walk brand to tracking and back", () => {
        expect(nextStep("brand")).toBe("goal");
        expect(nextStep("tracking")).toBeNull();
        expect(previousStep("brand")).toBeNull();
        expect(previousStep("spaces")).toBe("budget");
    });
});
