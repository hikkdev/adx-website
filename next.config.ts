import type { NextConfig } from "next";

/**
 * adx.in — the website and the web app in one Next.js app (DR 12).
 *
 * Server-rendered so a listing page is a real page to a search engine, on
 * Render like the backend. The home page is the hand-written one from the
 * static site, kept as it was; the legal pages are still pressed from the
 * console by `build-pages.mjs` into `public/`, where Next serves them as
 * plain files at their old addresses.
 */
const nextConfig: NextConfig = {
    reactStrictMode: true,
    images: {
        remotePatterns: [
            { protocol: "https", hostname: "**.r2.cloudflarestorage.com" },
            { protocol: "https", hostname: "**.r2.dev" },
            { protocol: "https", hostname: "adx-backendv1.onrender.com" },
        ],
    },
};

export default nextConfig;
