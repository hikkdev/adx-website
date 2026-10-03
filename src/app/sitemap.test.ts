import { describe, expect, it, vi } from "vitest";
import robots, { ROBOTS_DISALLOW } from "./robots";
import sitemap from "./sitemap";

vi.mock("@/lib/site-docs", () => ({ listDocSlugs: () => ["contact", "privacy", "refund", "terms"] }));
vi.mock("@/services/pages", async (importOriginal) => {
    const original = await importOriginal<typeof import("@/services/pages")>();
    return { ...original, readSitemapServer: vi.fn().mockResolvedValue([{ path: "/", updatedAt: null }, { path: "/help", updatedAt: "2026-09-27T00:00:00.000Z" }, { path: "/diwali", updatedAt: null }]) };
});

describe("PB-5: sitemap.xml and robots.txt", () => {
    it("lists ADX's live pages, the static documents and the policies index under the site's address", async () => {
        const entries = await sitemap();
        const paths = entries.map((entry) => new URL(entry.url).pathname);
        expect(paths).toEqual(["/", "/help", "/diwali", "/contact", "/privacy", "/refund", "/terms", "/legal"]);
        expect(entries.every((entry) => entry.url.startsWith("http"))).toBe(true);
    });

    it("allows everything but Studio, the /pg routes, the workspaces, the cart and the doors, and names the sitemap", () => {
        const answer = robots();
        const rule = Array.isArray(answer.rules) ? answer.rules[0]! : answer.rules;
        expect(rule.allow).toBe("/");
        expect(rule.disallow).toEqual(ROBOTS_DISALLOW);
        expect(ROBOTS_DISALLOW).toEqual(expect.arrayContaining(["/studio", "/pg", "/advertiser", "/publisher", "/partner", "/cart", "/sign", "/verify", "/account"]));
        expect(answer.sitemap).toMatch(/\/sitemap\.xml$/);
    });
});
