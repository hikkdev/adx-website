import * as React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Phase D (1 Oct 2026) on the advertiser's verification page: Digio asks
 * "Who is this account for?" before it starts when `/advertisers/me` has no
 * legal form, and a VERIFIED Individual — nobody else — gets the quiet door
 * "Registered a business? Verify it".
 */

const server = vi.hoisted(() => ({ routes: new Map<string, unknown>(), get: vi.fn(), post: vi.fn() }));
vi.mock("@/lib/api-client", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-client")>();
    server.get.mockImplementation(async (path: string) => {
        if (!server.routes.has(path)) throw new actual.ApiError(404, "NOT_FOUND", `Nothing at ${path}`);
        return server.routes.get(path);
    });
    return { ...actual, api: { get: server.get, post: server.post, put: vi.fn(), patch: vi.fn(), delete: vi.fn() } };
});
const nav = vi.hoisted(() => ({ params: new URLSearchParams() }));
vi.mock("next/navigation", () => ({ useSearchParams: () => nav.params, useRouter: () => ({ push: vi.fn(), replace: vi.fn() }), usePathname: () => "/advertiser/verify" }));

import { AdvertiserVerify } from "./advertiser-verify";

const EIGHT = [
    { value: "INDIVIDUAL", label: "Individual" },
    { value: "SOLE_PROPRIETOR", label: "Sole proprietor" },
    { value: "COMPANY", label: "Company" },
    { value: "LLP_PARTNERSHIP", label: "LLP or partnership" },
    { value: "NON_PROFIT", label: "Non-profit (NGO, trust, society, Section 8)" },
    { value: "GOVERNMENT_EDUCATION", label: "Government or education" },
    { value: "OTHER_ENTITY", label: "Other entity (HUF, co-operative, AOP, …)" },
    { value: "POLITICAL", label: "Political party or candidate" },
];
const SESSION = { kycId: "kyc_1", accessToken: "tok", validTill: "2026-10-02T00:00:00.000Z", sdkUrl: "https://ext.digio.in/#/gateway/login/kyc_1/ref/a@b.in" };
const DOOR = "Registered a business? Verify it";

function account({ kycStatus, entityType, digio = true }: { kycStatus: "VERIFIED" | "PENDING"; entityType: string | null; digio?: boolean }) {
    server.routes.set("/advertisers/me", { id: "adv_1", displayId: "ADX-0110-2601", name: "Asha Rao", kycStatus, entityType, entityTypeStored: entityType !== null });
    // A verified account has its row; a fresh one has none yet (404, read as "not started").
    if (kycStatus === "VERIFIED") server.routes.set("/advertiser-kyc/me", { id: "akyc_1", status: "VERIFIED", method: "DIGIO", submittedAt: "2026-09-02T00:00:00.000Z", reviewedAt: "2026-09-03T00:00:00.000Z" });
    server.routes.set("/users/me/onboarding-manifest?party=ADVERTISER", {
        party: "ADVERTISER",
        accountType: "INDIVIDUAL",
        manifestVersion: 3,
        mode: "full",
        entityType,
        verification: { digio: { available: digio, provider: digio ? "DIGIO" : "MANUAL", retryAfter: null }, liveness: { required: true, status: null }, kycStatus: null, reviewNote: null },
        steps: [],
    });
}

beforeEach(() => {
    server.routes = new Map<string, unknown>([
        ["/kyc/entity-types", { PUBLISHER: EIGHT, ADVERTISER: EIGHT, PRINT_PARTNER: EIGHT.slice(0, 4) }],
        ["/advertiser-kyc/me/digio/status", { method: "DIGIO", digioStatus: "pending", kycStatus: "PENDING", digioVerifiedAt: null }],
    ]);
    server.get.mockClear();
    server.post.mockReset();
    server.post.mockResolvedValue(SESSION);
});

describe("the upgrade door", () => {
    it("is a quiet link for a verified Individual: the picker without Individual, the warning, then the usual wait", async () => {
        account({ kycStatus: "VERIFIED", entityType: "INDIVIDUAL" });
        render(<AdvertiserVerify />);
        expect(await screen.findByText("Your identity is verified")).toBeInTheDocument();

        fireEvent.click(screen.getByRole("button", { name: DOOR }));
        expect(await screen.findByRole("group", { name: "Who is this account for?" })).toBeInTheDocument();
        expect(screen.queryByLabelText("Individual")).not.toBeInTheDocument();
        expect(screen.getAllByRole("radio")).toHaveLength(7);
        expect(screen.getByLabelText("Political party or candidate")).toBeInTheDocument();
        expect(screen.getByText("Your account goes back to 'verification pending' until the business is verified.")).toBeInTheDocument();
        expect(screen.queryByText("Your identity is verified")).not.toBeInTheDocument();
        expect(server.post).not.toHaveBeenCalled();

        fireEvent.click(screen.getByLabelText("LLP or partnership"));
        fireEvent.click(screen.getByRole("button", { name: "Continue to verification" }));
        await waitFor(() => expect(server.post).toHaveBeenCalledWith("/advertiser-kyc/me/digio/initiate", { entityType: "LLP_PARTNERSHIP", supports: ["CASHFREE"] }));
        expect(await screen.findByText("Waiting for Digio")).toBeInTheDocument();
        expect(screen.getByText("Asking ADX every few seconds.")).toBeInTheDocument();
    });

    it("is not drawn for any other legal form, nor one that was never asked", async () => {
        for (const entityType of ["SOLE_PROPRIETOR", "COMPANY", "NON_PROFIT", null]) {
            account({ kycStatus: "VERIFIED", entityType });
            const view = render(<AdvertiserVerify />);
            expect(await screen.findByText("Your identity is verified")).toBeInTheDocument();
            expect(screen.queryByRole("button", { name: DOOR }), String(entityType)).not.toBeInTheDocument();
            view.unmount();
        }
    });

    it("is not drawn for an Individual who is not verified yet", async () => {
        account({ kycStatus: "PENDING", entityType: "INDIVIDUAL" });
        render(<AdvertiserVerify />);
        expect(await screen.findByRole("button", { name: "Verify with Digio" })).toBeInTheDocument();
        expect(screen.queryByRole("button", { name: DOOR })).not.toBeInTheDocument();
    });

    it("is not drawn while Digio is switched off — it is the only way through", async () => {
        account({ kycStatus: "VERIFIED", entityType: "INDIVIDUAL", digio: false });
        render(<AdvertiserVerify />);
        expect(await screen.findByText("Your identity is verified")).toBeInTheDocument();
        expect(screen.queryByRole("button", { name: DOOR })).not.toBeInTheDocument();
    });

    it("never draws the correction link on the verified account's page", async () => {
        account({ kycStatus: "VERIFIED", entityType: "COMPANY" });
        render(<AdvertiserVerify />);
        expect(await screen.findByText("Your identity is verified")).toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "Picked the wrong account type? Change it" })).not.toBeInTheDocument();
    });
});

describe("the picker on the Digio door", () => {
    it("asks before Digio starts when the account has no legal form — a business pays first and is asked only here", async () => {
        account({ kycStatus: "PENDING", entityType: null });
        render(<AdvertiserVerify />);
        fireEvent.click(await screen.findByRole("button", { name: "Verify with Digio" }));

        expect(await screen.findByRole("group", { name: "Who is this account for?" })).toBeInTheDocument();
        expect(screen.getAllByRole("radio")).toHaveLength(8);
        expect(server.post).not.toHaveBeenCalled();
        // The uploads stay beside it, as on every Digio door of this page.
        expect(screen.getByRole("button", { name: "Upload documents instead" })).toBeInTheDocument();

        fireEvent.click(screen.getByLabelText("Company"));
        fireEvent.click(screen.getByRole("button", { name: "Continue to verification" }));
        await waitFor(() => expect(server.post).toHaveBeenCalledWith("/advertiser-kyc/me/digio/initiate", { entityType: "COMPANY", supports: ["CASHFREE"] }));
        expect(await screen.findByText("Waiting for Digio")).toBeInTheDocument();
    });

    it("does not ask when the form is on file", async () => {
        account({ kycStatus: "PENDING", entityType: "NON_PROFIT" });
        render(<AdvertiserVerify />);
        fireEvent.click(await screen.findByRole("button", { name: "Verify with Digio" }));
        await waitFor(() => expect(server.post).toHaveBeenCalledWith("/advertiser-kyc/me/digio/initiate", { supports: ["CASHFREE"] }));
        expect(await screen.findByText("Waiting for Digio")).toBeInTheDocument();
        expect(screen.queryByRole("group", { name: "Who is this account for?" })).not.toBeInTheDocument();
    });

    it("lets a wrong choice be corrected from the wait: the form on file chosen, the new one posted and kept by the page (2 Oct 2026)", async () => {
        account({ kycStatus: "PENDING", entityType: "NON_PROFIT" });
        render(<AdvertiserVerify />);
        fireEvent.click(await screen.findByRole("button", { name: "Verify with Digio" }));
        await screen.findByText("Waiting for Digio");

        fireEvent.click(screen.getByRole("button", { name: "Picked the wrong account type? Change it" }));
        await screen.findByRole("group", { name: "Who is this account for?" });
        expect(screen.getAllByRole("radio")).toHaveLength(8);
        expect(screen.getByLabelText("Non-profit (NGO, trust, society, Section 8)")).toBeChecked();

        fireEvent.click(screen.getByLabelText("Company"));
        fireEvent.click(screen.getByRole("button", { name: "Continue to verification" }));
        await waitFor(() => expect(server.post).toHaveBeenLastCalledWith("/advertiser-kyc/me/digio/initiate", { entityType: "COMPANY", supports: ["CASHFREE"] }));
        await screen.findByText("Waiting for Digio");

        // Out to where it stands and back in: the page starts on the corrected form without asking, and offers it for correction.
        fireEvent.click(screen.getByRole("button", { name: "Back to where it stands" }));
        fireEvent.click(await screen.findByRole("button", { name: "Verify with Digio" }));
        await screen.findByText("Waiting for Digio");
        expect(server.post).toHaveBeenLastCalledWith("/advertiser-kyc/me/digio/initiate", { supports: ["CASHFREE"] });
        fireEvent.click(screen.getByRole("button", { name: "Picked the wrong account type? Change it" }));
        await screen.findByRole("group", { name: "Who is this account for?" });
        expect(screen.getByLabelText("Company")).toBeChecked();
    });
});

describe("Cashfree Phase 2: ADX's own identity check", () => {
    const open = (status = "OPEN") => ({
        id: "vs_1",
        provider: "CASHFREE",
        caseType: "ADVERTISER_KYC",
        caseId: "akyc_1",
        workflowKey: "ADVERTISER.INDIVIDUAL",
        status,
        steps: [{ check: "DIGILOCKER", required: true, status: "OPEN", at: null, failureCode: null, triesLeft: 3 }],
        expiresAt: "2026-10-02T10:00:00.000Z",
        createdAt: "2026-10-01T10:00:00.000Z",
        updatedAt: "2026-10-01T10:00:00.000Z",
    });

    it("offers an open check back instead of the Digio start", async () => {
        account({ kycStatus: "PENDING", entityType: "INDIVIDUAL" });
        server.routes.set("/verification/sessions/mine", { sessions: [open()] });
        server.routes.set("/verification/sessions/vs_1", open());
        render(<AdvertiserVerify />);

        expect(await screen.findByText("Finish your identity check")).toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "Verify with Digio" })).not.toBeInTheDocument();
        // The uploads stay beside it.
        expect(screen.getByRole("button", { name: "Upload documents instead" })).toBeInTheDocument();

        fireEvent.click(screen.getByRole("button", { name: "Continue" }));
        expect(await screen.findByRole("button", { name: "Open DigiLocker" })).toBeInTheDocument();
        expect(server.post).not.toHaveBeenCalled();
    });

    it("opens the session the address names — the desk's notification, the DigiLocker return", async () => {
        nav.params = new URLSearchParams("session=vs_1");
        try {
            account({ kycStatus: "PENDING", entityType: "INDIVIDUAL" });
            server.routes.set("/verification/sessions/vs_1", open("EXPIRED"));
            render(<AdvertiserVerify />);
            expect(await screen.findByText("This check timed out.")).toBeInTheDocument();

            // Start again is the advertiser's own start, saying it can draw the session.
            fireEvent.click(screen.getByRole("button", { name: "Start again" }));
            await waitFor(() => expect(server.post).toHaveBeenCalledWith("/advertiser-kyc/me/digio/initiate", { supports: ["CASHFREE"] }));
        } finally {
            nav.params = new URLSearchParams();
        }
    });
});

describe("Cashfree Phase 2: Digio off, the backup standing in", () => {
    const START_SESSION = { provider: "CASHFREE", sessionId: "vs_9", steps: [], expiresAt: "2026-10-02T10:00:00.000Z" };
    const sessionView = (caseType: string) => ({
        id: "vs_9",
        provider: "CASHFREE",
        caseType,
        caseId: "c_1",
        workflowKey: null,
        status: "OPEN",
        steps: [{ check: "DIGILOCKER", required: true, status: "OPEN", at: null, failureCode: null, triesLeft: 3 }],
        expiresAt: "2026-10-02T10:00:00.000Z",
        createdAt: "2026-10-01T10:00:00.000Z",
        updatedAt: "2026-10-01T10:00:00.000Z",
    });

    const backup = (on: boolean) => {
        const manifest = server.routes.get("/users/me/onboarding-manifest?party=ADVERTISER") as { verification: { digio: Record<string, unknown> } };
        manifest.verification.digio = { ...manifest.verification.digio, backup: on };
    };

    it("offers the start as \"Verify your identity\" with no Digio-off notice, and a session answer opens the check", async () => {
        account({ kycStatus: "PENDING", entityType: "INDIVIDUAL", digio: false });
        backup(true);
        server.routes.set("/verification/sessions/vs_9", sessionView("ADVERTISER_KYC"));
        server.post.mockResolvedValue(START_SESSION);
        render(<AdvertiserVerify />);

        fireEvent.click(await screen.findByRole("button", { name: "Verify your identity" }));
        expect(screen.queryByText(/Digio is unavailable right now/)).not.toBeInTheDocument();
        await waitFor(() => expect(server.post).toHaveBeenCalledWith("/advertiser-kyc/me/digio/initiate", { supports: ["CASHFREE"] }));
        expect(await screen.findByRole("button", { name: "Open DigiLocker" })).toBeInTheDocument();
    });

    it("stays as today with no backup: no start, the Digio-off line, the uploads first", async () => {
        account({ kycStatus: "PENDING", entityType: "INDIVIDUAL", digio: false });
        render(<AdvertiserVerify />);
        expect(await screen.findByText(/Digio is unavailable right now/)).toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "Verify your identity" })).not.toBeInTheDocument();
        expect(screen.queryByRole("button", { name: /Digio/ })).not.toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Upload documents instead" })).toBeInTheDocument();
    });
});
