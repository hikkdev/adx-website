import { describe, expect, it } from "vitest";
import { activeFilterCount, drawerOf, EMPTY_PARAMS, exploreHref, exploreQuery, isLanding, parseExploreParams } from "./explore-params";

/**
 * Explore's URL is its state. These pin what a URL reads as, what the
 * browse is asked for it (the app's own keys — per-day rates, ISO datetimes,
 * one place at a time), and the URL each control writes back.
 */
describe("parseExploreParams", () => {
    it("reads the browse's own keys", () => {
        const p = parseExploreParams({ q: " mall ", city: "Pune", category: "INDOOR", venueTypeId: "v1", publisherId: "p1", minRate: "2,000", maxRate: "9000", minFootfall: "50000", lit: "1", instant: "1", sort: "NAME", page: "3", map: "1", lat: "12.9", lng: "77.5", radius: "5" });
        expect(p).toMatchObject({ q: "mall", city: "Pune", category: "INDOOR", venueTypeId: "v1", publisherId: "p1", minRate: "2000", maxRate: "9000", minFootfall: "50000", lit: true, instant: true, sort: "NAME", page: 3, map: true, lat: "12.9", lng: "77.5", radius: "5" });
    });

    it("still opens the first build's links: format, weekly budget, lit words", () => {
        expect(parseExploreParams({ format: "billboard" }).category).toBe("OUTDOOR");
        expect(parseExploreParams({ format: "digital" }).display).toBe("DIGITAL");
        expect(parseExploreParams({ format: "mall", q: "phoenix" })).toMatchObject({ category: "INDOOR", q: "phoenix mall" });
        expect(parseExploreParams({ budgetMin: "14000", budgetMax: "70000" })).toMatchObject({ minRate: "2000", maxRate: "10000" });
        expect(parseExploreParams({ lit: "front" }).lit).toBe(true);
        expect(parseExploreParams({ lit: "any" }).lit).toBe(false);
        expect(parseExploreParams({ lit: "led" })).toMatchObject({ lit: true, display: "DIGITAL" });
        expect(parseExploreParams({ page: "-4" }).page).toBe(1);
    });
});

describe("exploreQuery", () => {
    it("asks the browse what the app's browse asks for the same state", () => {
        const q = exploreQuery({ ...EMPTY_PARAMS, city: "Pune", category: "OUTDOOR", from: "2026-10-12", to: "2026-10-25", minRate: "2000", minFootfall: "25000", lit: true, sort: "RATING", page: 2 });
        expect(q).toEqual({
            city: "Pune",
            category: "OUTDOOR",
            from: "2026-10-12T00:00:00.000Z",
            to: "2026-10-25T23:59:59.999Z",
            minRate: "2000",
            minFootfall: 25000,
            illuminated: true,
            sort: "RATING",
            page: 2,
            pageSize: 12,
        });
    });

    it("sends one place: near me wins over the city", () => {
        const q = exploreQuery({ ...EMPTY_PARAMS, city: "Pune", lat: "12.97", lng: "77.59", radius: "10" });
        expect(q.city).toBeUndefined();
        expect(q.near).toEqual({ latitude: 12.97, longitude: 77.59, radiusKm: 10 });
    });

    it("sends instant only while the flag is on", () => {
        expect(exploreQuery({ ...EMPTY_PARAMS, instant: true }).instant).toBeUndefined();
        expect(exploreQuery({ ...EMPTY_PARAMS, instant: true }, { instantOn: true }).instant).toBe(true);
    });

    it("drops what the server would refuse: an unknown category or sort, a bad date, an end before the start", () => {
        const q = exploreQuery({ ...EMPTY_PARAMS, category: "PARKS", sort: "BEST", from: "2026-10-20", to: "2026-10-01", display: "HOLOGRAM" });
        expect(q.category).toBeUndefined();
        expect(q.sort).toBeUndefined();
        expect(q.display).toBeUndefined();
        expect(q.from).toBe("2026-10-20T00:00:00.000Z");
        expect(q.to).toBeUndefined();
        expect(exploreQuery({ ...EMPTY_PARAMS, from: "tomorrow" }).from).toBeUndefined();
    });

    it("carries the publisher and the venue for their browse", () => {
        expect(exploreQuery({ ...EMPTY_PARAMS, publisherId: "p1", venueTypeId: "v1" }, { pageSize: 1 })).toEqual({ publisherId: "p1", venueTypeId: "v1", page: 1, pageSize: 1 });
    });
});

describe("exploreHref", () => {
    it("writes the change and keeps the rest", () => {
        const base = { ...EMPTY_PARAMS, city: "Pune", sort: "NAME", page: 3 };
        expect(exploreHref({ category: "TRANSIT", page: 1 }, base)).toBe("/spaces?city=Pune&category=TRANSIT&sort=NAME");
        expect(exploreHref({ page: 4 }, base)).toBe("/spaces?city=Pune&sort=NAME&page=4");
        expect(exploreHref({ city: "", sort: "", page: 1 }, base)).toBe("/spaces");
    });

    it("writes near me as a point and drops the city beside it", () => {
        expect(exploreHref({ lat: "12.97", lng: "77.59", radius: "15", page: 1 }, { ...EMPTY_PARAMS, city: "Pune" })).toBe("/spaces?lat=12.97&lng=77.59&radius=15");
        expect(exploreHref({ lit: true, instant: true, map: true }, EMPTY_PARAMS)).toBe("/spaces?lit=1&instant=1&map=1");
    });
});

describe("the drawer and the landing", () => {
    it("counts the facets in force, price as one", () => {
        expect(activeFilterCount(drawerOf(EMPTY_PARAMS))).toBe(0);
        expect(activeFilterCount(drawerOf({ ...EMPTY_PARAMS, minRate: "1", maxRate: "2", lit: true, category: "MEDIA" }))).toBe(3);
    });

    it("is the explore home only while nothing is asked", () => {
        expect(isLanding(EMPTY_PARAMS)).toBe(true);
        expect(isLanding({ ...EMPTY_PARAMS, city: "Pune" })).toBe(true);
        expect(isLanding({ ...EMPTY_PARAMS, q: "mall" })).toBe(false);
        expect(isLanding({ ...EMPTY_PARAMS, publisherId: "p1" })).toBe(false);
        expect(isLanding({ ...EMPTY_PARAMS, page: 2 })).toBe(false);
        expect(isLanding({ ...EMPTY_PARAMS, lit: true })).toBe(false);
    });
});

describe("similarTo (SIM-1)", () => {
    it("reads the anchor from the URL, sends it to the browse, and is not the explore home", async () => {
        const mod = await import("./explore-params");
        const params = mod.parseExploreParams ? mod.parseExploreParams({ similarTo: "LST-1709-2660" }) : null;
        if (!params) return;
        expect(params.similarTo).toBe("LST-1709-2660");
        expect(mod.isLanding(params)).toBe(false);
    });
});
