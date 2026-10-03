/* The jest-dom matchers are wired in vitest.setup.ts; this import is for their types. */
import "@testing-library/jest-dom/vitest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const push = vi.fn();
vi.mock("next/navigation", () => ({
    useParams: () => ({ id: "s1" }),
    useRouter: () => ({ push, replace: vi.fn() }),
    usePathname: () => "/advertiser/plans",
    useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/app/advertiser/layout", () => ({ useAdvertiser: () => ({ id: "a1", name: "Meera Sharma" }) }));

/* The kill switches the platform has said are off (lib/flags `useSwitchedOff`). */
let switchedOff = new Set<string>();
vi.mock("@/lib/flags", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/flags")>()), useSwitchedOff: (key: string) => switchedOff.has(key) }));

type Handler = (path: string, body?: unknown) => unknown;
const routes: { get: Handler; post: Handler; patch: Handler } = { get: () => ({}), post: () => ({}), patch: () => ({}) };
vi.mock("@/lib/api-client", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-client")>();
    const call = (verb: "get" | "post" | "patch") => vi.fn(async (path: string, body?: unknown) => {
        const answer = routes[verb](path, body);
        if (answer instanceof Error) throw answer;
        return answer;
    });
    return { ...actual, api: { get: call("get"), post: call("post"), patch: call("patch"), put: vi.fn(), delete: vi.fn() } };
});

import { api, ApiError } from "@/lib/api-client";
import PlanSalePage from "@/app/advertiser/plans/[id]/page";
import PlansPage from "@/app/advertiser/plans/page";

const policy = { cyclesOffered: ["MONTHLY", "ANNUAL"], annualDiscountPct: 20, changePolicy: "QUEUE_AFTER_TERM", prorateOnChange: false, graceDays: 0, trialDays: 0, payment: { walletAllowed: true, gatewaysAllowed: ["RAZORPAY", "CASHFREE", "BANK_TRANSFER"] }, autoRenewAllowed: true };
const active = { saleId: null, grace: null, trialAvailable: {}, policy };

const sale = (over: Record<string, unknown> = {}) => ({
    id: "s1",
    reference: "PKG-2026-482913",
    advertiserId: "a1",
    advertiserName: "Meera Sharma",
    agentId: null,
    tier: "GROWTH",
    packageName: "Growth",
    cycle: "ANNUAL",
    months: 12,
    pricePerMonth: "2499.00",
    addOnsPerMonth: "0.00",
    subtotal: "29988.00",
    discountPct: "20.00",
    discountAmount: "5997.60",
    gstPct: "18.00",
    gstAmount: "4318.27",
    total: "28308.67",
    status: "PENDING_PAYMENT",
    paymentUrl: "http://x/p/t",
    paidAt: null,
    paidMethod: null,
    startsAt: null,
    endsAt: null,
    nextBillingAt: null,
    createdAt: "2026-09-26T00:00:00.000Z",
    agreements: [{ kind: "PACKAGE_SALE", accepted: false, templateVersion: null, currentVersion: 1, current: false }],
    lines: [{ kind: "PLAN", code: "GROWTH", label: "Growth plan", pricePerMonth: "2499.00", months: 12, amount: "29988.00" }],
    ...over,
});

function wire(options: { sale?: ReturnType<typeof sale>; catalogue?: unknown; bank?: boolean } = {}) {
    routes.get = (path) => {
        if (path === "/packages/sales/s1") return options.sale ?? sale();
        if (path === "/advertisers/a1/wallet") return { balance: "50000.00", goodwill: "0.00", held: "0.00", spendable: "50000.00", currency: "INR" };
        if (path === "/payments/gateways") return [{ gateway: "CASHFREE", configured: true, testMode: true }, { gateway: "RAZORPAY", configured: false, testMode: true }];
        if (path === "/payments/bank-transfer/details") return options.bank ? { configured: true, details: { beneficiary: "ADX Media Pvt Ltd", accountNumber: "50200012345678", ifsc: "HDFC0000123", bank: "HDFC Bank", branch: "MG Road" } } : { configured: false };
        if (path === "/packages/active") return active;
        if (path.startsWith("/packages/sales?")) return { items: [], total: 0, page: 1, pageSize: 5, counts: {} };
        if (path === "/packages/catalogue") return options.catalogue ?? new ApiError(403, "FORBIDDEN", "Insufficient permissions");
        if (path.startsWith("/advertisers/a1/invoices")) return [];
        return {};
    };
    routes.post = (path, body) => {
        if (path === "/packages/quote") {
            const tier = (body as { tier: string }).tier;
            return { cycle: "MONTHLY", months: 1, pricePerMonth: tier === "PRO" ? "4999.00" : "2499.00", addOnsPerMonth: "0.00", perMonth: "2499.00", subtotal: "2499.00", discountPct: "0.00", discountAmount: "0.00", gstPct: "18.00", gstAmount: "449.82", total: "2948.82", lines: [{ kind: "PLAN", code: tier, label: `${tier} plan`, pricePerMonth: "2499.00", months: 1, amount: "2499.00" }], policy, term: { rule: "STARTS_NOW", startsAt: "2026-09-26T00:00:00Z", endsAt: "2026-10-26T00:00:00Z", replaces: null, prorationAmount: null } };
        }
        if (path === "/packages/sales") return sale({ id: "s-new" });
        if (path === "/packages/sales/s1/pay") return sale({ status: "ACTIVE", paidMethod: "WALLET", paidAt: "2026-09-26T00:00:00Z", startsAt: "2026-09-26T00:00:00Z", endsAt: "2027-09-26T00:00:00Z" });
        return {};
    };
}

describe("a plan sale", () => {
    beforeEach(() => {
        vi.mocked(api.post).mockClear();
        push.mockClear();
        switchedOff = new Set();
    });

    it("offers the card, UPI and bank doors while payments are on", async () => {
        wire({ bank: true });
        render(<PlanSalePage />);
        expect(await screen.findByRole("radio", { name: /Your ADX wallet/ })).toBeInTheDocument();
        expect(screen.getByRole("radio", { name: /Card or UPI · Cashfree/ })).toBeInTheDocument();
        expect(screen.getByRole("radio", { name: /Direct banking/ })).toBeInTheDocument();
        expect(screen.queryByRole("status")).not.toBeInTheDocument();
    });

    it("offers only the wallet while payments.gateways is switched off, says so in one line, and opens no intent", async () => {
        switchedOff = new Set(["payments.gateways"]);
        wire({ bank: true });
        render(<PlanSalePage />);
        expect(await screen.findByRole("radio", { name: /Your ADX wallet/ })).toBeInTheDocument();
        expect(screen.queryByRole("radio", { name: /Card or UPI/ })).not.toBeInTheDocument();
        expect(screen.queryByRole("radio", { name: /Direct banking/ })).not.toBeInTheDocument();
        const off = screen.getByRole("status");
        expect(off).toHaveTextContent("Paying by card, UPI or bank transfer is switched off for now.");
        expect(off).toHaveTextContent("Pay from your ADX wallet, or come back later.");
        expect(screen.getByRole("button", { name: "Pay ₹28,308.67 from wallet" })).toBeInTheDocument();
        expect(screen.queryByText(/A card or UPI payment tops up your ADX wallet/)).not.toBeInTheDocument();
        expect(vi.mocked(api.post).mock.calls.filter(([path]) => path === "/payments/intents")).toEqual([]);
    });

    it("keeps Pay shut until the plan terms are accepted, and offers only the doors the policy opens", async () => {
        wire();
        render(<PlanSalePage />);
        expect(await screen.findByRole("heading", { name: "Growth plan" })).toBeInTheDocument();
        expect(screen.getByText("Awaiting payment")).toBeInTheDocument();
        expect(screen.getByText("Read and accept the plan terms before paying.")).toBeInTheDocument();
        const pay = screen.getByRole("button", { name: "Pay ₹28,308.67 from wallet" });
        expect(pay).toBeDisabled();
        /* Cashfree is configured and allowed; Razorpay is allowed but not configured; the bank is not configured. */
        expect(screen.getByRole("radio", { name: /Card or UPI · Cashfree/ })).toBeInTheDocument();
        expect(screen.queryByRole("radio", { name: /Razorpay/ })).not.toBeInTheDocument();
        expect(screen.queryByRole("radio", { name: /Direct banking/ })).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole("radio", { name: /Card or UPI · Cashfree/ }));
        expect(screen.getByRole("button", { name: "Pay ₹28,308.67 with Cashfree" })).toBeDisabled();
    });

    it("pays from the wallet once the terms are current, and turns into the receipt", async () => {
        wire({ sale: sale({ agreements: [{ kind: "PACKAGE_SALE", accepted: true, templateVersion: 1, currentVersion: 1, current: true }] }) });
        render(<PlanSalePage />);
        const pay = await screen.findByRole("button", { name: "Pay ₹28,308.67 from wallet" });
        expect(pay).toBeEnabled();
        fireEvent.click(pay);
        await waitFor(() => expect(api.post).toHaveBeenCalledWith("/packages/sales/s1/pay", {}));
        expect(await screen.findByRole("heading", { name: "Your plan is active" })).toBeInTheDocument();
        expect(screen.getByText("Runs until")).toBeInTheDocument();
    });

    it("says there is nothing to pay on a cancelled sale", async () => {
        wire({ sale: sale({ status: "CANCELLED" }) });
        render(<PlanSalePage />);
        expect(await screen.findByText(/This plan was cancelled, so there is nothing to pay/)).toBeInTheDocument();
        expect(screen.queryByRole("button", { name: /Pay ₹/ })).not.toBeInTheDocument();
    });
});

describe("the plans page", () => {
    beforeEach(() => {
        vi.mocked(api.post).mockClear();
        push.mockClear();
    });

    it("says the catalogue was refused rather than drawing an empty one", async () => {
        wire();
        render(<PlansPage />);
        expect(await screen.findByText("Could not read the plan catalogue")).toBeInTheDocument();
        expect(screen.getByText(/has not opened the plan catalogue/)).toBeInTheDocument();
        expect(screen.getByText("Your plan")).toBeInTheDocument();
    });

    it("prices the popular plan through the server's quote and buys it for the advertiser", async () => {
        wire({
            catalogue: {
                packages: [
                    { id: "p1", tier: "STARTER", name: "Starter", pricePerMonth: "999.00", description: null, isPopular: false, entitlements: { campaignsPerMonth: 2 } },
                    { id: "p2", tier: "GROWTH", name: "Growth", pricePerMonth: "2499.00", description: "For regular campaigns", isPopular: true, entitlements: { liveChat: true } },
                    { id: "p3", tier: "PRO", name: "Pro", pricePerMonth: "4999.00", description: null, isPopular: false, entitlements: {} },
                ],
                addOns: [],
            },
        });
        render(<PlansPage />);
        expect(await screen.findByText("Live chat with ADX support")).toBeInTheDocument();
        await waitFor(() => expect(api.post).toHaveBeenCalledWith("/packages/quote", { tier: "GROWTH", addOnCodes: [], cycle: "MONTHLY" }));
        expect(await screen.findByText("You pay")).toBeInTheDocument();
        expect(screen.getByText("Growth starts today.")).toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: "Choose Growth · ₹2,948.82" }));
        await waitFor(() => expect(api.post).toHaveBeenCalledWith("/packages/sales", { advertiserId: "a1", tier: "GROWTH", addOnCodes: [], cycle: "MONTHLY" }));
        expect(push).toHaveBeenCalledWith("/advertiser/plans/s-new");
    });
});
