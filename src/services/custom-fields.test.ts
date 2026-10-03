import { describe, expect, it } from "vitest";
import { formatCustomValue, normaliseCustomValue, parseDefs, parseValues, validateCustomValue, type CustomFieldDef } from "./custom-fields";

const def = (over: Partial<CustomFieldDef>): CustomFieldDef => ({
    id: "d1",
    entity: "PUBLISHER",
    key: "gst_tier",
    label: "GST tier",
    kind: "text",
    options: [],
    hint: null,
    required: false,
    showInApps: true,
    showOnWebsite: true,
    editableByOwner: true,
    sortOrder: 0,
    ...over,
});

describe("CF-1: custom field definitions and values", () => {
    it("reads the definitions strictly, in order, options as objects or strings", () => {
        const defs = parseDefs({
            items: [
                { id: "b", entity: "LISTING", key: "second", label: "Second", kind: "select", options: ["A", { value: "b", label: "B" }], sortOrder: 2, showOnWebsite: true, editableByOwner: false },
                { id: "a", entity: "LISTING", key: "first", label: "First", kind: "text", sortOrder: 1, showOnWebsite: true, required: true },
                { id: "c", entity: "LISTING", key: "nope", label: "Nope", kind: "hologram" },
                { id: "d", key: "", label: "Blank" },
            ],
        });
        expect(defs.map((d) => d.key)).toEqual(["first", "second"]);
        expect(defs[1]?.options).toEqual([{ value: "A", label: "A" }, { value: "b", label: "B" }]);
        expect(defs[0]).toMatchObject({ required: true, editableByOwner: false, showInApps: false });
    });

    it("reads the values whatever shape the API answered", () => {
        expect(parseValues({ values: { a: 1 } })).toEqual({ a: 1 });
        expect(parseValues({ items: [{ key: "a", value: 1 }, { defKey: "b", value: "x" }, "junk"] })).toEqual({ a: 1, b: "x" });
        expect(parseValues({ a: true })).toEqual({ a: true });
        expect(parseValues(null)).toEqual({});
    });

    it("validates by kind and requirement", () => {
        expect(validateCustomValue(def({ required: true }), "")).toBe("GST tier is needed");
        expect(validateCustomValue(def({ kind: "number" }), "abc")).toBe("GST tier is a number");
        expect(validateCustomValue(def({ kind: "email" }), "x")).toMatch(/email/);
        expect(validateCustomValue(def({ kind: "url" }), "adx.in")).toMatch(/http/);
        expect(validateCustomValue(def({ kind: "url" }), "https://adx.in")).toBeNull();
        expect(validateCustomValue(def({ kind: "select", options: [{ value: "a", label: "A" }] }), "z")).toMatch(/Choose one/);
        expect(validateCustomValue(def({ kind: "location" }), { latitude: 12.9, longitude: 77.6 })).toBeNull();
        expect(validateCustomValue(def({ kind: "location" }), { latitude: 120, longitude: 77.6 })).toBe("Drop the pin on the map");
        expect(validateCustomValue(def({ kind: "checkbox", required: true }), false)).toBeNull();
    });

    it("prints a value as a line and sends it normalised", () => {
        expect(formatCustomValue(def({ kind: "select", options: [{ value: "a", label: "Tier A" }] }), "a")).toBe("Tier A");
        expect(formatCustomValue(def({ kind: "multiselect", options: [{ value: "a", label: "A" }, { value: "b", label: "B" }] }), ["a", "b"])).toBe("A, B");
        expect(formatCustomValue(def({ kind: "checkbox" }), true)).toBe("Yes");
        expect(formatCustomValue(def({ kind: "location" }), { latitude: 12.9, longitude: 77.6, address: "MG Road" })).toBe("MG Road");
        expect(formatCustomValue(def({}), "")).toBe("—");
        expect(normaliseCustomValue(def({ kind: "number" }), " 42 ")).toBe(42);
        expect(normaliseCustomValue(def({}), " hi ")).toBe("hi");
        expect(normaliseCustomValue(def({}), "")).toBeNull();
    });
});
