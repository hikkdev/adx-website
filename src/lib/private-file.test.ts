import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { tokens } from "./api-client";
import { apiConfig } from "./api-config";
import { downloadNameFor, fetchPrivateFile, isPrivateFileUrl, openPrivateFile, PRIVATE_FILE_MESSAGES, privateFileIdOf, privateFileMessage, resolveFileHref } from "./private-file";

/**
 * ST-2 (28 Sep 2026): a venue paper or an audience report is a private file
 * — `${BASE_URL}/api/v1/files/:id`, answered only with the bearer. Pinned:
 * such a URL is fetched with the session's token (the redirect followed),
 * a public URL is passed through with no request, and a 403 reads "You
 * can't open this file."
 */

const PRIVATE = "https://api.adx.in/api/v1/files/cm_paper1";
const PUBLIC = "https://cdn.adx.in/uploads/verification/noc-scan.pdf";

type Call = { url: string; init: RequestInit };

function stubFetch(answer: { status?: number; body?: BodyInit; type?: string } = {}) {
    const calls: Call[] = [];
    vi.stubGlobal(
        "fetch",
        vi.fn(async (url: string, init: RequestInit) => {
            calls.push({ url, init });
            const status = answer.status ?? 200;
            if (status !== 200) return new Response(JSON.stringify({ success: false, error: { code: "FORBIDDEN", message: "Not yours" } }), { status, headers: { "Content-Type": "application/json" } });
            return new Response(answer.body ?? "%PDF-1.7", { status: 200, headers: { "Content-Type": answer.type ?? "application/pdf" } });
        })
    );
    return calls;
}

let objectUrls = 0;

beforeEach(() => {
    tokens.set({ accessToken: "acc-web-1" });
    objectUrls = 0;
    URL.createObjectURL = vi.fn(() => `blob:https://adx.in/obj-${++objectUrls}`);
    URL.revokeObjectURL = vi.fn();
});

afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    tokens.clear();
});

describe("which URLs are private", () => {
    it("knows `/api/v1/files/:id` on any host, and the bare `/files/:id` path, from anything else", () => {
        expect(privateFileIdOf(PRIVATE)).toBe("cm_paper1");
        expect(privateFileIdOf("http://localhost:3000/api/v1/files/abc-123?x=1")).toBe("abc-123");
        expect(privateFileIdOf("/api/v1/files/abc")).toBe("abc");
        expect(privateFileIdOf("/files/abc")).toBe("abc");
        expect(privateFileIdOf(PUBLIC)).toBeNull();
        expect(privateFileIdOf("https://cdn.adx.in/uploads/files/abc")).toBeNull();
        expect(privateFileIdOf("blob:https://adx.in/1")).toBeNull();
        expect(privateFileIdOf(null)).toBeNull();
        expect(isPrivateFileUrl(PRIVATE)).toBe(true);
        expect(isPrivateFileUrl(PUBLIC)).toBe(false);
    });
});

describe("a private file", () => {
    it("is fetched from the API with the session's bearer, the redirect followed", async () => {
        const calls = stubFetch();
        const blob = await fetchPrivateFile(PRIVATE);
        expect(await blob.text()).toBe("%PDF-1.7");
        expect(calls).toHaveLength(1);
        expect(calls[0]!.url).toBe(`${apiConfig.baseUrl}/files/cm_paper1`);
        expect(new Headers(calls[0]!.init.headers).get("Authorization")).toBe("Bearer acc-web-1");
        expect(calls[0]!.init.redirect).toBe("follow");
    });

    it("becomes an object URL an <img> can hold, released when done", async () => {
        stubFetch({ type: "image/jpeg", body: "jpeg" });
        const resolved = await resolveFileHref(PRIVATE);
        expect(resolved.href).toBe("blob:https://adx.in/obj-1");
        resolved.release();
        expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:https://adx.in/obj-1");
    });

    it("opens in a new tab when it is a PDF", async () => {
        stubFetch();
        const tab = { opener: {} as unknown };
        const open = vi.spyOn(window, "open").mockReturnValue(tab as unknown as Window);
        await openPrivateFile(PRIVATE, "Display agreement");
        expect(open).toHaveBeenCalledWith("blob:https://adx.in/obj-1", "_blank");
        expect(tab.opener).toBeNull();
    });

    it("is saved instead when the browser blocked the tab, named with its extension", async () => {
        stubFetch();
        vi.spyOn(window, "open").mockReturnValue(null);
        const clicked: HTMLAnchorElement[] = [];
        vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
            clicked.push(this);
        });
        await openPrivateFile(PRIVATE, "Display agreement");
        expect(clicked).toHaveLength(1);
        expect(clicked[0]!.download).toBe("Display agreement.pdf");
        expect(clicked[0]!.href).toBe("blob:https://adx.in/obj-2");
    });

    it("is never opened in place when it could carry script (an SVG) — it is saved", async () => {
        stubFetch({ type: "image/svg+xml", body: "<svg/>" });
        const open = vi.spyOn(window, "open");
        const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
        await openPrivateFile(PRIVATE, "plan");
        expect(open).not.toHaveBeenCalled();
        expect(click).toHaveBeenCalledTimes(1);
    });

    it("refused with a 403 says \"You can't open this file.\"", async () => {
        stubFetch({ status: 403 });
        await expect(fetchPrivateFile(PRIVATE)).rejects.toThrow("You can't open this file.");
        await expect(openPrivateFile(PRIVATE, "NOC")).rejects.toThrow(PRIVATE_FILE_MESSAGES.forbidden);
    });

    it("gone (404) or signed out (401) is said in its own words", async () => {
        stubFetch({ status: 404 });
        await expect(fetchPrivateFile(PRIVATE)).rejects.toThrow(PRIVATE_FILE_MESSAGES.gone);
        tokens.clear();
        stubFetch({ status: 401 });
        await expect(fetchPrivateFile(PRIVATE)).rejects.toThrow(PRIVATE_FILE_MESSAGES.signedOut);
        expect(privateFileMessage(new Error("boom"))).toBe(PRIVATE_FILE_MESSAGES.failed);
    });
});

describe("a public URL", () => {
    it("is passed through with no request — drawn and opened as before", async () => {
        const calls = stubFetch();
        const resolved = await resolveFileHref(PUBLIC);
        expect(resolved.href).toBe(PUBLIC);
        const open = vi.spyOn(window, "open").mockReturnValue(null);
        await openPrivateFile(PUBLIC, "NOC");
        expect(open).toHaveBeenCalledWith(PUBLIC, "_blank", "noopener,noreferrer");
        expect(calls).toHaveLength(0);
    });
});

describe("the saved name", () => {
    it("keeps an extension it has and adds one from the bytes when it has none", () => {
        expect(downloadNameFor("noc.pdf", "application/pdf")).toBe("noc.pdf");
        expect(downloadNameFor("Private document", "image/jpeg")).toBe("Private document.jpg");
        expect(downloadNameFor("Footfall audit", "application/octet-stream")).toBe("Footfall audit");
        expect(downloadNameFor("  ", "application/pdf")).toBe("document.pdf");
    });
});
