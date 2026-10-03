import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api-client", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-client")>();
    return { ...actual, api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() } };
});

import { api, ApiError } from "@/lib/api-client";
import {
    agreementLine,
    audienceFacetsOffered,
    audienceSlices,
    blocksFrom,
    CAMPAIGN_TABS,
    campaignChips,
    campaignChipStatuses,
    campaignListQuery,
    campaignSortOf,
    campaignsHref,
    campaignsService,
    campaignTabEmpty,
    campaignTabOf,
    campaignTabs,
    campaignTabStatuses,
    cancelConsequence,
    cancellable,
    cancelledMessage,
    chipOf,
    compact,
    compareMoney,
    dayLabel,
    deltaLabel,
    draftFrom,
    draftProblems,
    firstNameOf,
    greetingNameOf,
    foldSlices,
    formatMoney,
    greetingFor,
    interactionSlices,
    interactionTotal,
    landingPageError,
    landingPageOrNull,
    landingPageUrl,
    marketCapFrom,
    moneyPercent,
    moneyRatio,
    niceCeil,
    pacingChip,
    pendingGates,
    percentLabel,
    profileBars,
    refundHeadline,
    spendLabel,
    subtractMoney,
    vendorLine,
    walletCovers,
    whatsappNumber,
    windowOf,
    type CampaignAudience,
    type CampaignInteractions,
    type LandingBlock,
} from "./campaigns";

const mocked = api as unknown as Record<"get" | "post" | "patch", ReturnType<typeof vi.fn>>;

beforeEach(() => {
    mocked.get.mockReset();
    mocked.post.mockReset();
    mocked.patch.mockReset();
});

describe("the campaign list", () => {
    it("builds the server's query: q, a comma list of statuses, sort and page", () => {
        expect(campaignListQuery({})).toBe("");
        expect(campaignListQuery({ q: "  aster ", status: ["COMPLETED", "CANCELLED"], sort: "NEWEST", page: 2, pageSize: 20 })).toBe("?q=aster&status=COMPLETED,CANCELLED&sort=NEWEST&page=2&pageSize=20");
        expect(campaignListQuery({ q: "   " })).toBe("");
    });

    it("draws the app's four chips, All adding every status up", () => {
        expect(campaignChipStatuses("LIVE")).toEqual(["LIVE"]);
        expect(campaignChipStatuses("DRAFTS")).toEqual(["DRAFT"]);
        expect(campaignChipStatuses("ENDED")).toEqual(["COMPLETED", "CANCELLED"]);
        expect(campaignChipStatuses("ALL")).toEqual([]);
        const chips = campaignChips({ LIVE: 2, DRAFT: 3, SCHEDULED: 1, COMPLETED: 4, CANCELLED: 1 });
        expect(chips.map((c) => `${c.label}:${c.count}`)).toEqual(["All:11", "Live:2", "Drafts:3", "Ended:5"]);
        expect(campaignChips(undefined)[0]).toEqual({ value: "ALL", label: "All" });
    });

    it("lands the chips from before the four on the nearest one", () => {
        expect(chipOf("COMPLETED")).toBe("ENDED");
        expect(chipOf("ACTIVE")).toBe("LIVE");
        expect(chipOf("nonsense")).toBe("ALL");
        expect(chipOf(null)).toBe("ALL");
    });

    it("draws the website's six tabs, every status in exactly one of them", () => {
        expect(CAMPAIGN_TABS.map((tab) => tab.label)).toEqual(["All campaigns", "Live", "Scheduled", "Drafts", "Completed", "Cancelled"]);
        const placed = CAMPAIGN_TABS.filter((tab) => tab.value !== "ALL").flatMap((tab) => [...tab.statuses]);
        expect([...placed].sort()).toEqual(["CANCELLED", "COMPLETED", "DRAFT", "LIVE", "PAUSED", "PENDING_PAYMENT", "SCHEDULED"]);
        expect(new Set(placed).size).toBe(placed.length);
        expect(campaignTabStatuses("COMPLETED")).toEqual(["COMPLETED"]);
        expect(campaignTabStatuses("DRAFTS")).toEqual(["DRAFT", "PENDING_PAYMENT"]);
        expect(campaignTabStatuses("ALL")).toEqual([]);
    });

    it("counts every tab, zero included, and none before the counts are read", () => {
        expect(campaignTabs({ LIVE: 2, PAUSED: 1, DRAFT: 3, PENDING_PAYMENT: 1, SCHEDULED: 1, COMPLETED: 4, CANCELLED: 1 }).map((t) => `${t.label}:${t.count}`)).toEqual(["All campaigns:13", "Live:3", "Scheduled:1", "Drafts:4", "Completed:4", "Cancelled:1"]);
        expect(campaignTabs({}).map((t) => t.count)).toEqual([0, 0, 0, 0, 0, 0]);
        expect(campaignTabs(undefined).every((t) => t.count === null)).toBe(true);
    });

    it("says what an empty tab will hold", () => {
        expect(campaignTabEmpty("COMPLETED")).toMatch(/When a campaign finishes its run it moves here/);
        expect(campaignTabEmpty("nonsense")).toBe(CAMPAIGN_TABS[0]!.empty);
    });

    it("lands a tab, or a chip from before the tabs, on the nearest one", () => {
        expect(campaignTabOf("COMPLETED")).toBe("COMPLETED");
        expect(campaignTabOf("ENDED")).toBe("COMPLETED");
        expect(campaignTabOf("ACTIVE")).toBe("LIVE");
        expect(campaignTabOf("DRAFT")).toBe("DRAFTS");
        expect(campaignTabOf("cancelled")).toBe("CANCELLED");
        expect(campaignTabOf(null)).toBe("ALL");
        expect(campaignSortOf("OLDEST")).toBe("OLDEST");
        expect(campaignSortOf("sideways")).toBe("NEWEST");
    });

    it("writes the Campaigns page's address with the defaults left off", () => {
        expect(campaignsHref()).toBe("/advertiser/campaigns");
        expect(campaignsHref({ tab: "ALL", q: "  ", sort: "NEWEST" })).toBe("/advertiser/campaigns");
        expect(campaignsHref({ tab: "COMPLETED", q: "aster", sort: "OLDEST" })).toBe("/advertiser/campaigns?tab=COMPLETED&q=aster&sort=OLDEST");
    });

    it("reads a page, and an older bare array as one page", async () => {
        mocked.get.mockResolvedValueOnce({ items: [], total: 0, page: 1, pageSize: 20, counts: {} });
        await campaignsService.page({ status: ["LIVE"], q: "x" });
        expect(mocked.get).toHaveBeenCalledWith("/campaigns?q=x&status=LIVE&page=1&pageSize=20");
        mocked.get.mockResolvedValueOnce([{ id: "c1" }]);
        expect((await campaignsService.page()).total).toBe(1);
    });
});

describe("money, exact", () => {
    it("formats with Indian grouping, paise only when there are some", () => {
        expect(formatMoney("1234567.00")).toBe("₹12,34,567");
        expect(formatMoney("8333.33")).toBe("₹8,333.33");
        expect(formatMoney("8333.5", { paise: "always" })).toBe("₹8,333.50");
        expect(formatMoney("8333.99", { paise: "never" })).toBe("₹8,333");
        expect(formatMoney("-150")).toBe("−₹150");
        expect(formatMoney(null)).toBe("—");
        expect(formatMoney("abc")).toBe("—");
    });

    it("compares and subtracts in paise, never a float", () => {
        expect(compareMoney("24999.99", "25000.00")).toBe(-1);
        expect(compareMoney("25000", "25000.00")).toBe(0);
        expect(subtractMoney("25000.00", "8333.33")).toBe("16666.67");
        expect(subtractMoney("x", "1")).toBeNull();
    });

    it("draws the spend bar and its label from the same exact figures", () => {
        expect(moneyRatio("18500.00", "50000.00")).toBeCloseTo(0.37);
        expect(moneyRatio("1.00", "0.00")).toBe(0);
        expect(moneyPercent("18500.00", "50000.00")).toBe(37);
        expect(moneyPercent("1", null)).toBeNull();
        expect(spendLabel({ spendToDate: "18500.00", budget: "50000.00" })).toBe("37% of ₹50,000");
        expect(spendLabel({ spendToDate: "18500.00", budget: null })).toBeNull();
    });

    it("says a wallet covers what is due only when it holds at least that, to the paisa", () => {
        expect(walletCovers("25960.00", "25960.00")).toBe(true);
        expect(walletCovers("25959.99", "25960.00")).toBe(false);
        expect(walletCovers("30000", 25960)).toBe(true);
        expect(walletCovers(null, "1")).toBe(false);
    });
});

describe("analytics", () => {
    it("prints deltas with a sign, and nothing with nothing to compare", () => {
        expect(deltaLabel({ previous: 10, deltaPct: 12.44, provenance: "MEASURED", basis: "" })).toBe("+12.4%");
        expect(deltaLabel({ previous: 10, deltaPct: -3.2, provenance: "MEASURED", basis: "" })).toBe("−3.2%");
        expect(deltaLabel({ previous: 10, deltaPct: 0, provenance: "MEASURED", basis: "" })).toBe("No change");
        expect(deltaLabel({ previous: 0, deltaPct: null, provenance: "MEASURED", basis: "" })).toBeNull();
        expect(deltaLabel(null)).toBeNull();
    });

    it("chips the pacing, and prints compact figures and rates", () => {
        expect(pacingChip(true)).toEqual({ label: "On track", tone: "success" });
        expect(pacingChip(false)).toEqual({ label: "Behind", tone: "warning" });
        expect(pacingChip(null)).toBeNull();
        expect(compact(950)).toBe("950");
        expect(compact(85_000)).toBe("85.0K");
        expect(compact(340_000)).toBe("3.4L");
        expect(compact(12_000_000)).toBe("1.2Cr");
        expect(percentLabel(2.4)).toBe("2.4%");
        expect(percentLabel(3)).toBe("3%");
        expect(percentLabel(null)).toBe("—");
    });

    it("keeps the window to 7, 30 or 90 days", () => {
        expect(windowOf("30")).toBe(30);
        expect(windowOf("45")).toBe(7);
        expect(windowOf(null)).toBe(7);
    });

    it("asks the per-campaign and the portfolio reads with their windows and search", async () => {
        mocked.get.mockResolvedValue({});
        await campaignsService.analytics("c 1", 30);
        expect(mocked.get).toHaveBeenLastCalledWith("/campaigns/c%201/analytics?days=30");
        await campaignsService.portfolio({ search: " aster ", days: 90 });
        expect(mocked.get).toHaveBeenLastCalledWith("/campaigns/analytics?search=aster&days=90");
        await campaignsService.portfolio();
        expect(mocked.get).toHaveBeenLastCalledWith("/campaigns/analytics");
    });

    const interactions: CampaignInteractions = {
        provenance: "MEASURED",
        basis: "ADX landing page events",
        byDevice: [
            { device: "mobile", count: 7 },
            { device: null, count: 1 },
            { device: "desktop", count: 0 },
        ],
        byHour: [{ hourIst: 9, count: 3 }],
        byCity: [{ city: "Bengaluru", count: 8 }],
        byCta: [{ ctaLabel: null, count: 2 }],
    };

    it("folds the interactions one facet at a time, largest first, empties dropped", () => {
        expect(interactionSlices(interactions, "byDevice")).toEqual([
            { label: "mobile", count: 7 },
            { label: "Unknown device", count: 1 },
        ]);
        expect(interactionSlices(interactions, "byHour")).toEqual([{ label: "09:00 IST", count: 3 }]);
        expect(interactionSlices(interactions, "byCta")).toEqual([{ label: "No button", count: 2 }]);
        expect(interactionTotal(interactions)).toBe(8);
    });

    const audience = (over: Partial<CampaignAudience> = {}): CampaignAudience => ({
        provenance: "PANEL",
        vendor: "GEOIQ",
        period: "2026-09",
        basis: "Panel",
        spotsWithData: 2,
        spotsTotal: 3,
        footfall: { daily: 12000, byHour: null, byWeekday: [10, 12, 14, 14, 16, 18, 16] },
        demographics: {
            ageBands: [
                { label: "18-24", share: 20 },
                { label: "25-34", share: 45.5 },
                { label: "35+", share: 0 },
            ],
            gender: null,
            incomeBands: [],
            affinities: null,
        },
        ...over,
    });

    it("reads the audience panel: slices, the facets carried, the weekday bars", () => {
        expect(audienceSlices(audience(), "ageBands")).toEqual([
            { label: "25-34", count: 45.5 },
            { label: "18-24", count: 20 },
        ]);
        expect(audienceFacetsOffered(audience()).map((f) => f.id)).toEqual(["ageBands"]);
        expect(profileBars([1, 2], "byWeekday")).toEqual([
            { label: "Mon", value: 1 },
            { label: "Tue", value: 2 },
        ]);
        expect(profileBars([5], "byHour")[0]!.label).toBe("00");
    });

    it("names whose figures they are, and how close two vendors agree", () => {
        expect(vendorLine(audience())).toBe("GeoIQ");
        expect(vendorLine(audience({ provenanceByField: { footfall: "AZIRA", demographics: "GEOIQ", affinities: "GEOIQ" } }))).toBe("Footfall: Azira - Demographics: GeoIQ");
        expect(vendorLine(audience({ provenanceByField: { footfall: "BLENDED", demographics: "BLENDED", affinities: null } }))).toBe("Both vendors");
        expect(agreementLine(audience({ agreement: { footfall: 0.94 } }))).toBe("Both vendors agree within 6 %");
        expect(agreementLine(audience())).toBeNull();
    });

    it("chooses clean axis tops, short day labels, and folds a sixth slice into Other", () => {
        expect(niceCeil(47)).toBe(50);
        expect(niceCeil(120)).toBe(200);
        expect(niceCeil(0)).toBe(1);
        expect(niceCeil(10)).toBe(10);
        expect(dayLabel("2026-09-26")).toBe("26 Sep");
        const seven = Array.from({ length: 7 }, (_, i) => ({ label: `s${i}`, count: 7 - i }));
        const folded = foldSlices(seven);
        expect(folded).toHaveLength(6);
        expect(folded[5]).toEqual({ label: "Other", count: 3 });
        expect(foldSlices(seven.slice(0, 6))).toHaveLength(6);
    });
});

describe("cancelling and refunds", () => {
    it("lets the advertiser cancel before payment and while scheduled or live, never once run", () => {
        expect(["DRAFT", "PENDING_PAYMENT", "SCHEDULED", "LIVE"].every(cancellable)).toBe(true);
        expect(cancellable("COMPLETED")).toBe(false);
        expect(cancellable("CANCELLED")).toBe(false);
    });

    it("says what happens to the money before the click", () => {
        expect(cancelConsequence("SCHEDULED", null)).toBe("The money held for it is released back to your wallet.");
        expect(cancelConsequence("LIVE", null)).toMatch(/refund goes to ADX finance/);
        expect(cancelConsequence("PENDING_PAYMENT", { status: "PAID", fee: "1298.00" }, 10)).toBe("The spots are released and nothing is charged. 10% of the ₹1,298 reservation fee is kept; the rest goes back to your wallet.");
        expect(cancelConsequence("PENDING_PAYMENT", { status: "PAID", fee: "1298.00" })).toMatch(/^The spots.*Part of the/);
    });

    it("says what the cancel did, from the outcome", () => {
        expect(cancelledMessage({ released: false, refundNeeded: true, refundAmount: "4200.00" })).toBe("Campaign cancelled. A refund of ₹4,200 for the unused days is pending with ADX finance.");
        expect(cancelledMessage({ released: false, refundNeeded: true, refundAmount: "0.00" })).toMatch(/support will be in touch/);
        expect(cancelledMessage({ released: true, refundNeeded: false })).toMatch(/back in your wallet/);
        expect(cancelledMessage({ released: false, refundNeeded: false })).toBe("Campaign cancelled.");
    });

    it("heads the refund block by where finance stands", () => {
        expect(refundHeadline({ id: "r", amount: "4200.00", status: "PENDING" })).toEqual({ label: "Refund of ₹4,200 pending with ADX finance", tone: "info" });
        expect(refundHeadline({ id: "r", amount: "4200.00", status: "RELEASED" }).tone).toBe("success");
        expect(refundHeadline({ id: "r", amount: "4200.00", status: "REJECTED" }).label).toMatch(/refused/);
    });

    it("posts the cancel with its reason and the spot review with its stars", async () => {
        mocked.post.mockResolvedValue({});
        await campaignsService.cancel("c1", "Plans changed");
        expect(mocked.post).toHaveBeenLastCalledWith("/campaigns/c1/cancel", { reason: "Plans changed" });
        await campaignsService.reviewSpot("c1", "s1", { rating: 4 });
        expect(mocked.post).toHaveBeenLastCalledWith("/campaigns/c1/spots/s1/review", { rating: 4 });
    });
});

describe("the ADX landing page", () => {
    const blocks: LandingBlock[] = [
        { type: "hero", headline: "Festive sale", subheadline: "Up to 40% off" },
        { type: "offer", title: "This week only", body: "Across the store", highlight: "40% off" },
        { type: "cta", label: "Chat with us", href: "https://wa.me/919845012345" },
        { type: "contact", phone: "9845012345", email: "hi@aster.example", formEnabled: false },
        { type: "gallery", images: [], placeholders: 3 },
    ];

    it("prints the public address at the server's root, beside /t", () => {
        expect(landingPageUrl("http://localhost:3000/api/v1", { url: "/p/aster-festive" })).toBe("http://localhost:3000/p/aster-festive");
        expect(landingPageUrl("https://api.adx.in/api/v1/", { url: "/p/x" })).toBe("https://api.adx.in/p/x");
    });

    it("turns the blocks into fields and back, WhatsApp read off the wa.me link", () => {
        const draft = draftFrom(blocks, null);
        expect(draft.ctaAction).toBe("WHATSAPP");
        expect(draft.formEnabled).toBe(false);
        const again = blocksFrom(draft, null);
        expect(again.find((b) => b.type === "cta")).toEqual({ type: "cta", label: "Chat with us", href: "https://wa.me/919845012345" });
        expect(again).toHaveLength(5);
    });

    it("leaves out an empty offer, and makes Call the contact block's phone with no button link", () => {
        const draft = { ...draftFrom(blocks, "9000000000"), offerTitle: "", offerBody: "", ctaAction: "CALL" as const, phone: "" };
        const out = blocksFrom(draft, "9000000000");
        expect(out.some((b) => b.type === "offer")).toBe(false);
        expect(out.find((b) => b.type === "cta")).toEqual({ type: "cta", label: "Chat with us", href: null });
        expect(out.find((b) => b.type === "contact")).toMatchObject({ phone: "9000000000" });
    });

    it("adds India's code to a ten-digit number and names what stops a save", () => {
        expect(whatsappNumber("98450 12345")).toBe("919845012345");
        expect(whatsappNumber("+44 20 7946 0000")).toBe("442079460000");
        const draft = draftFrom(blocks, null);
        expect(draftProblems({ ...draft, headline: " " })).toContain("The page needs a headline.");
        expect(draftProblems({ ...draft, ctaAction: "LINK", ctaHref: "aster.example" })).toContain("The button needs a link that starts with https://.");
        expect(draftProblems({ ...draft, email: "nope" })).toContain("That email address does not look right.");
        expect(draftProblems(draft)).toEqual([]);
    });

    it("says the builder's refusals in the page's words", () => {
        expect(landingPageError(new ApiError(429, "QUOTA_EXHAUSTED", "x"), "f")).toMatch(/used up/);
        expect(landingPageError(new ApiError(503, "AI_UNAVAILABLE", "x"), "f")).toMatch(/could not draft/);
        expect(landingPageError(new ApiError(503, "FEATURE_OFF", "x"), "f")).toMatch(/switched off/);
        expect(landingPageError(new Error("boom"), "fallback")).toBe("fallback");
    });

    it("reads a missing page as none, and saves, drafts and publishes on the builder's routes", async () => {
        mocked.get.mockRejectedValueOnce(new ApiError(404, "NOT_FOUND", "no page"));
        expect(await landingPageOrNull("c1")).toBeNull();
        mocked.get.mockRejectedValueOnce(new ApiError(500, "INTERNAL_ERROR", "boom"));
        await expect(landingPageOrNull("c1")).rejects.toThrow("boom");
        mocked.post.mockResolvedValue({});
        mocked.patch.mockResolvedValue({});
        await campaignsService.generateLandingPage("c1");
        expect(mocked.post).toHaveBeenLastCalledWith("/campaigns/c1/landing-page/generate", {});
        await campaignsService.patchLandingPage("c1", { blocks });
        expect(mocked.patch).toHaveBeenLastCalledWith("/campaigns/c1/landing-page", { blocks });
        await campaignsService.publishLandingPage("c1");
        expect(mocked.post).toHaveBeenLastCalledWith("/campaigns/c1/landing-page/publish", {});
    });
});

describe("home", () => {
    it("greets off the person's own clock", () => {
        expect(greetingFor(new Date(2026, 8, 26, 8))).toBe("Good morning");
        expect(greetingFor(new Date(2026, 8, 26, 13))).toBe("Good afternoon");
        expect(greetingFor(new Date(2026, 8, 26, 18))).toBe("Good evening");
        expect(greetingFor(new Date(2026, 8, 26, 23))).toBe("Good night");
    });

    it("uses a first name, never a phone number", () => {
        expect(firstNameOf("Meera S")).toBe("Meera");
        expect(firstNameOf("+919845012345")).toBeNull();
        expect(firstNameOf(null)).toBeNull();
        /* 29 Sep 2026: the greeting is the person's — their first name, else the first word of their name; never the business. */
        expect(greetingNameOf({ firstName: "Meera", name: "Aster Home Pvt Ltd" })).toBe("Meera");
        expect(greetingNameOf({ firstName: " ", name: "Ravi Kumar" })).toBe("Ravi");
        expect(greetingNameOf({ firstName: null, name: "+919845012345" })).toBeNull();
        expect(greetingNameOf(null)).toBeNull();
    });

    it("walks the billing details, then the agreement — not the verification or the wallet", () => {
        expect(pendingGates({ blockedBy: ["AGREEMENT", "KYC", "PROFILE", "FUNDS"] })).toEqual(["PROFILE", "AGREEMENT"]);
        expect(pendingGates({ blockedBy: [], launchBlockedBy: ["AGREEMENT"] })).toEqual(["AGREEMENT"]);
        expect(pendingGates(null)).toEqual([]);
    });

    it("learns the markets cap off the server's refusal", () => {
        expect(marketCapFrom("A campaign can target at most 3 markets.")).toBe(3);
        expect(marketCapFrom("Something else")).toBeNull();
    });
});
