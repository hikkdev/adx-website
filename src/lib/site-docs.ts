import fs from "node:fs";
import path from "node:path";

/**
 * The website's document pages — contact, privacy, terms, refunds and every
 * page `build-pages.mjs` presses from the console into `public/<slug>.html`.
 *
 * The pressed file is the source of the words, so a policy published in the
 * console still reaches the site the way it always has. What the file no
 * longer decides is the chrome: its `<main>` is lifted out and served at
 * `/<slug>` inside the site's one header and one footer, and the old
 * `/<slug>.html` address redirects there (next.config.ts).
 */

const PUBLIC_DIR = path.join(process.cwd(), "public");

export interface SiteDoc {
    slug: string;
    title: string;
    description: string | null;
    bodyHtml: string;
}

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Every `public/<slug>.html` — the pages the `[doc]` route serves. */
export function listDocSlugs(dir = PUBLIC_DIR): string[] {
    let names: string[] = [];
    try {
        names = fs.readdirSync(dir);
    } catch {
        return [];
    }
    return names
        .filter((name) => name.endsWith(".html"))
        .map((name) => name.slice(0, -".html".length))
        .filter((slug) => SLUG.test(slug))
        .sort();
}

const decode = (text: string): string =>
    text
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&amp;/g, "&");

/**
 * The parts of a pressed or hand-written page the site needs: its title (the
 * `<title>` without the " — ADX" suffix), its description, and the inside of
 * its `<main>`. Old `.html` links inside the body are rewritten to the clean
 * addresses. Null when the file is missing or has no `<main>`.
 */
export function parseDoc(slug: string, html: string): SiteDoc | null {
    const main = /<main\b[^>]*>([\s\S]*?)<\/main>/i.exec(html);
    if (!main) return null;
    const title = /<title>([\s\S]*?)<\/title>/i.exec(html)?.[1]?.trim() ?? slug;
    const description = /<meta\s+name="description"\s+content="([^"]*)"/i.exec(html)?.[1] ?? null;
    const bodyHtml = main[1]!
        .replace(/href="(?:\.\/)?([a-z0-9-]+)\.html(#[^"]*)?"/g, (_all, target: string, hash = "") => `href="/${target}${hash}"`)
        .replace(/href="\.\/"/g, 'href="/"')
        .trim();
    return {
        slug,
        title: decode(title.replace(/\s+[—-]\s+ADX$/, "")),
        description: description ? decode(description) : null,
        bodyHtml,
    };
}

export function readDoc(slug: string, dir = PUBLIC_DIR): SiteDoc | null {
    if (!SLUG.test(slug)) return null;
    try {
        return parseDoc(slug, fs.readFileSync(path.join(dir, `${slug}.html`), "utf8"));
    } catch {
        return null;
    }
}
