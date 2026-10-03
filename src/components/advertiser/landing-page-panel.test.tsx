import * as React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

/**
 * `campaigns.landing-pages` on the web (28 Sep 2026): the campaign's "Your
 * ADX page" panel is the way into the builder. Switched off, it offers no
 * way in and says the builder is switched off; the builder's own page keeps
 * its heading and draws the same line instead of reading or drafting.
 */

const off = vi.hoisted(() => ({ keys: new Set<string>() }));
vi.mock("@/lib/flags", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/flags")>()), useSwitchedOff: (key: string) => off.keys.has(key) }));

import { FLAG_LANDING_PAGES } from "@/lib/flags";
import { FeatureGate } from "@/components/platform/feature-off";
import { LandingPagePanel } from "./campaign-extras";

const panel = <LandingPagePanel campaignId="cmp-1" trackingMethod="QR_OR_DEEPLINK" destinationUrl={null} landingPage={{ status: "DRAFT", url: "/p/diwali" }} apiBase="https://api.adx.in/api/v1" />;

describe("the ADX page panel", () => {
    it("on: offers the editor", () => {
        off.keys = new Set();
        render(panel);
        expect(screen.getByRole("link", { name: "Edit the page" })).toHaveAttribute("href", "/advertiser/campaigns/cmp-1/landing-page");
        expect(screen.queryByText(/switched off for now/)).not.toBeInTheDocument();
    });

    it("off: no way into the editor, and the line", () => {
        off.keys = new Set([FLAG_LANDING_PAGES]);
        render(panel);
        expect(screen.queryByRole("link", { name: "Edit the page" })).not.toBeInTheDocument();
        expect(screen.getByText("The ADX landing page builder is switched off for now.")).toBeInTheDocument();
    });

    it("off: the builder's section is not mounted", () => {
        off.keys = new Set([FLAG_LANDING_PAGES]);
        const Builder = vi.fn(() => <p>The builder</p>);
        render(
            <FeatureGate flag={FLAG_LANDING_PAGES}>
                <Builder />
            </FeatureGate>
        );
        expect(Builder).not.toHaveBeenCalled();
        expect(screen.getByText("The ADX landing page builder is switched off for now.")).toBeInTheDocument();
    });
});
