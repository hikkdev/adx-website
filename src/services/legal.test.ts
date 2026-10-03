import { afterEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => {
    class FakeApiError extends Error {
        constructor(
            readonly status: number,
            readonly code: string,
            message: string
        ) {
            super(message);
        }
    }
    return {
        FakeApiError,
        calls: [] as { method: string; path: string; body?: unknown; options?: unknown }[],
        agreementAnswer: { current: async (): Promise<unknown> => ({ id: "t1", kind: "ADVERTISER_PLATFORM", version: 2, title: "Advertiser terms", body: "Text" }) },
    };
});
const { calls, FakeApiError } = h;
vi.mock("@/lib/api-client", () => ({
    ApiError: h.FakeApiError,
    api: {
        get: async (path: string, options?: unknown) => {
            h.calls.push({ method: "GET", path, options });
            if (path.startsWith("/agreements/current/") || path.startsWith("/legal/agreements/")) return h.agreementAnswer.current();
            return {};
        },
    },
}));

import {
    cleanTitle,
    contactOf,
    effectiveLine,
    faqItemsOf,
    isPlaceholder,
    legalServer,
    legalService,
    liveChatLine,
    orderedIndex,
    renderMarkdown,
    resolveLegalRoute,
    supportLiveService,
    telHref,
    withoutLeadingTitle,
    type LegalIndexEntry,
    type LiveStatus,
} from "./legal";

afterEach(() => {
    calls.length = 0;
    vi.unstubAllGlobals();
});

describe("which document an address names", () => {
    it("takes the kinds as the backend spells them", () => {
        expect(resolveLegalRoute("PRIVACY_POLICY")).toEqual({ source: "legal", kind: "PRIVACY_POLICY" });
        expect(resolveLegalRoute("ADVERTISER_PLATFORM")).toEqual({ source: "agreement", kind: "ADVERTISER_PLATFORM" });
        expect(resolveLegalRoute("PLATFORM")).toEqual({ source: "agreement", kind: "PLATFORM" });
    });

    it("forgives case, dashes, an _AGREEMENT suffix and the plain names other pages link", () => {
        expect(resolveLegalRoute("ADVERTISER_PLATFORM_AGREEMENT")).toEqual({ source: "agreement", kind: "ADVERTISER_PLATFORM" });
        expect(resolveLegalRoute("PUBLISHER_PLATFORM_AGREEMENT")).toEqual({ source: "agreement", kind: "PLATFORM" });
        expect(resolveLegalRoute("print-partner-service-agreement")).toEqual({ source: "agreement", kind: "PRINT_PARTNER_SERVICE" });
        expect(resolveLegalRoute("terms-of-service")).toEqual({ source: "legal", kind: "TERMS_OF_SERVICE" });
        expect(resolveLegalRoute("privacy")).toEqual({ source: "legal", kind: "PRIVACY_POLICY" });
        expect(resolveLegalRoute("publisher%20agreement")).toEqual({ source: "agreement", kind: "PLATFORM" });
    });

    it("refuses anything else", () => {
        expect(resolveLegalRoute("SOMETHING_ELSE")).toBeNull();
        expect(resolveLegalRoute("../etc")).toBeNull();
        expect(resolveLegalRoute("%E0%A4%A")).toBeNull();
        expect(resolveLegalRoute("JOB_TERMS")).toBeNull();
    });
});

describe("the reads", () => {
    it("reads the index, a document and a public platform agreement without a session, and any other agreement with one", async () => {
        await legalService.index();
        await legalService.document("FAQ");
        await legalService.agreement("PLATFORM");
        await legalService.agreement("PRINT_PARTNER_SERVICE");
        await supportLiveService.status();
        expect(calls.map((c) => [c.path, c.options])).toEqual([
            ["/legal", { anonymous: true }],
            ["/legal/FAQ", { anonymous: true }],
            ["/legal/agreements/PLATFORM", { anonymous: true }],
            ["/agreements/current/PRINT_PARTNER_SERVICE", undefined],
            ["/support/live/status", undefined],
        ]);
    });

    it("answers an unpublished agreement as null and lets any other failure through", async () => {
        h.agreementAnswer.current = async () => Promise.reject(new FakeApiError(404, "NO_ACTIVE_TEMPLATE", "No terms"));
        expect(await legalService.agreement("PLATFORM")).toBeNull();
        h.agreementAnswer.current = async () => Promise.reject(new FakeApiError(500, "BOOM", "Broken"));
        await expect(legalService.agreement("PLATFORM")).rejects.toThrow("Broken");
    });

    it("reads on the server with a cache life, and answers null when ADX does not", async () => {
        const fetchMock = vi.fn(async () => new Response(JSON.stringify({ success: true, data: [{ kind: "FAQ" }] }), { status: 200 }));
        vi.stubGlobal("fetch", fetchMock);
        expect(await legalServer.index("http://api.test")).toEqual([{ kind: "FAQ" }]);
        expect(fetchMock).toHaveBeenCalledWith("http://api.test/legal", expect.objectContaining({ next: { revalidate: 300 } }));
        vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 404 })));
        expect(await legalServer.document("FAQ", "http://api.test")).toBeNull();
        vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new Error("down"))));
        expect(await legalServer.document("FAQ", "http://api.test")).toBeNull();
    });
});

describe("the Markdown", () => {
    it("renders headings one below the page's own, lists, quotes and paragraphs", () => {
        const html = renderMarkdown("# Title\n\nFirst line\nsecond line.\n\n- one\n- two\n\n1. a\n2. b\n\n> quoted");
        expect(html).toBe(["<h2>Title</h2>", "<p>First line second line.</p>", "<ul>", "<li>one</li>", "<li>two</li>", "</ul>", "<ol>", "<li>a</li>", "<li>b</li>", "</ol>", "<blockquote>quoted</blockquote>"].join("\n"));
    });

    it("escapes the source before it adds a tag, so nothing can be injected", () => {
        const html = renderMarkdown('<script>alert(1)</script> and <img src=x onerror="y">');
        expect(html).not.toContain("<script>");
        expect(html).not.toContain("<img");
        expect(html).toContain("&lt;script&gt;");
    });

    it("keeps only links a reader can follow safely", () => {
        expect(renderMarkdown("[mail](mailto:a@adx.in) [site](/legal) [web](https://adx.in/x?a=1&b=2)")).toBe('<p><a href="mailto:a@adx.in">mail</a> <a href="/legal">site</a> <a href="https://adx.in/x?a=1&amp;b=2">web</a></p>');
        expect(renderMarkdown("[bad](javascript:alert(1))")).not.toContain("href");
        expect(renderMarkdown("[proto](//evil.example)")).not.toContain("href");
    });

    it("sets bold, italic and code", () => {
        expect(renderMarkdown("**bold** *it* _also_ `code`")).toBe("<p><strong>bold</strong> <em>it</em> <em>also</em> <code>code</code></p>");
    });

    it("drops a leading title that repeats the page's heading", () => {
        expect(withoutLeadingTitle("# FAQs\n\nBody", "FAQs (placeholder)")).toBe("\nBody");
        expect(withoutLeadingTitle("# Something else\n\nBody", "FAQs")).toBe("# Something else\n\nBody");
        expect(withoutLeadingTitle("Body only", "FAQs")).toBe("Body only");
    });
});

describe("the structured documents", () => {
    const faq = { title: "FAQs (placeholder)", meta: { items: [{ q: "Q1", a: "A1", tags: ["ORDERS"] }, { q: 2, a: "x" }, { a: "no q" }], placeholder: true } };
    it("reads the questions and the contact block, and knows a placeholder", () => {
        expect(faqItemsOf(faq)).toEqual([{ q: "Q1", a: "A1", tags: ["ORDERS"] }]);
        expect(faqItemsOf(null)).toEqual([]);
        expect(contactOf({ meta: { supportLine: { phone: "+91 80 1" } } }).supportLine?.phone).toBe("+91 80 1");
        expect(contactOf(null)).toEqual({});
        expect(isPlaceholder(faq)).toBe(true);
        expect(isPlaceholder({ title: "Privacy policy", meta: null })).toBe(false);
        expect(isPlaceholder({ title: "Privacy policy (placeholder)", meta: null })).toBe(true);
        expect(cleanTitle("Privacy policy (placeholder)")).toBe("Privacy policy");
        expect(telHref("+91 80 4666 0000")).toBe("tel:+918046660000");
    });

    it("prints when a document took effect", () => {
        expect(effectiveLine("2026-09-16T21:53:33.652Z", 1)).toBe("Effective 17 September 2026 · version 1");
        expect(effectiveLine(null, 3)).toBe("version 3");
        expect(effectiveLine(null, null)).toBeNull();
    });

    it("orders the index as the app does", () => {
        const entry = (kind: string) => ({ kind }) as LegalIndexEntry;
        expect(orderedIndex([entry("FAQ"), entry("TERMS_OF_SERVICE"), entry("NEW_KIND"), entry("PRIVACY_POLICY")]).map((e) => e.kind)).toEqual(["PRIVACY_POLICY", "TERMS_OF_SERVICE", "FAQ", "NEW_KIND"]);
    });
});

describe("live chat's line", () => {
    const status = (over: Partial<LiveStatus> = {}): LiveStatus => ({
        entitled: true,
        reason: "ADVERTISER_PACKAGE",
        plan: null,
        upsell: { title: "Live chat comes with a plan", href: "/advertiser/plans" },
        online: true,
        expectedWaitSec: 60,
        withinHours: true,
        nextOpening: null,
        nextOpeningLabel: null,
        firstResponseTargetSec: 120,
        ...over,
    });
    it("says what the desk is doing, for whom", () => {
        expect(liveChatLine(null)).toBe("Checking the desk…");
        expect(liveChatLine(status())).toBe("Live chat is open — ADX typically replies in under 2 minutes.");
        expect(liveChatLine(status({ online: false, nextOpeningLabel: "9:00 am IST on Tue 29 Sep" }))).toContain("closed until 9:00 am IST on Tue 29 Sep");
        expect(liveChatLine(status({ entitled: false, online: false, reason: "NOT_SUBSCRIBED", plan: { name: "Growth", tier: "GROWTH" } }))).toBe("Live chat is part of the Growth plan. Requests are answered for everyone.");
        expect(liveChatLine(status({ entitled: false, online: false, reason: "FEATURE_OFF" }))).toContain("not running");
        expect(liveChatLine(status({ entitled: false, online: false, reason: "NOT_A_SUBSCRIBER_ROLE" }))).toBe("Raise a request and ADX answers it on the thread.");
    });
});
