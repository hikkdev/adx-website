import * as React from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Cashfree Phase 2 — ADX's own identity check on the website: the groups a
 * session draws, each group's happy path and its failure words with the
 * tries left, the 503 that spends no try, the server's order (`needs`),
 * DigiLocker's run-out, the round trip's address and note, and the four end
 * states. The network is mocked the way the Digio panel's tests mock it;
 * the selfie's downscale (a canvas jsdom does not have) is mocked too.
 */

const server = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock("@/lib/api-client", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-client")>();
    return { ...actual, api: { get: server.get, post: server.post, put: vi.fn(), patch: vi.fn(), delete: vi.fn() } };
});
const jpeg = vi.hoisted(() => ({ fn: vi.fn() }));
vi.mock("@/components/verification/selfie-image", () => ({ selfieJpeg: jpeg.fn }));

import { ApiError } from "@/lib/api-client";
import { apiConfig } from "@/lib/api-config";
import { DIGILOCKER_RETURN_KEY, type SessionStepView, type SessionView } from "@/services/verification";
import { VerificationSession } from "./verification-session";

const step = (check: SessionStepView["check"], over: Partial<SessionStepView> = {}): SessionStepView => ({ check, required: true, status: "OPEN", at: null, failureCode: null, triesLeft: 3, ...over });
const view = (over: Partial<SessionView> = {}): SessionView => ({
    id: "vs_1",
    provider: "CASHFREE",
    caseType: "PUBLISHER_KYC",
    caseId: "pub_1",
    workflowKey: "PUBLISHER.INDIVIDUAL",
    status: "OPEN",
    steps: [step("DIGILOCKER"), step("FACE_LIVENESS"), step("FACE_MATCH"), step("BANK_ACCOUNT"), step("NAME_MATCH")],
    expiresAt: "2026-10-02T10:00:00.000Z",
    createdAt: "2026-10-01T10:00:00.000Z",
    updatedAt: "2026-10-01T10:00:00.000Z",
    ...over,
});
const done = (check: SessionStepView["check"]) => step(check, { status: "VERIFIED", at: "2026-10-01T10:05:00.000Z" });
const IDENTITY_DONE = [done("DIGILOCKER"), done("FACE_LIVENESS"), done("FACE_MATCH")];

const group = (name: string) => screen.getByRole("region", { name });

beforeEach(() => {
    server.get.mockReset();
    server.post.mockReset();
    jpeg.fn.mockReset();
    jpeg.fn.mockImplementation(async () => new Blob(["small"], { type: "image/jpeg" }));
    window.sessionStorage.clear();
});

describe("the screen", () => {
    it("draws the title, the intro and only the groups the session has, in order", async () => {
        server.get.mockResolvedValue(view());
        render(<VerificationSession sessionId="vs_1" />);
        expect(await screen.findByText("Verify your identity")).toBeInTheDocument();
        expect(server.get).toHaveBeenCalledWith("/verification/sessions/vs_1");
        expect(screen.getByText("A few quick checks and you're done. Keep your Aadhaar-linked phone handy.")).toBeInTheDocument();
        expect(screen.getAllByRole("region").map((region) => region.getAttribute("aria-label"))).toEqual(["Aadhaar and PAN from DigiLocker", "A selfie", "Bank account"]);
        expect(screen.getByText("You'll sign in to DigiLocker and allow ADX to read your Aadhaar and PAN. We keep only your name and the last four digits.")).toBeInTheDocument();
        // The person never hears the provider's name.
        expect(document.body.textContent).not.toMatch(/cashfree/i);
    });

    it("goes back to the verify page when the session is not theirs or gone", async () => {
        const onGone = vi.fn();
        server.get.mockRejectedValue(new ApiError(404, "NOT_FOUND", "Verification session not found"));
        render(<VerificationSession sessionId="vs_x" onGone={onGone} />);
        await waitFor(() => expect(onGone).toHaveBeenCalled());
    });
});

describe("DigiLocker", () => {
    it("opens DigiLocker with the configured site as the way back, keeping the page to return to", async () => {
        const navigate = vi.fn();
        server.get.mockResolvedValue(view());
        server.post.mockResolvedValue({ url: "https://verification.cashfree.com/dl/abc", expiresAt: null, session: view({ status: "NEEDS_USER_ACTION", steps: [step("DIGILOCKER", { status: "PENDING" }), step("FACE_LIVENESS"), step("FACE_MATCH")] }) });
        window.history.replaceState(null, "", "/advertiser/verify?next=%2Fadvertiser%2Fcampaigns");
        render(<VerificationSession sessionId="vs_1" navigate={navigate} />);

        fireEvent.click(await screen.findByRole("button", { name: "Open DigiLocker" }));
        await waitFor(() => expect(navigate).toHaveBeenCalledWith("https://verification.cashfree.com/dl/abc"));
        expect(server.post).toHaveBeenCalledWith("/verification/sessions/vs_1/digilocker", { redirectUrl: `${apiConfig.siteUrl}/verify/digilocker-return?session=vs_1` });
        expect(JSON.parse(window.sessionStorage.getItem(DIGILOCKER_RETURN_KEY)!)).toEqual({ sessionId: "vs_1", path: "/advertiser/verify?next=%2Fadvertiser%2Fcampaigns" });
        window.history.replaceState(null, "", "/");
    });

    it("waits for DigiLocker, and reads its answer when the person says they have finished", async () => {
        server.get.mockResolvedValue(view({ status: "NEEDS_USER_ACTION", steps: [step("DIGILOCKER", { status: "PENDING" }), step("FACE_LIVENESS"), step("FACE_MATCH")] }));
        server.post.mockResolvedValue({ status: "VERIFIED", failureCode: null, name: "Asha Rao", documents: { AADHAAR: { status: "VALID", last4: "1234" } }, session: view({ steps: [done("DIGILOCKER"), step("FACE_LIVENESS"), step("FACE_MATCH")] }) });
        render(<VerificationSession sessionId="vs_1" />);

        expect(await screen.findByText("Waiting for DigiLocker…")).toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: "I've finished in DigiLocker" }));
        await waitFor(() => expect(server.post).toHaveBeenCalledWith("/verification/sessions/vs_1/digilocker/refresh"));
        expect(await within(group("Aadhaar and PAN from DigiLocker")).findByText("Done")).toBeInTheDocument();
        expect(within(group("A selfie")).getByRole("button", { name: /Take a selfie/ })).toBeEnabled();
    });

    it("says what DigiLocker refused, with the tries left", async () => {
        server.get.mockResolvedValue(view({ steps: [step("DIGILOCKER", { status: "FAILED", failureCode: "CONSENT_DENIED", triesLeft: 2 }), step("FACE_LIVENESS"), step("FACE_MATCH")] }));
        render(<VerificationSession sessionId="vs_1" />);
        const dl = await screen.findByRole("region", { name: "Aadhaar and PAN from DigiLocker" });
        expect(within(dl).getByText(/DigiLocker access wasn't given\. Try again and allow access to your Aadhaar and PAN\./)).toBeInTheDocument();
        expect(within(dl).getByText(/2 tries left/)).toBeInTheDocument();
        expect(within(dl).getByRole("button", { name: "Open DigiLocker" })).toBeEnabled();
    });

    it("shows the backend's own sentence when DigiLocker cannot be opened (a local http site)", async () => {
        server.get.mockResolvedValue(view());
        server.post.mockRejectedValue(new ApiError(400, "VALIDATION_ERROR", "Invalid request", { fieldErrors: { redirectUrl: ["The address must start with https://"] } }));
        render(<VerificationSession sessionId="vs_1" navigate={vi.fn()} />);
        fireEvent.click(await screen.findByRole("button", { name: "Open DigiLocker" }));
        expect(await within(group("Aadhaar and PAN from DigiLocker")).findByText("The address must start with https://")).toBeInTheDocument();
    });
});

describe("the selfie", () => {
    it("waits for DigiLocker first", async () => {
        server.get.mockResolvedValue(view());
        render(<VerificationSession sessionId="vs_1" />);
        await screen.findByText("Verify your identity");
        expect(within(group("A selfie")).getByRole("button", { name: /Take a selfie/ })).toBeDisabled();
        expect(screen.getByText("Face the camera in good light. No glasses, cap or mask. We don't keep the photo.")).toBeInTheDocument();
    });

    it("sends one photo, downscaled to a JPEG, and keeps nothing of it", async () => {
        server.get.mockResolvedValue(view({ steps: [done("DIGILOCKER"), step("FACE_LIVENESS"), step("FACE_MATCH")] }));
        server.post.mockResolvedValue({ liveness: { status: "VERIFIED", failureCode: null }, faceMatch: { status: "VERIFIED", failureCode: null, score: 92 }, session: view({ steps: IDENTITY_DONE }) });
        render(<VerificationSession sessionId="vs_1" />);
        await screen.findByText("Verify your identity");

        const input = screen.getByTestId("selfie-file") as HTMLInputElement;
        expect(input).toHaveAttribute("accept", "image/jpeg,image/png");
        expect(input).toHaveAttribute("capture", "user");
        const photo = new File(["big photo"], "me.png", { type: "image/png" });
        fireEvent.change(input, { target: { files: [photo] } });

        await waitFor(() => expect(server.post).toHaveBeenCalledWith("/verification/sessions/vs_1/selfie", expect.any(FormData)));
        expect(jpeg.fn).toHaveBeenCalledWith(photo);
        const sent = (server.post.mock.calls[0]![1] as FormData).get("file") as File;
        expect(sent.type).toBe("image/jpeg");
        expect(await within(group("A selfie")).findByText("Done")).toBeInTheDocument();
        expect(input.value).toBe("");
    });

    it("says a failed selfie in the person's words, with the tries left", async () => {
        server.get.mockResolvedValue(view({ steps: [done("DIGILOCKER"), step("FACE_LIVENESS", { status: "FAILED", failureCode: "NOT_LIVE", triesLeft: 1 }), step("FACE_MATCH")] }));
        render(<VerificationSession sessionId="vs_1" />);
        const selfie = await screen.findByRole("region", { name: "A selfie" });
        expect(within(selfie).getByText(/We couldn't confirm a live photo\. Take the selfie again in good light, facing the camera\./)).toBeInTheDocument();
        expect(within(selfie).getByText(/1 try left/)).toBeInTheDocument();
    });

    it("locks the group when no tries are left", async () => {
        server.get.mockResolvedValue(view({ steps: [done("DIGILOCKER"), step("FACE_LIVENESS", { status: "FAILED", failureCode: "FACE_MISMATCH", triesLeft: 0 }), step("FACE_MATCH")] }));
        render(<VerificationSession sessionId="vs_1" />);
        const selfie = await screen.findByRole("region", { name: "A selfie" });
        expect(within(selfie).getByText(/Your selfie doesn't match your Aadhaar photo/)).toBeInTheDocument();
        expect(within(selfie).queryByRole("button", { name: /Take a selfie/ })).not.toBeInTheDocument();
        expect(within(selfie).queryByText(/tries? left/)).not.toBeInTheDocument();
    });

    it("sends the person back to DigiLocker when its access ran out before the selfie", async () => {
        server.get.mockResolvedValueOnce(view({ steps: [done("DIGILOCKER"), step("FACE_LIVENESS"), step("FACE_MATCH")] }));
        server.get.mockResolvedValueOnce(view({ steps: [step("DIGILOCKER"), done("FACE_LIVENESS"), step("FACE_MATCH")] }));
        server.post.mockRejectedValue(new ApiError(409, "DIGILOCKER_CONSENT_REQUIRED", "Your DigiLocker consent has run out.", { check: "FACE_MATCH", needs: "DIGILOCKER" }));
        render(<VerificationSession sessionId="vs_1" />);
        await screen.findByText("Verify your identity");
        fireEvent.change(screen.getByTestId("selfie-file"), { target: { files: [new File(["x"], "me.jpg", { type: "image/jpeg" })] } });

        expect(await within(group("Aadhaar and PAN from DigiLocker")).findByText("Your DigiLocker access ran out. Open DigiLocker again to continue.")).toBeInTheDocument();
        expect(server.get).toHaveBeenCalledTimes(2);
        expect(within(group("Aadhaar and PAN from DigiLocker")).getByRole("button", { name: "Open DigiLocker" })).toBeEnabled();
    });
});

describe("the bank account", () => {
    const bankReady = () => view({ steps: [...IDENTITY_DONE, step("BANK_ACCOUNT"), step("NAME_MATCH")] });
    const fill = () => {
        fireEvent.change(screen.getByLabelText("Account number"), { target: { value: "1234 5678 90" } });
        fireEvent.change(screen.getByLabelText("IFSC"), { target: { value: "hdfc0001234" } });
    };

    it("checks the account and shows the group done", async () => {
        server.get.mockResolvedValue(bankReady());
        server.post.mockResolvedValue({ bank: { status: "VERIFIED", failureCode: null, bankName: "HDFC" }, nameMatch: { status: "VERIFIED", failureCode: null, score: 96 }, session: view({ status: "VERIFIED", steps: [...IDENTITY_DONE, done("BANK_ACCOUNT"), done("NAME_MATCH")] }) });
        render(<VerificationSession sessionId="vs_1" />);
        await screen.findByText("Verify your identity");
        expect(screen.getByText("The account must be in your name (or your business's name).")).toBeInTheDocument();
        fill();
        fireEvent.click(screen.getByRole("button", { name: "Check account" }));
        await waitFor(() => expect(server.post).toHaveBeenCalledWith("/verification/sessions/vs_1/bank", { accountNumber: "1234567890", ifsc: "HDFC0001234" }));
        expect(await within(group("Bank account")).findByText("Done")).toBeInTheDocument();
    });

    it("says a name mismatch with the tries left", async () => {
        server.get.mockResolvedValue(view({ steps: [...IDENTITY_DONE, done("BANK_ACCOUNT"), step("NAME_MATCH", { status: "FAILED", failureCode: "NAME_MISMATCH", triesLeft: 2 })] }));
        render(<VerificationSession sessionId="vs_1" />);
        const bank = await screen.findByRole("region", { name: "Bank account" });
        expect(within(bank).getByText(/The name on this account doesn't match the name on your ID\./)).toBeInTheDocument();
        expect(within(bank).getByText(/2 tries left/)).toBeInTheDocument();
    });

    it("says a 503 spent no try, and keeps the form filled", async () => {
        server.get.mockResolvedValue(bankReady());
        server.post.mockRejectedValue(new ApiError(503, "VERIFICATION_UNAVAILABLE", "This check cannot be made right now."));
        render(<VerificationSession sessionId="vs_1" />);
        await screen.findByText("Verify your identity");
        fill();
        fireEvent.click(screen.getByRole("button", { name: "Check account" }));
        expect(await screen.findByText("This check can't be made right now. Try again in a few minutes — this didn't count as a try.")).toBeInTheDocument();
        expect(screen.getByLabelText("Account number")).toHaveValue("1234567890");
        expect(screen.getByLabelText("IFSC")).toHaveValue("HDFC0001234");
    });

    it("shows the backend's sentence for a bad field under the form", async () => {
        server.get.mockResolvedValue(bankReady());
        server.post.mockRejectedValue(new ApiError(400, "VALIDATION_ERROR", "Invalid request", { fieldErrors: { ifsc: ["An IFSC is 4 letters, a zero and 6 characters"] }, formErrors: [] }));
        render(<VerificationSession sessionId="vs_1" />);
        await screen.findByText("Verify your identity");
        fill();
        fireEvent.click(screen.getByRole("button", { name: "Check account" }));
        expect(await within(group("Bank account")).findByText("An IFSC is 4 letters, a zero and 6 characters")).toBeInTheDocument();
    });

    it("re-reads the session and brings the step the server needs forward", async () => {
        server.get.mockResolvedValue(bankReady());
        server.post.mockRejectedValue(new ApiError(409, "VERIFICATION_STEP_NOT_OPEN", "Finish DigiLocker first", { check: "NAME_MATCH", needs: "DIGILOCKER" }));
        render(<VerificationSession sessionId="vs_1" />);
        await screen.findByText("Verify your identity");
        fill();
        fireEvent.click(screen.getByRole("button", { name: "Check account" }));
        await waitFor(() => expect(server.get).toHaveBeenCalledTimes(2));
        await waitFor(() => expect(group("Aadhaar and PAN from DigiLocker").className).toContain("ring-2"));
    });
});

describe("the business", () => {
    it("labels the GSTIN optional when its step is, and sends the PAN alone", async () => {
        server.get.mockResolvedValue(view({ workflowKey: "PUBLISHER.COMPANY", steps: [...IDENTITY_DONE, step("PAN"), step("GSTIN", { required: false }), step("PAPERS", { status: "REVIEW" })] }));
        server.post.mockResolvedValue({ pan: { status: "VERIFIED", failureCode: null, score: 90, registeredName: "ACME" }, gstin: null, session: view({ status: "IN_REVIEW", steps: [...IDENTITY_DONE, done("PAN"), step("GSTIN", { required: false }), step("PAPERS", { status: "REVIEW" })] }) });
        render(<VerificationSession sessionId="vs_1" onUploads={vi.fn()} />);
        await screen.findByText("Verify your identity");
        expect(screen.getByLabelText("GSTIN (optional)")).toBeInTheDocument();
        fireEvent.change(screen.getByLabelText("Business PAN"), { target: { value: "abcde1234f" } });
        fireEvent.click(screen.getByRole("button", { name: "Check" }));
        await waitFor(() => expect(server.post).toHaveBeenCalledWith("/verification/sessions/vs_1/business", { pan: "ABCDE1234F" }));
        expect(await screen.findByText("Checks passed. Our team is reviewing your business papers and will let you know.")).toBeInTheDocument();
    });

    it("asks for the GSTIN when its step is required, and says a GSTIN that was not found", async () => {
        server.get.mockResolvedValue(view({ caseType: "PRINT_PARTNER_KYC", steps: [...IDENTITY_DONE, step("PAN"), step("GSTIN", { status: "FAILED", failureCode: "GSTIN_NOT_FOUND", triesLeft: 2 }), step("PAPERS", { status: "REVIEW" })] }));
        server.post.mockResolvedValue({ pan: { status: "VERIFIED", failureCode: null, registeredName: "ACME" }, gstin: { status: "VERIFIED", failureCode: null, legalName: "ACME" }, session: view() });
        render(<VerificationSession sessionId="vs_1" />);
        await screen.findByText("Verify your identity");
        const business = group("Business PAN and GSTIN");
        expect(within(business).getByText(/We couldn't find this GSTIN\. Check it and try again\./)).toBeInTheDocument();
        expect(within(business).getByLabelText("GSTIN")).toBeInTheDocument();
        fireEvent.change(screen.getByLabelText("Business PAN"), { target: { value: "ABCDE1234F" } });
        expect(within(business).getByRole("button", { name: "Check" })).toBeDisabled();
        fireEvent.change(screen.getByLabelText("GSTIN"), { target: { value: "22abcde1234f1z5" } });
        fireEvent.click(within(business).getByRole("button", { name: "Check" }));
        await waitFor(() => expect(server.post).toHaveBeenCalledWith("/verification/sessions/vs_1/business", { pan: "ABCDE1234F", gstin: "22ABCDE1234F1Z5" }));
    });

    it("links the papers to the existing upload screen", async () => {
        const onUploads = vi.fn();
        server.get.mockResolvedValue(view({ steps: [...IDENTITY_DONE, step("PAN"), step("PAPERS", { status: "REVIEW" })] }));
        render(<VerificationSession sessionId="vs_1" onUploads={onUploads} />);
        const papers = await screen.findByRole("region", { name: "Business papers" });
        expect(within(papers).getByText("Our team reviews these.")).toBeInTheDocument();
        fireEvent.click(within(papers).getByRole("button", { name: "Upload papers" }));
        expect(onUploads).toHaveBeenCalled();
    });
});

describe("the licence and the vehicle", () => {
    it("checks each with its own form", async () => {
        server.get.mockResolvedValue(view({ caseType: "AGENT_KYC", steps: [step("DRIVING_LICENCE"), step("VEHICLE_RC")] }));
        server.post.mockImplementation(async (path: string) => ({ session: view({ caseType: "AGENT_KYC", steps: path.endsWith("/vehicle") ? [done("DRIVING_LICENCE"), done("VEHICLE_RC")] : [done("DRIVING_LICENCE"), step("VEHICLE_RC")] }) }));
        render(<VerificationSession sessionId="vs_1" />);
        await screen.findByText("Verify your identity");
        fireEvent.change(screen.getByLabelText("Licence number"), { target: { value: "ka0120201234567" } });
        fireEvent.change(screen.getByLabelText("Date of birth"), { target: { value: "1990-04-01" } });
        fireEvent.click(screen.getByRole("button", { name: "Check licence" }));
        await waitFor(() => expect(server.post).toHaveBeenCalledWith("/verification/sessions/vs_1/driving-licence", { dlNumber: "KA0120201234567", dob: "1990-04-01" }));
        expect(await within(group("Driving licence")).findByText("Done")).toBeInTheDocument();

        fireEvent.change(screen.getByLabelText("Registration number (e.g. KA01AB1234)"), { target: { value: "ka 01 ab 1234" } });
        fireEvent.click(screen.getByRole("button", { name: "Check vehicle" }));
        await waitFor(() => expect(server.post).toHaveBeenCalledWith("/verification/sessions/vs_1/vehicle", { vehicleNumber: "KA01AB1234" }));
    });
});

describe("the end states", () => {
    it("VERIFIED: says so and tells the page, once", async () => {
        const onVerified = vi.fn();
        server.get.mockResolvedValue(view({ status: "VERIFIED", steps: IDENTITY_DONE }));
        render(<VerificationSession sessionId="vs_1" onVerified={onVerified} />);
        expect(await screen.findByText("You're verified. Thanks — you're all set.")).toBeInTheDocument();
        await waitFor(() => expect(onVerified).toHaveBeenCalledTimes(1));
    });

    it("IN_REVIEW: says the papers are with the team, and keeps the papers reachable", async () => {
        const onUploads = vi.fn();
        server.get.mockResolvedValue(view({ status: "IN_REVIEW", steps: [...IDENTITY_DONE, done("PAN"), step("PAPERS", { status: "REVIEW" })] }));
        render(<VerificationSession sessionId="vs_1" onUploads={onUploads} />);
        expect(await screen.findByText("Checks passed. Our team is reviewing your business papers and will let you know.")).toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: "Upload papers" }));
        expect(onUploads).toHaveBeenCalled();
    });

    it("FAILED: offers the manual upload", async () => {
        const onUploads = vi.fn();
        server.get.mockResolvedValue(view({ status: "FAILED", steps: [done("DIGILOCKER"), step("FACE_LIVENESS", { status: "FAILED", failureCode: "NOT_LIVE", triesLeft: 0 }), step("FACE_MATCH")] }));
        render(<VerificationSession sessionId="vs_1" onUploads={onUploads} />);
        expect(await screen.findByText("We couldn't verify you automatically. Our team will take a look — you can also upload your documents instead.")).toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: "Upload documents" }));
        expect(onUploads).toHaveBeenCalled();
        // A closed session takes no more steps.
        expect(screen.queryByRole("button", { name: "Check account" })).not.toBeInTheDocument();
    });

    it("EXPIRED: offers to start again", async () => {
        const onRestart = vi.fn();
        server.get.mockResolvedValue(view({ status: "EXPIRED" }));
        render(<VerificationSession sessionId="vs_1" onRestart={onRestart} />);
        expect(await screen.findByText("This check timed out.")).toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "Open DigiLocker" })).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: "Start again" }));
        expect(onRestart).toHaveBeenCalled();
    });

    it("a step on a session that closed meanwhile re-reads it and shows where it ended", async () => {
        server.get.mockResolvedValueOnce(view({ steps: [...IDENTITY_DONE, step("BANK_ACCOUNT"), step("NAME_MATCH")] }));
        server.get.mockResolvedValueOnce(view({ status: "EXPIRED", steps: [...IDENTITY_DONE, step("BANK_ACCOUNT"), step("NAME_MATCH")] }));
        server.post.mockRejectedValue(new ApiError(409, "VERIFICATION_SESSION_CLOSED", "expired", { status: "EXPIRED" }));
        render(<VerificationSession sessionId="vs_1" onRestart={vi.fn()} />);
        await screen.findByText("Verify your identity");
        fireEvent.change(screen.getByLabelText("Account number"), { target: { value: "1234567890" } });
        fireEvent.change(screen.getByLabelText("IFSC"), { target: { value: "HDFC0001234" } });
        fireEvent.click(screen.getByRole("button", { name: "Check account" }));
        expect(await screen.findByText("This check timed out.")).toBeInTheDocument();
    });
});
