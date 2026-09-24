import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/api-client";
import { destinationFor, isSignupHandoff, maskEmail, normaliseEmail, normaliseMobile, otpFailure, safeNext } from "./auth";

describe("normaliseMobile", () => {
    it("stores every number as +91 and ten digits, whatever was typed", () => {
        expect(normaliseMobile("98765 43210")).toBe("+919876543210");
        expect(normaliseMobile("+91 98765-43210")).toBe("+919876543210");
        expect(normaliseMobile("919876543210")).toBe("+919876543210");
    });
});

describe("otpFailure", () => {
    it("reads the backend's OTP refusal, and nothing else", () => {
        const refused = new ApiError(429, "TOO_MANY", "Wait a minute before asking again.", { reason: "OTP_RESEND_TOO_SOON", retryAfterSeconds: 42 });
        expect(otpFailure(refused)).toEqual({ reason: "OTP_RESEND_TOO_SOON", message: "Wait a minute before asking again.", attemptsRemaining: undefined, retryAfterSeconds: 42, lockedUntil: undefined });
        expect(otpFailure(new ApiError(500, "INTERNAL", "Boom"))).toBeNull();
        expect(otpFailure(new Error("network"))).toBeNull();
    });
});

describe("ED-1: the two doors", () => {
    it("normalises an address, masks it the way the frame does, and tells a hand-off from a session", () => {
        expect(normaliseEmail("  Marketing@AsterHome.Example ")).toBe("marketing@asterhome.example");
        expect(maskEmail("marketing@asterhome.example")).toBe("m••••••••@asterhome.example");
        expect(isSignupHandoff({ signup: { signupToken: "t", email: "a@b.co", expiresInSeconds: 1800 } })).toBe(true);
        expect(isSignupHandoff({ accessToken: "a", refreshToken: "r" })).toBe(false);
    });

    it("sends a signed-in account to the email step first, then the side, then where it was going", () => {
        expect(destinationFor({ roles: ["ADVERTISER"], emailVerifiedAt: null }, "/cart")).toBe("/verify-email?next=%2Fcart");
        expect(destinationFor({ roles: [], emailVerifiedAt: "2026-09-25T00:00:00Z" }, "/cart")).toBe("/choose-workspace?next=%2Fcart");
        expect(destinationFor({ roles: ["ADVERTISER"], emailVerifiedAt: "2026-09-25T00:00:00Z" }, "/cart")).toBe("/cart");
        expect(destinationFor({ roles: ["PUBLISHER"], emailVerifiedAt: "2026-09-25T00:00:00Z" }, null)).toBe("/publisher");
        expect(destinationFor({ roles: ["PUBLISHER", "ADVERTISER"], emailVerifiedAt: undefined }, "//evil.example")).toBe("/advertiser");
        expect(safeNext("https://evil.example")).toBeNull();
    });
});
