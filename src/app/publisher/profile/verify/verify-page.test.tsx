import * as React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Phase D (1 Oct 2026) on the publisher's verification page: Digio asks
 * "Who is this account for?" before it starts when `/publishers/me` has no
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
vi.mock("@/lib/auth", () => ({ useAuth: () => ({ refresh: vi.fn(async () => null) }) }));
vi.mock("@/components/agreements/agreement-accept", () => ({ AgreementAccept: () => <p>The platform terms</p> }));

import VerifyPage from "./page";

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

const intro = { key: "kyc-intro", kind: "kyc-intro", title: "Verify your identity", subtitle: "Digio, or your documents.", bands: [], cta: "Start" };

function account({ kycStatus, entityType, digio = true }: { kycStatus: "VERIFIED" | "PENDING"; entityType: string | null; digio?: boolean }) {
    const verified = kycStatus === "VERIFIED";
    server.routes.set("/publishers/me", { id: "pub_1", name: "Asha Rao", kycStatus, entityType, entityTypeStored: entityType !== null, platformAgreementAcceptedAt: "2026-09-01T00:00:00.000Z" });
    if (verified) server.routes.set("/publishers/me/kyc", { id: "kyc_1", status: "VERIFIED", submittedAt: "2026-09-02T00:00:00.000Z", reviewedAt: "2026-09-03T00:00:00.000Z", rejectionReason: null });
    server.routes.set("/users/me/onboarding-manifest?party=PUBLISHER", {
        party: "PUBLISHER",
        accountType: "INDIVIDUAL",
        manifestVersion: 3,
        mode: "full",
        entityType,
        entityTypeStored: entityType !== null,
        verification: { digio: { available: digio, provider: digio ? "DIGIO" : "MANUAL", retryAfter: null }, liveness: { required: true, status: null }, kycStatus: verified ? "VERIFIED" : null, reviewNote: null },
        steps: [intro],
    });
}

beforeEach(() => {
    server.routes = new Map<string, unknown>([
        ["/kyc/entity-types", { PUBLISHER: EIGHT, ADVERTISER: EIGHT, PRINT_PARTNER: EIGHT.slice(0, 4) }],
        ["/publishers/me/kyc/digio/status", { method: "DIGIO", digioStatus: "pending", kycStatus: "PENDING", digioVerifiedAt: null }],
    ]);
    server.get.mockClear();
    server.post.mockReset();
    server.post.mockResolvedValue(SESSION);
});

describe("the upgrade door", () => {
    it("is a quiet link for a verified Individual: the picker without Individual, the warning, then the usual wait", async () => {
        account({ kycStatus: "VERIFIED", entityType: "INDIVIDUAL" });
        render(<VerifyPage />);
        expect(await screen.findByText("Your business is verified")).toBeInTheDocument();

        fireEvent.click(screen.getByRole("button", { name: DOOR }));
        expect(await screen.findByRole("group", { name: "Who is this account for?" })).toBeInTheDocument();
        expect(screen.queryByLabelText("Individual")).not.toBeInTheDocument();
        expect(screen.getAllByRole("radio")).toHaveLength(7);
        expect(screen.getByText("Your account goes back to 'verification pending' until the business is verified.")).toBeInTheDocument();
        // What the page read about the account is put away: it is about to stop being true.
        expect(screen.queryByText("Your business is verified")).not.toBeInTheDocument();
        expect(screen.queryByText(/Nothing more is needed/)).not.toBeInTheDocument();
        expect(server.post).not.toHaveBeenCalled();

        fireEvent.click(screen.getByLabelText("Company"));
        fireEvent.click(screen.getByRole("button", { name: "Continue to verification" }));
        await waitFor(() => expect(server.post).toHaveBeenCalledWith("/publishers/me/kyc/digio/initiate", { entityType: "COMPANY", supports: ["CASHFREE"] }));
        expect(await screen.findByText("Waiting for Digio")).toBeInTheDocument();
        expect(screen.getByText("Asking ADX every few seconds.")).toBeInTheDocument();
    });

    it("goes back to where the account stands, read again", async () => {
        account({ kycStatus: "VERIFIED", entityType: "INDIVIDUAL" });
        render(<VerifyPage />);
        fireEvent.click(await screen.findByRole("button", { name: DOOR }));
        await screen.findByRole("group", { name: "Who is this account for?" });
        const reads = server.get.mock.calls.filter((call) => call[0] === "/publishers/me").length;

        fireEvent.click(screen.getByRole("button", { name: "Back" }));
        expect(await screen.findByText("Your business is verified")).toBeInTheDocument();
        await waitFor(() => expect(server.get.mock.calls.filter((call) => call[0] === "/publishers/me").length).toBe(reads + 1));
        expect(server.post).not.toHaveBeenCalled();
    });

    it("is not drawn for any other legal form, nor one that was never asked", async () => {
        for (const entityType of ["SOLE_PROPRIETOR", "COMPANY", "POLITICAL", null]) {
            account({ kycStatus: "VERIFIED", entityType });
            const view = render(<VerifyPage />);
            expect(await screen.findByText("Your business is verified")).toBeInTheDocument();
            expect(screen.queryByRole("button", { name: DOOR }), String(entityType)).not.toBeInTheDocument();
            view.unmount();
        }
    });

    it("is not drawn for an Individual who is not verified yet", async () => {
        account({ kycStatus: "PENDING", entityType: "INDIVIDUAL" });
        render(<VerifyPage />);
        expect(await screen.findByRole("button", { name: "Verify with Digio" })).toBeInTheDocument();
        expect(screen.queryByRole("button", { name: DOOR })).not.toBeInTheDocument();
    });

    it("is not drawn while Digio is switched off — it is the only way through", async () => {
        account({ kycStatus: "VERIFIED", entityType: "INDIVIDUAL", digio: false });
        render(<VerifyPage />);
        expect(await screen.findByText("Your business is verified")).toBeInTheDocument();
        expect(screen.queryByRole("button", { name: DOOR })).not.toBeInTheDocument();
    });
});

describe("the picker on the ladder's Digio door", () => {
    it("asks before Digio starts when the account has no legal form, with all eight options", async () => {
        account({ kycStatus: "PENDING", entityType: null });
        render(<VerifyPage />);
        fireEvent.click(await screen.findByRole("button", { name: "Verify with Digio" }));

        expect(await screen.findByRole("group", { name: "Who is this account for?" })).toBeInTheDocument();
        expect(screen.getAllByRole("radio")).toHaveLength(8);
        expect(screen.queryByText("Your account goes back to 'verification pending' until the business is verified.")).not.toBeInTheDocument();
        expect(server.post).not.toHaveBeenCalled();

        fireEvent.click(screen.getByLabelText("Sole proprietor"));
        fireEvent.click(screen.getByRole("button", { name: "Continue to verification" }));
        await waitFor(() => expect(server.post).toHaveBeenCalledWith("/publishers/me/kyc/digio/initiate", { entityType: "SOLE_PROPRIETOR", supports: ["CASHFREE"] }));
        expect(await screen.findByText("Waiting for Digio")).toBeInTheDocument();
    });

    it("does not ask when the form is on file", async () => {
        account({ kycStatus: "PENDING", entityType: "INDIVIDUAL" });
        render(<VerifyPage />);
        fireEvent.click(await screen.findByRole("button", { name: "Verify with Digio" }));
        await waitFor(() => expect(server.post).toHaveBeenCalledWith("/publishers/me/kyc/digio/initiate", { supports: ["CASHFREE"] }));
        expect(await screen.findByText("Waiting for Digio")).toBeInTheDocument();
        expect(screen.queryByRole("group", { name: "Who is this account for?" })).not.toBeInTheDocument();
    });

    it("lets a wrong choice be corrected from the wait: the form on file chosen, the new one posted (2 Oct 2026)", async () => {
        account({ kycStatus: "PENDING", entityType: "INDIVIDUAL" });
        render(<VerifyPage />);
        fireEvent.click(await screen.findByRole("button", { name: "Verify with Digio" }));
        await screen.findByText("Waiting for Digio");

        fireEvent.click(screen.getByRole("button", { name: "Picked the wrong account type? Change it" }));
        await screen.findByRole("group", { name: "Who is this account for?" });
        expect(screen.getAllByRole("radio")).toHaveLength(8);
        expect(screen.getByLabelText("Individual")).toBeChecked();

        fireEvent.click(screen.getByLabelText("Sole proprietor"));
        fireEvent.click(screen.getByRole("button", { name: "Continue to verification" }));
        await waitFor(() => expect(server.post).toHaveBeenLastCalledWith("/publishers/me/kyc/digio/initiate", { entityType: "SOLE_PROPRIETOR", supports: ["CASHFREE"] }));
        expect(await screen.findByText("Waiting for Digio")).toBeInTheDocument();
    });

    it("never draws the correction link on the verified account's page", async () => {
        account({ kycStatus: "VERIFIED", entityType: "COMPANY" });
        render(<VerifyPage />);
        expect(await screen.findByText("Your business is verified")).toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "Picked the wrong account type? Change it" })).not.toBeInTheDocument();
    });
});

describe("Cashfree Phase 2: ADX's own identity check", () => {
    const open = (status = "OPEN", caseType = "PUBLISHER_KYC") => ({
        id: "vs_1",
        provider: "CASHFREE",
        caseType,
        caseId: "pub_1",
        workflowKey: "PUBLISHER.INDIVIDUAL",
        status,
        steps: [{ check: "DIGILOCKER", required: true, status: "OPEN", at: null, failureCode: null, triesLeft: 3 }],
        expiresAt: "2026-10-02T10:00:00.000Z",
        createdAt: "2026-10-01T10:00:00.000Z",
        updatedAt: "2026-10-01T10:00:00.000Z",
    });

    it("offers an open check back on the ladder's intro instead of the Digio start, and continues it", async () => {
        account({ kycStatus: "PENDING", entityType: "INDIVIDUAL" });
        server.routes.set("/verification/sessions/mine", { sessions: [open()] });
        server.routes.set("/verification/sessions/vs_1", open());
        render(<VerifyPage />);

        expect(await screen.findByText("Finish your identity check")).toBeInTheDocument();
        expect(screen.getByText("You started this earlier. Pick up where you left off.")).toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "Verify with Digio" })).not.toBeInTheDocument();

        fireEvent.click(screen.getByRole("button", { name: "Continue" }));
        expect(await screen.findByRole("button", { name: "Open DigiLocker" })).toBeInTheDocument();
        expect(server.get).toHaveBeenCalledWith("/verification/sessions/vs_1");
        expect(server.post).not.toHaveBeenCalled();
    });

    it("ignores another party's open check", async () => {
        account({ kycStatus: "PENDING", entityType: "INDIVIDUAL" });
        server.routes.set("/verification/sessions/mine", { sessions: [open("OPEN", "ADVERTISER_KYC")] });
        render(<VerifyPage />);
        expect(await screen.findByRole("button", { name: "Verify with Digio" })).toBeInTheDocument();
        expect(screen.queryByText("Finish your identity check")).not.toBeInTheDocument();
    });

    it("walks the session when the start hands one out, and the verified outcome never names a provider", async () => {
        account({ kycStatus: "PENDING", entityType: "INDIVIDUAL" });
        server.routes.set("/verification/sessions/vs_1", open("VERIFIED"));
        server.post.mockImplementation(async (path: string) => (path.endsWith("/initiate") ? { provider: "CASHFREE", sessionId: "vs_1", steps: [], expiresAt: "2026-10-02T10:00:00.000Z" } : {}));
        render(<VerifyPage />);
        fireEvent.click(await screen.findByRole("button", { name: "Verify with Digio" }));

        await waitFor(() => expect(server.post).toHaveBeenCalledWith("/publishers/me/kyc/digio/initiate", { supports: ["CASHFREE"] }));
        expect(await screen.findByText("You're verified. Thanks — you're all set.")).toBeInTheDocument();
        await waitFor(() => expect(screen.getAllByText("Verified").length).toBeGreaterThan(0));
        expect(screen.queryByText(/Digio verified you/)).not.toBeInTheDocument();
        expect(server.post).toHaveBeenCalledWith("/publishers/me/complete-onboarding");
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
        const manifest = server.routes.get("/users/me/onboarding-manifest?party=PUBLISHER") as { verification: { digio: Record<string, unknown> } };
        manifest.verification.digio = { ...manifest.verification.digio, backup: on };
    };

    it("offers the start as \"Verify your identity\" with no Digio-off notice, and a session answer opens the check", async () => {
        account({ kycStatus: "PENDING", entityType: "INDIVIDUAL", digio: false });
        backup(true);
        server.routes.set("/verification/sessions/vs_9", sessionView("PUBLISHER_KYC"));
        server.post.mockResolvedValue(START_SESSION);
        render(<VerifyPage />);

        fireEvent.click(await screen.findByRole("button", { name: "Verify your identity" }));
        expect(screen.queryByText(/Digio is unavailable right now/)).not.toBeInTheDocument();
        await waitFor(() => expect(server.post).toHaveBeenCalledWith("/publishers/me/kyc/digio/initiate", { supports: ["CASHFREE"] }));
        expect(await screen.findByRole("button", { name: "Open DigiLocker" })).toBeInTheDocument();
    });

    it("stays as today with no backup: no start, the Digio-off notice, the uploads", async () => {
        account({ kycStatus: "PENDING", entityType: "INDIVIDUAL", digio: false });
        render(<VerifyPage />);
        expect(await screen.findByText(/Digio is unavailable right now/)).toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "Verify your identity" })).not.toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "Verify with Digio" })).not.toBeInTheDocument();
        expect(server.post).not.toHaveBeenCalled();
    });
});
