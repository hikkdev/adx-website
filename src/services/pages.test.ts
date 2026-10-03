import { afterEach, describe, expect, it, vi } from "vitest";
import { pagePath, parsePage, readPageServer, readSitemapServer, SEEDED_SITEMAP, sitemapEntries } from "./pages";

describe("PB-4: reading a Studio page", () => {
    afterEach(() => vi.unstubAllGlobals());

    it("reads the answer strictly, with its SEO settings", () => {
        const page = parsePage({
            success: true,
            data: { key: "diwali", title: "Diwali offers", path: "/diwali", channels: ["WEBSITE", "APPS", "MAIL"], version: 2, isDefault: false, preview: true, meta: { seoTitle: "Diwali on ADX", noindex: true }, blocks: [{ id: "h", type: "hero", props: { headline: "Hi" } }, "junk"] },
        });
        expect(page).toEqual({
            key: "diwali",
            title: "Diwali offers",
            path: "/diwali",
            channels: ["WEBSITE", "APPS"],
            version: 2,
            isDefault: false,
            preview: true,
            meta: { seoTitle: "Diwali on ADX", seoDescription: null, seoImage: null, noindex: true },
            blocks: [{ id: "h", type: "hero", props: { headline: "Hi" } }],
        });
        expect(parsePage({ key: "x" })).toBeNull();
        expect(pagePath("my page", { side: "ADVERTISER", city: "Pune", preview: "tok" })).toBe("/app/pages/my%20page?side=ADVERTISER&city=Pune&preview=tok");
    });

    it("on the server: a page, missing (404), or unreachable — never a throw; a preview is never kept", async () => {
        const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ success: true, data: { key: "diwali", blocks: [] } }) });
        vi.stubGlobal("fetch", fetchMock);
        await expect(readPageServer("diwali", {}, "http://api.test")).resolves.toMatchObject({ kind: "page", page: { key: "diwali" } });
        expect(fetchMock).toHaveBeenCalledWith("http://api.test/app/pages/diwali?side=VISITOR", expect.objectContaining({ next: { revalidate: 60 } }));
        await readPageServer("diwali", { preview: "tok" }, "http://api.test");
        expect(fetchMock).toHaveBeenLastCalledWith("http://api.test/app/pages/diwali?side=VISITOR&preview=tok", expect.objectContaining({ cache: "no-store" }));
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 404 }));
        await expect(readPageServer("gone", {}, "http://api.test")).resolves.toEqual({ kind: "missing" });
        vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("down")));
        await expect(readPageServer("diwali", {}, "http://api.test")).resolves.toEqual({ kind: "unreachable" });
    });
});

describe("PB-5: the sitemap", () => {
    afterEach(() => vi.unstubAllGlobals());

    it("names ADX's pages, the home page first, then the documents and the policies index — each once", () => {
        const entries = sitemapEntries("https://adx.in/", [{ path: "/help", updatedAt: "2026-09-27T10:00:00.000Z" }, { path: "/", updatedAt: "2026-09-20T00:00:00.000Z" }, { path: "/diwali", updatedAt: null }, { path: "/contact", updatedAt: null }], ["contact", "privacy"]);
        expect(entries.map((entry) => entry.url)).toEqual(["https://adx.in/", "https://adx.in/help", "https://adx.in/diwali", "https://adx.in/contact", "https://adx.in/privacy", "https://adx.in/legal"]);
        expect(entries[0]).toMatchObject({ priority: 1, changeFrequency: "daily", lastModified: new Date("2026-09-20T00:00:00.000Z") });
        expect(entries[1]).toMatchObject({ priority: 0.8, lastModified: new Date("2026-09-27T10:00:00.000Z") });
        expect(entries[2]).not.toHaveProperty("lastModified");
    });

    it("falls back to the seeded system pages — none with a :param — when ADX did not answer", () => {
        const entries = sitemapEntries("https://adx.in", null, []);
        expect(entries.map((entry) => entry.url)).toEqual(["https://adx.in/", "https://adx.in/spaces", "https://adx.in/categories", "https://adx.in/formats", "https://adx.in/how-it-works", "https://adx.in/advertise", "https://adx.in/publishers", "https://adx.in/help", "https://adx.in/legal"]);
        expect(SEEDED_SITEMAP.some((row) => row.path.includes(":"))).toBe(false);
    });

    it("reads ADX's sitemap rows strictly, and null when it does not answer", async () => {
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true, data: [{ path: "/help", updatedAt: "2026-09-27T10:00:00.000Z" }, { path: "/spaces/:id" }, { path: "nope" }, "junk"] }) }));
        await expect(readSitemapServer("http://api.test")).resolves.toEqual([{ path: "/help", updatedAt: "2026-09-27T10:00:00.000Z" }]);
        vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("down")));
        await expect(readSitemapServer("http://api.test")).resolves.toBeNull();
    });
});
