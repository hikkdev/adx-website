import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api-client", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-client")>();
    return { ...actual, api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() } };
});

import { api, ApiError } from "@/lib/api-client";
import {
    backupStandsIn,
    digilockerBackHref,
    digilockerReturnNote,
    digilockerReturnUrl,
    digioUnavailableLine,
    failureWords,
    fitWithin,
    groupOfCheck,
    identityStartOffered,
    isSessionStart,
    resumableSession,
    SESSION_COPY,
    sessionGroups,
    sessionProblemOf,
    triesWords,
    validationMessageOf,
    verification,
    type SessionStepView,
    type SessionView,
} from "./verification";

/**
 * Cashfree Phase 2 — the service half of ADX's own identity check: every
 * start says `supports: ['CASHFREE']` and reads the answer as a union, the
 * session's routes, the groups the screen draws, the failure codes in the
 * person's words, and the DigiLocker round trip's addresses.
 */

const mocked = api as unknown as Record<"get" | "post", ReturnType<typeof vi.fn>>;

beforeEach(() => {
    mocked.get.mockReset();
    mocked.post.mockReset();
});

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

describe("the start", () => {
    it("says it can draw ADX's own check on every side's start, with or without the chosen form", async () => {
        mocked.post.mockResolvedValue({ provider: "DIGIO", kycId: "k", accessToken: "t", validTill: "", sdkUrl: "https://digio" });
        await verification.digioInitiate("PUBLISHER");
        await verification.digioInitiate("ADVERTISER", "COMPANY");
        await verification.digioInitiate("PRINT_PARTNER", null);
        expect(mocked.post.mock.calls).toEqual([
            ["/publishers/me/kyc/digio/initiate", { supports: ["CASHFREE"] }],
            ["/advertiser-kyc/me/digio/initiate", { entityType: "COMPANY", supports: ["CASHFREE"] }],
            ["/print-partners/me/kyc/digio/initiate", { supports: ["CASHFREE"] }],
        ]);
    });

    it("tells a session from Digio by its provider", () => {
        expect(isSessionStart({ provider: "CASHFREE", sessionId: "vs_1", steps: [], expiresAt: "" })).toBe(true);
        expect(isSessionStart({ provider: "DIGIO", kycId: "k", accessToken: "t", validTill: "", sdkUrl: "https://digio" })).toBe(false);
        // An older server leaves `provider` out: that is Digio.
        expect(isSessionStart({ kycId: "k", accessToken: "t", validTill: "", sdkUrl: "https://digio" })).toBe(false);
    });
});

describe("the session's routes", () => {
    it("reads the caller's sessions and one session by id", async () => {
        mocked.get.mockResolvedValue({ sessions: [] });
        await verification.mySessions();
        await verification.session("vs/1");
        expect(mocked.get.mock.calls.map((call) => call[0])).toEqual(["/verification/sessions/mine", "/verification/sessions/vs%2F1"]);
    });

    it("posts each step to its own route with its own body", async () => {
        mocked.post.mockResolvedValue({ session: view() });
        await verification.openDigilocker("vs_1", "https://adx.in/verify/digilocker-return?session=vs_1");
        await verification.refreshDigilocker("vs_1");
        await verification.submitBank("vs_1", { accountNumber: "1234567890", ifsc: "HDFC0001234" });
        await verification.submitBusiness("vs_1", { pan: "ABCDE1234F", gstin: "22ABCDE1234F1Z5" });
        await verification.submitDrivingLicence("vs_1", { dlNumber: "KA0120201234567", dob: "1990-04-01" });
        await verification.submitVehicle("vs_1", { vehicleNumber: "KA01AB1234" });
        expect(mocked.post.mock.calls).toEqual([
            ["/verification/sessions/vs_1/digilocker", { redirectUrl: "https://adx.in/verify/digilocker-return?session=vs_1" }],
            ["/verification/sessions/vs_1/digilocker/refresh"],
            ["/verification/sessions/vs_1/bank", { accountNumber: "1234567890", ifsc: "HDFC0001234" }],
            ["/verification/sessions/vs_1/business", { pan: "ABCDE1234F", gstin: "22ABCDE1234F1Z5" }],
            ["/verification/sessions/vs_1/driving-licence", { dlNumber: "KA0120201234567", dob: "1990-04-01" }],
            ["/verification/sessions/vs_1/vehicle", { vehicleNumber: "KA01AB1234" }],
        ]);
    });

    it("sends the selfie as multipart under `file`", async () => {
        mocked.post.mockResolvedValue({ liveness: { status: "VERIFIED", failureCode: null }, faceMatch: null, session: view() });
        await verification.submitSelfie("vs_1", new Blob(["jpeg"], { type: "image/jpeg" }));
        const [path, body] = mocked.post.mock.calls[0]!;
        expect(path).toBe("/verification/sessions/vs_1/selfie");
        expect(body).toBeInstanceOf(FormData);
        const file = (body as FormData).get("file") as File;
        expect(file.type).toBe("image/jpeg");
        expect(file.name).toBe("selfie.jpg");
    });
});

describe("coming back later", () => {
    it("offers back the newest open session of this party's own KYC only", () => {
        const sessions = [view({ id: "a", caseType: "ADVERTISER_KYC" }), view({ id: "b", caseType: "PUBLISHER_KYC", status: "NEEDS_USER_ACTION" }), view({ id: "c", caseType: "PUBLISHER_KYC" })];
        expect(resumableSession(sessions, "PUBLISHER")?.id).toBe("b");
        expect(resumableSession(sessions, "ADVERTISER")?.id).toBe("a");
        expect(resumableSession(sessions, "PRINT_PARTNER")).toBeNull();
        expect(resumableSession([view({ status: "IN_REVIEW" })], "PUBLISHER")).toBeNull();
        expect(resumableSession(undefined, "PUBLISHER")).toBeNull();
    });
});

describe("the groups", () => {
    it("draws only the groups the session has, in the person's order", () => {
        const business = [step("PAN"), step("BANK_ACCOUNT"), step("NAME_MATCH"), step("PAPERS", { status: "REVIEW" }), step("GSTIN", { required: false }), step("DIGILOCKER"), step("FACE_LIVENESS"), step("FACE_MATCH")];
        expect(sessionGroups(business).map((group) => group.key)).toEqual(["DIGILOCKER", "SELFIE", "BUSINESS", "PAPERS", "BANK"]);
        expect(sessionGroups([step("VEHICLE_RC"), step("DRIVING_LICENCE")]).map((group) => group.key)).toEqual(["DRIVING_LICENCE", "VEHICLE"]);
    });

    it("is done only when every step passed; an optional GSTIN left alone does not hold the business back", () => {
        const [selfie] = sessionGroups([step("FACE_LIVENESS", { status: "VERIFIED" }), step("FACE_MATCH")]);
        expect(selfie!.state).toBe("open");
        const [both] = sessionGroups([step("FACE_LIVENESS", { status: "VERIFIED" }), step("FACE_MATCH", { status: "VERIFIED" })]);
        expect(both!.state).toBe("done");
        const [business] = sessionGroups([step("PAN", { status: "VERIFIED" }), step("GSTIN", { required: false })]);
        expect(business!.state).toBe("done");
        const [papers] = sessionGroups([step("PAPERS", { status: "REVIEW" })]);
        expect(papers!.state).toBe("review");
        const [waiting] = sessionGroups([step("DIGILOCKER", { status: "PENDING" })]);
        expect(waiting!.state).toBe("waiting");
    });

    it("carries a failure with its tries, and locks the group at none", () => {
        const [failed] = sessionGroups([step("BANK_ACCOUNT", { status: "VERIFIED" }), step("NAME_MATCH", { status: "FAILED", failureCode: "NAME_MISMATCH", triesLeft: 2 })]);
        expect(failed).toMatchObject({ state: "failed", triesLeft: 2, failed: { check: "NAME_MATCH" } });
        const [locked] = sessionGroups([step("FACE_LIVENESS", { status: "FAILED", failureCode: "NOT_LIVE", triesLeft: 0 }), step("FACE_MATCH")]);
        expect(locked!.state).toBe("locked");
    });

    it("finds the group the server's `needs` names", () => {
        expect(groupOfCheck("DIGILOCKER")).toBe("DIGILOCKER");
        expect(groupOfCheck("FACE_MATCH")).toBe("SELFIE");
        expect(groupOfCheck("PAN")).toBe("BUSINESS");
        expect(groupOfCheck("NAME_MATCH")).toBe("BANK");
    });
});

describe("the person's words", () => {
    it("says every named failure the same way on every surface", () => {
        expect(failureWords("DIGILOCKER", "CONSENT_DENIED")).toBe("DigiLocker access wasn't given. Try again and allow access to your Aadhaar and PAN.");
        for (const code of ["DIGILOCKER_EXPIRED", "CONSENT_REQUIRED", "DIGILOCKER_CONSENT_REQUIRED"]) expect(failureWords("DIGILOCKER", code)).toBe("Your DigiLocker access ran out. Open DigiLocker again to continue.");
        for (const code of ["AADHAAR_NOT_LINKED", "AADHAAR_UNAVAILABLE"]) expect(failureWords("DIGILOCKER", code)).toBe("We couldn't read your Aadhaar from DigiLocker. Make sure it's in your DigiLocker account, then try again.");
        expect(failureWords("FACE_LIVENESS", "NOT_LIVE")).toBe("We couldn't confirm a live photo. Take the selfie again in good light, facing the camera.");
        expect(failureWords("FACE_MATCH", "FACE_MISMATCH")).toBe("Your selfie doesn't match your Aadhaar photo. Try again without glasses or a cap.");
        expect(failureWords("NAME_MATCH", "NAME_MISMATCH")).toBe("The name on this account doesn't match the name on your ID.");
        expect(failureWords("NAME_MATCH", "NO_NAME_AT_BANK")).toBe("The bank didn't return a name for this account. Try another account.");
        expect(failureWords("GSTIN", "GSTIN_NOT_FOUND")).toBe("We couldn't find this GSTIN. Check it and try again.");
    });

    it("falls back per check, never to the raw code", () => {
        expect(failureWords("BANK_ACCOUNT", "ACCOUNT_CLOSED")).toBe("We couldn't verify this account. Check the account number and IFSC.");
        expect(failureWords("PAN", "INVALID_PAN")).toBe("We couldn't verify this PAN. Check it and try again.");
        expect(failureWords("DRIVING_LICENCE", "X")).toBe("We couldn't verify this licence. Check the number and date of birth.");
        expect(failureWords("VEHICLE_RC", "X")).toBe("We couldn't find this registration. Check the number and try again.");
        expect(failureWords("DIGILOCKER", null)).toBe("DigiLocker didn't finish. Try again.");
        expect(failureWords("FACE_MATCH", "LOW_SCORE")).toBe("We couldn't check your selfie. Take it again.");
        expect(failureWords("GSTIN", "WEIRD_CODE")).toBe("That didn't go through. Check the details and try again.");
        expect(failureWords("GSTIN", "WEIRD_CODE")).not.toContain("WEIRD_CODE");
    });

    it("counts the tries left", () => {
        expect(triesWords(2)).toBe("2 tries left");
        expect(triesWords(1)).toBe("1 try left");
    });

    it("keeps the contract's copy word for word", () => {
        expect(SESSION_COPY.title).toBe("Verify your identity");
        expect(SESSION_COPY.intro).toBe("A few quick checks and you're done. Keep your Aadhaar-linked phone handy.");
        expect(SESSION_COPY.unavailable).toBe("This check can't be made right now. Try again in a few minutes — this didn't count as a try.");
        expect(SESSION_COPY.digilockerReturnApp).toBe("All done in DigiLocker. Go back to the ADX app to continue.");
    });
});

describe("what went wrong", () => {
    it("reads each error the screen handles", () => {
        expect(sessionProblemOf(new ApiError(409, "VERIFICATION_STEP_NOT_OPEN", "Finish DigiLocker first", { check: "FACE_MATCH", needs: "DIGILOCKER" }))).toEqual({ kind: "out-of-order", check: "FACE_MATCH", needs: "DIGILOCKER" });
        expect(sessionProblemOf(new ApiError(409, "DIGILOCKER_CONSENT_REQUIRED", "run out", { check: "FACE_MATCH", needs: "DIGILOCKER" }))).toEqual({ kind: "digilocker-again" });
        expect(sessionProblemOf(new ApiError(409, "VERIFICATION_SESSION_CLOSED", "closed", { status: "EXPIRED" }))).toEqual({ kind: "closed", status: "EXPIRED" });
        expect(sessionProblemOf(new ApiError(503, "VERIFICATION_UNAVAILABLE", "later"))).toEqual({ kind: "unavailable" });
        expect(sessionProblemOf(new ApiError(404, "NOT_FOUND", "Verification session not found"))).toEqual({ kind: "gone" });
        expect(sessionProblemOf(new ApiError(400, "VALIDATION_ERROR", "A GSTIN is needed for this account.", { fieldErrors: { gstin: ["Required"] }, formErrors: [] }))).toEqual({ kind: "invalid", message: "A GSTIN is needed for this account." });
    });

    it("prints the backend's field sentence, not the schema's generic message", () => {
        expect(validationMessageOf(new ApiError(400, "VALIDATION_ERROR", "Invalid request", { fieldErrors: { ifsc: ["An IFSC is 4 letters, a zero and 6 characters"] }, formErrors: [] }))).toBe("An IFSC is 4 letters, a zero and 6 characters");
        expect(validationMessageOf(new ApiError(400, "VALIDATION_ERROR", "Invalid request", { fieldErrors: { redirectUrl: ["The address must start with https://"] } }))).toBe("The address must start with https://");
        expect(validationMessageOf(new ApiError(400, "VALIDATION_ERROR", "DigiLocker could not be opened with this request.", { check: "DIGILOCKER" }))).toBe("DigiLocker could not be opened with this request.");
        expect(validationMessageOf(new ApiError(400, "VALIDATION_ERROR", "Invalid request", {}))).toBe("Check the details and try again.");
    });
});

describe("the DigiLocker round trip", () => {
    it("comes back to the configured site, never the browser's own origin", () => {
        expect(digilockerReturnUrl("https://adx.in/", "vs_1")).toBe("https://adx.in/verify/digilocker-return?session=vs_1");
    });

    it("keeps the page to come back to, without a stale session in it", () => {
        expect(JSON.parse(digilockerReturnNote("vs_1", "/advertiser/verify", "?next=%2Fadvertiser%2Fcampaigns&session=old"))).toEqual({ sessionId: "vs_1", path: "/advertiser/verify?next=%2Fadvertiser%2Fcampaigns" });
    });

    it("goes back to the kept page with the session, else the account's verify page, never off the site", () => {
        const note = JSON.stringify({ sessionId: "vs_1", path: "/advertiser/verify?next=%2Fadvertiser%2Fcampaigns" });
        expect(digilockerBackHref(note, "vs_1", "ADVERTISER_KYC")).toBe("/advertiser/verify?next=%2Fadvertiser%2Fcampaigns&session=vs_1");
        // A note about another session, or none, falls back to the account's own page.
        expect(digilockerBackHref(note, "vs_2", "PRINT_PARTNER_KYC")).toBe("/partner/verify?session=vs_2");
        expect(digilockerBackHref(null, "vs_1", "PUBLISHER_KYC")).toBe("/publisher/profile/verify?session=vs_1");
        expect(digilockerBackHref(JSON.stringify({ sessionId: "vs_1", path: "//evil.example" }), "vs_1", "PUBLISHER_KYC")).toBe("/publisher/profile/verify?session=vs_1");
        expect(digilockerBackHref("not json", "vs_1", null)).toBeNull();
        expect(digilockerBackHref(null, "vs_1", "AGENT_KYC")).toBeNull();
    });
});

describe("the selfie's size", () => {
    it("scales the longest side down to 1280, never up", () => {
        expect(fitWithin(4000, 3000)).toEqual({ width: 1280, height: 960 });
        expect(fitWithin(1080, 1920)).toEqual({ width: 720, height: 1280 });
        expect(fitWithin(640, 480)).toEqual({ width: 640, height: 480 });
    });
});

describe("Digio off, the backup standing in", () => {
    it("offers the start while Digio is open or the backup stands in; missing backup is false", () => {
        const off = { available: false, provider: "MANUAL" as const, retryAfter: null };
        expect(identityStartOffered({ ...off, available: true, provider: "DIGIO" })).toBe(true);
        expect(identityStartOffered({ ...off, backup: true })).toBe(true);
        expect(identityStartOffered(off)).toBe(false);
        expect(identityStartOffered({ ...off, backup: false })).toBe(false);
        expect(identityStartOffered(null)).toBe(true);
        expect(backupStandsIn({ ...off, backup: true })).toBe(true);
        expect(backupStandsIn({ ...off, available: true, provider: "DIGIO", backup: true })).toBe(false);
        expect(backupStandsIn(off)).toBe(false);
        expect(digioUnavailableLine({ ...off, backup: true })).toBeNull();
        expect(digioUnavailableLine(off)).toBe("Digio is unavailable right now — upload your documents instead");
    });
});
