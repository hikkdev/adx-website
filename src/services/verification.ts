import { api, ApiError, messageOf } from "@/lib/api-client";
import { birthDateFault } from "@/services/party";

/**
 * Verification on the web — the same ladder, records and doors the ADX app
 * climbs (mobile `features/onboarding/*`, `features/advertiser/onboarding.tsx`,
 * `features/partner/profile/kyc-screen.tsx`), over the same routes:
 *
 * - the ladder as data: `GET /users/me/onboarding-manifest?party=&version=`;
 * - the publisher's row: `PATCH /publishers/me`, `GET|POST /publishers/me/kyc`,
 *   `POST /publishers/me/complete-onboarding`;
 * - the advertiser's row: `GET|PUT /advertiser-kyc/me` (404 before any record);
 * - the print partner's row: `GET|POST /print-partners/me/kyc`;
 * - Digio, per side: `…/digio/initiate`, `…/digio/status`;
 * - the legal forms a side may verify as: `GET /kyc/entity-types` (Phase D);
 * - the liveness clip: `POST /upload` (purpose USER_KYC) then `POST /user-kyc/me { fileId }`.
 *
 * KYC-D (the owner, 21 Sep 2026): Digio is offered first everywhere; the
 * uploads stay beside it as the last resort, never removed.
 */

export type LadderParty = "PUBLISHER" | "ADVERTISER";
/** Whose Digio session: the ladder's two parties, and the print shop. */
export type DigioSide = LadderParty | "PRINT_PARTNER";
export type AccountType = "INDIVIDUAL" | "BUSINESS" | "ORGANISATION";
export type KycStatus = "PENDING" | "VERIFIED" | "REJECTED" | "NEEDS_INFO";
export type GovIdType = "AADHAAR" | "PASSPORT" | "DRIVING_LICENCE";
export type AddressProofType = "UTILITY_BILL" | "RENT_AGREEMENT" | "BANK_STATEMENT";
export type KycUrlField = "govIdFrontUrl" | "govIdBackUrl" | "panFrontUrl" | "panSignatureUrl" | "addressProofUrl" | "selfieUrl" | "selfVideoUrl";
export type Tone = "success" | "warning" | "danger" | "info" | "neutral" | "ink";

/**
 * Phase D (the owner, 1 Oct 2026): the legal form an account verifies as. It
 * picks which Digio workflow runs, so it must be known before the check
 * starts — and it is asked there, never at sign-up.
 */
export type KycEntityType = "INDIVIDUAL" | "SOLE_PROPRIETOR" | "COMPANY" | "LLP_PARTNERSHIP" | "NON_PROFIT" | "GOVERNMENT_EDUCATION" | "OTHER_ENTITY" | "POLITICAL";

/** One row of the picker — the label is the server's own, never retyped here. */
export interface EntityTypeOption {
    value: KycEntityType;
    label: string;
}

/** `GET /kyc/entity-types` — what each side may verify as, in the order to draw it. */
export type EntityTypeOptions = Record<DigioSide, EntityTypeOption[]>;

/**
 * What a party's own read says about its legal form: `entityType` is the
 * effective one (stored, else read off the older account type, else null —
 * "ask when the check starts"); `entityTypeStored` says whether it was ever
 * answered. Absent on a server that predates Phase D.
 */
export interface EntityTypeFacts {
    entityType?: KycEntityType | null;
    entityTypeStored?: boolean;
}

/* ------------------------------------------------------------------ */
/* The manifest                                                        */
/* ------------------------------------------------------------------ */

export interface ManifestDocument {
    key: string;
    label: string;
    hint: string;
    field: KycUrlField;
    source: "library" | "camera";
    front?: boolean;
    sets?: { field: "govIdType"; value: GovIdType } | { field: "addressProofType"; value: AddressProofType };
    /** Drawn, not taken — the passport's back. */
    inert?: boolean;
    /** Drawn only while the which-kind column holds this value. */
    onlyWhen?: { field: "govIdType"; value: GovIdType };
    /** Also takes a PDF. */
    pdf?: boolean;
    /** A short clip rather than a photograph — the liveness step. */
    video?: boolean;
    /** Lot D (Q42): on the NEEDS_INFO ladder, the tile the desk asked for again and what it said. */
    flagged?: boolean;
    note?: string | null;
}

export type FormStepKey = "details" | "business" | "contact";

export type ManifestStep =
    | { key: "account-type"; kind: "account-type"; title: string }
    | { key: FormStepKey; kind: "form"; title: string; subtitle: string }
    | { key: "kyc-intro"; kind: "kyc-intro"; title: string; subtitle: string; bands: { label: string; value: string }[]; cta: string }
    | {
          key: string;
          kind: "capture";
          title: string;
          subtitle: string;
          documents: ManifestDocument[];
          text?: { field: "panNumber"; label: string; hint: string; pattern: string; maxLength: number };
          guidance?: { label: string; hint: string }[];
          skippableWhen?: { field: "govIdType"; value: GovIdType };
          cta: string;
      }
    | { key: string; kind: "checklist"; title: string; subtitle: string; cta: string };

export type CaptureStep = Extract<ManifestStep, { kind: "capture" }>;

export interface DigioAvailability {
    available: boolean;
    provider: "DIGIO" | "DEGRADED" | "MANUAL";
    retryAfter: number | null;
    /**
     * Cashfree Phase 2: ADX's own identity check stands in while Digio is off
     * — the backup switch is on, Secure ID has keys and its breaker is not
     * open. The party's own start then answers with a session. Missing is false.
     */
    backup?: boolean;
}

export interface OnboardingManifest extends EntityTypeFacts {
    party: LadderParty;
    accountType: AccountType;
    manifestVersion?: number;
    mode?: "full" | "partial";
    verification?: {
        digio: DigioAvailability;
        liveness: { required: true; status: KycStatus | null };
        kycStatus: KycStatus | null;
        reviewNote: string | null;
    };
    steps: ManifestStep[];
}

/** What the capture steps collect — the KYC row's self-service columns. */
export interface KycAnswers {
    govIdType?: GovIdType;
    govIdFrontUrl?: string;
    govIdBackUrl?: string;
    panNumber?: string;
    panFrontUrl?: string;
    panSignatureUrl?: string;
    addressProofType?: AddressProofType;
    addressProofUrl?: string;
    selfieUrl?: string;
}

/* ------------------------------------------------------------------ */
/* The records                                                         */
/* ------------------------------------------------------------------ */

/** The desk's request on a KYC row (Lot N-M) — the three rows carry the same stamps. */
export interface KycRequestStamp {
    requestedAt?: string | null;
    requestedChannel?: string | null;
    requestNote?: string | null;
    status?: string | null;
}

export interface PublisherKycRecord extends KycAnswers, KycRequestStamp {
    id: string;
    status: KycStatus;
    submittedAt: string | null;
    reviewedAt?: string | null;
    rejectionReason: string | null;
    reviewNote?: string | null;
}

/** `GET /advertiser-kyc/me` — 404 before any record or request. */
export interface AdvertiserKycRecord extends KycRequestStamp {
    id: string;
    status: KycStatus;
    method?: string;
    submittedAt: string | null;
    reviewedAt?: string | null;
    rejectionReason?: string | null;
    reviewNote?: string | null;
}

export interface LivenessRecord {
    id: string;
    status: KycStatus;
    submittedAt?: string | null;
    rejectionReason?: string | null;
    fileId?: string | null;
}

export type PartnerKycField = "panFrontUrl" | "panSignatureUrl" | "gstUrl" | "businessRegCertUrl" | "businessAddressProofUrl" | "directorIdUrl" | "govIdFrontUrl" | "govIdBackUrl" | "bankProofUrl" | "selfieUrl";

export type PartnerKycInput = Partial<Record<PartnerKycField, string>> & { panNumber?: string; govIdType?: GovIdType };

/** `GET /print-partners/me/kyc` — the record, the flagged tiles, the liveness state; 404 before any. */
export interface PartnerKycRecord extends Partial<Record<PartnerKycField, string | null>>, KycRequestStamp {
    id: string;
    status: KycStatus;
    method: "MANUAL" | "DIGIO" | string;
    panNumber: string | null;
    govIdType: GovIdType | null;
    digioStatus: string | null;
    digioVerifiedAt: string | null;
    submittedAt: string | null;
    reviewedAt: string | null;
    rejectionReason: string | null;
    reviewNote: string | null;
    flagged: { field: string; note: string | null }[];
    liveness: LivenessRecord | null;
    /** 26 Sep 2026: whether the Digio door is open — also carried on the 404 before any record (`details.digio`). */
    digio?: DigioAvailability;
    updatedAt?: string;
}

export interface DigioSession {
    kycId: string;
    accessToken: string;
    validTill: string;
    /** Digio's gateway page — the browser opens it; Digio answers ADX by webhook. */
    sdkUrl: string;
}

/**
 * Cashfree Phase 2 (1 Oct 2026): what a party's own start answers now that
 * the website says it can draw ADX's own identity check (`supports:
 * ['CASHFREE']`). Digio, as before — or, while Digio cannot be asked and
 * the owner has the backup on, a verification session to walk on ADX's own
 * screens. `provider` tells them apart; it is always there once `supports`
 * is sent (an older server leaves it out, and that is Digio).
 */
export type DigioStart = DigioSession & { provider?: "DIGIO" };
export interface SessionStart {
    provider: "CASHFREE";
    sessionId: string;
    steps: SessionStepView[];
    expiresAt: string;
}
export type KycStart = DigioStart | SessionStart;

/** What every website start says it can draw: ADX's own session screens. */
export const KYC_START_SUPPORTS = ["CASHFREE"] as const;

export const isSessionStart = (start: KycStart): start is SessionStart => start.provider === "CASHFREE" && typeof (start as SessionStart).sessionId === "string";

export type CheckKind = "DIGILOCKER" | "FACE_LIVENESS" | "FACE_MATCH" | "DRIVING_LICENCE" | "VEHICLE_RC" | "PAN" | "GSTIN" | "PAPERS" | "BANK_ACCOUNT" | "NAME_MATCH";
export type SessionStepStatus = "OPEN" | "PENDING" | "VERIFIED" | "FAILED" | "REVIEW";
export interface SessionStepView {
    check: CheckKind;
    required: boolean;
    status: SessionStepStatus;
    at: string | null;
    failureCode: string | null;
    /** 0–3: at 0 the step is spent and the session is FAILED. */
    triesLeft: number;
}
export type SessionCaseType = "PUBLISHER_KYC" | "ADVERTISER_KYC" | "AGENT_KYC" | "PRINT_PARTNER_KYC" | "EMPLOYEE_KYC" | "PAYOUT_METHOD" | "LISTING";
export type SessionStatus = "OPEN" | "NEEDS_USER_ACTION" | "IN_REVIEW" | "VERIFIED" | "FAILED" | "EXPIRED";
export interface SessionView {
    id: string;
    provider: "CASHFREE";
    caseType: SessionCaseType;
    caseId: string;
    workflowKey: string | null;
    status: SessionStatus;
    steps: SessionStepView[];
    expiresAt: string;
    createdAt: string;
    updatedAt: string;
}
export interface StepOutcome {
    status: "VERIFIED" | "FAILED" | "PENDING";
    failureCode: string | null;
    score?: number | null;
}
export interface DigilockerOpened {
    url: string;
    expiresAt: string | null;
    session: SessionView;
}
export interface DigilockerRefresh {
    status: SessionStepStatus;
    failureCode: string | null;
    name: string | null;
    documents: Partial<Record<"AADHAAR" | "PAN", { status: string | null; last4: string | null }>>;
    session: SessionView;
}
export interface SelfieAnswer {
    liveness: StepOutcome;
    faceMatch: StepOutcome | null;
    session: SessionView;
}
export interface BankAnswer {
    bank: StepOutcome & { bankName: string | null };
    nameMatch: StepOutcome | null;
    session: SessionView;
}
export interface BusinessAnswer {
    pan: StepOutcome & { registeredName: string | null };
    gstin: (StepOutcome & { legalName: string | null }) | null;
    session: SessionView;
}
/** The licence's and the vehicle's answers: the server names the outcome (`drivingLicence` / `vehicle`); the screen reads only `session`. */
export interface SingleCheckAnswer {
    session: SessionView;
}

export interface DigioStatus {
    method: string;
    digioStatus: string | null;
    kycStatus: KycStatus | string;
    digioVerifiedAt: string | null;
}

export interface UploadedFile {
    id: string;
    url: string;
}

export type UploadPurpose = "KYC" | "ADVERTISER_KYC" | "USER_KYC" | "PRINT_PARTNER_KYC";

/** What `PATCH /publishers/me` takes from the form steps. */
export type ProfilePatch = Partial<Record<"name" | "email" | "address" | "city" | "state" | "postalCode" | "gstin" | "contactName" | "contactMobile" | "contactEmail" | "dateOfBirth" | "gender", string>>;

/** The coordinates of the place picked in the "Find the address" bar — sent with the address, never shown (onboarding addresses, 1 Oct 2026). */
export interface ProfilePoint {
    latitude: number;
    longitude: number;
}

/* ------------------------------------------------------------------ */
/* Constants                                                           */
/* ------------------------------------------------------------------ */

/** The words the intro and the Digio panel print while the branch is off. */
export const DIGIO_UNAVAILABLE = "Digio is unavailable right now — upload your documents instead";
/** The 503 the Digio routes answer while the switch is off; `details.provider` says DEGRADED or MANUAL. */
export const KYC_PROVIDER_UNAVAILABLE = "KYC_PROVIDER_UNAVAILABLE";
/** The 409 a Digio start answers when the account's legal form is unknown and none was sent; `details.options` is the list to ask from. */
export const ENTITY_TYPE_REQUIRED = "ENTITY_TYPE_REQUIRED";
/** The 502 a Digio start answers when Digio itself said no — a workflow it does not know. */
export const KYC_PROVIDER_REFUSED = "KYC_PROVIDER_REFUSED";

/*
 * Phase D's words — the same on the website and in the apps (the owner: no
 * difference between how the two flows work), so they are kept here, once.
 */
export const ENTITY_PICKER_HEADING = "Who is this account for?";
export const ENTITY_PICKER_HELPER = "This decides which documents the check asks for. Pick the one your PAN is registered as.";
export const ENTITY_PICKER_BUTTON = "Continue to verification";
/** The quiet link a verified individual sees — the way to verify a business registered since. */
export const ENTITY_UPGRADE_LINK = "Registered a business? Verify it";
export const ENTITY_UPGRADE_WARNING = "Your account goes back to 'verification pending' until the business is verified.";
/** 2 Oct 2026: the quiet link beside a check that was started (or could not start) on an unverified account — the way to correct a wrong choice. */
export const ENTITY_CHANGE_LINK = "Picked the wrong account type? Change it";
/** The 409 a Digio start answers on an account that is already verified. */
export const KYC_ALREADY_VERIFIED = "KYC_ALREADY_VERIFIED";
export const DIGIO_NOT_ANSWERING = "Digio isn't answering right now. Try again in a few minutes.";
export const DIGIO_NOT_AVAILABLE = "Online verification isn't available for this account type yet. Please contact ADX support.";

/** How often a waiting page asks ADX whether Digio has answered. */
export const DIGIO_POLL_MS = 4000;
/** The liveness clip's ceiling, as the app's camera holds it. */
export const LIVENESS_MAX_SECONDS = 15;
export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_VIDEO_BYTES = 50 * 1024 * 1024;

const DIGIO_PATH: Record<DigioSide, string> = {
    PUBLISHER: "/publishers/me/kyc/digio",
    ADVERTISER: "/advertiser-kyc/me/digio",
    PRINT_PARTNER: "/print-partners/me/kyc/digio",
};

const SESSION_PATH = "/verification/sessions";

/** A 404 is "no record yet", not a failure. */
const notFoundIsNull = <T>(caught: unknown): T | null => {
    if (caught instanceof ApiError && caught.status === 404) return null;
    throw caught;
};

/* ------------------------------------------------------------------ */
/* The service                                                         */
/* ------------------------------------------------------------------ */

export const verification = {
    /** The ladder for a side; `version` is the pin a climb stored on its first read. */
    manifest: (party?: LadderParty, version?: number | null) => api.get<OnboardingManifest>(manifestPath(party, version)),

    publisherProfile: () => api.get<Record<string, unknown> & EntityTypeFacts & { id: string; kycStatus?: string; onboardingStatus?: string; platformAgreementAcceptedAt?: string | null }>("/publishers/me"),
    updatePublisherProfile: (patch: ProfilePatch & Partial<ProfilePoint>) => api.patch<Record<string, unknown>>("/publishers/me", patch),
    publisherKyc: () => api.get<PublisherKycRecord | null>("/publishers/me/kyc"),
    submitPublisherKyc: (answers: KycAnswers & { manifestVersion?: number }) => api.post<PublisherKycRecord>("/publishers/me/kyc", answers),
    completePublisherOnboarding: () => api.post<{ message?: string; onboardingStatus?: string }>("/publishers/me/complete-onboarding"),

    advertiserMe: () => api.get<EntityTypeFacts & { id: string; displayId: string | null; name: string; kycStatus: KycStatus | string }>("/advertisers/me"),
    advertiserKyc: () => api.get<AdvertiserKycRecord>("/advertiser-kyc/me").catch(notFoundIsNull<AdvertiserKycRecord>),
    /** Partial while NEEDS_INFO: only the tiles retaken. */
    submitAdvertiserKyc: (answers: KycAnswers, manifestVersion?: number | null) => api.put<{ id: string; status: KycStatus }>("/advertiser-kyc/me", advertiserKycBody(answers, manifestVersion)),

    partnerKyc: () => api.get<PartnerKycRecord>("/print-partners/me/kyc").catch(notFoundIsNull<PartnerKycRecord>),
    /** The record (null before any) and whether Digio is open — read off the record, or off the 404's `details.digio`. */
    partnerKycWithDigio: async (): Promise<{ record: PartnerKycRecord | null; digio: DigioAvailability | null }> => {
        try {
            const record = await api.get<PartnerKycRecord>("/print-partners/me/kyc");
            return { record, digio: record.digio ?? null };
        } catch (caught) {
            if (caught instanceof ApiError && caught.status === 404) {
                const digio = (caught.details as { digio?: DigioAvailability } | undefined)?.digio ?? null;
                return { record: null, digio };
            }
            throw caught;
        }
    },
    submitPartnerKyc: (body: PartnerKycInput) => api.post<PartnerKycRecord>("/print-partners/me/kyc", body),

    /** Phase D: what each side may verify as — the picker's rows, labels and all. */
    entityTypes: () => api.get<EntityTypeOptions>("/kyc/entity-types"),
    /**
     * Starts the Digio check. `entityType` goes in the body only when the
     * person has just chosen it: the server stores it, then asks Digio on
     * that workflow (for a verified individual, that is the upgrade to a
     * business). With none sent and none on file it answers 409
     * ENTITY_TYPE_REQUIRED — read with `entityTypeRequiredFrom`.
     *
     * Cashfree Phase 2: every start says `supports: ['CASHFREE']`, so the
     * answer may be ADX's own session instead of Digio (`isSessionStart`).
     */
    digioInitiate: (side: DigioSide, entityType?: KycEntityType | null) => api.post<KycStart>(`${DIGIO_PATH[side]}/initiate`, entityType ? { entityType, supports: [...KYC_START_SUPPORTS] } : { supports: [...KYC_START_SUPPORTS] }),
    digioStatus: (side: DigioSide) => api.get<DigioStatus>(`${DIGIO_PATH[side]}/status`),

    /*
     * Cashfree Phase 2 — the verification session, the person's own (someone
     * else's is a 404). Every step answers with the session as it now stands.
     */
    /** The caller's sessions still open (OPEN / NEEDS_USER_ACTION), newest first. */
    mySessions: () => api.get<{ sessions: SessionView[] }>("/verification/sessions/mine"),
    session: (id: string) => api.get<SessionView>(`${SESSION_PATH}/${encodeURIComponent(id)}`),
    /** `redirectUrl` must start with https:// — the backend refuses anything else. */
    openDigilocker: (id: string, redirectUrl: string) => api.post<DigilockerOpened>(`${SESSION_PATH}/${encodeURIComponent(id)}/digilocker`, { redirectUrl }),
    refreshDigilocker: (id: string) => api.post<DigilockerRefresh>(`${SESSION_PATH}/${encodeURIComponent(id)}/digilocker/refresh`),
    /** The selfie, multipart under `file` — JPEG or PNG, at most 5 MB. Nothing is kept by ADX. */
    submitSelfie: (id: string, photo: Blob) => {
        const form = new FormData();
        form.append("file", photo, "selfie.jpg");
        return api.post<SelfieAnswer>(`${SESSION_PATH}/${encodeURIComponent(id)}/selfie`, form);
    },
    submitBank: (id: string, body: { accountNumber: string; ifsc: string }) => api.post<BankAnswer>(`${SESSION_PATH}/${encodeURIComponent(id)}/bank`, body),
    submitBusiness: (id: string, body: { pan: string; gstin?: string }) => api.post<BusinessAnswer>(`${SESSION_PATH}/${encodeURIComponent(id)}/business`, body),
    submitDrivingLicence: (id: string, body: { dlNumber: string; dob: string }) => api.post<SingleCheckAnswer>(`${SESSION_PATH}/${encodeURIComponent(id)}/driving-licence`, body),
    submitVehicle: (id: string, body: { vehicleNumber: string }) => api.post<SingleCheckAnswer>(`${SESSION_PATH}/${encodeURIComponent(id)}/vehicle`, body),

    /** Lot D (Q131): the clip onto the caller's own UserKyc row, by the id the upload minted. */
    submitLiveness: (fileId: string) => api.post<LivenessRecord>("/user-kyc/me", { fileId }),

    /** `POST /upload` — multipart, the file under `file`, the private purpose beside it. */
    upload: (file: File, purpose: UploadPurpose) => {
        const form = new FormData();
        form.append("file", file, file.name);
        form.append("purpose", purpose);
        return api.post<UploadedFile>("/upload", form);
    },
};

/* ------------------------------------------------------------------ */
/* The ladder, as the app reads it                                     */
/* ------------------------------------------------------------------ */

/** The manifest's path: the side when named, the pinned version when the climb has one. */
export function manifestPath(party?: LadderParty, version?: number | null): string {
    const query: string[] = [];
    if (party) query.push(`party=${party}`);
    if (typeof version === "number" && Number.isInteger(version) && version > 0) query.push(`version=${version}`);
    return query.length ? `/users/me/onboarding-manifest?${query.join("&")}` : "/users/me/onboarding-manifest";
}

/** Whether the manifest is the flagged-only ladder (Lot D, Q42). */
export const isPartialManifest = (manifest: Pick<OnboardingManifest, "mode">): boolean => manifest.mode === "partial";

/**
 * The rungs the web draws. Step 1 (the account type) was answered at
 * sign-up and is never drawn. The advertiser's own details are their
 * billing profile, kept on Account settings, so their climb here is the KYC
 * part alone — from the first capture step, the verification page itself
 * being the intro.
 */
export function ladderSteps(manifest: OnboardingManifest): ManifestStep[] {
    const steps = manifest.steps.filter((step) => step.kind !== "account-type");
    if (manifest.party !== "ADVERTISER") return steps;
    return steps.filter((step) => step.kind === "capture" || step.kind === "checklist");
}

/** The tiles to draw: every tile with no condition, and the conditioned ones whose column holds their value. */
export function visibleDocuments(step: Pick<CaptureStep, "documents">, kyc: KycAnswers): ManifestDocument[] {
    return step.documents.filter((doc) => !doc.onlyWhen || kyc[doc.onlyWhen.field] === doc.onlyWhen.value);
}

/** Whether the step may be passed with no file — a passport's back. */
export function skippable(step: Pick<CaptureStep, "skippableWhen">, kyc: KycAnswers): boolean {
    return Boolean(step.skippableWhen && kyc[step.skippableWhen.field] === step.skippableWhen.value);
}

/** The private purpose a tile's file goes up under: the party's KYC purpose, or the liveness one for a clip. */
export function uploadPurposeFor(doc: Pick<ManifestDocument, "video">, party: LadderParty): UploadPurpose {
    if (doc.video) return "USER_KYC";
    return party === "ADVERTISER" ? "ADVERTISER_KYC" : "KYC";
}

/** Whether a capture step holds the liveness clip. */
export const isVideoStep = (step: Pick<CaptureStep, "documents">): boolean => step.documents.some((doc) => doc.video);

/**
 * What a capture step lets through: the required column (its first tile's)
 * holds a file — or the step is skippable — the typed number matches, and
 * nothing is still uploading.
 */
export function captureReady(step: CaptureStep, state: { files: Record<string, { url?: string; busy?: boolean }>; kyc: KycAnswers; text: string }): boolean {
    const textValid = !step.text || new RegExp(step.text.pattern).test(state.text.toUpperCase());
    const required = step.documents[0]?.field;
    const uploaded = step.documents.some((doc) => doc.field === required && state.files[doc.key]?.url);
    const busy = Object.values(state.files).some((entry) => entry.busy);
    return (uploaded || skippable(step, state.kyc)) && textValid && !busy;
}

const ID_LABEL: Record<string, string> = { AADHAAR: "Aadhaar", PASSPORT: "Passport", DRIVING_LICENCE: "Driving licence" };
const ADDRESS_LABEL: Record<string, string> = { UTILITY_BILL: "Utility bill", RENT_AGREEMENT: "Rent agreement", BANK_STATEMENT: "Bank statement" };

/** What the review step prints about the answers (the app's `summaryOf`). */
export function summaryOf(kyc: KycAnswers, suffix = " · Uploaded"): { label: string; value: string }[] {
    return [
        { label: "Identity", value: `${ID_LABEL[kyc.govIdType ?? ""] ?? "Government ID"}${suffix}` },
        { label: "Tax", value: `PAN ${kyc.panNumber ?? ""}${suffix}`.replace("PAN  ", "PAN ") },
        { label: "Address", value: `${ADDRESS_LABEL[kyc.addressProofType ?? ""] ?? "Address proof"}${suffix}` },
        { label: "Match", value: `Selfie${suffix}` },
    ];
}

/**
 * What the review step posts: the answers collected this visit, less a
 * back taken for an ID that was then changed to a passport (a passport has
 * no back, and the column would otherwise carry the old document's).
 */
export function finalAnswers(kyc: KycAnswers): KycAnswers {
    if (kyc.govIdType !== "PASSPORT" || !kyc.govIdBackUrl) return { ...kyc };
    const { govIdBackUrl: _dropped, ...rest } = kyc;
    return rest;
}

/** The flagged-only review: one row per step asked for again, and whether it was retaken this visit. */
export function partialSummaryOf(manifest: OnboardingManifest, state: { files: Record<string, { url?: string }>; livenessFileId: string | null }): { label: string; value: string }[] {
    const rows: { label: string; value: string }[] = [];
    for (const step of manifest.steps) {
        if (step.kind !== "capture") continue;
        const flagged = step.documents.filter((doc) => doc.flagged);
        if (flagged.length === 0) continue;
        const video = flagged.some((doc) => doc.video);
        const done = video ? Boolean(state.livenessFileId) : flagged.some((doc) => state.files[doc.key]?.url);
        rows.push({ label: step.title, value: done ? (video ? "Recorded" : "Re-uploaded") : "Still to retake" });
    }
    return rows;
}

/** The sentence under the intro's buttons while Digio is off, or null while it is on — or while the backup stands in for it. */
export function digioUnavailableLine(digio: DigioAvailability | null | undefined): string | null {
    if (!digio || digio.available || digio.backup === true) return null;
    return DIGIO_UNAVAILABLE;
}

/** Whether the party's own start is offered: Digio is open, or (Cashfree Phase 2) the backup stands in. An unread availability offers it, as before. */
export const identityStartOffered = (digio: DigioAvailability | null | undefined): boolean => !digio || digio.available || digio.backup === true;

/** Digio is off and the backup stands in: the start is offered without naming Digio ("Verify your identity"). */
export const backupStandsIn = (digio: DigioAvailability | null | undefined): boolean => Boolean(digio && !digio.available && digio.backup === true);

/**
 * Whether a Digio failure is the switch rather than a fault — and what the
 * 503 said about coming back. Phase D: the same code also answers when Digio
 * itself fails mid-request (`details.provider: 'DIGIO'`, with a `reason`);
 * that is not the switch, and `digioFailureFrom` reads it.
 */
export function digioUnavailableFrom(caught: unknown): { provider?: "DEGRADED" | "MANUAL"; retryAfter: number | null } | null {
    if (!(caught instanceof ApiError) || caught.code !== KYC_PROVIDER_UNAVAILABLE) return null;
    const details = (caught.details ?? {}) as { provider?: string; reason?: unknown; retryAfter?: number | null };
    if (details.provider === "DIGIO" || details.reason === "PROVIDER_ERROR" || details.reason === "NO_TEMPLATE") return null;
    return { provider: details.provider as "DEGRADED" | "MANUAL" | undefined, retryAfter: details.retryAfter ?? null };
}

/** How a Digio start failed at Digio: it did not answer, or it has no check for this kind of account. */
export type DigioFailure = "NOT_ANSWERING" | "NOT_AVAILABLE";

/**
 * Phase D — a start that reached Digio and failed there, or null for any
 * other failure: 503 KYC_PROVIDER_UNAVAILABLE `reason: PROVIDER_ERROR` (a
 * timeout, the network, a 5xx, a 429) is Digio not answering; `reason:
 * NO_TEMPLATE` and 502 KYC_PROVIDER_REFUSED are Digio having no workflow for
 * the account's legal form.
 */
export function digioFailureFrom(caught: unknown): DigioFailure | null {
    if (!(caught instanceof ApiError)) return null;
    if (caught.code === KYC_PROVIDER_REFUSED) return "NOT_AVAILABLE";
    if (caught.code !== KYC_PROVIDER_UNAVAILABLE) return null;
    const reason = (caught.details as { reason?: unknown } | undefined)?.reason;
    if (reason === "PROVIDER_ERROR") return "NOT_ANSWERING";
    if (reason === "NO_TEMPLATE") return "NOT_AVAILABLE";
    return null;
}

/** The sentence each Digio failure prints — the apps' own. */
export const DIGIO_FAILURE_WORDS: Record<DigioFailure, string> = { NOT_ANSWERING: DIGIO_NOT_ANSWERING, NOT_AVAILABLE: DIGIO_NOT_AVAILABLE };

const isEntityTypeOption = (item: unknown): item is EntityTypeOption => typeof (item as EntityTypeOption | null)?.value === "string" && typeof (item as EntityTypeOption | null)?.label === "string";

/**
 * Phase D — the 409 a Digio start answers when the account's legal form is
 * unknown and none was sent: the options to ask from, as the server listed
 * them (empty when it listed none), or null for any other failure. Nothing
 * was stored or sent to Digio; the start is repeated with the choice.
 */
export function entityTypeRequiredFrom(caught: unknown): { party: DigioSide | null; options: EntityTypeOption[] } | null {
    if (!(caught instanceof ApiError) || caught.code !== ENTITY_TYPE_REQUIRED) return null;
    const details = (caught.details ?? {}) as { party?: unknown; options?: unknown };
    const party = details.party === "PUBLISHER" || details.party === "ADVERTISER" || details.party === "PRINT_PARTNER" ? details.party : null;
    return { party, options: Array.isArray(details.options) ? details.options.filter(isEntityTypeOption) : [] };
}

/** The picker's rows for the upgrade door: every form but the one already verified. */
export const businessEntityTypes = (options: EntityTypeOption[]): EntityTypeOption[] => options.filter((option) => option.value !== "INDIVIDUAL");

/** Whether the upgrade door is drawn: only a VERIFIED account whose legal form is Individual. */
export const canUpgradeEntity = (kycStatus: string | null | undefined, entityType: KycEntityType | null | undefined): boolean => kycStatus === "VERIFIED" && entityType === "INDIVIDUAL";

/** The status line of a Digio wait. */
export function digioStatusWords(status: DigioStatus | null, starting = false): string {
    if (starting) return "Starting…";
    if (!status) return "—";
    if (status.kycStatus === "VERIFIED") return "Verified";
    if (status.kycStatus === "REJECTED") return "Rejected";
    return status.digioStatus ? `Digio: ${status.digioStatus}` : "Pending";
}

/**
 * The advertiser's body for `PUT /advertiser-kyc/me`. The manifest names
 * the PAN photo `panFrontUrl` on both sides, but the advertiser's row keeps
 * it as `panCardUrl` (the schema's own note: "panFrontUrl→panCardUrl") and
 * the server drops a key it does not know — so it is renamed here.
 */
export function advertiserKycBody(answers: KycAnswers, manifestVersion?: number | null): Record<string, unknown> {
    const { panFrontUrl, ...rest } = answers;
    return {
        ...rest,
        ...(panFrontUrl ? { panCardUrl: panFrontUrl } : {}),
        ...(typeof manifestVersion === "number" && manifestVersion > 0 ? { manifestVersion } : {}),
    };
}

/* ------------------------------------------------------------------ */
/* The form steps (the app's `fieldsFor`)                              */
/* ------------------------------------------------------------------ */

export interface FieldSpec {
    key: keyof ProfilePatch;
    kind: "text" | "email" | "tel" | "dob" | "gender";
    label: string;
    placeholder?: string;
    required?: boolean;
    uppercase?: boolean;
    /** Digits only, as typed — the PIN. */
    numeric?: boolean;
    maxLength?: number;
    autoComplete?: string;
    validate?: (value: string) => string | null;
}

const GSTIN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const MOBILE = /^[6-9]\d{9}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const GENDER_OPTIONS = [
    { id: "MALE", title: "Male" },
    { id: "FEMALE", title: "Female" },
    { id: "OTHER", title: "Other" },
    { id: "PREFER_NOT_TO_SAY", title: "Prefer not to say" },
] as const;

/**
 * Null when the date is a real day, not in the future and at most 120 years
 * ago — the one calendar rule (`birthDateFault`); else the sentence to print.
 * Any age lists (29 Sep 2026): 18 or over is asked only to place an order.
 */
export function dateOfBirthProblem(iso: string, now: Date = new Date()): string | null {
    const fault = birthDateFault(iso, now);
    if (fault === "format") return "Pick your date of birth.";
    if (fault === "not-a-day") return "That is not a real date.";
    if (fault === "future") return "That date is in the future.";
    if (fault === "too-old") return "That date is too long ago.";
    return null;
}

/** The PIN as the backend takes it: six digits, never starting 0. */
const PIN = /^[1-9][0-9]{5}$/;

/**
 * The address group — drawn under the "Find the address" bar (the owner,
 * 1 Oct 2026): the line full width, City | State, then the PIN beside the
 * step's next field, or alone, half width, on the left.
 */
const ADDRESS: FieldSpec[] = [
    { key: "address", kind: "text", label: "Address", placeholder: "Building, street, area", required: true, autoComplete: "street-address" },
    { key: "city", kind: "text", label: "City", required: true, autoComplete: "address-level2" },
    { key: "state", kind: "text", label: "State", required: true, autoComplete: "address-level1" },
    { key: "postalCode", kind: "text", label: "PIN code", placeholder: "Six digits — 560001", maxLength: 6, numeric: true, autoComplete: "postal-code", validate: (v) => (v && !PIN.test(v) ? "A PIN code is six digits, like 560001." : null) },
];
/** 29 Sep 2026: the date of birth is optional — a publisher lists and finishes onboarding without it; an order asks it. */
const PERSON: FieldSpec[] = [
    { key: "dateOfBirth", kind: "dob", label: "Date of birth", validate: (v) => (v ? dateOfBirthProblem(v) : null) },
    { key: "gender", kind: "gender", label: "Gender (optional)" },
];

/** The fields of a form step, by step and account type — the same list the app asks. */
export function fieldsFor(step: FormStepKey, accountType: AccountType): FieldSpec[] {
    const person = accountType === "INDIVIDUAL";
    switch (step) {
        case "details":
            return [
                { key: "name", kind: "text", label: person ? "Full name, as on your ID" : "Registered name, as on your documents", required: true, autoComplete: person ? "name" : "organization" },
                { key: "email", kind: "email", label: "Email", autoComplete: "email", validate: (v) => (v && !EMAIL.test(v) ? "That does not look like an email address." : null) },
                ...(person ? [...ADDRESS, ...PERSON] : PERSON),
            ];
        case "business":
            return [
                {
                    key: "gstin",
                    kind: "text",
                    label: accountType === "BUSINESS" ? "GSTIN, as printed on your GST certificate" : "GSTIN, if registered for GST",
                    placeholder: "22AAAAA0000A1Z5",
                    required: accountType === "BUSINESS",
                    uppercase: true,
                    maxLength: 15,
                    validate: (v) => (v && !GSTIN.test(v.toUpperCase()) ? "A GSTIN is 15 characters, like 22AAAAA0000A1Z5." : null),
                },
                ...ADDRESS.map((field) => (field.key === "address" ? { ...field, label: "Registered address" } : field)),
            ];
        case "contact":
            return [
                { key: "contactName", kind: "text", label: "Contact person", required: true, autoComplete: "name" },
                { key: "contactMobile", kind: "tel", label: "Their mobile number", placeholder: "9876543210", required: true, maxLength: 10, autoComplete: "tel-national", validate: (v) => (v && !MOBILE.test(v) ? "Ten digits, starting 6 to 9." : null) },
                { key: "contactEmail", kind: "email", label: "Their email", autoComplete: "email", validate: (v) => (v && !EMAIL.test(v) ? "That does not look like an email address." : null) },
            ];
    }
}

/** Each field's problem, keyed by field; empty when the step may be saved. */
export function formProblems(specs: FieldSpec[], values: Record<string, string>): Record<string, string> {
    const found: Record<string, string> = {};
    for (const spec of specs) {
        const value = (values[spec.key] ?? "").trim();
        if (spec.required && !value) found[spec.key] = "Needed to continue.";
        else if (spec.validate) {
            const message = spec.validate(value);
            if (message) found[spec.key] = message;
        }
    }
    return found;
}

/** Only what was typed goes up; an empty optional field is left alone, a GSTIN upper-cased. */
export function formPatch(specs: FieldSpec[], values: Record<string, string>): ProfilePatch {
    const patch: ProfilePatch = {};
    for (const spec of specs) {
        const value = (values[spec.key] ?? "").trim();
        if (value) patch[spec.key] = spec.uppercase ? value.toUpperCase() : value;
    }
    return patch;
}

/** The profile's answers, as text, for the form steps to start from. */
export function profileAnswers(profile: Record<string, unknown> | null | undefined): Record<string, string> {
    const known: Record<string, string> = {};
    if (!profile) return known;
    for (const key of ["name", "email", "address", "city", "state", "postalCode", "dateOfBirth", "gender", "gstin", "contactName", "contactMobile", "contactEmail"]) {
        const value = profile[key];
        if (typeof value === "string" && value) known[key] = key === "dateOfBirth" ? value.slice(0, 10) : value;
    }
    return known;
}

/**
 * Where a publisher's climb resumes: the first form step with a required
 * field still empty, else the KYC intro — so someone whose details are on
 * file lands on the choice between Digio and the uploads. The flagged-only
 * ladder starts at its first rung.
 */
export function resumeIndex(steps: ManifestStep[], accountType: AccountType, answers: Record<string, string>, partial: boolean): number {
    if (partial) return 0;
    for (let index = 0; index < steps.length; index += 1) {
        const step = steps[index]!;
        if (step.kind === "form") {
            const problems = formProblems(fieldsFor(step.key, accountType), answers);
            if (Object.keys(problems).length > 0) return index;
            continue;
        }
        return index;
    }
    return 0;
}

/* ------------------------------------------------------------------ */
/* Where a record stands                                               */
/* ------------------------------------------------------------------ */

const CHANNEL: Record<string, string> = { DIGIO: "Digio", MANUAL: "document upload" };

/** "12 Sep" this year, "12 Sep 2025" otherwise — in India's time. */
export function shortDay(iso: string | null | undefined, now: Date = new Date()): string {
    if (!iso) return "—";
    const at = new Date(iso);
    if (Number.isNaN(at.getTime())) return "—";
    const year = (d: Date) => Number(new Intl.DateTimeFormat("en-IN", { year: "numeric", timeZone: "Asia/Kolkata" }).format(d));
    const sameYear = year(at) === year(now);
    return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", ...(sameYear ? {} : { year: "numeric" }), timeZone: "Asia/Kolkata" }).format(at);
}

/** "Requested by ADX on 12 Sep · Digio", or null when the desk never asked (or the record is through). */
export function requestedLine(record: KycRequestStamp | null | undefined, now: Date = new Date()): string | null {
    if (!record?.requestedAt || record.status === "VERIFIED") return null;
    const at = new Date(record.requestedAt);
    if (Number.isNaN(at.getTime())) return null;
    const channel = record.requestedChannel ? (CHANNEL[record.requestedChannel] ?? null) : null;
    return `Requested by ADX on ${shortDay(record.requestedAt, now)}${channel ? ` · ${channel}` : ""}`;
}

export type AdvertiserStanding = "VERIFIED" | "REJECTED" | "NEEDS_INFO" | "REQUESTED" | "NOT_STARTED" | "PENDING";

/**
 * Where the advertiser's KYC stands (the app's `KycGate`): the account's
 * mirror, read against the row. A request with nothing submitted reads
 * "Requested by ADX"; a fresh account with nothing sent reads "Not
 * started" — but only once the row has been read, never on a failed read.
 */
export function advertiserStanding(accountStatus: string | null | undefined, record: AdvertiserKycRecord | null, read: "done" | "failed"): AdvertiserStanding {
    if (accountStatus === "VERIFIED") return "VERIFIED";
    if (accountStatus === "REJECTED") return "REJECTED";
    if (accountStatus === "NEEDS_INFO") return "NEEDS_INFO";
    if (record?.requestedAt && !record.submittedAt) return "REQUESTED";
    if (read === "done" && !record?.submittedAt && (accountStatus ?? "PENDING") === "PENDING") return "NOT_STARTED";
    return "PENDING";
}

export const ADVERTISER_STANDING: Record<AdvertiserStanding, { label: string; tone: Tone }> = {
    VERIFIED: { label: "Verified", tone: "success" },
    REJECTED: { label: "Rejected", tone: "danger" },
    NEEDS_INFO: { label: "Needs a re-upload", tone: "warning" },
    REQUESTED: { label: "Requested by ADX", tone: "warning" },
    NOT_STARTED: { label: "Not started", tone: "neutral" },
    PENDING: { label: "Awaiting review", tone: "warning" },
};

/** The sentence under the advertiser's status. */
export function advertiserStandingWords(standing: AdvertiserStanding, record: AdvertiserKycRecord | null): string {
    switch (standing) {
        case "VERIFIED":
            return "Your identity is verified. A campaign you pay for goes live on its start date.";
        case "REJECTED":
            return `Something in your documents did not check out${record?.rejectionReason ? `: ${record.rejectionReason}` : ""}. Verify with Digio, or send your documents again.`;
        case "NEEDS_INFO":
            return "ADX could not accept some of your documents. Send the flagged ones again — everything else is kept, and the review picks up where it left off.";
        case "REQUESTED":
            return record?.requestedChannel === "DIGIO"
                ? "ADX has started a Digio identity check for you. Digio has sent you a link — finish the check there, or open it from here."
                : "ADX has asked you to complete your identity verification. Verify with Digio here, or upload your documents.";
        case "NOT_STARTED":
            return "Nothing has been sent for review yet. Verify with Digio here — it takes a few minutes — or upload your documents instead.";
        case "PENDING":
            return "Your documents are with ADX. You will get a notification the moment this clears — you do not need to keep this page open.";
    }
}

/** Whether the advertiser may send documents from the web right now: not while a submission is under review, not once verified. */
export const advertiserTakesDocuments = (standing: AdvertiserStanding): boolean => standing === "NOT_STARTED" || standing === "REQUESTED" || standing === "REJECTED";

/** The publisher's status chip, with "Not started" for a row that has never been submitted. */
export function publisherStanding(status: string | null | undefined, record: PublisherKycRecord | null): { key: AdvertiserStanding; label: string; tone: Tone } {
    let key: AdvertiserStanding;
    if (status === "VERIFIED" || record?.status === "VERIFIED") key = "VERIFIED";
    else if (record?.status === "NEEDS_INFO" || status === "NEEDS_INFO") key = "NEEDS_INFO";
    else if (record?.status === "REJECTED" || status === "REJECTED") key = "REJECTED";
    else if (record?.requestedAt && !record.submittedAt) key = "REQUESTED";
    else if (!record?.submittedAt) key = "NOT_STARTED";
    else key = "PENDING";
    const words = ADVERTISER_STANDING[key];
    return { key, label: key === "PENDING" ? "In review" : words.label, tone: words.tone };
}

/* ------------------------------------------------------------------ */
/* The print partner (the app's `kyc-screen.tsx`)                      */
/* ------------------------------------------------------------------ */

export interface PartnerTile {
    key: string;
    field: PartnerKycField;
    label: string;
    hint: string;
    /** Also takes a PDF — a certificate, a statement. */
    pdf?: boolean;
    /** Taken now, with the camera — on the web the webcam, or a photo from the computer. */
    camera?: boolean;
}

/** The ten tiles, in the order the desk's workbench lists the columns. */
export const PARTNER_TILES: readonly PartnerTile[] = [
    { key: "pan", field: "panFrontUrl", label: "PAN card", hint: "The shop’s PAN, or the proprietor’s" },
    { key: "pan-signature", field: "panSignatureUrl", label: "PAN signature", hint: "The signature as it is on the PAN" },
    { key: "gst", field: "gstUrl", label: "GST certificate", hint: "Registration certificate, PDF or photo", pdf: true },
    { key: "business-reg", field: "businessRegCertUrl", label: "Business registration", hint: "Shop & establishment, Udyam, or incorporation", pdf: true },
    { key: "business-address", field: "businessAddressProofUrl", label: "Business address proof", hint: "Utility bill, rent agreement or bank statement", pdf: true },
    { key: "director-id", field: "directorIdUrl", label: "Director’s ID", hint: "The signing director’s or proprietor’s ID" },
    { key: "gov-id-front", field: "govIdFrontUrl", label: "Government ID · front", hint: "Aadhaar, passport or driving licence" },
    { key: "gov-id-back", field: "govIdBackUrl", label: "Government ID · back", hint: "The back of the same document" },
    { key: "bank-proof", field: "bankProofUrl", label: "Bank proof", hint: "Cancelled cheque or a statement header", pdf: true },
    { key: "selfie", field: "selfieUrl", label: "Selfie", hint: "Straight on, in good light", camera: true },
];

export const PAN_PATTERN = /^[A-Z]{5}[0-9]{4}[A-Z]$/;

/** Whether the partner's record takes documents now: none yet, asked for, sent back, or refused. */
export function partnerAcceptsDocuments(record: PartnerKycRecord | null): boolean {
    if (!record) return true;
    if (record.status === "NEEDS_INFO" || record.status === "REJECTED") return true;
    return record.status === "PENDING" && !record.submittedAt;
}

/** All ten tiles, or — while NEEDS_INFO — only the flagged ones. */
export function partnerTilesFor(record: PartnerKycRecord | null): PartnerTile[] {
    if (record?.status !== "NEEDS_INFO") return [...PARTNER_TILES];
    const flagged = new Set(record.flagged.map((item) => item.field));
    return PARTNER_TILES.filter((tile) => flagged.has(tile.field));
}

/** Whether the liveness clip is still wanted: the manual path, not verified, and no clip under review or accepted. */
export function partnerLivenessWanted(record: PartnerKycRecord | null): boolean {
    if (record?.method === "DIGIO" || record?.status === "VERIFIED") return false;
    const liveness = record?.liveness ?? null;
    return !liveness || liveness.status === "REJECTED";
}

export type PartnerStanding = "NONE" | "REQUESTED" | KycStatus;

export function partnerStanding(record: Pick<PartnerKycRecord, "status" | "submittedAt" | "requestedAt"> | null): PartnerStanding {
    if (!record) return "NONE";
    if (record.status === "PENDING" && !record.submittedAt) return record.requestedAt ? "REQUESTED" : "NONE";
    return record.status;
}

export const PARTNER_STANDING: Record<PartnerStanding, { label: string; tone: Tone }> = {
    NONE: { label: "Not started", tone: "neutral" },
    REQUESTED: { label: "Requested by ADX", tone: "warning" },
    PENDING: { label: "Under review", tone: "warning" },
    VERIFIED: { label: "Verified", tone: "success" },
    REJECTED: { label: "Rejected", tone: "danger" },
    NEEDS_INFO: { label: "Needs info", tone: "danger" },
};

export function partnerStandingWords(standing: PartnerStanding, record: PartnerKycRecord | null): string {
    switch (standing) {
        case "NONE":
            return "ADX has not received the shop’s KYC yet. Verify with Digio, or upload the documents below.";
        case "REQUESTED":
            return record?.requestedChannel === "DIGIO" ? "ADX has asked for the shop’s KYC and started a Digio check for you." : "ADX has asked for the shop’s KYC. Verify with Digio, or upload the documents below.";
        case "PENDING":
            return record?.method === "DIGIO" && record.digioStatus && record.digioStatus !== "approved" ? "Digio is checking; this page updates as soon as ADX hears back." : "Your documents are with ADX. Usually reviewed within a day.";
        case "VERIFIED":
            return "The shop is verified.";
        case "NEEDS_INFO":
            return "ADX could not accept some of your documents. Send the flagged ones again — everything else is kept.";
        case "REJECTED":
            return "ADX could not verify the shop from what was sent. You can send the documents again, or verify with Digio.";
    }
}

/** What goes up: the tiles uploaded this visit (never a passport's back), the PAN number and the id type where their tiles are drawn. */
export function partnerKycBody(input: { tiles: PartnerTile[]; files: Record<string, { url?: string } | undefined>; panNumber: string; govIdType: GovIdType | null }): PartnerKycInput {
    const out: PartnerKycInput = {};
    for (const tile of input.tiles) {
        const url = input.files[tile.key]?.url;
        if (!url) continue;
        if (tile.key === "gov-id-back" && input.govIdType === "PASSPORT") continue;
        out[tile.field] = url;
    }
    const panShown = input.tiles.some((tile) => tile.key === "pan");
    if (panShown && input.panNumber && PAN_PATTERN.test(input.panNumber)) out.panNumber = input.panNumber;
    const govShown = input.tiles.some((tile) => tile.key === "gov-id-front" || tile.key === "gov-id-back");
    if (govShown && input.govIdType) out.govIdType = input.govIdType;
    return out;
}

/* ------------------------------------------------------------------ */
/* Files and the webcam                                                */
/* ------------------------------------------------------------------ */

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic"];
/** The liveness clip (purpose USER_KYC): MP4, MOV, and — 26 Sep 2026 — WebM, what a desktop browser's webcam records. */
const VIDEO_TYPES = ["video/mp4", "video/quicktime", "video/webm"];

/** The `accept` attribute for a tile. */
export function acceptFor(kind: { video?: boolean; pdf?: boolean }): string {
    if (kind.video) return VIDEO_TYPES.join(",");
    return kind.pdf ? [...IMAGE_TYPES, "application/pdf"].join(",") : IMAGE_TYPES.join(",");
}

/** What is wrong with a picked file before it goes up — the server's own two ceilings and its type list — or null. */
export function fileProblem(file: { type: string; size: number }, kind: { video?: boolean; pdf?: boolean }): string | null {
    const type = baseMime(file.type);
    if (kind.video) {
        if (!VIDEO_TYPES.includes(type)) return "ADX takes the video as MP4, MOV or WebM.";
        if (file.size > MAX_VIDEO_BYTES) return "The video is over 50MB. Keep it to fifteen seconds.";
        return null;
    }
    const allowed = kind.pdf ? [...IMAGE_TYPES, "application/pdf"] : IMAGE_TYPES;
    if (!allowed.includes(type)) return kind.pdf ? "Use a JPG, PNG or PDF." : "Use a JPG or PNG photo.";
    if (file.size > MAX_FILE_BYTES) return "The file is over 10MB. Use a smaller photo or scan.";
    return null;
}

/** "video/mp4;codecs=avc1" → "video/mp4": what the upload's type check compares. */
export const baseMime = (mime: string): string => mime.split(";")[0]!.trim().toLowerCase();

/**
 * The recording format for the webcam clip: an MP4 the browser can write,
 * else (26 Sep 2026, the upload takes WebM for the liveness clip) a WebM,
 * or null when the browser can record neither.
 */
export function recorderMime(isTypeSupported: (mime: string) => boolean): string | null {
    for (const mime of ["video/mp4;codecs=avc1.42E01E,mp4a.40.2", "video/mp4;codecs=avc1", "video/mp4", "video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"]) {
        try {
            if (isTypeSupported(mime)) return mime;
        } catch {
            /* an engine that throws on the question cannot record it */
        }
    }
    return null;
}

/* ------------------------------------------------------------------ */
/* Cashfree Phase 2 — ADX's own identity check                         */
/* ------------------------------------------------------------------ */

/*
 * The words — identical on the website and in the apps (the owner: no
 * difference), so they are kept here, once. The person never hears the
 * word "Cashfree": to them this is ADX's own identity check.
 */
export const SESSION_COPY = {
    title: "Verify your identity",
    intro: "A few quick checks and you're done. Keep your Aadhaar-linked phone handy.",
    resumeTitle: "Finish your identity check",
    resumeText: "You started this earlier. Pick up where you left off.",
    resumeButton: "Continue",
    digilocker: "Aadhaar and PAN from DigiLocker",
    digilockerButton: "Open DigiLocker",
    digilockerHint: "You'll sign in to DigiLocker and allow ADX to read your Aadhaar and PAN. We keep only your name and the last four digits.",
    digilockerWaiting: "Waiting for DigiLocker…",
    digilockerFinished: "I've finished in DigiLocker",
    digilockerAgain: "Your DigiLocker access ran out. Open DigiLocker again to continue.",
    digilockerReturnApp: "All done in DigiLocker. Go back to the ADX app to continue.",
    selfie: "A selfie",
    selfieButton: "Take a selfie",
    selfieHint: "Face the camera in good light. No glasses, cap or mask. We don't keep the photo.",
    licence: "Driving licence",
    licenceNumber: "Licence number",
    licenceDob: "Date of birth",
    licenceButton: "Check licence",
    vehicle: "Vehicle",
    vehicleNumber: "Registration number (e.g. KA01AB1234)",
    vehicleButton: "Check vehicle",
    business: "Business PAN and GSTIN",
    businessPan: "Business PAN",
    businessGstin: "GSTIN",
    businessGstinOptional: "GSTIN (optional)",
    businessButton: "Check",
    papers: "Business papers",
    papersText: "Our team reviews these.",
    papersLink: "Upload papers",
    bank: "Bank account",
    bankAccount: "Account number",
    bankIfsc: "IFSC",
    bankButton: "Check account",
    bankHint: "The account must be in your name (or your business's name).",
    unavailable: "This check can't be made right now. Try again in a few minutes — this didn't count as a try.",
    doneVerified: "You're verified. Thanks — you're all set.",
    doneReview: "Checks passed. Our team is reviewing your business papers and will let you know.",
    doneFailed: "We couldn't verify you automatically. Our team will take a look — you can also upload your documents instead.",
    doneFailedButton: "Upload documents",
    doneExpired: "This check timed out.",
    doneExpiredButton: "Start again",
    stepDone: "Done",
} as const;

/** "{n} tries left / 1 try left". */
export const triesWords = (n: number): string => (n === 1 ? "1 try left" : `${n} tries left`);

/** Each party's KYC case, as a session names it. */
export const SESSION_CASE_TYPE: Record<DigioSide, SessionCaseType> = { PUBLISHER: "PUBLISHER_KYC", ADVERTISER: "ADVERTISER_KYC", PRINT_PARTNER: "PRINT_PARTNER_KYC" };

/** Each party's verify page on the website, by the session's case — where a DigiLocker return falls back to. */
export const VERIFY_PAGE_BY_CASE: Partial<Record<SessionCaseType, string>> = {
    PUBLISHER_KYC: "/publisher/profile/verify",
    ADVERTISER_KYC: "/advertiser/verify",
    PRINT_PARTNER_KYC: "/partner/verify",
};

/** The newest still-open session of this party's KYC, or null — what the resume card offers. */
export function resumableSession(sessions: readonly SessionView[] | null | undefined, side: DigioSide): SessionView | null {
    const caseType = SESSION_CASE_TYPE[side];
    return (sessions ?? []).find((session) => session.caseType === caseType && sessionIsOpen(session.status)) ?? null;
}

/** A group of steps as the person sees it: one action, in this order. */
export type SessionGroupKey = "DIGILOCKER" | "SELFIE" | "DRIVING_LICENCE" | "VEHICLE" | "BUSINESS" | "PAPERS" | "BANK";

const GROUP_STEPS: { key: SessionGroupKey; checks: CheckKind[] }[] = [
    { key: "DIGILOCKER", checks: ["DIGILOCKER"] },
    { key: "SELFIE", checks: ["FACE_LIVENESS", "FACE_MATCH"] },
    { key: "DRIVING_LICENCE", checks: ["DRIVING_LICENCE"] },
    { key: "VEHICLE", checks: ["VEHICLE_RC"] },
    { key: "BUSINESS", checks: ["PAN", "GSTIN"] },
    { key: "PAPERS", checks: ["PAPERS"] },
    { key: "BANK", checks: ["BANK_ACCOUNT", "NAME_MATCH"] },
];

/** open: to be taken · waiting: DigiLocker is with the person · failed: a "no" with tries left · locked: no tries left · done · review: the papers. */
export type SessionGroupState = "open" | "waiting" | "failed" | "locked" | "done" | "review";

export interface SessionGroup {
    key: SessionGroupKey;
    steps: SessionStepView[];
    state: SessionGroupState;
    /** The failed step the group's words are about, when it has one. */
    failed: SessionStepView | null;
    /** The fewest tries a failed step of the group has left, or null when none failed. */
    triesLeft: number | null;
}

/**
 * The groups a session draws — only those whose steps it has, in the
 * person's order. Done when every required step passed (an optional GSTIN
 * left untouched never holds the business group back); PAPERS is always
 * "review"; a failed step with no tries left locks its group.
 */
export function sessionGroups(steps: readonly SessionStepView[]): SessionGroup[] {
    const groups: SessionGroup[] = [];
    for (const { key, checks } of GROUP_STEPS) {
        const mine = steps.filter((step) => checks.includes(step.check));
        if (mine.length === 0) continue;
        const failures = mine.filter((step) => step.status === "FAILED");
        const failed = failures[0] ?? null;
        const triesLeft = failed ? Math.min(...failures.map((step) => step.triesLeft)) : null;
        const counted = mine.filter((step) => step.required || step.status !== "OPEN");
        let state: SessionGroupState;
        if (key === "PAPERS") state = "review";
        else if (failed && triesLeft === 0) state = "locked";
        else if (failed) state = "failed";
        else if ((counted.length > 0 ? counted : mine).every((step) => step.status === "VERIFIED")) state = "done";
        else if (mine.some((step) => step.status === "PENDING")) state = "waiting";
        else state = "open";
        groups.push({ key, steps: mine, state, failed, triesLeft });
    }
    return groups;
}

/** Whether the session may still be acted on. */
export const sessionIsOpen = (status: SessionStatus): boolean => status === "OPEN" || status === "NEEDS_USER_ACTION";

const DIGILOCKER_RAN_OUT = new Set(["DIGILOCKER_EXPIRED", "CONSENT_REQUIRED", "DIGILOCKER_CONSENT_REQUIRED"]);

/** A failure code in the person's words — identical on every surface; never the raw code. */
export function failureWords(check: CheckKind, code: string | null | undefined): string {
    switch (code) {
        case "CONSENT_DENIED":
            return "DigiLocker access wasn't given. Try again and allow access to your Aadhaar and PAN.";
        case "AADHAAR_NOT_LINKED":
        case "AADHAAR_UNAVAILABLE":
            return "We couldn't read your Aadhaar from DigiLocker. Make sure it's in your DigiLocker account, then try again.";
        case "NOT_LIVE":
            return "We couldn't confirm a live photo. Take the selfie again in good light, facing the camera.";
        case "FACE_MISMATCH":
            return "Your selfie doesn't match your Aadhaar photo. Try again without glasses or a cap.";
        case "NAME_MISMATCH":
            return "The name on this account doesn't match the name on your ID.";
        case "NO_NAME_AT_BANK":
            return "The bank didn't return a name for this account. Try another account.";
        case "GSTIN_NOT_FOUND":
            return "We couldn't find this GSTIN. Check it and try again.";
        default:
            break;
    }
    if (code && DIGILOCKER_RAN_OUT.has(code)) return SESSION_COPY.digilockerAgain;
    switch (check) {
        case "BANK_ACCOUNT":
            return "We couldn't verify this account. Check the account number and IFSC.";
        case "PAN":
            return "We couldn't verify this PAN. Check it and try again.";
        case "DRIVING_LICENCE":
            return "We couldn't verify this licence. Check the number and date of birth.";
        case "VEHICLE_RC":
            return "We couldn't find this registration. Check the number and try again.";
        case "DIGILOCKER":
            return "DigiLocker didn't finish. Try again.";
        case "FACE_LIVENESS":
        case "FACE_MATCH":
            return "We couldn't check your selfie. Take it again.";
        default:
            return "That didn't go through. Check the details and try again.";
    }
}

/** The errors a session screen handles, read off the envelope. */
export type SessionProblem =
    | { kind: "out-of-order"; check: CheckKind | null; needs: CheckKind | null }
    | { kind: "digilocker-again" }
    | { kind: "closed"; status: SessionStatus | null }
    | { kind: "unavailable" }
    | { kind: "invalid"; message: string }
    | { kind: "gone" }
    | { kind: "other"; message: string };

/**
 * A 400 VALIDATION_ERROR in the person's words: the backend's own sentence
 * for the field (`details.fieldErrors`), else its form-level sentence, else
 * its message — a schema failure's message is the generic "Invalid
 * request"; the field sentences are the person-facing ones.
 */
export function validationMessageOf(caught: ApiError): string {
    const details = (caught.details ?? {}) as { fieldErrors?: Record<string, unknown>; formErrors?: unknown };
    const fields = details.fieldErrors && typeof details.fieldErrors === "object" ? Object.values(details.fieldErrors) : [];
    for (const list of fields) {
        if (Array.isArray(list) && typeof list[0] === "string" && list[0].trim() && list[0] !== "Required") return list[0];
    }
    if (Array.isArray(details.formErrors) && typeof details.formErrors[0] === "string" && details.formErrors[0].trim()) return details.formErrors[0];
    if (caught.message && caught.message !== "Invalid request") return caught.message;
    return "Check the details and try again.";
}

/** What went wrong on a session call, as the screen acts on it. */
export function sessionProblemOf(caught: unknown): SessionProblem {
    if (!(caught instanceof ApiError)) return { kind: "other", message: messageOf(caught, "That didn't go through. Try again.") };
    const details = (caught.details ?? {}) as { check?: unknown; needs?: unknown; status?: unknown };
    if (caught.status === 404) return { kind: "gone" };
    if (caught.code === "DIGILOCKER_CONSENT_REQUIRED") return { kind: "digilocker-again" };
    if (caught.code === "VERIFICATION_STEP_NOT_OPEN") return { kind: "out-of-order", check: typeof details.check === "string" ? (details.check as CheckKind) : null, needs: typeof details.needs === "string" ? (details.needs as CheckKind) : null };
    if (caught.code === "VERIFICATION_SESSION_CLOSED") return { kind: "closed", status: typeof details.status === "string" ? (details.status as SessionStatus) : null };
    if (caught.status === 503 && caught.code === "VERIFICATION_UNAVAILABLE") return { kind: "unavailable" };
    if (caught.status === 400) return { kind: "invalid", message: validationMessageOf(caught) };
    return { kind: "other", message: messageOf(caught, "That didn't go through. Try again.") };
}

/** The group a step belongs to — where the server's `needs` brings the person. */
export function groupOfCheck(check: CheckKind): SessionGroupKey | null {
    return GROUP_STEPS.find((group) => group.checks.includes(check))?.key ?? null;
}

/**
 * Where DigiLocker sends the person back: the website's configured public
 * origin (never the browser's own — the backend takes only https), the
 * return page, the session.
 */
export function digilockerReturnUrl(siteUrl: string, sessionId: string): string {
    return `${siteUrl.replace(/\/$/, "")}/verify/digilocker-return?session=${encodeURIComponent(sessionId)}`;
}

/** Where the verify page that opened DigiLocker is kept while the person is away (sessionStorage). */
export const DIGILOCKER_RETURN_KEY = "adx.web.digilockerReturn";

/** The note left before leaving for DigiLocker: this session, and the page (without its `session`) to come back to. */
export function digilockerReturnNote(sessionId: string, pathname: string, search: string): string {
    const params = new URLSearchParams(search);
    params.delete("session");
    const query = params.toString();
    return JSON.stringify({ sessionId, path: query ? `${pathname}?${query}` : pathname });
}

/** The verify page to come back to after DigiLocker, with the session to reopen; never anywhere off the site. */
export function digilockerBackHref(stored: string | null, sessionId: string, caseType: SessionCaseType | null): string | null {
    let path: string | null = null;
    if (stored) {
        try {
            const parsed = JSON.parse(stored) as { sessionId?: unknown; path?: unknown };
            if (parsed.sessionId === sessionId && typeof parsed.path === "string" && parsed.path.startsWith("/") && !parsed.path.startsWith("//")) path = parsed.path;
        } catch {
            /* an unreadable note is no note */
        }
    }
    path ??= caseType ? (VERIFY_PAGE_BY_CASE[caseType] ?? null) : null;
    if (!path) return null;
    const [base, query = ""] = path.split("?");
    const params = new URLSearchParams(query);
    params.set("session", sessionId);
    return `${base}?${params.toString()}`;
}

/** The longest side a selfie is sent at. */
export const SELFIE_MAX_SIDE = 1280;

/** A picture's size scaled down so its longest side is at most `max` — never up. */
export function fitWithin(width: number, height: number, max: number = SELFIE_MAX_SIDE): { width: number; height: number } {
    const longest = Math.max(width, height);
    if (longest <= max || longest === 0) return { width, height };
    const scale = max / longest;
    return { width: Math.round(width * scale), height: Math.round(height * scale) };
}
