import { describe, expect, it } from "vitest";
import { emptyForm, formFromDraft, formFromListing, missingOn, nextStep, patchFor, previousStep, summaryOf, toCreateBody, toDraftInput, visibilityWindowOf } from "./form-model";
import type { Catalogue, Listing, ListingDraft } from "@/services/listing-editor";

const catalogue: Catalogue = {
    venues: [
        { id: "v-mall", name: "Shopping Mall", slug: "mall", category: "INDOOR", description: null, subVenues: ["Atrium", "Food court"], isActive: true },
        { id: "v-road", name: "Billboard / Hoarding corridor", slug: "road", category: "OUTDOOR", description: null, subVenues: [], isActive: true },
    ],
    mediaTypes: [
        { id: "m-hoarding", name: "Outdoor — Standard hoarding", slug: "hoarding", category: "OUTDOOR", description: null, venueTypeId: "v-road", formatGroup: "Hoardings", sizeClassIds: [], materialIds: [] },
        { id: "m-led", name: "Mall — LED Wall", slug: "led", category: "INDOOR", description: null, venueTypeId: "v-mall", formatGroup: "Digital Displays", sizeClassIds: [], materialIds: [] },
    ],
    sizeClasses: [],
    materials: [],
    contentCategories: [
        { id: "c-health", name: "Healthcare ads", slug: "health", isSensitive: false },
        { id: "c-adult", name: "Adult content", slug: "adult", isSensitive: true },
    ],
};

function filled() {
    const form = emptyForm();
    form.category = "OUTDOOR";
    form.venueTypeId = "v-road";
    form.mediaTypeId = "m-hoarding";
    form.title = "Whitefield East billboard";
    form.placement = "Roadside · Main road facing";
    form.address = "Whitefield Main Road, near Hope Farm junction";
    form.city = "Bengaluru";
    form.location = { latitude: 12.97, longitude: 77.75 };
    form.widthFt = "40";
    form.heightFt = "20";
    form.illumination = "Back-lit";
    form.facing = "Single";
    form.pricingUnit = "PER_WEEK";
    form.basePrice = "12600";
    form.minBookingDays = "14";
    form.availableFrom = "2026-10-26";
    form.visibilityWindow = "24h";
    form.contentRules = { "c-health": "REQUIRES_APPROVAL", "c-adult": "PROHIBITED" };
    form.photos.front = { url: "https://files.adx.in/front.jpg", name: "front.jpg" };
    form.rightsBasis = "PERMIT";
    form.rightsValidUntil = "2027-03-31";
    return form;
}

describe("the wizard's order", () => {
    it("walks the frames' steps in chapter order", () => {
        expect(nextStep("category")).toBe("venue");
        expect(nextStep("format")).toBe("details");
        expect(nextStep("rules")).toBe("review");
        expect(nextStep("review")).toBe("verify");
        expect(nextStep("documents")).toBeNull();
        expect(previousStep("category")).toBeNull();
        expect(previousStep("terms")).toBe("audience");
    });
});

describe("what a step still needs", () => {
    it("lets an outdoor spot pass the venue step without one, and blocks a mall without", () => {
        const form = emptyForm();
        form.category = "OUTDOOR";
        expect(missingOn("venue", form, catalogue)).toEqual([]);
        form.category = "INDOOR";
        expect(missingOn("venue", form, catalogue)).toEqual(["Venue"]);
    });
    it("names the details a physical spot must have, and only the channel for a media one", () => {
        const form = emptyForm();
        form.category = "OUTDOOR";
        expect(missingOn("details", form, catalogue)).toEqual(["Ad spot name", "Street address / landmark", "Location pin", "Width", "Height"]);
        form.category = "MEDIA";
        expect(missingOn("details", form, catalogue)).toEqual(["Channel / publication name"]);
    });
    it("refuses a per-square-foot rate without a measured area", () => {
        const form = filled();
        form.pricingUnit = "PER_SQFT_PER_MONTH";
        form.widthFt = "";
        expect(missingOn("pricing", form, catalogue)).toEqual(["Width and height (for a per sq.ft rate)"]);
    });
});

describe("the create body", () => {
    it("sends the publisher's own unit and figure, the pin, the rules, the photos and the rights term", () => {
        const body = toCreateBody(filled(), catalogue);
        expect(body).toMatchObject({
            category: "OUTDOOR",
            title: "Whitefield East billboard",
            address: "Whitefield Main Road, near Hope Farm junction",
            city: "Bengaluru",
            latitude: 12.97,
            longitude: 77.75,
            venueTypeId: "v-road",
            mediaTypeId: "m-hoarding",
            widthFt: "40",
            heightFt: "20",
            pricingUnit: "PER_WEEK",
            basePrice: "12600",
            minBookingDays: 14,
            availableFrom: "2026-10-26",
            availableHoursFrom: "12 AM",
            availableHoursTo: "12 AM",
            rightsBasis: "PERMIT",
            rightsValidUntil: "2027-03-31",
            contentRules: [
                { contentCategoryId: "c-health", stance: "REQUIRES_APPROVAL" },
                { contentCategoryId: "c-adult", stance: "PROHIBITED" },
            ],
            photos: [{ url: "https://files.adx.in/front.jpg", type: "FRONT" }],
        });
        expect(body).not.toHaveProperty("ratePerDay");
        expect(body).not.toHaveProperty("slotsTotal");
    });
    it("names a media listing after its outlet and format, and keeps the slot length as its size", () => {
        const form = emptyForm();
        form.category = "MEDIA";
        form.mediaTypeId = "m-hoarding";
        form.address = "Sunrise FM 92.7";
        form.slotDuration = "30 seconds";
        form.coverage = "Bengaluru";
        form.pricingUnit = "PER_DAY";
        form.basePrice = "5000";
        const body = toCreateBody(form, catalogue);
        expect(body.title).toBe("Sunrise FM 92.7 · Standard hoarding");
        expect(body.size).toBe("30 seconds");
        expect(body.city).toBe("Bengaluru");
    });
    it("only sends a loop for a spot type that names a screen", () => {
        const form = filled();
        form.slotsTotal = 6;
        expect(toCreateBody(form, catalogue)).not.toHaveProperty("slotsTotal");
        form.category = "INDOOR";
        form.venueTypeId = "v-mall";
        form.mediaTypeId = "m-led";
        expect(toCreateBody(form, catalogue).slotsTotal).toBe(6);
    });
});

describe("the patch a section sends", () => {
    it("moves only its own columns and never the address", () => {
        const form = filled();
        expect(patchFor("details", form)).toEqual({ title: "Whitefield East billboard", placement: "Roadside · Main road facing", widthFt: "40", heightFt: "20", illumination: "Back-lit", facing: "Single" });
        expect(patchFor("details", form)).not.toHaveProperty("address");
        expect(patchFor("price", form)).toEqual({ pricingUnit: "PER_WEEK", basePrice: "12600", minBookingDays: 14, availableFrom: "2026-10-26", availableHoursFrom: "12 AM", availableHoursTo: "12 AM" });
        expect(patchFor("rules", form).contentRules).toHaveLength(2);
        expect(patchFor("photos", form)).toEqual({});
    });
});

describe("the form from a listing and from a draft", () => {
    const listing: Listing = {
        id: "l1",
        displayId: "LST-2509-2601",
        title: "Whitefield billboard",
        category: "OUTDOOR",
        subType: null,
        description: "Bring your brand into the everyday journey.",
        address: "Whitefield Main Road, Bengaluru",
        city: "Bengaluru",
        latitude: 12.97,
        longitude: 77.75,
        status: "ACTIVE",
        ratePerDay: "857.14",
        pricingUnit: "PER_WEEK",
        basePrice: "6000.00",
        placement: "Roadside · Main road facing",
        widthFt: "40.00",
        heightFt: "20.00",
        areaSqFt: "800.00",
        minBookingDays: 14,
        availableNow: true,
        availableFrom: "2026-10-26T00:00:00.000Z",
        availableHoursFrom: "12 AM",
        availableHoursTo: "12 AM",
        peakPeriodNote: null,
        targetAudience: "City commuters and high-street shoppers",
        uniqueSellingPoint: "Main road facing · Back-lit",
        footfallNote: null,
        illumination: "Back-lit",
        facing: "Single",
        photos: [{ url: "https://files.adx.in/a.jpg", type: "PHOTO" }, { url: "https://files.adx.in/b.jpg", type: "PHOTO" }],
        rejectionReason: null,
        submittedAt: "2026-09-20T10:00:00.000Z",
        publishedAt: "2026-09-21T10:00:00.000Z",
        rightsBasis: "LEASED",
        rightsValidUntil: "2027-03-31T18:29:59.999Z",
        createdAt: "2026-09-20T09:00:00.000Z",
    };
    it("reads a listing's row into the same fields the wizard writes", () => {
        const form = formFromListing(listing, [{ contentCategoryId: "c-adult", stance: "PROHIBITED" }], [
            { id: "d1", listingId: "l1", kind: "OWNER_NOC", url: "https://files.adx.in/noc.pdf", status: "VERIFIED", rejectionReason: null, submittedAt: "2026-09-20T09:30:00.000Z", reviewedAt: null },
        ]);
        expect(form.widthFt).toBe("40");
        expect(form.basePrice).toBe("6000");
        expect(form.visibilityWindow).toBe("24h");
        expect(form.availableYearRound).toBe("yes");
        expect(form.availableFrom).toBe("2026-10-26");
        expect(form.rightsValidUntil).toBe("2027-03-31");
        expect(form.contentRules).toEqual({ "c-adult": "PROHIBITED" });
        expect(form.photos.front?.url).toBe("https://files.adx.in/a.jpg");
        expect(form.photos.left?.url).toBe("https://files.adx.in/b.jpg");
        expect(form.documents.ownerNoc).toEqual({ url: "https://files.adx.in/noc.pdf", name: "noc.pdf" });
    });
    it("round-trips its own draft and maps the phone's answers", () => {
        const form = filled();
        const draft = toDraftInput(form, "pricing");
        expect(draft).toMatchObject({ category: "outdoor", title: "Whitefield East billboard", stepKey: "pricing", stepIndex: 7 });
        const back = formFromDraft({ id: "d", displayId: "LST-2509-2601", category: "outdoor", title: form.title, stepIndex: 7, stepKey: "pricing", answers: draft.answers, createdAt: "", updatedAt: "" } as ListingDraft);
        expect(back.step).toBe("pricing");
        expect(back.form.basePrice).toBe("12600");

        const phone = formFromDraft({
            id: "p",
            displayId: "LST-2509-2602",
            category: "indoor",
            title: "Gym mirror decal",
            stepIndex: 3,
            stepKey: "spot-details",
            answers: { category: "indoor", title: "Gym mirror decal", venue_type_id: "v-mall", media_type_id: "m-led", location: { latitude: 12.9, longitude: 77.6 }, width_ft: "6", height_ft: "4", pricing_unit: "PER_MONTH", base_price: "9000", available_hours: { from: "6 AM", to: "10 PM" } },
            createdAt: "",
            updatedAt: "",
        });
        expect(phone.step).toBe("details");
        expect(phone.form.category).toBe("INDOOR");
        expect(phone.form.location).toEqual({ latitude: 12.9, longitude: 77.6 });
        expect(phone.form.visibilityWindow).toBe("extended");
    });
    it("summarises the review rows in the frame's words", () => {
        expect(summaryOf(filled(), catalogue)).toEqual({
            category: "Outdoor Ad Spots",
            venue: "Billboard / Hoarding corridor",
            spotType: "Standard hoarding",
            area: "800 sq.ft",
            location: "Whitefield Main Road, near Hope Farm junction, Bengaluru",
            pricing: "₹12,600 / placement / week",
        });
        expect(visibilityWindowOf("6 AM", "6 PM")).toBe("day");
    });
});
