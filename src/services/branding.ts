import { apiConfig } from "@/lib/api-config";

/**
 * QR-9/QR-11/QR-12: the brand, as Settings › Brand & theme publishes it —
 * `GET /app/branding`, public, the same read the apps and the console make
 * (`mobile/shared/features/branding`, `ADX-backendv1/src/modules/branding`).
 *
 * The website reads its own surface of it on the server: the site title and
 * description (metadata), the favicon and share image, the logos, and the
 * two reds the Tailwind `brand` tokens are drawn in. Only what ops actually
 * changed moves the site — a field still at its default (`defaults` names
 * them) leaves DR 12's own value in place, because the website's reds and
 * wordmark are the Figma's, not the apps'. A read that fails changes
 * nothing: the site draws exactly as it did before this existed.
 */

export interface Brand {
    platformName: string;
    tagline: string;
    primaryColor: string;
    deepColor: string;
    inkColor: string;
    groundColor: string;
    onPrimaryColor?: string;
    wordmarkUrl: string;
    wordmarkInverseUrl: string;
    markUrl: string;
    markInverseUrl: string;
    iconUrl: string;
    website?: {
        taglines?: string[];
        heroImageUrl?: string | null;
        ogImageUrl?: string | null;
        faviconUrl?: string | null;
        title?: string | null;
        description?: string | null;
    };
    /** The fields still at their default — `"primaryColor"`, `"website.siteTitle"`… */
    defaults: string[];
    version: string;
}

/** What the website draws with, after the read: DR 12's own files and words unless ops changed them. */
export interface SiteBrand {
    version: string;
    platformName: string;
    title: string;
    description: string;
    wordmarkUrl: string;
    wordmarkInverseUrl: string;
    markUrl: string;
    faviconUrl: string;
    ogImageUrl: string | null;
    /** CSS custom properties for `:root`, empty when nothing is retuned. */
    cssVariables: Record<string, string>;
}

/** The website's own brand — what it draws when the read fails or ops changed nothing. */
export const SITE_BRAND: SiteBrand = {
    version: "site",
    platformName: "ADX",
    title: "ADX",
    description: "Advertising spaces across India: find them, book them, run the campaign. Publishers list; advertisers book; ADX verifies.",
    wordmarkUrl: "/brand/adx-wordmark-red.svg",
    wordmarkInverseUrl: "/brand/adx-wordmark-white.svg",
    markUrl: "/brand/adx-mark-red.svg",
    faviconUrl: "/brand/adx-icon-tile.svg",
    ogImageUrl: null,
    cssVariables: {},
};

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

/** `#BD2020` → `189 32 32`, the space-separated triplet Tailwind's `rgb(var(--x) / <alpha-value>)` takes; null for anything not a hex colour. */
export function hexToTriplet(hex: string | null | undefined): string | null {
    if (typeof hex !== "string" || !HEX.test(hex.trim())) return null;
    let digits = hex.trim().slice(1);
    if (digits.length === 3) digits = digits.split("").map((d) => d + d).join("");
    const value = Number.parseInt(digits, 16);
    return `${(value >> 16) & 255} ${(value >> 8) & 255} ${value & 255}`;
}

/** A colour mixed toward white — `amount` 0 is white, 1 is the colour — as a triplet. */
export function tintTriplet(hex: string, amount: number): string | null {
    const triplet = hexToTriplet(hex);
    if (!triplet) return null;
    const [r, g, b] = triplet.split(" ").map(Number) as [number, number, number];
    const mix = (channel: number) => Math.round(255 + (channel - 255) * amount);
    return `${mix(r)} ${mix(g)} ${mix(b)}`;
}

const isDefault = (brand: Pick<Brand, "defaults">, field: string) => Array.isArray(brand.defaults) && brand.defaults.includes(field);

const usableUrl = (value: unknown): value is string => typeof value === "string" && /^(https?:\/\/|\/)/.test(value.trim());

/**
 * The website's brand from the read. The deep red is DR 12's `brand` (the
 * buttons); the primary is `brand-bright` (the chips) and its tint
 * `brand-soft`. Each moves only when ops changed it.
 */
export function siteBrandOf(brand: Brand | null): SiteBrand {
    if (!brand || typeof brand !== "object") return SITE_BRAND;
    const css: Record<string, string> = {};
    if (!isDefault(brand, "deepColor")) {
        const deep = hexToTriplet(brand.deepColor);
        if (deep) css["--brand-rgb"] = deep;
    }
    if (!isDefault(brand, "primaryColor")) {
        const bright = hexToTriplet(brand.primaryColor);
        const soft = tintTriplet(brand.primaryColor, 0.1);
        if (bright) css["--brand-bright-rgb"] = bright;
        if (soft) css["--brand-soft-rgb"] = soft;
    }
    const website = brand.website ?? {};
    const name = typeof brand.platformName === "string" && brand.platformName.trim() ? brand.platformName.trim() : SITE_BRAND.platformName;
    return {
        version: typeof brand.version === "string" ? brand.version : "unknown",
        platformName: name,
        title: typeof website.title === "string" && website.title.trim() ? website.title.trim() : SITE_BRAND.title,
        description: typeof website.description === "string" && website.description.trim() ? website.description.trim() : SITE_BRAND.description,
        wordmarkUrl: !isDefault(brand, "wordmarkUrl") && usableUrl(brand.wordmarkUrl) ? brand.wordmarkUrl : SITE_BRAND.wordmarkUrl,
        wordmarkInverseUrl: !isDefault(brand, "wordmarkInverseUrl") && usableUrl(brand.wordmarkInverseUrl) ? brand.wordmarkInverseUrl : SITE_BRAND.wordmarkInverseUrl,
        markUrl: !isDefault(brand, "markUrl") && usableUrl(brand.markUrl) ? brand.markUrl : SITE_BRAND.markUrl,
        faviconUrl: !isDefault(brand, "website.faviconUrl") && usableUrl(website.faviconUrl) ? website.faviconUrl : SITE_BRAND.faviconUrl,
        ogImageUrl: usableUrl(website.ogImageUrl) ? website.ogImageUrl : null,
        cssVariables: css,
    };
}

/** `:root{--brand-rgb:189 32 32}` — only ever built from triplets `hexToTriplet` produced, so nothing else can reach the stylesheet. */
export function cssVariablesBlock(variables: Record<string, string>): string {
    const entries = Object.entries(variables).filter(([name, value]) => /^--[a-z-]+$/.test(name) && /^\d{1,3} \d{1,3} \d{1,3}$/.test(value));
    if (entries.length === 0) return "";
    return `:root{${entries.map(([name, value]) => `${name}:${value}`).join(";")}}`;
}

/** How long a server's read of the brand is kept before the next one — the backend's own `Cache-Control` (300 s). */
export const BRAND_REVALIDATE_SECONDS = 300;

/**
 * The server's read: cached for five minutes, three seconds at most, and
 * never a throw — a backend that is asleep or down leaves the site's own brand.
 */
export async function readSiteBrand(baseUrl: string = apiConfig.baseUrl): Promise<SiteBrand> {
    try {
        const response = await fetch(`${baseUrl}/app/branding`, { next: { revalidate: BRAND_REVALIDATE_SECONDS }, signal: AbortSignal.timeout(3000) });
        if (!response.ok) return SITE_BRAND;
        const payload = (await response.json()) as { data?: Brand } | Brand;
        const brand = payload && typeof payload === "object" && "data" in payload ? payload.data : (payload as Brand);
        return siteBrandOf(brand ?? null);
    } catch {
        return SITE_BRAND;
    }
}
