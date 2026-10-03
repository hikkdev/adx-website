/* The jest-dom matchers are wired in vitest.setup.ts; this import is for their types, which tsc reads from here. */
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { tokens } from "@/lib/api-client";
import { apiConfig } from "@/lib/api-config";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { toast } from "sonner";
import { PrivateFileLink, PrivateImage } from "./private-file";

/**
 * ST-2 (28 Sep 2026): the picture and the link every screen draws a stored
 * file with. A private file is fetched with the bearer and drawn from an
 * object URL; a public one is an ordinary `<img>` / `<a>`; a refusal is
 * said, not drawn broken.
 */

const PRIVATE = "https://api.adx.in/api/v1/files/cm_photo7";
const PUBLIC = "https://cdn.adx.in/uploads/listings/front.jpg";

function stubFetch(status = 200) {
    const calls: { url: string; init: RequestInit }[] = [];
    vi.stubGlobal(
        "fetch",
        vi.fn(async (url: string, init: RequestInit) => {
            calls.push({ url, init });
            if (status !== 200) return new Response(JSON.stringify({ success: false, error: { code: "FORBIDDEN", message: "Not yours" } }), { status, headers: { "Content-Type": "application/json" } });
            return new Response("jpeg-bytes", { status: 200, headers: { "Content-Type": "image/jpeg" } });
        })
    );
    return calls;
}

beforeEach(() => {
    tokens.set({ accessToken: "acc-web-2" });
    URL.createObjectURL = vi.fn(() => "blob:https://adx.in/photo");
    URL.revokeObjectURL = vi.fn();
    vi.mocked(toast.error).mockClear();
});

afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    tokens.clear();
});

describe("PrivateImage", () => {
    it("draws a private file from the bytes fetched with the bearer", async () => {
        const calls = stubFetch();
        render(<PrivateImage src={PRIVATE} alt="Site photo" className="h-10" />);
        expect(screen.getByRole("img", { name: "Site photo" })).toHaveAttribute("aria-busy", "true");
        await vi.waitFor(() => expect(screen.getByRole("img", { name: "Site photo" })).toHaveAttribute("src", "blob:https://adx.in/photo"));
        expect(calls[0]!.url).toBe(`${apiConfig.baseUrl}/files/cm_photo7`);
        expect(new Headers(calls[0]!.init.headers).get("Authorization")).toBe("Bearer acc-web-2");
    });

    it("draws a public URL as it is, with no request", () => {
        const calls = stubFetch();
        render(<PrivateImage src={PUBLIC} alt="Front" />);
        expect(screen.getByRole("img", { name: "Front" })).toHaveAttribute("src", PUBLIC);
        expect(calls).toHaveLength(0);
    });

    it("says a 403 in the frame rather than drawing a broken image", async () => {
        stubFetch(403);
        render(<PrivateImage src={PRIVATE} alt="Site photo" />);
        expect(await screen.findByText("You can't open this file.")).toBeInTheDocument();
        expect(screen.getByRole("img", { name: "Site photo" }).tagName).toBe("DIV");
    });
});

describe("PrivateFileLink", () => {
    it("is an ordinary new-tab link for a public URL", () => {
        render(<PrivateFileLink url={PUBLIC} name="front.jpg" />);
        const link = screen.getByRole("link", { name: "front.jpg" });
        expect(link).toHaveAttribute("href", PUBLIC);
        expect(link).toHaveAttribute("target", "_blank");
    });

    it("fetches a private file with the bearer and opens it", async () => {
        const calls = stubFetch();
        const open = vi.spyOn(window, "open").mockReturnValue({ opener: null } as unknown as Window);
        render(<PrivateFileLink url={PRIVATE} name="Owner NOC" />);
        fireEvent.click(screen.getByRole("button", { name: "Owner NOC" }));
        await vi.waitFor(() => expect(open).toHaveBeenCalledWith("blob:https://adx.in/photo", "_blank"));
        expect(new Headers(calls[0]!.init.headers).get("Authorization")).toBe("Bearer acc-web-2");
    });

    it("says a 403 through onError, or a toast when the screen has no place for it", async () => {
        stubFetch(403);
        const onError = vi.fn();
        render(<PrivateFileLink url={PRIVATE} name="Owner NOC" onError={onError} />);
        fireEvent.click(screen.getByRole("button", { name: "Owner NOC" }));
        await vi.waitFor(() => expect(onError).toHaveBeenCalledWith("You can't open this file."));

        render(<PrivateFileLink url={PRIVATE} name="Address proof" />);
        fireEvent.click(screen.getByRole("button", { name: "Address proof" }));
        await vi.waitFor(() => expect(toast.error).toHaveBeenCalledWith("You can't open this file."));
    });
});
