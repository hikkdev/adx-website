import { describe, expect, it } from "vitest";
import { adFormProblems, adHref, patchOf, slotSpec, adStatusLine, citiesLabel, draftProblems, editHref, isHttpUrl, prettySlug, previewOf, quoteFor, rowStats, showsStats, surfacesLabel, type AdFormState } from "./ad-helpers";

const slot = { key: "LISTING_SIDEBAR", ratePerDay: "1500.00", minDays: 3 };
const form = (over: Partial<AdFormState> = {}): AdFormState => ({
    slotKey: "LISTING_SIDEBAR",
    from: "2026-10-11",
    to: "2026-10-17",
    title: "Diwali sale",
    headline: "",
    ctaLabel: "",
    targetUrl: "https://example.com/offer",
    hasArtwork: true,
    artworkProblems: [],
    ...over,
});

describe("where a slot shows", () => {
    it("puts a sidebar ad in the listing page's sidebar, a banner across the page, a tile in the grid", () => {
        expect(previewOf({ surfaces: ["WEB_LISTING"], spec: "AD_SIDEBAR" })).toEqual({ page: "LISTING", position: "SIDEBAR" });
        expect(previewOf({ surfaces: ["WEB_EXPLORE"], spec: "AD_BANNER" })).toEqual({ page: "WEB", position: "BANNER" });
        expect(previewOf({ surfaces: ["APP_ADVERTISER_HOME"], spec: "TILE" })).toEqual({ page: "APP", position: "TILE" });
        // A sidebar exists only on the listing page.
        expect(previewOf({ surfaces: ["WEB_HOME"], spec: "AD_SIDEBAR" })).toEqual({ page: "WEB", position: "TILE" });
    });

    it("names the surfaces in words", () => {
        expect(surfacesLabel(["WEB_LISTING"])).toBe("Website listing pages");
        expect(surfacesLabel(["WEB_LISTING", "WEB_EXPLORE", "APP_ADVERTISER_HOME"])).toBe("Website listing pages, Website Explore page and Advertiser app home");
        expect(surfacesLabel([])).toBe("Where ADX places it");
    });
});

describe("the form", () => {
    it("takes only an absolute http(s) link", () => {
        expect(isHttpUrl("https://example.com")).toBe(true);
        expect(isHttpUrl("http://shop.example.in/x?y=1")).toBe(true);
        expect(isHttpUrl("example.com")).toBe(false);
        expect(isHttpUrl("https://")).toBe(false);
        expect(isHttpUrl("javascript:alert(1)")).toBe(false);
        expect(isHttpUrl("ftp://example.com")).toBe(false);
    });

    it("is ready with a slot, a long enough run, a name, a link and fitting artwork", () => {
        expect(adFormProblems(form(), slot)).toEqual([]);
        expect(adFormProblems(form({ to: "2026-10-12" }), slot)).toContain("This slot is sold for at least 3 days.");
        expect(adFormProblems(form({ from: "", to: "" }), slot)).toContain("Pick the first and the last day.");
        expect(adFormProblems(form({ targetUrl: "https://" }), slot)).toContain("Add the link a tap opens — a full address starting https://.");
        expect(adFormProblems(form({ hasArtwork: false }), slot)).toContain("Add the artwork.");
        expect(adFormProblems(form({ artworkProblems: ["too small"] }), slot)).toContain("The artwork does not fit the slot yet.");
        expect(adFormProblems(form(), slot, ["2026-10-12"])).toContain("Some of your days are full — pick a run around them.");
        expect(adFormProblems(form(), null)).toContain("Choose where the ad shows.");
    });

    it("saves a draft without the artwork", () => {
        expect(draftProblems(form({ hasArtwork: false }), slot)).toEqual([]);
        expect(draftProblems(form({ title: " " }), slot)).toEqual(["Give the ad a name (only you and ADX see it)."]);
    });
});

describe("the quote", () => {
    it("works out days × rate + 18% GST before a draft exists", () => {
        expect(quoteFor(slot, "2026-10-11", "2026-10-17", null)).toEqual({ days: 7, ratePerDay: "1500.00", subtotal: "10500.00", gstAmount: "1890.00", total: "12390.00", fromServer: false });
        expect(quoteFor(null, "2026-10-11", "2026-10-17", null)).toBeNull();
        expect(quoteFor(slot, "", "", null)).toBeNull();
    });

    it("prefers the server's figures once the draft matches the slot and the run", () => {
        const draft = { startDate: "2026-10-11T00:00:00.000Z", endDate: "2026-10-17T00:00:00.000Z", days: 7, ratePerDay: "1500.00", subtotal: "10500.00", gstAmount: "1890.00", total: "12390.00", slot: { key: "LISTING_SIDEBAR", label: "Sidebar" } };
        expect(quoteFor(slot, "2026-10-11", "2026-10-17", { ...draft, total: "12000.00" })?.fromServer).toBe(true);
        expect(quoteFor(slot, "2026-10-11", "2026-10-17", { ...draft, total: "12000.00" })?.total).toBe("12000.00");
        // A different run: the browser's arithmetic again, until it is saved.
        expect(quoteFor(slot, "2026-10-11", "2026-10-13", draft)).toMatchObject({ days: 3, total: "5310.00", fromServer: false });
    });
});

describe("the status line", () => {
    const base = { startDate: "2026-10-11T00:00:00.000Z", endDate: "2026-10-17T00:00:00.000Z", reviewNote: null, cancelReason: null, refundedAt: null };
    it("says what happens next in every state", () => {
        expect(adStatusLine({ ...base, status: "PENDING_PAYMENT" }).line).toContain("60 minutes");
        expect(adStatusLine({ ...base, status: "PENDING_REVIEW" }).line).toContain("usually within a working day");
        expect(adStatusLine({ ...base, status: "SCHEDULED" }).line).toContain("starts on 11 Oct 2026");
        expect(adStatusLine({ ...base, status: "REJECTED", reviewNote: "The text is too small to read.", refundedAt: "2026-10-09T10:00:00.000Z" }).line).toBe(
            "ADX's reason: The text is too small to read. The full amount went back to your wallet on 9 Oct 2026. Edit it and submit it again."
        );
        expect(adStatusLine({ ...base, status: "CANCELLED", cancelReason: "Offer ended" }).line).toBe("Cancelled: Offer ended");
    });

    it("shows figures only once an ad is on its way to running", () => {
        expect(showsStats("DRAFT")).toBe(false);
        expect(showsStats("PENDING_REVIEW")).toBe(false);
        expect(showsStats("LIVE")).toBe(true);
        expect(showsStats("ENDED")).toBe(true);
    });
});

describe("small pieces", () => {
    it("names cities, and says Everywhere for none", () => {
        expect(citiesLabel([])).toBe("Everywhere");
        expect(citiesLabel(["navi-mumbai", "c1"], { c1: "Pune" })).toBe("Navi Mumbai, Pune");
        expect(prettySlug("clx9k2abc0000")).toBe("clx9k2abc0000");
    });

    it("reads a row's stats only when the list carries them", () => {
        expect(rowStats({ stats: null })).toBeNull();
        expect(rowStats({ stats: { impressions: 1200, clicks: 30, ctr: 0.025, byDay: [] } })).toMatchObject({ impressions: 1200, clicks: 30 });
    });

    it("builds the addresses", () => {
        expect(adHref("a 1")).toBe("/advertiser/promotions/a%201");
        expect(adHref("a1", "p1")).toBe("/advertiser/promotions/a1?payment=p1");
        expect(editHref("a1")).toBe("/advertiser/promotions/new?edit=a1");
    });
});

describe("the update", () => {
    it("names no slot and clears emptied words with null", () => {
        expect(patchOf({ slotKey: "LISTING_SIDEBAR", title: "Sale", targetUrl: "https://example.com", startDate: "2026-10-11", endDate: "2026-10-13" })).toEqual({
            title: "Sale",
            targetUrl: "https://example.com",
            cityIds: [],
            startDate: "2026-10-11",
            endDate: "2026-10-13",
            headline: null,
            ctaLabel: null,
        });
    });
});

describe("the artwork size", () => {
    it("takes the slot's own spec detail over the library's", () => {
        const spec = slotSpec({ spec: "PROMO_WIDE", specDetail: { key: "PROMO_WIDE", label: "Wide promo", width: 1600, height: 480, minWidth: 1600, minHeight: 480, maxBytes: 3145728, formats: ["image/png"] } }, null);
        expect(spec).toMatchObject({ width: 1600, minWidth: 1600, maxBytes: 3145728, formats: ["image/png"] });
        expect(slotSpec({ spec: "AD_SIDEBAR" }, null)).toMatchObject({ width: 600, height: 750 });
        expect(slotSpec({ spec: "NOPE", specDetail: { width: 0 } }, null)).toBeNull();
    });
});
