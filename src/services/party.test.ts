import { beforeEach, describe, expect, it, vi } from "vitest";

const { calls, record } = vi.hoisted(() => {
    const calls: { method: string; path: string; body?: unknown; options?: unknown }[] = [];
    const record = (method: string) => async (path: string, body?: unknown, options?: unknown) => {
        calls.push({ method, path, body, options });
        return {};
    };
    return { calls, record };
});
vi.mock("@/lib/api-client", () => ({
    api: {
        get: async (path: string, options?: unknown) => {
            calls.push({ method: "GET", path, options });
            return {};
        },
        post: record("POST"),
        patch: record("PATCH"),
    },
}));

import {
    accountIdLine,
    ADX_ID_LABEL,
    basicsBody,
    basicsFrom,
    basicsReady,
    birthDateFault,
    birthDateOf,
    businessNameFrom,
    dateOfBirthProblem,
    inviteService,
    isAdult,
    isInviteCode,
    isoToday,
    isoYearsAgo,
    ORDER_AGE_HINT,
    proposalLine,
    qrService,
    referralBody,
    referralService,
    scanRoleFor,
    signupService,
} from "./party";

beforeEach(() => {
    calls.length = 0;
});

describe("QR-6 and QR-22: the two sign-up steps", () => {
    it("records the consent and sends the basics to the person's own row", async () => {
        await signupService.consent();
        await signupService.basics({ firstName: " Asha ", lastName: "Rao ", dateOfBirth: "1990-04-12", gender: "" });
        await signupService.basics({ firstName: "Asha", lastName: "Rao", dateOfBirth: "1990-04-12", gender: "FEMALE" });
        /* 29 Sep 2026: no date of birth given, no key sent — the server is never asked to store an empty one. */
        await signupService.basics({ firstName: "Asha", lastName: "Rao", dateOfBirth: "", gender: "" });
        expect(calls.map((c) => [c.method, c.path, c.body])).toEqual([
            ["POST", "/users/me/consent", {}],
            ["PATCH", "/users/me", { firstName: "Asha", lastName: "Rao", dateOfBirth: "1990-04-12" }],
            ["PATCH", "/users/me", { firstName: "Asha", lastName: "Rao", dateOfBirth: "1990-04-12", gender: "FEMALE" }],
            ["PATCH", "/users/me", { firstName: "Asha", lastName: "Rao" }],
        ]);
    });

    it("keeps any real date of birth — under 18 included — and refuses only a future or impossible one (29 Sep 2026)", () => {
        const now = new Date(2026, 8, 26, 12);
        expect(isoYearsAgo(18, now)).toBe("2008-09-26");
        expect(isoToday(now)).toBe("2026-09-26");
        expect(dateOfBirthProblem("", now)).toBe("Pick your date of birth.");
        expect(dateOfBirthProblem("1990-02-30", now)).toBe("That is not a real date.");
        expect(dateOfBirthProblem("2008-09-27", now)).toBeNull();
        expect(dateOfBirthProblem("2020-01-01", now)).toBeNull();
        expect(dateOfBirthProblem("2026-09-26", now)).toBeNull();
        expect(dateOfBirthProblem("2026-09-27", now)).toBe("That date is in the future.");
        expect(dateOfBirthProblem("2008-09-26", now)).toBeNull();
        expect(dateOfBirthProblem("1900-01-01", now)).toBe("That date is too long ago.");
        expect(ORDER_AGE_HINT).toBe("You need to be 18 or over to place orders.");
    });

    it("counts calendar days, the server's rule — today is the latest birthday; 120 years back to the day", () => {
        const today = new Date(2026, 8, 29, 9);
        expect(birthDateFault("2026-09-29", today)).toBeNull();
        expect(birthDateFault("2026-09-30", today)).toBe("future");
        expect(birthDateFault("2008-09-30", today)).toBeNull();
        expect(birthDateFault("1906-09-29", today)).toBeNull();
        expect(birthDateFault("1906-09-28", today)).toBe("too-old");
        expect(birthDateFault("1990-02-30", today)).toBe("not-a-day");
        expect(birthDateFault("29/09/2008", today)).toBe("format");
    });

    it("says 18 or over by the same calendar — the 18th birthday may be today", () => {
        const today = new Date(2026, 8, 29, 9);
        expect(isAdult("2008-09-29", today)).toBe(true);
        expect(isAdult("2008-09-30", today)).toBe(false);
        expect(isAdult("1990-04-12", today)).toBe(true);
        expect(isAdult("2026-09-30", today)).toBe(false);
        expect(isAdult("1906-09-28", today)).toBe(false);
        expect(isAdult("1990-02-30", today)).toBe(false);
        expect(isAdult("", today)).toBe(false);
        /* A 29 February birthday falls on 1 March in a common year… */
        expect(isAdult("2008-02-29", new Date(2026, 1, 28, 9))).toBe(false);
        expect(isAdult("2008-02-29", new Date(2026, 2, 1, 9))).toBe(true);
        /* …and on a 29 February, eighteen years back is the 28th, not 1 March. */
        expect(isoYearsAgo(18, new Date(2028, 1, 29, 9))).toBe("2010-02-28");
        expect(isAdult("2010-03-01", new Date(2028, 1, 29, 9))).toBe(false);
        expect(isAdult("2010-02-28", new Date(2028, 1, 29, 9))).toBe(true);
    });

    it("is ready with both names; the date of birth and the gender are optional, a date given must be real", () => {
        expect(basicsReady({ firstName: "Asha", lastName: "Rao", dateOfBirth: "1990-04-12" })).toBe(true);
        expect(basicsReady({ firstName: "Asha", lastName: " ", dateOfBirth: "1990-04-12" })).toBe(false);
        expect(basicsReady({ firstName: " ", lastName: "Rao", dateOfBirth: "" })).toBe(false);
        expect(basicsReady({ firstName: "Asha", lastName: "Rao", dateOfBirth: "" })).toBe(true);
        /* Under 18 is no reason to hold the step up — only an order asks. */
        expect(basicsReady({ firstName: "Asha", lastName: "Rao", dateOfBirth: isoYearsAgo(12) })).toBe(true);
        expect(basicsReady({ firstName: "Asha", lastName: "Rao", dateOfBirth: isoYearsAgo(-1) })).toBe(false);
        expect(basicsReady({ firstName: "Asha", lastName: "Rao", dateOfBirth: "1990-02-30" })).toBe(false);
        expect(basicsBody({ firstName: "a", lastName: "b", dateOfBirth: "1990-01-01", gender: "OTHER" })).toEqual({ firstName: "a", lastName: "b", dateOfBirth: "1990-01-01", gender: "OTHER" });
        expect(basicsBody({ firstName: "a", lastName: "b", dateOfBirth: "", gender: "" })).toEqual({ firstName: "a", lastName: "b" });
        expect(birthDateOf("1990-04-12T00:00:00.000Z")).toBe("1990-04-12");
        expect(birthDateOf(null)).toBe("");
    });
});

describe("QR-27: a scanned code, signed in", () => {
    it("scans as the side the app would", async () => {
        expect(scanRoleFor(["ADVERTISER"])).toBe("ADVERTISER");
        expect(scanRoleFor(["ADVERTISER", "PUBLISHER"])).toBe("PUBLISHER");
        expect(scanRoleFor([])).toBe("PUBLISHER");
        await qrService.resolve("tok", "ADVERTISER");
        expect(calls[0]).toMatchObject({ method: "POST", path: "/qr/resolve", body: { token: "tok", role: "ADVERTISER" } });
    });
});

describe("LH7: the invite link", () => {
    it("knows a code when it sees one", () => {
        expect(isInviteCode("AB12CD34")).toBe(true);
        expect(isInviteCode("ab12")).toBe(false);
        expect(isInviteCode("AB12-CD34")).toBe(false);
    });

    it("opens, asks for a code, verifies, links, and asks for a call — each at its own door", async () => {
        await inviteService.open("ab12cd34");
        await inviteService.sendOtp("AB12CD34", "+919876543210");
        await inviteService.verify("AB12CD34", { mobile: "+919876543210", otp: "123456", name: "Skyline", accountType: "BUSINESS" });
        await inviteService.link("AB12CD34", { accountType: "INDIVIDUAL" });
        await inviteService.callback("AB12CD34");
        await inviteService.callback("AB12CD34", "After 5 pm");
        await inviteService.acceptProposal("AB12CD34", "p 1");
        expect(calls.map((c) => [c.method, c.path, c.body, (c.options as { anonymous?: boolean } | undefined)?.anonymous ?? false])).toEqual([
            ["GET", "/j/AB12CD34", undefined, true],
            ["POST", "/j/AB12CD34/otp", { mobile: "+919876543210" }, true],
            ["POST", "/j/AB12CD34/verify", { mobile: "+919876543210", otp: "123456", name: "Skyline", accountType: "BUSINESS" }, true],
            ["POST", "/j/AB12CD34/link", { accountType: "INDIVIDUAL" }, false],
            ["POST", "/j/AB12CD34/callback", {}, true],
            ["POST", "/j/AB12CD34/callback", { note: "After 5 pm" }, true],
            ["POST", "/j/AB12CD34/proposals/p%201/accept", {}, true],
        ]);
    });

    it("says what each proposal priced", () => {
        expect(proposalLine({ kind: "RATE_ESTIMATE", payload: { perDay: "450.00", perMonth: "13500.00" } })).toBe("Your space could earn about ₹450 a day (₹13,500 a month).");
        expect(proposalLine({ kind: "CAMPAIGN_ESTIMATE", payload: { spots: 3, days: 30, perSpotPerDay: "500", amount: "45000" } })).toBe("3 spaces for 30 days at ₹500 a space a day: ₹45,000 in all.");
        expect(proposalLine({ kind: "PACKAGE_QUOTE", payload: { name: "Growth", perMonth: "4999", total: "14997", months: 3 } })).toBe("Growth — ₹4,999 a month, ₹14,997 for 3 months.");
        expect(proposalLine({ kind: "OTHER", payload: {} })).toBe("A proposal from your ADX contact.");
    });
});

describe("LH3: a referral link", () => {
    it("sends the lead without a session, empty optionals dropped", async () => {
        await referralService.submit("REF12345", { side: "PUBLISHER", businessName: " Skyline ", phone: " 9876543210 ", contactName: "", city: "Bengaluru", message: " ", website: "" });
        expect(calls[0]).toMatchObject({ method: "POST", path: "/leads/inbound/referral/REF12345", body: { side: "PUBLISHER", businessName: "Skyline", phone: "9876543210", city: "Bengaluru" }, options: { anonymous: true } });
        expect(referralBody({ side: "ADVERTISER", businessName: "x", phone: "1", website: "bot" }).website).toBe("bot");
    });
});

/*
 * 28 Sep 2026 — the owner's production test: an account that named itself
 * "Satyapal Raj" on the side form was asked its name again on the basics,
 * with every field empty, at every sign-in until it typed them.
 */
describe("never asked twice: what the basics open with", () => {
    const mobile = "+919507842149";

    it("opens with the stored names, date of birth and gender", () => {
        expect(basicsFrom({ mobile, firstName: "Asha", lastName: "Rao", name: "Asha Rao", dateOfBirth: "1990-05-17", gender: "FEMALE" })).toEqual({
            firstName: "Asha",
            lastName: "Rao",
            dateOfBirth: "1990-05-17",
            gender: "FEMALE",
        });
    });

    it("splits the display name the way Settings does when the two names are not stored", () => {
        expect(basicsFrom({ mobile, name: "Anand Kumar Rao", firstName: null, lastName: null })).toMatchObject({ firstName: "Anand Kumar", lastName: "Rao" });
        expect(basicsFrom({ mobile, name: "Cher", firstName: null, lastName: null })).toMatchObject({ firstName: "Cher", lastName: "" });
    });

    it("falls back to the name an individual gave on the side form — the owner's account", () => {
        const owner = {
            mobile,
            name: null,
            firstName: null,
            lastName: null,
            dateOfBirth: null,
            gender: null,
            advertiserProfile: { displayId: "ADV-2509-2603", name: "Satyapal Raj", type: "INDIVIDUAL" },
            publisherProfile: null,
        };
        expect(basicsFrom(owner)).toEqual({ firstName: "Satyapal", lastName: "Raj", dateOfBirth: "", gender: "" });
    });

    it("never takes a business's name, or the number a row is opened under, for the person's", () => {
        expect(basicsFrom({ mobile, name: null, firstName: null, lastName: null, publisherProfile: { name: "Acme Outdoor", type: "BUSINESS" } })).toMatchObject({ firstName: "", lastName: "" });
        expect(basicsFrom({ mobile, name: null, firstName: null, lastName: null, advertiserProfile: { name: mobile, type: "INDIVIDUAL" } })).toMatchObject({ firstName: "", lastName: "" });
        expect(basicsFrom({ mobile, name: mobile, firstName: null, lastName: null })).toMatchObject({ firstName: "", lastName: "" });
    });

    it("drops a gender the form does not offer", () => {
        expect(basicsFrom({ mobile, gender: "UNKNOWN" }).gender).toBe("");
    });

    it("offers a second side the business name the account already gave the first", () => {
        expect(businessNameFrom({ mobile, advertiserProfile: { name: "Raj Traders", companyName: "Raj Traders Pvt Ltd", type: "COMMERCIAL" } })).toBe("Raj Traders Pvt Ltd");
        expect(businessNameFrom({ mobile, publisherProfile: { name: "Acme Outdoor", type: "BUSINESS" } })).toBe("Acme Outdoor");
        expect(businessNameFrom({ mobile, advertiserProfile: { name: "Satyapal Raj", type: "INDIVIDUAL" } })).toBe("");
        expect(businessNameFrom({ mobile, publisherProfile: { name: mobile, type: "BUSINESS" } })).toBe("");
    });
});

describe("one id per person, the account's named as the account's", () => {
    it("labels each side's id by the account it names", () => {
        expect(ADX_ID_LABEL).toBe("Your ADX ID");
        expect(accountIdLine("ADVERTISER", "ADV-2509-2603")).toBe("Advertiser account ID ADV-2509-2603");
        expect(accountIdLine("PUBLISHER", "PUB-2909-2601")).toBe("Publisher account ID PUB-2909-2601");
        expect(accountIdLine("PRINT_PARTNER", "PRT-2609-2601")).toBe("Print partner ID PRT-2609-2601");
        expect(accountIdLine("ADVERTISER", null)).toBeNull();
    });
});
