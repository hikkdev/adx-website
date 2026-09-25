import { ApiError, api } from "@/lib/api-client";

/**
 * Sign-in on the website — DR 12 board 03, and ED-1 (the owner, 25 Sep
 * 2026): every account proves its email AND its mobile number. The frame
 * asks the email first; the number follows. Either door is register-or-login:
 *
 *   email  → `send-otp-email` / `verify-otp-email`. A known address signs in.
 *            An unknown one answers a **signup token** — the proof the
 *            address was read — and the number is proved next on
 *            `verify-otp` with that token, which writes the email onto the
 *            new account.
 *   mobile → `send-otp` / `verify-otp`, the apps' door. An account that came
 *            in this way proves its email afterwards through
 *            `users/me/email/send-code` + `/verify`.
 *
 * Google and Facebook (G-2, FB-1) are doors too: a mailbox the provider
 * vouches for skips the email code and goes straight to the phone step with
 * the same signup token. 2FA-A: any account with an authenticator app
 * answers a **challenge** instead of tokens from every door; `/verify-2fa`
 * finishes it. EC-8: a code sent to an email is eight capital letters; a
 * code sent to a phone stays six digits.
 */
export interface SendOtpResult {
    message: string;
    /** Seconds before "Resend" may be offered. */
    resendAfterSeconds: number;
    sendsRemaining: number;
    expiresInSeconds: number;
    /** Outside production the backend returns the code so no SMS or mail is needed. */
    devOtp?: string;
}

export interface SessionUser {
    id: string;
    mobile: string;
    email?: string | null;
    name?: string | null;
    avatarUrl?: string | null;
    roles: string[];
    /** ED-1: both stamps. `null` means still to prove; absent on a backend older than the stamps. */
    mobileVerifiedAt?: string | null;
    emailVerifiedAt?: string | null;
}

export interface SessionTokens {
    accessToken: string;
    refreshToken: string;
    user?: SessionUser;
    /** ED-1: on the phone step of an email sign-up, what became of the address. */
    signup?: { email: string | null; attached: boolean; outcome: "PRIMARY" | "KEPT" | "TAKEN" | "EXPIRED" };
    /** 2FA-A: after a recovery code, how many are left — and a warning once they run low. */
    recoveryCodesLeft?: number;
    warning?: string | null;
}

/** ED-1: a new address was read; the number comes next, carrying this. */
export interface SignupHandoff {
    signupToken: string;
    email: string;
    expiresInSeconds: number;
}

/** 2FA-A: the account has a second factor; no tokens until it is answered. */
export type TwoFactorMethod = "AUTHENTICATOR" | "SMS" | "EMAIL";

export interface TwoFactorChallenge {
    challengeToken: string;
    methods: TwoFactorMethod[];
    maskedMobile: string | null;
    maskedEmail: string | null;
}

/** What any sign-in door answers: a session, a sign-up hand-off, or a second-factor challenge. */
export type DoorResult = SessionTokens | { signup: SignupHandoff } | { challenge: TwoFactorChallenge };

export type EmailDoorResult = DoorResult;

export const isSignupHandoff = (result: DoorResult): result is { signup: SignupHandoff } => "signup" in result && !("accessToken" in result);

export const isChallenge = (result: DoorResult): result is { challenge: TwoFactorChallenge } => "challenge" in result && !("accessToken" in result);

/** `POST /users/me/email/send-code` — the budget, and the address as the server normalised it. */
export interface EmailCodeSent extends SendOtpResult {
    email: string;
}

export type OtpFailureReason = "OTP_INVALID" | "OTP_EXPIRED" | "OTP_ATTEMPTS_EXCEEDED" | "OTP_LOCKED" | "OTP_RESEND_TOO_SOON" | "OTP_RESEND_LIMIT";

const REASONS = new Set<string>(["OTP_INVALID", "OTP_EXPIRED", "OTP_ATTEMPTS_EXCEEDED", "OTP_LOCKED", "OTP_RESEND_TOO_SOON", "OTP_RESEND_LIMIT"]);

export interface OtpFailure {
    reason: OtpFailureReason;
    message: string;
    attemptsRemaining?: number;
    retryAfterSeconds?: number;
    lockedUntil?: string;
}

/** The OTP refusal inside an error, or null when the error is something else. */
export function otpFailure(cause: unknown): OtpFailure | null {
    if (!(cause instanceof ApiError)) return null;
    const details = cause.details as Partial<OtpFailure> | undefined;
    if (!details || typeof details.reason !== "string" || !REASONS.has(details.reason)) return null;
    return {
        reason: details.reason,
        message: cause.message,
        attemptsRemaining: details.attemptsRemaining,
        retryAfterSeconds: details.retryAfterSeconds,
        lockedUntil: details.lockedUntil,
    };
}

/* ------------------------------------------------------------------ */
/* Codes — EC-8                                                        */
/* ------------------------------------------------------------------ */

export type CodeChannel = "mobile" | "email";

/** Six digits by SMS. */
export const SMS_CODE_LENGTH = 6;
/** EC-8: eight capital letters by email — no I or O, so nothing reads as a digit. */
export const EMAIL_CODE_LENGTH = 8;
export const EMAIL_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ";

export const codeLengthFor = (channel: CodeChannel): number => (channel === "email" ? EMAIL_CODE_LENGTH : SMS_CODE_LENGTH);

const EMAIL_LETTER = new RegExp(`[^${EMAIL_CODE_ALPHABET}]`, "g");

/**
 * What a person typed or pasted, kept to the characters the channel's code
 * can hold: digits for a phone code; the email alphabet, upper-cased, for an
 * email code (typed in any case, accepted in any case).
 */
export function normaliseCode(raw: string, channel: CodeChannel): string {
    if (channel === "email") return raw.toUpperCase().replace(EMAIL_LETTER, "");
    return raw.replace(/\D/g, "");
}

/**
 * The boxes after typing or pasting `raw` into box `index`: the characters
 * spread from that box forward, boxes past the paste left as they were, and
 * the box to focus next. An empty `raw` clears the box.
 */
export function spreadCode(code: string[], index: number, raw: string, channel: CodeChannel): { code: string[]; focus: number } {
    const chars = normaliseCode(raw, channel);
    if (!chars) return { code: code.map((c, i) => (i === index ? "" : c)), focus: index };
    const next = code.map((c, i) => (i < index ? c : (chars[i - index] ?? (i < index + chars.length ? "" : c))));
    return { code: next, focus: Math.min(code.length - 1, index + chars.length) };
}

/** A recovery code is `XXXX-XXXX` from the email alphabet plus digits 2–9; a six-digit app code is not one. */
export const looksLikeRecoveryCode = (raw: string): boolean => /^[A-Z2-9]{4}-?[A-Z2-9]{4}$/i.test(raw.trim()) && !/^\d+$/.test(raw.trim());

/** A 2FA code as the backend takes it: an app code as six digits, a recovery code upper-cased with its dash. */
export function normaliseTwoFactorCode(raw: string): string {
    const trimmed = raw.trim();
    if (/^[\d\s]+$/.test(trimmed)) return trimmed.replace(/\s/g, "");
    return trimmed.toUpperCase().replace(/[\s]/g, "");
}

/* ------------------------------------------------------------------ */
/* Addresses and numbers                                               */
/* ------------------------------------------------------------------ */

/** +91 and ten digits, as the backend stores every number. */
export function normaliseMobile(input: string): string {
    const digits = input.replace(/\D/g, "");
    if (digits.length === 10) return `+91${digits}`;
    if (digits.length === 12 && digits.startsWith("91")) return `+${digits}`;
    return input.trim().startsWith("+") ? `+${digits}` : `+91${digits}`;
}

/** Lower-cased and trimmed, as the backend stores every address. */
export const normaliseEmail = (input: string): string => input.trim().toLowerCase();

export const looksLikeEmail = (input: string): boolean => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.trim());

/** `marketing@asterhome.example` → `m••••••••@asterhome.example` (the frame's masking). */
export function maskEmail(email: string): string {
    const at = email.indexOf("@");
    if (at <= 0) return email;
    return `${email[0]}${"•".repeat(Math.max(3, at - 1))}${email.slice(at)}`;
}

/** `+919876543210` → `+91 •••••• 3210` */
export function maskMobile(mobile: string): string {
    const digits = mobile.replace(/\D/g, "").slice(-10);
    return `+91 ${"•".repeat(6)} ${digits.slice(-4)}`;
}

/** A `next` we are willing to send somebody to: a path on this site, never another host. */
export const safeNext = (next: string | null | undefined): string | null => (next && next.startsWith("/") && !next.startsWith("//") ? next : null);

/**
 * Where a just-signed-in account goes. ED-1: an email still to prove comes
 * first (the stamp exists and is null); then the side — none yet means the
 * workspace chooser; then the page that sent them, else that side's home.
 */
export function destinationFor(me: Pick<SessionUser, "roles" | "emailVerifiedAt">, next: string | null | undefined): string {
    const wanted = safeNext(next);
    const suffix = wanted ? `?next=${encodeURIComponent(wanted)}` : "";
    if (me.emailVerifiedAt === null) return `/verify-email${suffix}`;
    const publisher = me.roles.includes("PUBLISHER");
    const advertiser = me.roles.includes("ADVERTISER");
    if (!publisher && !advertiser) return `/choose-workspace${suffix}`;
    if (wanted) return wanted;
    return publisher && !advertiser ? "/publisher" : "/advertiser";
}

/** G-2 / FB-1 / ED-1: the phone step a new address is handed to, with the proof of the email. */
export function signupHref(signup: Pick<SignupHandoff, "signupToken" | "email">, next: string | null | undefined): string {
    const query = new URLSearchParams({ signup: signup.signupToken, email: signup.email });
    const wanted = safeNext(next);
    if (wanted) query.set("next", wanted);
    return `/verify-phone?${query.toString()}`;
}

/** 2FA-A: the second-factor step, carrying only `next` — the challenge itself is remembered in this tab. */
export function challengeHref(next: string | null | undefined): string {
    const wanted = safeNext(next);
    return wanted ? `/verify-2fa?next=${encodeURIComponent(wanted)}` : "/verify-2fa";
}

const CHALLENGE_KEY = "adx.web.challenge";

/**
 * The challenge a door just answered, kept in this tab until `/verify-2fa`
 * consumes it — session storage, so it never rides in a URL or outlives the
 * tab. A missing one sends the person back to sign-in.
 */
export const pendingChallenge = {
    remember(challenge: TwoFactorChallenge): void {
        try {
            window.sessionStorage.setItem(CHALLENGE_KEY, JSON.stringify(challenge));
        } catch {
            /* ignore */
        }
    },
    read(): TwoFactorChallenge | null {
        try {
            const raw = window.sessionStorage.getItem(CHALLENGE_KEY);
            if (!raw) return null;
            const parsed = JSON.parse(raw) as Partial<TwoFactorChallenge>;
            if (typeof parsed.challengeToken !== "string" || !Array.isArray(parsed.methods)) return null;
            return { challengeToken: parsed.challengeToken, methods: parsed.methods as TwoFactorMethod[], maskedMobile: parsed.maskedMobile ?? null, maskedEmail: parsed.maskedEmail ?? null };
        } catch {
            return null;
        }
    },
    clear(): void {
        try {
            window.sessionStorage.removeItem(CHALLENGE_KEY);
        } catch {
            /* ignore */
        }
    },
};

/* ------------------------------------------------------------------ */
/* The authenticator app — 2FA settings                                */
/* ------------------------------------------------------------------ */

/** `GET /auth/2fa/status` — the enrolment as the backend reports it for this account. */
export interface TwoFactorStatus {
    methods: string[];
    authenticator: { enrolled: boolean; enrolledAt: string | null; recoveryCodesLeft: number } | null;
    policy?: unknown;
    mustEnrolAuthenticator: boolean;
}

/** `POST /auth/2fa/totp/enrol` — shown once: the secret for manual entry, the otpauth link, and the QR as a data URL. */
export interface EnrolmentStart {
    secret: string;
    otpauthUri: string;
    qrSvg: string;
    expiresInSeconds: number;
}

export interface EnrolmentDone {
    enrolledAt: string;
    /** Ten `XXXX-XXXX` codes, answered once and never again. */
    recoveryCodes: string[];
    accessToken?: string;
}

/** "ABCD EFGH IJKL" — the secret in groups of four, for typing into an app by hand. */
export const groupSecret = (secret: string): string => secret.replace(/\s+/g, "").replace(/(.{4})/g, "$1 ").trim();

export const twoFactorService = {
    status: () => api.get<TwoFactorStatus>("/auth/2fa/status"),
    enrol: () => api.post<EnrolmentStart>("/auth/2fa/totp/enrol", {}),
    confirm: (code: string) => api.post<EnrolmentDone>("/auth/2fa/totp/confirm", { code: normaliseTwoFactorCode(code) }),
    /** Either the app's code or a recovery code — the phone may be the thing that was lost. */
    disable: (proof: string) =>
        api.post<{ disabled: boolean; message: string }>("/auth/2fa/totp/disable", looksLikeRecoveryCode(proof) ? { recoveryCode: normaliseTwoFactorCode(proof) } : { code: normaliseTwoFactorCode(proof) }),
    regenerateRecoveryCodes: (code: string) => api.post<{ recoveryCodes: string[] }>("/auth/2fa/recovery-codes/regenerate", { code: normaliseTwoFactorCode(code) }),
};

/* ------------------------------------------------------------------ */
/* The doors                                                           */
/* ------------------------------------------------------------------ */

export const authService = {
    sendOtp: (mobile: string) => api.post<SendOtpResult>("/auth/send-otp", { mobile }, { anonymous: true }),
    /** ED-1: `signupToken` ends an email sign-up — the proven address is written onto this number's account. 2FA-A: may answer a challenge. */
    verifyOtp: (mobile: string, otp: string, signupToken?: string | null) =>
        api.post<DoorResult>("/auth/verify-otp", { mobile, otp, ...(signupToken ? { signupToken } : {}) }, { anonymous: true }),
    sendEmailOtp: (email: string) => api.post<SendOtpResult>("/auth/send-otp-email", { email }, { anonymous: true }),
    /** EC-8: the eight letters, sent upper-cased. */
    verifyEmailOtp: (email: string, otp: string) => api.post<DoorResult>("/auth/verify-otp-email", { email, otp: normaliseCode(otp, "email") }, { anonymous: true }),
    /** G-2: a known address signs in; a Google-verified new one is a sign-up hand-off. */
    google: (idToken: string) => api.post<DoorResult>("/auth/google", { idToken }, { anonymous: true }),
    /** FB-1: the same, on the mailbox Facebook vouches for. 409 FACEBOOK_EMAIL_REQUIRED when it shares none. */
    facebook: (accessToken: string) => api.post<DoorResult>("/auth/facebook", { accessToken }, { anonymous: true }),
    /** 2FA-A: the app's six digits or a recovery code, and then the tokens the door held back. */
    verifyTwoFactor: (challengeToken: string, code: string) => api.post<SessionTokens>("/auth/2fa/verify", { challengeToken, code: normaliseTwoFactorCode(code) }, { anonymous: true }),
    /** An ADMIN's challenge may also be answered by SMS or email; this sends that code. */
    sendTwoFactor: (challengeToken: string, method: TwoFactorMethod) => api.post<SendOtpResult & { method: TwoFactorMethod }>("/auth/2fa/send", { challengeToken, method }, { anonymous: true }),
    logout: (refreshToken: string) => api.post<void>("/auth/logout", { refreshToken }),
    me: () => api.get<SessionUser>("/users/me"),
    /** ED-1: proving the account's own email after a number-first sign-in. */
    sendMyEmailCode: (email: string) => api.post<EmailCodeSent>("/users/me/email/send-code", { email }),
    verifyMyEmail: (email: string, code: string) => api.post<SessionUser>("/users/me/email/verify", { email, code: normaliseCode(code, "email") }),
};
