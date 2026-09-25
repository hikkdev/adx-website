import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/api-client";
import {
    challengeHref,
    codeLengthFor,
    destinationFor,
    groupSecret,
    isChallenge,
    isSignupHandoff,
    looksLikeRecoveryCode,
    maskEmail,
    normaliseCode,
    normaliseEmail,
    normaliseMobile,
    normaliseTwoFactorCode,
    otpFailure,
    pendingChallenge,
    safeNext,
    signupHref,
    spreadCode,
} from "./auth";

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

describe("EC-8: eight capital letters by email, six digits by phone", () => {
    it("knows each channel's length and keeps a code to its alphabet, in any case", () => {
        expect(codeLengthFor("email")).toBe(8);
        expect(codeLengthFor("mobile")).toBe(6);
        expect(normaliseCode("abcd-efgh", "email")).toBe("ABCDEFGH");
        expect(normaliseCode("io01 qrst", "email")).toBe("QRST");
        expect(normaliseCode("12 34a56", "mobile")).toBe("123456");
    });

    it("spreads a paste across the boxes from where it landed and says which box to focus", () => {
        const empty = ["", "", "", "", "", "", "", ""];
        expect(spreadCode(empty, 0, "abcdefgh", "email")).toEqual({ code: ["A", "B", "C", "D", "E", "F", "G", "H"], focus: 7 });
        expect(spreadCode(["A", "B", "", "", "", "", "", ""], 2, "cd", "email")).toEqual({ code: ["A", "B", "C", "D", "", "", "", ""], focus: 4 });
        expect(spreadCode(["A", "B", "C", "", "", "", "", ""], 1, "", "email")).toEqual({ code: ["A", "", "C", "", "", "", "", ""], focus: 1 });
        expect(spreadCode(["", "", "", "", "", ""], 0, "123456789", "mobile")).toEqual({ code: ["1", "2", "3", "4", "5", "6"], focus: 5 });
    });
});

describe("2FA-A: the challenge after any door", () => {
    it("tells a challenge from a session and a hand-off, and builds the steps' links", () => {
        const challenge = { challengeToken: "t", methods: ["AUTHENTICATOR" as const], maskedMobile: "+91 •••••• 3210", maskedEmail: null };
        expect(isChallenge({ challenge })).toBe(true);
        expect(isChallenge({ accessToken: "a", refreshToken: "r" })).toBe(false);
        expect(isSignupHandoff({ challenge })).toBe(false);
        expect(challengeHref("/cart")).toBe("/verify-2fa?next=%2Fcart");
        expect(challengeHref("https://evil.example")).toBe("/verify-2fa");
        expect(signupHref({ signupToken: "s", email: "a@b.co" }, "/cart")).toBe("/verify-phone?signup=s&email=a%40b.co&next=%2Fcart");
    });

    it("remembers the challenge in this tab and forgets it once used", () => {
        const challenge = { challengeToken: "tok", methods: ["AUTHENTICATOR" as const, "SMS" as const], maskedMobile: "+91 •••••• 3210", maskedEmail: "m•••@x.co" };
        pendingChallenge.remember(challenge);
        expect(pendingChallenge.read()).toEqual(challenge);
        pendingChallenge.clear();
        expect(pendingChallenge.read()).toBeNull();
        window.sessionStorage.setItem("adx.web.challenge", "{not json");
        expect(pendingChallenge.read()).toBeNull();
    });

    it("takes an app code as six digits and a recovery code upper-cased with its dash", () => {
        expect(looksLikeRecoveryCode("abcd-efgh")).toBe(true);
        expect(looksLikeRecoveryCode("ABCDEFGH")).toBe(true);
        expect(looksLikeRecoveryCode("123456")).toBe(false);
        expect(normaliseTwoFactorCode("123 456")).toBe("123456");
        expect(normaliseTwoFactorCode(" abcd-efgh ")).toBe("ABCD-EFGH");
        expect(groupSecret("JBSWY3DPEHPK3PXP")).toBe("JBSW Y3DP EHPK 3PXP");
    });
});
