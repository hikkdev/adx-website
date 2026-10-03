import { afterEach, describe, expect, it } from "vitest";
import { rememberSiteRoutes } from "@/lib/site-routes";
import { buttonRowOf, columnsOf, ctaStripOf, faqOf, formBlockOf, heroOf, imageOf, listingGridOf, metadataFrom, metaOf, parseLayout, planContentBlocks, statsOf, stepsOf, targetHref, videoEmbed, videoOf } from "./layouts";

const media = { url: "https://cdn.test/a.jpg", width: 1600, height: 480, altText: "Festive" };

describe("PB-1: PAGE targets", () => {
    afterEach(() => rememberSiteRoutes(null));

    it("uses the server's href when it sent one, else the page's current address by key, never an unsafe one", () => {
        expect(targetHref({ kind: "PAGE", value: "diwali", href: "/diwali-offers" })).toEqual({ href: "/diwali-offers", external: false });
        expect(targetHref({ kind: "PAGE", value: "help" })).toEqual({ href: "/help", external: false });
        expect(targetHref({ kind: "PAGE", value: "new-page" })).toEqual({ href: "/pg/new-page", external: false });
        expect(targetHref({ kind: "PAGE", value: "diwali", href: "//evil.example" })).toEqual({ href: "/pg/diwali", external: false });
        expect(targetHref({ kind: "PAGE", value: "bad key!" })).toBeNull();
        rememberSiteRoutes({ version: "v", pages: [{ key: "help", kind: "SYSTEM", title: "Help", path: "/support", internalPath: "/help", channels: ["WEBSITE"] }], redirects: [] });
        expect(targetHref({ kind: "PAGE", value: "help" })?.href).toBe("/support");
    });
});

describe("PB-2: a version's SEO settings", () => {
    it("reads meta strictly and answers a page's metadata over its own words", () => {
        expect(metaOf({ seoTitle: " Diwali ", seoImage: media, noindex: "yes" })).toEqual({ seoTitle: "Diwali", seoDescription: null, seoImage: media, noindex: false });
        expect(metaOf({})).toBeNull();
        expect(parseLayout({ surface: "WEB_HELP", version: 1, isDefault: false, blocks: [], meta: { noindex: true }, preview: true })).toMatchObject({ meta: { noindex: true }, preview: true });
        const metadata = metadataFrom({ seoTitle: "Diwali on ADX", seoDescription: null, seoImage: media, noindex: false }, { title: "Help", description: "The help centre" });
        expect(metadata).toEqual({ title: "Diwali on ADX", description: "The help centre", openGraph: { title: "Diwali on ADX", description: "The help centre", images: [{ url: media.url, width: 1600, height: 480, alt: "Festive" }] } });
        expect(metadataFrom(null, { title: "Help" })).toEqual({ title: "Help" });
        expect(metadataFrom({ seoTitle: null, seoDescription: null, seoImage: null, noindex: true }, { title: "Help" }).robots).toEqual({ index: false, follow: false });
        expect(metadataFrom(null, { title: "Help" }, { noindex: true }).robots).toEqual({ index: false, follow: false });
    });
});

describe("PB-4: the Studio blocks' props", () => {
    it("plans a custom page's content blocks only", () => {
        expect(planContentBlocks([{ id: "a", type: "hero", props: { headline: "Hi" } }, { id: "b", type: "help_hero", props: {} }, { id: "c", type: "nope", props: {} }]).map((block) => block.type)).toEqual(["hero"]);
        expect(planContentBlocks(null)).toEqual([]);
    });

    it("reads a hero, a strip, columns, an image and buttons — and answers null with nothing to draw", () => {
        expect(heroOf({ headline: "Book for Diwali", media, primaryCta: { label: "Explore", target: { kind: "EXPLORE" } }, secondaryCta: { label: "" }, align: "CENTER" })).toEqual({
            headline: "Book for Diwali",
            subheadline: null,
            media,
            primaryCta: { label: "Explore", target: { kind: "EXPLORE" } },
            secondaryCta: null,
            align: "CENTER",
        });
        expect(heroOf({ subheadline: "no headline" })).toBeNull();
        expect(ctaStripOf({ headline: "Ready?", ctaLabel: "Go", target: { kind: "ROUTE", value: "/spaces" }, tone: "PAPER" })).toMatchObject({ tone: "PAPER", target: { kind: "ROUTE", value: "/spaces" } });
        expect(ctaStripOf({ headline: "Ready?", tone: "INK" })).toBeNull();
        expect(columnsOf({ columns: [{ title: "One", markdown: "**a**" }, { markdown: "b", media }, {}] })?.columns).toHaveLength(2);
        expect(columnsOf({ columns: [] })).toBeNull();
        expect(imageOf({ media, caption: "Cap", width: "FULL" })).toMatchObject({ width: "FULL", caption: "Cap" });
        expect(imageOf({ media: { url: "javascript:alert(1)" } })).toBeNull();
        expect(buttonRowOf({ buttons: [{ label: "Go", target: { kind: "URL", value: "https://x.example" }, style: "SECONDARY" }, { label: "Nowhere", target: { kind: "ROUTE", value: "//evil" } }] })?.buttons).toEqual([{ label: "Go", target: { kind: "URL", value: "https://x.example" }, style: "SECONDARY" }]);
        expect(buttonRowOf({ buttons: [] })).toBeNull();
    });

    it("reads a faq, steps and stats", () => {
        expect(faqOf({ title: "Q", items: [{ question: "A?", answer: "B" }, { question: "no answer" }] })).toEqual({ title: "Q", items: [{ question: "A?", answer: "B" }] });
        expect(faqOf({ items: [] })).toBeNull();
        expect(stepsOf({ items: [{ title: "One", body: "x" }, { title: "Two" }] })?.items).toEqual([{ title: "One", body: "x" }, { title: "Two", body: "" }]);
        expect(statsOf({ items: [{ value: "1,200", label: "spaces" }, { value: "", label: "x" }] })).toEqual({ items: [{ value: "1,200", label: "spaces" }] });
        expect(listingGridOf({ columns: "4", title: "Grid" })).toEqual({ title: "Grid", seeAllLabel: null, columns: 4 });
        expect(listingGridOf({ columns: 7 }).columns).toBe(3);
    });

    it("embeds YouTube (without cookies), Vimeo and an https mp4 — nothing else", () => {
        expect(videoEmbed("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toEqual({ kind: "youtube", src: "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ" });
        expect(videoEmbed("https://youtu.be/dQw4w9WgXcQ?t=1")).toEqual({ kind: "youtube", src: "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ" });
        expect(videoEmbed("https://www.youtube.com/shorts/dQw4w9WgXcQ")?.kind).toBe("youtube");
        expect(videoEmbed("https://vimeo.com/123456789")).toEqual({ kind: "vimeo", src: "https://player.vimeo.com/video/123456789" });
        expect(videoEmbed("https://cdn.test/clip.mp4?x=1")).toEqual({ kind: "file", src: "https://cdn.test/clip.mp4?x=1" });
        expect(videoEmbed("http://cdn.test/clip.mp4")).toBeNull();
        expect(videoEmbed("https://evil.example/page")).toBeNull();
        expect(videoEmbed("not a url")).toBeNull();
        expect(videoOf({ url: "https://vimeo.com/1234567", caption: "Watch" })).toMatchObject({ caption: "Watch", embed: { kind: "vimeo" } });
    });

    it("reads the form the server resolved into the block, or nothing", () => {
        expect(formBlockOf({ formKey: "contact", form: null })).toBeNull();
        expect(formBlockOf({ heading: "Talk to us", form: { key: "contact", title: "Contact", audience: "PUBLIC", version: 1, definition: { screens: [{ key: "s", fields: [{ id: "n", kind: "text", label: "Name" }] }], successMessage: "Ta", consentText: "OK" } } })).toMatchObject({ heading: "Talk to us", intro: null, form: { key: "contact" } });
    });
});
