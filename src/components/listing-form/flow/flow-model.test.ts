import { describe, expect, it } from "vitest";
import type { Catalogue, ListingDraft } from "@/services/listing-editor";
import { parseWizardFlow, type WizardFlow } from "@/services/flows";
import { documentPostsOf, emptyForm, formFromDraft, toCreateBody, type ListingForm } from "../form-model";
import {
    answerIdOf,
    answersInPlay,
    bindingFor,
    chapterOfScreen,
    collects,
    documentKeyFor,
    FIELD_BINDINGS,
    fileAnswerOf,
    flowAnswersOf,
    flowGaps,
    flowMissingOn,
    flowScreens,
    formFromFlowAnswers,
    formInPlay,
    isBound,
    pairable,
    readAnswer,
    resolveScreenKey,
    screenForBakedStep,
    sectionText,
    splitUnit,
    toFlowDraftInput,
    writeAnswer,
} from "./flow-model";

/*
 * ── The seeded flow (ADX-backendv1/src/scripts/data/listing-flow.ts), as the row serves it ──
 *
 * `branch(id)` is the flow as FL-1 met it (version 4, still the row until the
 * lead reseeds); `branch(id, true)` is LF-2's (28 Sep 2026): installation on
 * a fixed spot, the vehicle model, the media outlet, the audience screen,
 * the terms screen, the rate card on its own screen, and four photo angles.
 */
const words = (list: string[]) => list.map((w) => ({ id: w, title: w }));

function branch(id: string, lf2 = false) {
    const media = id === "media";
    return {
        id,
        title: id,
        description: "",
        screens: [
            { key: "venue", title: "Venue selection", step: 2, totalSteps: 7, ctaLabel: "Continue", fields: [{ type: "venue-type", id: "venue_type_id", label: media ? "Medium" : "Venue", required: id !== "outdoor", filterByCategory: true }] },
            {
                key: "spot-type",
                title: "Ad spot type",
                step: 3,
                totalSteps: 7,
                ctaLabel: "Continue",
                fields: [
                    { type: "media-type", id: "media_type_id", label: "Ad spot type", required: true, dependsOn: "venue_type_id", groupBy: "formatGroup" },
                    { type: "material", id: "material_id", label: "Material", required: false, dependsOn: "media_type_id" },
                ],
            },
            {
                key: "spot-details",
                title: "Spot details",
                step: 4,
                totalSteps: 7,
                ctaLabel: "Save spot details",
                fields: [
                    { type: "section", id: "sec_spot", label: "Ad spot", from: ["media_type_id"] },
                    { type: "text", id: "title", label: "Ad spot name", required: true },
                    { type: "sub-venue", id: "placement", label: media ? "Channel or publication" : "Placement area", required: media, dependsOn: "venue_type_id" },
                    { type: "text", id: "address", label: media ? "Channel, station or publication" : "Full address", required: true },
                    { type: "city", id: "city", label: "City", required: !media },
                    ...(id === "transit"
                        ? [
                              { type: "section", id: "sec_vehicle", label: "Vehicle" },
                              { type: "text", id: "vehicle_number", label: "Vehicle registration number", required: false },
                              ...(lf2 ? [{ type: "select", id: "vehicle_model", label: "Vehicle type / model", required: false, options: words(["City bus", "Auto-rickshaw", "Other"]) }] : []),
                          ]
                        : []),
                    ...(media && lf2
                        ? [
                              { type: "section", id: "sec_outlet", label: "Outlet" },
                              { type: "select", id: "broadcast_language", label: "Broadcast language", required: false, options: words(["Hindi", "English", "Kannada"]) },
                              { type: "select", id: "content_format", label: "Content format", required: false, options: words(["Music and entertainment", "News and current affairs"]) },
                              { type: "select", id: "slot_duration", label: "Slot duration", required: false, options: words(["10 seconds", "30 seconds", "Full page"]) },
                          ]
                        : []),
                    { type: "section", id: "sec_location", label: "Location Pin" },
                    { type: "geo-point", id: "location", label: "Location pin", required: !media },
                    { type: "section", id: "sec_dimensions", label: "Dimensions & Visibility" },
                    { type: "number", id: "width_ft", label: "Width (ft)", required: !media },
                    { type: "number", id: "height_ft", label: "Height (ft)", required: !media },
                    { type: "computed", id: "area_sq_ft", label: "Total area (sq ft)", from: ["width_ft", "height_ft"], op: "multiply", readOnly: true },
                    ...(media
                        ? []
                        : [
                              { type: "select", id: "illumination", label: "Illumination", options: [{ id: "Non-lit", title: "Non-lit" }, { id: "Back-lit", title: "Back-lit" }] },
                              { type: "select", id: "facing", label: "Facing", options: [{ id: "Single", title: "Single" }, { id: "Double", title: "Double" }] },
                          ]),
                    ...(lf2 && (id === "indoor" || id === "outdoor") ? [{ type: "checkbox", id: "installation_by_adx", label: "Installation by ADX", description: "ADX installs the creative on this spot. Special pricing applies.", required: false }] : []),
                ],
            },
            {
                key: "more-info",
                title: "More info",
                step: 5,
                totalSteps: 7,
                ctaLabel: "Save listing details",
                fields: [
                    { type: "textarea", id: "description", label: "Advertising space description", aiAssist: true },
                    { type: "text", id: "target_audience", label: "Target audience" },
                    { type: "text", id: "unique_selling_point", label: "Unique selling point" },
                    { type: "text", id: "footfall_note", label: "Past success or footfall" },
                ],
            },
            ...(lf2
                ? [
                      {
                          key: "audience",
                          title: "Audience evidence",
                          step: 6,
                          totalSteps: 10,
                          ctaLabel: "Save audience evidence",
                          fields: [
                              { type: "section", id: "sec_audience", label: "Audience profile" },
                              { type: "select", id: "age_band", label: "Primary age band", required: false, options: words(["18–24", "25–34", "Mixed"]) },
                              { type: "select", id: "gender_split", label: "Gender split", required: false, options: words(["Mostly men", "Balanced"]) },
                              { type: "select", id: "urban_rural", label: "Urban / rural mix", required: false, options: words(["Urban", "Rural"]) },
                              { type: "select", id: "sec_profile", label: "SEC profile", required: false, options: words(["SEC A", "SEC A / B"]) },
                              { type: "section", id: "sec_income", label: "Income & occupation" },
                              { type: "select", id: "income_bracket", label: "Income bracket", required: false, options: words(["₹6 – 12 lakh", "Mixed"]) },
                              { type: "select", id: "occupation", label: "Top occupation", required: false, options: words(["Commuters", "Shoppers"]) },
                              { type: "section", id: "sec_reports", label: "Supporting reports" },
                              { type: "file-upload", id: "barc_report", label: "BARC / TAM rating sheet", required: false },
                              { type: "file-upload", id: "footfall_report", label: "Footfall audit report", required: false },
                          ],
                      },
                  ]
                : []),
            {
                key: "content-rules",
                title: "Content rules",
                step: 6,
                totalSteps: 7,
                ctaLabel: "Review listing",
                fields: [
                    { type: "content-stance", id: "restricted_categories", label: "Restricted categories", scope: "RESTRICTED" },
                    { type: "content-prohibited", id: "prohibited_content", label: "Prohibited content", scope: "PROHIBITED" },
                ],
            },
            ...(lf2
                ? [
                      {
                          key: "terms",
                          title: "Availability & booking terms",
                          step: 8,
                          totalSteps: 10,
                          ctaLabel: "Save booking terms",
                          fields: [
                              { type: "select", id: "available_year_round", label: "Available year-round?", required: false, options: [{ id: "yes", title: "Yes, all year" }, { id: "no", title: "No — only in some seasons" }] },
                              { type: "select", id: "max_booking_days", label: "Maximum booking period", required: false, options: [{ id: "7", title: "7 days" }, { id: "90", title: "90 days" }, { id: "365", title: "1 year" }] },
                              { type: "select", id: "advance_booking_days", label: "Advance booking required", required: false, options: [{ id: "0", title: "No notice needed" }, { id: "7", title: "7 days ahead" }] },
                              { type: "select", id: "cancellation_notice", label: "Cancellation notice", required: false, options: [{ id: "flexible", title: "Flexible" }, { id: "7", title: "7 days' notice" }, { id: "14", title: "14 days' notice" }, { id: "30", title: "30 days' notice" }, { id: "none", title: "No cancellation once confirmed" }] },
                          ],
                      },
                  ]
                : []),
            {
                key: "pricing",
                title: "Pricing & availability",
                step: 7,
                totalSteps: 7,
                ctaLabel: "Save price & availability",
                fields: [
                    { type: "select", id: "pricing_unit", label: "Rate basis", required: true, options: [{ id: "PER_DAY", title: "Per day" }, { id: "PER_WEEK", title: "Per week" }, { id: "PER_SQFT_PER_MONTH", title: "Per sq.ft / month" }] },
                    { type: "base-price", id: "base_price", label: "Base price (Rs)", required: true, showIndicator: true },
                    { type: "number", id: "min_booking_days", label: "Min. booking (days)" },
                    { type: "date", id: "available_from", label: "Available from" },
                    { type: "time-range", id: "available_hours", label: "Visibility hours" },
                    { type: "text", id: "peak_period_note", label: "Peak period note" },
                    // LF-2 moved the rate card to a screen of its own.
                    ...(lf2 ? [] : [{ type: "file-upload", id: "rate_card", label: "Upload rate card" }]),
                ],
            },
            ...(lf2
                ? [
                      {
                          key: "rate-card",
                          title: "Rate card",
                          step: 10,
                          totalSteps: 10,
                          ctaLabel: "Save rate card",
                          fields: [
                              { type: "file-upload", id: "rate_card", label: "Upload rate card" },
                              { type: "date", id: "rate_card_valid_from", label: "Validity start", required: false },
                              { type: "date", id: "rate_card_valid_to", label: "Validity end", required: false },
                              { type: "select", id: "rate_card_seasonal", label: "Seasonal variation", required: false, options: words(["No seasonal change", "Higher in the festive season (Oct – Dec)", "Lower in summer"]) },
                          ],
                      },
                  ]
                : []),
            {
                key: "documents",
                title: "Documents & permits",
                step: 8,
                totalSteps: 7,
                badge: "Verification",
                ctaLabel: "Save proofs",
                fields: [
                    { type: "select", id: "rights_basis", label: "How do you hold this space?", required: true, options: [{ id: "OWNED", title: "I own it" }, { id: "LEASED", title: "On a lease" }] },
                    { type: "date", id: "rights_valid_until", label: "Right runs out on" },
                    {
                        type: "document-upload",
                        id: "documents",
                        label: "Venue proof",
                        options: media ? [{ id: "DISPLAY_AGREEMENT", title: "Display agreement" }, { id: "OTHER", title: "Anything else" }] : [{ id: "OWNER_NOC", title: "Owner NOC" }, { id: "ADDRESS_PROOF", title: "Address proof" }, { id: "DISPLAY_AGREEMENT", title: "Display agreement" }, ...(id === "indoor" ? [] : [{ id: "MUNICIPAL_PERMIT", title: "Municipal permit" }])],
                    },
                ],
            },
            {
                key: "review",
                title: "Review & submit",
                step: 9,
                totalSteps: 7,
                ctaLabel: "Submit listing",
                fields: [
                    { type: "image-upload", id: "main_photo", label: lf2 ? "Main photo (front)" : "Main photo", required: true },
                    ...(lf2 ? [{ type: "image-upload", id: "left_photo", label: "Left angle" }, { type: "image-upload", id: "right_photo", label: "Right angle" }] : []),
                    { type: "image-upload", id: "wide_photo", label: "Wide angle shot" },
                    { type: "checkbox", id: "terms", label: "Terms agreement", description: "I confirm that all information provided is accurate.", required: true },
                ],
            },
        ],
    };
}

const flow: WizardFlow = parseWizardFlow({
    label: "Listing",
    version: 4,
    screens: [
        {
            key: "select-category",
            title: "Ad space category",
            step: 1,
            totalSteps: 7,
            ctaLabel: "Continue",
            fields: [{ id: "category", type: "selectable-cards", label: "Category", required: true, branching: true, options: [{ id: "indoor", title: "Indoor" }, { id: "outdoor", title: "Outdoor" }, { id: "transit", title: "Transit" }, { id: "media", title: "Media" }] }],
        },
    ],
    branches: { indoor: branch("indoor"), outdoor: branch("outdoor"), transit: branch("transit"), media: branch("media") },
})!;

/** LF-2's flow: the same root, each branch with the restored questions. */
const lf2Flow: WizardFlow = parseWizardFlow({
    label: "Listing",
    version: 5,
    screens: flow.screens,
    branches: { indoor: branch("indoor", true), outdoor: branch("outdoor", true), transit: branch("transit", true), media: branch("media", true) },
})!;

const catalogue: Catalogue = {
    venues: [
        { id: "v-mall", name: "Shopping Mall", slug: "mall", category: "INDOOR", description: null, subVenues: ["Atrium", "Food court"], isActive: true },
        { id: "v-road", name: "Billboard / Hoarding corridor", slug: "road", category: "OUTDOOR", description: null, subVenues: [], isActive: true },
    ],
    mediaTypes: [
        { id: "m-hoarding", name: "Outdoor — Standard hoarding", slug: "hoarding", category: "OUTDOOR", description: null, venueTypeId: "v-road", formatGroup: "Hoardings", sizeClassIds: [], materialIds: [] },
        { id: "m-led", name: "Mall — LED Wall", slug: "led", category: "INDOOR", description: null, venueTypeId: "v-mall", formatGroup: "Digital Displays", sizeClassIds: [], materialIds: ["mat-vinyl"] },
    ],
    sizeClasses: [],
    materials: [{ id: "mat-vinyl", name: "Vinyl", slug: "vinyl" }],
    contentCategories: [
        { id: "c-health", name: "Healthcare ads", slug: "health", isSensitive: false },
        { id: "c-adult", name: "Adult content", slug: "adult", isSensitive: true },
    ],
};

/* ── The three forms and the bodies they produced BEFORE this lot (captured 27 Sep 2026 from the baked wizard's `toCreateBody`) ── */

function indoorForm() {
    const form = emptyForm();
    form.category = "INDOOR";
    form.venueTypeId = "v-mall";
    form.mediaTypeId = "m-led";
    form.materialId = "mat-vinyl";
    form.title = "Gym mirror decal";
    form.placement = "Atrium";
    form.address = "Phoenix Marketcity, Whitefield Main Road";
    form.city = "Bengaluru";
    form.location = { latitude: 12.97, longitude: 77.75 };
    form.widthFt = "40";
    form.heightFt = "20";
    form.illumination = "Back-lit";
    form.facing = "Single";
    form.description = "High-visibility mirror decal placement at the main reception.";
    form.targetAudience = "Walk-in fitness customers";
    form.uniqueSellingPoint = "Eye-level visibility near reception";
    form.footfallNote = "Average footfall: 350+ daily visitors";
    form.pricingUnit = "PER_WEEK";
    form.basePrice = "12600";
    form.minBookingDays = "14";
    form.availableFrom = "2026-10-26";
    form.visibilityWindow = "extended";
    form.peakPeriodNote = "Evenings and weekends";
    form.rateCard = { url: "https://files.adx.in/rate.pdf", name: "rate.pdf" };
    form.instantBooking = true;
    form.slotsTotal = 6;
    form.contentRules = { "c-health": "REQUIRES_APPROVAL", "c-adult": "PROHIBITED" };
    form.photos.front = { url: "https://files.adx.in/front.jpg", name: "front.jpg" };
    form.photos.wide = { url: "https://files.adx.in/wide.jpg", name: "wide.jpg" };
    form.rightsBasis = "LEASED";
    form.rightsValidUntil = "2027-03-31";
    form.documents = { ownerNoc: { url: "https://files.adx.in/noc.pdf", name: "noc.pdf" } };
    return form;
}

const INDOOR_BODY = {
    category: "INDOOR",
    title: "Gym mirror decal",
    address: "Phoenix Marketcity, Whitefield Main Road",
    city: "Bengaluru",
    latitude: 12.97,
    longitude: 77.75,
    venueTypeId: "v-mall",
    mediaTypeId: "m-led",
    materialId: "mat-vinyl",
    placement: "Atrium",
    widthFt: "40",
    heightFt: "20",
    illumination: "Back-lit",
    facing: "Single",
    description: "High-visibility mirror decal placement at the main reception.",
    targetAudience: "Walk-in fitness customers",
    uniqueSellingPoint: "Eye-level visibility near reception",
    footfallNote: "Average footfall: 350+ daily visitors",
    pricingUnit: "PER_WEEK",
    basePrice: "12600",
    minBookingDays: 14,
    availableFrom: "2026-10-26",
    availableHoursFrom: "6 AM",
    availableHoursTo: "10 PM",
    peakPeriodNote: "Evenings and weekends",
    instantBooking: true,
    rateCardUrl: "https://files.adx.in/rate.pdf",
    rightsBasis: "LEASED",
    rightsValidUntil: "2027-03-31",
    slotsTotal: 6,
    contentRules: [
        { contentCategoryId: "c-health", stance: "REQUIRES_APPROVAL" },
        { contentCategoryId: "c-adult", stance: "PROHIBITED" },
    ],
    photos: [
        { url: "https://files.adx.in/front.jpg", type: "FRONT" },
        { url: "https://files.adx.in/wide.jpg", type: "WIDE" },
    ],
};

function transitForm() {
    const form = emptyForm();
    form.category = "TRANSIT";
    form.title = "Bus back panel";
    form.address = "Majestic bus depot";
    form.city = "Bengaluru";
    form.location = { latitude: 12.98, longitude: 77.57 };
    form.vehicleNumber = "ka 01 ab 1234";
    form.pricingUnit = "PER_DAY";
    form.basePrice = "800";
    form.visibilityWindow = "24h";
    form.rightsBasis = "OWNED";
    form.rightsValidUntil = "2027-01-01";
    return form;
}

const TRANSIT_BODY = {
    category: "TRANSIT",
    title: "Bus back panel",
    address: "Majestic bus depot",
    city: "Bengaluru",
    latitude: 12.98,
    longitude: 77.57,
    vehicleNumber: "KA01AB1234",
    pricingUnit: "PER_DAY",
    basePrice: "800",
    availableHoursFrom: "12 AM",
    availableHoursTo: "12 AM",
    rightsBasis: "OWNED",
};

function mediaForm() {
    const form = emptyForm();
    form.category = "MEDIA";
    form.venueTypeId = "v-mall";
    form.mediaTypeId = "m-hoarding";
    form.address = "Sunrise FM 92.7";
    form.city = "Bengaluru";
    form.placement = "Sunrise FM";
    form.pricingUnit = "PER_DAY";
    form.basePrice = "5000";
    form.rateCard = { url: "https://files.adx.in/card.pdf", name: "card.pdf" };
    return form;
}

const MEDIA_BODY = {
    category: "MEDIA",
    title: "Sunrise FM 92.7 · Standard hoarding",
    address: "Sunrise FM 92.7",
    city: "Bengaluru",
    venueTypeId: "v-mall",
    mediaTypeId: "m-hoarding",
    placement: "Sunrise FM",
    pricingUnit: "PER_DAY",
    basePrice: "5000",
    rateCardUrl: "https://files.adx.in/card.pdf",
};

describe("FL-1 payload parity: the flow-driven wizard files the body the baked steps filed", () => {
    it("the form model's own create body is unchanged", () => {
        expect(toCreateBody(indoorForm(), catalogue)).toEqual(INDOOR_BODY);
        expect(toCreateBody(transitForm(), catalogue)).toEqual(TRANSIT_BODY);
        expect(toCreateBody(mediaForm(), catalogue)).toEqual(MEDIA_BODY);
    });

    it("the same answers, through the flow's shape and back, make the same body", () => {
        expect(toCreateBody(formInPlay(indoorForm(), flow), catalogue)).toEqual(INDOOR_BODY);
        expect(toCreateBody(formInPlay(transitForm(), flow), catalogue)).toEqual(TRANSIT_BODY);
        expect(toCreateBody(formInPlay(mediaForm(), flow), catalogue)).toEqual(MEDIA_BODY);
    });

    it("the papers come back to the site's own slots, so the submit files them by kind as before", () => {
        const back = formInPlay(indoorForm(), flow);
        expect(back.documents).toEqual({ ownerNoc: { url: "https://files.adx.in/noc.pdf", name: "noc.pdf" } });
        expect(back.rateCard).toEqual({ url: "https://files.adx.in/rate.pdf", name: "rate.pdf" });
        expect(back.ownVenue).toBe(false);
        expect(formInPlay(transitForm(), flow).ownVenue).toBe(true);
    });

    it("reads the answers in the apps' own shape", () => {
        const answers = flowAnswersOf(indoorForm(), flow);
        expect(answers).toMatchObject({
            category: "indoor",
            venue_type_id: "v-mall",
            media_type_id: "m-led",
            material_id: "mat-vinyl",
            title: "Gym mirror decal",
            placement: "Atrium",
            address: "Phoenix Marketcity, Whitefield Main Road",
            city: "Bengaluru",
            location: { latitude: 12.97, longitude: 77.75 },
            width_ft: "40",
            height_ft: "20",
            illumination: "Back-lit",
            facing: "Single",
            description: "High-visibility mirror decal placement at the main reception.",
            content_rules: [
                { contentCategoryId: "c-health", stance: "REQUIRES_APPROVAL" },
                { contentCategoryId: "c-adult", stance: "PROHIBITED" },
            ],
            pricing_unit: "PER_WEEK",
            base_price: "12600",
            min_booking_days: "14",
            available_from: "2026-10-26",
            available_hours: { from: "6 AM", to: "10 PM" },
            peak_period_note: "Evenings and weekends",
            rate_card: "https://files.adx.in/rate.pdf",
            rights_basis: "LEASED",
            rights_valid_until: "2027-03-31",
            documents: [{ kind: "OWNER_NOC", url: "https://files.adx.in/noc.pdf" }],
            main_photo: "https://files.adx.in/front.jpg",
            wide_photo: "https://files.adx.in/wide.jpg",
            instant_booking: true,
            slots_total: 6,
        });
        expect(answers).not.toHaveProperty("restricted_categories");
        expect(answers).not.toHaveProperty("sec_spot");
        expect(answers).not.toHaveProperty("area_sq_ft");
        expect(answers).not.toHaveProperty("vehicle_number");
    });

    it("does not file the answers of a branch the publisher left", () => {
        let form = indoorForm();
        form = { ...form, ...writeAnswer(form, "category", "media") };
        expect(form.category).toBe("MEDIA");
        expect(form.venueTypeId).toBeNull();
        expect(form.illumination).toBe("Back-lit");
        const body = toCreateBody(formInPlay(form, flow), catalogue);
        expect(body).not.toHaveProperty("illumination");
        expect(body).not.toHaveProperty("facing");
        expect(body).not.toHaveProperty("venueTypeId");
        // The media branch still asks for the pin and the photographs (optional there), so those stay.
        expect(body.latitude).toBe(12.97);
        expect(body.city).toBe("Bengaluru");
        // The NOC is not a kind the media branch offers, so it is not filed.
        expect(formInPlay(form, flow).documents).toEqual({});
    });

    it("agrees with formFromDraft on a phone draft, and keeps what the form has no key for", () => {
        const answers = { category: "indoor", title: "Gym mirror decal", venue_type_id: "v-mall", media_type_id: "m-led", location: { latitude: 12.9, longitude: 77.6 }, width_ft: "6", height_ft: "4", pricing_unit: "PER_MONTH", base_price: "9000", available_hours: { from: "6 AM", to: "10 PM" }, instant_booking: true, terms: true, documents: [{ kind: "OWNER_NOC", url: "https://files.adx.in/n.pdf" }] };
        const viaDraft = formFromDraft({ id: "p", displayId: "LST-2509-2602", category: "indoor", title: "Gym mirror decal", stepIndex: 3, stepKey: "spot-details", answers, createdAt: "", updatedAt: "" } as ListingDraft).form;
        const viaFlow = formFromFlowAnswers(answers);
        expect(toCreateBody(viaFlow, catalogue)).toEqual(toCreateBody(viaDraft, catalogue));
        expect(viaFlow.extra).toEqual({ terms: true });
        expect(viaFlow.documents.ownerNoc).toEqual({ url: "https://files.adx.in/n.pdf", name: "n.pdf" });
        expect(viaFlow.visibilityWindow).toBe("extended");
    });
});

describe("the mapping table", () => {
    it("binds every answer the seeded flow collects to a form key, and the two content fields to one answer", () => {
        const asked = flowScreens(flow, { category: "TRANSIT" }).flatMap((s) => s.fields).filter(collects);
        const unbound = asked.filter((f) => !isBound(f.id)).map((f) => f.id);
        expect(unbound).toEqual(["terms"]);
        expect(answerIdOf("restricted_categories")).toBe("content_rules");
        expect(answerIdOf("prohibited_content")).toBe("content_rules");
        expect(bindingFor("restricted_categories").key).toBe("contentRules");
        expect(FIELD_BINDINGS.main_photo!.key).toBe("photos.front");
        expect(FIELD_BINDINGS.available_hours!.key).toBe("visibilityWindow");
    });

    it("keeps an unbound answer under extra, a file as its url", () => {
        let form = emptyForm();
        form = { ...form, ...writeAnswer(form, "terms", true) };
        form = { ...form, ...writeAnswer(form, "site_map", { url: "https://files.adx.in/map.pdf", name: "map.pdf" }) };
        expect(form.extra).toEqual({ terms: true, site_map: { url: "https://files.adx.in/map.pdf", name: "map.pdf" } });
        expect(readAnswer(form, "site_map")).toBe("https://files.adx.in/map.pdf");
        expect(bindingFor("site_map").key).toBe("extra.site_map");
    });

    it("lets the console put the frames' draft-only questions back by id", () => {
        let form = emptyForm();
        form = { ...form, ...writeAnswer(form, "age_band", "25–34") };
        form = { ...form, ...writeAnswer(form, "barc_report", "https://files.adx.in/barc.pdf") };
        form = { ...form, ...writeAnswer(form, "coverage", "Bengaluru + 50 km") };
        form = { ...form, ...writeAnswer(form, "available_year_round", "yes") };
        form = { ...form, ...writeAnswer(form, "installation_by_adx", true) };
        expect(form.audience.ageBand).toBe("25–34");
        expect(form.audienceDocs.barc).toEqual({ url: "https://files.adx.in/barc.pdf", name: "barc.pdf" });
        expect(form.coverage).toBe("Bengaluru + 50 km");
        // The listing-data-gaps lot: the coverage is its own column — no longer written into the city.
        expect(form.city).toBe("");
        expect(form.availableYearRound).toBe("yes");
        expect(form.installationByAdx).toBe(true);
    });

    it("applies the site's clearing rules on a category, a venue and a format change", () => {
        let form = indoorForm();
        form = { ...form, ...writeAnswer(form, "venue_type_id", "v-road") };
        expect(form.mediaTypeId).toBeNull();
        expect(form.placement).toBe("");
        form = { ...form, ...writeAnswer(form, "media_type_id", "m-hoarding") };
        form = { ...form, ...writeAnswer(form, "slots_total", 4) };
        form = { ...form, ...writeAnswer(form, "media_type_id", "m-led") };
        expect(form.slotsTotal).toBe(1);
        expect(writeAnswer(form, "media_type_id", "m-led")).toEqual({});
        expect(writeAnswer(form, "slots_total", 99)).toEqual({ slotsTotal: 24 });
        expect(writeAnswer(form, "rights_basis", "OWNED")).toEqual({ rightsBasis: "OWNED", ownVenue: true, rightsValidUntil: "" });
        expect(writeAnswer(form, "base_price", "₹12,600")).toEqual({ basePrice: "12600" });
        // Hours none of the five windows name are kept as they are (listing-data-gaps lot), not dropped.
        expect(writeAnswer(form, "available_hours", { from: "7 AM", to: "3 PM" })).toEqual({ visibilityWindow: "", customHours: { from: "7 AM", to: "3 PM" } });
    });

    it("files a paper under the site's slot for its kind, then under a kind key", () => {
        const used = new Set<string>();
        const first = documentKeyFor("TRANSIT", "OTHER", used);
        used.add(first);
        const second = documentKeyFor("TRANSIT", "OTHER", used);
        used.add(second);
        expect([first, second]).toEqual(["transitDl", "transitInsurance"]);
        expect(documentKeyFor("INDOOR", "MUNICIPAL_PERMIT", new Set())).toBe("kind:MUNICIPAL_PERMIT");
        expect(documentKeyFor("INDOOR", "MUNICIPAL_PERMIT", new Set(["kind:MUNICIPAL_PERMIT"]))).toBe("kind:MUNICIPAL_PERMIT:2");
    });
});

describe("what a screen still needs", () => {
    const screens = flowScreens(flow, { category: "INDOOR" });
    const at = (key: string) => screens.find((s) => s.key === key)!;

    it("names the required fields with nothing in them, in their labels' words", () => {
        const form = emptyForm();
        form.category = "INDOOR";
        expect(flowMissingOn(at("spot-details"), form, catalogue)).toEqual(["Ad spot name", "Full address", "City", "Location pin", "Width", "Height"]);
        expect(flowMissingOn(at("review"), form, catalogue)).toEqual(["Main photo", "Terms agreement"]);
        form.extra.terms = true;
        form.photos.front = { url: "https://files.adx.in/f.jpg", name: "f.jpg" };
        expect(flowMissingOn(at("review"), form, catalogue)).toEqual([]);
    });

    it("keeps the server's two price rules and the site's grace on an empty venue list", () => {
        const form = indoorForm();
        form.basePrice = "abc";
        expect(flowMissingOn(at("pricing"), form, catalogue)).toEqual(["Base price"]);
        form.basePrice = "10";
        form.pricingUnit = "PER_SQFT_PER_MONTH";
        form.widthFt = "";
        expect(flowMissingOn(at("pricing"), form, catalogue)).toEqual(["Width and height (for a per sq.ft rate)"]);
        const media = emptyForm();
        media.category = "MEDIA";
        expect(flowMissingOn(flowScreens(flow, media).find((s) => s.key === "venue")!, media, catalogue)).toEqual([]);
        expect(flowMissingOn(at("venue"), { ...emptyForm(), category: "INDOOR" }, catalogue)).toEqual(["Venue"]);
    });

    it("lists every screen's gaps for the submit, and none for a complete form", () => {
        // Outdoor: no venue is required, and with no venue no format is offered, so the spot-type screen does not block (the site's grace).
        const gaps = flowGaps(flow, { ...emptyForm(), category: "OUTDOOR" }, catalogue);
        expect(gaps.map((g) => g.screen.key)).toEqual(["spot-details", "pricing", "documents", "review"]);
        expect(flowGaps(flow, { ...emptyForm(), category: "INDOOR" }, catalogue).map((g) => g.screen.key)).toEqual(["venue", "spot-details", "pricing", "documents", "review"]);
        const form = indoorForm();
        form.extra.terms = true;
        expect(flowGaps(flow, form, catalogue)).toEqual([]);
    });
});

describe("where a screen sits", () => {
    const screens = flowScreens(flow, { category: "OUTDOOR" });

    it("puts the flow's screens under the frames' four chapters", () => {
        expect(screens.map((s, i) => chapterOfScreen(s.key, i, screens.length))).toEqual([1, 1, 1, 2, 2, 3, 3, 4, 4]);
        expect(chapterOfScreen("something-new", 0, 8)).toBe(1);
        expect(chapterOfScreen("something-new", 7, 8)).toBe(4);
    });

    it("finds an old link's or the review's baked step on the flow", () => {
        expect(screenForBakedStep("details", screens)?.key).toBe("spot-details");
        expect(screenForBakedStep("terms", screens)?.key).toBe("pricing");
        expect(screenForBakedStep("rules", screens)?.key).toBe("content-rules");
        expect(screenForBakedStep("audience", screens)?.key).toBe("more-info");
        expect(screenForBakedStep("verify", screens)?.key).toBe("review");
        expect(screenForBakedStep("review", screens)?.key).toBe("review");
        expect(resolveScreenKey("pricing", screens)).toBe("pricing");
        expect(resolveScreenKey("category", screens)).toBe("select-category");
        expect(resolveScreenKey("nope", screens)).toBe("select-category");
        expect(resolveScreenKey(null, screens)).toBe("select-category");
    });

    it("pairs short controls the way the frames do and moves a label's unit into the suffix", () => {
        const [w, h, area] = screens[3]!.fields.filter((f) => ["width_ft", "height_ft", "area_sq_ft"].includes(f.id));
        expect(pairable(w!, h)).toBe(true);
        expect(pairable(h!, area)).toBe(false);
        expect(splitUnit("Width (ft)")).toEqual({ label: "Width", suffix: "ft" });
        expect(splitUnit("Base price (Rs)")).toEqual({ label: "Base price", suffix: "₹" });
        expect(splitUnit("Min. booking (days)")).toEqual({ label: "Min. booking", suffix: "days" });
        expect(splitUnit("Total area (sq ft)")).toEqual({ label: "Total area", suffix: "sq.ft" });
        expect(splitUnit("Ad spot name")).toEqual({ label: "Ad spot name", suffix: null });
    });

    it("heads a section with the answer it names", () => {
        const form = indoorForm();
        const section = screens[3]!.fields[0]!;
        expect(sectionText(section, form, catalogue)).toBe("LED Wall");
        expect(sectionText(section, { ...form, mediaTypeId: null }, catalogue)).toBe("Ad spot");
        expect(sectionText({ id: "s", type: "section", label: "Vehicle" }, form, catalogue)).toBe("Vehicle");
    });
});

describe("drafts", () => {
    it("saves the apps' answers beside the site's form, at the flow's screen", () => {
        const form = indoorForm();
        const draft = toFlowDraftInput(form, flow, "pricing");
        expect(draft).toMatchObject({ category: "indoor", title: "Gym mirror decal", stepKey: "pricing", stepIndex: 6 });
        expect(draft.answers.web).toBe(form);
        expect(draft.answers.base_price).toBe("12600");
        expect(answersInPlay(draft.answers, flowScreens(flow, form))).not.toHaveProperty("web");
    });
});

/* ── LF-2 (28 Sep 2026): the restored questions, from the flow's answer ids to the body and the papers ── */

/** Every row of the LF-2 mapping table, answered in the apps' shape — the flow's ids, as a phone draft or the site's own answers carry them. */
const EVERY_FLOW_ANSWER = {
    category: "media",
    media_type_id: "m-hoarding",
    title: "Sunrise FM 92.7 breakfast show",
    address: "Sunrise FM 92.7",
    city: "Bengaluru",
    installation_by_adx: true,
    vehicle_number: "ka 01 ab 1234",
    vehicle_model: "City bus",
    broadcast_language: "Kannada",
    content_format: "Music and entertainment",
    slot_duration: "30 seconds",
    age_band: "25–34",
    gender_split: "Balanced",
    urban_rural: "Urban",
    sec_profile: "SEC A / B",
    income_bracket: "₹6 – 12 lakh",
    occupation: "Commuters",
    barc_report: "https://files.adx.in/barc.pdf",
    footfall_report: "https://files.adx.in/footfall.xlsx",
    available_year_round: "no",
    max_booking_days: "90",
    advance_booking_days: "0",
    cancellation_notice: "14",
    pricing_unit: "PER_DAY",
    base_price: "5000",
    rate_card: "https://files.adx.in/card.pdf",
    rate_card_valid_from: "2026-10-01",
    rate_card_valid_to: "2027-03-31",
    rate_card_seasonal: "Higher in the festive season (Oct – Dec)",
    main_photo: "https://files.adx.in/front.jpg",
    left_photo: "https://files.adx.in/left.jpg",
    right_photo: "https://files.adx.in/right.jpg",
    wide_photo: "https://files.adx.in/wide.jpg",
};

/** The body the mapping table names for those answers, key for key. */
const EVERY_FLOW_BODY = {
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

const REPORT_POSTS = [
    { key: "audience:barc", kind: "AUDIENCE_RATING", url: "https://files.adx.in/barc.pdf" },
    { key: "audience:footfall", kind: "FOOTFALL_AUDIT", url: "https://files.adx.in/footfall.xlsx" },
];

/** Answers written the way the flow's fields write them — through the bindings. */
function answered(form: ListingForm, answers: Record<string, unknown>): ListingForm {
    let next = form;
    for (const [id, value] of Object.entries(answers)) next = { ...next, ...writeAnswer(next, id, value) };
    return next;
}

describe("LF-2: every row of the mapping table, from the flow's ids", () => {
    it("files the exact body for the full answer set, and the two reports as AUDIENCE_RATING and FOOTFALL_AUDIT", () => {
        const form = formFromFlowAnswers(EVERY_FLOW_ANSWER);
        expect(toCreateBody(form, catalogue)).toEqual(EVERY_FLOW_BODY);
        expect(documentPostsOf(form)).toEqual(REPORT_POSTS);
        // The same answers read back off the form in the apps' shape, id for id.
        expect(flowAnswersOf(form, lf2Flow)).toMatchObject(EVERY_FLOW_ANSWER);
        // A phone draft opened without the flow (the baked steps) files the same body.
        const viaDraft = formFromDraft({ id: "p", displayId: "LST-2809-2603", category: "media", title: null, stepIndex: 9, stepKey: "rate-card", answers: EVERY_FLOW_ANSWER, createdAt: "", updatedAt: "" } as ListingDraft);
        expect(viaDraft.step).toBe("ratecard");
        expect(toCreateBody(viaDraft.form, catalogue)).toEqual(EVERY_FLOW_BODY);
        expect(documentPostsOf(viaDraft.form)).toEqual(REPORT_POSTS);
    });

    it("walks each branch of LF-2's flow and files what its screens asked", () => {
        const indoor = answered(indoorForm(), {
            installation_by_adx: true,
            age_band: "25–34",
            barc_report: "https://files.adx.in/barc.pdf",
            available_year_round: "yes",
            max_booking_days: "365",
            advance_booking_days: "7",
            cancellation_notice: "flexible",
            rate_card_valid_from: "2026-10-01",
            rate_card_valid_to: "2027-03-31",
            rate_card_seasonal: "Lower in summer",
            left_photo: "https://files.adx.in/left.jpg",
            right_photo: "https://files.adx.in/right.jpg",
        });
        const indoorFiled = formInPlay(indoor, lf2Flow);
        expect(toCreateBody(indoorFiled, catalogue)).toEqual({
            ...INDOOR_BODY,
            installationByAdx: true,
            audienceDemographics: { ageBand: "25–34" },
            availableYearRound: true,
            maxBookingDays: 365,
            advanceBookingDays: 7,
            cancellationPolicy: "FLEXIBLE",
            rateCardValidFrom: "2026-10-01",
            rateCardValidTo: "2027-03-31",
            seasonalVariationNote: "Lower in summer",
            photos: [
                { url: "https://files.adx.in/front.jpg", type: "FRONT" },
                { url: "https://files.adx.in/left.jpg", type: "LEFT" },
                { url: "https://files.adx.in/right.jpg", type: "RIGHT" },
                { url: "https://files.adx.in/wide.jpg", type: "WIDE" },
            ],
        });
        expect(documentPostsOf(indoorFiled)).toEqual([
            { key: "ownerNoc", kind: "OWNER_NOC", url: "https://files.adx.in/noc.pdf" },
            { key: "audience:barc", kind: "AUDIENCE_RATING", url: "https://files.adx.in/barc.pdf" },
        ]);

        const transit = answered(transitForm(), { vehicle_model: "City bus", cancellation_notice: "none" });
        expect(toCreateBody(formInPlay(transit, lf2Flow), catalogue)).toEqual({ ...TRANSIT_BODY, vehicleModel: "City bus", cancellationPolicy: "NONE" });

        const media = answered(mediaForm(), { broadcast_language: "Kannada", content_format: "News and current affairs", slot_duration: "30 seconds", footfall_report: "https://files.adx.in/footfall.xlsx", cancellation_notice: "30" });
        const mediaFiled = formInPlay(media, lf2Flow);
        expect(toCreateBody(mediaFiled, catalogue)).toEqual({ ...MEDIA_BODY, broadcastLanguage: "Kannada", contentFormat: "News and current affairs", size: "30 seconds", cancellationPolicy: "NOTICE", cancellationNoticeDays: 30 });
        expect(documentPostsOf(mediaFiled)).toEqual([{ key: "audience:footfall", kind: "FOOTFALL_AUDIT", url: "https://files.adx.in/footfall.xlsx" }]);
    });

    it("keeps the bodies the pre-LF-2 answers made, and files nothing a branch left or an older flow never asked", () => {
        expect(toCreateBody(formInPlay(indoorForm(), lf2Flow), catalogue)).toEqual(INDOOR_BODY);
        expect(toCreateBody(formInPlay(transitForm(), lf2Flow), catalogue)).toEqual(TRANSIT_BODY);
        expect(toCreateBody(formInPlay(mediaForm(), lf2Flow), catalogue)).toEqual(MEDIA_BODY);

        let form = answered(indoorForm(), { installation_by_adx: true });
        form = { ...form, ...writeAnswer(form, "category", "transit") };
        expect(toCreateBody(formInPlay(form, lf2Flow), catalogue)).not.toHaveProperty("installationByAdx");
        let bus = answered(transitForm(), { vehicle_model: "City bus" });
        bus = { ...bus, ...writeAnswer(bus, "category", "outdoor") };
        expect(toCreateBody(formInPlay(bus, lf2Flow), catalogue)).not.toHaveProperty("vehicleModel");

        const asked = answered(indoorForm(), { installation_by_adx: true, age_band: "25–34", max_booking_days: "30", left_photo: "https://files.adx.in/left.jpg", barc_report: "https://files.adx.in/barc.pdf" });
        const underOld = formInPlay(asked, flow);
        expect(toCreateBody(underOld, catalogue)).toEqual(INDOOR_BODY);
        expect(documentPostsOf(underOld).map((p) => p.kind)).toEqual(["OWNER_NOC"]);
    });
});

describe("LF-2: the mapping table and the file fields", () => {
    it("binds every answer LF-2's flow collects, on every branch", () => {
        for (const category of ["INDOOR", "OUTDOOR", "TRANSIT", "MEDIA"] as const) {
            const asked = flowScreens(lf2Flow, { category }).flatMap((s) => s.fields).filter(collects);
            expect(asked.filter((f) => !isBound(f.id)).map((f) => f.id)).toEqual(["terms"]);
        }
        expect(FIELD_BINDINGS.left_photo!.key).toBe("photos.left");
        expect(FIELD_BINDINGS.right_photo!.key).toBe("photos.right");
        expect(FIELD_BINDINGS.barc_report!.key).toBe("audienceDocs.barc");
    });

    it("lands an upload on the form's own key with its name, and reads it back whole", () => {
        let form = emptyForm();
        form = { ...form, ...writeAnswer(form, "left_photo", { url: "https://files.adx.in/u/7f3a.jpg", name: "IMG_0042.jpg" }) };
        form = { ...form, ...writeAnswer(form, "barc_report", { url: "https://files.adx.in/u/91cc.pdf", name: "BARC Q2.pdf" }) };
        form = { ...form, ...writeAnswer(form, "site_map", { url: "https://files.adx.in/u/map.pdf", name: "map.pdf" }) };
        expect(form.photos.left).toEqual({ url: "https://files.adx.in/u/7f3a.jpg", name: "IMG_0042.jpg" });
        expect(form.audienceDocs.barc).toEqual({ url: "https://files.adx.in/u/91cc.pdf", name: "BARC Q2.pdf" });
        expect(form.extra).toEqual({ site_map: { url: "https://files.adx.in/u/map.pdf", name: "map.pdf" } });
        expect(fileAnswerOf(form, "left_photo")).toEqual({ url: "https://files.adx.in/u/7f3a.jpg", name: "IMG_0042.jpg" });
        expect(fileAnswerOf(form, "barc_report")).toEqual({ url: "https://files.adx.in/u/91cc.pdf", name: "BARC Q2.pdf" });
        expect(fileAnswerOf(form, "site_map")).toEqual({ url: "https://files.adx.in/u/map.pdf", name: "map.pdf" });
        expect(fileAnswerOf(form, "right_photo")).toBeNull();
        expect(writeAnswer(form, "barc_report", null)).toEqual({ audienceDocs: { barc: null, footfall: null } });
    });
});

describe("LF-2: where the new screens sit", () => {
    const screens = flowScreens(lf2Flow, { category: "OUTDOOR" });

    it("puts audience under the details, terms and the rate card under pricing, and finds the baked steps' screens", () => {
        expect(screens.map((s) => s.key)).toEqual(["select-category", "venue", "spot-type", "spot-details", "more-info", "audience", "content-rules", "terms", "pricing", "rate-card", "documents", "review"]);
        expect(screens.map((s, i) => chapterOfScreen(s.key, i, screens.length))).toEqual([1, 1, 1, 2, 2, 2, 3, 3, 3, 3, 4, 4]);
        expect(screenForBakedStep("audience", screens)?.key).toBe("audience");
        expect(screenForBakedStep("terms", screens)?.key).toBe("terms");
        expect(screenForBakedStep("ratecard", screens)?.key).toBe("rate-card");
    });

    it("asks nothing new that blocks, and names the front photo in the flow's words", () => {
        expect(flowGaps(lf2Flow, { ...emptyForm(), category: "OUTDOOR" }, catalogue).map((g) => g.screen.key)).toEqual(["spot-details", "pricing", "documents", "review"]);
        const review = screens.find((s) => s.key === "review")!;
        expect(flowMissingOn(review, { ...emptyForm(), category: "OUTDOOR" }, catalogue)).toEqual(["Main photo (front)", "Terms agreement"]);
    });

    it("saves the LF-2 answers with the draft in the apps' shape, at the flow's screen", () => {
        const form = answered(indoorForm(), { cancellation_notice: "7", rate_card_seasonal: "Lower in summer", right_photo: "https://files.adx.in/right.jpg" });
        const draft = toFlowDraftInput(form, lf2Flow, "rate-card");
        expect(draft).toMatchObject({ stepKey: "rate-card", stepIndex: 9 });
        expect(draft.answers).toMatchObject({ cancellation_notice: "7", rate_card_seasonal: "Lower in summer", right_photo: "https://files.adx.in/right.jpg" });
        expect(toCreateBody(formInPlay(formFromFlowAnswers(draft.answers), lf2Flow), catalogue)).toEqual(toCreateBody(formInPlay(form, lf2Flow), catalogue));
    });
});
