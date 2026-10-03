import { afterEach, describe, expect, it, vi } from "vitest";
import { referBody, referralsService, referralStanding, referReady, sentLine, shareMessage, totalsLine } from "./referrals";

afterEach(() => {
    vi.unstubAllGlobals();
});

describe("refer a business", () => {
    it("says where a referred business stands", () => {
        expect(referralStanding({ creditedAt: "x", lead: null })).toEqual({ label: "Live on ADX · credit paid", tone: "success" });
        expect(referralStanding({ creditedAt: null, lead: null }).label).toBe("Received");
        const lead = (stage: string) => ({ creditedAt: null, lead: { displayId: null, businessName: "B", stage, status: "OPEN", side: "PUBLISHER", city: null } }) as Parameters<typeof referralStanding>[0];
        expect(referralStanding(lead("ACTIVATED")).label).toBe("Live on ADX");
        expect(referralStanding(lead("ONBOARDING")).label).toBe("Signed up, getting set up");
        expect(referralStanding(lead("LOST")).label).toBe("Did not go ahead");
        expect(referralStanding(lead("CONTACTED")).label).toBe("Being worked by ADX");
    });

    it("writes the share line by side", () => {
        const link = { code: "ABC", url: "https://adx.in/r/ABC" };
        expect(shareMessage(link, "PUBLISHER")).toBe("Your wall, shop front or building could earn every month on ADX. Sign up with my link: https://adx.in/r/ABC");
        expect(shareMessage(link, "ADVERTISER")).toMatch(/^Advertise on real walls/);
        expect(shareMessage(link)).toMatch(/^Earn from your wall, or advertise/);
    });

    it("needs a name and a whole number, and sends the optional fields only when filled", () => {
        expect(referReady({ businessName: "Sharma Sweets", phone: "98765 43210" })).toBe(true);
        expect(referReady({ businessName: " ", phone: "9876543210" })).toBe(false);
        expect(referReady({ businessName: "S", phone: "98765" })).toBe(false);
        expect(referBody({ side: "ADVERTISER", businessName: " Sharma Sweets ", phone: " 9876543210 ", contactName: "", city: " Mysuru " })).toEqual({ side: "ADVERTISER", businessName: "Sharma Sweets", phone: "9876543210", city: "Mysuru" });
    });

    it("thanks the person either way", () => {
        expect(sentLine("Sharma Sweets ", { alreadyKnown: false })).toBe("Sharma Sweets is in. ADX will reach out.");
        expect(sentLine("Sharma Sweets", { alreadyKnown: true })).toBe("Sharma Sweets was already with ADX — thank you anyway.");
        expect(totalsLine({ referred: 3, activated: 1, credited: "500.00" })).toBe("3 referred · 1 live · ₹500.00 earned");
    });

    it("reads and posts on the referral routes", async () => {
        const calls: { url: string; init: RequestInit }[] = [];
        vi.stubGlobal(
            "fetch",
            vi.fn(async (url: string, init: RequestInit) => {
                calls.push({ url, init });
                return new Response(JSON.stringify({ success: true, data: {} }), { status: 200 });
            })
        );
        await referralsService.mine();
        await referralsService.refer({ side: "PUBLISHER", businessName: "B", phone: "9876543210" });
        expect(calls.map((c) => `${c.init.method} ${c.url.replace(/^.*\/api\/v1/, "")}`)).toEqual(["GET /leads/referrals/me", "POST /leads/referrals"]);
    });
});
