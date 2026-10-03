import { describe, expect, it } from "vitest";
import { FLAG_PROMOTION_ADS as SERVICE_ADS, FLAG_PROMOTION_BOOSTS as SERVICE_BOOSTS } from "@/services/promotions";
import { FLAG_PROMOTION_ADS, FLAG_PROMOTION_BOOSTS, KILL_SWITCHES, parseFlags, PLURAL_SWITCH_NAMES, refusalsAfter, switchedOffIn, withSwitchedOff } from "./flags";

describe("the feature switches", () => {
    it("reads both shapes strictly: only exactly-on is on, and a blank variant is none", () => {
        expect(parseFlags({ "instant-booking": { enabled: true, variant: "B" }, "multi-market-campaigns": { enabled: "yes" }, legacy: true, other: 1, blank: { enabled: true, variant: " " } })).toEqual({
            "instant-booking": { enabled: true, variant: "B" },
            "multi-market-campaigns": { enabled: false, variant: null },
            legacy: { enabled: true, variant: null },
            other: { enabled: false, variant: null },
            blank: { enabled: true, variant: null },
        });
    });

    it("answers nothing for an answer that is not an object", () => {
        expect(parseFlags(null)).toEqual({});
        expect(parseFlags([1, 2])).toEqual({});
        expect(parseFlags("on")).toEqual({});
    });
});

describe("the kill-switch reading", () => {
    const answer = parseFlags({ "support.live-chat": { enabled: false, variant: null }, "partners.quotes": { enabled: true, variant: null } });

    it("is off only when the answer names the key and it is not on — an absent key is not known to be off", () => {
        expect(switchedOffIn(answer, "support.live-chat")).toBe(true);
        expect(switchedOffIn(answer, "partners.quotes")).toBe(false);
        expect(switchedOffIn(answer, "marketplace.reviews")).toBe(false);
        expect(switchedOffIn({}, "support.live-chat")).toBe(false);
    });

    it("folds a key the server has since refused (503 FEATURE_OFF) over the answer, without touching the rest", () => {
        const folded = withSwitchedOff(answer, new Set(["partners.quotes", "marketplace.reviews"]));
        expect(switchedOffIn(folded, "partners.quotes")).toBe(true);
        expect(switchedOffIn(folded, "marketplace.reviews")).toBe(true);
        expect(switchedOffIn(folded, "support.live-chat")).toBe(true);
        expect(folded["partners.quotes"]).toEqual({ enabled: false, variant: null });
        expect(withSwitchedOff(answer, new Set())).toBe(answer);
    });

    it("lets a fresh answer lift only the refusals that arrived before its read went out", () => {
        const refused = new Map([
            ["support.live-chat", 3],
            ["partners.quotes", 7],
        ]);
        expect([...refusalsAfter(refused, 5).keys()]).toEqual(["partners.quotes"]);
        expect(refusalsAfter(refused, 9).size).toBe(0);
        expect(refusalsAfter(refused, 1)).toBe(refused);
    });

    it("names every kill switch the website draws, on the registry's keys, with the paid placements' keys the promotions pages read", () => {
        expect(FLAG_PROMOTION_ADS).toBe(SERVICE_ADS);
        expect(FLAG_PROMOTION_BOOSTS).toBe(SERVICE_BOOSTS);
        for (const key of Object.keys(KILL_SWITCHES)) expect(key).toMatch(/^[a-z][a-z0-9-]*(?:\.[a-z0-9][a-z0-9-]*)+$/);
        for (const key of PLURAL_SWITCH_NAMES) expect(KILL_SWITCHES[key]).toBeTruthy();
        expect(Object.keys(KILL_SWITCHES)).toEqual(
            expect.arrayContaining([
                "support.live-chat",
                "partners.print-floor",
                "partners.quotes",
                "print.partner-kyc",
                "revenue.publisher-plans",
                "campaigns.landing-pages",
                "marketplace.reviews",
                "users.data-export",
                "payments.gateways",
                "promotions.ads",
                "promotions.boosts",
                "publisher.spot-insights",
                "marketplace.instant-booking",
                "campaigns.multi-market",
            ])
        );
    });
});
