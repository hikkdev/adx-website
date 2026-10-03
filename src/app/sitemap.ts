import type { MetadataRoute } from "next";
import { listDocSlugs } from "@/lib/site-docs";
import { readSitemapServer, sitemapEntries } from "@/services/pages";

/** The sitemap is kept an hour; a page ADX publishes shows within it. */
export const revalidate = 3600;

/**
 * PB-5 (27 Sep 2026): `/sitemap.xml` — the WEBSITE pages ADX has live and
 * not marked `noindex` (`GET /app/site/sitemap`, the seeded system pages
 * when it does not answer), the static documents (`/contact`, `/privacy`,
 * `/terms`, `/refund` and whatever the console pressed) and the policies
 * index.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
    const base = process.env.NEXT_PUBLIC_SITE_URL ?? "https://adx.in";
    return sitemapEntries(base, await readSitemapServer(), listDocSlugs());
}
