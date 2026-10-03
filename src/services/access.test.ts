import { afterEach, describe, expect, it, vi } from "vitest";
import {
    accessService,
    askSentence,
    changeMeta,
    changeTitle,
    distanceLine,
    distanceShort,
    grantedSentence,
    grantMeta,
    grantTitle,
    liveGrants,
    qrImageUrl,
    qrShareLink,
    scanMeta,
    scanTitle,
    shareText,
    spanWords,
} from "./access";

type Call = { url: string; init: RequestInit };

function stubFetch(answer: unknown): Call[] {
    const calls: Call[] = [];
    vi.stubGlobal(
        "fetch",
        vi.fn(async (url: string, init: RequestInit) => {
            calls.push({ url, init });
            return new Response(JSON.stringify({ success: true, data: answer }), { status: 200, headers: { "Content-Type": "application/json" } });
        })
    );
    return calls;
}

afterEach(() => {
    vi.unstubAllGlobals();
});

describe("what a scan asks for", () => {
    it("words the span", () => {
        expect(spanWords(60)).toBe("for 1 hour");
        expect(spanWords(120)).toBe("for 2 hours");
        expect(spanWords(45)).toBe("for 45 minutes");
        expect(spanWords(24 * 60)).toBe("for the day");
    });

    it("words an access ask by side, and an onboarding claim by default", () => {
        const ask = { kind: "ACCESS" as const, ask: { scope: "LISTINGS" as const, reason: "Fix my rate", durationMinutes: 120 } };
        expect(askSentence(ask, "PUBLISHER")).toBe('Asks to work on your listings for 2 hours — "Fix my rate".');
        /* An advertiser has no listings; any scope is the profile. */
        expect(askSentence(ask, "ADVERTISER")).toBe('Asks to work on your profile and documents for 2 hours — "Fix my rate".');
        expect(askSentence({ kind: undefined, ask: null }, "PUBLISHER")).toMatch(/^Asks to complete your onboarding with you — your details/);
    });

    it("says who is in once the owner allowed it", () => {
        const granted = grantedSentence({ kind: "ACCESS", ask: { scope: "PROFILE", reason: "", durationMinutes: 60 }, agent: { id: "a", displayId: "ADX-1", city: null, name: "Ravi", avatarUrl: null } }, "ADVERTISER");
        expect(granted.title).toBe("Ravi is in");
        expect(granted.body).toMatch(/^Ravi can now work on your profile and documents for 1 hour/);
        expect(grantedSentence({ kind: "ONBOARDING", ask: null, agent: null }, "PUBLISHER").title).toBe("Onboarding with your agent");
    });

    it("says how far the scan was, when both sides had a fix", () => {
        expect(distanceLine(null)).toBeNull();
        expect(distanceLine(38.6)).toMatch(/about 39 m/);
        expect(distanceLine(2400)).toMatch(/about 2.4 km/);
        expect(distanceShort(900)).toBe("900 m away");
    });
});

describe("the code", () => {
    it("links the picture and the public card", () => {
        expect(qrImageUrl("q 1")).toMatch(/\/qr\/q%201\/image\.png$/);
        expect(qrShareLink("tok", "https://adx.in")).toBe("https://adx.in/q/tok");
        // 28 Sep 2026: the code's id is the account's, and says so.
        expect(shareText("PUBLISHER", "PUB-2509-2601", "https://adx.in/q/tok")).toBe("My spaces on ADX (Publisher account ID PUB-2509-2601): https://adx.in/q/tok");
        expect(shareText("ADVERTISER", "ADV-2509-2603", "l")).toBe("Find me on ADX (Advertiser account ID ADV-2509-2603): l");
        expect(shareText("ADVERTISER", null, "l")).toBe("Find me on ADX: l");
    });

    it("sends the fix when it has one, and decides a scan on the side's route", async () => {
        const calls = stubFetch({ qrId: "q1", token: "t", expiresAt: null });
        await accessService.qr("PUBLISHER", { latitude: 12.9, longitude: 77.6 });
        await accessService.qr("ADVERTISER");
        await accessService.status("ADVERTISER");
        await accessService.decide("PUBLISHER", "s1", "approve");
        await accessService.decide("ADVERTISER", "s2", "decline");
        await accessService.accessLog("PUBLISHER");
        expect(calls.map((c) => `${c.init.method} ${c.url.replace(/^.*\/api\/v1/, "")}`)).toEqual([
            "GET /publishers/me/qr?latitude=12.9&longitude=77.6",
            "GET /advertisers/me/qr",
            "GET /advertisers/me/qr/status",
            "POST /publishers/me/qr/scans/s1/approve",
            "POST /advertisers/me/qr/scans/s2/decline",
            "GET /publishers/me/access-log",
        ]);
    });

    it("binds a grant to a ticket, never to an agent id", async () => {
        const calls = stubFetch({ grant: { id: "g1" }, token: "t", warning: "w" });
        await accessService.issueGrant({ publisherId: "p1", reason: "The rate on my gym decal is wrong", scope: "LISTINGS", supportTicketId: "t1" });
        await accessService.revokeGrant("g1");
        await accessService.raiseTicket({ title: "Wrong rate", description: "I cannot change it myself" });
        expect(JSON.parse(String(calls[0]!.init.body))).toEqual({ publisherId: "p1", reason: "The rate on my gym decal is wrong", scope: "LISTINGS", supportTicketId: "t1" });
        expect(calls[1]!.url).toMatch(/\/access-grants\/g1\/revoke$/);
        expect(JSON.parse(String(calls[2]!.init.body))).toEqual({ title: "Wrong rate", description: "I cannot change it myself", category: "listings" });
    });
});

describe("the access record", () => {
    it("names each row", () => {
        const scan = { id: "s", at: "2026-09-20T10:00:00Z", outcome: "USER_DECLINED", distanceM: 12, decidedAt: null, agent: { name: "Ravi", displayId: "ADX-9" } };
        expect(scanTitle(scan)).toBe("Ravi · ADX-9");
        expect(scanMeta(scan)).toMatch(/Declined by you · 12 m away$/);
        const grant = { id: "g", purpose: "ONBOARDING", scope: "PROFILE", status: "REVOKED", from: null, until: null, revokedAt: "2026-09-20T10:00:00Z" };
        expect(grantTitle(grant)).toBe("Onboarding · your profile");
        expect(grantMeta(grant)).toMatch(/^withdrawn /);
        expect(grantMeta({ ...grant, revokedAt: null, status: "EXPIRED" })).toBe("Ended");
        const change = { id: "c", at: "2026-09-20T10:00:00Z", action: "PUBLISHER_UPDATED", fields: ["name", "city"], grantId: null, by: { name: null } };
        expect(changeTitle(change)).toBe("Changed: name, city");
        expect(changeTitle({ ...change, action: "KYC_SUBMITTED" })).toBe("Documents submitted");
        expect(changeMeta(change)).toMatch(/^by an ADX agent · /);
    });

    it("keeps the grants still in force", () => {
        expect(liveGrants([{ status: "PENDING" }, { status: "ACTIVE" }, { status: "EXPIRED" }, { status: "REVOKED" }] as const).map((g) => g.status)).toEqual(["PENDING", "ACTIVE"]);
    });
});
