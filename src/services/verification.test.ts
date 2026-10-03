import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api-client", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-client")>();
    return { ...actual, api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() } };
});

import { api, ApiError } from "@/lib/api-client";
import {
    acceptFor,
    advertiserKycBody,
    advertiserStanding,
    advertiserTakesDocuments,
    baseMime,
    businessEntityTypes,
    canUpgradeEntity,
    captureReady,
    dateOfBirthProblem,
    digioFailureFrom,
    DIGIO_FAILURE_WORDS,
    digioStatusWords,
    digioUnavailableFrom,
    digioUnavailableLine,
    ENTITY_CHANGE_LINK,
    ENTITY_PICKER_BUTTON,
    ENTITY_PICKER_HEADING,
    ENTITY_PICKER_HELPER,
    ENTITY_UPGRADE_LINK,
    ENTITY_UPGRADE_WARNING,
    entityTypeRequiredFrom,
    fieldsFor,
    fileProblem,
    finalAnswers,
    formPatch,
    formProblems,
    ladderSteps,
    manifestPath,
    partialSummaryOf,
    partnerAcceptsDocuments,
    partnerKycBody,
    partnerLivenessWanted,
    partnerStanding,
    partnerTilesFor,
    PARTNER_TILES,
    profileAnswers,
    publisherStanding,
    recorderMime,
    requestedLine,
    resumeIndex,
    skippable,
    summaryOf,
    uploadPurposeFor,
    verification,
    visibleDocuments,
    type CaptureStep,
    type ManifestStep,
    type OnboardingManifest,
    type PartnerKycRecord,
} from "./verification";

const mocked = api as unknown as Record<"get" | "post" | "put" | "patch", ReturnType<typeof vi.fn>>;

beforeEach(() => {
    for (const fn of Object.values(mocked)) fn.mockReset();
});

/* ------------------------------------------------------------------ */
/* Fixtures, the shape the backend's code ladder answers               */
/* ------------------------------------------------------------------ */

const govFront: CaptureStep = {
    key: "gov-id-front",
    kind: "capture",
    title: "Government ID · Front",
    subtitle: "",
    documents: [
        { key: "aadhaar", label: "Aadhaar card", hint: "", field: "govIdFrontUrl", source: "library", sets: { field: "govIdType", value: "AADHAAR" } },
        { key: "passport", label: "Passport", hint: "", field: "govIdFrontUrl", source: "library", sets: { field: "govIdType", value: "PASSPORT" } },
    ],
    cta: "Use this photo",
};
const govBack: CaptureStep = {
    key: "gov-id-back",
    kind: "capture",
    title: "Government ID · Back",
    subtitle: "",
    documents: [
        { key: "aadhaar-back", label: "Aadhaar card", hint: "", field: "govIdBackUrl", source: "library", onlyWhen: { field: "govIdType", value: "AADHAAR" } },
        { key: "passport-back", label: "Passport", hint: "", field: "govIdBackUrl", source: "library", inert: true, onlyWhen: { field: "govIdType", value: "PASSPORT" } },
    ],
    skippableWhen: { field: "govIdType", value: "PASSPORT" },
    cta: "Use this photo",
};
const pan: CaptureStep = {
    key: "pan",
    kind: "capture",
    title: "PAN card",
    subtitle: "",
    text: { field: "panNumber", label: "PAN number", hint: "10-character alphanumeric", pattern: "^[A-Z]{5}[0-9]{4}[A-Z]$", maxLength: 10 },
    documents: [
        { key: "pan-photo", label: "Photograph", hint: "", field: "panFrontUrl", source: "library" },
        { key: "pan-signature", label: "Signature", hint: "", field: "panSignatureUrl", source: "library" },
    ],
    cta: "Use this photo",
};
const liveness: CaptureStep = {
    key: "liveness",
    kind: "capture",
    title: "Record a short video",
    subtitle: "",
    documents: [{ key: "liveness-video", label: "Your video", hint: "", field: "selfVideoUrl", source: "camera", front: true, video: true }],
    cta: "Record video",
};
const intro: ManifestStep = { key: "kyc-intro", kind: "kyc-intro", title: "Verify your identity", subtitle: "", bands: [], cta: "Start verification" };
const checklist: ManifestStep = { key: "checklist", kind: "checklist", title: "Review your KYC", subtitle: "", cta: "Submit for review" };
const details: ManifestStep = { key: "details", kind: "form", title: "Publisher details", subtitle: "" };
const business: ManifestStep = { key: "business", kind: "form", title: "Business information", subtitle: "" };
const contact: ManifestStep = { key: "contact", kind: "form", title: "Contact person", subtitle: "" };

const manifest = (over: Partial<OnboardingManifest> = {}): OnboardingManifest => ({
    party: "PUBLISHER",
    accountType: "BUSINESS",
    mode: "full",
    manifestVersion: 3,
    steps: [{ key: "account-type", kind: "account-type", title: "Account type" }, details, business, contact, intro, govFront, govBack, pan, liveness, checklist],
    ...over,
});

/* ------------------------------------------------------------------ */

describe("the routes", () => {
    it("reads the ladder for a side, pinned to a version when the climb has one", async () => {
        mocked.get.mockResolvedValue(manifest());
        await verification.manifest("ADVERTISER", 4);
        expect(mocked.get).toHaveBeenCalledWith("/users/me/onboarding-manifest?party=ADVERTISER&version=4");
        expect(manifestPath()).toBe("/users/me/onboarding-manifest");
        expect(manifestPath("PUBLISHER", 0)).toBe("/users/me/onboarding-manifest?party=PUBLISHER");
        expect(manifestPath(undefined, 2.5)).toBe("/users/me/onboarding-manifest");
    });

    it("starts and reads Digio on each side's own path", async () => {
        mocked.post.mockResolvedValue({ kycId: "k", accessToken: "t", validTill: "", sdkUrl: "https://digio" });
        mocked.get.mockResolvedValue({ method: "DIGIO", digioStatus: "pending", kycStatus: "PENDING", digioVerifiedAt: null });
        await verification.digioInitiate("PUBLISHER");
        await verification.digioInitiate("ADVERTISER");
        await verification.digioInitiate("PRINT_PARTNER");
        await verification.digioStatus("ADVERTISER");
        expect(mocked.post.mock.calls.map((call) => call[0])).toEqual(["/publishers/me/kyc/digio/initiate", "/advertiser-kyc/me/digio/initiate", "/print-partners/me/kyc/digio/initiate"]);
        expect(mocked.post.mock.calls[0]![1]).toEqual({ supports: ["CASHFREE"] });
        expect(mocked.get).toHaveBeenCalledWith("/advertiser-kyc/me/digio/status");
    });

    it("reads whether Digio is open for a print partner — off the record, or off the 404 before any (26 Sep 2026)", async () => {
        const digio = { available: false, provider: "MANUAL", retryAfter: 3600 };
        mocked.get.mockResolvedValueOnce({ id: "ppk_1", status: "PENDING", digio });
        await expect(verification.partnerKycWithDigio()).resolves.toMatchObject({ record: { id: "ppk_1" }, digio });
        mocked.get.mockRejectedValueOnce(new ApiError(404, "NOT_FOUND", "No KYC record yet", { digio: { available: true, provider: "DIGIO", retryAfter: null } }));
        await expect(verification.partnerKycWithDigio()).resolves.toEqual({ record: null, digio: { available: true, provider: "DIGIO", retryAfter: null } });
        mocked.get.mockRejectedValueOnce(new ApiError(404, "NOT_FOUND", "No KYC record yet"));
        await expect(verification.partnerKycWithDigio()).resolves.toEqual({ record: null, digio: null });
        mocked.get.mockRejectedValueOnce(new ApiError(503, "FEATURE_OFF", "off"));
        await expect(verification.partnerKycWithDigio()).rejects.toBeInstanceOf(ApiError);
    });

    it("reads a 404 on the advertiser's and the partner's row as no record yet, and throws anything else", async () => {
        mocked.get.mockRejectedValueOnce(new ApiError(404, "NOT_FOUND", "KYC not found"));
        await expect(verification.advertiserKyc()).resolves.toBeNull();
        mocked.get.mockRejectedValueOnce(new ApiError(404, "NOT_FOUND", "KYC not found"));
        await expect(verification.partnerKyc()).resolves.toBeNull();
        mocked.get.mockRejectedValueOnce(new ApiError(500, "BOOM", "no"));
        await expect(verification.advertiserKyc()).rejects.toBeInstanceOf(ApiError);
        expect(mocked.get).toHaveBeenCalledWith("/advertiser-kyc/me");
        expect(mocked.get).toHaveBeenCalledWith("/print-partners/me/kyc");
    });

    it("sends the advertiser's documents with PUT, the PAN photo under the row's own column", async () => {
        mocked.put.mockResolvedValue({ id: "a", status: "PENDING" });
        await verification.submitAdvertiserKyc({ govIdType: "AADHAAR", govIdFrontUrl: "https://f/1", panFrontUrl: "https://f/2", panNumber: "ABCDE1234F" }, 3);
        expect(mocked.put).toHaveBeenCalledWith("/advertiser-kyc/me", { govIdType: "AADHAAR", govIdFrontUrl: "https://f/1", panCardUrl: "https://f/2", panNumber: "ABCDE1234F", manifestVersion: 3 });
    });

    it("posts the publisher's documents, closes the onboarding, records the clip and saves the details", async () => {
        mocked.post.mockResolvedValue({});
        mocked.patch.mockResolvedValue({});
        await verification.submitPublisherKyc({ selfieUrl: "https://f/s" });
        await verification.completePublisherOnboarding();
        await verification.submitLiveness("file_9");
        await verification.submitPartnerKyc({ gstUrl: "https://f/g" });
        await verification.updatePublisherProfile({ name: "Asha" });
        expect(mocked.post.mock.calls).toEqual([
            ["/publishers/me/kyc", { selfieUrl: "https://f/s" }],
            ["/publishers/me/complete-onboarding"],
            ["/user-kyc/me", { fileId: "file_9" }],
            ["/print-partners/me/kyc", { gstUrl: "https://f/g" }],
        ]);
        expect(mocked.patch).toHaveBeenCalledWith("/publishers/me", { name: "Asha" });
    });

    it("uploads multipart with the private purpose", async () => {
        mocked.post.mockResolvedValue({ id: "f1", url: "https://api/files/f1" });
        const file = new File(["x"], "pan.jpg", { type: "image/jpeg" });
        await verification.upload(file, "ADVERTISER_KYC");
        const [path, form] = mocked.post.mock.calls[0]!;
        expect(path).toBe("/upload");
        expect(form).toBeInstanceOf(FormData);
        expect((form as FormData).get("purpose")).toBe("ADVERTISER_KYC");
        expect(((form as FormData).get("file") as File).name).toBe("pan.jpg");
    });
});

describe("the ladder", () => {
    it("never draws the account type, and gives the advertiser only the KYC steps", () => {
        expect(ladderSteps(manifest()).map((s) => s.key)).toEqual(["details", "business", "contact", "kyc-intro", "gov-id-front", "gov-id-back", "pan", "liveness", "checklist"]);
        expect(ladderSteps(manifest({ party: "ADVERTISER" })).map((s) => s.key)).toEqual(["gov-id-front", "gov-id-back", "pan", "liveness", "checklist"]);
    });

    it("draws the back tile the front chose, and lets a passport pass without a back", () => {
        expect(visibleDocuments(govBack, {}).map((d) => d.key)).toEqual([]);
        expect(visibleDocuments(govBack, { govIdType: "AADHAAR" }).map((d) => d.key)).toEqual(["aadhaar-back"]);
        expect(skippable(govBack, { govIdType: "PASSPORT" })).toBe(true);
        expect(skippable(govBack, { govIdType: "AADHAAR" })).toBe(false);
        expect(captureReady(govBack, { files: {}, kyc: { govIdType: "PASSPORT" }, text: "" })).toBe(true);
    });

    it("files each tile under the party's private purpose, the clip under USER_KYC", () => {
        expect(uploadPurposeFor({}, "PUBLISHER")).toBe("KYC");
        expect(uploadPurposeFor({}, "ADVERTISER")).toBe("ADVERTISER_KYC");
        expect(uploadPurposeFor({ video: true }, "ADVERTISER")).toBe("USER_KYC");
    });

    it("lets a capture step through only with its first column, a valid number and nothing uploading", () => {
        const done = { "pan-photo": { url: "https://f/p", busy: false } };
        expect(captureReady(pan, { files: done, kyc: {}, text: "abcde1234f" })).toBe(true);
        expect(captureReady(pan, { files: done, kyc: {}, text: "ABCDE1234" })).toBe(false);
        expect(captureReady(pan, { files: { "pan-signature": { url: "https://f/s" } }, kyc: {}, text: "ABCDE1234F" })).toBe(false);
        expect(captureReady(pan, { files: { ...done, "pan-signature": { busy: true } }, kyc: {}, text: "ABCDE1234F" })).toBe(false);
    });

    it("summarises the whole climb, and the flagged-only one step by step", () => {
        expect(summaryOf({ govIdType: "PASSPORT", panNumber: "ABCDE1234F", addressProofType: "BANK_STATEMENT" })).toEqual([
            { label: "Identity", value: "Passport · Uploaded" },
            { label: "Tax", value: "PAN ABCDE1234F · Uploaded" },
            { label: "Address", value: "Bank statement · Uploaded" },
            { label: "Match", value: "Selfie · Uploaded" },
        ]);
        expect(summaryOf({}, "")[1]).toEqual({ label: "Tax", value: "PAN " });
        const partial = manifest({
            mode: "partial",
            steps: [{ ...pan, documents: pan.documents.map((d, i) => (i === 0 ? { ...d, flagged: true } : d)) }, { ...liveness, documents: [{ ...liveness.documents[0]!, flagged: true }] }, checklist],
        });
        expect(partialSummaryOf(partial, { files: {}, livenessFileId: null })).toEqual([
            { label: "PAN card", value: "Still to retake" },
            { label: "Record a short video", value: "Still to retake" },
        ]);
        expect(partialSummaryOf(partial, { files: { "pan-photo": { url: "u" } }, livenessFileId: "clip" })).toEqual([
            { label: "PAN card", value: "Re-uploaded" },
            { label: "Record a short video", value: "Recorded" },
        ]);
    });

    it("drops a back taken for an ID later changed to a passport", () => {
        expect(finalAnswers({ govIdType: "PASSPORT", govIdBackUrl: "b", govIdFrontUrl: "f" })).toEqual({ govIdType: "PASSPORT", govIdFrontUrl: "f" });
        expect(finalAnswers({ govIdType: "AADHAAR", govIdBackUrl: "b" })).toEqual({ govIdType: "AADHAAR", govIdBackUrl: "b" });
    });

    it("resumes at the first form with a gap, else at the KYC intro, and the flagged ladder at its start", () => {
        const steps = ladderSteps(manifest());
        expect(resumeIndex(steps, "BUSINESS", {}, false)).toBe(0);
        const full = { name: "Asha Hoardings", dateOfBirth: "1990-04-12", gstin: "29ABCDE1234F1Z5", address: "MG Road", city: "Bengaluru", state: "Karnataka", contactName: "Asha", contactMobile: "9876543210" };
        expect(resumeIndex(steps, "BUSINESS", full, false)).toBe(3);
        expect(resumeIndex(steps, "BUSINESS", { ...full, contactMobile: "12345" }, false)).toBe(2);
        expect(resumeIndex(steps, "BUSINESS", {}, true)).toBe(0);
    });
});

describe("the form steps", () => {
    it("asks a person for their address and birthday, a business for its GSTIN", () => {
        expect(fieldsFor("details", "INDIVIDUAL").map((f) => f.key)).toEqual(["name", "email", "address", "city", "state", "postalCode", "dateOfBirth", "gender"]);
        expect(fieldsFor("details", "BUSINESS").map((f) => f.key)).toEqual(["name", "email", "dateOfBirth", "gender"]);
        expect(fieldsFor("business", "BUSINESS").find((f) => f.key === "gstin")?.required).toBe(true);
        expect(fieldsFor("business", "ORGANISATION").find((f) => f.key === "gstin")?.required).toBe(false);
        expect(fieldsFor("business", "BUSINESS").find((f) => f.key === "address")?.label).toBe("Registered address");
        /* Onboarding addresses (1 Oct 2026): the PIN rides with the address, optional, six digits never starting 0. */
        const pin = fieldsFor("business", "BUSINESS").find((f) => f.key === "postalCode");
        expect(pin?.required).toBeFalsy();
        expect(pin?.validate?.("560034")).toBeNull();
        expect(pin?.validate?.("060034")).toMatch(/six digits/);
    });

    it("says what is wrong with each field", () => {
        const specs = fieldsFor("contact", "BUSINESS");
        expect(formProblems(specs, { contactName: "", contactMobile: "5123456789", contactEmail: "nope" })).toEqual({
            contactName: "Needed to continue.",
            contactMobile: "Ten digits, starting 6 to 9.",
            contactEmail: "That does not look like an email address.",
        });
        expect(formProblems(fieldsFor("business", "BUSINESS"), { gstin: "29abcde1234f1z5", address: "a", city: "b", state: "c" })).toEqual({});
    });

    it("sends only what was typed, the GSTIN upper-cased", () => {
        expect(formPatch(fieldsFor("business", "ORGANISATION"), { gstin: " 29abcde1234f1z5 ", address: "MG Road", city: "", state: "KA" })).toEqual({ gstin: "29ABCDE1234F1Z5", address: "MG Road", state: "KA" });
    });

    it("keeps any real birthday up to today and back 120 years — under 18 lists too (29 Sep 2026)", () => {
        const now = new Date(2026, 8, 26, 10);
        expect(dateOfBirthProblem("2008-09-26", now)).toBeNull();
        expect(dateOfBirthProblem("2008-09-27", now)).toBeNull();
        expect(dateOfBirthProblem("2016-03-01", now)).toBeNull();
        expect(dateOfBirthProblem("2026-09-27", now)).toBe("That date is in the future.");
        expect(dateOfBirthProblem("1900-01-01", now)).toBe("That date is too long ago.");
        expect(dateOfBirthProblem("1990-02-30", now)).toBe("That is not a real date.");
        expect(dateOfBirthProblem("12/04/1990", now)).toBe("Pick your date of birth.");
        const today = new Date(2026, 8, 29, 9);
        expect(dateOfBirthProblem("2026-09-29", today)).toBeNull();
        expect(dateOfBirthProblem("2026-09-30", today)).toBe("That date is in the future.");
    });

    it("never needs the date of birth to save the details — a publisher lists without it (29 Sep 2026)", () => {
        const specs = fieldsFor("details", "INDIVIDUAL");
        expect(specs.find((f) => f.key === "dateOfBirth")?.required).toBeFalsy();
        expect(formProblems(specs, { name: "Asha", address: "MG Road", city: "Bengaluru", state: "Karnataka" })).toEqual({});
        expect(formProblems(fieldsFor("details", "BUSINESS"), { name: "Asha Hoardings", dateOfBirth: "2030-01-01" })).toEqual({ dateOfBirth: "That date is in the future." });
    });

    it("starts from the row's text facts, the birthday as a day", () => {
        expect(profileAnswers({ name: "Asha", dateOfBirth: "1990-04-12T00:00:00.000Z", gstin: null, latitude: 12.9 })).toEqual({ name: "Asha", dateOfBirth: "1990-04-12" });
        expect(profileAnswers(null)).toEqual({});
    });
});

describe("Digio", () => {
    it("tells the switch apart from a fault", () => {
        expect(digioUnavailableFrom(new ApiError(503, "KYC_PROVIDER_UNAVAILABLE", "off", { provider: "MANUAL", retryAfter: null }))).toEqual({ provider: "MANUAL", retryAfter: null });
        expect(digioUnavailableFrom(new ApiError(503, "KYC_PROVIDER_UNAVAILABLE", "off", { provider: "DEGRADED", retryAfter: 60 }))).toEqual({ provider: "DEGRADED", retryAfter: 60 });
        expect(digioUnavailableFrom(new ApiError(500, "BOOM", "no"))).toBeNull();
        expect(digioUnavailableFrom(new Error("x"))).toBeNull();
    });

    it("prints the unavailable line only while the branch is off", () => {
        expect(digioUnavailableLine(undefined)).toBeNull();
        expect(digioUnavailableLine({ available: true, provider: "DIGIO", retryAfter: null })).toBeNull();
        expect(digioUnavailableLine({ available: false, provider: "MANUAL", retryAfter: null })).toMatch(/upload your documents instead/);
    });

    it("words the wait", () => {
        expect(digioStatusWords(null, true)).toBe("Starting…");
        expect(digioStatusWords(null)).toBe("—");
        expect(digioStatusWords({ method: "DIGIO", digioStatus: "approval_pending", kycStatus: "PENDING", digioVerifiedAt: null })).toBe("Digio: approval_pending");
        expect(digioStatusWords({ method: "DIGIO", digioStatus: null, kycStatus: "VERIFIED", digioVerifiedAt: null })).toBe("Verified");
    });
});

/* Phase D (1 Oct 2026): the legal form an account verifies as, asked at the Digio start. */
describe("the entity type", () => {
    const options = [
        { value: "INDIVIDUAL", label: "Individual" },
        { value: "SOLE_PROPRIETOR", label: "Sole proprietor" },
        { value: "COMPANY", label: "Company" },
        { value: "LLP_PARTNERSHIP", label: "LLP or partnership" },
    ];

    it("reads what each side may verify as", async () => {
        mocked.get.mockResolvedValue({ PUBLISHER: options, ADVERTISER: options, PRINT_PARTNER: options });
        await expect(verification.entityTypes()).resolves.toMatchObject({ PRINT_PARTNER: options });
        expect(mocked.get).toHaveBeenCalledWith("/kyc/entity-types");
    });

    it("sends the chosen form in the body of each side's start, and nothing when none was chosen", async () => {
        mocked.post.mockResolvedValue({ kycId: "k", accessToken: "t", validTill: "", sdkUrl: "https://digio" });
        await verification.digioInitiate("PUBLISHER", "COMPANY");
        await verification.digioInitiate("ADVERTISER", "POLITICAL");
        await verification.digioInitiate("PRINT_PARTNER", "LLP_PARTNERSHIP");
        await verification.digioInitiate("ADVERTISER", null);
        await verification.digioInitiate("ADVERTISER");
        expect(mocked.post.mock.calls).toEqual([
            ["/publishers/me/kyc/digio/initiate", { entityType: "COMPANY", supports: ["CASHFREE"] }],
            ["/advertiser-kyc/me/digio/initiate", { entityType: "POLITICAL", supports: ["CASHFREE"] }],
            ["/print-partners/me/kyc/digio/initiate", { entityType: "LLP_PARTNERSHIP", supports: ["CASHFREE"] }],
            ["/advertiser-kyc/me/digio/initiate", { supports: ["CASHFREE"] }],
            ["/advertiser-kyc/me/digio/initiate", { supports: ["CASHFREE"] }],
        ]);
    });

    it("surfaces the party's own form off its read", async () => {
        mocked.get.mockResolvedValueOnce({ id: "pub_1", kycStatus: "PENDING", entityType: null, entityTypeStored: false });
        await expect(verification.publisherProfile()).resolves.toMatchObject({ entityType: null, entityTypeStored: false });
        mocked.get.mockResolvedValueOnce({ id: "adv_1", displayId: null, name: "Asha", kycStatus: "VERIFIED", entityType: "INDIVIDUAL", entityTypeStored: true });
        await expect(verification.advertiserMe()).resolves.toMatchObject({ entityType: "INDIVIDUAL", entityTypeStored: true });
        mocked.get.mockResolvedValueOnce({ ...manifest(), entityType: "COMPANY", entityTypeStored: true });
        await expect(verification.manifest("PUBLISHER")).resolves.toMatchObject({ entityType: "COMPANY" });
    });

    it("reads the 409 that asks for it, with the server's own options", () => {
        const asked = entityTypeRequiredFrom(new ApiError(409, "ENTITY_TYPE_REQUIRED", "Choose the account type", { party: "PRINT_PARTNER", options: [...options, { value: 7 }, null] }));
        expect(asked).toEqual({ party: "PRINT_PARTNER", options });
        expect(entityTypeRequiredFrom(new ApiError(409, "ENTITY_TYPE_REQUIRED", "Choose the account type"))).toEqual({ party: null, options: [] });
        expect(entityTypeRequiredFrom(new ApiError(409, "KYC_ALREADY_VERIFIED", "Already verified"))).toBeNull();
        expect(entityTypeRequiredFrom(new Error("x"))).toBeNull();
    });

    it("tells Digio failing at its own end from the switch, and words each the way the apps do", () => {
        const notAnswering = new ApiError(503, "KYC_PROVIDER_UNAVAILABLE", "Digio did not answer", { provider: "DIGIO", reason: "PROVIDER_ERROR" });
        const noTemplate = new ApiError(503, "KYC_PROVIDER_UNAVAILABLE", "No workflow", { provider: "DIGIO", reason: "NO_TEMPLATE" });
        const refused = new ApiError(502, "KYC_PROVIDER_REFUSED", "Digio refused", { provider: "DIGIO", status: 404, code: "TEMPLATE_NOT_FOUND" });
        const switchedOff = new ApiError(503, "KYC_PROVIDER_UNAVAILABLE", "off", { provider: "MANUAL", retryAfter: null });
        const degraded = new ApiError(503, "KYC_PROVIDER_UNAVAILABLE", "off", { provider: "DEGRADED", retryAfter: 60 });

        expect(digioFailureFrom(notAnswering)).toBe("NOT_ANSWERING");
        expect(digioFailureFrom(noTemplate)).toBe("NOT_AVAILABLE");
        expect(digioFailureFrom(refused)).toBe("NOT_AVAILABLE");
        expect(digioFailureFrom(switchedOff)).toBeNull();
        expect(digioFailureFrom(degraded)).toBeNull();
        expect(digioFailureFrom(new ApiError(500, "BOOM", "no"))).toBeNull();

        // The switch's own 503 still reads as the switch — and Digio's failures never do.
        expect(digioUnavailableFrom(switchedOff)).toEqual({ provider: "MANUAL", retryAfter: null });
        expect(digioUnavailableFrom(degraded)).toEqual({ provider: "DEGRADED", retryAfter: 60 });
        expect(digioUnavailableFrom(notAnswering)).toBeNull();
        expect(digioUnavailableFrom(noTemplate)).toBeNull();
        expect(digioUnavailableFrom(refused)).toBeNull();

        expect(DIGIO_FAILURE_WORDS.NOT_ANSWERING).toBe("Digio isn't answering right now. Try again in a few minutes.");
        expect(DIGIO_FAILURE_WORDS.NOT_AVAILABLE).toBe("Online verification isn't available for this account type yet. Please contact ADX support.");
    });

    it("keeps the picker's words the apps' own", () => {
        expect(ENTITY_PICKER_HEADING).toBe("Who is this account for?");
        expect(ENTITY_PICKER_HELPER).toBe("This decides which documents the check asks for. Pick the one your PAN is registered as.");
        expect(ENTITY_PICKER_BUTTON).toBe("Continue to verification");
        expect(ENTITY_UPGRADE_LINK).toBe("Registered a business? Verify it");
        expect(ENTITY_CHANGE_LINK).toBe("Picked the wrong account type? Change it");
        expect(ENTITY_UPGRADE_WARNING).toBe("Your account goes back to 'verification pending' until the business is verified.");
    });

    it("opens the upgrade door only to a verified Individual, and never offers Individual there", () => {
        expect(canUpgradeEntity("VERIFIED", "INDIVIDUAL")).toBe(true);
        expect(canUpgradeEntity("VERIFIED", "COMPANY")).toBe(false);
        expect(canUpgradeEntity("VERIFIED", null)).toBe(false);
        expect(canUpgradeEntity("VERIFIED", undefined)).toBe(false);
        expect(canUpgradeEntity("PENDING", "INDIVIDUAL")).toBe(false);
        expect(canUpgradeEntity(null, "INDIVIDUAL")).toBe(false);
        expect(businessEntityTypes(options as never).map((option) => option.value)).toEqual(["SOLE_PROPRIETOR", "COMPANY", "LLP_PARTNERSHIP"]);
    });
});

describe("where a record stands", () => {
    const now = new Date("2026-09-26T06:00:00.000Z");

    it("prints the desk's request with its channel, not over a verified record", () => {
        expect(requestedLine({ requestedAt: "2026-09-12T06:00:00.000Z", requestedChannel: "DIGIO" }, now)).toBe("Requested by ADX on 12 Sept · Digio");
        expect(requestedLine({ requestedAt: "2025-09-12T06:00:00.000Z", requestedChannel: "MANUAL" }, now)).toBe("Requested by ADX on 12 Sept 2025 · document upload");
        expect(requestedLine({ requestedAt: "2026-09-12T06:00:00.000Z", status: "VERIFIED" }, now)).toBeNull();
        expect(requestedLine({ requestedAt: null }, now)).toBeNull();
    });

    it("reads the advertiser's standing as the app's KYC gate does", () => {
        expect(advertiserStanding("VERIFIED", null, "done")).toBe("VERIFIED");
        expect(advertiserStanding("NEEDS_INFO", null, "done")).toBe("NEEDS_INFO");
        expect(advertiserStanding("PENDING", null, "done")).toBe("NOT_STARTED");
        expect(advertiserStanding("PENDING", null, "failed")).toBe("PENDING");
        const requested = { id: "k", status: "PENDING" as const, submittedAt: null, requestedAt: "2026-09-20T00:00:00Z" };
        expect(advertiserStanding("PENDING", requested, "done")).toBe("REQUESTED");
        expect(advertiserStanding("PENDING", { ...requested, submittedAt: "2026-09-21T00:00:00Z" }, "done")).toBe("PENDING");
        expect(advertiserTakesDocuments("PENDING")).toBe(false);
        expect(advertiserTakesDocuments("REJECTED")).toBe(true);
    });

    it("reads the publisher's standing off the account and the row", () => {
        expect(publisherStanding("PENDING", null).key).toBe("NOT_STARTED");
        expect(publisherStanding("PENDING", { id: "k", status: "PENDING", submittedAt: "2026-09-20T00:00:00Z", rejectionReason: null })).toMatchObject({ key: "PENDING", label: "In review" });
        expect(publisherStanding("PENDING", { id: "k", status: "NEEDS_INFO", submittedAt: "x", rejectionReason: null }).key).toBe("NEEDS_INFO");
        expect(publisherStanding("VERIFIED", null).key).toBe("VERIFIED");
    });
});

describe("the print partner", () => {
    const record = (over: Partial<PartnerKycRecord> = {}): PartnerKycRecord => ({
        id: "k",
        status: "PENDING",
        method: "MANUAL",
        panNumber: null,
        govIdType: null,
        digioStatus: null,
        digioVerifiedAt: null,
        submittedAt: null,
        reviewedAt: null,
        rejectionReason: null,
        reviewNote: null,
        requestedAt: null,
        flagged: [],
        liveness: null,
        ...over,
    });

    it("takes documents when there are none, when asked for or sent back — not while under review", () => {
        expect(partnerAcceptsDocuments(null)).toBe(true);
        expect(partnerAcceptsDocuments(record())).toBe(true);
        expect(partnerAcceptsDocuments(record({ submittedAt: "x" }))).toBe(false);
        expect(partnerAcceptsDocuments(record({ status: "NEEDS_INFO", submittedAt: "x" }))).toBe(true);
        expect(partnerAcceptsDocuments(record({ status: "VERIFIED", submittedAt: "x" }))).toBe(false);
    });

    it("draws only the flagged tiles while NEEDS_INFO", () => {
        expect(partnerTilesFor(null)).toHaveLength(PARTNER_TILES.length);
        expect(partnerTilesFor(record({ status: "NEEDS_INFO", flagged: [{ field: "gstUrl", note: "blurred" }] })).map((t) => t.key)).toEqual(["gst"]);
    });

    it("wants the clip on the manual path until one is in review or accepted", () => {
        expect(partnerLivenessWanted(null)).toBe(true);
        expect(partnerLivenessWanted(record({ method: "DIGIO" }))).toBe(false);
        expect(partnerLivenessWanted(record({ liveness: { id: "l", status: "PENDING" } }))).toBe(false);
        expect(partnerLivenessWanted(record({ liveness: { id: "l", status: "REJECTED" } }))).toBe(true);
    });

    it("reads its standing", () => {
        expect(partnerStanding(null)).toBe("NONE");
        expect(partnerStanding(record({ requestedAt: "x" }))).toBe("REQUESTED");
        expect(partnerStanding(record({ submittedAt: "x" }))).toBe("PENDING");
    });

    it("sends the tiles uploaded this visit, never a passport's back, the PAN only when valid", () => {
        const tiles = [...PARTNER_TILES];
        const body = partnerKycBody({ tiles, files: { pan: { url: "p" }, "gov-id-back": { url: "b" }, gst: { url: undefined } }, panNumber: "ABCDE1234F", govIdType: "PASSPORT" });
        expect(body).toEqual({ panFrontUrl: "p", panNumber: "ABCDE1234F", govIdType: "PASSPORT" });
        expect(partnerKycBody({ tiles, files: {}, panNumber: "ABC", govIdType: null })).toEqual({});
    });
});

describe("files and the webcam", () => {
    it("holds the server's types and ceilings", () => {
        expect(fileProblem({ type: "image/jpeg", size: 1000 }, {})).toBeNull();
        expect(fileProblem({ type: "application/pdf", size: 1000 }, {})).toBe("Use a JPG or PNG photo.");
        expect(fileProblem({ type: "application/pdf", size: 1000 }, { pdf: true })).toBeNull();
        expect(fileProblem({ type: "image/png", size: 11 * 1024 * 1024 }, {})).toMatch(/over 10MB/);
        // 26 Sep 2026: the liveness upload (USER_KYC) takes WebM, what a desktop webcam records.
        expect(fileProblem({ type: "video/webm;codecs=vp9", size: 1000 }, { video: true })).toBeNull();
        expect(fileProblem({ type: "video/x-matroska", size: 1000 }, { video: true })).toBe("ADX takes the video as MP4, MOV or WebM.");
        expect(fileProblem({ type: "video/mp4;codecs=avc1", size: 1000 }, { video: true })).toBeNull();
        expect(fileProblem({ type: "video/quicktime", size: 60 * 1024 * 1024 }, { video: true })).toMatch(/over 50MB/);
        expect(acceptFor({ video: true })).toBe("video/mp4,video/quicktime,video/webm");
        expect(acceptFor({ pdf: true })).toContain("application/pdf");
    });

    it("records MP4 when the browser can, WebM when it can only do that, and says no otherwise", () => {
        expect(recorderMime((mime) => mime === "video/mp4")).toBe("video/mp4");
        expect(recorderMime((mime) => mime.startsWith("video/mp4;codecs=avc1.42E01E"))).toBe("video/mp4;codecs=avc1.42E01E,mp4a.40.2");
        expect(recorderMime((mime) => mime.startsWith("video/mp4") || mime.startsWith("video/webm"))).toBe("video/mp4;codecs=avc1.42E01E,mp4a.40.2");
        expect(recorderMime((mime) => mime.startsWith("video/webm"))).toBe("video/webm;codecs=vp9,opus");
        expect(recorderMime((mime) => mime === "video/webm")).toBe("video/webm");
        expect(recorderMime((mime) => mime === "video/ogg")).toBeNull();
        expect(
            recorderMime(() => {
                throw new Error("no");
            })
        ).toBeNull();
        expect(baseMime("video/mp4;codecs=avc1")).toBe("video/mp4");
    });

    it("renames only the PAN photo for the advertiser, and pins a real version only", () => {
        expect(advertiserKycBody({ selfieUrl: "s" }, 0)).toEqual({ selfieUrl: "s" });
        expect(advertiserKycBody({ panFrontUrl: "p" }, null)).toEqual({ panCardUrl: "p" });
    });
});
