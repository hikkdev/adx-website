import { afterEach, describe, expect, it, vi } from "vitest";
import { api, apiFetchEnvelope, ApiError, FEATURE_OFF, isFeatureOff, onFeatureOff } from "./api-client";

/**
 * The kill switch as the client reads it (28 Sep 2026): the backend's
 * `requireFeature(key)` answers 503 FEATURE_OFF `{ key }`. One mapping —
 * `isFeatureOff`, `ApiError.featureKey` — and one report to whoever
 * listens (lib/flags.tsx's provider), from every call that receives it.
 */

function answer(status: number, body: unknown) {
    vi.stubGlobal(
        "fetch",
        vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }))
    );
}

const off = (key: string) => ({ success: false, error: { code: "FEATURE_OFF", message: "This feature is switched off", details: { key } } });

afterEach(() => {
    vi.unstubAllGlobals();
});

describe("isFeatureOff", () => {
    it("is a 503 FEATURE_OFF, for the key it names when one is asked about", () => {
        const error = new ApiError(503, FEATURE_OFF, "This feature is switched off", { key: "support.live-chat" });
        expect(error.featureKey).toBe("support.live-chat");
        expect(isFeatureOff(error)).toBe(true);
        expect(isFeatureOff(error, "support.live-chat")).toBe(true);
        expect(isFeatureOff(error, "partners.quotes")).toBe(false);
    });

    it("is nothing else: another 503, a 409 FEATURE_OFF refusal, a plain error", () => {
        expect(isFeatureOff(new ApiError(503, "MAINTENANCE", "Down for a moment"))).toBe(false);
        const refusal = new ApiError(409, FEATURE_OFF, "Instant booking is off", { key: "marketplace.instant-booking" });
        expect(isFeatureOff(refusal)).toBe(false);
        expect(refusal.featureKey).toBeNull();
        expect(isFeatureOff(new Error("boom"))).toBe(false);
        expect(isFeatureOff(null)).toBe(false);
    });

    it("reads a FEATURE_OFF with no key as off, for no key in particular", () => {
        const bare = new ApiError(503, FEATURE_OFF, "off");
        expect(bare.featureKey).toBeNull();
        expect(isFeatureOff(bare)).toBe(true);
        expect(isFeatureOff(bare, "support.live-chat")).toBe(false);
    });
});

describe("onFeatureOff", () => {
    it("tells every listener the key of a 503 FEATURE_OFF, from the plain call and the envelope call alike", async () => {
        const heard: string[] = [];
        const stop = onFeatureOff((key) => heard.push(key));

        answer(503, off("support.live-chat"));
        const caught = await api.post("/support/live/start", {}).catch((error: unknown) => error);
        expect(isFeatureOff(caught, "support.live-chat")).toBe(true);

        answer(503, off("partners.quotes"));
        await expect(apiFetchEnvelope("/print-partners/me/quote-requests")).rejects.toBeInstanceOf(ApiError);

        expect(heard).toEqual(["support.live-chat", "partners.quotes"]);
        stop();
        answer(503, off("support.live-chat"));
        await api.get("/support/live/start").catch(() => undefined);
        expect(heard).toHaveLength(2);
    });

    it("stays quiet for any other failure", async () => {
        const heard: string[] = [];
        const stop = onFeatureOff((key) => heard.push(key));
        answer(503, { success: false, error: { code: "MAINTENANCE", message: "Down" } });
        await api.get("/app/status").catch(() => undefined);
        answer(409, { success: false, error: { code: "FEATURE_OFF", message: "off", details: { key: "marketplace.instant-booking" } } });
        await api.patch("/listings/l1", {}).catch(() => undefined);
        stop();
        expect(heard).toEqual([]);
    });
});
