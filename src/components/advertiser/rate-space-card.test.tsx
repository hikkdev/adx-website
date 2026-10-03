import "@testing-library/jest-dom/vitest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

/* "Rate this space" behind the `marketplace.reviews` kill switch. */

const off = new Set<string>();
vi.mock("@/lib/flags", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/lib/flags")>()),
    useSwitchedOff: (key: string) => off.has(key),
}));

const post = vi.fn<(path: string, body: unknown) => Promise<unknown>>(async () => ({}));
vi.mock("@/lib/api-client", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-client")>();
    return { ...actual, api: { get: vi.fn(), post: (path: string, body: unknown) => post(path, body), patch: vi.fn(), put: vi.fn(), delete: vi.fn() } };
});

import { FLAG_REVIEWS } from "@/lib/flags";
import { RateSpaceCard } from "./rate-space-card";

describe("RateSpaceCard", () => {
    beforeEach(() => {
        off.clear();
        post.mockClear();
    });

    it("draws nothing while reviews are switched off — not even the earlier-review note", () => {
        off.add(FLAG_REVIEWS);
        const { container, rerender } = render(<RateSpaceCard campaignId="c1" spotId="s1" spaceTitle="MG Road hoarding" />);
        expect(container).toBeEmptyDOMElement();
        rerender(<RateSpaceCard campaignId="c1" spotId="s1" spaceTitle="MG Road hoarding" reviewed />);
        expect(container).toBeEmptyDOMElement();
        expect(post).not.toHaveBeenCalled();
    });

    it("offers the rating while reviews are on", () => {
        render(<RateSpaceCard campaignId="c1" spotId="s1" spaceTitle="MG Road hoarding" />);
        expect(screen.getByText("Rate this space")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Send review" })).toBeInTheDocument();
    });
});
