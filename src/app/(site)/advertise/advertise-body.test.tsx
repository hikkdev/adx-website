import "@testing-library/jest-dom/vitest";
import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { AdvertiseBody, BOOK_AD_HREF, SPONSOR_HREF, whereLabel } from "./advertise-body";

/* PB-3: the body reads its layout for whoever is looking; here a visitor, with the server's (null) read in hand. */
vi.mock("@/lib/auth", () => ({ useAuth: () => ({ status: "signed-out", party: null, parties: [] }) }));

describe("Advertise with ADX", () => {
    it("lists the slots and the placements with their prices, sizes and labels", () => {
        render(
            <AdvertiseBody
                slots={[{ key: "listing-sidebar", label: "Listing page sidebar", description: "Beside every listing's booking card.", surfaces: ["WEB_LISTING"], spec: "AD_SIDEBAR", ratePerDay: "1500.00", minDays: 3, maxConcurrent: 4 }]}
                placements={[
                    { placement: "SEARCH_TOP", label: "Top of search", ratePerDay: "500.00", minDays: 1, maxConcurrent: 3 },
                    { placement: "SIMILAR_TOP", label: "Top of similar", ratePerDay: "300.00", minDays: 7, maxConcurrent: 2 },
                ]}
                initialLayout={null}
            />
        );
        expect(screen.getByRole("heading", { level: 1, name: "Advertise with ADX" })).toBeInTheDocument();
        const slots = screen.getByTestId("advertise-slots");
        expect(within(slots).getByText("Listing page sidebar")).toBeInTheDocument();
        expect(within(slots).getByText("Every listing page on adx.in")).toBeInTheDocument();
        expect(within(slots).getByText(/600 × 750 px/)).toBeInTheDocument();
        expect(within(slots).getByText("₹1,500 / day")).toBeInTheDocument();
        expect(within(slots).getByText("Up to 3 other ads a day")).toBeInTheDocument();
        const placements = screen.getByTestId("advertise-placements");
        expect(within(placements).getByText("Top of search")).toBeInTheDocument();
        expect(within(placements).getByText("₹300 / day")).toBeInTheDocument();
        expect(screen.getByText("Every display ad is marked “Ad” where it shows.")).toBeInTheDocument();
        expect(screen.getByText(/marked “Sponsored” wherever/)).toBeInTheDocument();
        expect(screen.getByText(/refunded to your ADX wallet/)).toBeInTheDocument();
        expect(screen.getByRole("link", { name: "Book an ad" })).toHaveAttribute("href", BOOK_AD_HREF);
        expect(screen.getByRole("link", { name: "Sponsor a listing" })).toHaveAttribute("href", SPONSOR_HREF);
    });

    it("says prices are shown at booking when the reads came back empty", () => {
        render(<AdvertiseBody slots={null} placements={[]} initialLayout={null} />);
        expect(screen.getAllByText("Prices are shown at booking.")).toHaveLength(2);
        expect(screen.queryByTestId("advertise-slots")).not.toBeInTheDocument();
    });

    it("words where a slot shows", () => {
        expect(whereLabel(["WEB_LISTING", "WEB_EXPLORE"])).toBe("Every listing page on adx.in and Explore on adx.in");
        expect(whereLabel([])).toBe("Across ADX");
    });
});
