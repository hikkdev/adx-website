/* The jest-dom matchers are wired in vitest.setup.ts; this import is for their types, which tsc reads from here. */
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AvailabilityCalendar } from "./availability-calendar";
import { addDays, browseService, spanDays, type AvailabilityDay, type ListingAvailability } from "@/services/browse";

const TODAY = "2026-09-27";

/** A screen of six slots: 27 Sep–5 Oct partly booked, 6–15 Oct booked, 16 Oct blocked, the rest free. */
function screenDays(from: string, to: string): AvailabilityDay[] {
    const out: AvailabilityDay[] = [];
    for (let date = from; date <= to; date = addDays(date, 1)) {
        if (date <= "2026-10-05") out.push({ date, held: 2, left: 4, blocked: false });
        else if (date <= "2026-10-15") out.push({ date, held: 6, left: 0, blocked: false });
        else if (date === "2026-10-16") out.push({ date, held: 6, left: 0, blocked: true });
        else out.push({ date, held: 0, left: 6, blocked: false });
    }
    return out;
}

function answer(from: string, to: string, length?: number): ListingAvailability {
    const days = screenDays(from, to);
    return {
        listingId: "l1",
        slotsTotal: 6,
        from,
        to,
        days,
        nextFreeDate: from,
        nextFit: length ? { from: "2026-10-17", to: addDays("2026-10-17", length - 1) } : null,
        freeDays: days.filter((d) => d.left > 0).length,
    };
}

describe("AV-1: the availability calendar", () => {
    afterEach(() => vi.restoreAllMocks());

    it("colours each day with its state in words, and has a legend", async () => {
        vi.spyOn(browseService, "availability").mockImplementation(async (_id, q = {}) => answer(q.from!, q.to!, q.length));
        render(<AvailabilityCalendar listingId="l1" slotsTotal={6} digital today={TODAY} />);
        await waitFor(() => expect(screen.getByTestId("availability-next-free")).toHaveTextContent("Free today"));
        expect(screen.getByText("September 2026")).toBeInTheDocument();
        expect(screen.getByText("October 2026")).toBeInTheDocument();

        const cell = (date: string) => document.querySelector<HTMLButtonElement>(`[data-date="${date}"]`)!;
        expect(cell("2026-09-20")).toHaveAttribute("data-state", "past");
        expect(cell("2026-09-28")).toHaveAttribute("data-state", "partly");
        expect(cell("2026-09-28")).toHaveAccessibleName("Mon 28 Sep · Partly booked · 4 of 6 slots left");
        expect(cell("2026-09-28")).toHaveTextContent("4/6");
        expect(cell("2026-10-10")).toHaveAttribute("data-state", "booked");
        expect(cell("2026-10-16")).toHaveAccessibleName("Fri 16 Oct · Blocked by the publisher");
        expect(cell("2026-10-20")).toHaveAttribute("data-state", "free");

        const legend = screen.getByTestId("availability-legend");
        for (const word of ["Free", "Partly booked", "Booked", "Blocked by the publisher", "Past"]) expect(legend).toHaveTextContent(word);

        fireEvent.click(cell("2026-09-28"));
        expect(screen.getByTestId("availability-detail")).toHaveTextContent("Mon 28 Sep · Partly booked · 4 of 6 slots left");
    });

    it("walks the days with the arrow keys, one day in the tab order", async () => {
        vi.spyOn(browseService, "availability").mockImplementation(async (_id, q = {}) => answer(q.from!, q.to!, q.length));
        render(<AvailabilityCalendar listingId="l1" slotsTotal={6} digital today={TODAY} />);
        await waitFor(() => expect(screen.getByTestId("availability-next-free")).toHaveTextContent("Free today"));
        const today = document.querySelector<HTMLButtonElement>(`[data-date="${TODAY}"]`)!;
        expect(today).toHaveAttribute("tabindex", "0");
        today.focus();
        fireEvent.keyDown(today, { key: "ArrowDown" });
        await waitFor(() => expect(document.activeElement).toHaveAttribute("data-date", "2026-10-04"));
        expect(screen.getByTestId("availability-detail")).toHaveTextContent("Sun 4 Oct");
    });

    it("says the visitor's dates are taken, suggests a run of the same length, and applies it", async () => {
        const read = vi.spyOn(browseService, "availability").mockImplementation(async (_id, q = {}) => answer(q.from!, q.to!, q.length));
        const onApply = vi.fn();
        render(<AvailabilityCalendar listingId="l1" slotsTotal={1} digital={false} chosen={{ from: "2026-10-08", to: "2026-10-14" }} onApply={onApply} today={TODAY} />);
        await waitFor(() => expect(screen.getByTestId("availability-verdict")).toHaveTextContent("These dates are taken."));
        expect(screen.getByTestId("availability-verdict")).toHaveTextContent("Free for 7 days from 17 Oct: 17–23 Oct");
        expect(read.mock.calls[0]![1]).toMatchObject({ from: TODAY, length: 7, quantity: 1 });
        expect(spanDays(read.mock.calls[0]![1]!.from!, read.mock.calls[0]![1]!.to!)).toBe(186);
        /* A static wall has no "partly booked" in its legend. */
        expect(screen.getByTestId("availability-legend")).not.toHaveTextContent("Partly booked");
        fireEvent.click(screen.getByRole("button", { name: "Use 17–23 Oct" }));
        expect(onApply).toHaveBeenCalledWith("2026-10-17", "2026-10-23");
    });

    it("says so when the visitor's dates are free", async () => {
        vi.spyOn(browseService, "availability").mockImplementation(async (_id, q = {}) => answer(q.from!, q.to!, q.length));
        render(<AvailabilityCalendar listingId="l1" slotsTotal={6} digital chosen={{ from: "2026-10-20", to: "2026-10-26" }} today={TODAY} />);
        await waitFor(() => expect(screen.getByTestId("availability-verdict")).toHaveTextContent("Your dates are free. 20–26 Oct · 7 days"));
        expect(screen.queryByRole("button", { name: /^Use / })).toBeNull();
    });
});
