import "@testing-library/jest-dom/vitest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";

let search = new URLSearchParams();
const replace = vi.fn();
const push = vi.fn();
vi.mock("next/navigation", () => ({
    useParams: () => ({ id: "ad1" }),
    useRouter: () => ({ push, replace }),
    usePathname: () => "/advertiser/promotions",
    useSearchParams: () => search,
}));
vi.mock("@/app/advertiser/layout", () => ({ useAdvertiser: () => ({ id: "a1", name: "Meera Sharma" }) }));

let flagOn = true;
let flagsLoaded = true;
/* The kill switches the platform has said are off (lib/flags `useSwitchedOff`). */
let switchedOff = new Set<string>();
vi.mock("@/lib/flags", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/lib/flags")>()),
    useFlag: () => flagOn,
    useFlagsLoaded: () => flagsLoaded,
    useSwitchedOff: (key: string) => switchedOff.has(key),
}));

const answers = new Map<string, unknown>();
const get = vi.fn(async (path: string): Promise<unknown> => {
    for (const [prefix, value] of answers) if (path.startsWith(prefix)) {
        if (value instanceof Error) throw value;
        return value;
    }
    return {};
});
const post = vi.fn(async (_path: string, _body?: unknown): Promise<unknown> => ({}));
vi.mock("@/lib/api-client", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-client")>();
    return { ...actual, api: { get: (path: string) => get(path), post: (path: string, body?: unknown) => post(path, body), patch: vi.fn(), put: vi.fn(), delete: vi.fn() } };
});

import { ApiError } from "@/lib/api-client";
import PromotionsPage from "@/app/advertiser/promotions/page";
import AdDetailPage from "@/app/advertiser/promotions/[id]/page";
import { SlotCard, SlotPreview } from "./slot-preview";
import { QuoteBlock } from "./quote-block";
import { quoteFor } from "./ad-helpers";

const sidebar = { key: "LISTING_SIDEBAR", label: "Listing page sidebar", description: "Beside every listing, under the price.", surfaces: ["WEB_LISTING"], spec: "AD_SIDEBAR", ratePerDay: "1500.00", minDays: 3, maxConcurrent: 4 };

const ad = {
    id: "ad1",
    displayId: "ADB-2709-2601",
    slot: { key: "LISTING_SIDEBAR", label: "Listing page sidebar", spec: "AD_SIDEBAR", surfaces: ["WEB_LISTING"] },
    title: "Diwali sale",
    headline: "Festive offers",
    ctaLabel: "Shop now",
    targetUrl: "https://example.com/offer",
    cityIds: [],
    startDate: "2026-10-11T00:00:00.000Z",
    endDate: "2026-10-17T00:00:00.000Z",
    days: 7,
    ratePerDay: "1500.00",
    subtotal: "10500.00",
    gstAmount: "1890.00",
    total: "12390.00",
    status: "REJECTED",
    reviewNote: "The text is too small to read.",
    paidAt: "2026-10-01T10:00:00.000Z",
    refundedAt: "2026-10-02T10:00:00.000Z",
    cancelledAt: null,
    cancelReason: null,
    mediaId: "m1",
    media: { url: "https://cdn.example.com/a.png", width: 600, height: 750, altText: null },
    stats: null,
};

beforeEach(() => {
    search = new URLSearchParams();
    flagOn = true;
    flagsLoaded = true;
    switchedOff = new Set();
    answers.clear();
    get.mockClear();
    post.mockClear();
});

describe("Promote on ADX — the list", () => {
    it("says honestly there are no ads yet, with the door to book one", async () => {
        answers.set("/promotions/ads/mine", []);
        render(<PromotionsPage />);
        expect(await screen.findByTestId("ads-empty")).toHaveTextContent("No ads booked yet");
        expect(screen.getByRole("link", { name: "Book an ad" })).toHaveAttribute("href", "/advertiser/promotions/new");
        expect(screen.getByRole("link", { name: "Book your first ad" })).toBeInTheDocument();
    });

    it("draws each ad with its slot, days, status and total", async () => {
        answers.set("/promotions/ads/mine", { items: [{ ...ad, status: "LIVE", stats: { impressions: 1200, clicks: 30, ctr: 0.025, byDay: [] } }] });
        render(<PromotionsPage />);
        const table = await screen.findByRole("table");
        expect(within(table).getByText("Diwali sale")).toBeInTheDocument();
        expect(within(table).getByText("Listing page sidebar")).toBeInTheDocument();
        expect(within(table).getByText("11 Oct 2026 – 17 Oct 2026 · 7 days")).toBeInTheDocument();
        expect(within(table).getByText("Live")).toBeInTheDocument();
        expect(within(table).getByText("1,200 · 30 · 2.5%")).toBeInTheDocument();
        expect(within(table).getByText("₹12,390.00")).toBeInTheDocument();
    });

    it("offers no door when the switch is off", () => {
        flagOn = false;
        render(<PromotionsPage />);
        expect(screen.getByTestId("ads-closed")).toHaveTextContent("Advertising on ADX is not open yet");
        expect(screen.queryByRole("link", { name: "Book an ad" })).not.toBeInTheDocument();
        expect(get).not.toHaveBeenCalled();
    });

    it("draws nothing to click before the flags have loaded", () => {
        flagOn = false;
        flagsLoaded = false;
        render(<PromotionsPage />);
        expect(screen.queryByTestId("ads-closed")).not.toBeInTheDocument();
        expect(screen.queryByRole("link", { name: "Book an ad" })).not.toBeInTheDocument();
    });

    it("reads a 503 FEATURE_OFF as not open", async () => {
        answers.set("/promotions/ads/mine", new ApiError(503, "FEATURE_OFF", "Off"));
        render(<PromotionsPage />);
        expect(await screen.findByTestId("ads-closed")).toBeInTheDocument();
        expect(screen.queryByRole("link", { name: "Book an ad" })).not.toBeInTheDocument();
    });
});

describe("the slot card and the price", () => {
    it("draws the listing page with the sidebar marked, and the slot's facts", () => {
        render(<SlotCard slot={sidebar} specs={null} checked={false} onSelect={() => {}} />);
        const preview = screen.getByTestId("slot-preview");
        expect(preview).toHaveAttribute("data-page", "LISTING");
        expect(preview).toHaveAttribute("data-position", "SIDEBAR");
        expect(preview).toHaveAccessibleName("Where it shows: Website listing pages — in the sidebar");
        expect(within(preview).getByTestId("slot-preview-ad")).toHaveTextContent("Ad");
        expect(screen.getByText("₹1,500 / day")).toBeInTheDocument();
        expect(screen.getByText("600 × 750 px")).toBeInTheDocument();
        expect(screen.getByText("3 days")).toBeInTheDocument();
        expect(screen.getByText("Up to 4, rotating")).toBeInTheDocument();
    });

    it("draws a banner slot on a phone as a strip", () => {
        render(<SlotPreview slot={{ label: "Home banner", surfaces: ["APP_ADVERTISER_HOME"], spec: "AD_BANNER" }} />);
        expect(screen.getByTestId("slot-preview")).toHaveAttribute("data-page", "APP");
        expect(screen.getByTestId("slot-preview")).toHaveAttribute("data-position", "BANNER");
    });

    it("prices days × rate + GST", () => {
        const quote = quoteFor(sidebar, "2026-10-11", "2026-10-17", null);
        render(<QuoteBlock quote={quote} fromServer={quote?.fromServer} />);
        const block = screen.getByTestId("ad-quote");
        expect(within(block).getByText("₹10,500.00")).toBeInTheDocument();
        expect(within(block).getByText("₹1,890.00")).toBeInTheDocument();
        expect(within(block).getByText("₹12,390.00")).toBeInTheDocument();
        expect(within(block).getByText(/ADX confirms the figure/)).toBeInTheDocument();
    });

    it("asks for a slot and days before it prices anything", () => {
        render(<QuoteBlock quote={null} />);
        expect(screen.getByText("Choose a slot and your days to see the price.")).toBeInTheDocument();
    });
});

describe("one ad", () => {
    it("gives a rejected ad's reason, the refund, the edit door, and the money", async () => {
        answers.set("/promotions/ads/ad1", ad);
        render(<AdDetailPage />);
        expect(await screen.findByTestId("ad-status-line")).toHaveTextContent("ADX's reason: The text is too small to read.");
        expect(screen.getByRole("link", { name: "Edit and resubmit" })).toHaveAttribute("href", "/advertiser/promotions/new?edit=ad1");
        expect(screen.queryByRole("button", { name: "Cancel ad" })).not.toBeInTheDocument();
        expect(screen.getByText("ADB-2709-2601 · Listing page sidebar")).toBeInTheDocument();
        expect(screen.getByText("Refunded on")).toBeInTheDocument();
        expect(within(screen.getByTestId("ad-creative")).getByText("Ad")).toBeInTheDocument();
        expect(screen.getByText("Everywhere")).toBeInTheDocument();
    });

    it("states what cancelling does to the money before the button", async () => {
        answers.set("/promotions/ads/ad1", { ...ad, status: "SCHEDULED", reviewNote: null, refundedAt: null, startDate: "2099-01-01T00:00:00.000Z", endDate: "2099-01-07T00:00:00.000Z" });
        render(<AdDetailPage />);
        fireEvent.click(await screen.findByRole("button", { name: "Cancel ad" }));
        expect(await screen.findByTestId("cancel-rule")).toHaveTextContent("It has not started yet, so the full ₹12,390.00 goes back to your ADX wallet.");
        expect(screen.getByTestId("promotion-stats")).toBeInTheDocument();
    });

    it("offers the wallet when it covers the total, and says an unpaid booking is released after 60 minutes", async () => {
        answers.set("/promotions/ads/ad1", { ...ad, status: "PENDING_PAYMENT", reviewNote: null, refundedAt: null, paidAt: null });
        answers.set("/advertisers/a1/wallet", { balance: "50000.00", goodwill: "0.00", held: "0.00", spendable: "50000.00", currency: "INR" });
        answers.set("/payments/gateways", [{ gateway: "CASHFREE", configured: true, testMode: true }]);
        render(<AdDetailPage />);
        const pay = await screen.findByTestId("ad-pay");
        expect(await within(pay).findByRole("button", { name: "Pay ₹12,390.00 from wallet" })).toBeInTheDocument();
        expect(within(pay).getByRole("button", { name: "Pay by card or UPI" })).toBeInTheDocument();
        expect(pay).toHaveTextContent("An unpaid booking is released 60 minutes after it was submitted.");
        expect(within(pay).queryByRole("status")).not.toBeInTheDocument();
    });

    it("offers no card or UPI while payments.gateways is switched off, says so in one line, and keeps the wallet", async () => {
        switchedOff = new Set(["payments.gateways"]);
        answers.set("/promotions/ads/ad1", { ...ad, status: "PENDING_PAYMENT", reviewNote: null, refundedAt: null, paidAt: null });
        answers.set("/advertisers/a1/wallet", { balance: "50000.00", goodwill: "0.00", held: "0.00", spendable: "50000.00", currency: "INR" });
        answers.set("/payments/gateways", [{ gateway: "CASHFREE", configured: true, testMode: true }]);
        render(<AdDetailPage />);
        const pay = await screen.findByTestId("ad-pay");
        expect(await within(pay).findByRole("button", { name: "Pay ₹12,390.00 from wallet" })).toBeInTheDocument();
        const off = within(pay).getByRole("status");
        expect(off).toHaveTextContent("Paying by card, UPI or bank transfer is switched off for now.");
        expect(off).toHaveTextContent("Pay from your ADX wallet, or come back later.");
        expect(within(pay).queryByRole("button", { name: "Pay by card or UPI" })).not.toBeInTheDocument();
        expect(pay).not.toHaveTextContent("Card and UPI go through");
        expect(pay).not.toHaveTextContent("card payments are not set up yet");
        expect(post).not.toHaveBeenCalledWith("/payments/intents", expect.anything());
    });
});
