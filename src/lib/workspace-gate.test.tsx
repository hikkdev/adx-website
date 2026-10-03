import * as React from "react";
import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The workspace's door (29 Sep 2026): a signed-in person no longer reaches
 * a workspace without the consent (a legal step, every side) or the basics
 * (the two names; not on the print partner's side) — they go to
 * `/choose-workspace` with the page to come back to, instead of being let in
 * and asked again at the next sign-in. The date of birth is not a basic
 * (the owner, 29 Sep 2026: 18 or over is needed only to place orders), so a
 * person without one is let in.
 */

const nav = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: nav.replace, push: vi.fn() }) }));

import { AuthProvider, RequireParty, workspaceGate } from "./auth";
import { tokens } from "./api-client";

type Side = "ADVERTISER" | "PUBLISHER" | "PRINT_PARTNER";

const full = { id: "u1", mobile: "+919876543210", roles: ["ADVERTISER"], emailVerifiedAt: "2026-09-01T00:00:00Z", consentAcceptedAt: "2026-09-01T00:00:00Z", firstName: "Asha", lastName: "Rao", dateOfBirth: "1990-04-12" };
const signedIn = (user: Record<string, unknown>, parties: Side[] = ["ADVERTISER"]) => ({ status: "signed-in" as const, user: user as never, parties, needsEmail: false });

describe("workspaceGate", () => {
    it("waits while the session is read, and sends a visitor to sign in with the way back", () => {
        expect(workspaceGate({ status: "restoring", user: null, parties: [], needsEmail: false }, "ADVERTISER", "/advertiser")).toEqual({ kind: "wait" });
        expect(workspaceGate({ status: "signed-out", user: null, parties: [], needsEmail: false }, "ADVERTISER", "/advertiser/billing")).toEqual({ kind: "go", href: "/sign-in?next=%2Fadvertiser%2Fbilling" });
    });

    it("asks the email, then the side, as before", () => {
        expect(workspaceGate({ ...signedIn(full), needsEmail: true }, "ADVERTISER", "/advertiser")).toEqual({ kind: "go", href: "/verify-email?next=%2Fadvertiser" });
        expect(workspaceGate(signedIn(full, ["PUBLISHER"]), "ADVERTISER", "/advertiser")).toEqual({ kind: "go", href: "/choose-workspace?party=ADVERTISER" });
        expect(workspaceGate(signedIn(full, ["ADVERTISER"]), "PRINT_PARTNER", "/partner")).toEqual({ kind: "go", href: "/partner/apply" });
    });

    it("sends a person who has not consented to the consent step, on every side", () => {
        const unconsented = { ...full, consentAcceptedAt: null };
        expect(workspaceGate(signedIn(unconsented), "ADVERTISER", "/advertiser/campaigns")).toEqual({ kind: "go", href: "/choose-workspace?next=%2Fadvertiser%2Fcampaigns" });
        expect(workspaceGate(signedIn({ ...unconsented, roles: ["PARTNER"] }, ["PRINT_PARTNER"]), "PRINT_PARTNER", "/partner")).toEqual({ kind: "go", href: "/choose-workspace?next=%2Fpartner" });
    });

    it("sends a person missing a name to the basics, but not on the print partner's side", () => {
        expect(workspaceGate(signedIn({ ...full, lastName: null }), "ADVERTISER", "/advertiser")).toEqual({ kind: "go", href: "/choose-workspace?next=%2Fadvertiser" });
        expect(workspaceGate(signedIn({ ...full, firstName: null, roles: ["PUBLISHER"] }, ["PUBLISHER"]), "PUBLISHER", "/publisher")).toEqual({ kind: "go", href: "/choose-workspace?next=%2Fpublisher" });
        expect(workspaceGate(signedIn({ ...full, lastName: null, roles: ["PARTNER"] }, ["PRINT_PARTNER"]), "PRINT_PARTNER", "/partner")).toEqual({ kind: "draw" });
    });

    it("lets a person without a date of birth in, on every side — only an order asks for it", () => {
        expect(workspaceGate(signedIn({ ...full, dateOfBirth: null }), "ADVERTISER", "/advertiser")).toEqual({ kind: "draw" });
        expect(workspaceGate(signedIn({ ...full, dateOfBirth: null, roles: ["PUBLISHER"] }, ["PUBLISHER"]), "PUBLISHER", "/publisher")).toEqual({ kind: "draw" });
    });

    it("draws the workspace once nothing is owed", () => {
        expect(workspaceGate(signedIn(full), "ADVERTISER", "/advertiser")).toEqual({ kind: "draw" });
    });
});

describe("RequireParty", () => {
    const me = vi.fn();

    beforeEach(() => {
        nav.replace.mockReset();
        me.mockReset();
        tokens.set({ accessToken: "access", refreshToken: "refresh" });
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => new Response(JSON.stringify({ success: true, data: me() }), { status: 200, headers: { "Content-Type": "application/json" } }))
        );
        window.history.replaceState(null, "", "/advertiser/billing?tab=invoices");
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        tokens.clear();
    });

    const draw = () =>
        render(
            <AuthProvider>
                <RequireParty party="ADVERTISER">
                    <p>The workspace</p>
                </RequireParty>
            </AuthProvider>
        );

    it("holds the page and sends an unconsented person to the consent step, with the way back", async () => {
        me.mockReturnValue({ ...full, consentAcceptedAt: null });
        draw();
        await vi.waitFor(() => expect(nav.replace).toHaveBeenCalledWith("/choose-workspace?next=%2Fadvertiser%2Fbilling%3Ftab%3Dinvoices"));
        expect(screen.queryByText("The workspace")).not.toBeInTheDocument();
        expect(screen.getByText("Checking your session…")).toBeInTheDocument();
    });

    it("sends a person without a last name to the basics", async () => {
        me.mockReturnValue({ ...full, lastName: null });
        draw();
        await vi.waitFor(() => expect(nav.replace).toHaveBeenCalledWith("/choose-workspace?next=%2Fadvertiser%2Fbilling%3Ftab%3Dinvoices"));
        expect(screen.queryByText("The workspace")).not.toBeInTheDocument();
    });

    it("draws the page for a person without a date of birth (29 Sep 2026)", async () => {
        me.mockReturnValue({ ...full, dateOfBirth: null });
        draw();
        expect(await screen.findByText("The workspace")).toBeInTheDocument();
        expect(nav.replace).not.toHaveBeenCalled();
    });

    it("draws the page for a person who owes nothing", async () => {
        me.mockReturnValue(full);
        draw();
        expect(await screen.findByText("The workspace")).toBeInTheDocument();
        expect(nav.replace).not.toHaveBeenCalled();
    });
});
