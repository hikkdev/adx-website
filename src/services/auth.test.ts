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
    owesBasics,
    pendingChallenge,
    providerIds,
    safeNext,
    signupStepFor,
    signupHref,
    spreadCode,
    workspaceOwes,
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

describe("QR-6 / QR-22: what a signed-in account still owes", () => {
    const at = "2026-09-25T00:00:00Z";
    it("asks the terms first, then a side, then the basics — and nothing a backend without the fields cannot say", () => {
        expect(signupStepFor({ roles: ["ADVERTISER"], consentAcceptedAt: null, firstName: null })).toBe("consent");
        expect(signupStepFor({ roles: [], consentAcceptedAt: at, firstName: null })).toBe("side");
        expect(signupStepFor({ roles: ["PARTNER"], consentAcceptedAt: at, firstName: "A" })).toBe("side");
        expect(signupStepFor({ roles: ["PUBLISHER"], consentAcceptedAt: at, firstName: null })).toBe("basics");
        expect(signupStepFor({ roles: ["PUBLISHER"], consentAcceptedAt: at, firstName: "Vikram" })).toBe("done");
        expect(signupStepFor({ roles: ["PUBLISHER"] })).toBe("done");
    });

    it("sends a sign-in with the terms or the basics owed to the workspace chooser, keeping where it was going", () => {
        expect(destinationFor({ roles: ["ADVERTISER"], emailVerifiedAt: at, consentAcceptedAt: null, firstName: "A" }, "/cart")).toBe("/choose-workspace?next=%2Fcart");
        expect(destinationFor({ roles: ["ADVERTISER"], emailVerifiedAt: at, consentAcceptedAt: at, firstName: null }, null)).toBe("/choose-workspace");
        expect(destinationFor({ roles: ["ADVERTISER"], emailVerifiedAt: at, consentAcceptedAt: at, firstName: "A" }, "/cart")).toBe("/cart");
        /* A print partner goes to its workspace first, as the app does. */
        expect(destinationFor({ roles: ["PARTNER"], emailVerifiedAt: at, consentAcceptedAt: null, firstName: null }, null)).toBe("/partner");
        /* The email still comes before all of it. */
        expect(destinationFor({ roles: [], emailVerifiedAt: null, consentAcceptedAt: null }, null)).toBe("/verify-email");
    });

    it("owes the basics while either name is missing, not only the first name — never for the date of birth (29 Sep 2026)", () => {
        const full = { firstName: "Asha", lastName: "Rao" };
        /* The session read carries the date of birth; a missing one owes nothing — only an order asks for it. */
        const noBirthday = { ...full, dateOfBirth: null };
        expect(owesBasics(full)).toBe(false);
        expect(owesBasics(noBirthday)).toBe(false);
        expect(owesBasics({ ...full, lastName: null })).toBe(true);
        expect(owesBasics({ ...full, firstName: "  " })).toBe(true);
        /* A field the read does not carry (an older backend) never asks. */
        expect(owesBasics({ firstName: "Asha" })).toBe(false);
        expect(signupStepFor({ roles: ["ADVERTISER"], consentAcceptedAt: at, ...full, lastName: null })).toBe("basics");
        const signedUp = { roles: ["ADVERTISER"], consentAcceptedAt: at, ...noBirthday };
        expect(signupStepFor(signedUp)).toBe("done");
        expect(destinationFor({ roles: ["ADVERTISER"], emailVerifiedAt: at, consentAcceptedAt: at, ...full, lastName: null }, "/cart")).toBe("/choose-workspace?next=%2Fcart");
        expect(destinationFor({ roles: ["ADVERTISER"], emailVerifiedAt: at, consentAcceptedAt: at, ...full }, "/cart")).toBe("/cart");
        const noBirthdayMe = { roles: ["PUBLISHER"], emailVerifiedAt: at, consentAcceptedAt: at, ...noBirthday };
        expect(destinationFor(noBirthdayMe, null)).toBe("/publisher");
    });

    it("keeps a workspace shut until the consent is given (every side) and the basics (not the print partner's)", () => {
        const full = { firstName: "Asha", lastName: "Rao" };
        expect(workspaceOwes({ ...full, consentAcceptedAt: null }, "ADVERTISER")).toBe("consent");
        expect(workspaceOwes({ ...full, consentAcceptedAt: null }, "PRINT_PARTNER")).toBe("consent");
        expect(workspaceOwes({ ...full, consentAcceptedAt: at, lastName: null }, "PUBLISHER")).toBe("basics");
        expect(workspaceOwes({ ...full, consentAcceptedAt: at, lastName: null }, "PRINT_PARTNER")).toBeNull();
        expect(workspaceOwes({ ...full, consentAcceptedAt: at }, "ADVERTISER")).toBeNull();
        /* No date of birth on file opens the workspace all the same. */
        const noBirthday = { ...full, consentAcceptedAt: at, dateOfBirth: null };
        expect(workspaceOwes(noBirthday, "ADVERTISER")).toBeNull();
        expect(workspaceOwes(noBirthday, "PUBLISHER")).toBeNull();
        expect(workspaceOwes({}, "ADVERTISER")).toBeNull();
    });
});

describe("G-2 / FB-1: which provider doors to draw", () => {
    it("takes the server's ids, falls back to the site's own, and draws nothing without one", () => {
        expect(providerIds({ google: { webClientId: "g-server" }, facebook: { appId: "f-server" } }, { google: "g-env", facebook: "f-env" })).toEqual({ googleClientId: "g-server", facebookAppId: "f-server" });
        expect(providerIds({ google: null, facebook: null }, { google: "g-env" })).toEqual({ googleClientId: "g-env", facebookAppId: null });
        expect(providerIds(null, {})).toEqual({ googleClientId: null, facebookAppId: null });
        expect(providerIds({ google: { webClientId: " " }, facebook: null }, {})).toEqual({ googleClientId: null, facebookAppId: null });
    });
});
