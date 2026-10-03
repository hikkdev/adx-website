import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api-client", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-client")>();
    return { ...actual, api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() } };
});

import { api } from "@/lib/api-client";
import { contributionLabel, INVENTORY_SORTS, marketsPatch, plannerService } from "./planner";
import { campaignStatusLine, chipStatuses } from "./advertiser-workspace";

const mocked = api as unknown as Record<"get" | "post", ReturnType<typeof vi.fn>>;

beforeEach(() => {
    mocked.get.mockReset();
    mocked.post.mockReset();
});

describe("several markets", () => {
    it("sends the list with its first market as the single field, a list of one clearing a second", () => {
        expect(marketsPatch(["Bengaluru", "Mysuru", "Bengaluru"])).toMatchObject({ targetingMethod: "MARKET_OR_DMA", targetMarket: "Bengaluru", targetLocation: "Bengaluru", targetMarkets: ["Bengaluru", "Mysuru"], pois: [] });
        expect(marketsPatch([" Pune "]).targetMarkets).toEqual(["Pune"]);
    });
});

describe("the shortlist", () => {
    it("offers the app's three orders and prints each reason's share of the score", () => {
        expect(INVENTORY_SORTS.map((s) => s.id)).toEqual(["BEST_MATCH", "LOWEST_RATE", "MOST_REACH"]);
        expect(contributionLabel(18.4)).toBe("+18");
        expect(contributionLabel(-3)).toBe("−3");
    });

    it("asks for the inventory in the chosen order", async () => {
        mocked.get.mockResolvedValue([]);
        await plannerService.inventory("c1", { sort: "LOWEST_RATE", limit: 50 });
        expect(mocked.get).toHaveBeenCalledWith("/campaigns/c1/inventory?sort=LOWEST_RATE&limit=50");
    });
});

describe("brands and categories", () => {
    it("reads a brand to start a campaign under, and the content categories defensively", async () => {
        mocked.get.mockResolvedValueOnce({ id: "b1", name: "Aster" });
        await plannerService.brand("a1", "b1");
        expect(mocked.get).toHaveBeenCalledWith("/advertisers/a1/brands/b1");
        mocked.get.mockResolvedValueOnce({ not: "a list" });
        expect(await plannerService.contentCategories()).toEqual([]);
        mocked.post.mockResolvedValueOnce({ id: "c1" });
        await plannerService.create({ name: "Aster", brandId: "b1" });
        expect(mocked.post).toHaveBeenCalledWith("/campaigns", { name: "Aster", brandId: "b1" });
    });
});

describe("the workspace list and the KYC hold", () => {
    it("filters by the four chips and still honours the old ones", () => {
        expect(chipStatuses("DRAFTS")).toEqual(["DRAFT"]);
        expect(chipStatuses("COMPLETED")).toEqual(["COMPLETED", "CANCELLED"]);
    });

    it("tells a paid campaign held for verification to verify, not to open the app", () => {
        const line = campaignStatusLine({ status: "SCHEDULED", startDate: "2026-10-12T00:00:00", endDate: "2026-10-25T00:00:00", creatives: [], launchBlockedBy: ["KYC"], refund: null });
        expect(line).toMatch(/Verify your identity/);
        expect(line).not.toMatch(/ADX app/);
    });
});
