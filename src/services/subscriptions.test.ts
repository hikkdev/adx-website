import { beforeEach, describe, expect, it, vi } from "vitest";

const calls: { method: string; path: string; body?: unknown }[] = [];
vi.mock("@/lib/api-client", async (original) => {
    const real = await original<typeof import("@/lib/api-client")>();
    const record = (method: string) =>
        vi.fn(async (path: string, body?: unknown) => {
            calls.push(body === undefined ? { method, path } : { method, path, body });
            return {};
        });
    return { ...real, api: { get: record("GET"), post: record("POST"), patch: record("PATCH") } };
});

import { ApiError } from "@/lib/api-client";
import {
    commissionLine,
    cycleLabel,
    entitlementLines,
    initialTier,
    isEmptyWallet,
    isSwitchedOff,
    offeredCycle,
    onSale,
    orderHandoff,
    orderHref,
    orderStatusLabel,
    paidMethodLabel,
    payDoors,
    payNote,
    pctLabel,
    renewsAtBoughtPrice,
    subscriptionsService,
    termLine,
    type Plan,
    type SubscriptionPolicy,
} from "./subscriptions";

const policy = (over: Partial<SubscriptionPolicy> = {}): SubscriptionPolicy => ({
    cyclesOffered: ["MONTHLY", "ANNUAL"],
    annualDiscountPct: 20,
    changePolicy: "REPLACE_NOW",
    prorateOnChange: false,
    graceDays: 7,
    trialDays: 14,
    payment: { walletAllowed: true, gatewaysAllowed: ["CASHFREE", "RAZORPAY"] },
    autoRenewAllowed: true,
    ...over,
});

const wallet = (withdrawable: string, over: Record<string, unknown> = {}) => ({ balance: withdrawable, withdrawable, pendingClearance: "0.00", held: "0.00", frozenAt: null, ...over });

const plan = (tier: Plan["tier"], over: Partial<Plan> = {}): Plan => ({
    id: tier,
    tier,
    name: tier.charAt(0) + tier.slice(1).toLowerCase(),
    pricePerMonth: "999.00",
    ratePct: "0.1500",
    description: null,
    isPopular: false,
    entitlements: {},
    enforced: false,
    enforcedKeys: [],
    isActive: true,
    sortOrder: 0,
    ...over,
});

beforeEach(() => {
    calls.length = 0;
});

describe("the requests", () => {
    it("names every revenue route the app does", async () => {
        await subscriptionsService.plans();
        await subscriptionsService.quote({ tier: "PLUS", cycle: "ANNUAL" });
        await subscriptionsService.order({ tier: "PLUS", cycle: "MONTHLY" });
        await subscriptionsService.get("so 1");
        await subscriptionsService.pay("so1");
        await subscriptionsService.cancel("so1");
        await subscriptionsService.trial({ tier: "PRO" });
        await subscriptionsService.me();
        await subscriptionsService.setAutoRenew(true);
        await subscriptionsService.createIntent("so1", "CASHFREE");
        expect(calls).toEqual([
            { method: "GET", path: "/revenue/plans" },
            { method: "POST", path: "/revenue/subscription-orders/quote", body: { tier: "PLUS", cycle: "ANNUAL" } },
            { method: "POST", path: "/revenue/subscription-orders", body: { tier: "PLUS", cycle: "MONTHLY" } },
            { method: "GET", path: "/revenue/subscription-orders/so%201" },
            { method: "POST", path: "/revenue/subscription-orders/so1/pay", body: {} },
            { method: "POST", path: "/revenue/subscription-orders/so1/cancel", body: {} },
            { method: "POST", path: "/revenue/subscription-orders/trial", body: { tier: "PRO" } },
            { method: "GET", path: "/revenue/subscriptions/me" },
            { method: "PATCH", path: "/revenue/subscriptions/me", body: { autoRenew: true } },
            { method: "POST", path: "/payments/intents", body: { subscriptionOrderId: "so1", gateway: "CASHFREE" } },
        ]);
    });
});

describe("words", () => {
    it("prints the commission, the cycle, the percentages and the order's state", () => {
        expect(commissionLine("0.1250")).toBe("12.5% commission");
        expect(commissionLine("0.1")).toBe("10% commission");
        expect(commissionLine("abc")).toBeNull();
        expect(commissionLine(null)).toBeNull();
        expect(cycleLabel("ANNUAL")).toBe("Annual");
        expect(pctLabel("18.00")).toBe("18%");
        expect(orderStatusLabel("PENDING_PAYMENT")).toBe("Awaiting payment");
        expect(paidMethodLabel("WALLET")).toBe("from your wallet");
        expect(paidMethodLabel("TRIAL")).toBe("free trial");
    });
    it("turns the entitlements into ticks", () => {
        expect(entitlementLines({ liveChat: true, featuredListings: 2, bookingReportPdf: false, campaignsPerMonth: null, customThing: "gold" })).toEqual([
            { key: "liveChat", label: "Live chat with ADX support", granted: true },
            { key: "featuredListings", label: "2 featured listings", granted: true },
            { key: "bookingReportPdf", label: "Booking reports as PDF", granted: false },
            { key: "campaignsPerMonth", label: "Unlimited campaigns a month", granted: true },
            { key: "customThing", label: "Custom thing: Gold", granted: true },
        ]);
        expect(entitlementLines(null)).toEqual([]);
        expect(entitlementLines(["a"])).toEqual([]);
    });
    it("says the term rule as the server decided it", () => {
        expect(termLine({ rule: "STARTS_NOW", startsAt: null }, "Plus")).toBe("Plus starts today.");
        expect(termLine({ rule: "QUEUED_AFTER_CURRENT", startsAt: "2026-11-01T00:00:00.000Z" }, "Plus")).toBe("Plus starts on 1 Nov 2026, when your current term ends.");
        expect(termLine({ rule: "REPLACES_CURRENT", startsAt: null }, "Pro", { prorate: true })).toContain("unused days are credited");
        expect(termLine({ rule: "REPLACES_CURRENT", startsAt: null }, "Pro")).toContain("no refund");
        expect(termLine(null)).toBe("");
    });
    it("knows the switch is off from 503, FEATURE_OFF or an older build's 404", () => {
        expect(isSwitchedOff(new ApiError(503, "FEATURE_OFF", "off"))).toBe(true);
        expect(isSwitchedOff(new ApiError(404, "NOT_FOUND", "gone"))).toBe(true);
        expect(isSwitchedOff(new ApiError(409, "ALREADY_ON_PLAN", "no"))).toBe(false);
        expect(isSwitchedOff(new Error("x"))).toBe(false);
    });
    it("prints the bought price on renewal only when the policy says so", () => {
        expect(renewsAtBoughtPrice({ renewalPricing: "BOUGHT_PRICE" })).toBe(true);
        expect(renewsAtBoughtPrice({})).toBe(false);
        expect(renewsAtBoughtPrice(null)).toBe(false);
    });
});

describe("the plans page", () => {
    it("opens on the running tier, else the popular one, in the catalogue's order", () => {
        const plans = onSale([plan("PRO", { sortOrder: 2 }), plan("STANDARD", { sortOrder: 0 }), plan("PLUS", { sortOrder: 1, isPopular: true }), plan("PLUS", { id: "old", isActive: false })]);
        expect(plans.map((p) => p.id)).toEqual(["STANDARD", "PLUS", "PRO"]);
        expect(initialTier(plans, null)).toBe("PLUS");
        expect(initialTier(plans, { tier: "PRO" } as never)).toBe("PRO");
        expect(initialTier([], null)).toBeNull();
    });
    it("never asks for a cycle the policy does not offer", () => {
        expect(offeredCycle("ANNUAL", policy({ cyclesOffered: ["MONTHLY"] }))).toBe("MONTHLY");
        expect(offeredCycle("ANNUAL", policy())).toBe("ANNUAL");
        expect(offeredCycle("ANNUAL", null)).toBe("ANNUAL");
    });
});

describe("the pay page's doors", () => {
    const gateways = [
        { gateway: "CASHFREE" as const, configured: true, testMode: true },
        { gateway: "RAZORPAY" as const, configured: false, testMode: true },
        { gateway: "BANK_TRANSFER" as const, configured: true, testMode: false },
    ];
    it("offers the wallet first when it covers the total, then the configured, allowed gateways", () => {
        const doors = payDoors("1178.82", policy(), wallet("5000.00"), gateways);
        expect(doors.rails.map((r) => r.id)).toEqual(["WALLET", "CASHFREE"]);
        expect(payNote("1178.82", doors, "5000.00")).toBeNull();
    });
    it("leaves the wallet out when it is short, frozen or not allowed — and says why", () => {
        const short = payDoors("1178.82", policy(), wallet("100.00"), gateways);
        expect(short.rails.map((r) => r.id)).toEqual(["CASHFREE"]);
        expect(payNote("1178.82", short, "100.00")!.text).toContain("short of ₹1,178.82");
        const frozen = payDoors("10.00", policy(), wallet("5000.00", { frozenAt: "2026-10-01" }), gateways);
        expect(frozen.rails.map((r) => r.id)).toEqual(["CASHFREE"]);
        expect(payNote("10.00", frozen, "5000.00")!.text).toContain("frozen");
        const off = payDoors("10.00", policy({ payment: { walletAllowed: false, gatewaysAllowed: ["CASHFREE"] } }), wallet("5000.00"), gateways);
        expect(off.rails.map((r) => r.id)).toEqual(["CASHFREE"]);
        expect(payNote("10.00", off, "5000.00")!.text).toContain("not offered");
    });
    it("says an empty wallet is empty, not short", () => {
        const doors = payDoors("10.00", policy(), wallet("0.00"), gateways);
        expect(doors.empty).toBe(true);
        expect(payNote("10.00", doors, "0.00")!.text).toContain("empty");
        expect(isEmptyWallet(wallet("0.00"))).toBe(true);
        expect(isEmptyWallet(null)).toBe(false);
    });
    it("shuts every door while the policy is unknown, and says so when none is open", () => {
        const unknown = payDoors("10.00", null, wallet("5000.00"), gateways);
        expect(unknown.rails).toEqual([]);
        expect(payNote("10.00", unknown, "5000.00")!.tone).toBe("warning");
        const none = payDoors("10.00", policy({ payment: { walletAllowed: false, gatewaysAllowed: [] } }), wallet("5000.00"), gateways);
        expect(none.noDoor).toBe(true);
        expect(payNote("10.00", none, "5000.00")!.tone).toBe("danger");
    });
    it("opens no gateway door while the payments kill switch is off, keeps the wallet, and never blames an unconnected gateway", () => {
        const covered = payDoors("1178.82", policy(), wallet("5000.00"), gateways, { gatewaysOff: true });
        expect(covered.rails.map((r) => r.id)).toEqual(["WALLET"]);
        expect(covered.gatewaysOff).toBe(true);
        expect(payNote("1178.82", covered, "5000.00")).toBeNull();
        const short = payDoors("1178.82", policy(), wallet("100.00"), gateways, { gatewaysOff: true });
        expect(short.rails).toEqual([]);
        expect(payNote("1178.82", short, "100.00")!.text).toContain("Wait for your earnings to clear");
        expect(payNote("1178.82", short, "100.00")!.text).not.toContain("not connected");
        const empty = payDoors("10.00", policy(), wallet("0.00"), gateways, { gatewaysOff: true });
        expect(payNote("10.00", empty, "0.00")!.text).toContain("empty — nothing has been earned into it yet. Come back once a booking has paid you");
        expect(payNote("10.00", payDoors("10.00", policy(), wallet("5000.00", { frozenAt: "2026-10-01" }), gateways, { gatewaysOff: true }), "5000.00")!.text).not.toContain("A gateway still can");
        /* No door at all: the page's plain line says it, not a note. */
        const walletBarred = payDoors("10.00", policy({ payment: { walletAllowed: false, gatewaysAllowed: ["CASHFREE"] } }), wallet("5000.00"), gateways, { gatewaysOff: true });
        expect(walletBarred.noDoor).toBe(true);
        expect(payNote("10.00", walletBarred, "5000.00")).toBeNull();
        /* Switched on, the doors are what they always were. */
        expect(payDoors("1178.82", policy(), wallet("5000.00"), gateways, { gatewaysOff: false }).rails.map((r) => r.id)).toEqual(["WALLET", "CASHFREE"]);
    });
});

describe("the hand-off between pages", () => {
    it("keeps the term and policy per order in this tab", () => {
        orderHandoff.save("so1", { term: { rule: "STARTS_NOW", startsAt: null } });
        orderHandoff.save("so1", { paymentId: "pay1" });
        expect(orderHandoff.read("so1")).toEqual({ term: { rule: "STARTS_NOW", startsAt: null }, paymentId: "pay1" });
        expect(orderHandoff.read("nope")).toBeNull();
        expect(orderHref("so 1")).toBe("/publisher/subscription/orders/so%201");
    });
});
