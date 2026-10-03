import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api-client", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-client")>();
    return { ...actual, api: { get: vi.fn(async () => []), post: vi.fn(async () => ({})), patch: vi.fn(async () => ({})), put: vi.fn(), delete: vi.fn() } };
});

import { api } from "@/lib/api-client";
import {
    awarenessLabel,
    brandCampaignStatus,
    brandChip,
    brandInput,
    brandPatch,
    brandPill,
    brandsService,
    campaignsLine,
    chipStatus,
    countLine,
    industryLine,
    matchesBrand,
    newCampaignHref,
    normaliseUrl,
    sectorLabel,
    spentLabel,
    type BrandCard,
} from "./brands";

const card = (overrides: Partial<BrandCard> = {}): BrandCard => ({
    id: "b1",
    advertiserId: "a1",
    name: "Anita's Coffee",
    sector: "GENERAL",
    logoUrl: null,
    website: null,
    isActive: true,
    archived: false,
    awareness: null,
    industry: null,
    subCategory: null,
    campaigns: { total: 0, live: 0, scheduled: 0 },
    lifetimeSpend: "0.00",
    createdAt: "2026-03-04T00:00:00.000Z",
    ...overrides,
});

describe("the routes", () => {
    beforeEach(() => {
        vi.mocked(api.get).mockClear();
        vi.mocked(api.post).mockClear();
        vi.mocked(api.patch).mockClear();
    });

    it("lists, reads, adds and changes under the advertiser", async () => {
        await brandsService.list("a1");
        expect(api.get).toHaveBeenLastCalledWith("/advertisers/a1/brands");
        await brandsService.list("a1", "ARCHIVED");
        expect(api.get).toHaveBeenLastCalledWith("/advertisers/a1/brands?status=ARCHIVED");
        await brandsService.get("a1", "b 1");
        expect(api.get).toHaveBeenLastCalledWith("/advertisers/a1/brands/b%201");
        await brandsService.create("a1", { name: "Chai Point", sector: "GENERAL" });
        expect(api.post).toHaveBeenLastCalledWith("/advertisers/a1/brands", { name: "Chai Point", sector: "GENERAL" });
        await brandsService.update("a1", "b1", { isActive: false });
        expect(api.patch).toHaveBeenLastCalledWith("/advertisers/a1/brands/b1", { isActive: false });
    });
});

describe("what the pages print", () => {
    it("maps the chips to the server's status", () => {
        expect(brandChip("ARCHIVED")).toBe("ARCHIVED");
        expect(brandChip(null)).toBe("ALL");
        expect(chipStatus("ALL")).toBeUndefined();
        expect(chipStatus("ACTIVE")).toBe("ACTIVE");
    });

    it("prints the industry, else the sector", () => {
        expect(sectorLabel("INFANT_NUTRITION")).toBe("Infant nutrition");
        expect(industryLine(card({ sector: "REAL_ESTATE" }))).toBe("Real estate");
        expect(industryLine(card({ industry: "Quick service restaurant" }))).toBe("Quick service restaurant");
    });

    it("says what the counts can say, and closes the spend slot with no campaign", () => {
        expect(campaignsLine(card({ campaigns: { total: 3, live: 2, scheduled: 1 } }))).toBe("2 live campaigns");
        expect(campaignsLine(card({ campaigns: { total: 1, live: 0, scheduled: 1 } }))).toBe("1 scheduled campaign");
        expect(campaignsLine(card())).toBe("No live campaigns");
        expect(spentLabel(card())).toBeNull();
        expect(spentLabel(card({ campaigns: { total: 1, live: 0, scheduled: 0 }, lifetimeSpend: "43400.00" }))).toBe("₹43,400 spent");
    });

    it("draws the pill, the awareness and the counts", () => {
        expect(brandPill(card({ archived: true }))).toEqual({ label: "Archived", tone: "neutral" });
        expect(brandPill(card())).toEqual({ label: "Active", tone: "success" });
        expect(awarenessLabel("BRAND_NEW")).toBe("Brand new");
        expect(awarenessLabel("ALREADY_ESTABLISHED")).toBe("Already established");
        expect(awarenessLabel(null)).toBeNull();
        expect(countLine(1)).toBe("1 brand");
        expect(countLine(3)).toBe("3 brands");
        expect(brandCampaignStatus("LIVE")).toEqual({ label: "Live", tone: "success" });
        expect(brandCampaignStatus("ON_HOLD")).toEqual({ label: "On hold", tone: "neutral" });
    });

    it("searches the name, the industry and the sector", () => {
        expect(matchesBrand(card(), "  ")).toBe(true);
        expect(matchesBrand(card(), "anita")).toBe(true);
        expect(matchesBrand(card({ sector: "HEALTHCARE" }), "health")).toBe(true);
        expect(matchesBrand(card(), "pharma")).toBe(false);
    });

    it("sends a new campaign to the builder with the brand on it", () => {
        expect(newCampaignHref("b 1")).toBe("/advertiser/campaigns/new?brandId=b%201");
    });
});

describe("the form", () => {
    it("refuses what the server would, in the page's words", () => {
        expect(brandInput({ name: "  ", sector: "GENERAL", website: "" })).toEqual({ ok: false, message: "Give the brand a name." });
        expect(brandInput({ name: "x".repeat(121), sector: "GENERAL", website: "" }).ok).toBe(false);
        expect(brandInput({ name: "Chai", sector: "CRYPTO", website: "" }).ok).toBe(false);
        expect(brandInput({ name: "Chai", sector: "GENERAL", website: "not a site" }).ok).toBe(false);
    });

    it("sends a trimmed name, the sector and a full address", () => {
        expect(brandInput({ name: " Chai Point ", sector: "GENERAL", website: "chaipoint.in" })).toEqual({ ok: true, input: { name: "Chai Point", sector: "GENERAL", website: "https://chaipoint.in" } });
        expect(brandInput({ name: "Chai", sector: "PHARMA", website: "", logoUrl: "http://cdn.example.com/l.png" })).toEqual({ ok: true, input: { name: "Chai", sector: "PHARMA", logoUrl: "http://cdn.example.com/l.png" } });
        expect(normaliseUrl("localhost")).toBeNull();
        expect(normaliseUrl("https://example.com/a")).toBe("https://example.com/a");
    });

    it("patches only what changed", () => {
        const before = { name: "Chai", sector: "GENERAL", website: "https://chai.in", logoUrl: null };
        expect(brandPatch(before, { name: "Chai", sector: "GENERAL", website: "https://chai.in" })).toEqual({});
        expect(brandPatch(before, { name: "Chai Point", sector: "FINANCIAL" })).toEqual({ name: "Chai Point", sector: "FINANCIAL" });
        expect(brandPatch(before, { name: "Chai", sector: "GENERAL", logoUrl: "https://x.in/l.png" })).toEqual({ logoUrl: "https://x.in/l.png" });
    });
});
