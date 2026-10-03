import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { checkFeatures, itemsUnder } from "../../scripts/check-features.mjs";

/**
 * `scripts/check-features.mjs` — the website's manifest check (Lot G, the
 * website's half, 28 Sep 2026). It runs under `npm run lint`, so what it
 * fails on is what a build fails on: a folder under src/app or
 * src/components (or a root route file) under no declared path, a declared
 * path over nothing, a bare root, a malformed key, half a website-only
 * key's metadata, and a manifest for the wrong surface.
 */

const ok = {
    surface: "WEBSITE",
    features: {
        "website.landing": { paths: ["app/page.tsx", "components/site"], owner: "growth", kind: "FEATURE", launch: "on", description: "The home." },
        "campaigns.booking": { paths: ["app/advertiser/campaigns"] },
    },
};

describe("checkFeatures", () => {
    it("passes when every folder and root page is under a declared path and every path is on disk", () => {
        const result = checkFeatures(["app/page.tsx", "app/advertiser/campaigns", "app/advertiser/campaigns/[id]", "components/site"], ok);
        expect(result).toEqual({ problems: [], items: 4, paths: 3, features: 2 });
    });

    it("fails when a folder sits outside every declared path, naming the folder", () => {
        const { problems } = checkFeatures(["app/page.tsx", "app/advertiser/campaigns", "components/site", "app/advertiser/loyalty", "components/loyalty"], ok);
        expect(problems).toEqual([
            "src/app/advertiser/loyalty belongs to no feature — add its path to features.manifest.json",
            "src/components/loyalty belongs to no feature — add its path to features.manifest.json",
        ]);
    });

    it("fails on a root route file under no path, the way it fails on a folder", () => {
        const { problems } = checkFeatures(["app/page.tsx", "app/sitemap.ts", "app/advertiser/campaigns", "components/site"], ok);
        expect(problems).toEqual(["src/app/sitemap.ts belongs to no feature — add its path to features.manifest.json"]);
    });

    it("the longest declared path wins, and a path may sit under more than one key", () => {
        const manifest = {
            surface: "WEBSITE",
            features: {
                "publisher.dashboard": { paths: ["app/publisher"] },
                "orders.booking": { paths: ["app/publisher/bookings"] },
                "publisher.spot-insights": { paths: ["app/publisher/bookings"] },
            },
        };
        expect(checkFeatures(["app/publisher", "app/publisher/bookings", "app/publisher/bookings/[id]", "app/publisher/earnings"], manifest).problems).toEqual([]);
    });

    it("fails when a declared path names nothing on disk — the page moved, or the manifest is stale", () => {
        const { problems } = checkFeatures(["app/page.tsx", "components/site"], ok);
        expect(problems).toEqual([expect.stringContaining('"campaigns.booking" names "app/advertiser/campaigns", which is not a folder')]);
    });

    it("refuses a bare root or a path outside src/app and src/components — it would cover everything", () => {
        const { problems } = checkFeatures(["app/page.tsx", "components/site"], {
            surface: "WEBSITE",
            features: { "website.everything": { paths: ["app", "components", "lib/flags"] } },
        });
        expect(problems).toHaveLength(3 + 2);
        expect(problems.slice(0, 3)).toEqual([
            expect.stringContaining('names "app" — a path is app/<folder>'),
            expect.stringContaining('names "components" — a path is app/<folder>'),
            expect.stringContaining('names "lib/flags" — a path is app/<folder>'),
        ]);
        // Nothing was declared, so both items are uncovered too.
        expect(problems.slice(3)).toEqual([expect.stringContaining("src/app/page.tsx belongs to no feature"), expect.stringContaining("src/components/site belongs to no feature")]);
    });

    it("fails on a malformed key, an entry with no paths, bad variants and the wrong surface", () => {
        const { problems } = checkFeatures(["components/site"], {
            surface: "APP_USER",
            features: {
                Landing: { paths: ["components/site"] },
                "website.empty": { paths: [] },
                "marketplace.instant-booking": { paths: ["components/site"], variants: ["Recommended", "x", "x"] },
            },
        });
        expect(problems).toEqual([
            "surface must be WEBSITE, found APP_USER",
            '"Landing" is not <area>.<capability>',
            '"website.empty" names no paths',
            '"marketplace.instant-booking" variant "Recommended" is not a slug',
            '"marketplace.instant-booking" lists a variant twice',
        ]);
    });

    it("asks a website-only key for all four of owner, kind, launch and description, with values the registry knows", () => {
        const { problems } = checkFeatures(["components/studio"], {
            surface: "WEBSITE",
            features: { "website.studio": { paths: ["components/studio"], owner: "senior", kind: "SWITCH", launch: "later" } },
        });
        expect(problems).toEqual([
            expect.stringContaining('"website.studio" carries owner, kind, launch but not description'),
            '"website.studio" kind must be one of FEATURE, KILL_SWITCH, EXPERIMENT',
            "\"website.studio\" launch must be 'on' or 'dark'",
        ]);
    });
});

describe("itemsUnder", () => {
    let dir: string | null = null;
    afterEach(() => {
        if (dir) rmSync(dir, { recursive: true, force: true });
        dir = null;
    });

    it("walks every folder under app and components at any depth, and the root route files, as /-joined paths", () => {
        dir = mkdtempSync(join(tmpdir(), "adx-web-check-features-"));
        for (const folder of ["app/(site)/spaces/[id]", "app/advertiser/campaigns/[id]/artwork/files", "app/_private/parts", "components/ui", "components/layout/blocks", "lib/deep"]) {
            mkdirSync(join(dir, folder), { recursive: true });
        }
        for (const file of ["page.tsx", "not-found.tsx", "sitemap.ts", "robots.ts", "layout.tsx", "globals.css", "sitemap.test.ts"]) writeFileSync(join(dir, "app", file), "");
        expect(itemsUnder(dir)).toEqual([
            "app/(site)",
            "app/(site)/spaces",
            "app/(site)/spaces/[id]",
            "app/advertiser",
            "app/advertiser/campaigns",
            "app/advertiser/campaigns/[id]",
            "app/advertiser/campaigns/[id]/artwork",
            "app/advertiser/campaigns/[id]/artwork/files",
            "app/not-found.tsx",
            "app/page.tsx",
            "app/robots.ts",
            "app/sitemap.ts",
            "components/layout",
            "components/layout/blocks",
            "components/ui",
        ]);
    });
});

describe("the shipped manifest", () => {
    it("covers every folder under src/app and src/components, and every root page, today", async () => {
        const manifest = (await import("../../features.manifest.json")).default;
        const result = checkFeatures(itemsUnder(join(process.cwd(), "src")), manifest);
        expect(result.problems).toEqual([]);
        expect(result.items).toBeGreaterThan(150);
    });

    it("gives every website-only key its metadata, and names the enforced kill switches the website draws", async () => {
        const manifest = (await import("../../features.manifest.json")).default as { features: Record<string, { paths: string[]; owner?: string; kind?: string; launch?: string; description?: string }> };
        for (const [key, entry] of Object.entries(manifest.features)) {
            if (key.startsWith("website.")) expect([entry.owner, entry.kind, entry.launch, entry.description].every(Boolean), key).toBe(true);
        }
        for (const key of ["support.live-chat", "partners.print-floor", "partners.quotes", "print.partner-kyc", "revenue.publisher-plans", "promotions.ads", "promotions.boosts", "campaigns.landing-pages", "marketplace.reviews", "users.data-export", "payments.gateways", "publisher.spot-insights", "marketplace.instant-booking", "campaigns.multi-market"]) {
            expect(manifest.features[key]?.paths.length, key).toBeGreaterThan(0);
        }
    });
});
