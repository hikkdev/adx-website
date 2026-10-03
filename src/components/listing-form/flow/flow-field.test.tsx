/* The jest-dom matchers are wired in vitest.setup.ts; this import is for their types, which tsc reads from here. */
import "@testing-library/jest-dom/vitest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as React from "react";
import { fireEvent, render, screen as page, within } from "@testing-library/react";
import type { Catalogue } from "@/services/listing-editor";
import { parseWizardFlow, type FlowField, type FlowScreen, type WizardFlow } from "@/services/flows";
import { emptyForm, type ListingForm } from "../form-model";

vi.mock("next/dynamic", () => ({ default: () => () => <div data-testid="location-map" /> }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/services/listing-editor", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/services/listing-editor")>();
    return {
        ...actual,
        listingEditorService: {
            ...actual.listingEditorService,
            descriptionQuota: vi.fn().mockRejectedValue(new Error("no provider")),
            resolveCity: vi.fn().mockRejectedValue(new Error("offline")),
            cities: vi.fn().mockResolvedValue({ items: [], comingSoon: [] }),
            autocomplete: vi.fn().mockResolvedValue([]),
            suggestedRate: vi.fn().mockRejectedValue(new Error("none")),
        },
    };
});

import { FlowFieldView, resetUnknownKindWarnings } from "./flow-field";
import { FlowScreenView, screenLine } from "./flow-screen";
import { flowScreens } from "./flow-model";

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

const flow: WizardFlow = parseWizardFlow({
    label: "Listing",
    screens: [{ key: "select-category", title: "Ad space category", subtitle: "Choose the ad space category.", step: 1, totalSteps: 3, ctaLabel: "Continue", fields: [{ id: "category", type: "selectable-cards", label: "Category", required: true, branching: true, options: [{ id: "indoor", title: "Indoor", description: "Malls" }, { id: "outdoor", title: "Outdoor", description: "Roads" }] }] }],
    branches: {
        indoor: {
            id: "indoor",
            title: "Indoor",
            description: "",
            screens: [
                {
                    key: "spot-details",
                    title: "Spot details",
                    step: 2,
                    totalSteps: 3,
                    ctaLabel: "Save spot details",
                    fields: [
                        { type: "section", id: "sec_spot", label: "Ad spot", from: ["media_type_id"] },
                        { type: "text", id: "title", label: "Ad spot name", placeholder: "Gym mirror decal", required: true },
                        { type: "sub-venue", id: "placement", label: "Placement area", dependsOn: "venue_type_id" },
                        { type: "text", id: "address", label: "Full address", required: true },
                        { type: "city", id: "city", label: "City", required: true },
                        { type: "section", id: "sec_location", label: "Location Pin" },
                        { type: "geo-point", id: "location", label: "Location pin", hint: "Drag pin to verify exact location", required: true },
                        { type: "section", id: "sec_dimensions", label: "Dimensions & Visibility" },
                        { type: "number", id: "width_ft", label: "Width (ft)", required: true },
                        { type: "number", id: "height_ft", label: "Height (ft)", required: true, hint: "Measure the face, not the frame." },
                        { type: "computed", id: "area_sq_ft", label: "Total area (sq ft)", from: ["width_ft", "height_ft"], op: "multiply", readOnly: true },
                        { type: "select", id: "illumination", label: "Illumination", options: [{ id: "Non-lit", title: "Non-lit" }, { id: "Back-lit", title: "Back-lit" }] },
                        { type: "select", id: "facing", label: "Facing", options: [{ id: "Single", title: "Single" }] },
                        { type: "hologram", id: "hologram", label: "Hologram depth" },
                    ],
                },
                {
                    key: "pricing",
                    title: "Pricing & availability",
                    step: 3,
                    totalSteps: 3,
                    ctaLabel: "Save price",
                    fields: [
                        { type: "select", id: "pricing_unit", label: "Rate basis", required: true, options: [{ id: "PER_DAY", title: "Per day" }, { id: "PER_WEEK", title: "Per week" }] },
                        { type: "base-price", id: "base_price", label: "Base price (Rs)", required: true, showIndicator: true },
                        { type: "number", id: "min_booking_days", label: "Min. booking (days)" },
                        { type: "date", id: "available_from", label: "Available from" },
                        { type: "time-range", id: "available_hours", label: "Visibility hours" },
                        { type: "textarea", id: "description", label: "Advertising space description", aiAssist: true },
                        { type: "content-stance", id: "restricted_categories", label: "Restricted categories", scope: "RESTRICTED" },
                        { type: "content-prohibited", id: "prohibited_content", label: "Prohibited content", scope: "PROHIBITED" },
                        { type: "file-upload", id: "rate_card", label: "Upload rate card" },
                        { type: "switch", id: "weekend_only", label: "Weekends only" },
                    ],
                },
                {
                    key: "review",
                    title: "Review & submit",
                    step: 4,
                    totalSteps: 3,
                    ctaLabel: "Submit listing",
                    fields: [
                        { type: "document-upload", id: "documents", label: "Venue proof", options: [{ id: "OWNER_NOC", title: "Owner NOC", description: "The owner's permission" }, { id: "MUNICIPAL_PERMIT", title: "Municipal permit" }] },
                        { type: "image-upload", id: "main_photo", label: "Main photo", required: true },
                        { type: "checkbox", id: "terms", label: "Terms agreement", description: "I confirm that all information provided is accurate.", required: true },
                    ],
                },
            ],
        },
        outdoor: { id: "outdoor", title: "Outdoor", description: "", screens: [] },
    },
})!;

const indoor = (): ListingForm => ({ ...emptyForm(), category: "INDOOR", venueTypeId: "v-mall", mediaTypeId: "m-led", widthFt: "40", heightFt: "20" });

/** A controlled harness: the form in state, every patch also handed to a spy. */
function Harness({ field, screen, initial, onPatch, isLast = false, go = () => undefined }: { field?: FlowField; screen?: FlowScreen; initial: ListingForm; onPatch?: (patch: Partial<ListingForm>) => void; isLast?: boolean; go?: (key: string) => void }) {
    const [form, setForm] = React.useState(initial);
    const set = (patch: Partial<ListingForm>) => {
        onPatch?.(patch);
        setForm((current) => ({ ...current, ...patch }));
    };
    const ctx = { form, set, catalogue, listingId: null, aiBucket: { draftKey: "wvisit1234" } };
    if (field) return <FlowFieldView field={field} ctx={ctx} />;
    return <FlowScreenView flow={flow} screen={screen!} screens={flowScreens(flow, form)} isLast={isLast} kycVerified={false} missingBasics={null} go={go} {...ctx} />;
}

const screens = flowScreens(flow, { category: "INDOOR" });
const at = (key: string) => screens.find((s) => s.key === key)!;

beforeEach(() => {
    resetUnknownKindWarnings();
});

describe("FL-1: the flow's fields, drawn with the site's controls", () => {
    it("draws the spot-details screen in the flow's order, pairs the short controls and moves the unit into the suffix", () => {
        const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
        render(<Harness screen={at("spot-details")} initial={indoor()} />);
        // The first section names the earlier answer — the red format line — and the others head their groups.
        expect(page.getByText("LED Wall")).toBeInTheDocument();
        expect(page.getByText("Location Pin")).toBeInTheDocument();
        expect(page.getByText("Dimensions & Visibility")).toBeInTheDocument();
        expect(page.getByPlaceholderText("Gym mirror decal")).toBeInTheDocument();
        // The venue names its areas, so the placement is a choice rather than free text.
        expect(page.getByRole("option", { name: "Food court" })).toBeInTheDocument();
        expect(page.getByTestId("location-map")).toBeInTheDocument();
        const width = page.getByLabelText(/^Width/);
        const height = page.getByLabelText(/^Height/);
        expect(width.closest(".md\\:grid-cols-2")).not.toBeNull();
        expect(width.closest(".md\\:grid-cols-2")).toBe(height.closest(".md\\:grid-cols-2"));
        expect(page.getAllByText("ft")).toHaveLength(2);
        expect(page.getByText("Measure the face, not the frame.")).toBeInTheDocument();
        expect(page.getByDisplayValue("800 sq.ft")).toHaveAttribute("readonly");
        expect(page.getByRole("option", { name: "Back-lit" })).toBeInTheDocument();
        // A kind the site cannot draw is skipped with one warning per kind, never a crash.
        expect(page.queryByText("Hologram depth")).not.toBeInTheDocument();
        expect(warn).toHaveBeenCalledTimes(1);
        expect(warn.mock.calls[0]![0]).toContain('"hologram"');
        warn.mockRestore();
    });

    it("writes every answer through the bindings, into the form's own keys", () => {
        const patches: Partial<ListingForm>[] = [];
        render(<Harness screen={at("spot-details")} initial={indoor()} onPatch={(p) => patches.push(p)} />);
        fireEvent.change(page.getByPlaceholderText("Gym mirror decal"), { target: { value: "Gym mirror decal - reception" } });
        fireEvent.change(page.getByLabelText(/^Width/), { target: { value: "4x2" } });
        fireEvent.change(page.getByLabelText("Illumination"), { target: { value: "Back-lit" } });
        fireEvent.change(page.getByLabelText("Placement area"), { target: { value: "Atrium" } });
        expect(patches).toEqual([{ title: "Gym mirror decal - reception" }, { widthFt: "42" }, { illumination: "Back-lit" }, { placement: "Atrium" }]);
    });

    it("draws the category cards from the flow's options, with the site's notes around them, and clears the branch on a change", () => {
        const patches: Partial<ListingForm>[] = [];
        render(<Harness screen={at("select-category")} initial={indoor()} onPatch={(p) => patches.push(p)} />);
        expect(page.getByRole("radio", { name: /Indoor/ })).toBeChecked();
        expect(page.getByText("Listing more than three spaces? Use a sheet")).toBeInTheDocument();
        fireEvent.click(page.getByRole("radio", { name: /Outdoor/ }));
        expect(patches).toEqual([{ category: "OUTDOOR", venueTypeId: null, mediaTypeId: null, materialId: null, slotsTotal: 1 }]);
    });

    it("draws the price, the hours, the paragraph, the content rules, the file and a switch", () => {
        const patches: Partial<ListingForm>[] = [];
        render(<Harness screen={at("pricing")} initial={{ ...indoor(), pricingUnit: "PER_WEEK", location: { latitude: 12.9, longitude: 77.6 } }} onPatch={(p) => patches.push(p)} />);
        expect(page.getByText("₹ / week")).toBeInTheDocument();
        expect(page.getByText("Slots")).toBeInTheDocument();
        expect(page.getByRole("option", { name: "Daytime · 6 AM – 6 PM" })).toBeInTheDocument();
        expect(page.getByText("Advertising space description")).toBeInTheDocument();
        expect(page.getByLabelText("Healthcare ads")).toBeInTheDocument();
        expect(page.getByRole("checkbox", { name: "Adult content" })).toBeInTheDocument();
        expect(page.getByText("Drop rate card here or browse")).toBeInTheDocument();
        expect(page.getByRole("switch", { name: "Weekends only" })).toBeInTheDocument();
        fireEvent.change(page.getByLabelText(/^Base price/), { target: { value: "₹12,600" } });
        fireEvent.change(page.getByLabelText("Visibility hours"), { target: { value: "day" } });
        fireEvent.change(page.getByLabelText("Healthcare ads"), { target: { value: "REQUIRES_APPROVAL" } });
        fireEvent.click(page.getByRole("checkbox", { name: "Adult content" }));
        fireEvent.click(page.getByRole("switch", { name: "Weekends only" }));
        expect(patches).toEqual([
            { basePrice: "12600" },
            { visibilityWindow: "day", customHours: null },
            { contentRules: { "c-health": "REQUIRES_APPROVAL" } },
            { contentRules: { "c-health": "REQUIRES_APPROVAL", "c-adult": "PROHIBITED" } },
            { extra: { weekend_only: true } },
        ]);
    });

    it("draws the review screen: the summary and the earlier screens' rows with Edit, then the papers, the photograph and the attestation", () => {
        const go = vi.fn();
        const patches: Partial<ListingForm>[] = [];
        render(<Harness screen={at("review")} initial={{ ...indoor(), title: "Gym mirror decal", address: "Phoenix Marketcity", city: "Bengaluru", documents: { ownerNoc: { url: "https://files.adx.in/noc.pdf", name: "noc.pdf" } } }} isLast go={go} onPatch={(p) => patches.push(p)} />);
        expect(page.getByText("Listing Summary")).toBeInTheDocument();
        expect(page.getByText("1 document")).toBeInTheDocument();
        expect(page.getByText(/Still needed before this can be sent/)).toHaveTextContent("Spot details: Location pin");
        const rows = page.getAllByRole("button", { name: "Edit" });
        expect(rows).toHaveLength(2);
        fireEvent.click(page.getByRole("button", { name: "Edit listing price" }));
        expect(go).toHaveBeenCalledWith("pricing");
        fireEvent.click(rows[0]!);
        expect(go).toHaveBeenCalledWith("spot-details");
        expect(page.getByText("OWNER NOC".toLowerCase(), { exact: false })).toBeInTheDocument();
        expect(page.getByText("noc.pdf")).toBeInTheDocument();
        expect(page.getByText("Municipal permit")).toBeInTheDocument();
        expect(page.getByText("Main photo")).toBeInTheDocument();
        fireEvent.click(page.getByRole("checkbox", { name: /Terms agreement/ }));
        expect(patches).toEqual([{ extra: { terms: true } }]);
    });

    it("says what a screen holds so far, for its review row", () => {
        // Nine questions: the three sections, the computed area and the undrawable hologram collect nothing.
        expect(screenLine(at("spot-details"), indoor())).toEqual({ line: "2 of 9 answered · Width (ft), Height (ft)", muted: false });
        expect(screenLine(at("pricing"), indoor())).toEqual({ line: "Not added yet", muted: true });
        expect(screenLine({ key: "x", title: "X", subtitle: "Only a heading.", step: 1, totalSteps: 1, ctaLabel: "Go", fields: [{ id: "s", type: "section", label: "S" }] }, indoor())).toEqual({ line: "Only a heading.", muted: true });
    });

    it("LF-2: draws the new photo angles and audience reports from the form's own keys, and clears them there", () => {
        const set = vi.fn();
        const form: ListingForm = { ...emptyForm(), category: "INDOOR", photos: { front: null, left: { url: "https://files.adx.in/u/7f3a.jpg", name: "IMG_0042.jpg" }, right: null, wide: null }, audienceDocs: { barc: { url: "https://files.adx.in/u/91cc.pdf", name: "BARC Q2.pdf" }, footfall: null } };
        const ctx = { form, set, catalogue, listingId: null, aiBucket: null };
        const { container: photo } = render(<FlowFieldView field={{ id: "left_photo", type: "image-upload", label: "Left angle" }} ctx={ctx} />);
        expect(within(photo).getByText("IMG_0042.jpg")).toBeInTheDocument();
        fireEvent.click(within(photo).getByRole("button", { name: "Remove" }));
        expect(set).toHaveBeenLastCalledWith({ photos: { ...form.photos, left: null } });
        const { container: report } = render(<FlowFieldView field={{ id: "barc_report", type: "file-upload", label: "BARC / TAM rating sheet" }} ctx={ctx} />);
        expect(within(report).getByText("BARC Q2.pdf")).toBeInTheDocument();
        fireEvent.click(within(report).getByRole("button", { name: /Remove/ }));
        expect(set).toHaveBeenLastCalledWith({ audienceDocs: { barc: null, footfall: null } });
        const { container: empty } = render(<FlowFieldView field={{ id: "footfall_report", type: "file-upload", label: "Footfall audit report" }} ctx={ctx} />);
        expect(within(empty).getByText("Drop footfall audit report here or browse")).toBeInTheDocument();
    });

    it("draws a single field on its own, with the site's control for its kind", () => {
        const set = vi.fn();
        const form = indoor();
        render(<FlowFieldView field={{ id: "available_from", type: "date", label: "Available from" }} ctx={{ form, set, catalogue, listingId: null, aiBucket: null }} />);
        const date = page.getByLabelText("Available from");
        expect(date).toHaveAttribute("type", "date");
        fireEvent.change(date, { target: { value: "2026-10-26" } });
        expect(set).toHaveBeenCalledWith({ availableFrom: "2026-10-26" });
        const { container } = render(<FlowFieldView field={{ id: "venue_type_id", type: "venue-type", label: "Venue", filterByCategory: true }} ctx={{ form, set, catalogue, listingId: null, aiBucket: null }} />);
        expect(within(container).getByRole("radio", { name: /Shopping Mall/ })).toBeChecked();
        expect(within(container).queryByRole("radio", { name: /Hoarding corridor/ })).not.toBeInTheDocument();
    });
});

/* The listing-data-gaps lot (3 Oct 2026): the site questions, as the flow asks them, shown only to the spots they fit. */
describe("the site questions on a flow screen", () => {
    const siteScreen: FlowScreen = {
        key: "site",
        title: "Site and visibility",
        step: 2,
        totalSteps: 3,
        ctaLabel: "Continue",
        fields: [
            { type: "number", id: "estimated_daily_footfall", label: "About how many people pass this spot in a day?", hint: "Your best estimate — we may refine it with measured data." },
            { type: "select", id: "traffic_grade", label: "How busy is it?", options: [{ id: "LOW", title: "Low" }, { id: "HIGH", title: "High" }] },
            { type: "select", id: "visibility", label: "From how far can it be seen?", options: [{ id: "UNDER_50M", title: "Under 50 m" }, { id: "OVER_300M", title: "Over 300 m" }] },
            { type: "select", id: "elevation", label: "How high is it?", options: [{ id: "GROUND", title: "Ground level" }] },
            { type: "section", id: "sec_pixels", label: "Screen resolution (pixels)" },
            { type: "number", id: "width_px", label: "Width (px)" },
            { type: "number", id: "height_px", label: "Height (px)" },
            { type: "select", id: "vehicle_type", label: "What kind of vehicle?", options: [{ id: "BUS", title: "Bus" }] },
            { type: "switch", id: "available_now", label: "Available to book now?" },
        ],
    };

    it("asks an indoor screen its footfall, traffic, distance and pixels — not the height or the vehicle — and opens the switch on yes", () => {
        const patches: Partial<ListingForm>[] = [];
        render(<Harness screen={siteScreen} initial={indoor()} onPatch={(p) => patches.push(p)} />);
        expect(page.getByLabelText("About how many people pass this spot in a day?")).toHaveAttribute("inputmode", "numeric");
        expect(page.getByText("Your best estimate — we may refine it with measured data.")).toBeInTheDocument();
        expect(page.getByLabelText("How busy is it?")).toBeInTheDocument();
        expect(page.getByLabelText("From how far can it be seen?")).toBeInTheDocument();
        expect(page.queryByLabelText("How high is it?")).not.toBeInTheDocument();
        expect(page.queryByLabelText("What kind of vehicle?")).not.toBeInTheDocument();
        expect(page.getByText("Screen resolution (pixels)")).toBeInTheDocument();
        expect(page.getAllByText("px")).toHaveLength(2);
        expect(page.getByRole("switch", { name: "Available to book now?" })).toBeChecked();
        fireEvent.change(page.getByLabelText("About how many people pass this spot in a day?"), { target: { value: "3,500" } });
        fireEvent.change(page.getByLabelText("How busy is it?"), { target: { value: "HIGH" } });
        fireEvent.click(page.getByRole("switch", { name: "Available to book now?" }));
        expect(patches).toEqual([{ estimatedDailyFootfall: "3500" }, { trafficGrade: "HIGH" }, { availableNow: false }]);
    });

    it("hides the pixels and their heading on a printed face, and keeps older words as a choice", () => {
        render(<Harness screen={siteScreen} initial={{ ...emptyForm(), category: "OUTDOOR", mediaTypeId: "m-hoarding", visibility: "Excellent" }} />);
        expect(page.getByLabelText("How high is it?")).toBeInTheDocument();
        expect(page.queryByText("Screen resolution (pixels)")).not.toBeInTheDocument();
        expect(page.queryByLabelText(/^Width/)).not.toBeInTheDocument();
        expect(page.getByLabelText("From how far can it be seen?")).toHaveValue("Excellent");
    });

    it("asks a transit spot only the vehicle and the switch", () => {
        render(<Harness screen={siteScreen} initial={{ ...emptyForm(), category: "TRANSIT" }} />);
        expect(page.getByLabelText("What kind of vehicle?")).toBeInTheDocument();
        expect(page.queryByLabelText("How busy is it?")).not.toBeInTheDocument();
        expect(page.queryByLabelText(/About how many people/)).not.toBeInTheDocument();
        expect(page.getByRole("switch", { name: "Available to book now?" })).toBeInTheDocument();
    });

    it("offers a phone's own hours as they are, rather than showing nothing", () => {
        render(<Harness field={{ id: "available_hours", type: "time-range", label: "Visibility hours" }} initial={{ ...indoor(), customHours: { from: "10 AM", to: "7 PM" } }} />);
        expect(page.getByLabelText("Visibility hours")).toHaveValue("custom");
        expect(page.getByRole("option", { name: "10 AM – 7 PM" })).toBeInTheDocument();
    });
});
