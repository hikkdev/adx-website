import type { NextConfig } from "next";

/**
 * adx.in — the website and the web app in one Next.js app (DR 12).
 *
 * Server-rendered so a listing page is a real page to a search engine, on
 * Render like the backend. The home page's body is the hand-written one from
 * the static site, inside the site's one header and footer. The legal and
 * content pages are still pressed from the console by `build-pages.mjs` into
 * `public/<slug>.html`; the `(site)/[doc]` route serves their words at
 * `/<slug>` inside the same chrome, and the old `.html` addresses redirect
 * there (a redirect runs before `public/` is consulted, so the raw file is
 * never what a visitor sees).
 */
const nextConfig: NextConfig = {
    reactStrictMode: true,
    async redirects() {
        return [
            { source: "/index.html", destination: "/", permanent: true },
            { source: "/:doc([a-z0-9-]+)\\.html", destination: "/:doc", permanent: true },
        ];
    },
    images: {
        remotePatterns: [
            { protocol: "https", hostname: "**.r2.cloudflarestorage.com" },
            { protocol: "https", hostname: "**.r2.dev" },
            { protocol: "https", hostname: "adx-backendv1.onrender.com" },
        ],
    },
};

export default nextConfig;
