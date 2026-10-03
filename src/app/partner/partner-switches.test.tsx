import * as React from "react";
import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The print partner's three kill switches on the web (28 Sep 2026):
 * `partners.print-floor` (the home, the application, jobs, earnings,
 * invoices, the shop profile, the rate card), `partners.quotes` (quote
 * requests) and `print.partner-kyc` (verification). Switched off, the entry
 * points hide from the workspace's navigation and the section's page says so
 * instead of calling the API; switched on — or not known to be off — the
 * workspace is what it was.
 */

const state = vi.hoisted(() => ({ pathname: "/partner", off: new Set<string>() }));
const partnerMe = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({ usePathname: () => state.pathname, useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));
vi.mock("@/lib/auth", () => ({
    useAuth: () => ({ status: "signed-in", user: { id: "usr-1", name: "Asha" }, parties: ["PRINT_PARTNER"], signOut: vi.fn(), setPreferredParty: vi.fn() }),
    RequireParty: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("@/lib/brand", () => ({ useSiteBrand: () => ({ wordmarkUrl: "/wordmark.svg", platformName: "ADX" }) }));
vi.mock("@/components/notifications/notification-bell", () => ({ NotificationBell: () => null }));
vi.mock("@/components/site/site-header", () => ({ SiteHeader: () => <header>ADX</header> }));
vi.mock("@/lib/flags", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/flags")>();
    return {
        ...actual,
        useFlags: () => ({}),
        useSwitchedOff: (key: string) => state.off.has(key),
        useSwitchedOffCheck: () => (key: string) => state.off.has(key),
    };
});
vi.mock("@/services/partner", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/services/partner")>();
    return { ...actual, partnerService: { ...actual.partnerService, me: partnerMe } };
});

import { FLAG_PARTNER_KYC, FLAG_PRINT_FLOOR, FLAG_PRINT_QUOTES } from "@/lib/flags";
import { PARTNER_ACCOUNT, PARTNER_NAV, visibleNav } from "@/components/workspace/workspace-shell";
import { onPrintFloor } from "@/components/partner/partner-context";
import PartnerLayout from "./layout";
import QuotesLayout from "./quotes/layout";

function renderAt(pathname: string, off: string[] = []) {
    state.pathname = pathname;
    state.off = new Set(off);
    return render(
        <PartnerLayout>
            <p>The page itself</p>
        </PartnerLayout>
    );
}

const workspaceNav = () => within(screen.getByRole("navigation", { name: "Workspace" }));
const accountNav = () => within(screen.getByRole("navigation", { name: "Account" }));

beforeEach(() => {
    partnerMe.mockReset();
    partnerMe.mockResolvedValue({ id: "pp-1", name: "Sharma Prints", activatedAt: "2026-09-01T00:00:00.000Z" });
});

describe("the navigation", () => {
    it("hides a kill-switched item only while its switch is off, and a flagged item unless its switch is on", () => {
        const none = () => false;
        expect(visibleNav(PARTNER_NAV, none, none).map((item) => item.label)).toEqual(["Home", "Jobs", "Quote requests", "Earnings", "Invoices"]);
        const floorOff = (key: string) => key === FLAG_PRINT_FLOOR;
        expect(visibleNav(PARTNER_NAV, none, floorOff).map((item) => item.label)).toEqual(["Quote requests"]);
        expect(visibleNav(PARTNER_ACCOUNT, none, (key) => key === FLAG_PARTNER_KYC).map((item) => item.label)).not.toContain("Verification");
        const flagged = [{ label: "Promote on ADX", href: "/advertiser/promotions", icon: PARTNER_NAV[0]!.icon, flag: "promotions.ads" }];
        expect(visibleNav(flagged, none, none)).toEqual([]);
        expect(visibleNav(flagged, (key) => key === "promotions.ads", none)).toHaveLength(1);
    });

    it("knows which partner pages are the print floor's own", () => {
        for (const path of ["/partner", "/partner/apply", "/partner/jobs", "/partner/jobs/j1", "/partner/earnings", "/partner/invoices", "/partner/rate-card"]) expect(onPrintFloor(path), path).toBe(true);
        /* 29 Sep 2026: the shop profile is the partner's one settings page — it draws with the floor off; its shop cards say so. */
        for (const path of ["/partner/quotes", "/partner/quotes/q1", "/partner/verify", "/partner/help", "/partner/agreements", "/partner/notifications", "/partner/settings", "/partner/profile"]) expect(onPrintFloor(path), path).toBe(false);
    });
});

describe("partners.print-floor", () => {
    it("on: the workspace reads the shop and draws the page, with the floor's items in the navigation", async () => {
        renderAt("/partner/jobs");
        expect(screen.getByText("The page itself")).toBeInTheDocument();
        expect(workspaceNav().getByRole("link", { name: "Jobs" })).toBeInTheDocument();
        expect(accountNav().getByRole("link", { name: "Shop profile" })).toBeInTheDocument();
        expect(partnerMe).toHaveBeenCalled();
        expect(screen.queryByText(/switched off for now/)).not.toBeInTheDocument();
    });

    it("off: a floor page says so instead of drawing, the shop is not read, and the floor's items hide", () => {
        renderAt("/partner/jobs", [FLAG_PRINT_FLOOR]);
        expect(screen.getByText("The print partner workspace is switched off for now.")).toBeInTheDocument();
        expect(screen.queryByText("The page itself")).not.toBeInTheDocument();
        expect(partnerMe).not.toHaveBeenCalled();
        for (const label of ["Home", "Jobs", "Earnings", "Invoices"]) expect(workspaceNav().queryByRole("link", { name: label })).not.toBeInTheDocument();
        expect(workspaceNav().getByRole("link", { name: "Quote requests" })).toBeInTheDocument();
        /* The shop profile holds the person's settings too, so it stays; the rate card is the floor's own. */
        expect(accountNav().getByRole("link", { name: "Shop profile" })).toBeInTheDocument();
        expect(accountNav().queryByRole("link", { name: "Rate card" })).not.toBeInTheDocument();
        expect(accountNav().getByRole("link", { name: "Help & support" })).toBeInTheDocument();
    });

    it("off: a page another feature owns still draws", () => {
        renderAt("/partner/help", [FLAG_PRINT_FLOOR]);
        expect(screen.getByText("The page itself")).toBeInTheDocument();
        expect(partnerMe).not.toHaveBeenCalled();
    });

    it("off: the application says so, outside the workspace", () => {
        renderAt("/partner/apply", [FLAG_PRINT_FLOOR]);
        expect(screen.getByText("Applying as a print partner is switched off for now.")).toBeInTheDocument();
        expect(screen.queryByText("The page itself")).not.toBeInTheDocument();
    });
});

describe("partners.quotes and print.partner-kyc", () => {
    it("quotes off: the nav item hides and the quote pages say so instead of drawing", () => {
        renderAt("/partner/quotes", [FLAG_PRINT_QUOTES]);
        expect(workspaceNav().queryByRole("link", { name: "Quote requests" })).not.toBeInTheDocument();
        expect(workspaceNav().getByRole("link", { name: "Jobs" })).toBeInTheDocument();
        render(
            <QuotesLayout>
                <p>The quote list</p>
            </QuotesLayout>
        );
        expect(screen.getByText("Quote requests are switched off for now.")).toBeInTheDocument();
        expect(screen.queryByText("The quote list")).not.toBeInTheDocument();
    });

    it("quotes on: the quote pages draw", () => {
        state.off = new Set();
        render(
            <QuotesLayout>
                <p>The quote list</p>
            </QuotesLayout>
        );
        expect(screen.getByText("The quote list")).toBeInTheDocument();
    });

    it("verification off: its account item hides", () => {
        renderAt("/partner/help", [FLAG_PARTNER_KYC]);
        expect(accountNav().queryByRole("link", { name: "Verification" })).not.toBeInTheDocument();
        expect(accountNav().getByRole("link", { name: "Shop profile" })).toBeInTheDocument();
    });
});
