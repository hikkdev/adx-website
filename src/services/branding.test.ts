import { afterEach, describe, expect, it, vi } from "vitest";
import { cssVariablesBlock, hexToTriplet, readSiteBrand, SITE_BRAND, siteBrandOf, tintTriplet, type Brand } from "./branding";

const brand = (over: Partial<Brand> = {}): Brand => ({
    platformName: "ADX",
    tagline: "Space that gets seen.",
    primaryColor: "#E40209",
    deepColor: "#BD2020",
    inkColor: "#0F0F0F",
    groundColor: "#F5F5F5",
    wordmarkUrl: "http://localhost:3000/brand/adx-wordmark-red.svg",
    wordmarkInverseUrl: "http://localhost:3000/brand/adx-wordmark-white.svg",
    markUrl: "http://localhost:3000/brand/adx-mark-red.svg",
    markInverseUrl: "http://localhost:3000/brand/adx-mark-white.svg",
    iconUrl: "http://localhost:3000/brand/adx-icon-tile.svg",
    website: { title: "ADX — Space that gets seen.", description: "Real-world ad space, booked like a room.", faviconUrl: "http://localhost:3000/brand/adx-icon-tile.svg", ogImageUrl: null },
    defaults: ["primaryColor", "deepColor", "wordmarkUrl", "wordmarkInverseUrl", "markUrl", "website.faviconUrl"],
    version: "ad8e577a",
    ...over,
});

afterEach(() => {
    vi.unstubAllGlobals();
});

describe("colours", () => {
    it("turns a hex colour into the triplet Tailwind's rgb() takes, and nothing else", () => {
        expect(hexToTriplet("#BD2020")).toBe("189 32 32");
        expect(hexToTriplet("#fff")).toBe("255 255 255");
        expect(hexToTriplet("red")).toBeNull();
        expect(hexToTriplet("#12345")).toBeNull();
        expect(hexToTriplet("#123456;}body{display:none")).toBeNull();
        expect(hexToTriplet(undefined)).toBeNull();
    });

    it("tints toward white", () => {
        expect(tintTriplet("#000000", 0)).toBe("255 255 255");
        expect(tintTriplet("#000000", 1)).toBe("0 0 0");
        expect(tintTriplet("#E40209", 0.1)).toBe("252 230 230");
        expect(tintTriplet("nope", 0.1)).toBeNull();
    });
});

describe("the website's brand from the read", () => {
    it("keeps DR 12's own reds, wordmark and favicon while ops changed nothing, and takes the site's words", () => {
        const site = siteBrandOf(brand());
        expect(site.cssVariables).toEqual({});
        expect(site.wordmarkUrl).toBe(SITE_BRAND.wordmarkUrl);
        expect(site.faviconUrl).toBe(SITE_BRAND.faviconUrl);
        expect(site.title).toBe("ADX — Space that gets seen.");
        expect(site.description).toBe("Real-world ad space, booked like a room.");
        expect(site.ogImageUrl).toBeNull();
    });

    it("moves only what ops retuned", () => {
        const site = siteBrandOf(brand({ primaryColor: "#0055FF", defaults: ["deepColor"], wordmarkUrl: "https://cdn.example/w.svg", website: { title: " ", ogImageUrl: "https://cdn.example/og.png", faviconUrl: "javascript:alert(1)" } }));
        expect(site.cssVariables).toEqual({ "--brand-bright-rgb": "0 85 255", "--brand-soft-rgb": "230 238 255" });
        expect(site.wordmarkUrl).toBe("https://cdn.example/w.svg");
        expect(site.title).toBe(SITE_BRAND.title);
        expect(site.ogImageUrl).toBe("https://cdn.example/og.png");
        expect(site.faviconUrl).toBe(SITE_BRAND.faviconUrl);
    });

    it("is the site's own brand when the read has nothing", () => {
        expect(siteBrandOf(null)).toBe(SITE_BRAND);
    });

    it("writes only well-formed variables into the stylesheet", () => {
        expect(cssVariablesBlock({})).toBe("");
        expect(cssVariablesBlock({ "--brand-rgb": "189 32 32" })).toBe(":root{--brand-rgb:189 32 32}");
        expect(cssVariablesBlock({ "--brand-rgb": "1 2 3}body{x:y", "--x;": "1 2 3" })).toBe("");
    });
});

describe("the server's read", () => {
    it("reads /app/branding with a cache life, and unwraps the envelope", async () => {
        const fetchMock = vi.fn(async () => new Response(JSON.stringify({ success: true, data: brand({ deepColor: "#112233", defaults: [] }) }), { status: 200 }));
        vi.stubGlobal("fetch", fetchMock);
        const site = await readSiteBrand("http://api.test/api/v1");
        expect(fetchMock).toHaveBeenCalledWith("http://api.test/api/v1/app/branding", expect.objectContaining({ next: { revalidate: 300 } }));
        expect(site.cssVariables["--brand-rgb"]).toBe("17 34 51");
    });

    it("never throws: a failure or a refusal is the site's own brand", async () => {
        vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new Error("offline"))));
        expect(await readSiteBrand("http://api.test")).toBe(SITE_BRAND);
        vi.stubGlobal("fetch", vi.fn(async () => new Response("no", { status: 503 })));
        expect(await readSiteBrand("http://api.test")).toBe(SITE_BRAND);
    });
});
