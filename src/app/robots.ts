import type { MetadataRoute } from "next";

/** What a crawler may not index: Studio, the `/pg` routes (a page's address is its own), the workspaces, the cart, and every sign-in and verification door. */
export const ROBOTS_DISALLOW = ["/studio", "/pg", "/advertiser", "/publisher", "/partner", "/cart", "/sign", "/verify", "/account"];

/** PB-5 (27 Sep 2026): `/robots.txt` — everything public may be crawled; the sitemap is named. */
export default function robots(): MetadataRoute.Robots {
    const base = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://adx.in").replace(/\/$/, "");
    return {
        rules: [{ userAgent: "*", allow: "/", disallow: ROBOTS_DISALLOW }],
        sitemap: `${base}/sitemap.xml`,
    };
}
