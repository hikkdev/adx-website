import { describe, expect, it } from "vitest";
import type { PublisherReadiness } from "@/services/publisher-workspace";
import {
    activeSuspensions,
    bookingRange,
    gaugeArc,
    joinBasics,
    licenceState,
    matchSpots,
    needsReupload,
    occupancyLine,
    offersContinueUnverified,
    pinTone,
    placedSpots,
    railProgress,
    readinessAction,
    readinessSteps,
    signHref,
    stageRail,
    telHref,
    termsOutstanding,
} from "./home-model";

const readiness = (over: Partial<PublisherReadiness> = {}): PublisherReadiness => ({
    profile: { complete: true, missing: [], percent: 100 },
    kyc: { verified: false, status: "PENDING" },
    terms: { accepted: true },
    percent: 70,
    canList: true,
    canGoLive: true,
    ...over,
});

describe("Lot A: suspension banners", () => {
    it("draws the known scopes in the strip's order, never sign-in, never an unknown one", () => {
        expect(activeSuspensions(["FREEZE_WALLET", "BLOCK_SIGNIN", "BLOCK_NEW", "SOMETHING_NEW"])).toEqual(["BLOCK_NEW", "FREEZE_WALLET"]);
        expect(activeSuspensions(null)).toEqual([]);
    });
});

describe("DS-3: the licence to display", () => {
    it("asks for a signature only while a request is open", () => {
        expect(licenceState(null)).toBe("NONE");
        expect(licenceState({ required: false, satisfied: true, status: null, requestId: null })).toBe("NONE");
        expect(licenceState({ required: true, satisfied: false, status: "REQUESTED", requestId: "sr1" })).toBe("SIGN");
        expect(licenceState({ required: true, satisfied: false, status: "EXPIRED", requestId: "sr1" })).toBe("WAITING");
    });

    it("sends the signer to the e-sign page and back to the Overview", () => {
        expect(signHref("sr 1")).toBe("/sign/sr%201?next=%2Fpublisher");
    });
});

describe("QR-3: readiness", () => {
    it("joins the missing basics the way a sentence does", () => {
        expect(joinBasics([])).toBe("");
        expect(joinBasics(["name"])).toBe("name");
        expect(joinBasics(["name", "email", "address"])).toBe("name, email and address");
    });

    it("lists the details and the identity check with what each unlocks", () => {
        const steps = readinessSteps(readiness({ profile: { complete: false, missing: ["email", "address"], percent: 50 }, kyc: { verified: false, status: "NEEDS_INFO" } }));
        expect(steps.map((s) => [s.key, s.done])).toEqual([
            ["profile", false],
            ["kyc", false],
        ]);
        expect(steps[0]!.detail).toBe("Add your email and address to start listing spaces.");
        expect(steps[1]!.detail).toMatch(/needs some documents again/);
    });

    it("sends the details to the business profile, then the check — the date of birth is never a listing basic (29 Sep 2026)", () => {
        expect(readinessAction(readiness({ percent: 100, kyc: { verified: true, status: "VERIFIED" } }))).toBeNull();
        expect(readinessAction(readiness({ profile: { complete: false, missing: ["address"], percent: 50 }, percent: 35, canList: false }))).toEqual({ label: "Complete your details", href: "/publisher/profile" });
        expect(readinessAction(readiness({ profile: { complete: false, missing: ["name", "email"], percent: 25 }, percent: 18, canList: false }))?.href).toBe("/publisher/profile");
        expect(readinessAction(readiness())).toEqual({ label: "Verify your identity", href: "/publisher/profile/verify" });
    });

    it("offers Continue unverified once only the check is left", () => {
        expect(offersContinueUnverified(readiness())).toBe(true);
        expect(offersContinueUnverified(readiness({ profile: { complete: false, missing: ["email"], percent: 75 } }))).toBe(false);
        expect(offersContinueUnverified(readiness({ percent: 100, kyc: { verified: true, status: "VERIFIED" } }))).toBe(false);
    });

    it("knows a flagged re-upload and outstanding terms", () => {
        expect(needsReupload({ kycStatus: "NEEDS_INFO" })).toBe(true);
        expect(needsReupload({ kycStatus: "PENDING" })).toBe(false);
        expect(termsOutstanding({ platformAgreementAcceptedAt: null, activatedAt: null })).toBe(true);
        expect(termsOutstanding({ platformAgreementAcceptedAt: "2026-04-24T08:04:50.103Z", activatedAt: null })).toBe(false);
    });
});

describe("the gauge", () => {
    it("draws a half ring and fills it by the rate", () => {
        expect(gaugeArc(100)).toBe("M 16 100 A 84 84 0 1 1 184.00 100.00");
        expect(gaugeArc(0)).toBe("M 16 100 A 84 84 0 0 1 16.00 100.00");
        expect(gaugeArc(150)).toBe(gaugeArc(100));
    });

    it("says how many live spaces are booked", () => {
        expect(occupancyLine({ occupied: 0, live: 0 })).toBe("No live spaces yet");
        expect(occupancyLine({ occupied: 4, live: 10 })).toBe("4 of 10 live spaces booked today");
        expect(occupancyLine({ occupied: 1, live: 1 })).toBe("1 of 1 live space booked today");
    });
});

describe("the Location Card", () => {
    it("places the booking on the tracker's five stages", () => {
        expect(stageRail("PENDING_PUBLISHER").map((s) => s.state)).toEqual(["current", "todo", "todo", "todo", "todo"]);
        expect(stageRail("IN_PROGRESS").map((s) => s.state)).toEqual(["done", "done", "current", "todo", "todo"]);
        expect(stageRail("COMPLETED").every((s) => s.state === "done")).toBe(true);
        expect(stageRail("CANCELLED").every((s) => s.state === "todo")).toBe(true);
        expect(railProgress("IN_PROGRESS")).toEqual({ filled: 0.5, reached: 2 });
        expect(railProgress("COMPLETED")).toEqual({ filled: 1, reached: 4 });
    });

    it("spells the run and dials the agent", () => {
        expect(bookingRange({ startDate: "2026-09-07T00:00:00.000Z", endDate: "2026-10-07T00:00:00.000Z" })).toBe("7 Sep – 7 Oct 2026");
        expect(bookingRange({ startDate: null, endDate: null })).toBe("Dates not set");
        expect(telHref({ agent: { id: "a", name: "Ravi", phone: "+91 98765 43210" } })).toBe("tel:+919876543210");
        expect(telHref({ agent: null })).toBeNull();
    });

    it("colours and places the pins, and filters them by the search", () => {
        expect(pinTone({ occupied: true, status: "ACTIVE" })).toBe("booked");
        expect(pinTone({ occupied: false, status: "ACTIVE" })).toBe("free");
        expect(pinTone({ occupied: false, status: "PENDING_REVIEW" })).toBe("off");
        const spots = [
            { id: "1", title: "Phoenix Marketcity — Atrium LED Wall", latitude: 12.99, longitude: 77.69 },
            { id: "2", title: "Cult.fit Indiranagar", latitude: null, longitude: null },
        ];
        expect(placedSpots(spots).map((s) => s.id)).toEqual(["1"]);
        expect(matchSpots(spots, "atrium wall").map((s) => s.id)).toEqual(["1"]);
        expect(matchSpots(spots, "  ")).toHaveLength(2);
    });
});
