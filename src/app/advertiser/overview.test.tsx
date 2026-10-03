import * as React from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The advertiser's Overview (28 Sep 2026, the owner: "Analytics should be
 * above campaigns … will give dashboard type feeling"): the key numbers
 * first, then the daily figures, campaign history and the wallet, then the
 * recent campaigns with the way to the whole book — and a link from before
 * it (`/advertiser?chip=…`) sent on to the Campaigns page.
 */

const nav = vi.hoisted(() => ({ search: new URLSearchParams(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({
    useRouter: () => ({ push: vi.fn(), replace: nav.replace }),
    usePathname: () => "/advertiser",
    useSearchParams: () => nav.search,
}));
/* A business account: the advertiser is named after the business, the person signed in is Meera. */
vi.mock("@/app/advertiser/layout", () => ({ useAdvertiser: () => ({ id: "a1", name: "Aster Home Pvt Ltd" }) }));
const auth = vi.hoisted(() => ({ user: { id: "u1", name: "Meera Sharma", firstName: "Meera" } as { id: string; name: string | null; firstName?: string | null } }));
vi.mock("@/lib/auth", () => ({ useAuth: () => ({ user: auth.user }) }));

const answers = vi.hoisted(() => ({ map: new Map<string, unknown>() }));
const get = vi.hoisted(() =>
    vi.fn(async (path: string): Promise<unknown> => {
        if (answers.map.has(path)) return answers.map.get(path);
        throw new Error(`unexpected read ${path}`);
    })
);
vi.mock("@/lib/api-client", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-client")>();
    return { ...actual, api: { get: (path: string) => get(path), post: vi.fn(), patch: vi.fn(), put: vi.fn(), delete: vi.fn() } };
});

import AdvertiserOverview from "./page";

const RECENT = "/campaigns?sort=NEWEST&page=1&pageSize=5";
const PORTFOLIO = "/campaigns/analytics?days=30";
const SCHEDULED = "/campaigns?status=SCHEDULED&sort=ENDING_SOON&page=1&pageSize=50";

function row(id: string, name: string, status: string, extra: Record<string, unknown> = {}) {
    return { id, reference: `CMP-${id.toUpperCase()}`, name, status, goal: null, brandName: "Aster Home", city: "Bengaluru", budget: "25960.00", total: "25960.00", startDate: "2026-10-12", endDate: "2026-10-25", spotCount: 2, spendToDate: null, createdAt: "2026-09-01T00:00:00Z", updatedAt: "2026-09-20T00:00:00Z", ...extra };
}

const series = Array.from({ length: 30 }, (_, i) => ({ day: `2026-09-${String(i + 1).padStart(2, "0")}`, spend: "1000.00", scans: i === 27 ? 40 : 2, clicks: 1 }));

const portfolio = {
    totalReach: { value: 184_000, provenance: "ESTIMATED", basis: "Publisher-stated footfall across 2 of 3 campaigns" },
    clickRate: { value: 12.5, provenance: "MEASURED", basis: "12 of 96 scans across 2 tracked campaigns" },
    activeCampaigns: { value: 1, basis: "1 live of 3 campaigns" },
    budgetSpent: { value: "48000.00", basis: "40% of ₹1,20,000 committed", onTrack: true },
    series,
    campaigns: [],
};

beforeEach(() => {
    auth.user = { id: "u1", name: "Meera Sharma", firstName: "Meera" };
    nav.search = new URLSearchParams();
    nav.replace.mockReset();
    get.mockClear();
    answers.map = new Map<string, unknown>([
        ["/advertisers/me", { id: "a1", name: "Aster Home Pvt Ltd", type: "BUSINESS", kycStatus: "NOT_STARTED" }],
        ["/advertisers/a1/eligibility", { eligible: true, blockedBy: [] }],
        ["/advertisers/a1/wallet", { balance: "12500.00", goodwill: "0.00", held: "0.00", spendable: "12500.00", currency: "INR" }],
        [PORTFOLIO, portfolio],
    ]);
});

describe("the Overview with campaigns", () => {
    beforeEach(() => {
        answers.map.set(RECENT, {
            items: [row("c1", "Aster Festive Launch", "LIVE", { spendToDate: "12000.00" }), row("c2", "Winter Sale", "SCHEDULED", { startDate: "2026-11-02", endDate: "2026-11-15" }), row("c3", "Monsoon Collection", "COMPLETED", { startDate: "2026-08-01", endDate: "2026-08-14" })],
            total: 7,
            page: 1,
            pageSize: 5,
            counts: { LIVE: 1, SCHEDULED: 2, DRAFT: 1, COMPLETED: 2, CANCELLED: 1 },
        });
        answers.map.set(SCHEDULED, { items: [row("c2", "Winter Sale", "SCHEDULED", { startDate: "2026-11-02" }), row("c4", "Diwali", "SCHEDULED", { startDate: "2026-10-20" })], total: 2, page: 1, pageSize: 50, counts: {} });
        answers.map.set("/campaigns/c2", { id: "c2", status: "SCHEDULED", creatives: [], launchBlockedBy: [] });
    });

    it("opens on the key numbers — live, upcoming with the next start, spend and reach", async () => {
        render(<AdvertiserOverview />);
        expect(await screen.findByRole("heading", { level: 1, name: "Overview" })).toBeInTheDocument();
        const live = screen.getByTestId("overview-live");
        expect(within(live).getByText("Live campaigns")).toBeInTheDocument();
        expect(within(live).getByText("1")).toBeInTheDocument();
        await waitFor(() => expect(screen.getByTestId("overview-upcoming")).toHaveTextContent("Next one starts 20 Oct 2026"));
        expect(within(screen.getByTestId("overview-upcoming")).getByText("2")).toBeInTheDocument();
        await waitFor(() => expect(screen.getByTestId("overview-spend")).toHaveTextContent("₹48,000"));
        expect(screen.getByTestId("overview-spend")).toHaveTextContent("40% of ₹1,20,000 committed");
        expect(screen.getByTestId("overview-spend")).toHaveTextContent("On track");
        expect(screen.getByTestId("overview-reach")).toHaveTextContent("1.8L");
        expect(get).toHaveBeenCalledWith(PORTFOLIO);
    });

    it("puts the numbers above the campaigns, with the daily scans, history and wallet between", async () => {
        render(<AdvertiserOverview />);
        const recent = await screen.findByRole("heading", { name: "Recent campaigns" });
        const numbers = screen.getByRole("region", { name: "Key numbers" });
        expect(numbers.compareDocumentPosition(recent) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        await waitFor(() => expect(screen.getByTestId("overview-performance")).toHaveTextContent("98 scans in all"));
        expect(screen.getByRole("link", { name: "See full analytics →" })).toHaveAttribute("href", "/advertiser/analytics");
        await waitFor(() => expect(screen.getByTestId("overview-wallet")).toHaveTextContent("₹12,500"));
        expect(screen.getByRole("link", { name: "View history" })).toHaveAttribute("href", "/advertiser/campaigns?tab=COMPLETED");
        expect(screen.getByRole("link", { name: /2\s*Completed/ })).toHaveAttribute("href", "/advertiser/campaigns?tab=COMPLETED");
        expect(screen.getByRole("link", { name: /1\s*Cancelled/ })).toHaveAttribute("href", "/advertiser/campaigns?tab=CANCELLED");
    });

    it("lists the recent campaigns and links to the whole book", async () => {
        render(<AdvertiserOverview />);
        const rows = within(await screen.findByTestId("recent-rows")).getAllByTestId("campaign-row");
        expect(rows).toHaveLength(3);
        expect(rows[0]).toHaveTextContent("Aster Festive Launch");
        expect(rows[1]).toHaveTextContent("Winter Sale");
        expect(rows[2]).toHaveTextContent("Monsoon Collection");
        expect(within(rows[2]!).getByText("Completed")).toBeInTheDocument();
        expect(within(rows[0]!).getByRole("link", { name: "View campaign" })).toHaveAttribute("href", "/advertiser/campaigns/c1");
        expect(screen.getByText("7 campaigns · 1 draft")).toBeInTheDocument();
        expect(screen.getByRole("link", { name: "View all campaigns" })).toHaveAttribute("href", "/advertiser/campaigns");
        expect(screen.getByRole("link", { name: "Create campaign" })).toHaveAttribute("href", "/advertiser/campaigns/new");
    });
});

describe("the greeting", () => {
    beforeEach(() => {
        answers.map.set(RECENT, { items: [], total: 0, page: 1, pageSize: 5, counts: {} });
    });

    it("greets the person by their own first name, never the business the account is named after", async () => {
        render(<AdvertiserOverview />);
        expect(await screen.findByText(/^Good (morning|afternoon|evening|night), Meera$/)).toBeInTheDocument();
        expect(screen.queryByText(/, Aster/)).not.toBeInTheDocument();
    });

    it("falls back to the first word of the person's display name", async () => {
        auth.user = { id: "u1", name: "Ravi Kumar", firstName: null };
        render(<AdvertiserOverview />);
        expect(await screen.findByText(/^Good (morning|afternoon|evening|night), Ravi$/)).toBeInTheDocument();
    });

    it("greets without a name while the person has none but their number", async () => {
        auth.user = { id: "u1", name: "+919876543210", firstName: null };
        render(<AdvertiserOverview />);
        expect(await screen.findByText(/^Good (morning|afternoon|evening|night)$/)).toBeInTheDocument();
    });
});

describe("the Overview for a new advertiser", () => {
    beforeEach(() => {
        answers.map.set(RECENT, { items: [], total: 0, page: 1, pageSize: 5, counts: {} });
        answers.map.set("/advertisers/a1/eligibility", { eligible: false, blockedBy: ["PROFILE", "AGREEMENT"] });
        answers.map.set(PORTFOLIO, { ...portfolio, totalReach: { value: null, provenance: "UNAVAILABLE", basis: "No booked site states a daily footfall figure" }, budgetSpent: { value: "0.00", basis: "Nothing committed yet", onTrack: null }, series: [] });
    });

    it("keeps the set-up card and the first-campaign card, with the numbers at zero and the history a click away", async () => {
        render(<AdvertiserOverview />);
        expect(await screen.findByRole("heading", { level: 1, name: "Welcome to your advertiser workspace" })).toBeInTheDocument();
        expect(await screen.findByText("Tell us who is advertising")).toBeInTheDocument();
        expect(screen.getByText("Step 2 of 3")).toBeInTheDocument();
        expect(screen.getByRole("heading", { name: "Create your first campaign" })).toBeInTheDocument();
        expect(screen.getByRole("link", { name: "Plan a campaign" })).toHaveAttribute("href", "/advertiser/campaigns/new");
        expect(within(screen.getByTestId("overview-live")).getByText("0")).toBeInTheDocument();
        expect(within(screen.getByTestId("overview-upcoming")).getByText("0")).toBeInTheDocument();
        await waitFor(() => expect(screen.getByTestId("overview-spend")).toHaveTextContent("Nothing committed yet"));
        expect(screen.getByTestId("overview-reach")).toHaveTextContent("Not measured");
        expect(screen.getByText(/Your drafts and booked campaigns will appear here — live, scheduled, completed and cancelled/)).toBeInTheDocument();
        expect(screen.getByRole("link", { name: "View all campaigns" })).toHaveAttribute("href", "/advertiser/campaigns");
        expect(screen.getByRole("link", { name: "View history" })).toHaveAttribute("href", "/advertiser/campaigns?tab=COMPLETED");
        /* Nothing scheduled, so the scheduled list is not read. */
        expect(get).not.toHaveBeenCalledWith(SCHEDULED);
    });
});

describe("links from before the Overview", () => {
    it("sends /advertiser?chip=ENDED&q=aster to the Campaigns page's Completed tab with the search", async () => {
        nav.search = new URLSearchParams("chip=ENDED&q=aster");
        render(<AdvertiserOverview />);
        await waitFor(() => expect(nav.replace).toHaveBeenCalledWith("/advertiser/campaigns?tab=COMPLETED&q=aster"));
        expect(get).not.toHaveBeenCalledWith(RECENT);
    });
});
