import * as React from "react";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * One settings page per side (29 Sep 2026): the sections, where each old
 * anchor's card now lives, and the redirects from the three old
 * `/…/settings` routes — so bookmarks and every link still land.
 */

const nav = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: nav.replace, push: vi.fn() }), usePathname: () => "/advertiser/settings", useSearchParams: () => new URLSearchParams() }));

import { OLD_SETTINGS_ROUTE, SETTINGS_HOME, SETTINGS_SECTIONS, SETTINGS_TITLE, sectionFrom, settingsHref, settingsRedirectTarget } from "./sections";
import { SettingsRedirect } from "./settings-layout";

beforeEach(() => {
    nav.replace.mockReset();
});

describe("the sections", () => {
    it("are the profile, then Notifications, then Privacy & security", () => {
        expect(SETTINGS_SECTIONS.map((section) => section.label)).toEqual(["Profile", "Notifications", "Privacy & security"]);
        expect(SETTINGS_HOME).toEqual({ ADVERTISER: "/advertiser/account", PUBLISHER: "/publisher/profile", PRINT_PARTNER: "/partner/profile" });
        expect(SETTINGS_TITLE).toEqual({ ADVERTISER: "Account settings", PUBLISHER: "Business profile", PRINT_PARTNER: "Shop profile" });
    });

    it("opens ?section= first, else the section an old anchor's card lives in, else the profile", () => {
        expect(sectionFrom("notifications", "#security")).toBe("notifications");
        expect(sectionFrom(null, "#security")).toBe("privacy");
        expect(sectionFrom(null, "#agent-access")).toBe("privacy");
        expect(sectionFrom(null, "#notifications")).toBe("notifications");
        expect(sectionFrom(null, "#contacts")).toBe("profile");
        expect(sectionFrom("bogus", "#nothing")).toBe("profile");
        expect(sectionFrom(null, "")).toBe("profile");
    });

    it("links a section and a card on each side's page", () => {
        expect(settingsHref("ADVERTISER")).toBe("/advertiser/account");
        expect(settingsHref("PUBLISHER", "notifications")).toBe("/publisher/profile?section=notifications");
        expect(settingsHref("PRINT_PARTNER", "privacy", "security")).toBe("/partner/profile?section=privacy#security");
    });
});

describe("the old /…/settings routes", () => {
    it("send the bare route — the page called Settings & privacy — to Privacy & security", () => {
        expect(settingsRedirectTarget("ADVERTISER", "", "")).toBe("/advertiser/account?section=privacy");
        expect(settingsRedirectTarget("PUBLISHER", "", "")).toBe("/publisher/profile?section=privacy");
        expect(settingsRedirectTarget("PRINT_PARTNER", "", "")).toBe("/partner/profile?section=privacy");
    });

    it("send each old anchor to the section its card lives in, anchor kept", () => {
        expect(settingsRedirectTarget("ADVERTISER", "", "#notifications")).toBe("/advertiser/account?section=notifications#notifications");
        expect(settingsRedirectTarget("ADVERTISER", "", "#privacy")).toBe("/advertiser/account?section=privacy#privacy");
        expect(settingsRedirectTarget("PUBLISHER", "", "#security")).toBe("/publisher/profile?section=privacy#security");
        expect(settingsRedirectTarget("ADVERTISER", "", "#agent-access")).toBe("/advertiser/account?section=privacy#agent-access");
        expect(settingsRedirectTarget("PUBLISHER", "", "#profile")).toBe("/publisher/profile?section=profile#profile");
        expect(settingsRedirectTarget("PRINT_PARTNER", "", "#contacts")).toBe("/partner/profile?section=profile#contacts");
        expect(settingsRedirectTarget("PRINT_PARTNER", "", "#language")).toBe("/partner/profile?section=profile#language");
    });

    it("pass a ?section= through, and drop an anchor the page never had", () => {
        expect(settingsRedirectTarget("ADVERTISER", "?section=notifications", "")).toBe("/advertiser/account?section=notifications");
        expect(settingsRedirectTarget("ADVERTISER", "?section=profile", "#nowhere")).toBe("/advertiser/account?section=profile");
        expect(settingsRedirectTarget("ADVERTISER", "", "#nowhere")).toBe("/advertiser/account?section=privacy");
    });

    it("are drawn as the way on: the route replaces itself with the side's page", () => {
        window.history.replaceState(null, "", `${OLD_SETTINGS_ROUTE.ADVERTISER}#notifications`);
        render(<SettingsRedirect party="ADVERTISER" />);
        expect(screen.getByText("Opening your settings…")).toBeInTheDocument();
        expect(nav.replace).toHaveBeenCalledWith("/advertiser/account?section=notifications#notifications");
    });

    it("are what the three old pages draw", async () => {
        const pages = await Promise.all([import("@/app/advertiser/settings/page"), import("@/app/publisher/settings/page"), import("@/app/partner/settings/page")]);
        const expected = ["/advertiser/account?section=privacy", "/publisher/profile?section=privacy", "/partner/profile?section=privacy"];
        pages.forEach(({ default: Page }, index) => {
            nav.replace.mockReset();
            window.history.replaceState(null, "", "/somewhere/settings");
            const { unmount } = render(<Page />);
            expect(nav.replace).toHaveBeenCalledWith(expected[index]);
            unmount();
        });
    });
});
