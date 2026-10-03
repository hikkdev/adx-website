import { describe, expect, it } from "vitest";
import {
    ADVANCE_BOOKING,
    CANCELLATION_NOTICE,
    cancellationOf,
    documentPostsOf,
    emptyForm,
    formFromDraft,
    formFromListing,
    MAX_BOOKING_PERIODS,
    missingOn,
    nextStep,
    patchFor,
    previousStep,
    SEASONAL_VARIATIONS,
    summaryOf,
    toCreateBody,
    toDraftInput,
    visibilityWindowOf,
    type ListingForm,
} from "./form-model";
import type { Catalogue, Listing, ListingDocument, ListingDraft } from "@/services/listing-editor";

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
        // The listing-data-gaps lot: the coverage is its own column; the city is no longer made of it.
        expect(body.coverage).toBe("Bengaluru");
        expect(body).not.toHaveProperty("city");
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
        // LF-2: a fixed spot's page draws the "Installation by ADX" tick, so its state goes with the section — an untick clears the column.
        expect(patchFor("details", form)).toEqual({ title: "Whitefield East billboard", placement: "Roadside · Main road facing", widthFt: "40", heightFt: "20", illumination: "Back-lit", facing: "Single", installationByAdx: false });
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
        availableYearRound: true,
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
        // LF-2: an occupied spot (availableNow false) is not "not year-round" — that answer has its own column.
        expect(formFromListing({ ...listing, availableNow: false, availableYearRound: null }).availableYearRound).toBe("");
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

describe("Lot D: accept bookings automatically", () => {
    it("is off on a new form and sent only when switched on", () => {
        const form = { ...emptyForm(), category: "OUTDOOR" as const, title: "Whitefield", address: "Whitefield Main Road" };
        expect(form.instantBooking).toBe(false);
        expect(toCreateBody(form, catalogue)).not.toHaveProperty("instantBooking");
        expect(toCreateBody({ ...form, instantBooking: true }, catalogue)).toMatchObject({ instantBooking: true });
    });

    it("comes back from the listing and from a phone draft", () => {
        const listing = { id: "l1", displayId: null, title: "T", category: "OUTDOOR", subType: null, description: null, address: "A", city: null, latitude: null, longitude: null, status: "ACTIVE", ratePerDay: null, pricingUnit: "PER_DAY", basePrice: null, placement: null, widthFt: null, heightFt: null, areaSqFt: null, minBookingDays: null, availableNow: true, availableFrom: null, availableHoursFrom: null, availableHoursTo: null, peakPeriodNote: null, targetAudience: null, uniqueSellingPoint: null, footfallNote: null, illumination: null, facing: null, rejectionReason: null, submittedAt: null, publishedAt: null, createdAt: "2026-09-26T00:00:00Z", instantBooking: true } as Listing;
        expect(formFromListing(listing).instantBooking).toBe(true);
        const draft = { id: "d1", displayId: "LST-2609-2601", category: "outdoor", title: null, stepIndex: 3, stepKey: "pricing", answers: { category: "outdoor", instant_booking: true }, createdAt: "", updatedAt: "" } as ListingDraft;
        expect(formFromDraft(draft).form.instantBooking).toBe(true);
    });
});

/* ── LF-2 (28 Sep 2026): the listing questions restored, one mapping on every surface ── */

/** Every row of the LF-2 mapping table answered, in the form's own shape. MEDIA, so the slot goes as `size`; the fixed-spot tick and the vehicle ride along to prove every row maps. */
function everyAnswer(): ListingForm {
    const form = emptyForm();
    form.category = "MEDIA";
    form.mediaTypeId = "m-hoarding";
    form.title = "Sunrise FM 92.7 breakfast show";
    form.address = "Sunrise FM 92.7";
    form.city = "Bengaluru";
    form.installationByAdx = true;
    form.vehicleNumber = "ka 01 ab 1234";
    form.vehicleModel = "City bus";
    form.broadcastLanguage = "Kannada";
    form.contentFormat = "Music and entertainment";
    form.slotDuration = "30 seconds";
    form.audience = { ageBand: "25–34", genderSplit: "Balanced", urbanRural: "Urban", secProfile: "SEC A / B", incomeBracket: "₹6 – 12 lakh", occupation: "Commuters" };
    form.audienceDocs = { barc: { url: "https://files.adx.in/barc.pdf", name: "barc.pdf" }, footfall: { url: "https://files.adx.in/footfall.xlsx", name: "footfall.xlsx" } };
    form.availableYearRound = "no";
    form.maxBookingDays = "90";
    form.advanceBookingDays = "0";
    form.cancellationNotice = "14";
    form.pricingUnit = "PER_DAY";
    form.basePrice = "5000";
    form.rateCard = { url: "https://files.adx.in/card.pdf", name: "card.pdf" };
    form.rateCardValidFrom = "2026-10-01";
    form.rateCardValidTo = "2027-03-31";
    form.rateCardSeasonal = "Higher in the festive season (Oct – Dec)";
    form.photos = {
        front: { url: "https://files.adx.in/front.jpg", name: "front.jpg" },
        left: { url: "https://files.adx.in/left.jpg", name: "left.jpg" },
        right: { url: "https://files.adx.in/right.jpg", name: "right.jpg" },
        wide: { url: "https://files.adx.in/wide.jpg", name: "wide.jpg" },
    };
    form.documents = { mediaBusiness: { url: "https://files.adx.in/gst.pdf", name: "gst.pdf" } };
    return form;
}

const EVERY_ANSWER_BODY = {
    category: "MEDIA",
    title: "Sunrise FM 92.7 breakfast show",
    address: "Sunrise FM 92.7",
    city: "Bengaluru",
    mediaTypeId: "m-hoarding",
    installationByAdx: true,
    vehicleNumber: "KA01AB1234",
    vehicleModel: "City bus",
    broadcastLanguage: "Kannada",
    contentFormat: "Music and entertainment",
    size: "30 seconds",
    audienceDemographics: { ageBand: "25–34", genderSplit: "Balanced", urbanRural: "Urban", secProfile: "SEC A / B", incomeBracket: "₹6 – 12 lakh", occupation: "Commuters" },
    pricingUnit: "PER_DAY",
    basePrice: "5000",
    availableYearRound: false,
    maxBookingDays: 90,
    advanceBookingDays: 0,
    cancellationPolicy: "NOTICE",
    cancellationNoticeDays: 14,
    rateCardUrl: "https://files.adx.in/card.pdf",
    rateCardValidFrom: "2026-10-01",
    rateCardValidTo: "2027-03-31",
    seasonalVariationNote: "Higher in the festive season (Oct – Dec)",
    photos: [
        { url: "https://files.adx.in/front.jpg", type: "FRONT" },
        { url: "https://files.adx.in/left.jpg", type: "LEFT" },
        { url: "https://files.adx.in/right.jpg", type: "RIGHT" },
        { url: "https://files.adx.in/wide.jpg", type: "WIDE" },
    ],
};

describe("LF-2: the create body and the papers", () => {
    it("sends every row of the mapping table, exactly, and files the two reports as their own kinds after the papers", () => {
        const form = everyAnswer();
        expect(toCreateBody(form, catalogue)).toEqual(EVERY_ANSWER_BODY);
        expect(documentPostsOf(form)).toEqual([
            { key: "mediaBusiness", kind: "DISPLAY_AGREEMENT", url: "https://files.adx.in/gst.pdf" },
            { key: "audience:barc", kind: "AUDIENCE_RATING", url: "https://files.adx.in/barc.pdf" },
            { key: "audience:footfall", kind: "FOOTFALL_AUDIT", url: "https://files.adx.in/footfall.xlsx" },
        ]);
    });

    it("omits every LF-2 key nobody answered, and sends a zero-day advance notice", () => {
        const form = { ...emptyForm(), category: "OUTDOOR" as const, title: "Whitefield", address: "Whitefield Main Road", pricingUnit: "PER_DAY" as const, basePrice: "900" };
        const body = toCreateBody(form, catalogue);
        for (const key of ["installationByAdx", "vehicleModel", "broadcastLanguage", "contentFormat", "size", "audienceDemographics", "availableYearRound", "availableNow", "maxBookingDays", "advanceBookingDays", "cancellationPolicy", "cancellationNoticeDays", "rateCardValidFrom", "rateCardValidTo", "seasonalVariationNote", "photos"]) {
            expect(body).not.toHaveProperty(key);
        }
        expect(documentPostsOf(form)).toEqual([]);
        expect(toCreateBody({ ...form, advanceBookingDays: "0" }, catalogue).advanceBookingDays).toBe(0);
        expect(toCreateBody({ ...form, availableYearRound: "yes" }, catalogue).availableYearRound).toBe(true);
        // Never the live occupied flag: a seasonal spot must stay in the planner.
        expect(toCreateBody({ ...form, availableYearRound: "no" }, catalogue)).not.toHaveProperty("availableNow");
        // Only the answered audience facts go, and a blank one is not an answer.
        expect(toCreateBody({ ...form, audience: { ...form.audience, ageBand: "18–24", occupation: "  " } }, catalogue).audienceDemographics).toEqual({ ageBand: "18–24" });
    });

    it("maps each cancellation answer onto the policy and its days", () => {
        expect(cancellationOf("flexible")).toEqual({ cancellationPolicy: "FLEXIBLE" });
        expect(cancellationOf("7")).toEqual({ cancellationPolicy: "NOTICE", cancellationNoticeDays: 7 });
        expect(cancellationOf("14")).toEqual({ cancellationPolicy: "NOTICE", cancellationNoticeDays: 14 });
        expect(cancellationOf("30")).toEqual({ cancellationPolicy: "NOTICE", cancellationNoticeDays: 30 });
        expect(cancellationOf("none")).toEqual({ cancellationPolicy: "NONE" });
        expect(cancellationOf("")).toEqual({});
        expect(CANCELLATION_NOTICE.map((o) => Object.keys(cancellationOf(o.value)).length > 0)).toEqual([true, true, true, true, true]);
    });

    it("draws the selects with the flow's stored values", () => {
        expect(MAX_BOOKING_PERIODS.map((o) => o.value)).toEqual(["7", "14", "30", "90", "180", "365"]);
        expect(ADVANCE_BOOKING.map((o) => o.value)).toEqual(["0", "3", "7", "14", "30"]);
        expect(CANCELLATION_NOTICE.map((o) => o.value)).toEqual(["flexible", "7", "14", "30", "none"]);
        expect(SEASONAL_VARIATIONS.every((o) => o.value === o.label)).toBe(true);
        expect(SEASONAL_VARIATIONS[1]).toEqual({ value: "Higher in the festive season (Oct – Dec)", label: "Higher in the festive season (Oct – Dec)" });
    });
});

describe("LF-2: the edit pages round-trip the same answers", () => {
    const row = (patch: Partial<Listing>): Listing =>
        ({ id: "l2", displayId: "LST-2809-2601", title: "Sunrise FM 92.7 breakfast show", category: "MEDIA", subType: null, description: null, address: "Sunrise FM 92.7", city: "Bengaluru", latitude: null, longitude: null, status: "ACTIVE", ratePerDay: "5000.00", pricingUnit: "PER_DAY", basePrice: "5000.00", placement: null, widthFt: null, heightFt: null, areaSqFt: null, minBookingDays: null, availableNow: true, availableFrom: null, availableHoursFrom: null, availableHoursTo: null, peakPeriodNote: null, targetAudience: null, uniqueSellingPoint: null, footfallNote: null, illumination: null, facing: null, rejectionReason: null, submittedAt: null, publishedAt: null, createdAt: "2026-09-28T00:00:00.000Z", ...patch }) as Listing;
    const papers: ListingDocument[] = [
        { id: "d1", listingId: "l2", kind: "AUDIENCE_RATING", url: "https://files.adx.in/barc.pdf", status: "PENDING", rejectionReason: null, submittedAt: "2026-09-28T10:00:00.000Z", reviewedAt: null },
        { id: "d2", listingId: "l2", kind: "FOOTFALL_AUDIT", url: "https://files.adx.in/footfall.xlsx", status: "PENDING", rejectionReason: null, submittedAt: "2026-09-28T10:00:00.000Z", reviewedAt: null },
    ];

    it("reads the columns back into the answers the wizard wrote", () => {
        const listing = row({
            size: "30 seconds",
            broadcastLanguage: "Kannada",
            contentFormat: "Music and entertainment",
            audienceDemographics: { ageBand: "25–34", genderSplit: "Balanced", urbanRural: "Urban", secProfile: "SEC A / B", incomeBracket: "₹6 – 12 lakh", occupation: "Commuters" },
            availableYearRound: false,
            maxBookingDays: 90,
            advanceBookingDays: 0,
            cancellationPolicy: "NOTICE",
            cancellationNoticeDays: 14,
            rateCardUrl: "https://files.adx.in/card.pdf",
            rateCardValidFrom: "2026-10-01T00:00:00.000Z",
            rateCardValidTo: "2027-03-31T00:00:00.000Z",
            seasonalVariationNote: "Higher in the festive season (Oct – Dec)",
        });
        const form = formFromListing(listing, [], papers);
        expect(form.broadcastLanguage).toBe("Kannada");
        expect(form.contentFormat).toBe("Music and entertainment");
        expect(form.slotDuration).toBe("30 seconds");
        expect(form.audience).toEqual({ ageBand: "25–34", genderSplit: "Balanced", urbanRural: "Urban", secProfile: "SEC A / B", incomeBracket: "₹6 – 12 lakh", occupation: "Commuters" });
        expect(form.audienceDocs).toEqual({ barc: { url: "https://files.adx.in/barc.pdf", name: "barc.pdf" }, footfall: { url: "https://files.adx.in/footfall.xlsx", name: "footfall.xlsx" } });
        expect(form.availableYearRound).toBe("no");
        expect(form.maxBookingDays).toBe("90");
        expect(form.advanceBookingDays).toBe("0");
        expect(form.cancellationNotice).toBe("14");
        expect(form.rateCardValidFrom).toBe("2026-10-01");
        expect(form.rateCardValidTo).toBe("2027-03-31");
        expect(form.rateCardSeasonal).toBe("Higher in the festive season (Oct – Dec)");

        // Each section sends back exactly what it read.
        // A media listing filed before the coverage had a column kept it in the city (this row has no `coverage`): the edit page moves it across.
        expect(patchFor("details", form)).toEqual({ title: "Sunrise FM 92.7 breakfast show", broadcastLanguage: "Kannada", contentFormat: "Music and entertainment", size: "30 seconds", coverage: "Bengaluru" });
        expect(patchFor("audience", form)).toEqual({ audienceDemographics: { ageBand: "25–34", genderSplit: "Balanced", urbanRural: "Urban", secProfile: "SEC A / B", incomeBracket: "₹6 – 12 lakh", occupation: "Commuters" } });
        expect(patchFor("terms", form)).toEqual({ availableYearRound: false, maxBookingDays: 90, advanceBookingDays: 0, cancellationPolicy: "NOTICE", cancellationNoticeDays: 14 });
        expect(patchFor("ratecard", form)).toEqual({ rateCardUrl: "https://files.adx.in/card.pdf", rateCardValidFrom: "2026-10-01", rateCardValidTo: "2027-03-31", seasonalVariationNote: "Higher in the festive season (Oct – Dec)" });
    });

    it("reads the tick, the vehicle and the other two cancellation policies, and ignores older audience shares", () => {
        const indoor = formFromListing(row({ category: "INDOOR", installationByAdx: true, cancellationPolicy: "FLEXIBLE", audienceDemographics: { "18–24": 30, "25–34": 45 } }));
        expect(indoor.installationByAdx).toBe(true);
        expect(indoor.cancellationNotice).toBe("flexible");
        expect(indoor.audience.ageBand).toBe("");
        expect(patchFor("details", indoor)).toMatchObject({ installationByAdx: true });
        expect(patchFor("audience", indoor)).toEqual({});

        const transit = formFromListing(row({ category: "TRANSIT", vehicleNumber: "KA01AB1234", vehicleModel: "City bus", cancellationPolicy: "NONE", availableYearRound: true }));
        expect(transit.vehicleModel).toBe("City bus");
        expect(transit.cancellationNotice).toBe("none");
        expect(patchFor("vehicle", transit)).toEqual({ title: "Sunrise FM 92.7 breakfast show", vehicleNumber: "KA01AB1234", vehicleModel: "City bus" });
        expect(patchFor("terms", transit)).toEqual({ availableYearRound: true, cancellationPolicy: "NONE" });
        // A media outlet's page has no tick, so it sends none.
        expect(patchFor("details", formFromListing(row({})))).not.toHaveProperty("installationByAdx");
    });

    it("resumes a phone draft at the new screens, and a pre-LF-2 web draft with its seasonal note in words", () => {
        const phone = (stepKey: string) => formFromDraft({ id: "p", displayId: "LST-2809-2602", category: "indoor", title: null, stepIndex: 5, stepKey, answers: { category: "indoor", left_photo: "https://files.adx.in/left.jpg", rate_card_seasonal: "Lower in summer" }, createdAt: "", updatedAt: "" });
        expect(phone("audience").step).toBe("audience");
        expect(phone("terms").step).toBe("terms");
        expect(phone("rate-card").step).toBe("ratecard");
        expect(phone("rate-card").form.photos.left).toEqual({ url: "https://files.adx.in/left.jpg", name: "left.jpg" });
        expect(phone("rate-card").form.rateCardSeasonal).toBe("Lower in summer");

        const old = formFromDraft({ id: "w", displayId: "LST-2709-2601", category: "outdoor", title: null, stepIndex: 8, stepKey: "ratecard", answers: { web: { ...emptyForm(), category: "OUTDOOR", rateCardSeasonal: "festive" } }, createdAt: "", updatedAt: "" });
        expect(old.form.rateCardSeasonal).toBe("Higher in the festive season (Oct – Dec)");
    });
});
