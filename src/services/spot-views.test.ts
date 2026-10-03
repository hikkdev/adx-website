import { beforeEach, describe, expect, it, vi } from "vitest";

const post = vi.fn();
vi.mock("@/lib/api-client", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-client")>();
    return { ...actual, api: { ...actual.api, post: (...args: unknown[]) => post(...args) } };
});

import { countSpotView } from "./browse";

/* The listing-data-gaps lot: the public spot page counts one view per page view, and a failure never reaches the page. */
describe("counting a view of a spot's page", () => {
    beforeEach(() => {
        post.mockReset();
        post.mockResolvedValue({ counted: true });
    });

    it("posts one WEB view to the spot's view door", () => {
        expect(countSpotView("lst-1", 1_000)).toBe(true);
        expect(post).toHaveBeenCalledWith("/listings/lst-1/view", { source: "WEB" });
    });

    it("counts the page drawn twice in a row once, and a later visit again", () => {
        expect(countSpotView("lst-2", 10_000)).toBe(true);
        expect(countSpotView("lst-2", 10_050)).toBe(false);
        expect(countSpotView("lst-2", 20_000)).toBe(true);
        expect(post).toHaveBeenCalledTimes(2);
    });

    it("stays quiet when the server refuses — an older server, the feature off, the rate limit", async () => {
        post.mockRejectedValue(new Error("404"));
        expect(countSpotView("lst-3", 1_000)).toBe(true);
        await Promise.resolve();
        expect(countSpotView("")).toBe(false);
    });
});
