import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fillPattern, matchPattern, pageHref, parseSiteRoutes, readSiteRoutes, rememberSiteRoutes, resetSiteRoutesCache, resolveRequest, SEEDED_PAGES, shouldSkip, type SiteRoutesTable } from "./site-routes";

const table = (over: Partial<SiteRoutesTable> = {}): SiteRoutesTable => ({
    version: "abc",
    pages: [
        ...SEEDED_PAGES.filter((page) => page.key !== "help" && page.key !== "listing"),
        /* Help moved to /support; the listing page moved to /ads/:id; a custom page at /diwali and one at /spaces/deals. */
        { key: "help", kind: "SYSTEM", title: "Help centre", path: "/support", internalPath: "/help", channels: ["WEBSITE"] },
        { key: "listing", kind: "SYSTEM", title: "Ad space", path: "/ads/:id", internalPath: "/spaces/:id", channels: ["WEBSITE"] },
        { key: "diwali", kind: "CUSTOM", title: "Diwali offers", path: "/diwali", internalPath: null, channels: ["WEBSITE", "APPS"] },
        { key: "deals", kind: "CUSTOM", title: "Deals", path: "/spaces/deals", internalPath: null, channels: ["WEBSITE"] },
    ],
    redirects: [
        { fromPath: "/offers", toPath: "/diwali", permanent: true },
        { fromPath: "/old-spaces/:id", toPath: "/ads/:id", permanent: false },
        { fromPath: "/blog", toPath: "https://blog.adx.in/", permanent: true },
    ],
    ...over,
});

describe("PB-1: patterns", () => {
    it("matches literal and :param segments, never a different length", () => {
        expect(matchPattern("/spaces/:id", "/spaces/LST-1")).toEqual({ id: "LST-1" });
        expect(matchPattern("/spaces/:id", "/spaces/LST-1/")).toEqual({ id: "LST-1" });
        expect(matchPattern("/spaces/:id", "/spaces")).toBeNull();
        expect(matchPattern("/spaces/:id", "/spaces/a/b")).toBeNull();
        expect(matchPattern("/help", "/help")).toEqual({});
        expect(matchPattern("/help", "/Help")).toBeNull();
        expect(matchPattern("/", "/")).toEqual({});
    });

    it("fills a pattern and leaves an unfilled param as it is", () => {
        expect(fillPattern("/ads/:id", { id: "LST-9" })).toBe("/ads/LST-9");
        expect(fillPattern("/ads/:id")).toBe("/ads/:id");
        expect(fillPattern("/")).toBe("/");
    });
});

describe("PB-1: the matcher", () => {
    it("leaves the API, Next's files, Studio, previews and files alone", () => {
        for (const path of ["/api/v1/x", "/_next/static/a.js", "/studio", "/studio/pages/x", "/preview", "/favicon.ico", "/design/hero.png", "/sitemap.xml", "/robots.txt"]) {
            expect(shouldSkip(path), path).toBe(true);
            expect(resolveRequest(table(), path)).toEqual({ kind: "pass" });
        }
        expect(shouldSkip("/help")).toBe(false);
        expect(shouldSkip("/spaces/LST-1.2")).toBe(true);
    });

    it("passes everything through with no table", () => {
        expect(resolveRequest(null, "/diwali")).toEqual({ kind: "pass" });
    });

    it("(1) sends a redirect's source on, carrying a param, to a path or an https URL", () => {
        expect(resolveRequest(table(), "/offers")).toEqual({ kind: "redirect", to: "/diwali", permanent: true });
        expect(resolveRequest(table(), "/old-spaces/LST-4")).toEqual({ kind: "redirect", to: "/ads/LST-4", permanent: false });
        expect(resolveRequest(table(), "/blog")).toEqual({ kind: "redirect", to: "https://blog.adx.in/", permanent: true });
    });

    it("(2) rewrites a custom page's address to its /pg route — a literal address before a :param one", () => {
        expect(resolveRequest(table(), "/diwali")).toEqual({ kind: "rewrite", to: "/pg/diwali" });
        expect(resolveRequest(table(), "/diwali/")).toEqual({ kind: "rewrite", to: "/pg/diwali" });
        expect(resolveRequest(table(), "/spaces/deals")).toEqual({ kind: "rewrite", to: "/pg/deals" });
    });

    it("(3) rewrites a moved system page's address to the route the code serves, param carried", () => {
        expect(resolveRequest(table(), "/support")).toEqual({ kind: "rewrite", to: "/help" });
        expect(resolveRequest(table(), "/ads/LST-7")).toEqual({ kind: "rewrite", to: "/spaces/LST-7" });
    });

    it("(4) sends a request at the old route of a moved system page to its public address", () => {
        expect(resolveRequest(table(), "/help")).toEqual({ kind: "redirect", to: "/support", permanent: true });
        expect(resolveRequest(table(), "/spaces/LST-7")).toEqual({ kind: "redirect", to: "/ads/LST-7", permanent: true });
    });

    it("a system page that has not moved passes through", () => {
        expect(resolveRequest(table(), "/formats")).toEqual({ kind: "pass" });
        expect(resolveRequest(table(), "/")).toEqual({ kind: "pass" });
        expect(resolveRequest(table(), "/spaces")).toEqual({ kind: "pass" });
    });

    it("(5) sends /pg/<key> hit directly to the page's address — but not a preview frame, and not an unknown key", () => {
        expect(resolveRequest(table(), "/pg/diwali")).toEqual({ kind: "redirect", to: "/diwali", permanent: true });
        expect(resolveRequest(table(), "/pg/diwali", { preview: true })).toEqual({ kind: "pass" });
        expect(resolveRequest(table(), "/pg/unpublished")).toEqual({ kind: "pass" });
        expect(resolveRequest(table(), "/pg/help")).toEqual({ kind: "pass" });
    });

    it("an address that is nothing to the table passes through", () => {
        expect(resolveRequest(table(), "/contact")).toEqual({ kind: "pass" });
        expect(resolveRequest(table(), "/advertiser/campaigns")).toEqual({ kind: "pass" });
    });
});

describe("PB-1: links", () => {
    afterEach(() => rememberSiteRoutes(null));

    it("falls back to the seeded address, then to the /pg route, and fills params", () => {
        expect(pageHref("help")).toBe("/help");
        expect(pageHref("listing", { id: "LST-1" })).toBe("/spaces/LST-1");
        expect(pageHref("home")).toBe("/");
        expect(pageHref("diwali")).toBe("/pg/diwali");
        expect(pageHref("formats", {}, { hash: "outdoor" })).toBe("/formats#outdoor");
        expect(pageHref("explore", {}, { search: "category=OUTDOOR" })).toBe("/spaces?category=OUTDOOR");
    });

    it("follows the remembered table, and an explicit one", () => {
        rememberSiteRoutes(table());
        expect(pageHref("help")).toBe("/support");
        expect(pageHref("listing", { id: "LST-1" })).toBe("/ads/LST-1");
        expect(pageHref("diwali")).toBe("/diwali");
        expect(pageHref("help", {}, { table: null })).toBe("/support");
        expect(pageHref("help", {}, { table: { version: "x", pages: [], redirects: [] } })).toBe("/help");
    });
});

describe("PB-1: reading the table", () => {
    beforeEach(() => resetSiteRoutesCache());
    afterEach(() => vi.unstubAllGlobals());

    it("parses the answer strictly, envelope or not", () => {
        const parsed = parseSiteRoutes({
            success: true,
            data: {
                version: "v1",
                pages: [
                    { key: "help", kind: "SYSTEM", title: "Help", path: "/help", internalPath: "/help", channels: ["WEBSITE"] },
                    { key: "x", kind: "CUSTOM", title: "X", path: "/x", internalPath: null, channels: [] },
                    { key: "bad", path: "no-slash" },
                    "junk",
                ],
                redirects: [{ fromPath: "/a", toPath: "/b" }, { fromPath: "/c", toPath: "javascript:alert(1)" }, { fromPath: "/d", toPath: "https://x.example/", permanent: false }],
            },
        });
        expect(parsed).toEqual({
            version: "v1",
            pages: [
                { key: "help", kind: "SYSTEM", title: "Help", path: "/help", internalPath: "/help", channels: ["WEBSITE"] },
                { key: "x", kind: "CUSTOM", title: "X", path: "/x", internalPath: null, channels: ["WEBSITE"] },
            ],
            redirects: [
                { fromPath: "/a", toPath: "/b", permanent: true },
                { fromPath: "/d", toPath: "https://x.example/", permanent: false },
            ],
        });
        expect(parseSiteRoutes({ nope: true })).toBeNull();
        expect(parseSiteRoutes(null)).toBeNull();
    });

    it("asks ADX with revalidate, keeps the answer a minute, and keeps the last good one when ADX stops answering", async () => {
        const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true, data: { version: "v1", pages: [{ key: "help", kind: "SYSTEM", title: "Help", path: "/support", internalPath: "/help", channels: ["WEBSITE"] }], redirects: [] } }) });
        vi.stubGlobal("fetch", fetchMock);
        const first = await readSiteRoutes("http://api.test", 1000);
        expect(first?.pages[0]?.path).toBe("/support");
        expect(fetchMock).toHaveBeenCalledWith("http://api.test/app/site/routes", expect.objectContaining({ next: { revalidate: 60 } }));
        await readSiteRoutes("http://api.test", 30_000);
        expect(fetchMock).toHaveBeenCalledTimes(1);
        vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("down")));
        expect((await readSiteRoutes("http://api.test", 120_000))?.version).toBe("v1");
    });

    it("answers null — never throws — when ADX never answered", async () => {
        vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("down")));
        await expect(readSiteRoutes("http://api.test")).resolves.toBeNull();
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
        await expect(readSiteRoutes("http://api.test")).resolves.toBeNull();
    });
});
