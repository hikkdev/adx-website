import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/api-client";
import { normaliseMobile, otpFailure } from "./auth";

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
