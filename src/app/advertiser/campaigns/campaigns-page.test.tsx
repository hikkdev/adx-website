import * as React from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The Campaigns page (28 Sep 2026, the owner: "I don't see any options for
 * campaign history here. Just an option to launch a new campaign."): the
 * status tabs are always drawn — at zero too — each empty tab says what will
 * appear in it beside "Plan a campaign", and a finished campaign is listed
 * under Completed.
 */

const nav = vi.hoisted(() => ({ search: new URLSearchParams(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({
    useRouter: () => ({ push: vi.fn(), replace: nav.replace }),
    usePathname: () => "/advertiser/campaigns",
    useSearchParams: () => nav.search,
}));

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

import { CAMPAIGN_TABS } from "@/services/campaigns";
import CampaignsPage from "./page";

const EMPTY = { items: [], total: 0, page: 1, pageSize: 20, counts: {} };
const listPath = (status: string | null, extra = "") => `/campaigns?${extra}${status ? `status=${status}&` : ""}sort=NEWEST&page=1&pageSize=20`;

function row(id: string, name: string, status: string, extra: Record<string, unknown> = {}) {
    return { id, reference: `CMP-${id.toUpperCase()}`, name, status, goal: null, brandName: "Aster Home", city: "Bengaluru", budget: "6136.00", total: "6136.00", startDate: "2026-08-01", endDate: "2026-08-14", spotCount: 1, spendToDate: "6136.00", createdAt: "2026-07-01T00:00:00Z", updatedAt: "2026-08-15T00:00:00Z", ...extra };
}

beforeEach(() => {
    nav.search = new URLSearchParams();
    nav.replace.mockReset();
    get.mockClear();
    answers.map = new Map();
});

describe("with no campaigns at all", () => {
    beforeEach(() => {
        for (const statuses of ["", "LIVE,PAUSED", "SCHEDULED", "DRAFT,PENDING_PAYMENT", "COMPLETED", "CANCELLED"]) answers.map.set(listPath(statuses || null), EMPTY);
    });

    it("draws every tab, each at zero, with All campaigns selected", async () => {
        render(<CampaignsPage />);
        const tabs = within(await screen.findByRole("tablist", { name: "Campaign history" })).getAllByRole("tab");
        expect(tabs.map((tab) => tab.textContent)).toEqual(["All campaigns0", "Live0", "Scheduled0", "Drafts0", "Completed0", "Cancelled0"]);
        expect(tabs[0]).toHaveAttribute("aria-selected", "true");
        expect(await screen.findByTestId("campaigns-empty")).toHaveTextContent("You have no campaigns yet. Your drafts and booked campaigns will appear here.");
        expect(screen.getByRole("link", { name: "Plan a campaign" })).toHaveAttribute("href", "/advertiser/campaigns/new");
        expect(screen.getByRole("link", { name: "Create campaign" })).toHaveAttribute("href", "/advertiser/campaigns/new");
        expect(screen.getByRole("link", { name: "Explore ad spaces" })).toHaveAttribute("href", "/spaces");
        expect(screen.getByTestId("campaigns-summary")).toHaveTextContent("0 campaigns");
    });

    it.each(CAMPAIGN_TABS.map((tab) => [tab.value, tab.label, tab.empty] as const))("the %s tab says what will appear in it", async (value, label, empty) => {
        nav.search = new URLSearchParams(value === "ALL" ? "" : `tab=${value}`);
        render(<CampaignsPage />);
        expect(await screen.findByTestId("campaigns-empty")).toHaveTextContent(empty);
        expect(screen.getByRole("tab", { selected: true })).toHaveTextContent(label);
        expect(screen.getByRole("link", { name: "Plan a campaign" })).toBeInTheDocument();
    });

    it("sends a tab to the address bar when it is picked", async () => {
        render(<CampaignsPage />);
        fireEvent.click(await screen.findByRole("tab", { name: /Completed/ }));
        expect(nav.replace).toHaveBeenCalledWith("/advertiser/campaigns?tab=COMPLETED", { scroll: false });
    });
});

describe("campaign history", () => {
    const counts = { LIVE: 1, DRAFT: 1, COMPLETED: 2, CANCELLED: 1 };

    it("lists the past campaigns under Completed, read with the COMPLETED status", async () => {
        answers.map.set(listPath("COMPLETED"), { items: [row("c3", "Monsoon Collection", "COMPLETED"), row("c5", "Summer Sale", "COMPLETED", { startDate: "2026-05-01", endDate: "2026-05-10" })], total: 2, page: 1, pageSize: 20, counts });
        nav.search = new URLSearchParams("tab=COMPLETED");
        render(<CampaignsPage />);
        const rows = within(await screen.findByTestId("campaigns-rows")).getAllByTestId("campaign-row");
        expect(get).toHaveBeenCalledWith(listPath("COMPLETED"));
        expect(rows).toHaveLength(2);
        expect(rows[0]).toHaveTextContent("Monsoon Collection");
        expect(rows[0]).toHaveTextContent("1–14 Aug 2026");
        expect(rows[0]).toHaveTextContent("₹6,136 spent");
        expect(within(rows[0]!).getByText("Completed")).toBeInTheDocument();
        expect(within(rows[0]!).getByRole("link", { name: "View campaign" })).toHaveAttribute("href", "/advertiser/campaigns/c3");
        expect(rows[1]).toHaveTextContent("Summer Sale");
        expect(screen.getByRole("tab", { selected: true })).toHaveTextContent("Completed2");
        expect(screen.getByRole("tab", { name: /Cancelled/ })).toHaveTextContent("Cancelled1");
        expect(screen.getByRole("tab", { name: /All campaigns/ })).toHaveTextContent("All campaigns5");
        expect(screen.getByText("Showing 2 of 2")).toBeInTheDocument();
    });

    it("lands the chips from before the tabs (?chip=ENDED) on Completed", async () => {
        answers.map.set(listPath("COMPLETED"), { items: [row("c3", "Monsoon Collection", "COMPLETED")], total: 1, page: 1, pageSize: 20, counts });
        nav.search = new URLSearchParams("chip=ENDED");
        render(<CampaignsPage />);
        expect(await screen.findByText("Monsoon Collection")).toBeInTheDocument();
        expect(screen.getByRole("tab", { selected: true })).toHaveTextContent("Completed");
    });

    it("searches and sorts on the server", async () => {
        answers.map.set("/campaigns?q=monsoon&status=COMPLETED&sort=OLDEST&page=1&pageSize=20", { items: [row("c3", "Monsoon Collection", "COMPLETED")], total: 1, page: 1, pageSize: 20, counts });
        nav.search = new URLSearchParams("tab=COMPLETED&q=monsoon&sort=OLDEST");
        render(<CampaignsPage />);
        expect(await screen.findByText("Monsoon Collection")).toBeInTheDocument();
        expect(screen.getByRole("combobox", { name: /Sort campaigns/ })).toHaveValue("OLDEST");
        fireEvent.change(screen.getByRole("combobox", { name: /Sort campaigns/ }), { target: { value: "ENDING_SOON" } });
        expect(nav.replace).toHaveBeenCalledWith("/advertiser/campaigns?tab=COMPLETED&q=monsoon&sort=ENDING_SOON", { scroll: false });
    });

    it("offers the way back to everything from an empty tab when other tabs have campaigns", async () => {
        answers.map.set(listPath("SCHEDULED"), { ...EMPTY, counts });
        nav.search = new URLSearchParams("tab=SCHEDULED");
        render(<CampaignsPage />);
        expect(await screen.findByTestId("campaigns-empty")).toHaveTextContent("Nothing is scheduled.");
        fireEvent.click(screen.getByRole("button", { name: "Show all campaigns" }));
        expect(nav.replace).toHaveBeenCalledWith("/advertiser/campaigns", { scroll: false });
    });
});
