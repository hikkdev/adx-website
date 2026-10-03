/* The jest-dom matchers are wired in vitest.setup.ts; this import is for their types. */
import "@testing-library/jest-dom/vitest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

vi.mock("next/navigation", () => ({
    useParams: () => ({}),
    useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
    usePathname: () => "/publisher/promotions",
    useSearchParams: () => new URLSearchParams(),
}));

/* The kill switches the platform has said are off (lib/flags `useSwitchedOff`). */
let switchedOff = new Set<string>();
vi.mock("@/lib/flags", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/flags")>()), useSwitchedOff: (key: string) => switchedOff.has(key) }));

const get = vi.fn(async (path: string): Promise<unknown> => {
    if (path === "/payouts/wallet") return { walletId: "w1", balance: "20000.00", goodwill: "0.00", spendable: "20000.00", pendingClearance: "0.00", held: "0.00", openWithdrawals: "0.00", withdrawable: "20000.00", lastActivityAt: null, kind: "PUBLISHER", frozenAt: null };
    if (path === "/payments/gateways") return [{ gateway: "CASHFREE", configured: true, testMode: true }];
    return {};
});
const post = vi.fn(async (_path: string, _body?: unknown): Promise<unknown> => ({}));
vi.mock("@/lib/api-client", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-client")>();
    return { ...actual, api: { get: (path: string) => get(path), post: (path: string, body?: unknown) => post(path, body), patch: vi.fn(), put: vi.fn(), delete: vi.fn() } };
});

import type { BoostView } from "@/services/promotions";
import { BoostPayPanel } from "./pay-panel";

const boost = {
    id: "b1",
    displayId: "BST-0110-2601",
    listingId: "l1",
    placements: ["SEARCH_TOP"],
    city: "Bengaluru",
    category: "OUTDOOR",
    startDate: "2026-10-05T00:00:00.000Z",
    endDate: "2026-10-11T00:00:00.000Z",
    days: 7,
    subtotal: "5600.00",
    gstAmount: "1008.00",
    total: "6608.00",
    status: "PENDING_PAYMENT",
    reviewNote: null,
    paidAt: null,
    refundedAt: null,
    cancelledAt: null,
    cancelReason: null,
    createdAt: new Date().toISOString(),
} as BoostView;

describe("paying for a sponsored listing — the payments kill switch", () => {
    beforeEach(() => {
        switchedOff = new Set();
        get.mockClear();
        post.mockClear();
    });

    it("offers the earnings wallet and card or UPI while payments are on", async () => {
        render(<BoostPayPanel boost={boost} onPaid={vi.fn()} />);
        expect(await screen.findByText("Opens the secure payment page in a new window; this page checks the payment when you are back.")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Pay by card or UPI" })).toBeEnabled();
        expect(screen.getByRole("button", { name: "Pay from earnings" })).toBeEnabled();
        expect(screen.queryByRole("status")).not.toBeInTheDocument();
    });

    it("draws no card or UPI while payments.gateways is switched off, says so in one line, and keeps the wallet", async () => {
        switchedOff = new Set(["payments.gateways"]);
        render(<BoostPayPanel boost={boost} onPaid={vi.fn()} />);
        await waitFor(() => expect(screen.getByRole("button", { name: "Pay from earnings" })).toBeEnabled());
        const off = screen.getByRole("status");
        expect(off).toHaveTextContent("Paying by card, UPI or bank transfer is switched off for now.");
        expect(off).toHaveTextContent("Pay from your earnings wallet, or come back later.");
        expect(screen.queryByRole("button", { name: "Pay by card or UPI" })).not.toBeInTheDocument();
        expect(screen.queryByText("Card or UPI")).not.toBeInTheDocument();
        expect(post).not.toHaveBeenCalledWith("/payments/intents", expect.anything());
    });
});
