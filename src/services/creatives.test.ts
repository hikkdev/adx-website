import { describe, expect, it } from "vitest";
import { artworkSpec, briefOf, currentCreativeFor, deliverablesLine, designRequestStage, designedCreative, spaceNames, stanceNote } from "./creatives";
import type { CampaignCreative, CampaignSpot } from "./planner";

const creative = (over: Partial<CampaignCreative>): CampaignCreative => ({
    id: "c1",
    spotId: null,
    path: "ADX_DESIGN_AGENCY",
    status: "AWAITING_ADVERTISER",
    fileUrl: "http://files/a.png",
    fileName: "a.png",
    designedByAdx: true,
    submittedAt: "2026-10-01T00:00:00.000Z",
    resubmissionOfId: null,
    ...over,
});

const spot = (title: string, w: string | null, h: string | null, media: string): Pick<CampaignSpot, "listing" | "status"> => ({
    status: "RESERVED",
    listing: { id: title, title, city: "Bengaluru", address: "", widthFt: w, heightFt: h, estimatedDailyFootfall: null, mediaType: { id: "m", name: media, category: "OUTDOOR" }, photos: [] },
});

describe("the brief", () => {
    it("reads only a complete brief off the ADX path", () => {
        expect(briefOf({ creativePath: "ADX_DESIGN_AGENCY", creativeConfig: { objective: "Introduce", keyMessage: "Make room", style: "CLEAN_AND_MINIMAL" } })).toEqual({
            objective: "Introduce",
            keyMessage: "Make room",
            style: "CLEAN_AND_MINIMAL",
        });
        expect(briefOf({ creativePath: "ADX_DESIGN_AGENCY", creativeConfig: null })).toBeNull();
        expect(briefOf({ creativePath: "STATIC_IMAGES", creativeConfig: { objective: "x", keyMessage: "y", style: "z" } })).toBeNull();
    });

    it("names what each space needs designed", () => {
        expect(artworkSpec(spot("Whitefield billboard", "40", "20", "Billboard"))).toEqual({ kind: "Print artwork", size: "40 × 20 ft" });
        expect(artworkSpec(spot("Atrium", "24", "14", "Digital LED wall"))).toEqual({ kind: "Digital artwork", size: "24 × 14 ft" });
        expect(artworkSpec(spot("Tents", null, null, "Table tents"), { display: "STATIC", size: "A6 (x40 tables)" })).toEqual({ kind: "Print artwork", size: "A6 (x40 tables)" });
        expect(deliverablesLine([{ kind: "Print artwork", size: "40 × 20 ft" }, { kind: "Digital artwork", size: "24 × 14 ft" }])).toBe("40 × 20 ft print artwork and 24 × 14 ft digital artwork");
        expect(deliverablesLine([])).toBe("No spaces selected yet");
        expect(spaceNames([spot("A", null, null, "x"), spot("B", null, null, "x")])).toBe("A + B");
    });

    it("notes a space's stance on the campaign's content category", () => {
        const rules = [{ contentCategoryId: "cat", stance: "REQUIRES_APPROVAL" }];
        expect(stanceNote(rules, "cat", "Alcohol")).toBe("Publisher approval needed for Alcohol");
        expect(stanceNote([{ contentCategoryId: "cat", stance: "PROHIBITED" }], "cat", null)).toBe("Does not take this content");
        expect(stanceNote(rules, "other", "x")).toBeNull();
        expect(stanceNote(rules, null, "x")).toBeNull();
    });
});

describe("the design request", () => {
    const brief = { creativePath: "ADX_DESIGN_AGENCY" as const, creativeConfig: { objective: "a", keyMessage: "b", style: "CLEAN_AND_MINIMAL" } };

    it("keeps the newest row per slot", () => {
        const first = creative({ id: "c1", status: "CHANGES_REQUESTED" });
        const second = creative({ id: "c2", resubmissionOfId: "c1", submittedAt: "2026-10-02T00:00:00.000Z" });
        expect(currentCreativeFor([first, second], null)?.id).toBe("c2");
        expect(designedCreative({ creatives: [first, second] })?.id).toBe("c2");
        expect(designedCreative({ creatives: [creative({ fileUrl: null })] })).toBeNull();
    });

    it("reads the stage off the campaign", () => {
        expect(designRequestStage({ creativePath: null, creativeConfig: null, creatives: [] })).toBe("NOT_SENT");
        expect(designRequestStage({ ...brief, creatives: [] })).toBe("AWAITING_QUOTE");
        expect(designRequestStage({ ...brief, creatives: [creative({})] })).toBe("ARTWORK_READY");
        expect(designRequestStage({ ...brief, creatives: [creative({ status: "CHANGES_REQUESTED" })] })).toBe("CHANGES_REQUESTED");
        expect(designRequestStage({ ...brief, creatives: [creative({ status: "IN_REVIEW" })] })).toBe("IN_REVIEW");
        expect(designRequestStage({ ...brief, creatives: [creative({ status: "APPROVED" })] })).toBe("APPROVED");
        expect(designRequestStage({ ...brief, creatives: [creative({ status: "REJECTED" })] })).toBe("REJECTED");
    });
});

describe("DQ-1: the desk's quote before any design", () => {
    it("reads the quote's standing off the campaign while no design exists", () => {
        const brief = { creativePath: "ADX_DESIGN_AGENCY" as const, creativeConfig: { objective: "Launch", keyMessage: "Now open", style: "CLEAN_AND_MINIMAL" } };
        expect(designRequestStage({ ...brief, creatives: [], designQuoteStatus: null })).toBe("AWAITING_QUOTE");
        expect(designRequestStage({ ...brief, creatives: [], designQuoteStatus: "QUOTED" })).toBe("QUOTED");
        expect(designRequestStage({ ...brief, creatives: [], designQuoteStatus: "DECLINED" })).toBe("QUOTE_DECLINED");
        expect(designRequestStage({ ...brief, creatives: [], designQuoteStatus: "ACCEPTED" })).toBe("DESIGNING");
        /* Once the design exists, its own status tells the story. */
        expect(designRequestStage({ ...brief, creatives: [creative({ status: "AWAITING_ADVERTISER" })], designQuoteStatus: "ACCEPTED" })).toBe("ARTWORK_READY");
    });
});
