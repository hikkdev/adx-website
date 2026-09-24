import { describe, expect, it } from "vitest";
import { browseSearch, formatChip, perWeek, placeSearch, rupees } from "./browse";

/**
 * The browse read is the app's: the query string is built key for key as
 * `discover-api.ts` builds it, so the web and the phone ask the backend the
 * same question. The card's derived labels are pinned beside it.
 */
describe("browseSearch", () => {
    it("carries every facet the drawer has, and nothing empty", () => {
        expect(browseSearch({})).toBe("");
        expect(browseSearch({ q: "", city: "Bengaluru", category: null, page: 2, pageSize: 12 })).toBe("?city=Bengaluru&page=2&pageSize=12");
        expect(browseSearch({ illuminated: true, instant: true, near: { latitude: 12.97, longitude: 77.59, radiusKm: 5 }, sort: "PRICE_ASC" })).toBe(
            "?illuminated=true&instant=true&lat=12.97&lng=77.59&radiusKm=5&sort=PRICE_ASC"
        );
        expect(browseSearch({ illuminated: false, from: "2026-10-12", to: "2026-10-25", minRate: "285", maxRate: "7142" })).toBe("?minRate=285&maxRate=7142&from=2026-10-12&to=2026-10-25");
    });

    it("keeps the place part on its own for the category and venue reads", () => {
        expect(placeSearch({})).toBe("");
        expect(placeSearch({ city: "Mysuru" })).toBe("?city=Mysuru");
        expect(placeSearch({ near: { latitude: 1, longitude: 2 } })).toBe("?lat=1&lng=2");
    });
});

describe("the card's labels", () => {
    it("prints the weekly figure off the per-day rate, in Indian grouping", () => {
        expect(perWeek("1800.00")).toBe("₹12,600 / week");
        expect(perWeek("60000")).toBe("₹4,20,000 / week");
        expect(perWeek(null)).toBe("Rate on request");
        expect(rupees("abc")).toBe("—");
    });

    it("chips the sub-type when the publisher named one, else the display or the category", () => {
        expect(formatChip({ category: "INDOOR", subType: "Table tent cards", display: "STATIC" })).toBe("TABLE TENT CARDS");
        expect(formatChip({ category: "INDOOR", subType: null, display: "DIGITAL" })).toBe("DIGITAL");
        expect(formatChip({ category: "OUTDOOR", subType: null, display: "STATIC" })).toBe("BILLBOARD");
    });
});
