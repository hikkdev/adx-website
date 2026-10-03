import * as React from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The workspace shell (28 Sep 2026, two owner asks): the advertiser side
 * lands on its Overview with Campaigns second ("Analytics should be above
 * campaigns … dashboard type feeling"), and the sidebar is its own scroll
 * area so the pages at its foot are never cut off ("looks like this is cut
 * off") — with the page that is open scrolled into the sidebar's view.
 */

const state = vi.hoisted(() => ({ pathname: "/advertiser" }));

vi.mock("next/navigation", () => ({ usePathname: () => state.pathname, useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));
vi.mock("@/lib/auth", () => ({
    useAuth: () => ({ status: "signed-in", user: { id: "usr-1", name: "Meera Sharma" }, parties: ["ADVERTISER"], signOut: vi.fn(), setPreferredParty: vi.fn() }),
    RequireParty: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("@/lib/brand", () => ({ useSiteBrand: () => ({ wordmarkUrl: "/wordmark.svg", platformName: "ADX" }) }));
vi.mock("@/components/notifications/notification-bell", () => ({ NotificationBell: () => null }));
vi.mock("@/lib/flags", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/flags")>();
    return { ...actual, useFlags: () => ({}), useSwitchedOff: () => false, useSwitchedOffCheck: () => () => false };
});

import { ADVERTISER_ACCOUNT, ADVERTISER_NAV, PARTNER_ACCOUNT, PUBLISHER_ACCOUNT, PUBLISHER_NAV, WorkspaceShell } from "./workspace-shell";

const scrollIntoView = vi.fn();
const original = Element.prototype.scrollIntoView;

beforeEach(() => {
    scrollIntoView.mockReset();
    Element.prototype.scrollIntoView = scrollIntoView;
});
afterEach(() => {
    Element.prototype.scrollIntoView = original;
});

function renderAdvertiserAt(pathname: string) {
    state.pathname = pathname;
    return render(
        <WorkspaceShell party="ADVERTISER" accountName="Meera Sharma" accountLine="Advertiser account" nav={ADVERTISER_NAV} account={ADVERTISER_ACCOUNT}>
            <p>The page itself</p>
        </WorkspaceShell>
    );
}

describe("the advertiser's navigation", () => {
    it("opens on the Overview, then Campaigns, then Analytics", () => {
        expect(ADVERTISER_NAV.slice(0, 4).map((item) => [item.label, item.href])).toEqual([
            ["Overview", "/advertiser"],
            ["Campaigns", "/advertiser/campaigns"],
            ["Analytics", "/advertiser/analytics"],
            ["Delivery proofs", "/advertiser/proofs"],
        ]);
        /* Only the Overview is exact: the book's own pages (a campaign, a new one) light Campaigns. */
        expect(ADVERTISER_NAV.filter((item) => item.exact).map((item) => item.label)).toEqual(["Overview"]);
    });

    it("draws the sidebar in that order and lights Campaigns on a campaign's own page", () => {
        renderAdvertiserAt("/advertiser/campaigns/c1");
        const links = within(screen.getByRole("navigation", { name: "Workspace" })).getAllByRole("link");
        expect(links.slice(0, 3).map((link) => link.textContent)).toEqual(["Overview", "Campaigns", "Analytics"]);
        expect(links[1]).toHaveAttribute("aria-current", "page");
        expect(links[0]).not.toHaveAttribute("aria-current");
    });

    it("lights the Overview on /advertiser only", () => {
        renderAdvertiserAt("/advertiser");
        const overview = within(screen.getByRole("navigation", { name: "Workspace" })).getByRole("link", { name: "Overview" });
        expect(overview).toHaveAttribute("aria-current", "page");
    });
});

describe("the sidebar scrolls on its own", () => {
    it("holds both navigations in one scroll area under the account block, sized to the viewport below the top bar", () => {
        renderAdvertiserAt("/advertiser");
        const scroller = screen.getByTestId("workspace-sidebar-scroll");
        expect(scroller.className).toMatch(/\boverflow-y-auto\b/);
        expect(scroller.className).toMatch(/\boverscroll-contain\b/);
        expect(scroller.className).toMatch(/\bmin-h-0\b/);
        expect(scroller).toContainElement(screen.getByRole("navigation", { name: "Workspace" }));
        expect(scroller).toContainElement(screen.getByRole("navigation", { name: "Account" }));
        const aside = scroller.closest("aside")!;
        expect(aside.className).toContain("h-[calc(100vh-57px)]");
        expect(aside.className).toContain("supports-[height:100dvh]:h-[calc(100dvh-57px)]");
        expect(aside.className).toMatch(/\bsticky\b/);
        /* The account block sits above the scroll area, so it stays in view. */
        expect(scroller).not.toHaveTextContent("Advertiser account");
        expect(aside).toHaveTextContent("Advertiser account");
    });

    it("scrolls a deep page's link into view when it is the one open", () => {
        renderAdvertiserAt("/advertiser/help");
        const help = within(screen.getByRole("navigation", { name: "Account" })).getByRole("link", { name: "Help & support" });
        expect(help).toHaveAttribute("aria-current", "page");
        expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest", inline: "nearest" });
        expect(scrollIntoView.mock.contexts).toContain(help);
    });

    it("does the same on the publisher's side", () => {
        state.pathname = "/publisher/refer";
        render(
            <WorkspaceShell party="PUBLISHER" accountName="Metro Media" accountLine="Publisher account" nav={PUBLISHER_NAV} account={PUBLISHER_ACCOUNT}>
                <p>The page itself</p>
            </WorkspaceShell>
        );
        const refer = within(screen.getByTestId("workspace-sidebar-scroll")).getByRole("link", { name: "Refer a business" });
        expect(scrollIntoView.mock.contexts).toContain(refer);
    });

    it("makes the account menu scrollable, and carries the workspace's pages in it for screens without the sidebar", () => {
        renderAdvertiserAt("/advertiser");
        fireEvent.click(screen.getByRole("button", { expanded: false }));
        const menu = screen.getByTestId("workspace-account-menu");
        expect(menu.className).toMatch(/\boverflow-y-auto\b/);
        expect(menu.className).toContain("max-h-[calc(100vh-73px)]");
        const items = within(menu).getAllByRole("menuitem").map((item) => item.textContent);
        expect(items.slice(0, 2)).toEqual(["Overview", "Campaigns"]);
        expect(items).toContain("Help & support");
    });

    it("beside the sidebar, repeats none of its pages — only who you are, the other workspace and signing out", () => {
        renderAdvertiserAt("/advertiser");
        fireEvent.click(screen.getByRole("button", { expanded: false }));
        const menu = screen.getByTestId("workspace-account-menu");
        // Every page link (the main pages and the account group) sits in the block hidden from the sidebar's breakpoint up.
        const pages = screen.getByTestId("workspace-account-menu-pages");
        expect(pages.className.split(" ")).toContain("lg:hidden");
        for (const label of ["Account settings", "Verification", "Agreements", "Refer a business", "Help & support"]) {
            expect(within(pages).getByRole("menuitem", { name: label })).toBeTruthy();
        }
        // What stays on every screen: the other workspace and Log out.
        const always = within(menu).getAllByRole("menuitem").filter((item) => !pages.contains(item)).map((item) => item.textContent);
        expect(always).toEqual([expect.stringMatching(/publisher workspace|Switch to publisher/), "Log out"]);
    });

    it("leaves Notifications to the bell, not the sidebar, on every side", () => {
        for (const account of [ADVERTISER_ACCOUNT, PUBLISHER_ACCOUNT, PARTNER_ACCOUNT]) {
            expect(account.map((item) => item.label)).not.toContain("Notifications");
        }
    });

    it("lists one settings page per side — Settings & privacy is a section of it, not an item of its own", () => {
        const settingsPages = [
            [ADVERTISER_ACCOUNT, "Account settings", "/advertiser/account"],
            [PUBLISHER_ACCOUNT, "Business profile", "/publisher/profile"],
            [PARTNER_ACCOUNT, "Shop profile", "/partner/profile"],
        ] as const;
        for (const [account, label, href] of settingsPages) {
            expect(account.map((item) => item.label)).not.toContain("Settings & privacy");
            expect(account.some((item) => item.href.endsWith("/settings"))).toBe(false);
            const page = account.find((item) => item.label === label);
            expect(page?.href).toBe(href);
            /* It holds the person's settings, so no feature switch hides it. */
            expect(page?.killSwitch).toBeUndefined();
            expect(page?.flag).toBeUndefined();
        }
    });
});
