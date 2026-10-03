import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/api-client";
import { refusedGapKeys, withoutGapKeys, type Catalogue, type Listing } from "@/services/listing-editor";
import { parseWizardFlow, type WizardFlow } from "@/services/flows";
import { siteCodeOf, siteLabelOf, siteOptionsFor, termsVersionOf, TRAFFIC_GRADES, VISIBILITY_RANGES } from "@/services/listing-site-questions";
import { visibilityHighlight } from "@/services/browse";
import { declarationsBody, documentsFromWaivers, documentWaiversOf, emptyForm, formFromDraft, formFromListing, patchFor, toCreateBody, type ListingForm } from "./form-model";
import { extraAnswersOf, flowAnswersOf, formFromFlowAnswers, formInPlay, readAnswer, writeAnswer } from "./flow/flow-model";
import { exifTakenAt, instantOf } from "./photo-time";

/*
 * The listing-data-gaps lot (the owner, 3 Oct 2026): ask what ADX stores,
 * store what ADX asks. The website's half — the questions, the answers it
 * used to drop, and the shapes it shares with the apps.
 */

const catalogue: Catalogue = {
    venues: [
        { id: "v-mall", name: "Shopping Mall", slug: "mall", category: "INDOOR", description: null, subVenues: [], isActive: true },
        { id: "v-road", name: "Roadside", slug: "road", category: "OUTDOOR", description: null, subVenues: [], isActive: true },
    ],
    mediaTypes: [
        { id: "m-hoarding", name: "Outdoor — Standard hoarding", slug: "hoarding", category: "OUTDOOR", description: null, venueTypeId: "v-road", formatGroup: "Hoardings", sizeClassIds: [], materialIds: [] },
        { id: "m-led", name: "Mall — LED Wall", slug: "led", category: "INDOOR", description: null, venueTypeId: "v-mall", formatGroup: "Digital Displays", sizeClassIds: [], materialIds: [] },
    ],
    sizeClasses: [],
    materials: [],
    contentCategories: [],
};

function answered(category: ListingForm["category"], mediaTypeId: string | null): ListingForm {
    const form = emptyForm();
    form.category = category;
    form.mediaTypeId = mediaTypeId;
    form.title = "Spot";
    form.address = "Whitefield Main Road";
    form.pricingUnit = "PER_DAY";
    form.basePrice = "800";
    form.estimatedDailyFootfall = "3500";
    form.trafficGrade = "HIGH";
    form.visibility = "OVER_300M";
    form.elevation = "ROOFTOP";
    form.widthPx = "1920";
    form.heightPx = "1080";
    form.vehicleType = "BUS";
    return form;
}

const SITE_KEYS = ["estimatedDailyFootfall", "trafficGrade", "visibility", "elevation", "widthPx", "heightPx", "vehicleType"];
const siteOf = (body: Record<string, unknown>) => Object.fromEntries(Object.entries(body).filter(([key]) => SITE_KEYS.includes(key)));

describe("the site questions, asked of the spots they fit", () => {
    it("files footfall, how busy and how far for a fixed spot, how high outdoors, pixels for a screen, the vehicle for transit", () => {
        expect(siteOf(toCreateBody(answered("INDOOR", "m-led"), catalogue))).toEqual({ estimatedDailyFootfall: 3500, trafficGrade: "HIGH", visibility: "OVER_300M", widthPx: 1920, heightPx: 1080 });
        expect(siteOf(toCreateBody(answered("OUTDOOR", "m-hoarding"), catalogue))).toEqual({ estimatedDailyFootfall: 3500, trafficGrade: "HIGH", visibility: "OVER_300M", elevation: "ROOFTOP" });
        expect(siteOf(toCreateBody(answered("TRANSIT", null), catalogue))).toEqual({ vehicleType: "BUS" });
        expect(siteOf(toCreateBody(answered("MEDIA", null), catalogue))).toEqual({});
    });

    it("keeps a footfall of 0, drops what is not a whole number, and asks nothing that blocks", () => {
        const form = answered("INDOOR", null);
        form.estimatedDailyFootfall = "0";
        form.widthPx = "0";
        expect(toCreateBody(form, catalogue).estimatedDailyFootfall).toBe(0);
        form.estimatedDailyFootfall = "12.5";
        expect(toCreateBody(form, catalogue)).not.toHaveProperty("estimatedDailyFootfall");
        expect(toCreateBody(emptyForm(), catalogue)).not.toHaveProperty("trafficGrade");
    });

    it("says available to book now only when the answer is no — yes is the column's default", () => {
        const form = answered("INDOOR", null);
        expect(toCreateBody(form, catalogue)).not.toHaveProperty("availableNow");
        form.availableNow = false;
        expect(toCreateBody(form, catalogue).availableNow).toBe(false);
    });

    it("binds the apps' field ids, digits only for the counts, and the switch as a yes/no", () => {
        let form = emptyForm();
        form = { ...form, ...writeAnswer(form, "estimated_daily_footfall", "3,500 people") };
        form = { ...form, ...writeAnswer(form, "traffic_grade", "VERY_HIGH") };
        form = { ...form, ...writeAnswer(form, "width_px", 1920) };
        form = { ...form, ...writeAnswer(form, "vehicle_type", "AUTO") };
        form = { ...form, ...writeAnswer(form, "available_now", false) };
        expect(form).toMatchObject({ estimatedDailyFootfall: "3500", trafficGrade: "VERY_HIGH", widthPx: "1920", vehicleType: "AUTO", availableNow: false });
        expect(readAnswer(form, "available_now")).toBe(false);
        expect(readAnswer(emptyForm(), "available_now")).toBe(true);
    });

    it("reads words stored before the codes as their code, and keeps words it cannot match as a choice of their own", () => {
        expect(siteCodeOf(TRAFFIC_GRADES, "very high")).toBe("VERY_HIGH");
        expect(siteCodeOf(TRAFFIC_GRADES, "High")).toBe("HIGH");
        expect(siteCodeOf(VISIBILITY_RANGES, "Excellent")).toBe("Excellent");
        expect(siteOptionsFor(VISIBILITY_RANGES, "Excellent").at(-1)).toEqual({ value: "Excellent", label: "Excellent" });
        expect(siteLabelOf(VISIBILITY_RANGES, "150_300M")).toBe("150–300 m");
        expect(visibilityHighlight("OVER_300M")).toBe("Seen from over 300 m");
        expect(visibilityHighlight("UNDER_50M")).toBeNull();
        expect(visibilityHighlight("High")).toBe("High visibility");
    });
});

const listingRow = (patch: Partial<Listing>): Listing =>
    ({ id: "l1", displayId: "LST-0310-2601", title: "Bus back", category: "TRANSIT", subType: null, description: null, address: "Majestic", city: "Bengaluru", latitude: 12.9, longitude: 77.5, status: "ACTIVE", ratePerDay: "800.00", pricingUnit: "PER_DAY", basePrice: "800.00", placement: null, widthFt: null, heightFt: null, areaSqFt: null, minBookingDays: null, availableNow: true, availableFrom: null, availableHoursFrom: null, availableHoursTo: null, peakPeriodNote: null, targetAudience: null, uniqueSellingPoint: null, footfallNote: null, illumination: null, facing: null, rejectionReason: null, submittedAt: null, publishedAt: null, createdAt: "2026-10-03T00:00:00.000Z", ...patch }) as Listing;

describe("the edit pages", () => {
    it("send a transit listing's vehicle from its details page — the kind of vehicle with the registration and the hours", () => {
        const form = formFromListing(listingRow({ vehicleType: "Bus", vehicleNumber: "KA01AB1234", availableHoursFrom: "10 AM", availableHoursTo: "7 PM" }));
        expect(form.vehicleType).toBe("BUS");
        expect(form.customHours).toEqual({ from: "10 AM", to: "7 PM" });
        expect(patchFor("details", form)).toEqual({ title: "Bus back", vehicleNumber: "KA01AB1234", vehicleType: "BUS", availableHoursFrom: "10 AM", availableHoursTo: "7 PM" });
        // An operating-hours answer on the vehicle page goes to its own columns.
        expect(patchFor("vehicle", { ...form, operatingHours: "day" })).toMatchObject({ operatingHoursFrom: "6 AM", operatingHoursTo: "10 PM" });
    });

    it("send a fixed spot's site answers, the pixels only once the catalogue names a screen", () => {
        const form = formFromListing(listingRow({ category: "INDOOR", mediaTypeId: "m-led", estimatedDailyFootfall: 900, trafficGrade: "Medium", visibility: "50_150M", widthPx: 1080, heightPx: 1920 }));
        expect(patchFor("details", form, catalogue)).toMatchObject({ estimatedDailyFootfall: 900, trafficGrade: "MEDIUM", visibility: "50_150M", widthPx: 1080, heightPx: 1920 });
        expect(patchFor("details", form)).not.toHaveProperty("widthPx");
    });

    it("read the coverage from its own column, and an older media listing's from the city", () => {
        expect(formFromListing(listingRow({ category: "MEDIA", coverage: "Karnataka", city: "Bengaluru" })).coverage).toBe("Karnataka");
        expect(formFromListing(listingRow({ category: "MEDIA", coverage: null, city: "Bengaluru" })).coverage).toBe("");
        expect(formFromListing(listingRow({ category: "MEDIA", city: "Bengaluru" })).coverage).toBe("Bengaluru");
    });

    it("put the papers marked not applicable back on their slots", () => {
        // As the server keeps them: the kind, the words, and the moment ADX first heard it.
        const waivers = [
            { kind: "OTHER", reason: "Fitness Certificate: Not applicable", at: "2026-10-03T00:00:00.000Z" },
            { kind: "OWNER_NOC", reason: "NOC from owner: I am the owner", at: "2026-10-03T00:00:00.000Z" },
        ];
        const documents = documentsFromWaivers("TRANSIT", waivers);
        expect(documents).toEqual({ transitFitness: { waived: "Not applicable" }, transitNoc: { waived: "I am the owner" } });
        expect(documentWaiversOf({ category: "TRANSIT", documents })).toEqual(waivers.map(({ kind, reason }) => ({ kind, reason })));
        expect(formFromListing(listingRow({ documentWaivers: waivers })).documents.transitFitness).toEqual({ waived: "Not applicable" });
    });
});

describe("the answers the create used to throw away", () => {
    it("says the tick with the flow it was ticked on, the ownership declaration and the waived papers — ADX stamps the moments", () => {
        const form = answered("TRANSIT", null);
        form.extra = { terms: true };
        form.rightsBasis = "OWNED";
        form.documents = { transitPermit: { waived: "Not applicable" } };
        expect(declarationsBody(form, { termsVersion: termsVersionOf({ version: 7 }) })).toEqual({
            termsAccepted: true,
            termsVersion: "flows.listing:v7",
            ownershipDeclared: true,
            documentWaivers: [{ kind: "MUNICIPAL_PERMIT", reason: "Commercial Vehicle Permit: Not applicable" }],
        });
        expect(declarationsBody(emptyForm())).toEqual({});
    });

    it("never claims an agreement the answers do not hold", () => {
        const form = emptyForm();
        form.extra = { terms: false };
        expect(declarationsBody(form, { termsVersion: "flows.listing:v7" })).not.toHaveProperty("termsAccepted");
    });

    it("keeps the coverage as its own column and the city as the city", () => {
        const form = answered("MEDIA", null);
        form.city = "Bengaluru";
        form.coverage = "Bengaluru + 50 km";
        const body = toCreateBody(form, catalogue);
        expect(body.city).toBe("Bengaluru");
        expect(body.coverage).toBe("Bengaluru + 50 km");
        // Wherever the flow asks it — a transit or area spot's ground too.
        expect(toCreateBody({ ...form, category: "TRANSIT" }, catalogue).coverage).toBe("Bengaluru + 50 km");
        expect(toCreateBody({ ...form, coverage: " " }, catalogue)).not.toHaveProperty("coverage");
    });

    it("keeps hours none of the windows name, and the operating hours in their own columns beside the window", () => {
        const fromPhone = formFromFlowAnswers({ category: "indoor", available_hours: { from: "10 AM", to: "7 PM" } });
        expect(toCreateBody(fromPhone, catalogue)).toMatchObject({ availableHoursFrom: "10 AM", availableHoursTo: "7 PM" });
        const draft = formFromDraft({ id: "d", displayId: "LST-1", category: "indoor", title: null, stepIndex: 0, stepKey: "terms", answers: { category: "indoor", available_hours: { from: "10 AM", to: "7 PM" } }, createdAt: "", updatedAt: "" } as never).form;
        expect(draft.customHours).toEqual({ from: "10 AM", to: "7 PM" });

        const transit = answered("TRANSIT", null);
        transit.visibilityWindow = "24h";
        transit.operatingHours = "peak";
        expect(toCreateBody(transit, catalogue)).toMatchObject({ availableHoursFrom: "12 AM", availableHoursTo: "12 AM", operatingHoursFrom: "7 AM", operatingHoursTo: "9 PM" });
        transit.visibilityWindow = "";
        expect(toCreateBody(transit, catalogue)).toMatchObject({ availableHoursFrom: "7 AM", availableHoursTo: "9 PM", operatingHoursFrom: "7 AM", operatingHoursTo: "9 PM" });
        expect(declarationsBody(transit)).not.toHaveProperty("extraAnswers");
        // The edit page reads them back from their own columns, else (an older transit listing) from its hours.
        expect(formFromListing(listingRow({ availableHoursFrom: "12 AM", availableHoursTo: "12 AM", operatingHoursFrom: "8 PM", operatingHoursTo: "6 AM" })).operatingHours).toBe("night");
        expect(formFromListing(listingRow({ availableHoursFrom: "7 AM", availableHoursTo: "9 PM" })).operatingHours).toBe("peak");
    });

    it("files the pin's GPS accuracy, and nothing for a pin placed by hand", () => {
        const form = answered("OUTDOOR", "m-hoarding");
        form.location = { latitude: 12.97, longitude: 77.75, accuracyM: 8.04 };
        expect(toCreateBody(form, catalogue)).toMatchObject({ latitude: 12.97, longitude: 77.75, locationAccuracyM: 8 });
        form.location = { latitude: 12.97, longitude: 77.75 };
        expect(toCreateBody(form, catalogue)).not.toHaveProperty("locationAccuracyM");
        // A phone's pin, in the apps' shape — and an older phone's `accuracy`.
        expect(formFromFlowAnswers({ location: { latitude: 1, longitude: 2, accuracyM: 12.5 } }).location).toEqual({ latitude: 1, longitude: 2, accuracyM: 12.5 });
        expect(formFromFlowAnswers({ location: { latitude: 1, longitude: 2, accuracy: 30 } }).location).toEqual({ latitude: 1, longitude: 2, accuracyM: 30 });
    });

    it("files each photograph with its upload row and the moment it was taken, and keeps both through the flow", () => {
        const form = answered("OUTDOOR", "m-hoarding");
        form.photos.front = { url: "https://files.adx.in/front.jpg", name: "front.jpg", fileId: "f1", takenAt: "2026-10-02T04:00:00.000Z" };
        form.photos.wide = { url: "https://files.adx.in/wide.jpg", name: "wide.jpg" };
        const photos = [
            { url: "https://files.adx.in/front.jpg", type: "FRONT", uploadedFileId: "f1", takenAt: "2026-10-02T04:00:00.000Z" },
            { url: "https://files.adx.in/wide.jpg", type: "WIDE" },
        ];
        expect(toCreateBody(form, catalogue).photos).toEqual(photos);
        expect(toCreateBody(formInPlay(form, flow), catalogue).photos).toEqual(photos);
        // The apps keep the rows beside the photo answers, by URL.
        expect(flowAnswersOf(form, flow).photo_meta).toEqual({ "https://files.adx.in/front.jpg": { uploadedFileId: "f1", takenAt: "2026-10-02T04:00:00.000Z" } });
        expect(formFromFlowAnswers({ main_photo: "https://files.adx.in/p.jpg", photo_meta: { "https://files.adx.in/p.jpg": { uploadedFileId: "f9" } } }).photos.front).toEqual({ url: "https://files.adx.in/p.jpg", name: "p.jpg", fileId: "f9" });
    });
});

/** A flow with one question the listing has no column for — added in the Flow Editor. */
const flow: WizardFlow = parseWizardFlow({
    label: "Listing",
    version: 9,
    screens: [{ key: "select-category", title: "Category", step: 1, totalSteps: 2, ctaLabel: "Continue", fields: [{ id: "category", type: "selectable-cards", label: "Category", required: true, branching: true, options: [{ id: "outdoor", title: "Outdoor" }] }] }],
    branches: {
        outdoor: {
            id: "outdoor",
            title: "Outdoor",
            description: "",
            screens: [
                {
                    key: "spot-details",
                    title: "Spot details",
                    step: 2,
                    totalSteps: 2,
                    ctaLabel: "Continue",
                    fields: [
                        { type: "text", id: "title", label: "Ad spot name", required: true },
                        { type: "number", id: "estimated_daily_footfall", label: "About how many people pass this spot in a day?", hint: "Your best estimate — we may refine it with measured data." },
                        { type: "select", id: "traffic_grade", label: "How busy is it?", options: TRAFFIC_GRADES.map((o) => ({ id: o.value, title: o.label })) },
                        { type: "select", id: "parking", label: "Is there parking nearby?", options: [{ id: "yes", title: "Yes" }, { id: "no", title: "No" }] },
                        { type: "image-upload", id: "main_photo", label: "Main photo (front)" },
                        { type: "image-upload", id: "wide_photo", label: "Wide angle shot" },
                        { type: "checkbox", id: "terms", label: "Terms agreement", required: true },
                    ],
                },
            ],
        },
    },
})!;

describe("every other answer", () => {
    it("lands a flow question with no mapping in extraAnswers, in the words it was asked — never dropped", () => {
        let form = answered("OUTDOOR", "m-hoarding");
        form = { ...form, ...writeAnswer(form, "parking", "yes") };
        form = { ...form, ...writeAnswer(form, "terms", true) };
        const filing = formInPlay(form, flow);
        expect(extraAnswersOf(filing, flow)).toEqual([{ key: "parking", label: "Is there parking nearby?", value: "yes" }]);
        const body = { ...toCreateBody(filing, catalogue), ...declarationsBody(filing, { termsVersion: termsVersionOf(flow), extraAnswers: extraAnswersOf(filing, flow) }) };
        expect(body).toMatchObject({ estimatedDailyFootfall: 3500, trafficGrade: "HIGH", termsAccepted: true, termsVersion: "flows.listing:v9", extraAnswers: [{ key: "parking", label: "Is there parking nearby?", value: "yes" }] });
    });

    it("files nothing extra for a question left blank, a bound question, or the tick", () => {
        const form = answered("OUTDOOR", "m-hoarding");
        expect(extraAnswersOf({ ...form, extra: { terms: true, parking: "  " } }, flow)).toEqual([]);
    });
});

describe("a server that does not know the lot's columns yet", () => {
    it("is sent the request once more without the keys it named", () => {
        const body = { title: "Spot", estimatedDailyFootfall: 10, coverage: "x", photos: [{ url: "u", type: "FRONT", uploadedFileId: "f", takenAt: "t" }] };
        const named = new ApiError(400, "VALIDATION_ERROR", "Invalid request", { formErrors: ["Unrecognized key(s) in object: 'estimatedDailyFootfall', 'coverage'"], fieldErrors: { photos: ["Unrecognized key(s) in object: 'uploadedFileId', 'takenAt'"] } });
        // The lot's own names, as the backend's LD-1 schema takes them.
        expect(refusedGapKeys(new ApiError(400, "VALIDATION_ERROR", "Invalid request", { fieldErrors: { termsAccepted: ["Expected boolean"] } }), { termsAccepted: true })).toEqual(["termsAccepted"]);
        const refused = refusedGapKeys(named, body);
        expect(refused.sort()).toEqual(["coverage", "estimatedDailyFootfall", "photos.meta"]);
        expect(withoutGapKeys(body, refused)).toEqual({ title: "Spot", photos: [{ url: "u", type: "FRONT" }] });
    });

    it("leaves any other refusal alone", () => {
        expect(refusedGapKeys(new ApiError(400, "VALIDATION_ERROR", "Invalid request", { fieldErrors: { title: ["Required"] } }), { title: "" })).toEqual([]);
        expect(refusedGapKeys(new ApiError(409, "CITY_NOT_OPEN", "Not yet"), { coverage: "x" })).toEqual([]);
    });
});

/** A minimal JPEG: SOI, an APP1 Exif block whose TIFF holds IFD0 → Exif IFD → DateTimeOriginal (+ its offset), then SOS. */
function jpegWithExif(moment: string, zone: string | null, little = true): DataView {
    const bytes: number[] = [];
    const u16 = (v: number) => (little ? [v & 0xff, v >> 8] : [v >> 8, v & 0xff]);
    const u32 = (v: number) => (little ? [v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff, v >>> 24] : [v >>> 24, (v >> 16) & 0xff, (v >> 8) & 0xff, v & 0xff]);
    const ascii = (text: string) => [...text].map((c) => c.charCodeAt(0)).concat(0);
    // TIFF: header (8) · IFD0 at 8 with one entry (2 + 12 + 4 = 18) · Exif IFD at 26 · then the strings.
    const exifEntries = zone ? 2 : 1;
    const exifIfdAt = 26;
    const stringsAt = exifIfdAt + 2 + exifEntries * 12 + 4;
    const momentBytes = ascii(moment);
    const zoneBytes = zone ? ascii(zone) : [];
    const tiff = [
        ...(little ? [0x49, 0x49] : [0x4d, 0x4d]),
        ...u16(42),
        ...u32(8),
        ...u16(1),
        ...u16(0x8769), ...u16(4), ...u32(1), ...u32(exifIfdAt),
        ...u32(0),
        ...u16(exifEntries),
        ...u16(0x9003), ...u16(2), ...u32(momentBytes.length), ...u32(stringsAt),
        ...(zone ? [...u16(0x9011), ...u16(2), ...u32(zoneBytes.length), ...u32(stringsAt + momentBytes.length)] : []),
        ...u32(0),
        ...momentBytes,
        ...zoneBytes,
    ];
    const app1 = [0x45, 0x78, 0x69, 0x66, 0, 0, ...tiff];
    bytes.push(0xff, 0xd8, 0xff, 0xe1, (app1.length + 2) >> 8, (app1.length + 2) & 0xff, ...app1, 0xff, 0xda, 0, 2);
    return new DataView(new Uint8Array(bytes).buffer);
}

describe("when a photograph was taken", () => {
    it("reads DateTimeOriginal with the camera's own offset, in either byte order", () => {
        expect(exifTakenAt(jpegWithExif("2026:09:30 14:05:09", "+05:30"))).toBe("2026-09-30T08:35:09.000Z");
        expect(exifTakenAt(jpegWithExif("2026:09:30 14:05:09", "+00:00", false))).toBe("2026-09-30T14:05:09.000Z");
    });

    it("takes India's offset when the camera wrote none, and says nothing for a file without EXIF", () => {
        expect(exifTakenAt(jpegWithExif("2026:09:30 14:05:09", null))).toBe("2026-09-30T08:35:09.000Z");
        expect(exifTakenAt(new DataView(new Uint8Array([0x89, 0x50, 0x4e, 0x47]).buffer))).toBeNull();
        expect(exifTakenAt(new DataView(new Uint8Array([0xff, 0xd8, 0xff, 0xda, 0, 2]).buffer))).toBeNull();
        expect(instantOf("0000:00:00 00:00:00", null)).toBeNull();
    });
});
