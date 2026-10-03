import "@testing-library/jest-dom/vitest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const flags = { loaded: true, on: true };
vi.mock("@/lib/flags", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/flags")>()), useFlag: () => flags.on, useFlagsLoaded: () => flags.loaded }));
vi.mock("next/navigation", () => ({
    useParams: () => ({}),
    useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
    usePathname: () => "/publisher/promotions",
    useSearchParams: () => new URLSearchParams(),
}));

let boosts: unknown = [];
const get = vi.fn(async (path: string): Promise<unknown> => {
    if (path === "/promotions/boosts/mine") {
        if (boosts instanceof Error) throw boosts;
        return boosts;
    }
    if (path.startsWith("/publishers/me/listings")) return { items: [{ id: "l1", displayId: "LST-0110-2601", title: "MG Road hoarding", city: "Bengaluru", status: "ACTIVE" }], total: 1, page: 1, pageSize: 100, counts: {} };
    return {};
});
vi.mock("@/lib/api-client", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-client")>();
    return { ...actual, api: { get: (path: string) => get(path), post: vi.fn(), patch: vi.fn(), put: vi.fn(), delete: vi.fn() } };
});

import { ApiError } from "@/lib/api-client";
import SponsoredListingsPage from "./page";

describe("Sponsored listings", () => {
    beforeEach(() => {
        flags.loaded = true;
        flags.on = true;
        boosts = [];
        get.mockClear();
    });

    it("lists each boost with its listing, placements, dates, status, stats and total", async () => {
        boosts = [
            {
                id: "b1",
                displayId: "BST-0110-2601",
                listingId: "l1",
                placements: ["SEARCH_TOP", "SIMILAR_TOP"],
                city: "Bengaluru",
                category: "OUTDOOR",
                startDate: "2026-10-05T00:00:00.000Z",
                endDate: "2026-10-11T00:00:00.000Z",
                days: 7,
                subtotal: "5600.00",
                gstAmount: "1008.00",
                total: "6608.00",
                status: "SCHEDULED",
                stats: { impressions: 1200, clicks: 36, ctr: 0.03, byDay: [] },
            },
        ];
        render(<SponsoredListingsPage />);
        expect(await screen.findByText("MG Road hoarding")).toBeInTheDocument();
        expect(screen.getByText("Top of search + Top of similar listings")).toBeInTheDocument();
        expect(screen.getByText("5 Oct 2026 – 11 Oct 2026 · 7 days")).toBeInTheDocument();
        expect(screen.getByText("Scheduled")).toBeInTheDocument();
        expect(screen.getByText("1,200 · 36")).toBeInTheDocument();
        expect(screen.getByText("₹6,608.00")).toBeInTheDocument();
        expect(screen.getAllByRole("link", { name: "Sponsor a listing" })[0]).toHaveAttribute("href", "/publisher/promotions/new");
    });

    it("has an honest empty state", async () => {
        render(<SponsoredListingsPage />);
        expect(await screen.findByText("No sponsored listings yet")).toBeInTheDocument();
    });

    it("offers no buying door while the switch is off", () => {
        flags.on = false;
        render(<SponsoredListingsPage />);
        expect(screen.getByTestId("boosts-closed")).toBeInTheDocument();
        expect(screen.queryByRole("link", { name: "Sponsor a listing" })).not.toBeInTheDocument();
        expect(get).not.toHaveBeenCalled();
    });

    it("reads a 503 FEATURE_OFF as not open yet", async () => {
        boosts = new ApiError(503, "FEATURE_OFF", "Sponsored listings are off.");
        render(<SponsoredListingsPage />);
        expect(await screen.findByTestId("boosts-closed")).toBeInTheDocument();
    });
});
