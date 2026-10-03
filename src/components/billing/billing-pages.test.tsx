/* The jest-dom matchers are wired in vitest.setup.ts; this import is for their types. */
import "@testing-library/jest-dom/vitest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";

let search = new URLSearchParams();
const replace = vi.fn((href: string) => {
    search = new URLSearchParams(href.split("?")[1] ?? "");
});
vi.mock("next/navigation", () => ({
    useParams: () => ({}),
    useRouter: () => ({ push: vi.fn(), replace }),
    usePathname: () => "/advertiser/billing",
    useSearchParams: () => search,
}));
vi.mock("@/app/advertiser/layout", () => ({ useAdvertiser: () => ({ id: "a1", name: "Meera Sharma" }) }));

const get = vi.fn(async (path: string): Promise<unknown> => {
    if (path === "/advertisers/a1/wallet") return { balance: "208264.00", goodwill: "1500.00", held: "25000.00", spendable: "184764.00", currency: "INR" };
    if (path === "/advertisers/a1/wallet/statement?limit=25")
        return {
            rows: [
                { id: "e1", walletId: "w", type: "CAMPAIGN_DEBIT", amount: "-260898", balanceAfter: "208264", isGoodwill: false, campaignId: "c1", orderId: null, holdId: null, reference: null, note: "Campaign started", createdAt: "2026-09-20T08:05:55.083Z" },
                { id: "e2", walletId: "w", type: "TOPUP", amount: "600000", balanceAfter: "469162", isGoodwill: false, campaignId: null, orderId: null, holdId: null, reference: "HDFCN52026092512345", note: null, createdAt: "2026-09-19T08:05:55.083Z" },
            ],
            nextCursor: "cur-2",
        };
    if (path === "/advertisers/a1/wallet/statement?limit=25&cursor=cur-2")
        return { rows: [{ id: "e3", walletId: "w", type: "REFUND", amount: "-5000", balanceAfter: "0", isGoodwill: false, campaignId: null, orderId: null, holdId: null, reference: null, note: null, createdAt: "2026-08-02T00:00:00.000Z" }], nextCursor: null };
    if (path === "/advertisers/a1/wallet/top-ups?limit=100") return { rows: [{ id: "t1", walletId: "w", amount: "600000.00", method: "BANK_TRANSFER", utr: "HDFCN52026092512345", receivedAt: "2026-05-14T00:00:00.000Z", paymentId: null, note: null, walletEntryId: null, reconciledAt: null, createdAt: "2026-09-19T00:00:00.000Z" }], nextCursor: null };
    if (path === "/advertisers/a1/invoices") return [];
    if (path.startsWith("/campaigns")) return { items: [{ id: "c1", name: "Festive Menu — Indiranagar" }], total: 1, page: 1, pageSize: 100, counts: {} };
    if (path === "/packages/active") return { saleId: null, grace: null, trialAvailable: {}, policy: { cyclesOffered: ["MONTHLY"], annualDiscountPct: 0, changePolicy: "QUEUE_AFTER_TERM", prorateOnChange: false, graceDays: 0, trialDays: 0, payment: { walletAllowed: true, gatewaysAllowed: [] }, autoRenewAllowed: false } };
    if (path.startsWith("/advertisers/a1/wallet/refund-requests"))
        return {
            items: [{ id: "r1", walletId: "w", amount: "12000.00", reason: "PUBLISHER_WITHDREW", note: "The site came down on day three.", status: "PAID", destination: "BANK_TRANSFER", consentNote: "Advertiser agreed on call, 9 Sep", payoutMethodId: "pm1", rail: "NEFT", railReference: "UTR998877", paidAt: "2026-09-12T00:00:00.000Z", decidedAt: "2026-09-10T00:00:00.000Z", decisionNote: null, ticketId: null, createdAt: "2026-09-09T00:00:00.000Z", updatedAt: "2026-09-12T00:00:00.000Z" }],
            total: 1,
        };
    return {};
});
vi.mock("@/lib/api-client", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-client")>();
    return { ...actual, api: { get: (path: string) => get(path), post: vi.fn(), patch: vi.fn(), put: vi.fn(), delete: vi.fn() } };
});

import BillingPage from "@/app/advertiser/billing/page";
import RefundRequestsPage from "@/app/advertiser/billing/refunds/page";

describe("wallet & billing", () => {
    beforeEach(() => {
        search = new URLSearchParams();
        get.mockClear();
    });

    it("draws the balance split, joins a charge to its campaign and a top-up to its UTR, and pages by cursor", async () => {
        render(<BillingPage />);
        expect(await screen.findByText("₹1,84,764.00")).toBeInTheDocument();
        expect(screen.getAllByText("₹2,08,264.00").length).toBeGreaterThan(0);
        expect(screen.getAllByText("₹1,500.00").length).toBeGreaterThan(0);
        expect(screen.getByText(/is held for campaigns you have confirmed/)).toBeInTheDocument();
        const table = screen.getByRole("table");
        expect(within(table).getByText("Festive Menu — Indiranagar")).toBeInTheDocument();
        expect(within(table).getByText(/Bank transfer · UTR HDFCN52026092512345 · received 14 May 2026/)).toBeInTheDocument();
        expect(within(table).getByText("−₹2,60,898.00")).toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: "Load more" }));
        await waitFor(() => expect(get).toHaveBeenCalledWith("/advertisers/a1/wallet/statement?limit=25&cursor=cur-2"));
        expect(await screen.findByText("To your bank account · with ADX finance")).toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "Load more" })).not.toBeInTheDocument();
    });

    it("puts no Add money button on the page, and says how money arrives", async () => {
        render(<BillingPage />);
        expect(await screen.findByText("How money reaches this account")).toBeInTheDocument();
        expect(screen.queryByRole("button", { name: /add money|top up/i })).not.toBeInTheDocument();
    });
});

describe("refund requests", () => {
    it("lists the account's requests with the consent and the paid reference, and has no raise button", async () => {
        render(<RefundRequestsPage />);
        expect((await screen.findAllByText("To your bank account")).length).toBeGreaterThan(0);
        expect(screen.getByText("₹12,000.00")).toBeInTheDocument();
        expect(screen.getByText("Paid")).toBeInTheDocument();
        expect(screen.getByText("Your agreement: Advertiser agreed on call, 9 Sep")).toBeInTheDocument();
        expect(screen.getByText("Paid 12 Sep 2026 · ref UTR998877")).toBeInTheDocument();
        expect(screen.getAllByRole("link", { name: /Ask for a refund|Create a request/ })[0]).toHaveAttribute("href", "/advertiser/requests/new?topic=PAYMENT");
    });
});
