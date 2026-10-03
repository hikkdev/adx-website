import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api-client";
import {
    browseHeading,
    browseSearch,
    browseService,
    categoryTiles,
    cityNotOpenMessage,
    comingSoonCopy,
    dayEnd,
    dayStart,
    distanceLabel,
    forgetQuery,
    formatChip,
    geoService,
    highlightsOf,
    illuminationLabel,
    locateMessage,
    nearOf,
    perDay,
    perWeek,
    pickerSearch,
    placeSearch,
    priceBandOf,
    publisherLine,
    ratingLabel,
    rememberQuery,
    roundCoord,
    rupees,
    scansOf,
    shareLinkOf,
    shareWordsOf,
    slotsLabel,
    sortLabel,
    spacesCount,
    spacesHref,
    specsOf,
    stageLabel,
    stageTone,
    stripMosaic,
    stripVenues,
    waitlistOutcome,
    type BrowseCard,
    type MosaicPlacement,
    type VenueTile,
} from "./browse";

/**
 * The browse read is the app's: the query string is built key for key as
 * `discover-api.ts` builds it, so the web and the phone ask the backend the
 * same question. The card's derived labels, the drawer's options and the
 * geo words are pinned beside it, each against the app's own wording.
 */
describe("browseSearch", () => {
    it("carries every facet the drawer has, and nothing empty", () => {
        expect(browseSearch({})).toBe("");
        expect(browseSearch({ q: "", city: "Bengaluru", category: null, page: 2, pageSize: 12 })).toBe("?city=Bengaluru&page=2&pageSize=12");
        expect(browseSearch({ illuminated: true, instant: true, near: { latitude: 12.97, longitude: 77.59, radiusKm: 5 }, sort: "PRICE_ASC" })).toBe(
            "?illuminated=true&instant=true&lat=12.97&lng=77.59&radiusKm=5&sort=PRICE_ASC"
        );
        expect(browseSearch({ illuminated: false, from: "2026-10-12T00:00:00.000Z", to: "2026-10-25T23:59:59.999Z", minRate: "285", maxRate: "7142" })).toBe(
            "?minRate=285&maxRate=7142&from=2026-10-12T00%3A00%3A00.000Z&to=2026-10-25T23%3A59%3A59.999Z"
        );
    });

    it("sends the venue, the publisher and the footfall the app's browse sends", () => {
        expect(browseSearch({ venueTypeId: "v1", publisherId: "p1", minFootfall: 50_000, sort: "NAME" })).toBe("?venueTypeId=v1&publisherId=p1&minFootfall=50000&sort=NAME");
    });

    it("keeps the place part on its own for the category and venue reads", () => {
        expect(placeSearch({})).toBe("");
        expect(placeSearch({ city: "Mysuru" })).toBe("?city=Mysuru");
        expect(placeSearch({ near: { latitude: 1, longitude: 2 } })).toBe("?lat=1&lng=2");
        expect(placeSearch({ near: { latitude: 1, longitude: 2, radiusKm: 15 } })).toBe("?lat=1&lng=2&radiusKm=15");
    });
});

describe("dates the browse accepts", () => {
    it("sends the first and last instant of a picked day, never a bare date", () => {
        expect(dayStart("2026-10-12")).toBe("2026-10-12T00:00:00.000Z");
        expect(dayEnd("2026-10-25")).toBe("2026-10-25T23:59:59.999Z");
        expect(dayStart("12/10/2026")).toBeUndefined();
        expect(dayEnd("")).toBeUndefined();
        expect(dayStart("2026-13-45")).toBeUndefined();
    });
});

describe("the card's labels", () => {
    it("prints the weekly figure and the daily one off the per-day rate, in Indian grouping", () => {
        expect(perWeek("1800.00")).toBe("₹12,600 / week");
        expect(perWeek("60000")).toBe("₹4,20,000 / week");
        expect(perWeek(null)).toBe("Rate on request");
        expect(perDay("1800.00")).toBe("₹1,800 / day");
        expect(perDay(null)).toBe("Rate on request");
        expect(rupees("abc")).toBe("—");
    });

    it("chips the sub-type when the publisher named one, else the display or the category", () => {
        expect(formatChip({ category: "INDOOR", subType: "Table tent cards", display: "STATIC" })).toBe("TABLE TENT CARDS");
        expect(formatChip({ category: "INDOOR", subType: null, display: "DIGITAL" })).toBe("DIGITAL");
        expect(formatChip({ category: "OUTDOOR", subType: null, display: "STATIC" })).toBe("BILLBOARD");
    });

    it("counts a screen's slots, says Booked at none, and nothing on a static wall", () => {
        expect(slotsLabel({ display: "DIGITAL", slotsLeft: 6 })).toBe("6 slots left");
        expect(slotsLabel({ display: "DIGITAL", slotsLeft: 1 })).toBe("1 slot left");
        expect(slotsLabel({ display: "DIGITAL", slotsLeft: -2 })).toBe("Booked");
        expect(slotsLabel({ display: "STATIC", slotsLeft: 1 })).toBeNull();
    });

    it("prints a rating only once there is a review", () => {
        expect(ratingLabel("4.75", 12)).toBe("4.8");
        expect(ratingLabel(null, 0)).toBeNull();
        expect(ratingLabel("5.00", 0)).toBeNull();
    });

    it("says how far a space is when the browse was asked around a point", () => {
        expect(distanceLabel(null)).toBeNull();
        expect(distanceLabel(347)).toBe("350 m away");
        expect(distanceLabel(1234)).toBe("1.2 km away");
        expect(distanceLabel(15_400)).toBe("15 km away");
    });
});

const card = (over: Partial<BrowseCard> = {}): BrowseCard => ({
    id: "l1",
    displayId: "LST-1",
    title: "MG Road Unipole",
    category: "OUTDOOR",
    subType: null,
    address: "Trinity Circle",
    city: "Bengaluru",
    latitude: null,
    longitude: null,
    ratePerDay: "3000",
    pricingUnit: "DAY",
    basePrice: null,
    size: "40 x 20 ft",
    photos: [],
    description: null,
    illumination: "BACKLIT",
    facing: "North",
    placement: null,
    visibility: "High",
    estimatedDailyFootfall: 60_000,
    availableNow: true,
    availableFrom: null,
    availableHoursFrom: "06:00",
    availableHoursTo: "23:00",
    peakPeriodNote: null,
    targetAudience: null,
    uniqueSellingPoint: null,
    publisherName: "Skyline Outdoor",
    publisherVerified: true,
    distanceM: null,
    ratingAvg: null,
    reviewCount: 0,
    saved: false,
    instantBooking: true,
    shareUrl: "https://adx.in/s/LST-1",
    display: "STATIC",
    slotsTotal: 1,
    slotsLeft: 1,
    ...over,
});

describe("the listing page's facts", () => {
    it("reads the highlights off the listing, the bolt only while the flag is on, three at most", () => {
        expect(highlightsOf(card(), false).map((h) => h.label)).toEqual(["Illuminated", "High footfall", "Available now"]);
        expect(highlightsOf(card(), true).map((h) => h.label)).toEqual(["Instant booking", "Illuminated", "High footfall"]);
        expect(highlightsOf(card({ illumination: "NONE", estimatedDailyFootfall: 100, availableNow: false, instantBooking: false }), true).map((h) => h.label)).toEqual(["High visibility"]);
    });

    it("lists only the specs the publisher filled, in the app's order", () => {
        expect(specsOf(card())).toEqual([
            { label: "Size", value: "40 x 20 ft" },
            { label: "Illuminated", value: "Back-lit" },
            { label: "Facing", value: "North" },
            { label: "Daily footfall", value: "~60,000 people" },
            { label: "Hours", value: "06:00 – 23:00" },
        ]);
        expect(illuminationLabel("FRONTLIT")).toBe("Front-lit");
        expect(illuminationLabel("Neon")).toBe("Neon");
        expect(illuminationLabel(null)).toBeNull();
    });

    it("shares the words and the server's link, or this page when the spot has none", () => {
        expect(shareWordsOf(card())).toBe("MG Road Unipole in Bengaluru — ₹3,000 per day on ADX");
        expect(shareWordsOf(card({ ratePerDay: null, city: null }))).toBe("MG Road Unipole — Rate on request on ADX");
        expect(shareLinkOf(card(), "http://x/spaces/l1")).toBe("https://adx.in/s/LST-1");
        expect(shareLinkOf(card({ shareUrl: null }), "http://x/spaces/l1")).toBe("http://x/spaces/l1");
    });

    it("says who approves and whether ADX has checked who they are", () => {
        expect(publisherLine(card(), false)).toBe("Listed by Skyline Outdoor. Every booking waits for their approval. Identity verified by ADX.");
        expect(publisherLine(card(), true)).toBe("Listed by Skyline Outdoor. Bookings on this space are accepted the moment they are placed. Identity verified by ADX.");
        expect(publisherLine(card({ publisherVerified: false, instantBooking: false }), true)).toBe(
            "Listed by Skyline Outdoor. Every booking waits for their approval. This publisher has not completed their identity check yet."
        );
        expect(publisherLine(card({ publisherName: null }))).toBeNull();
    });
});

describe("the drawer, the sort and the tiles", () => {
    it("names the sort sheet's rows in the app's words", () => {
        expect(sortLabel("NAME")).toBe("Name, A to Z");
        expect(sortLabel("NEWEST")).toBe("Newest first");
    });

    it("finds the price band a range is, or calls it custom", () => {
        expect(priceBandOf({})).toBe("ANY");
        expect(priceBandOf({ minRate: "5000", maxRate: "15000" })).toBe("5K_15K");
        expect(priceBandOf({ minRate: "50000" })).toBe("50K_UP");
        expect(priceBandOf({ minRate: "100", maxRate: "900" })).toBe("CUSTOM");
    });

    it("keeps the known categories, never a negative count", () => {
        const read = { items: [{ category: "OUTDOOR", count: 8, photoUrl: "x" }, { category: "BOGUS", count: 1, photoUrl: null }, { category: "MEDIA", count: -1, photoUrl: null }] } as never;
        expect(categoryTiles(read)).toEqual([
            { category: "OUTDOOR", count: 8, photoUrl: "x" },
            { category: "MEDIA", count: 0, photoUrl: null },
        ]);
    });

    it("draws the counted venues first, then the rest, capped", () => {
        const v = (id: string, count: number): VenueTile => ({ venueTypeId: id, slug: id, name: id, label: id, category: "INDOOR", count, photoUrl: null });
        expect(stripVenues([v("a", 0), v("b", 3), v("c", 0), v("d", 1)]).map((x) => x.venueTypeId)).toEqual(["b", "d", "a", "c"]);
        expect(stripVenues([v("a", 1), v("b", 1), v("c", 1)], 2)).toHaveLength(2);
        expect(spacesCount(0)).toBe("None yet");
        expect(spacesCount(1)).toBe("1 space");
        expect(spacesCount(1200)).toBe("1,200 spaces");
    });

    it("heads the browse by publisher, venue, category, query, in that order", () => {
        expect(browseHeading({ publisher: "Skyline", venue: "Malls", category: "INDOOR", q: "x" })).toBe("Skyline");
        expect(browseHeading({ venue: "Malls", category: "INDOOR" })).toBe("Malls");
        expect(browseHeading({ category: "TRANSIT", q: "bus" })).toBe("Transit");
        expect(browseHeading({ q: "bus" })).toBe("“bus”");
        expect(browseHeading({})).toBe("Ad spaces");
    });

    it("links a tile into Explore for the place", () => {
        expect(spacesHref({ category: "OUTDOOR" }, { city: "Pune" })).toBe("/spaces?city=Pune&category=OUTDOOR");
        expect(spacesHref({ category: "INDOOR", venueTypeId: "v1" }, { near: { latitude: 12.9, longitude: 77.5, radiusKm: 15 } })).toBe("/spaces?lat=12.9&lng=77.5&radius=15&category=INDOOR&venueTypeId=v1");
        expect(spacesHref({ display: "DIGITAL" })).toBe("/spaces?display=DIGITAL");
        expect(spacesHref()).toBe("/spaces");
    });
});

describe("recent searches", () => {
    it("puts the newest first, once, case-insensitively, capped at eight", () => {
        expect(rememberQuery([], "  mall ")).toEqual(["mall"]);
        expect(rememberQuery(["Mall", "metro"], "mall")).toEqual(["mall", "metro"]);
        expect(rememberQuery(["a"], "   ")).toEqual(["a"]);
        expect(rememberQuery(["1", "2", "3", "4", "5", "6", "7", "8"], "9")).toEqual(["9", "1", "2", "3", "4", "5", "6", "7"]);
        expect(forgetQuery(["Mall", "metro"], "MALL")).toEqual(["metro"]);
    });
});

describe("near me", () => {
    it("reads a point off the URL, defaulting the radius, refusing nonsense", () => {
        expect(nearOf("12.97", "77.59", "5")).toEqual({ latitude: 12.97, longitude: 77.59, radiusKm: 5 });
        expect(nearOf("12.97", "77.59", "")).toEqual({ latitude: 12.97, longitude: 77.59, radiusKm: 15 });
        expect(nearOf("12.97", "77.59", "500")).toEqual({ latitude: 12.97, longitude: 77.59, radiusKm: 15 });
        expect(nearOf("12.97", "", "5")).toBeNull();
        expect(nearOf("120", "77", "5")).toBeNull();
        expect(nearOf("abc", "77", "5")).toBeNull();
        expect(roundCoord(12.971598765)).toBe("12.9716");
    });

    it("says plainly what a blocked location means and what to do", () => {
        expect(locateMessage("denied")).toMatch(/blocking location/);
        expect(locateMessage("denied")).toMatch(/type a city/);
        expect(locateMessage("unsupported")).toMatch(/cannot share a location/);
    });
});

describe("cities", () => {
    it("builds the picker's query as geo-api.ts does", () => {
        expect(pickerSearch({ q: " pune ", stages: ["LAUNCHED", "SEEDING"], limit: 8 })).toBe("?stage=LAUNCHED%2CSEEDING&q=pune&limit=8");
        expect(pickerSearch({})).toBe("");
    });

    it("labels and tones the stage pill", () => {
        expect(stageLabel("LAUNCHED")).toBe("Live");
        expect(stageLabel("SEEDING")).toBe("Coming soon");
        expect(stageLabel("PLANNED")).toBe("Coming soon");
        expect(stageLabel("PAUSED")).toBe("Paused");
        expect(stageLabel("WITHDRAWN")).toBe("Closed");
        expect(stageTone("LAUNCHED")).toBe("success");
        expect(stageTone("SEEDING")).toBe("info");
    });

    it("words the coming-soon card by stage", () => {
        expect(comingSoonCopy("Pune", "SEEDING")).toEqual({ closed: false, title: "Coming soon in Pune", body: "Publishers in Pune are listing their spaces now. Booking opens when the city launches." });
        expect(comingSoonCopy("Pune", "PAUSED").closed).toBe(true);
        expect(comingSoonCopy("Pune", "PLANNED").body).toMatch(/not in Pune yet/);
    });

    it("turns CITY_NOT_OPEN into the app's line, and nothing else", () => {
        const closed = new ApiError(400, "CITY_NOT_OPEN", "City not open (SEEDING)", { function: "demand", city: "navi-mumbai", stage: "SEEDING" });
        expect(cityNotOpenMessage(closed)).toBe("ADX is not taking new bookings in Navi Mumbai right now.");
        expect(cityNotOpenMessage(closed, "Pune")).toBe("ADX is not taking new bookings in Pune right now.");
        expect(cityNotOpenMessage(new ApiError(400, "CITY_NOT_OPEN", "x", { function: "publishing" }))).toBe("ADX is not taking new listings right now.");
        expect(cityNotOpenMessage(new ApiError(400, "VALIDATION_ERROR", "x"))).toBeNull();
    });

    it("says what Notify me came to for each refusal", () => {
        expect(waitlistOutcome(new ApiError(409, "ALREADY_LIVE", "x"), "Pune")).toEqual({ tone: "ok", text: "Pune is live now — loading its spaces.", live: true });
        expect(waitlistOutcome(new ApiError(503, "FEATURE_OFF", "x"), "Pune").text).toMatch(/not taking names for Pune yet/);
        expect(waitlistOutcome(new ApiError(404, "NOT_FOUND", "x"), "Pune").tone).toBe("no");
        expect(waitlistOutcome(new Error("boom"), "Pune").text).toBe("Could not reach ADX.");
    });
});

describe("the public reads of 26 Sep 2026", () => {
    const fetched: { url: string; auth: string | null }[] = [];
    beforeEach(() => {
        fetched.length = 0;
        vi.stubGlobal(
            "fetch",
            vi.fn(async (url: string, init?: RequestInit) => {
                const headers = new Headers(init?.headers);
                fetched.push({ url: String(url), auth: headers.get("Authorization") });
                if (String(url).includes("/publishers/nobody/public")) return new Response(JSON.stringify({ success: false, error: { code: "NOT_FOUND", message: "Publisher not found" } }), { status: 404, headers: { "Content-Type": "application/json" } });
                const data = String(url).includes("/similar") ? [{ id: "lst_2", title: "Like it" }] : String(url).includes("/public") ? { id: "pub_1", name: "Sharma Media", avatarUrl: null, verified: true, liveListings: 7 } : { items: [], comingSoon: [] };
                return new Response(JSON.stringify({ success: true, data }), { status: 200, headers: { "Content-Type": "application/json" } });
            })
        );
    });
    afterEach(() => vi.unstubAllGlobals());

    it("similar spaces arrive as browse cards, read without a session", async () => {
        await expect(browseService.similar("lst 1")).resolves.toEqual([{ id: "lst_2", title: "Like it" }]);
        expect(fetched[0]!.url).toContain("/listings/lst%201/similar");
        expect(fetched[0]!.auth).toBeNull();
    });

    it("a publisher's public card, and null for none", async () => {
        await expect(browseService.publisher("pub_1")).resolves.toEqual({ id: "pub_1", name: "Sharma Media", avatarUrl: null, verified: true, liveListings: 7 });
        expect(fetched[0]!.url).toContain("/publishers/pub_1/public");
        expect(fetched[0]!.auth).toBeNull();
        await expect(browseService.publisher("nobody")).resolves.toBeNull();
    });
});

describe("the explore home's strip", () => {
    it("sums the month's scans, and says nothing for a read without a series", () => {
        expect(scansOf({ series: [{ scans: 3 }, { scans: "4" }, { scans: null }] })).toBe(7);
        expect(scansOf({})).toBeNull();
        expect(scansOf(null)).toBeNull();
    });
});

describe("the reads and writes", () => {
    const fetchMock = vi.fn();
    beforeEach(() => {
        fetchMock.mockReset();
        fetchMock.mockResolvedValue(new Response(JSON.stringify({ success: true, data: { items: [], total: 0 } }), { status: 200, headers: { "Content-Type": "application/json" } }));
        vi.stubGlobal("fetch", fetchMock);
    });
    afterEach(() => vi.unstubAllGlobals());

    const call = () => {
        const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
        return { url: url.replace(/^.*\/api\/v1/, ""), method: init.method, body: init.body ? JSON.parse(String(init.body)) : undefined };
    };

    it("asks the categories and venues for the place", async () => {
        await browseService.categories({ city: "Pune" });
        expect(call()).toMatchObject({ url: "/listings/browse/categories?city=Pune", method: "GET" });
        fetchMock.mockClear();
        await browseService.venues({ near: { latitude: 1, longitude: 2, radiusKm: 15 } });
        expect(call()).toMatchObject({ url: "/listings/browse/venues?lat=1&lng=2&radiusKm=15" });
    });

    it("reads the saved spaces for the advertiser, a page at a time", async () => {
        await browseService.saved("adv 1", 2, 20);
        expect(call()).toMatchObject({ url: "/advertisers/adv%201/saved?page=2&pageSize=20", method: "GET" });
    });

    it("asks to be told when a city opens, on the advertiser's side", async () => {
        await geoService.joinWaitlist("pune", "ADVERTISER", "  ");
        expect(call()).toEqual({ url: "/app/geo/waitlist", method: "POST", body: { citySlug: "pune", side: "ADVERTISER" } });
        fetchMock.mockClear();
        await geoService.resolve(" Bangalore ");
        expect(call()).toMatchObject({ url: "/app/geo/resolve?name=Bangalore" });
    });

    it("counts live campaigns and reads the month's portfolio as the app does", async () => {
        await browseService.liveCampaigns();
        expect(call().url).toBe("/campaigns?status=LIVE&pageSize=1");
        fetchMock.mockClear();
        await browseService.portfolio(26);
        expect(call().url).toBe("/campaigns/analytics?days=26");
    });
});

describe("the category strip, stacked two rows deep", () => {
    const cat = (category: "OUTDOOR" | "INDOOR" | "TRANSIT" | "MEDIA", count = 5) => ({ category, count, photoUrl: null });
    const venue = (id: string, category: "OUTDOOR" | "INDOOR" | "TRANSIT" | "MEDIA", count = 1) => ({ venueTypeId: id, slug: id, name: id, label: id, category, count, photoUrl: null });
    const keyOf = (p: MosaicPlacement) => (p.kind === "venue" ? p.tile.venueTypeId : p.kind === "category" ? p.tile.category : "ALL");

    it("stands All tall, puts each category wide over two of its own, then pairs the rest two to a column", () => {
        const { placements, columns } = stripMosaic(
            [cat("OUTDOOR"), cat("INDOOR"), cat("TRANSIT")],
            [venue("mall", "INDOOR"), venue("bus", "TRANSIT"), venue("hoarding", "OUTDOOR"), venue("office", "INDOOR"), venue("metro", "TRANSIT"), venue("gym", "INDOOR"), venue("auto", "TRANSIT", 0)]
        );
        const at = (key: string) => placements.find((p) => keyOf(p) === key);
        expect(at("ALL")).toMatchObject({ column: 1, row: "both" });
        expect(at("OUTDOOR")).toMatchObject({ column: 2, row: 1, span: 2 });
        expect(at("hoarding")).toMatchObject({ column: 2, row: 2 });
        expect(at("INDOOR")).toMatchObject({ column: 4, row: 1, span: 2 });
        expect(at("mall")).toMatchObject({ column: 4, row: 2 });
        expect(at("office")).toMatchObject({ column: 5, row: 2 });
        expect(at("TRANSIT")).toMatchObject({ column: 6, row: 1, span: 2 });
        expect(at("bus")).toMatchObject({ column: 6, row: 2 });
        expect(at("metro")).toMatchObject({ column: 7, row: 2 });
        expect(at("gym")).toMatchObject({ column: 8, row: 1 });
        expect(at("auto")).toMatchObject({ column: 8, row: 2 });
        expect(columns).toBe(8);
    });

    it("a category with no sub-category to show stands tall, and an odd leftover sits alone in its column", () => {
        const { placements } = stripMosaic([cat("MEDIA")], [venue("mall", "INDOOR")]);
        expect(placements.find((p) => p.kind === "category")).toMatchObject({ column: 2, row: "both", span: 1 });
        expect(placements.find((p) => p.kind === "venue")).toMatchObject({ column: 3, row: 1 });
    });
});

describe("similar listings (SIM-1)", () => {
    it("View all opens the same rule as the row, by display id when there is one", async () => {
        const { similarHref } = await import("./browse");
        expect(similarHref({ id: "cmu1", displayId: "LST-1709-2660" })).toBe("/spaces?similarTo=LST-1709-2660");
        expect(similarHref({ id: "cmu1", displayId: null })).toBe("/spaces?similarTo=cmu1");
    });
});
