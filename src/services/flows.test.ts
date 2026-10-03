import { describe, expect, it, vi } from "vitest";

const get = vi.fn(async (_path: string, _options?: unknown): Promise<unknown> => ({}));
vi.mock("@/lib/api-client", () => ({ api: { get: (path: string, options?: unknown) => get(path, options) } }));

import { branchingField, fieldsOf, flowsService, parseFlowField, parseWizardFlow, screensFor } from "./flows";

const listing = {
    label: "Listing",
    version: 3,
    screens: [
        {
            key: "select-category",
            title: "Ad space category",
            step: 1,
            totalSteps: 7,
            ctaLabel: "Continue",
            fields: [{ id: "category", type: "selectable-cards", label: "Category", required: true, branching: true, options: [{ id: "indoor", title: "Indoor" }, { id: "outdoor", title: "Outdoor", description: "Hoardings" }] }],
        },
    ],
    branches: {
        indoor: { id: "indoor", title: "Indoor", description: "Malls", screens: [{ key: "venue", title: "Venue selection", step: 2, totalSteps: 7, ctaLabel: "Continue", fields: [{ id: "venue_type_id", type: "venue-type", label: "Venue", required: true, filterByCategory: true }] }] },
        outdoor: { id: "outdoor", title: "Outdoor", description: "Roads", screens: [{ key: "venue", title: "Venue selection", step: 2, totalSteps: 7, ctaLabel: "Continue", fields: [{ id: "venue_type_id", type: "venue-type", label: "Venue", required: false }] }] },
    },
};

describe("FL-1: the read", () => {
    it("is public and answers the listing flow as a wizard", async () => {
        get.mockResolvedValueOnce({ enums: {}, flows: { listing } });
        const flow = await flowsService.listing();
        expect(get).toHaveBeenCalledWith("/config", { anonymous: true });
        expect(flow?.version).toBe(3);
        expect(flow?.screens.map((s) => s.key)).toEqual(["select-category"]);
        expect(Object.keys(flow?.branches ?? {})).toEqual(["indoor", "outdoor"]);
    });

    it("answers null when the row holds no listing flow, and lets a failed read throw", async () => {
        get.mockResolvedValueOnce({ enums: {}, flows: {} });
        expect(await flowsService.listing()).toBeNull();
        get.mockRejectedValueOnce(new Error("down"));
        await expect(flowsService.listing()).rejects.toThrow("down");
    });
});

describe("parseWizardFlow", () => {
    it("reads a wizard loosely and drops what cannot be drawn", () => {
        const flow = parseWizardFlow({
            screens: [
                { key: "a", title: "A", fields: [{ id: "x", type: "text", label: "X" }, { id: "no-type", label: "?" }, "junk"] },
                { title: "no key" },
            ],
            branches: { one: { screens: [{ key: "b", title: "B" }] }, broken: "nope" },
        });
        expect(flow).not.toBeNull();
        expect(flow!.label).toBe("Listing");
        expect(flow!.version).toBeNull();
        expect(flow!.screens).toHaveLength(1);
        expect(flow!.screens[0]!.fields.map((f) => f.id)).toEqual(["x"]);
        expect(flow!.screens[0]!.ctaLabel).toBe("Continue");
        expect(flow!.branches.one?.screens[0]).toMatchObject({ key: "b", fields: [] });
        expect(flow!.branches.broken).toBeUndefined();
    });

    it("is null for anything that is not a wizard", () => {
        expect(parseWizardFlow(undefined)).toBeNull();
        expect(parseWizardFlow({ steps: {}, ladders: {} })).toBeNull();
        expect(parseWizardFlow({ screens: [] })).toBeNull();
        expect(parseWizardFlow({ screens: "x" })).toBeNull();
    });

    it("keeps a field's props and ignores the rest", () => {
        const field = parseFlowField({ id: "area", type: "computed", label: "Area", from: ["w", "h", 3], op: "multiply", readOnly: true, options: [], stray: 1 });
        expect(field).toEqual({ id: "area", type: "computed", label: "Area", from: ["w", "h"], op: "multiply", readOnly: true });
        expect(parseFlowField({ id: "x", type: "text" })).toBeNull();
    });
});

describe("walking a flow", () => {
    const flow = parseWizardFlow(listing)!;
    it("puts the branch's screens after the root's, and the root alone before a branch is chosen", () => {
        expect(screensFor(flow, null).map((s) => s.key)).toEqual(["select-category"]);
        expect(screensFor(flow, "indoor").map((s) => s.key)).toEqual(["select-category", "venue"]);
        expect(screensFor(flow, "media").map((s) => s.key)).toEqual(["select-category"]);
    });
    it("lists every field once and names the branching one", () => {
        expect(fieldsOf(flow).map((f) => f.id)).toEqual(["category", "venue_type_id"]);
        expect(branchingField(flow)?.id).toBe("category");
        expect(branchingField({ ...flow, screens: [{ ...flow.screens[0]!, fields: [] }] })).toBeNull();
    });
});
