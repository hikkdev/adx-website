/* The jest-dom matchers are wired in vitest.setup.ts; this import is for their types, which tsc reads from here. */
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { ClashList } from "./clash-hint";
import { browseService } from "@/services/browse";

describe("AV-1: a clash says when the space is free again", () => {
    afterEach(() => vi.restoreAllMocks());

    it("reads each clashing space for the campaign's length and the spot's quantity, and links to its calendar", async () => {
        const read = vi.spyOn(browseService, "availability").mockResolvedValue({
            listingId: "l1",
            slotsTotal: 1,
            from: "2026-09-27",
            to: "2027-03-31",
            days: [],
            nextFreeDate: "2026-10-11",
            nextFit: { from: "2026-10-16", to: "2026-10-22" },
            freeDays: 120,
        });
        render(<ClashList clashes={[{ spotId: "s1", listingId: "l1", title: "KIA Trumpet Junction" }]} length={7} quantityOf={() => 2} campaignDates={{ from: "2026-10-08T00:00:00.000Z", to: "2026-10-14T00:00:00.000Z" }} />);
        await waitFor(() => expect(screen.getByTestId("clash-hint")).toHaveTextContent("Free from 11 Oct · Fits 16–22 Oct"));
        expect(read.mock.calls[0]![0]).toBe("l1");
        expect(read.mock.calls[0]![1]).toMatchObject({ length: 7, quantity: 2 });
        expect(screen.getByRole("link", { name: "See its calendar" })).toHaveAttribute("href", "/spaces/l1?from=2026-10-08&to=2026-10-14#availability");
    });
});
