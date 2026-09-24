import { describe, expect, it } from "vitest";
import { areaSqFt, documentSlotsFor, isDigitalMediaType, matchedSizeClass, normalisePlate, offeredMediaTypes, rateLabel, ratePerDayFrom, requestedUpdatesOf, reviewStageOf, rupees, shortDate, statusChip, trimDecimal } from "./listing-editor";

describe("measurements and money", () => {
    it("multiplies the tape and trims the zeros", () => {
        expect(areaSqFt("40", "20")).toBe("800");
        expect(areaSqFt("6.5", "4")).toBe("26");
        expect(areaSqFt("", "4")).toBeNull();
        expect(trimDecimal("40.00")).toBe("40");
        expect(trimDecimal("12.50")).toBe("12.5");
    });
    it("derives the daily rate the way the server does", () => {
        expect(ratePerDayFrom("12600", "PER_WEEK", null)).toBe("1800.00");
        expect(ratePerDayFrom("30000", "PER_MONTH", null)).toBe("1000.00");
        expect(ratePerDayFrom("2", "PER_SQFT_PER_DAY", "800")).toBe("1600.00");
        expect(ratePerDayFrom("2", "PER_SQFT_PER_DAY", null)).toBeNull();
        expect(ratePerDayFrom("abc", "PER_DAY", null)).toBeNull();
    });
    it("prints rupees in Indian grouping and the rate in the publisher's unit", () => {
        expect(rupees("12600")).toBe("₹12,600");
        expect(rupees(1250000)).toBe("₹12,50,000");
        expect(rateLabel({ basePrice: "6000", pricingUnit: "PER_WEEK", ratePerDay: "857.14" })).toBe("₹6,000 / week");
        expect(rateLabel({ basePrice: null, pricingUnit: "PER_DAY", ratePerDay: "857.14" })).toBe("₹857 / day");
        expect(shortDate("2026-10-26")).toBe("26 Oct 2026");
    });
});

describe("the catalogue", () => {
    const types = [
        { id: "a", name: "Mall — LED Wall", slug: "a", category: "INDOOR" as const, description: null, venueTypeId: "mall", formatGroup: "Digital Displays", sizeClassIds: [], materialIds: [] },
        { id: "b", name: "Mall — Mirror Decals", slug: "b", category: "INDOOR" as const, description: null, venueTypeId: "mall", formatGroup: "Decals", sizeClassIds: [], materialIds: [] },
        { id: "c", name: "Standard hoarding", slug: "c", category: "OUTDOOR" as const, description: null, venueTypeId: null, formatGroup: null, sizeClassIds: [], materialIds: [] },
    ];
    it("offers only the venue's own formats and knows which carry a loop", () => {
        expect(offeredMediaTypes(types, "mall", "INDOOR").map((t) => t.id)).toEqual(["a", "b"]);
        expect(offeredMediaTypes(types, null, "OUTDOOR").map((t) => t.id)).toEqual(["c"]);
        expect(isDigitalMediaType(types[0])).toBe(true);
        expect(isDigitalMediaType(types[1])).toBe(false);
        expect(isDigitalMediaType({ name: "Screen-printed vinyl", formatGroup: null })).toBe(false);
    });
    it("finds a size class by exact dimensions only", () => {
        const sizes = [{ id: "s", name: "40 × 20", slug: "s", widthFt: "40.00", heightFt: "20.00" }];
        expect(matchedSizeClass(sizes, "40", "20")?.id).toBe("s");
        expect(matchedSizeClass(sizes, "40", "21")).toBeNull();
    });
    it("normalises a plate and lists the papers per category", () => {
        expect(normalisePlate("ka 01 ab-1234")).toBe("KA01AB1234");
        expect(documentSlotsFor("OUTDOOR").map((s) => s.kind)).toEqual(["OWNER_NOC", "ADDRESS_PROOF", "DISPLAY_AGREEMENT", "MUNICIPAL_PERMIT"]);
        expect(documentSlotsFor("INDOOR")).toHaveLength(3);
        expect(documentSlotsFor("TRANSIT")[0]).toMatchObject({ kind: "VEHICLE_RC", required: true });
        expect(documentSlotsFor("MEDIA").find((s) => s.rateCard)?.title).toBe("Current Rate Card");
    });
});

describe("where a listing stands", () => {
    it("reads the stage and the chip off the status", () => {
        expect(reviewStageOf({ status: "PENDING_REVIEW", rejectionReason: null, submittedAt: "x" })).toBe("DOCUMENT_REVIEW");
        expect(reviewStageOf({ status: "AWAITING_SITE_VERIFICATION", rejectionReason: null, submittedAt: "x" })).toBe("FIELD_VERIFICATION");
        expect(reviewStageOf({ status: "ACTIVE", rejectionReason: null, submittedAt: "x" })).toBe("LIVE");
        expect(reviewStageOf({ status: "DRAFT", rejectionReason: "Add a sharper photo.", submittedAt: "x" })).toBe("CHANGES_REQUESTED");
        expect(statusChip({ status: "ACTIVE", rejectionReason: null, submittedAt: null })).toEqual({ label: "Live", tone: "success" });
        expect(statusChip({ status: "DRAFT", rejectionReason: "x", submittedAt: null }).label).toBe("Updates requested");
    });
    it("splits a send-back reason into the requests the frame lists", () => {
        const updates = requestedUpdatesOf("1. Location photo: add a sharper wide-context view showing the placement.\n2. Owner permission — the owner name and signature need to be readable.\n3. Address clarification: explain the difference between the venue address and the document.");
        expect(updates).toHaveLength(3);
        expect(updates[0]).toMatchObject({ index: 1, title: "Location photo", kind: "PHOTO" });
        expect(updates[1]).toMatchObject({ index: 2, title: "Owner permission", kind: "DOCUMENT" });
        expect(updates[2]).toMatchObject({ index: 3, title: "Address clarification", kind: "ADDRESS" });
        expect(requestedUpdatesOf(null)).toEqual([]);
        expect(requestedUpdatesOf("Please resubmit with the permit.")[0]?.kind).toBe("DOCUMENT");
    });
});
