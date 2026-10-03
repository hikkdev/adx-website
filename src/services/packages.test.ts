import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api-client", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-client")>();
    return { ...actual, api: { get: vi.fn(async () => ({ items: [] })), post: vi.fn(async () => ({})), patch: vi.fn(async () => ({})), put: vi.fn(), delete: vi.fn() } };
});

import { api, ApiError } from "@/lib/api-client";
import {
    activePlanOf,
    autoRenewOffered,
    catalogueRefusal,
    chosenRail,
    currentPlanNote,
    cycleSummary,
    entitlementLines,
    isPositive,
    packagesService,
    packageTermLine,
    payRails,
    payRefusal,
    pctLabel,
    planMetaLine,
    planMoney,
    renewalLine,
    saleStatusLabel,
    termsAccepted,
    termsLine,
    termsStanding,
    walletShortfall,
    type ActivePackageRead,
    type PackagePolicy,
} from "./packages";

const policy = (overrides: Partial<PackagePolicy> = {}): PackagePolicy => ({
    cyclesOffered: ["MONTHLY", "ANNUAL"],
    annualDiscountPct: 20,
    changePolicy: "QUEUE_AFTER_TERM",
    prorateOnChange: false,
    graceDays: 7,
    trialDays: 0,
    payment: { walletAllowed: true, gatewaysAllowed: ["RAZORPAY", "CASHFREE", "CCAVENUE", "BANK_TRANSFER"] },
    autoRenewAllowed: true,
    ...overrides,
});

describe("the routes", () => {
    beforeEach(() => {
        vi.mocked(api.get).mockClear();
        vi.mocked(api.post).mockClear();
        vi.mocked(api.patch).mockClear();
    });

    it("prices, buys, trials and switches auto-renew where the backend listens", async () => {
        await packagesService.quote({ tier: "GROWTH", addOnCodes: ["EXTRA_CITY"], cycle: "ANNUAL" });
        expect(api.post).toHaveBeenLastCalledWith("/packages/quote", { tier: "GROWTH", addOnCodes: ["EXTRA_CITY"], cycle: "ANNUAL" });
        await packagesService.sell({ advertiserId: "a1", tier: "PRO", addOnCodes: [], cycle: "MONTHLY" });
        expect(api.post).toHaveBeenLastCalledWith("/packages/sales", { advertiserId: "a1", tier: "PRO", addOnCodes: [], cycle: "MONTHLY" });
        await packagesService.trial("STARTER");
        expect(api.post).toHaveBeenLastCalledWith("/packages/sales/trial", { tier: "STARTER" });
        await packagesService.setAutoRenew(false);
        expect(api.patch).toHaveBeenLastCalledWith("/packages/active", { autoRenew: false });
    });

    it("accepts the terms and pays on the sale, and opens a gateway intent for it", async () => {
        await packagesService.acceptTerms("s 1");
        expect(api.post).toHaveBeenLastCalledWith("/packages/sales/s%201/accept-terms", {});
        await packagesService.pay("s1");
        expect(api.post).toHaveBeenLastCalledWith("/packages/sales/s1/pay", {});
        await packagesService.createIntent({ packageSaleId: "s1", gateway: "CASHFREE" });
        expect(api.post).toHaveBeenLastCalledWith("/payments/intents", { packageSaleId: "s1", gateway: "CASHFREE" });
        await packagesService.termsText();
        expect(api.get).toHaveBeenLastCalledWith("/agreements/current/PACKAGE_SALE");
    });

    it("asks the book for a sale still waiting for payment", async () => {
        vi.mocked(api.get).mockResolvedValueOnce({ items: [{ id: "s9" }], total: 1, page: 1, pageSize: 5, counts: {} });
        const pending = await packagesService.pending();
        expect(api.get).toHaveBeenLastCalledWith("/packages/sales?status=PENDING_PAYMENT&pageSize=5");
        expect(pending?.id).toBe("s9");
    });
});

describe("money and labels", () => {
    it("prints a plan's price as the string the server sent", () => {
        expect(planMoney("2499.00")).toBe("₹2,499");
        expect(planMoney("123456.5")).toBe("₹1,23,456.50");
        expect(planMoney("abc")).toBe("—");
        expect(pctLabel("18.00")).toBe("18");
        expect(pctLabel("12.50")).toBe("12.5");
        expect(isPositive("0.00")).toBe(false);
        expect(isPositive("0.01")).toBe(true);
        expect(cycleSummary("ANNUAL")).toEqual({ title: "Billed annually", line: "12 months, one payment" });
    });

    it("says the term rule the quote answered", () => {
        const term = { startsAt: "2026-10-01T00:00:00Z", endsAt: "2026-11-01T00:00:00Z", replaces: null, prorationAmount: null };
        expect(packageTermLine({ ...term, rule: "STARTS_NOW" }, "Growth")).toBe("Growth starts today.");
        expect(packageTermLine({ ...term, rule: "QUEUED_AFTER_CURRENT" }, "Growth")).toBe("Growth starts on 1 Oct 2026, when your current term ends.");
        expect(packageTermLine({ ...term, rule: "REPLACES_CURRENT", prorationAmount: "1200.00" }, "Pro")).toContain("₹1,200 for its unused days is credited to your wallet");
        expect(packageTermLine({ ...term, rule: "REPLACES_CURRENT" }, "Pro")).toContain("with no refund");
        expect(packageTermLine(null, "Pro")).toBe("");
    });

    it("reads the plan off the active read, and when auto-renew is drawn", () => {
        const none = { saleId: null, trialAvailable: {}, policy: policy(), grace: null } as ActivePackageRead;
        expect(activePlanOf(none)).toBeNull();
        const running = { saleId: "s1", reference: "PKG-2026-1", tier: "GROWTH", packageName: "Growth", cycle: "ANNUAL", startsAt: null, endsAt: "2027-03-03T00:00:00Z", nextBillingAt: null, addOns: [], entitlements: {}, enforced: false, paidMethod: "WALLET", autoRenew: true, trialAvailable: {}, policy: policy(), grace: null } as ActivePackageRead;
        const plan = activePlanOf(running)!;
        expect(plan.saleId).toBe("s1");
        expect(planMetaLine(plan)).toBe("Annual · runs to 3 Mar 2027 · PKG-2026-1");
        expect(planMetaLine({ ...plan, paidMethod: "TRIAL" })).toBe("Free trial · ends 3 Mar 2027 · PKG-2026-1");
        expect(autoRenewOffered(plan, policy())).toBe(true);
        expect(autoRenewOffered({ ...plan, paidMethod: "TRIAL" }, policy())).toBe(false);
        expect(autoRenewOffered(plan, policy({ autoRenewAllowed: false }))).toBe(false);
        expect(renewalLine(plan, policy(), null)).toBe("Renews from your wallet on 3 Mar 2027 at the plan's current price.");
        expect(renewalLine(plan, policy({ renewalPricing: "BOUGHT_PRICE" }), "29990.00")).toBe("Renews from your wallet on 3 Mar 2027 for ₹29,990.");
        expect(renewalLine({ ...plan, autoRenew: false }, policy(), null)).toBe("Ends on 3 Mar 2027.");
        expect(currentPlanNote(plan, policy({ changePolicy: "REPLACE_NOW" }))).toContain("a different one replaces it today");
    });

    it("words the sale's status", () => {
        expect(saleStatusLabel({ status: "ACTIVE", paidMethod: "TRIAL" })).toEqual({ label: "Free trial", tone: "success" });
        expect(saleStatusLabel({ status: "PENDING_PAYMENT", paidMethod: null })).toEqual({ label: "Awaiting payment", tone: "warning" });
        expect(saleStatusLabel({ status: "EXPIRED", paidMethod: "WALLET" }).label).toBe("Ended");
    });

    it("ticks the entitlements the app ticks", () => {
        expect(entitlementLines({ liveChat: true, campaignsPerMonth: null, featuredListings: 0, customThing: "gold" })).toEqual([
            { key: "liveChat", label: "Live chat with ADX support", granted: true },
            { key: "campaignsPerMonth", label: "Unlimited campaigns a month", granted: true },
            { key: "featuredListings", label: "Featured listings", granted: false },
            { key: "customThing", label: "Custom thing: Gold", granted: true },
        ]);
        expect(entitlementLines(null)).toEqual([]);
    });
});

describe("the terms gate", () => {
    it("reads the standing off the sale", () => {
        expect(termsStanding({ agreements: undefined })).toBeNull();
        const standing = { kind: "PACKAGE_SALE", accepted: true, templateVersion: 2, currentVersion: 3, current: false };
        expect(termsStanding({ agreements: [standing] })).toEqual(standing);
        expect(termsAccepted(null)).toBe(true);
        expect(termsAccepted(standing)).toBe(false);
        expect(termsLine(standing)).toContain("new version");
        expect(termsLine({ ...standing, current: true })).toBe("Plan terms accepted (version 2).");
        expect(termsLine({ ...standing, accepted: false })).toBe("Read and accept the plan terms before paying.");
    });
});

describe("the payment doors", () => {
    const gateways = [
        { gateway: "RAZORPAY" as const, configured: true, testMode: true },
        { gateway: "CASHFREE" as const, configured: false, testMode: true },
        { gateway: "BANK_TRANSFER" as const, configured: true, testMode: false },
    ];

    it("opens the wallet only when allowed and covering, then the allowed configured gateways, then the bank", () => {
        expect(payRails({ policy: policy(), gateways, bankConfigured: true, spendable: "50000.00", total: "29500.00" }).map((r) => r.id)).toEqual(["WALLET", "RAZORPAY", "BANK_TRANSFER"]);
        expect(payRails({ policy: policy(), gateways, bankConfigured: false, spendable: "100.00", total: "29500.00" }).map((r) => r.id)).toEqual(["RAZORPAY"]);
        expect(payRails({ policy: policy({ payment: { walletAllowed: false, gatewaysAllowed: ["CASHFREE"] } }), gateways, bankConfigured: true, spendable: "50000", total: "1" })).toEqual([]);
        expect(payRails({ policy: null, gateways, bankConfigured: true, spendable: "50000", total: "1" })).toEqual([]);
        /* An unread balance is not a short one: the wallet door stays, and the server decides. */
        expect(payRails({ policy: policy(), gateways: [], bankConfigured: false, spendable: null, total: "1" }).map((r) => r.id)).toEqual(["WALLET"]);
    });

    it("offers no card, UPI or bank door while the payments kill switch is off — the wallet stays", () => {
        expect(payRails({ policy: policy(), gateways, bankConfigured: true, spendable: "50000.00", total: "29500.00", gatewaysOff: true }).map((r) => r.id)).toEqual(["WALLET"]);
        expect(payRails({ policy: policy(), gateways, bankConfigured: true, spendable: "100.00", total: "29500.00", gatewaysOff: true })).toEqual([]);
        expect(payRails({ policy: policy(), gateways, bankConfigured: true, spendable: "50000.00", total: "29500.00", gatewaysOff: false }).map((r) => r.id)).toEqual(["WALLET", "RAZORPAY", "BANK_TRANSFER"]);
    });

    it("keeps the chosen rail only while it is still offered", () => {
        const rails = payRails({ policy: policy(), gateways, bankConfigured: true, spendable: "50000", total: "1" });
        expect(chosenRail("BANK_TRANSFER", rails)).toBe("BANK_TRANSFER");
        expect(chosenRail("CASHFREE", rails)).toBe("WALLET");
        expect(chosenRail(null, [])).toBeNull();
    });

    it("works out the shortfall in paise, never in floating point", () => {
        expect(walletShortfall("100.10", "100.30")).toBe("0.20");
        expect(walletShortfall("29500", "29500.00")).toBeNull();
        expect(walletShortfall("0", "2999.5")).toBe("2999.50");
        expect(walletShortfall(null, "10")).toBeNull();
    });

    it("words the refusals the doors make", () => {
        expect(payRefusal("AGREEMENT_REQUIRED", "x")).toMatch(/Accept the plan terms/);
        expect(payRefusal("INSUFFICIENT_FUNDS", "Wallet balance does not cover this campaign")).toMatch(/does not cover this plan/);
        expect(payRefusal("FEATURE_OFF", "x")).toMatch(/switched off/);
        expect(payRefusal("CONFLICT", "This sale was cancelled and cannot be paid.")).toBe("This sale was cancelled and cannot be paid.");
    });
});

describe("the catalogue refusal", () => {
    it("says a 403 is the server refusing, not an empty catalogue", () => {
        expect(catalogueRefusal(new ApiError(403, "FORBIDDEN", "Insufficient permissions"))).toMatch(/has not opened the plan catalogue/);
        expect(catalogueRefusal(new ApiError(500, "INTERNAL_ERROR", "Boom"))).toBe("Boom");
        expect(catalogueRefusal(new Error("x"))).toMatch(/Could not reach ADX/);
    });
});
