import * as React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Cashfree Phase 2 — `/verify/digilocker-return`: it reads DigiLocker's
 * answer and sends the person back to the verify page they came from (the
 * note kept before they left), else their account's own verify page, with
 * the session open; with `&app=1` it only says to go back to the app.
 */

const server = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock("@/lib/api-client", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-client")>();
    return { ...actual, api: { get: server.get, post: server.post, put: vi.fn(), patch: vi.fn(), delete: vi.fn() } };
});
const nav = vi.hoisted(() => ({ params: new URLSearchParams(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useSearchParams: () => nav.params, useRouter: () => ({ replace: nav.replace, push: vi.fn() }) }));
const auth = vi.hoisted(() => ({ status: "signed-in" as string }));
vi.mock("@/lib/auth", () => ({ useAuth: () => ({ status: auth.status }) }));
vi.mock("@/lib/brand", () => ({ BrandWordmark: () => <span>ADX</span> }));

import { ApiError } from "@/lib/api-client";
import { DIGILOCKER_RETURN_KEY } from "@/services/verification";
import { DigilockerReturn } from "./digilocker-return";

const session = (caseType: string) => ({ id: "vs_1", provider: "CASHFREE", caseType, caseId: "c1", workflowKey: null, status: "OPEN", steps: [], expiresAt: "", createdAt: "", updatedAt: "" });

beforeEach(() => {
    server.get.mockReset();
    server.post.mockReset();
    nav.replace.mockReset();
    nav.params = new URLSearchParams("session=vs_1");
    auth.status = "signed-in";
    window.sessionStorage.clear();
});

describe("the DigiLocker return", () => {
    it("reads DigiLocker's answer and goes back to the page the person came from, the session open", async () => {
        window.sessionStorage.setItem(DIGILOCKER_RETURN_KEY, JSON.stringify({ sessionId: "vs_1", path: "/advertiser/verify?next=%2Fadvertiser%2Fcampaigns" }));
        server.post.mockResolvedValue({ status: "VERIFIED", failureCode: null, name: "Asha", documents: {}, session: session("ADVERTISER_KYC") });
        render(<DigilockerReturn />);
        expect(screen.getByText("Waiting for DigiLocker…")).toBeInTheDocument();
        await waitFor(() => expect(nav.replace).toHaveBeenCalledWith("/advertiser/verify?next=%2Fadvertiser%2Fcampaigns&session=vs_1"));
        expect(server.post).toHaveBeenCalledWith("/verification/sessions/vs_1/digilocker/refresh");
        expect(window.sessionStorage.getItem(DIGILOCKER_RETURN_KEY)).toBeNull();
    });

    it("falls back to the account's own verify page when nothing was kept", async () => {
        server.post.mockResolvedValue({ status: "FAILED", failureCode: "CONSENT_DENIED", name: null, documents: {}, session: session("PRINT_PARTNER_KYC") });
        render(<DigilockerReturn />);
        await waitFor(() => expect(nav.replace).toHaveBeenCalledWith("/partner/verify?session=vs_1"));
    });

    it("still goes back when the refresh fails — the session screen reads it again", async () => {
        server.post.mockRejectedValue(new ApiError(409, "VERIFICATION_SESSION_CLOSED", "closed", { status: "EXPIRED" }));
        server.get.mockResolvedValue(session("PUBLISHER_KYC"));
        render(<DigilockerReturn />);
        await waitFor(() => expect(nav.replace).toHaveBeenCalledWith("/publisher/profile/verify?session=vs_1"));
        expect(server.get).toHaveBeenCalledWith("/verification/sessions/vs_1");
    });

    it("says to go back to the app, and calls nothing, when it came from the app", () => {
        nav.params = new URLSearchParams("session=vs_1&app=1");
        render(<DigilockerReturn />);
        expect(screen.getByText("All done in DigiLocker. Go back to the ADX app to continue.")).toBeInTheDocument();
        expect(server.post).not.toHaveBeenCalled();
        expect(server.get).not.toHaveBeenCalled();
    });

    it("sends a signed-out person to sign in first, and back here after", async () => {
        auth.status = "signed-out";
        render(<DigilockerReturn />);
        await waitFor(() => expect(nav.replace).toHaveBeenCalledWith(`/sign-in?next=${encodeURIComponent("/verify/digilocker-return?session=vs_1")}`));
        expect(server.post).not.toHaveBeenCalled();
    });
});
