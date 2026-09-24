/**
 * Where the backend is. One setting, read once: the same ADX backend the
 * apps and the console use, so an account, a listing or a campaign is the
 * same record on every surface.
 */
const raw = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3000/api/v1";

export const apiConfig = {
    baseUrl: raw.replace(/\/$/, ""),
    siteUrl: (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:5174").replace(/\/$/, ""),
};
