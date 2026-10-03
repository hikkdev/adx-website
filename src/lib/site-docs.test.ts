import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { listDocSlugs, parseDoc, readDoc } from "./site-docs";

const page = `<!doctype html><html><head><title>Refunds &amp; cancellations — ADX</title>
<meta name="description" content="What happens when a campaign changes."></head><body>
<header class="site">old chrome</header>
<main class="doc wrap">
  <h1>Refunds</h1><p>See the <a href="terms.html#cancel">terms</a> or <a href="./contact.html">contact us</a>, or go <a href="./">home</a>.</p>
</main>
<footer class="site">old footer</footer></body></html>`;

describe("the document pages", () => {
    it("lifts the title, the description and the inside of <main>, and nothing of the old chrome", () => {
        const doc = parseDoc("refund", page)!;
        expect(doc.title).toBe("Refunds & cancellations");
        expect(doc.description).toBe("What happens when a campaign changes.");
        expect(doc.bodyHtml).toContain("<h1>Refunds</h1>");
        expect(doc.bodyHtml).not.toContain("old chrome");
        expect(doc.bodyHtml).not.toContain("old footer");
    });

    it("rewrites the old .html links to the clean addresses", () => {
        const doc = parseDoc("refund", page)!;
        expect(doc.bodyHtml).toContain('href="/terms#cancel"');
        expect(doc.bodyHtml).toContain('href="/contact"');
        expect(doc.bodyHtml).toContain('href="/"');
    });

    it("lists only well-formed slugs, and reads nothing outside them", () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), "adx-docs-"));
        fs.writeFileSync(path.join(dir, "privacy.html"), page);
        fs.writeFileSync(path.join(dir, "code-of-conduct.html"), page);
        fs.writeFileSync(path.join(dir, "Bad Name.html"), page);
        fs.writeFileSync(path.join(dir, "styles.css"), "");
        expect(listDocSlugs(dir)).toEqual(["code-of-conduct", "privacy"]);
        expect(readDoc("../privacy", dir)).toBeNull();
        expect(readDoc("missing", dir)).toBeNull();
        expect(parseDoc("x", "<html>no main</html>")).toBeNull();
    });

    it("serves the four pages that ship with the site", () => {
        expect(listDocSlugs()).toEqual(expect.arrayContaining(["contact", "privacy", "refund", "terms"]));
        expect(readDoc("contact")?.bodyHtml).toContain("Keysquare Technologies Pvt Ltd");
    });
});
