import { describe, expect, it, vi, afterEach } from "vitest";
import { adsOf, defaultBlocks, layoutPath, parseLayout, pickAd, planBlocks, railPlan, railSeeAllHref, readLayoutServer, sideOf, targetHref, type Layout } from "./layouts";

const layout = (blocks: Layout["blocks"], over: Partial<Layout> = {}): Layout => ({ surface: "WEB_EXPLORE", version: 3, isDefault: false, blocks, ...over });
const types = (planned: ReturnType<typeof planBlocks>) => planned.map((block) => block.type);

describe("LM-1: the renderer's plan", () => {
    it("draws today's order when there is no layout, or the read failed", () => {
        expect(types(planBlocks("WEB_EXPLORE", null))).toEqual(["explore_search", "category_strip", "campaign_strip", "popular_rail", "results"]);
        expect(types(planBlocks("WEB_FORMATS", undefined))).toEqual(["formats_hero", "format_cards", "venue_tiles", "guides_strip"]);
        expect(types(planBlocks("WEB_HOME", null))).toEqual(["legacy_home"]);
        expect(types(planBlocks("WEB_LISTING", null))).toEqual(["publisher_listings", "ad_slot"]);
    });

    it("draws today's order for the default answer, but keeps the ads the default resolved into the sidebar", () => {
        const answer = layout(
            [
                { id: "a", type: "publisher_listings", props: {} },
                { id: "b", type: "ad_slot", props: { slotKey: "WEB_LISTING_SIDEBAR", ads: [{ adBookingId: "ad1" }] } },
            ],
            { surface: "WEB_LISTING", version: 0, isDefault: true }
        );
        const planned = planBlocks("WEB_LISTING", answer);
        expect(types(planned)).toEqual(["publisher_listings", "ad_slot"]);
        const slot = planned[1]!;
        expect(slot.kind === "content" && slot.props.ads).toEqual([{ adBookingId: "ad1" }]);
    });

    it("follows the published order, maps system blocks to the page's sections and content blocks to its components", () => {
        const planned = planBlocks(
            "WEB_EXPLORE",
            layout([
                { id: "1", type: "promo_banner", props: { headline: "Diwali" } },
                { id: "2", type: "popular_rail", props: { title: "Loved in Pune" } },
                { id: "3", type: "explore_search", props: {} },
                { id: "4", type: "results", props: {} },
                { id: "5", type: "listing_rail", props: {} },
            ])
        );
        expect(planned.map((b) => `${b.kind}:${b.type}`)).toEqual(["content:promo_banner", "system:popular_rail", "system:explore_search", "content:listing_rail", "system:results"]);
        expect(planned[1]).toMatchObject({ kind: "system", title: "Loved in Pune" });
    });

    it("skips unknown types, another surface's system blocks, and a section named twice", () => {
        const planned = planBlocks(
            "WEB_EXPLORE",
            layout([
                { id: "1", type: "hologram", props: {} },
                { id: "2", type: "greeting", props: {} },
                { id: "3", type: "legacy_home", props: {} },
                { id: "4", type: "category_strip", props: {} },
                { id: "5", type: "category_strip", props: {} },
            ])
        );
        expect(types(planned)).toEqual(["category_strip", "results"]);
    });

    it("keeps Explore's results last and always there", () => {
        expect(types(planBlocks("WEB_EXPLORE", layout([{ id: "r", type: "results", props: {} }, { id: "p", type: "popular_rail", props: {} }])))).toEqual(["popular_rail", "results"]);
        expect(types(planBlocks("WEB_EXPLORE", layout([])))).toEqual(["results"]);
        expect(types(planBlocks("WEB_FORMATS", layout([])))).toEqual([]);
    });

    it("the default blocks carry the sidebar's slot key", () => {
        expect(defaultBlocks("WEB_LISTING")[1]).toMatchObject({ type: "ad_slot", props: { slotKey: "WEB_LISTING_SIDEBAR" } });
    });
});

describe("LM-1: reading a layout", () => {
    afterEach(() => vi.unstubAllGlobals());

    it("asks for the side and the city", () => {
        expect(layoutPath("WEB_EXPLORE", { side: "ADVERTISER", city: " Pune " })).toBe("/app/layouts/WEB_EXPLORE?side=ADVERTISER&city=Pune");
        expect(layoutPath("WEB_HOME", { side: "VISITOR", city: "" })).toBe("/app/layouts/WEB_HOME?side=VISITOR");
    });

    it("maps the signed-in workspace to the contract's side", () => {
        expect(sideOf(false, "ADVERTISER")).toBe("VISITOR");
        expect(sideOf(true, null)).toBe("VISITOR");
        expect(sideOf(true, "PUBLISHER")).toBe("PUBLISHER");
        expect(sideOf(true, "PRINT_PARTNER")).toBe("PARTNER");
    });

    it("reads the answer strictly, envelope or not", () => {
        expect(parseLayout({ success: true, data: { surface: "WEB_HOME", version: 2, isDefault: false, blocks: [{ id: "x", type: "legacy_home", props: {} }, "junk"] } })).toEqual({
            surface: "WEB_HOME",
            version: 2,
            isDefault: false,
            blocks: [{ id: "x", type: "legacy_home", props: {} }],
        });
        expect(parseLayout({ nope: true })).toBeNull();
        expect(parseLayout(null)).toBeNull();
    });

    it("on the server: a visitor's read, cached a minute, and null — never a throw — when ADX does not answer", async () => {
        const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true, data: { surface: "WEB_FORMATS", version: 1, isDefault: false, blocks: [] } }) });
        vi.stubGlobal("fetch", fetchMock);
        await expect(readLayoutServer("WEB_FORMATS", {}, "http://api.test")).resolves.toMatchObject({ version: 1 });
        expect(fetchMock).toHaveBeenCalledWith("http://api.test/app/layouts/WEB_FORMATS?side=VISITOR", expect.objectContaining({ next: { revalidate: 60 } }));
        vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("down")));
        await expect(readLayoutServer("WEB_FORMATS", {}, "http://api.test")).resolves.toBeNull();
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
        await expect(readLayoutServer("WEB_FORMATS", {}, "http://api.test")).resolves.toBeNull();
    });
});

describe("LM-1: targets", () => {
    it("maps each kind to the site's own routes", () => {
        expect(targetHref({ kind: "ROUTE", value: "/spaces?city=Pune" })).toEqual({ href: "/spaces?city=Pune", external: false });
        expect(targetHref({ kind: "LISTING", value: "LST-1109-2601" })).toEqual({ href: "/spaces/LST-1109-2601", external: false });
        expect(targetHref({ kind: "CATEGORY", value: "OUTDOOR" })?.href).toBe("/spaces?category=OUTDOOR");
        expect(targetHref({ kind: "VENUE", value: "v1" })?.href).toBe("/spaces?venueTypeId=v1");
        expect(targetHref({ kind: "CONTENT", value: "diwali-offers" })?.href).toBe("/diwali-offers");
        expect(targetHref({ kind: "NEW_CAMPAIGN" })?.href).toBe("/advertiser/campaigns/new");
        expect(targetHref({ kind: "EXPLORE", value: "?city=Pune" })?.href).toBe("/spaces?city=Pune");
        expect(targetHref({ kind: "URL", value: "https://example.com/x" })).toEqual({ href: "https://example.com/x", external: true });
    });

    it("refuses anything that leaves the site unsafely", () => {
        expect(targetHref({ kind: "ROUTE", value: "//evil.example" })).toBeNull();
        expect(targetHref({ kind: "ROUTE", value: "javascript:alert(1)" })).toBeNull();
        expect(targetHref({ kind: "URL", value: "javascript:alert(1)" })).toBeNull();
        expect(targetHref({ kind: "CONTENT", value: "../admin" })).toBeNull();
        expect(targetHref(null)).toBeNull();
    });
});

describe("LM-1: ad rotation", () => {
    const ads = [{ adBookingId: "c" }, { adBookingId: "a" }, { adBookingId: "b" }];

    it("shows one ad at a time and the next one on the next page view, whatever order the server shuffled", () => {
        expect([1, 2, 3, 4].map((view) => pickAd(ads, view)?.adBookingId)).toEqual(["b", "c", "a", "b"]);
        const shuffled = [{ adBookingId: "b" }, { adBookingId: "c" }, { adBookingId: "a" }];
        expect([1, 2, 3].map((view) => pickAd(shuffled, view)?.adBookingId)).toEqual(["b", "c", "a"]);
    });

    it("an empty slot shows nothing", () => {
        expect(pickAd([], 5)).toBeNull();
    });

    it("keeps only ads with a picture and an id, and only http(s) links", () => {
        const read = adsOf([
            { adBookingId: "a1", media: { url: "https://cdn/x.jpg", width: 600, height: 750, altText: "Sale" }, targetUrl: "https://shop.example", headline: "Sale" },
            { adBookingId: "a2", media: { url: "https://cdn/y.jpg" }, targetUrl: "javascript:alert(1)" },
            { adBookingId: "a3", media: null },
            "junk",
        ]);
        expect(read.map((ad) => ad.adBookingId)).toEqual(["a1", "a2"]);
        expect(read[0]!.targetUrl).toBe("https://shop.example");
        expect(read[1]!.targetUrl).toBeNull();
    });
});

describe("LM-1: listing_rail", () => {
    it("turns the resolved query into a browse read, 1–12 cards", () => {
        const plan = railPlan({ source: "CATEGORY", count: 6, query: { sort: "RATING", category: "OUTDOOR", pageSize: 40 } });
        expect(plan).toEqual({ query: { pageSize: 12, sort: "RATING", category: "OUTDOOR" }, ids: [], wantsPlace: false });
        expect(railSeeAllHref(plan)).toBe("/spaces?category=OUTDOOR&sort=RATING");
    });

    it("reads a curated rail by id, and a near-you rail in the page's city when the server had no point", () => {
        expect(railPlan({ source: "CURATED", query: { ids: ["l1", "l2"], pageSize: 6 } })).toEqual({ query: null, ids: ["l1", "l2"], wantsPlace: false });
        expect(railPlan({ source: "NEAR_YOU", query: { near: true, pageSize: 4 } }, { city: "Pune" })).toEqual({ query: { pageSize: 4, city: "Pune" }, ids: [], wantsPlace: true });
        expect(railPlan({ source: "NEAR_YOU", query: { near: { latitude: 12.9, longitude: 77.6, radiusKm: 10 }, pageSize: 4 } }).query?.near).toEqual({ latitude: 12.9, longitude: 77.6, radiusKm: 10 });
    });
});
