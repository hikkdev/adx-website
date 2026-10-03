/* The jest-dom matchers are wired in vitest.setup.ts; this import is for their types. */
import "@testing-library/jest-dom/vitest";
import * as React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const push = vi.fn();
vi.mock("next/navigation", () => ({
    useParams: () => ({ id: "c1" }),
    useRouter: () => ({ push, replace: vi.fn() }),
    usePathname: () => "/advertiser/campaigns/c1/pay",
    useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/app/advertiser/layout", () => ({ useAdvertiser: () => ({ id: "a1", name: "Meera Sharma" }) }));

/* The kill switches the platform has said are off (lib/flags `useSwitchedOff`). */
let switchedOff = new Set<string>();
vi.mock("@/lib/flags", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/flags")>()), useSwitchedOff: (key: string) => switchedOff.has(key) }));

/* The step's frame reads the campaign itself; here it hands the page a campaign read already. */
vi.mock("@/components/booking/step-page", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/components/booking/step-page")>()),
    StepPage: ({ children }: { children: (ready: ReadyCampaign) => React.ReactNode }) => <>{children(ready)}</>,
    useCampaignId: () => "c1",
}));

const get = vi.fn(async (path: string): Promise<unknown> => {
    if (path === "/payments/gateways") return [{ gateway: "CASHFREE", configured: true, testMode: true }];
    if (path === "/payments/bank-transfer/details") return { configured: true, details: { beneficiary: "ADX Media Pvt Ltd", accountNumber: "50200012345678", ifsc: "HDFC0000123", bank: "HDFC Bank", branch: "MG Road" } };
    if (path === "/advertisers/a1/wallet") return { balance: "50000.00", goodwill: "0.00", held: "0.00", spendable: "50000.00", currency: "INR" };
    if (path === "/advertisers/a1/eligibility") return { eligible: true, blockedBy: [] };
    return {};
});
let postAnswer: (path: string) => unknown = () => ({});
const post = vi.fn(async (path: string, _body?: unknown): Promise<unknown> => {
    const answer = postAnswer(path);
    if (answer instanceof Error) throw answer;
    return answer;
});
/* `PATCH /users/me` — the date of birth the age gate saves. */
const patch = vi.fn(async (_path: string, body?: unknown): Promise<unknown> => body);
vi.mock("@/lib/api-client", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-client")>();
    return { ...actual, api: { get: (path: string) => get(path), post: (path: string, body?: unknown) => post(path, body), patch: (path: string, body?: unknown) => patch(path, body), put: vi.fn(), delete: vi.fn() } };
});

import { ApiError } from "@/lib/api-client";
import type { ReadyCampaign } from "@/components/booking/step-page";
import type { AdvertiserProfile, Campaign } from "@/services/booking";
import PayPage from "./page";

const ready: ReadyCampaign = {
    campaign: { id: "c1", reference: "CMP-0110-2601", advertiserId: "a1", name: "Diwali launch", status: "DRAFT", spots: [], creatives: [], startDate: "2026-10-11", endDate: "2026-10-17", fulfilment: null, reservation: null } as unknown as Campaign,
    review: null,
    advertiser: { id: "a1", name: "Meera Sharma", companyName: "Meera Foods", email: "meera@example.com", gstin: null, billingAddress: null, city: "Bengaluru" } as unknown as AdvertiserProfile,
    reload: vi.fn(),
    applyCampaign: vi.fn(),
    applyReview: vi.fn(),
};

const intentCalls = () => post.mock.calls.filter(([path]) => path === "/payments/intents");

describe("Review & pay — the payments.gateways kill switch", () => {
    beforeEach(() => {
        switchedOff = new Set();
        postAnswer = () => ({});
        get.mockClear();
        post.mockClear();
        push.mockClear();
    });
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("draws the wallet, card, UPI and the bank transfer while payments are on", async () => {
        render(<PayPage params={Promise.resolve({ id: "c1" })} />);
        expect(await screen.findByRole("radio", { name: /ADX wallet/ })).toBeInTheDocument();
        expect(screen.getByRole("radio", { name: /Credit \/ debit card/ })).toBeInTheDocument();
        expect(screen.getByRole("radio", { name: "UPI" })).toBeInTheDocument();
        expect(await screen.findByRole("radio", { name: "Direct Banking (NEFT / RTGS / IMPS)" })).toBeInTheDocument();
        expect(screen.queryByText("Paying by card, UPI or bank transfer is switched off for now.")).not.toBeInTheDocument();
    });

    it("offers no card, UPI or bank transfer while it is off, says so in one line, keeps the wallet, and opens no intent", async () => {
        switchedOff = new Set(["payments.gateways"]);
        render(<PayPage params={Promise.resolve({ id: "c1" })} />);
        const wallet = await screen.findByRole("radio", { name: /ADX wallet/ });
        expect(wallet).toHaveAttribute("aria-checked", "true");
        await waitFor(() => expect(get).toHaveBeenCalledWith("/payments/bank-transfer/details"));
        const off = screen.getByRole("status");
        expect(off).toHaveTextContent("Paying by card, UPI or bank transfer is switched off for now.");
        expect(off).toHaveTextContent("Pay from your ADX wallet, or come back later.");
        expect(screen.queryByRole("radio", { name: /Credit \/ debit card/ })).not.toBeInTheDocument();
        expect(screen.queryByRole("radio", { name: "UPI" })).not.toBeInTheDocument();
        expect(screen.queryByRole("radio", { name: /Direct Banking/ })).not.toBeInTheDocument();
        expect(screen.queryByRole("button", { name: /with card|with UPI|Continue with card/ })).not.toBeInTheDocument();
        expect(screen.getByRole("button", { name: /from my wallet/ })).toBeInTheDocument();
        expect(intentCalls()).toEqual([]);
    });

    it("draws no raw error when the intent comes back 503 FEATURE_OFF — the switch's own line takes over", async () => {
        vi.spyOn(window, "open").mockReturnValue(null);
        postAnswer = (path) => (path === "/payments/intents" ? new ApiError(503, "FEATURE_OFF", "Payment gateways are switched off by the platform.", { key: "payments.gateways" }) : {});
        render(<PayPage params={Promise.resolve({ id: "c1" })} />);
        fireEvent.click(await screen.findByRole("radio", { name: "UPI" }));
        await waitFor(() => expect(get).toHaveBeenCalledWith("/advertisers/a1/eligibility"));
        const pay = await screen.findByRole("button", { name: /with UPI/ });
        await waitFor(() => expect(pay).toBeEnabled());
        fireEvent.click(pay);
        await waitFor(() => expect(intentCalls()).toHaveLength(1));
        await waitFor(() => expect(screen.getByRole("button", { name: /with UPI/ })).toBeEnabled());
        expect(screen.queryByRole("alert")).not.toBeInTheDocument();
        expect(screen.queryByText("Payment gateways are switched off by the platform.")).not.toBeInTheDocument();
        expect(push).not.toHaveBeenCalled();
    });
});

describe("Review & pay — 18 or over to order (29 Sep 2026)", () => {
    const upiIntent = { payment: { id: "pay-1", reference: "PAY-1", amount: "11800.00", status: "CREATED", gateway: "CASHFREE" }, checkoutUrl: "https://pay.example/session/1" };

    beforeEach(() => {
        switchedOff = new Set();
        get.mockClear();
        post.mockClear();
        patch.mockClear();
        push.mockClear();
        vi.spyOn(window, "open").mockReturnValue(null);
    });
    afterEach(() => {
        vi.restoreAllMocks();
    });

    /** Picks UPI and presses its pay button once the eligibility has been read. */
    const payWithUpi = async () => {
        render(<PayPage params={Promise.resolve({ id: "c1" })} />);
        fireEvent.click(await screen.findByRole("radio", { name: "UPI" }));
        await waitFor(() => expect(get).toHaveBeenCalledWith("/advertisers/a1/eligibility"));
        const pay = await screen.findByRole("button", { name: /with UPI/ });
        await waitFor(() => expect(pay).toBeEnabled());
        fireEvent.click(pay);
    };

    it("asks for the missing date of birth on the spot, saves it, and opens the same payment again", async () => {
        let asked = 0;
        postAnswer = (path) => {
            if (path !== "/payments/intents") return {};
            asked += 1;
            return asked === 1 ? new ApiError(403, "AGE_REQUIRED", "Add your date of birth to place an order — you need to be 18 or over.", { reason: "MISSING", self: true }) : upiIntent;
        };
        await payWithUpi();
        const field = await screen.findByLabelText("Date of birth");
        expect(screen.getByText("You need to be 18 or over to place orders.")).toBeInTheDocument();
        /* The refusal is the gate's to draw — no raw error beside it, and nowhere to go yet. */
        expect(screen.queryByText("Add your date of birth to place an order — you need to be 18 or over.")).not.toBeInTheDocument();
        expect(push).not.toHaveBeenCalled();
        fireEvent.change(field, { target: { value: "1990-04-12" } });
        fireEvent.click(screen.getByRole("button", { name: "Save and continue" }));
        await waitFor(() => expect(patch).toHaveBeenCalledWith("/users/me", { dateOfBirth: "1990-04-12" }));
        await waitFor(() => expect(intentCalls()).toHaveLength(2));
        await waitFor(() => expect(push).toHaveBeenCalledWith("/advertiser/campaigns/c1/pay/return?payment=pay-1"));
    });

    it("says under 18 plainly and holds the pay button", async () => {
        postAnswer = (path) => (path === "/payments/intents" ? new ApiError(403, "AGE_REQUIRED", "You need to be 18 or over to place an order.", { reason: "UNDER_18", self: true }) : {});
        await payWithUpi();
        expect(await screen.findByRole("status")).toHaveTextContent("You need to be 18 or over to place an order.");
        await waitFor(() => expect(screen.getByRole("button", { name: /with UPI/ })).toBeDisabled());
        expect(screen.queryByLabelText("Date of birth")).not.toBeInTheDocument();
        expect(patch).not.toHaveBeenCalled();
        expect(intentCalls()).toHaveLength(1);
        expect(push).not.toHaveBeenCalled();
    });

    it("prints the server's sentence when the order is placed for someone else", async () => {
        postAnswer = (path) => (path === "/payments/intents" ? new ApiError(403, "AGE_REQUIRED", "The account holder is under 18 — an order needs someone 18 or over.", { reason: "UNDER_18", self: false }) : {});
        await payWithUpi();
        expect(await screen.findByRole("alert")).toHaveTextContent("The account holder is under 18 — an order needs someone 18 or over.");
        expect(screen.queryByLabelText("Date of birth")).not.toBeInTheDocument();
        expect(push).not.toHaveBeenCalled();
    });
});
