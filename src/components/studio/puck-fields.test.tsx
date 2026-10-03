import { describe, expect, it } from "vitest";
import type { FieldSpec } from "@/services/studio";
import { fieldFor, fieldsFor, itemSummary } from "./puck-fields";

/**
 * ST-1: the registry's FieldSpec vocabulary as Puck fields — the mapping is
 * pure, so a new input on the backend can be checked here before a
 * block is ever opened.
 */
const spec = (over: Partial<FieldSpec> & Pick<FieldSpec, "input">): FieldSpec => ({ key: over.key ?? "f", label: over.label ?? "Field", ...over });

describe("ST-1: FieldSpec → Puck fields", () => {
    it("maps the native inputs one to one, marking required ones", () => {
        expect(fieldFor(spec({ input: "text", label: "Headline", required: true, max: 120 }))).toMatchObject({ type: "text", label: "Headline *" });
        expect(fieldFor(spec({ input: "textarea", hint: "Two lines" }))).toMatchObject({ type: "textarea", placeholder: "Two lines" });
        expect(fieldFor(spec({ input: "contentSlug" }))).toMatchObject({ type: "text" });
        expect(fieldFor(spec({ input: "number", min: 1, max: 12 }))).toMatchObject({ type: "number", min: 1, max: 12 });
    });

    it("draws markdown as a textarea that says so", () => {
        const field = fieldFor(spec({ input: "markdown", label: "Text" }));
        expect(field).toMatchObject({ type: "textarea", label: "Text (Markdown)" });
        expect((field as { placeholder?: string }).placeholder).toMatch(/Markdown/);
    });

    it("gives an optional select an empty choice and a required one none", () => {
        const options = [
            { value: "WIDE", label: "Wide" },
            { value: "SQUARE", label: "Square" },
        ];
        expect(fieldFor(spec({ input: "select", options }))).toMatchObject({ type: "select", options: [{ label: "—", value: "" }, ...options] });
        expect(fieldFor(spec({ input: "select", options, required: true }))).toMatchObject({ type: "select", options });
    });

    it("hands the console-only inputs to custom fields with a render", () => {
        for (const input of ["multiselect", "media", "target", "listingIds", "slotKey", "formKey", "something-new"]) {
            const field = fieldFor(spec({ input }));
            expect(field.type, input).toBe("custom");
            expect(typeof (field as { render?: unknown }).render, input).toBe("function");
        }
    });

    it("expresses a cta as a label and a target", () => {
        const field = fieldFor(spec({ input: "cta", label: "Button" }));
        expect(field.type).toBe("object");
        const objectFields = (field as { objectFields: Record<string, { type: string }> }).objectFields;
        expect(objectFields.label?.type).toBe("text");
        expect(objectFields.target?.type).toBe("custom");
    });

    it("expresses a list as an array of the item's fields, with its bounds and a starting item", () => {
        const field = fieldFor(
            spec({
                input: "list",
                label: "Tiles",
                min: 1,
                max: 12,
                of: [
                    { key: "mediaId", label: "Picture", input: "media", required: true, spec: "TILE" },
                    { key: "label", label: "Label", input: "text", required: true, max: 40 },
                    { key: "target", label: "Opens", input: "target", required: true },
                ],
            })
        );
        expect(field.type).toBe("array");
        const array = field as { arrayFields: Record<string, { type: string }>; min?: number; max?: number; defaultItemProps?: unknown; getItemSummary?: (item: Record<string, unknown>, index?: number) => string };
        expect(Object.keys(array.arrayFields)).toEqual(["mediaId", "label", "target"]);
        expect(array.arrayFields.mediaId?.type).toBe("custom");
        expect(array.arrayFields.label?.type).toBe("text");
        expect(array.min).toBe(1);
        expect(array.max).toBe(12);
        expect(array.defaultItemProps).toEqual({ target: { kind: "EXPLORE" } });
        expect(array.getItemSummary?.({ mediaId: "m1", label: "Malls" }, 0)).toBe("Malls");
        expect(array.getItemSummary?.({}, 2)).toBe("Item 3");
    });

    it("keys every field by its prop", () => {
        const fields = fieldsFor([spec({ key: "title", input: "text" }), spec({ key: "count", input: "number" })]);
        expect(Object.keys(fields)).toEqual(["title", "count"]);
        expect(itemSummary([spec({ key: "question", input: "text" })])({ question: "Why?" })).toBe("Why?");
    });
});
