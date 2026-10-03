import * as React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Phase D (1 Oct 2026) on the print partner's verification page: Digio asks
 * "Who is this account for?" — the four forms a print partner may be —
 * before it starts when `/print-partners/me` has no legal form, and a
 * VERIFIED Individual — nobody else — gets the quiet door "Registered a
 * business? Verify it".
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
vi.mock("@/lib/flags", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/flags")>()), useSwitchedOff: () => false }));
const account = vi.hoisted(() => ({ value: { partner: null as unknown, loaded: true, error: null, reload: vi.fn(), replace: () => undefined } }));
vi.mock("@/components/partner/partner-context", () => ({ usePartnerAccount: () => account.value }));

import PartnerVerifyPage from "./page";

const FOUR = [
    { value: "INDIVIDUAL", label: "Individual" },
    { value: "SOLE_PROPRIETOR", label: "Sole proprietor" },
    { value: "COMPANY", label: "Company" },
    { value: "LLP_PARTNERSHIP", label: "LLP or partnership" },
];
const MORE = [
    { value: "NON_PROFIT", label: "Non-profit (NGO, trust, society, Section 8)" },
    { value: "POLITICAL", label: "Political party or candidate" },
];
const SESSION = { kycId: "ppk_1", accessToken: "tok", validTill: "2026-10-02T00:00:00.000Z", sdkUrl: "https://ext.digio.in/#/gateway/login/ppk_1/ref/a@b.in" };
const DOOR = "Registered a business? Verify it";
const OPEN = { available: true, provider: "DIGIO", retryAfter: null };

const labels = () => screen.getAllByRole("radio").map((radio) => (radio.closest("label") as HTMLLabelElement).textContent);

function shop(entityType: string | null | undefined) {
    account.value = { partner: { id: "pp_1", name: "Sharma Prints", panNumber: null, entityType, entityTypeStored: Boolean(entityType) }, loaded: true, error: null, reload: vi.fn(), replace: () => undefined };
}

function verified(digio: unknown = OPEN) {
    server.routes.set("/print-partners/me/kyc", {
        id: "ppk_1",
        status: "VERIFIED",
        method: "DIGIO",
        panNumber: null,
        govIdType: null,
        digioStatus: "approved",
        digioVerifiedAt: "2026-09-03T00:00:00.000Z",
        submittedAt: "2026-09-02T00:00:00.000Z",
        reviewedAt: "2026-09-03T00:00:00.000Z",
        rejectionReason: null,
        reviewNote: null,
        flagged: [],
        liveness: null,
        digio,
        updatedAt: "2026-09-03T00:00:00.000Z",
    });
}

beforeEach(() => {
    // No KYC row yet unless a test files one: the read answers 404, and Digio is open.
    server.routes = new Map<string, unknown>([
        ["/kyc/entity-types", { PUBLISHER: [...FOUR, ...MORE], ADVERTISER: [...FOUR, ...MORE], PRINT_PARTNER: FOUR }],
        ["/print-partners/me/kyc/digio/status", { method: "DIGIO", digioStatus: "pending", kycStatus: "PENDING", digioVerifiedAt: null }],
    ]);
    server.get.mockClear();
    server.post.mockReset();
    server.post.mockResolvedValue(SESSION);
});

describe("the picker on the Digio door", () => {
    it("asks before Digio starts when the shop has no legal form — the print partner's four options", async () => {
        shop(null);
        render(<PartnerVerifyPage />);
        fireEvent.click(await screen.findByRole("button", { name: "Verify with Digio" }));

        expect(await screen.findByRole("group", { name: "Who is this account for?" })).toBeInTheDocument();
        expect(labels()).toEqual(["Individual", "Sole proprietor", "Company", "LLP or partnership"]);
        expect(server.post).not.toHaveBeenCalled();

        fireEvent.click(screen.getByLabelText("Sole proprietor"));
        fireEvent.click(screen.getByRole("button", { name: "Continue to verification" }));
        await waitFor(() => expect(server.post).toHaveBeenCalledWith("/print-partners/me/kyc/digio/initiate", { entityType: "SOLE_PROPRIETOR", supports: ["CASHFREE"] }));
        expect(await screen.findByText("Waiting for Digio")).toBeInTheDocument();
        // The form is on the shop's row now: the workspace reads it again.
        expect((account.value as { reload: ReturnType<typeof vi.fn> }).reload).toHaveBeenCalled();
    });

    it("does not ask when the form is on file", async () => {
        shop("COMPANY");
        render(<PartnerVerifyPage />);
        fireEvent.click(await screen.findByRole("button", { name: "Verify with Digio" }));
        await waitFor(() => expect(server.post).toHaveBeenCalledWith("/print-partners/me/kyc/digio/initiate", { supports: ["CASHFREE"] }));
        expect(screen.queryByRole("group", { name: "Who is this account for?" })).not.toBeInTheDocument();
    });

    it("lets a wrong choice be corrected from the wait: the four options, the form on file chosen, the new one posted (2 Oct 2026)", async () => {
        shop("COMPANY");
        render(<PartnerVerifyPage />);
        fireEvent.click(await screen.findByRole("button", { name: "Verify with Digio" }));
        await screen.findByText("Waiting for Digio");

        fireEvent.click(screen.getByRole("button", { name: "Picked the wrong account type? Change it" }));
        await screen.findByRole("group", { name: "Who is this account for?" });
        expect(labels()).toEqual(["Individual", "Sole proprietor", "Company", "LLP or partnership"]);
        expect(screen.getByLabelText("Company")).toBeChecked();

        fireEvent.click(screen.getByLabelText("LLP or partnership"));
        fireEvent.click(screen.getByRole("button", { name: "Continue to verification" }));
        await waitFor(() => expect(server.post).toHaveBeenLastCalledWith("/print-partners/me/kyc/digio/initiate", { entityType: "LLP_PARTNERSHIP", supports: ["CASHFREE"] }));
        expect(await screen.findByText("Waiting for Digio")).toBeInTheDocument();
        // The shop's row holds the new form: the workspace reads it again.
        expect((account.value as { reload: ReturnType<typeof vi.fn> }).reload).toHaveBeenCalled();
    });

    it("never draws the correction link on the verified shop's page", async () => {
        shop("COMPANY");
        verified();
        render(<PartnerVerifyPage />);
        expect(await screen.findByText("The shop is verified.")).toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "Picked the wrong account type? Change it" })).not.toBeInTheDocument();
    });
});

describe("the upgrade door", () => {
    it("is a quiet link for a verified Individual: the three business forms, the warning, then the usual wait", async () => {
        shop("INDIVIDUAL");
        verified();
        render(<PartnerVerifyPage />);
        expect(await screen.findByText("The shop is verified.")).toBeInTheDocument();

        fireEvent.click(screen.getByRole("button", { name: DOOR }));
        expect(await screen.findByRole("group", { name: "Who is this account for?" })).toBeInTheDocument();
        expect(labels()).toEqual(["Sole proprietor", "Company", "LLP or partnership"]);
        expect(screen.getByText("Your account goes back to 'verification pending' until the business is verified.")).toBeInTheDocument();
        expect(server.post).not.toHaveBeenCalled();

        fireEvent.click(screen.getByLabelText("Company"));
        fireEvent.click(screen.getByRole("button", { name: "Continue to verification" }));
        await waitFor(() => expect(server.post).toHaveBeenCalledWith("/print-partners/me/kyc/digio/initiate", { entityType: "COMPANY", supports: ["CASHFREE"] }));
        expect(await screen.findByText("Waiting for Digio")).toBeInTheDocument();
        expect(screen.getByText("Asking ADX every few seconds.")).toBeInTheDocument();
    });

    it("is not drawn for any other legal form, nor before the shop's row has said", async () => {
        for (const entityType of ["SOLE_PROPRIETOR", "COMPANY", "LLP_PARTNERSHIP", null, undefined]) {
            shop(entityType);
            verified();
            const view = render(<PartnerVerifyPage />);
            expect(await screen.findByText("The shop is verified.")).toBeInTheDocument();
            expect(screen.queryByRole("button", { name: DOOR }), String(entityType)).not.toBeInTheDocument();
            view.unmount();
        }
    });

    it("is not drawn for an Individual who is not verified yet", async () => {
        shop("INDIVIDUAL");
        render(<PartnerVerifyPage />);
        expect(await screen.findByRole("button", { name: "Verify with Digio" })).toBeInTheDocument();
        expect(screen.queryByRole("button", { name: DOOR })).not.toBeInTheDocument();
    });

    it("is not drawn while Digio is switched off — it is the only way through", async () => {
        shop("INDIVIDUAL");
        verified({ available: false, provider: "MANUAL", retryAfter: null });
        render(<PartnerVerifyPage />);
        expect(await screen.findByText("The shop is verified.")).toBeInTheDocument();
        expect(screen.queryByRole("button", { name: DOOR })).not.toBeInTheDocument();
    });
});

describe("Cashfree Phase 2: ADX's own identity check", () => {
    const open = (status = "OPEN") => ({
        id: "vs_1",
        provider: "CASHFREE",
        caseType: "PRINT_PARTNER_KYC",
        caseId: "pp_1",
        workflowKey: "PRINT_PARTNER.COMPANY",
        status,
        steps: [
            { check: "DIGILOCKER", required: true, status: "VERIFIED", at: null, failureCode: null, triesLeft: 3 },
            { check: "PAN", required: true, status: "OPEN", at: null, failureCode: null, triesLeft: 3 },
            { check: "GSTIN", required: true, status: "OPEN", at: null, failureCode: null, triesLeft: 3 },
            { check: "PAPERS", required: true, status: "REVIEW", at: null, failureCode: null, triesLeft: 3 },
        ],
        expiresAt: "2026-10-02T10:00:00.000Z",
        createdAt: "2026-10-01T10:00:00.000Z",
        updatedAt: "2026-10-01T10:00:00.000Z",
    });

    it("offers an open check back instead of the Digio start, and its papers link lands on the shop's own uploads", async () => {
        shop("COMPANY");
        server.routes.set("/verification/sessions/mine", { sessions: [open()] });
        server.routes.set("/verification/sessions/vs_1", open());
        render(<PartnerVerifyPage />);

        expect(await screen.findByText("Finish your identity check")).toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "Verify with Digio" })).not.toBeInTheDocument();

        fireEvent.click(screen.getByRole("button", { name: "Continue" }));
        // A print partner's GSTIN is required: no "(optional)".
        expect(await screen.findByLabelText("GSTIN")).toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: "Upload papers" }));
        expect(await screen.findByText("Shop verification")).toBeInTheDocument();
    });

    it("walks the session when the start hands one out", async () => {
        shop("COMPANY");
        server.routes.set("/verification/sessions/vs_1", open());
        server.post.mockResolvedValue({ provider: "CASHFREE", sessionId: "vs_1", steps: [], expiresAt: "2026-10-02T10:00:00.000Z" });
        render(<PartnerVerifyPage />);
        fireEvent.click(await screen.findByRole("button", { name: "Verify with Digio" }));
        await waitFor(() => expect(server.post).toHaveBeenCalledWith("/print-partners/me/kyc/digio/initiate", { supports: ["CASHFREE"] }));
        expect(await screen.findByText("Business PAN and GSTIN")).toBeInTheDocument();
        expect(screen.queryByText("Waiting for Digio")).not.toBeInTheDocument();
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

    /** A refused record — it takes a fresh check — with the availability the read carries. */
    const refusedRecord = (digio: unknown) => {
        verified(digio);
        const record = server.routes.get("/print-partners/me/kyc") as Record<string, unknown>;
        Object.assign(record, { status: "REJECTED", method: "MANUAL", digioStatus: null, digioVerifiedAt: null, reviewedAt: "2026-09-03T00:00:00.000Z", rejectionReason: "Blurred PAN" });
    };

    it("offers the start as \"Verify your identity\" with no Digio-off notice, and a session answer opens the check", async () => {
        shop("COMPANY");
        refusedRecord({ available: false, provider: "DEGRADED", retryAfter: 300, backup: true });
        server.routes.set("/verification/sessions/vs_9", sessionView("PRINT_PARTNER_KYC"));
        server.post.mockResolvedValue(START_SESSION);
        render(<PartnerVerifyPage />);

        fireEvent.click(await screen.findByRole("button", { name: "Verify your identity" }));
        expect(screen.queryByText(/Digio is not answering right now/)).not.toBeInTheDocument();
        await waitFor(() => expect(server.post).toHaveBeenCalledWith("/print-partners/me/kyc/digio/initiate", { supports: ["CASHFREE"] }));
        expect(await screen.findByRole("button", { name: "Open DigiLocker" })).toBeInTheDocument();
        expect(screen.queryByText("Verify with Digio")).not.toBeInTheDocument();
    });

    it("stays as today with no backup: no start, the papers are the way", async () => {
        shop("COMPANY");
        refusedRecord({ available: false, provider: "DEGRADED", retryAfter: 300 });
        render(<PartnerVerifyPage />);
        expect(await screen.findByText(/Digio is not answering right now/)).toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "Verify your identity" })).not.toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "Verify with Digio" })).not.toBeInTheDocument();
    });
});
