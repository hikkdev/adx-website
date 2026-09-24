import { ApiError, api } from "@/lib/api-client";

/**
 * Sign-in as the apps do it (DR 08, kept on the web by the owner's decision
 * of 24 Sep 2026): a mobile number and a one-time code. `send-otp` is
 * register-or-login — a number the platform has never seen is created on
 * its first code — so there is no separate sign-up. Google sign-in stays.
 */
export interface SendOtpResult {
    message: string;
    /** Seconds before "Resend" may be offered. */
    resendAfterSeconds: number;
    sendsRemaining: number;
    expiresInSeconds: number;
    /** Outside production the backend returns the code so no SMS is needed. */
    devOtp?: string;
}

export interface SessionUser {
    id: string;
    mobile: string;
    email?: string | null;
    name?: string | null;
    avatarUrl?: string | null;
    roles: string[];
}

export interface SessionTokens {
    accessToken: string;
    refreshToken: string;
    user?: SessionUser;
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

export const authService = {
    sendOtp: (mobile: string) => api.post<SendOtpResult>("/auth/send-otp", { mobile }, { anonymous: true }),
    verifyOtp: (mobile: string, otp: string) => api.post<SessionTokens>("/auth/verify-otp", { mobile, otp }, { anonymous: true }),
    google: (idToken: string) => api.post<SessionTokens>("/auth/google", { idToken }, { anonymous: true }),
    logout: (refreshToken: string) => api.post<void>("/auth/logout", { refreshToken }),
    me: () => api.get<SessionUser>("/users/me"),
};
