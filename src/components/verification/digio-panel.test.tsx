import * as React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Phase D (1 Oct 2026) — the Digio panel asks "Who is this account for?"
 * before it starts when the party's legal form is unknown, starts with the
 * answer, takes the server's 409 ENTITY_TYPE_REQUIRED as the same question,
 * is the verified individual's door to a business, and words Digio's own
 * failures the way the apps do. Digio is never called: the API client is
 * mocked.
 */

const server = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock("@/lib/api-client", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-client")>();
    return { ...actual, api: { get: server.get, post: server.post, put: vi.fn(), patch: vi.fn(), delete: vi.fn() } };
});

import { ApiError } from "@/lib/api-client";
import { DigioPanel } from "./digio-panel";

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
const TYPES = { PUBLISHER: EIGHT, ADVERTISER: EIGHT, PRINT_PARTNER: EIGHT.slice(0, 4) };
const SESSION = { kycId: "kyc_1", accessToken: "tok", validTill: "2026-10-02T00:00:00.000Z", sdkUrl: "https://ext.digio.in/#/gateway/login/kyc_1/ref/a@b.in" };

const CHANGE = "Picked the wrong account type? Change it";

const labels = () => screen.getAllByRole("radio").map((radio) => (radio.closest("label") as HTMLLabelElement).textContent);
const checked = () =>
    screen
        .getAllByRole("radio")
        .filter((radio) => (radio as HTMLInputElement).checked)
        .map((radio) => (radio as HTMLInputElement).value);
const choose = (label: string) => {
    fireEvent.click(screen.getByLabelText(label));
    fireEvent.click(screen.getByRole("button", { name: "Continue to verification" }));
};

beforeEach(() => {
    server.get.mockReset();
    server.post.mockReset();
    server.get.mockImplementation(async (path: string) => {
        if (path === "/kyc/entity-types") return TYPES;
        return { method: "DIGIO", digioStatus: "pending", kycStatus: "PENDING", digioVerifiedAt: null };
    });
    server.post.mockResolvedValue(SESSION);
});

describe("the picker before the check", () => {
    it("asks who the account is for when the party's form is unknown, and starts only with the answer", async () => {
        const onEntityType = vi.fn();
        render(<DigioPanel side="PUBLISHER" entityType={null} onVerified={vi.fn()} onEntityType={onEntityType} />);

        expect(await screen.findByRole("group", { name: "Who is this account for?" })).toBeInTheDocument();
        expect(server.get).toHaveBeenCalledWith("/kyc/entity-types");
        expect(labels()).toEqual(EIGHT.map((option) => option.label));
        expect(screen.getByText("This decides which documents the check asks for. Pick the one your PAN is registered as.")).toBeInTheDocument();
        // Nothing has gone to Digio — or to ADX — before the choice.
        expect(server.post).not.toHaveBeenCalled();
        expect(screen.getByRole("button", { name: "Continue to verification" })).toBeDisabled();

        choose("Company");
        await waitFor(() => expect(server.post).toHaveBeenCalledWith("/publishers/me/kyc/digio/initiate", { entityType: "COMPANY", supports: ["CASHFREE"] }));
        expect(await screen.findByText("Waiting for Digio")).toBeInTheDocument();
        expect(screen.getByRole("link", { name: /Open Digio/ })).toHaveAttribute("href", SESSION.sdkUrl);
        expect(onEntityType).toHaveBeenCalledWith("COMPANY");
        expect(server.post).toHaveBeenCalledTimes(1);
    });

    it("starts at once, as it always did, when the form is on file", async () => {
        render(<DigioPanel side="ADVERTISER" entityType="SOLE_PROPRIETOR" onVerified={vi.fn()} />);
        await waitFor(() => expect(server.post).toHaveBeenCalledWith("/advertiser-kyc/me/digio/initiate", { supports: ["CASHFREE"] }));
        expect(await screen.findByText("Waiting for Digio")).toBeInTheDocument();
        expect(screen.queryByRole("group", { name: "Who is this account for?" })).not.toBeInTheDocument();
        expect(server.get).not.toHaveBeenCalledWith("/kyc/entity-types");
    });

    it("gives a print partner its four options", async () => {
        render(<DigioPanel side="PRINT_PARTNER" entityType={null} onVerified={vi.fn()} />);
        await screen.findByRole("group", { name: "Who is this account for?" });
        expect(labels()).toEqual(["Individual", "Sole proprietor", "Company", "LLP or partnership"]);

        choose("LLP or partnership");
        await waitFor(() => expect(server.post).toHaveBeenCalledWith("/print-partners/me/kyc/digio/initiate", { entityType: "LLP_PARTNERSHIP", supports: ["CASHFREE"] }));
    });

    it("keeps the page's way to the uploads beside the question", async () => {
        const onUploadsInstead = vi.fn();
        render(<DigioPanel side="PUBLISHER" entityType={null} onVerified={vi.fn()} onUploadsInstead={onUploadsInstead} />);
        await screen.findByRole("group", { name: "Who is this account for?" });
        fireEvent.click(screen.getByRole("button", { name: "Upload documents instead" }));
        expect(onUploadsInstead).toHaveBeenCalled();
        expect(server.post).not.toHaveBeenCalled();
    });

    it("says so when the options cannot be read, and reads them again on a retry", async () => {
        server.get.mockRejectedValueOnce(new ApiError(500, "BOOM", "Something went wrong"));
        render(<DigioPanel side="PUBLISHER" entityType={null} onVerified={vi.fn()} />);
        expect(await screen.findByRole("alert")).toHaveTextContent("Something went wrong");
        fireEvent.click(screen.getByRole("button", { name: "Try again" }));
        expect(await screen.findByRole("group", { name: "Who is this account for?" })).toBeInTheDocument();
        expect(server.post).not.toHaveBeenCalled();
    });
});

describe("409 ENTITY_TYPE_REQUIRED", () => {
    it("draws the picker from the server's own options and repeats the start with the choice", async () => {
        const options = [
            { value: "INDIVIDUAL", label: "Individual" },
            { value: "COMPANY", label: "Company" },
        ];
        server.post.mockRejectedValueOnce(new ApiError(409, "ENTITY_TYPE_REQUIRED", "Choose who this account is for", { party: "ADVERTISER", options }));
        // The page's read did not say (an older read): the panel starts, and the server asks.
        render(<DigioPanel side="ADVERTISER" onVerified={vi.fn()} />);

        expect(await screen.findByRole("group", { name: "Who is this account for?" })).toBeInTheDocument();
        expect(server.post).toHaveBeenNthCalledWith(1, "/advertiser-kyc/me/digio/initiate", { supports: ["CASHFREE"] });
        expect(labels()).toEqual(["Individual", "Company"]);
        // The 409 carried the list: it is not asked for again.
        expect(server.get).not.toHaveBeenCalledWith("/kyc/entity-types");
        // The refusal is the question, not an error.
        expect(screen.queryByRole("alert")).not.toBeInTheDocument();

        choose("Company");
        await waitFor(() => expect(server.post).toHaveBeenNthCalledWith(2, "/advertiser-kyc/me/digio/initiate", { entityType: "COMPANY", supports: ["CASHFREE"] }));
        expect(await screen.findByText("Waiting for Digio")).toBeInTheDocument();
        expect(server.post).toHaveBeenCalledTimes(2);
    });

    it("reads the list itself when the 409 carried none", async () => {
        server.post.mockRejectedValueOnce(new ApiError(409, "ENTITY_TYPE_REQUIRED", "Choose who this account is for"));
        render(<DigioPanel side="PRINT_PARTNER" entityType="INDIVIDUAL" onVerified={vi.fn()} />);
        await screen.findByRole("group", { name: "Who is this account for?" });
        expect(server.get).toHaveBeenCalledWith("/kyc/entity-types");
        expect(labels()).toHaveLength(4);
    });
});

describe("the upgrade door", () => {
    it("always asks, never offers Individual, warns above the button, and starts with the business", async () => {
        render(<DigioPanel side="PUBLISHER" upgrade entityType="INDIVIDUAL" onVerified={vi.fn()} onUploadsInstead={vi.fn()} uploadsLabel="Back" />);
        await screen.findByRole("group", { name: "Who is this account for?" });
        expect(server.post).not.toHaveBeenCalled();
        expect(labels()).toEqual(EIGHT.slice(1).map((option) => option.label));
        expect(screen.queryByLabelText("Individual")).not.toBeInTheDocument();

        const warning = screen.getByText("Your account goes back to 'verification pending' until the business is verified.");
        const button = screen.getByRole("button", { name: "Continue to verification" });
        expect(warning.compareDocumentPosition(button) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        expect(screen.getByRole("button", { name: "Back" })).toBeInTheDocument();

        choose("Company");
        await waitFor(() => expect(server.post).toHaveBeenCalledWith("/publishers/me/kyc/digio/initiate", { entityType: "COMPANY", supports: ["CASHFREE"] }));
        // The normal wait: the link to Digio, and ADX asked every few seconds.
        expect(await screen.findByText("Waiting for Digio")).toBeInTheDocument();
        expect(screen.getByText("Asking ADX every few seconds.")).toBeInTheDocument();
    });

    it("sends the business again on a retry — an upgrade is only one while the form is sent", async () => {
        server.post.mockRejectedValueOnce(new ApiError(503, "KYC_PROVIDER_UNAVAILABLE", "Digio did not answer", { provider: "DIGIO", reason: "PROVIDER_ERROR" }));
        render(<DigioPanel side="ADVERTISER" upgrade entityType="INDIVIDUAL" onVerified={vi.fn()} />);
        await screen.findByRole("group", { name: "Who is this account for?" });
        choose("Sole proprietor");
        expect(await screen.findByRole("alert")).toHaveTextContent("Digio isn't answering right now. Try again in a few minutes.");

        fireEvent.click(screen.getByRole("button", { name: "Try again" }));
        await waitFor(() => expect(server.post).toHaveBeenCalledTimes(2));
        expect(server.post).toHaveBeenNthCalledWith(2, "/advertiser-kyc/me/digio/initiate", { entityType: "SOLE_PROPRIETOR", supports: ["CASHFREE"] });
        expect(await screen.findByText("Waiting for Digio")).toBeInTheDocument();
    });
});

describe("Digio failing at its own end", () => {
    it("503 PROVIDER_ERROR: Digio is not answering — try again, the uploads still beside it", async () => {
        server.post.mockRejectedValueOnce(new ApiError(503, "KYC_PROVIDER_UNAVAILABLE", "Digio did not answer", { provider: "DIGIO", reason: "PROVIDER_ERROR" }));
        render(<DigioPanel side="PUBLISHER" entityType="COMPANY" onVerified={vi.fn()} onUploadsInstead={vi.fn()} />);
        expect(await screen.findByRole("alert")).toHaveTextContent("Digio isn't answering right now. Try again in a few minutes.");
        expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Upload documents instead" })).toBeInTheDocument();
        // Not the switch's panel: that one is for Digio being off, not failing.
        expect(screen.queryByText("Digio is unavailable right now")).not.toBeInTheDocument();
    });

    it("502 KYC_PROVIDER_REFUSED: no online verification for this account type — support, not another try", async () => {
        server.post.mockRejectedValueOnce(new ApiError(502, "KYC_PROVIDER_REFUSED", "Digio refused the request", { provider: "DIGIO", status: 404, code: "TEMPLATE_NOT_FOUND" }));
        render(<DigioPanel side="ADVERTISER" entityType="POLITICAL" onVerified={vi.fn()} onUploadsInstead={vi.fn()} />);
        expect(await screen.findByRole("alert")).toHaveTextContent("Online verification isn't available for this account type yet. Please contact ADX support.");
        expect(screen.queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Upload documents instead" })).toBeInTheDocument();
    });

    it("503 NO_TEMPLATE: the same sentence as a refusal", async () => {
        server.post.mockRejectedValueOnce(new ApiError(503, "KYC_PROVIDER_UNAVAILABLE", "No workflow configured", { provider: "DIGIO", reason: "NO_TEMPLATE" }));
        render(<DigioPanel side="PRINT_PARTNER" entityType="COMPANY" onVerified={vi.fn()} />);
        expect(await screen.findByRole("alert")).toHaveTextContent("Online verification isn't available for this account type yet. Please contact ADX support.");
        expect(screen.queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();
    });

    it("the switch's own 503 still draws the unavailable panel", async () => {
        server.post.mockRejectedValueOnce(new ApiError(503, "KYC_PROVIDER_UNAVAILABLE", "Digio is off", { provider: "DEGRADED", retryAfter: 300 }));
        render(<DigioPanel side="PUBLISHER" entityType="COMPANY" onVerified={vi.fn()} onUploadsInstead={vi.fn()} />);
        expect(await screen.findByText("Digio is unavailable right now")).toBeInTheDocument();
        expect(screen.getByText("Not answering")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Try Digio again" })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Upload documents instead" })).toBeInTheDocument();
    });

    it("any other failure prints the server's own sentence", async () => {
        server.post.mockRejectedValueOnce(new ApiError(409, "KYC_ALREADY_VERIFIED", "This account is already verified"));
        render(<DigioPanel side="PUBLISHER" entityType="COMPANY" onVerified={vi.fn()} />);
        expect(await screen.findByRole("alert")).toHaveTextContent("This account is already verified");
    });
});

/* 2 Oct 2026: a wrong choice is corrected from the check itself, on an account that is not verified. */
describe("correcting a wrong choice", () => {
    const notAnswering = () => new ApiError(503, "KYC_PROVIDER_UNAVAILABLE", "Digio did not answer", { provider: "DIGIO", reason: "PROVIDER_ERROR" });
    const refused = () => new ApiError(502, "KYC_PROVIDER_REFUSED", "Digio refused the request", { provider: "DIGIO", status: 404, code: "TEMPLATE_NOT_FOUND" });

    it("while waiting: the quiet link opens the picker on every option, the current form chosen, and continuing starts again with the new one", async () => {
        const onEntityType = vi.fn();
        render(<DigioPanel side="ADVERTISER" entityType="NON_PROFIT" onVerified={vi.fn()} onEntityType={onEntityType} onUploadsInstead={vi.fn()} />);
        await screen.findByText("Waiting for Digio");
        expect(server.post).toHaveBeenNthCalledWith(1, "/advertiser-kyc/me/digio/initiate", { supports: ["CASHFREE"] });

        fireEvent.click(screen.getByRole("button", { name: CHANGE }));
        expect(await screen.findByRole("group", { name: "Who is this account for?" })).toBeInTheDocument();
        expect(labels()).toEqual(EIGHT.map((option) => option.label));
        expect(checked()).toEqual(["NON_PROFIT"]);
        expect(screen.getByText("This decides which documents the check asks for. Pick the one your PAN is registered as.")).toBeInTheDocument();
        // A correction, not an upgrade: no warning line.
        expect(screen.queryByText(/goes back to 'verification pending'/)).not.toBeInTheDocument();
        expect(server.post).toHaveBeenCalledTimes(1);

        choose("Company");
        await waitFor(() => expect(server.post).toHaveBeenNthCalledWith(2, "/advertiser-kyc/me/digio/initiate", { entityType: "COMPANY", supports: ["CASHFREE"] }));
        expect(await screen.findByText("Waiting for Digio")).toBeInTheDocument();
        // The page is told the form the account now holds.
        expect(onEntityType).toHaveBeenCalledWith("COMPANY");
        // And the link is there again, on the form just chosen.
        fireEvent.click(screen.getByRole("button", { name: CHANGE }));
        await screen.findByRole("group", { name: "Who is this account for?" });
        expect(checked()).toEqual(["COMPANY"]);
    });

    it("choosing the same form just starts the check again", async () => {
        render(<DigioPanel side="PUBLISHER" entityType="INDIVIDUAL" onVerified={vi.fn()} />);
        await screen.findByText("Waiting for Digio");
        fireEvent.click(screen.getByRole("button", { name: CHANGE }));
        await screen.findByRole("group", { name: "Who is this account for?" });
        expect(checked()).toEqual(["INDIVIDUAL"]);

        fireEvent.click(screen.getByRole("button", { name: "Continue to verification" }));
        await waitFor(() => expect(server.post).toHaveBeenNthCalledWith(2, "/publishers/me/kyc/digio/initiate", { entityType: "INDIVIDUAL", supports: ["CASHFREE"] }));
        expect(await screen.findByText("Waiting for Digio")).toBeInTheDocument();
    });

    it("cancel goes back to the check as it stood, with nothing sent", async () => {
        render(<DigioPanel side="PUBLISHER" entityType="COMPANY" onVerified={vi.fn()} />);
        await screen.findByText("Waiting for Digio");
        fireEvent.click(screen.getByRole("button", { name: CHANGE }));
        await screen.findByRole("group", { name: "Who is this account for?" });
        fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
        expect(screen.getByText("Waiting for Digio")).toBeInTheDocument();
        expect(screen.getByRole("link", { name: /Open Digio/ })).toHaveAttribute("href", SESSION.sdkUrl);
        expect(server.post).toHaveBeenCalledTimes(1);
    });

    it("when Digio did not start: the link is beside the retry, and pre-selects the form chosen this visit", async () => {
        server.post.mockRejectedValueOnce(notAnswering());
        render(<DigioPanel side="PUBLISHER" entityType={null} onVerified={vi.fn()} />);
        await screen.findByRole("group", { name: "Who is this account for?" });
        choose("LLP or partnership");
        expect(await screen.findByText("Digio did not start")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();

        fireEvent.click(screen.getByRole("button", { name: CHANGE }));
        await screen.findByRole("group", { name: "Who is this account for?" });
        expect(checked()).toEqual(["LLP_PARTNERSHIP"]);
        choose("Sole proprietor");
        await waitFor(() => expect(server.post).toHaveBeenNthCalledWith(2, "/publishers/me/kyc/digio/initiate", { entityType: "SOLE_PROPRIETOR", supports: ["CASHFREE"] }));
        expect(await screen.findByText("Waiting for Digio")).toBeInTheDocument();
    });

    it("when online verification is not available for the form: the link is the way out of the dead end", async () => {
        server.post.mockRejectedValueOnce(refused());
        render(<DigioPanel side="ADVERTISER" entityType="POLITICAL" onVerified={vi.fn()} />);
        expect(await screen.findByRole("alert")).toHaveTextContent("Online verification isn't available for this account type yet. Please contact ADX support.");
        expect(screen.queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();

        fireEvent.click(screen.getByRole("button", { name: CHANGE }));
        await screen.findByRole("group", { name: "Who is this account for?" });
        expect(checked()).toEqual(["POLITICAL"]);
        choose("Company");
        await waitFor(() => expect(server.post).toHaveBeenNthCalledWith(2, "/advertiser-kyc/me/digio/initiate", { entityType: "COMPANY", supports: ["CASHFREE"] }));
        expect(await screen.findByText("Waiting for Digio")).toBeInTheDocument();
        expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });

    it("gives a print partner its four options, the current one chosen", async () => {
        render(<DigioPanel side="PRINT_PARTNER" entityType="SOLE_PROPRIETOR" onVerified={vi.fn()} />);
        await screen.findByText("Waiting for Digio");
        fireEvent.click(screen.getByRole("button", { name: CHANGE }));
        await screen.findByRole("group", { name: "Who is this account for?" });
        expect(labels()).toEqual(["Individual", "Sole proprietor", "Company", "LLP or partnership"]);
        expect(checked()).toEqual(["SOLE_PROPRIETOR"]);
        choose("Individual");
        await waitFor(() => expect(server.post).toHaveBeenNthCalledWith(2, "/print-partners/me/kyc/digio/initiate", { entityType: "INDIVIDUAL", supports: ["CASHFREE"] }));
    });

    it("is not offered before any check: the first question is not a correction", async () => {
        render(<DigioPanel side="PUBLISHER" entityType={null} onVerified={vi.fn()} />);
        await screen.findByRole("group", { name: "Who is this account for?" });
        expect(screen.queryByRole("button", { name: CHANGE })).not.toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "Cancel" })).not.toBeInTheDocument();
    });

    it("is hidden while the page says Digio is switched off or down — waiting or failed", async () => {
        const waiting = render(<DigioPanel side="PUBLISHER" entityType="COMPANY" allowTypeChange={false} onVerified={vi.fn()} />);
        await screen.findByText("Waiting for Digio");
        expect(screen.queryByRole("button", { name: CHANGE })).not.toBeInTheDocument();
        waiting.unmount();

        server.post.mockRejectedValueOnce(refused());
        render(<DigioPanel side="PUBLISHER" entityType="COMPANY" allowTypeChange={false} onVerified={vi.fn()} />);
        await screen.findByRole("alert");
        expect(screen.queryByRole("button", { name: CHANGE })).not.toBeInTheDocument();
    });

    it("is hidden on the switch's own panel", async () => {
        server.post.mockRejectedValueOnce(new ApiError(503, "KYC_PROVIDER_UNAVAILABLE", "Digio is off", { provider: "MANUAL", retryAfter: null }));
        render(<DigioPanel side="PUBLISHER" entityType="COMPANY" onVerified={vi.fn()} />);
        await screen.findByText("Digio is unavailable right now");
        expect(screen.queryByRole("button", { name: CHANGE })).not.toBeInTheDocument();
    });

    it("is never shown on a verified account: once ADX has heard, on a start refused as already verified, or on an upgrade that has not started", async () => {
        // ADX has heard: verified.
        server.get.mockImplementation(async (path: string) => {
            if (path === "/kyc/entity-types") return TYPES;
            return { method: "DIGIO", digioStatus: "approved", kycStatus: "VERIFIED", digioVerifiedAt: "2026-10-01T10:00:00.000Z" };
        });
        const heard = render(<DigioPanel side="ADVERTISER" entityType="COMPANY" onVerified={vi.fn()} />);
        await screen.findByText("Waiting for Digio");
        expect(screen.getByRole("button", { name: CHANGE })).toBeInTheDocument();
        // The listener is attached once the wait has rendered and its effect run: look again until the panel asks.
        await waitFor(() => {
            fireEvent(document, new Event("visibilitychange"));
            expect(server.get).toHaveBeenCalledWith("/advertiser-kyc/me/digio/status");
        });
        expect(await screen.findByText("Verified by Digio")).toBeInTheDocument();
        expect(screen.queryByRole("button", { name: CHANGE })).not.toBeInTheDocument();
        heard.unmount();

        // The server says the account is already verified.
        server.post.mockRejectedValueOnce(new ApiError(409, "KYC_ALREADY_VERIFIED", "This account is already verified"));
        const refusedStart = render(<DigioPanel side="ADVERTISER" entityType="COMPANY" onVerified={vi.fn()} />);
        expect(await screen.findByRole("alert")).toHaveTextContent("This account is already verified");
        expect(screen.queryByRole("button", { name: CHANGE })).not.toBeInTheDocument();
        refusedStart.unmount();

        // An upgrade Digio refused: the individual stays verified, so the upgrade door — not this link — is the way.
        server.post.mockRejectedValueOnce(refused());
        render(<DigioPanel side="ADVERTISER" upgrade entityType="INDIVIDUAL" onVerified={vi.fn()} onUploadsInstead={vi.fn()} uploadsLabel="Back" />);
        await screen.findByRole("group", { name: "Who is this account for?" });
        choose("Company");
        await screen.findByRole("alert");
        expect(screen.queryByRole("button", { name: CHANGE })).not.toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Back" })).toBeInTheDocument();
    });

    it("an upgrade that has started is a pending account like any other: the link, and every option", async () => {
        render(<DigioPanel side="PUBLISHER" upgrade entityType="INDIVIDUAL" onVerified={vi.fn()} />);
        await screen.findByRole("group", { name: "Who is this account for?" });
        choose("Company");
        await screen.findByText("Waiting for Digio");

        fireEvent.click(screen.getByRole("button", { name: CHANGE }));
        await screen.findByRole("group", { name: "Who is this account for?" });
        expect(labels()).toEqual(EIGHT.map((option) => option.label));
        expect(checked()).toEqual(["COMPANY"]);
        expect(screen.queryByText(/goes back to 'verification pending'/)).not.toBeInTheDocument();
    });
});

describe("the wait", () => {
    it("tells the page when ADX has heard, closing a publisher's onboarding first", async () => {
        const onVerified = vi.fn();
        server.get.mockImplementation(async (path: string) => {
            if (path === "/kyc/entity-types") return TYPES;
            return { method: "DIGIO", digioStatus: "approved", kycStatus: "VERIFIED", digioVerifiedAt: "2026-10-01T10:00:00.000Z" };
        });
        render(<DigioPanel side="PUBLISHER" entityType="COMPANY" onVerified={onVerified} />);
        await screen.findByText("Waiting for Digio");
        // The tab is looked at again: the panel asks at once rather than waiting out the interval.
        await waitFor(() => {
            fireEvent(document, new Event("visibilitychange"));
            expect(onVerified).toHaveBeenCalledTimes(1);
        });
        expect(server.get).toHaveBeenCalledWith("/publishers/me/kyc/digio/status");
        expect(server.post).toHaveBeenCalledWith("/publishers/me/complete-onboarding");
    });
});

describe("Cashfree Phase 2: ADX's own identity check", () => {
    const START = { provider: "CASHFREE", sessionId: "vs_1", steps: [], expiresAt: "2026-10-02T10:00:00.000Z" };
    const sessionView = (status: string, steps: unknown[] = [{ check: "DIGILOCKER", required: true, status: "OPEN", at: null, failureCode: null, triesLeft: 3 }]) => ({
        id: "vs_1",
        provider: "CASHFREE",
        caseType: "PUBLISHER_KYC",
        caseId: "pub_1",
        workflowKey: "PUBLISHER.COMPANY",
        status,
        steps,
        expiresAt: "2026-10-02T10:00:00.000Z",
        createdAt: "2026-10-01T10:00:00.000Z",
        updatedAt: "2026-10-01T10:00:00.000Z",
    });
    const routeSession = (status: string) =>
        server.get.mockImplementation(async (path: string) => {
            if (path === "/kyc/entity-types") return TYPES;
            if (path === "/verification/sessions/vs_1") return sessionView(status);
            throw new ApiError(404, "NOT_FOUND", path);
        });

    it("draws the session screen when the start hands out a session instead of Digio", async () => {
        routeSession("OPEN");
        server.post.mockResolvedValue(START);
        const onEntityType = vi.fn();
        render(<DigioPanel side="PUBLISHER" entityType={null} onVerified={vi.fn()} onEntityType={onEntityType} />);
        await screen.findByRole("group", { name: "Who is this account for?" });
        choose("Company");

        await waitFor(() => expect(server.post).toHaveBeenCalledWith("/publishers/me/kyc/digio/initiate", { entityType: "COMPANY", supports: ["CASHFREE"] }));
        expect(await screen.findByText("Verify your identity")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Open DigiLocker" })).toBeInTheDocument();
        expect(onEntityType).toHaveBeenCalledWith("COMPANY");
        // No Digio page, no Digio wait.
        expect(screen.queryByText("Waiting for Digio")).not.toBeInTheDocument();
        expect(server.get).not.toHaveBeenCalledWith("/publishers/me/kyc/digio/status");
    });

    it("opens a session the person already has without starting anything", async () => {
        routeSession("OPEN");
        render(<DigioPanel side="ADVERTISER" entityType="COMPANY" sessionId="vs_1" onVerified={vi.fn()} />);
        expect(await screen.findByText("Verify your identity")).toBeInTheDocument();
        expect(server.post).not.toHaveBeenCalled();
        expect(server.get).not.toHaveBeenCalledWith("/kyc/entity-types");
    });

    it("starts the party's own check again when the session timed out", async () => {
        routeSession("EXPIRED");
        server.post.mockResolvedValue(SESSION);
        render(<DigioPanel side="PRINT_PARTNER" entityType="COMPANY" sessionId="vs_1" onVerified={vi.fn()} />);
        fireEvent.click(await screen.findByRole("button", { name: "Start again" }));
        await waitFor(() => expect(server.post).toHaveBeenCalledWith("/print-partners/me/kyc/digio/initiate", { supports: ["CASHFREE"] }));
        expect(await screen.findByText("Waiting for Digio")).toBeInTheDocument();
    });

    it("tells the page a verified session, closing a publisher's onboarding first", async () => {
        routeSession("VERIFIED");
        const onVerified = vi.fn();
        render(<DigioPanel side="PUBLISHER" entityType="COMPANY" sessionId="vs_1" onVerified={onVerified} />);
        await waitFor(() => expect(onVerified).toHaveBeenCalledWith("session"));
        expect(server.post).toHaveBeenCalledWith("/publishers/me/complete-onboarding");
    });

    it("goes back to the page when the session is not the person's", async () => {
        server.get.mockRejectedValue(new ApiError(404, "NOT_FOUND", "Verification session not found"));
        const onClose = vi.fn();
        render(<DigioPanel side="ADVERTISER" entityType="COMPANY" sessionId="vs_9" onVerified={vi.fn()} onClose={onClose} />);
        await waitFor(() => expect(onClose).toHaveBeenCalled());
    });
});
