import { describe, expect, it } from "vitest";
import { bankTransferOffered, checkoutUrl, configuredGateways, isClaimed, isSettled, lastPayment, pickGateway, pollPayment, UPI_ID_PATTERN, upiCollectOf, type PaymentIntent, type PaymentSummary } from "./payments";

const payment = (overrides: Partial<PaymentSummary> = {}): PaymentSummary => ({
    id: "p1",
    reference: "PAY-2026-000482",
    advertiserId: "a1",
    campaignId: "c1",
    gateway: "CASHFREE",
    amount: "25960.00",
    currency: "INR",
    status: "CREATED",
    gatewayOrderId: "order_1",
    gatewayPaymentId: null,
    failureReason: null,
    capturedAt: null,
    createdAt: "2026-09-25T00:00:00.000Z",
    ...overrides,
});

describe("the checkout page", () => {
    it("opens the page the intent names before building one", () => {
        const intent: PaymentIntent = { payment: payment({ gateway: "RAZORPAY" }), checkout: { orderId: "o" }, checkoutUrl: "http://localhost:3000/api/v1/payments/p1/checkout?t=abc" };
        expect(checkoutUrl(intent, "http://localhost:3000/api/v1")).toBe("http://localhost:3000/api/v1/payments/p1/checkout?t=abc");
    });

    it("builds Cashfree's hosted page from the session", () => {
        const intent: PaymentIntent = { payment: payment(), checkout: { paymentSessionId: "sess 1", environment: "sandbox" } };
        expect(checkoutUrl(intent, "x")).toBe("https://payments-test.cashfree.com/order/#sess%201");
        expect(checkoutUrl({ payment: payment(), checkout: {} }, "x")).toBeNull();
    });

    it("builds CCAvenue's redirect and falls back to the API's Razorpay page", () => {
        const cc: PaymentIntent = { payment: payment({ gateway: "CCAVENUE" }), checkout: { encRequest: "e", accessCode: "a", redirectUrl: "https://cc.example/txn" } };
        expect(checkoutUrl(cc, "x")).toBe("https://cc.example/txn?encRequest=e&access_code=a");
        expect(checkoutUrl({ payment: payment({ gateway: "RAZORPAY" }), checkout: {} }, "http://api")).toBe("http://api/payments/p1/checkout");
        expect(checkoutUrl({ payment: payment({ gateway: "BANK_TRANSFER" }) }, "x")).toBeNull();
    });
});

describe("the gateways", () => {
    it("offers only configured card/UPI gateways, first one wins", () => {
        const rows = [
            { gateway: "RAZORPAY" as const, configured: false, testMode: true },
            { gateway: "CASHFREE" as const, configured: true, testMode: true },
            { gateway: "BANK_TRANSFER" as const, configured: true, testMode: false },
        ];
        expect(configuredGateways(rows).map((r) => r.gateway)).toEqual(["CASHFREE"]);
        expect(pickGateway(rows)?.gateway).toBe("CASHFREE");
        expect(pickGateway([])).toBeNull();
        expect(bankTransferOffered(rows)).toBe(true);
        expect(bankTransferOffered(rows.slice(0, 2))).toBe(false);
    });

    it("knows a claimed bank transfer from one still waiting on the person", () => {
        const claim = { utr: "HDFCN52026092512345", paidOn: "2026-09-25", claimedAmount: "25960.00", proofFileId: null, claimedAt: "2026-09-25T10:00:00.000Z" };
        expect(isClaimed(payment({ gateway: "BANK_TRANSFER", bankTransfer: claim }))).toBe(true);
        expect(isClaimed(payment({ gateway: "BANK_TRANSFER", bankTransfer: { ...claim, claimedAt: null } }))).toBe(false);
        expect(isClaimed(payment({ gateway: "BANK_TRANSFER", status: "CAPTURED", bankTransfer: claim }))).toBe(false);
        expect(isClaimed(payment({ gateway: "CASHFREE" }))).toBe(false);
    });
});

describe("polling", () => {
    it("stops on a settled status and reports it", async () => {
        const reads = [payment({ status: "CREATED" }), payment({ status: "CAPTURED" })];
        let i = 0;
        const { done } = pollPayment("p1", { intervalMs: 1, read: async () => reads[Math.min(i++, reads.length - 1)]! });
        const result = await done;
        expect(result.settled).toBe(true);
        expect(result.payment?.status).toBe("CAPTURED");
        expect(isSettled("FAILED")).toBe(true);
        expect(isSettled("CREATED")).toBe(false);
    });

    it("treats a claimed bank transfer as settled for the page's purposes", async () => {
        const claimed = payment({ gateway: "BANK_TRANSFER", bankTransfer: { utr: "X", paidOn: "2026-09-25", claimedAmount: "25960.00", proofFileId: null, claimedAt: "2026-09-25T10:00:00.000Z" } });
        const { done } = pollPayment("p1", { intervalMs: 1, read: async () => claimed });
        expect((await done).settled).toBe(true);
    });

    it("gives back the last state when stopped", async () => {
        const { done, stop } = pollPayment("p1", { intervalMs: 50, read: async () => payment({ status: "CREATED" }) });
        setTimeout(stop, 5);
        const result = await done;
        expect(result.settled).toBe(false);
        expect(result.payment?.status).toBe("CREATED");
    });
});

describe("UP-1: the UPI id on the intent", () => {
    it("takes name@bank and nothing looser", () => {
        expect(UPI_ID_PATTERN.test("aster.home@okaxis")).toBe(true);
        expect(UPI_ID_PATTERN.test("9876543210@ybl")).toBe(true);
        expect(UPI_ID_PATTERN.test("a@b")).toBe(false);
        expect(UPI_ID_PATTERN.test("name@")).toBe(false);
        expect(UPI_ID_PATTERN.test("name@1bank")).toBe(false);
    });

    it("reads Cashfree's collect answer off the checkout, and nothing off an intent without one", () => {
        expect(upiCollectOf({ checkout: { paymentSessionId: "s", upiCollect: { requested: true, upiId: "a@okaxis", cfPaymentId: "123" } } })).toEqual({ requested: true, upiId: "a@okaxis", cfPaymentId: "123" });
        expect(upiCollectOf({ checkout: { upiCollect: { requested: false, upiId: "a@okaxis", error: "Invalid VPA" } } })?.requested).toBe(false);
        expect(upiCollectOf({ checkout: { orderId: "o" } })).toBeNull();
        expect(upiCollectOf({})).toBeNull();
    });
});

describe("RF-1: the payment this browser last opened", () => {
    it("remembers what it was for, so the return page knows a fee from the whole", () => {
        lastPayment.remember("c1", { id: "p1", url: null, method: "UPI", purpose: "RESERVATION_FEE" });
        expect(lastPayment.read("c1")).toEqual({ id: "p1", url: null, method: "UPI", purpose: "RESERVATION_FEE" });
        lastPayment.remember("c2", { id: "p2", url: "https://pay", method: "CARD" });
        expect(lastPayment.read("c2")?.purpose).toBeUndefined();
        expect(lastPayment.read("nope")).toBeNull();
    });
});
