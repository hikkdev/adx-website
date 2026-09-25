/* The jest-dom matchers are wired in vitest.setup.ts; this import is for their types, which tsc reads from here. */
import "@testing-library/jest-dom/vitest";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ReservationPanel } from "./reservation-panel";
import { PrintChoice } from "./print-choice";
import type { ReservationView } from "@/services/reservation";

const reservation = (over: Partial<ReservationView> = {}): ReservationView => ({
    fee: "12947.80",
    status: "DUE",
    dueAt: new Date(Date.now() + 42 * 60_000).toISOString(),
    paidAt: null,
    holdUntil: new Date(Date.now() + 23 * 3_600_000).toISOString(),
    retained: null,
    payable: "246008.10",
    paymentId: null,
    ...over,
});

describe("RF-1: the reservation panel", () => {
    it("names the state, counts down to the fee's due time, and carries the caller's buttons", () => {
        render(
            <ReservationPanel reservation={reservation()} retainPct={10}>
                <button type="button">Pay from my wallet</button>
            </ReservationPanel>
        );
        expect(screen.getByText("Reservation fee due")).toBeInTheDocument();
        expect(screen.getByText(/Fee due in/).closest("p")).toHaveTextContent("Fee due in 42 min");
        expect(screen.getByText(/Pay the INR 12947.80 reservation fee within 42 min/)).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Pay from my wallet" })).toBeInTheDocument();
    });

    it("shows the hold and the balance once the fee is paid", () => {
        render(<ReservationPanel reservation={reservation({ status: "PAID", paidAt: new Date().toISOString() })} retainPct={10} />);
        expect(screen.getByText("Spots reserved")).toBeInTheDocument();
        expect(screen.getByText(/Held for/).closest("p")).toHaveTextContent("Held for 23 h");
        expect(screen.getByText(/Balance to pay:/)).toHaveTextContent("₹2,46,008");
    });
});

describe("PS-1: the per-space print choice", () => {
    it("follows the campaign's choice until a space is given its own, and lets it go again", () => {
        const onChange = vi.fn();
        const { rerender } = render(<PrintChoice value={null} campaignChoice="ADVERTISER_SHIPS" onChange={onChange} />);
        expect(screen.getByRole("radio", { name: "I'll ship my own prints" })).toHaveAttribute("aria-checked", "true");
        expect(screen.getByText("Campaign's choice")).toBeInTheDocument();
        fireEvent.click(screen.getByRole("radio", { name: "ADX prints" }));
        expect(onChange).toHaveBeenCalledWith("ADX_PRINTS");

        rerender(<PrintChoice value="ADX_PRINTS" campaignChoice="ADVERTISER_SHIPS" onChange={onChange} />);
        expect(screen.getByRole("radio", { name: "ADX prints" })).toHaveAttribute("aria-checked", "true");
        fireEvent.click(screen.getByRole("button", { name: "Use the campaign's choice" }));
        expect(onChange).toHaveBeenLastCalledWith(null);
    });
});
