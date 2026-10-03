import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api-client";
import {
    ENVELOPE_KEY,
    PATH_PATTERN,
    cleanProps,
    defaultProps,
    forbiddenMessage,
    fromPuckData,
    hasPathParam,
    issuesByBlock,
    keepPinnedLast,
    keyFromTitle,
    mergeResolved,
    parseHandoff,
    previewPathFor,
    previewUrl,
    sameBlocks,
    studioApi,
    studioTokens,
    toPuckData,
    versionApi,
    versionPath,
    type LayoutBlock,
} from "./studio";

type Call = { url: string; init: RequestInit };

const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

/** Answers requests in order and records them. */
function stubFetch(answers: { status: number; body: unknown }[]): Call[] {
    const calls: Call[] = [];
    let at = 0;
    vi.stubGlobal(
        "fetch",
        vi.fn(async (url: string, init: RequestInit) => {
            calls.push({ url, init });
            const answer = answers[Math.min(at, answers.length - 1)]!;
            at += 1;
            return reply(answer.status, answer.body);
        })
    );
    return calls;
}

const bearer = (call: Call) => (call.init.headers as Headers).get("Authorization");

beforeEach(() => {
    studioTokens.clear();
    window.sessionStorage.clear();
    window.localStorage.clear();
});

afterEach(() => {
    vi.unstubAllGlobals();
});

describe("ST-1: the console's hand-off", () => {
    it("reads the pair off the fragment and nothing else", () => {
        expect(parseHandoff("#token=acc.ess.tok&refresh=ref-1")).toEqual({ accessToken: "acc.ess.tok", refreshToken: "ref-1" });
        expect(parseHandoff("token=only")).toEqual({ accessToken: "only", refreshToken: null });
        expect(parseHandoff("#refresh=no-access")).toBeNull();
        expect(parseHandoff("")).toBeNull();
        expect(parseHandoff(null)).toBeNull();
        expect(parseHandoff("#")).toBeNull();
    });
});

describe("Studio's own session", () => {
    it("keeps the pair in sessionStorage under its own keys, apart from the party session", () => {
        studioTokens.set({ accessToken: "a", refreshToken: "r" });
        expect(window.sessionStorage.getItem("adx.studio.accessToken")).toBe("a");
        expect(window.sessionStorage.getItem("adx.studio.refreshToken")).toBe("r");
        expect(window.localStorage.getItem("adx.web.accessToken")).toBeNull();
        expect(studioTokens.access).toBe("a");
        expect(studioTokens.refresh).toBe("r");
        studioTokens.clear();
        expect(studioTokens.access).toBeNull();
        expect(window.sessionStorage.getItem("adx.studio.accessToken")).toBeNull();
    });

    it("sends its bearer, refreshes once on a 401 and replays with the new token", async () => {
        studioTokens.set({ accessToken: "old", refreshToken: "r1" });
        const calls = stubFetch([
            { status: 401, body: { success: false, error: { code: "UNAUTHENTICATED", message: "expired" } } },
            { status: 200, body: { success: true, data: { accessToken: "new", refreshToken: "r2" } } },
            { status: 200, body: { success: true, data: { id: "u1", roles: ["ADMIN"] } } },
        ]);
        const me = await studioApi.get<{ id: string }>("/users/me");
        expect(me).toEqual({ id: "u1", roles: ["ADMIN"] });
        expect(calls).toHaveLength(3);
        expect(bearer(calls[0]!)).toBe("Bearer old");
        expect(calls[1]!.url).toMatch(/\/auth\/refresh$/);
        expect(JSON.parse(String(calls[1]!.init.body))).toEqual({ refreshToken: "r1" });
        expect(bearer(calls[2]!)).toBe("Bearer new");
        expect(studioTokens.access).toBe("new");
        expect(studioTokens.refresh).toBe("r2");
    });

    it("ends the session when the refresh fails too", async () => {
        studioTokens.set({ accessToken: "old", refreshToken: "dead" });
        stubFetch([
            { status: 401, body: { success: false, error: { code: "UNAUTHENTICATED" } } },
            { status: 401, body: { success: false, error: { code: "UNAUTHORIZED" } } },
        ]);
        await expect(studioApi.get("/users/me")).rejects.toMatchObject({ status: 401 });
        expect(studioTokens.access).toBeNull();
        expect(studioTokens.refresh).toBeNull();
    });

    it("unwraps a failure envelope into an ApiError that keeps the details", async () => {
        studioTokens.set({ accessToken: "t" });
        stubFetch([{ status: 400, body: { success: false, error: { code: "VALIDATION_ERROR", message: "2 problems", details: { issues: [{ index: 0, blockId: "a", path: "props.mediaId", message: "No picture" }] } } } }]);
        const caught = await studioApi.put("/layouts/WEB_HOME/draft", { blocks: [] }).catch((error: unknown) => error);
        expect(caught).toBeInstanceOf(ApiError);
        expect((caught as ApiError).code).toBe("VALIDATION_ERROR");
        expect(issuesByBlock((caught as ApiError).details).get("a")?.[0]?.message).toBe("No picture");
    });
});

describe("blocks and Puck's data", () => {
    const blocks: LayoutBlock[] = [
        { id: "a", type: "promo_banner", props: { headline: "Hi", target: { kind: "EXPLORE" } }, visibility: { sides: ["ADVERTISER"] }, hidden: true },
        { id: "b", type: "rich_text", props: { markdown: "x" } },
    ];

    it("round-trips blocks through Puck's data, the envelope riding along", () => {
        const data = toPuckData(blocks);
        expect(data.content[0]!.props.id).toBe("a");
        expect(data.content[0]!.props[ENVELOPE_KEY]).toEqual({ visibility: { sides: ["ADVERTISER"] }, hidden: true });
        expect(data.content[1]!.props[ENVELOPE_KEY]).toEqual({});
        expect(fromPuckData(data)).toEqual(blocks);
    });

    it("cleans what the fields leave behind: empty strings, empty objects, undefined — never 0 or false", () => {
        expect(cleanProps({ a: "", b: "x", c: { kind: "", value: "" }, d: [{ e: "", f: 1 }], g: 0, h: false, i: undefined, j: null })).toEqual({ b: "x", d: [{ f: 1 }], g: 0, h: false });
        expect(fromPuckData({ root: { props: {} }, content: [{ type: "listing_rail", props: { id: "r", value: "", count: 6, [ENVELOPE_KEY]: { visibility: { sides: [] } } } }] })).toEqual([{ id: "r", type: "listing_rail", props: { count: 6 } }]);
    });

    it("keeps a pinned block last whatever Puck was told", () => {
        const data = { root: { props: {} }, content: [{ type: "results", props: { id: "res" } }, { type: "promo_banner", props: { id: "p" } }] };
        expect(fromPuckData(data, ["results"]).map((block) => block.type)).toEqual(["promo_banner", "results"]);
        expect(keepPinnedLast(blocks, []).map((block) => block.id)).toEqual(["a", "b"]);
    });

    it("compares lists as they would save — key order and empty envelopes do not count", () => {
        const twin: LayoutBlock[] = [
            { type: "promo_banner", id: "a", hidden: true, visibility: { sides: ["ADVERTISER"] }, props: { target: { kind: "EXPLORE" }, headline: "Hi" } },
            { id: "b", type: "rich_text", props: { markdown: "x" }, visibility: {}, schedule: {} },
        ];
        expect(sameBlocks(blocks, twin)).toBe(true);
        expect(sameBlocks(blocks, [blocks[1]!, blocks[0]!])).toBe(false);
        expect(sameBlocks(blocks, [{ ...blocks[0]!, hidden: false }, blocks[1]!])).toBe(false);
    });

    it("starts a new block with what its required fields need", () => {
        expect(
            defaultProps([
                { key: "aspect", label: "Shape", input: "select", required: true, options: [{ value: "WIDE", label: "Wide" }] },
                { key: "count", label: "How many", input: "number", required: true, min: 2 },
                { key: "target", label: "Opens", input: "target", required: true },
                { key: "title", label: "Title", input: "text" },
                { key: "items", label: "Steps", input: "list", required: true, min: 2, of: [{ key: "n", label: "N", input: "number", required: true }] },
            ])
        ).toEqual({ aspect: "WIDE", count: 2, target: { kind: "EXPLORE" }, items: [{ n: 1 }, { n: 1 }] });
    });
});

describe("resolved props", () => {
    const blocks: LayoutBlock[] = [
        { id: "a", type: "promo_banner", props: { mediaId: "m1" } },
        { id: "b", type: "rich_text", props: { markdown: "x" } },
    ];

    it("lays the server's additions over each block's own props by id, and marks a dropped block", () => {
        const merged = mergeResolved(blocks, [{ id: "a", type: "promo_banner", props: { mediaId: "m1", media: { url: "https://cdn.test/x.jpg" } } }]);
        expect(merged.get("a")).toEqual({ props: { mediaId: "m1", media: { url: "https://cdn.test/x.jpg" } }, shown: true });
        expect(merged.get("b")).toEqual({ props: { markdown: "x" }, shown: false });
    });

    it("draws every block on its own props until a resolution has answered", () => {
        const merged = mergeResolved(blocks, null);
        expect(merged.get("b")).toEqual({ props: { markdown: "x" }, shown: true });
    });
});

describe("issues and permissions", () => {
    it("files the server's issues by block id, by index without one, and list-wide under an empty key", () => {
        const map = issuesByBlock({
            issues: [
                { index: 0, blockId: "a", type: "promo_banner", path: "props.mediaId", message: "No picture" },
                { index: 1, blockId: null, message: "Bad envelope" },
                { index: -1, message: "Too many blocks" },
                { nonsense: true },
            ],
        });
        expect([...map.keys()]).toEqual(["a", "#1", ""]);
        expect(map.get("a")?.[0]).toMatchObject({ path: "props.mediaId", message: "No picture" });
        expect(issuesByBlock(undefined).size).toBe(0);
    });

    it("names the permission a 403 misses", () => {
        const message = forbiddenMessage(new ApiError(403, "FORBIDDEN", "Insufficient permissions", { missing: ["content.approve"] }), "x");
        expect(message).toContain("Approve content");
        expect(message).toContain("content.approve");
        expect(forbiddenMessage(new ApiError(403, "FORBIDDEN", "Only an admin with content.addresses may change an address"), "x")).toContain("content.addresses");
        expect(forbiddenMessage(new Error("boom"), "fallback")).toBe("fallback");
    });
});

describe("paths and keys", () => {
    it("knows where each target's versions live", () => {
        expect(versionPath({ kind: "surface", surface: "WEB_HOME" })).toBe("/layouts/WEB_HOME");
        expect(versionPath({ kind: "custom", key: "diwali offers" })).toBe("/site/pages/diwali%20offers");
    });

    it("builds the real page's preview address", () => {
        expect(previewUrl("/diwali", "tok")).toBe("/diwali?preview=tok");
        expect(previewUrl("/spaces?x=1", "t")).toBe("/spaces?x=1&preview=t");
        expect(previewUrl("/", null)).toBe("/");
        expect(previewUrl("help", "t", "https://adx.in")).toBe("https://adx.in/help?preview=t");
        expect(hasPathParam("/spaces/:id")).toBe(true);
        expect(hasPathParam("/spaces")).toBe(false);
    });

    it("previews a custom page at /pg/<key> and a system page at its own address", () => {
        expect(previewPathFor({ kind: "CUSTOM", key: "diwali offers", path: "/diwali" })).toBe("/pg/diwali%20offers");
        expect(previewPathFor({ kind: "SYSTEM", key: "help", path: "/help" })).toBe("/help");
        expect(previewUrl(previewPathFor({ kind: "CUSTOM", key: "diwali", path: "/diwali" }), "tok")).toBe("/pg/diwali?preview=tok");
    });

    it("suggests a key from a title and checks an address", () => {
        expect(keyFromTitle("  Diwali Offers 2026!  ")).toBe("diwali-offers-2026");
        expect(keyFromTitle("---")).toBe("");
        expect(PATH_PATTERN.test("/diwali-offers")).toBe(true);
        expect(PATH_PATTERN.test("/a/b/c")).toBe(true);
        expect(PATH_PATTERN.test("/spaces/:id")).toBe(true);
        expect(PATH_PATTERN.test("/")).toBe(true);
        expect(PATH_PATTERN.test("/Diwali")).toBe(false);
        expect(PATH_PATTERN.test("/a/")).toBe(false);
        expect(PATH_PATTERN.test("no-slash")).toBe(false);
    });
});

describe("the version desk", () => {
    it("opens the same seven doors on a custom page and on a surface", async () => {
        studioTokens.set({ accessToken: "t" });
        const calls = stubFetch([{ status: 200, body: { success: true, data: {} } }]);
        const page = versionApi({ kind: "custom", key: "diwali" });
        await page.saveDraft({ blocks: [{ id: "a", type: "rich_text", props: { markdown: "x", extra: "" }, visibility: {} }], meta: { noindex: true } });
        expect(calls[0]!.url).toMatch(/\/site\/pages\/diwali\/draft$/);
        expect(calls[0]!.init.method).toBe("PUT");
        expect(JSON.parse(String(calls[0]!.init.body))).toEqual({ blocks: [{ id: "a", type: "rich_text", props: { markdown: "x" } }], meta: { noindex: true } });

        await page.preview({ version: "draft", side: "VISITOR", cityId: "c1" });
        expect(calls[1]!.url).toMatch(/\/site\/pages\/diwali\/preview\?version=draft&side=VISITOR&cityId=c1$/);

        await page.previewToken();
        expect(calls[2]!.url).toMatch(/\/site\/pages\/diwali\/preview-token$/);
        expect(calls[2]!.init.method).toBe("POST");

        const surface = versionApi({ kind: "surface", surface: "WEB_HOME" });
        await surface.publish("Diwali banner");
        expect(calls[3]!.url).toMatch(/\/layouts\/WEB_HOME\/publish$/);
        expect(JSON.parse(String(calls[3]!.init.body))).toEqual({ changeNote: "Diwali banner" });

        await surface.discardDraft();
        expect(calls[4]!.init.method).toBe("DELETE");
        await surface.restore(3);
        expect(calls[5]!.url).toMatch(/\/layouts\/WEB_HOME\/versions\/3\/restore$/);
        await surface.versions();
        expect(calls[6]!.url).toMatch(/\/layouts\/WEB_HOME\/versions$/);
    });
});
