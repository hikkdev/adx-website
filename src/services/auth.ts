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
 * Google sign-in stays for accounts an administrator linked.
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
}

/** ED-1: a new address was read; the number comes next, carrying this. */
export interface SignupHandoff {
    signupToken: string;
    email: string;
    expiresInSeconds: number;
}

export type EmailDoorResult = SessionTokens | { signup: SignupHandoff };

export const isSignupHandoff = (result: EmailDoorResult): result is { signup: SignupHandoff } => "signup" in result && !("accessToken" in result);

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

export const authService = {
    sendOtp: (mobile: string) => api.post<SendOtpResult>("/auth/send-otp", { mobile }, { anonymous: true }),
    /** ED-1: `signupToken` ends an email sign-up — the proven address is written onto this number's account. */
    verifyOtp: (mobile: string, otp: string, signupToken?: string | null) =>
        api.post<SessionTokens>("/auth/verify-otp", { mobile, otp, ...(signupToken ? { signupToken } : {}) }, { anonymous: true }),
    sendEmailOtp: (email: string) => api.post<SendOtpResult>("/auth/send-otp-email", { email }, { anonymous: true }),
    verifyEmailOtp: (email: string, otp: string) => api.post<EmailDoorResult>("/auth/verify-otp-email", { email, otp }, { anonymous: true }),
    google: (idToken: string) => api.post<SessionTokens>("/auth/google", { idToken }, { anonymous: true }),
    logout: (refreshToken: string) => api.post<void>("/auth/logout", { refreshToken }),
    me: () => api.get<SessionUser>("/users/me"),
    /** ED-1: proving the account's own email after a number-first sign-in. */
    sendMyEmailCode: (email: string) => api.post<EmailCodeSent>("/users/me/email/send-code", { email }),
    verifyMyEmail: (email: string, code: string) => api.post<SessionUser>("/users/me/email/verify", { email, code }),
};
