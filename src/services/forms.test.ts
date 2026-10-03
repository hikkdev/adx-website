import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/api-client";
import { answersToSend, fieldErrorsOf, isFieldShown, parseFormView, screenOfField, validateAll, validateField, validateScreen, type FormDefinition, type FormField } from "./forms";

const field = (over: Partial<FormField> & Pick<FormField, "id" | "kind">): FormField => ({ label: over.id, ...over });

const definition: FormDefinition = {
    screens: [
        {
            key: "who",
            title: "About you",
            fields: [
                field({ id: "name", kind: "text", label: "Your name", required: true, maxLength: 5 }),
                field({ id: "email", kind: "email", label: "Email", required: true }),
                field({ id: "side", kind: "select", label: "You are", options: [{ value: "ADV", label: "An advertiser" }, { value: "PUB", label: "A publisher" }], required: true }),
                field({ id: "spaces", kind: "number", label: "How many spaces", min: 1, max: 50, dependsOn: { fieldId: "side", equals: "PUB" } }),
            ],
        },
        {
            key: "where",
            title: "Where",
            fields: [field({ id: "city", kind: "city", label: "City", required: true }), field({ id: "cat", kind: "category", label: "Category" }), field({ id: "pin", kind: "location", label: "Where exactly" }), field({ id: "ok", kind: "checkbox", label: "I run ads", required: true })],
        },
    ],
    successMessage: "Thanks!",
    consentText: "ADX may contact me.",
};

describe("FM-1: reading a form", () => {
    it("reads a published form strictly, envelope or not, and drops what is not a field", () => {
        const view = parseFormView({
            success: true,
            data: {
                key: "contact",
                title: "Contact us",
                audience: "PUBLIC",
                version: 3,
                definition: {
                    screens: [{ key: "s1", fields: [{ id: "name", kind: "text", label: "Name", required: true }, { id: "x", kind: "hologram", label: "No" }, { id: "opt", kind: "select", label: "Pick", options: [{ value: "a", label: "A" }, { value: "", label: "bad" }] }, "junk"] }],
                    successMessage: "Done",
                    consentText: "OK?",
                },
            },
        });
        expect(view).toMatchObject({ key: "contact", title: "Contact us", audience: "PUBLIC", version: 3 });
        expect(view?.definition.screens[0]?.fields.map((f) => f.id)).toEqual(["name", "opt"]);
        expect(view?.definition.screens[0]?.fields[1]?.options).toEqual([{ value: "a", label: "A" }]);
        expect(parseFormView({ key: "x", definition: { screens: [] } })).toBeNull();
        expect(parseFormView(null)).toBeNull();
    });
});

describe("FM-1: validation", () => {
    it("requires, bounds and checks each kind", () => {
        expect(validateField(field({ id: "n", kind: "text", label: "Name", required: true }), "")).toBe("Name is needed");
        expect(validateField(field({ id: "n", kind: "text", label: "Name", maxLength: 3 }), "abcd")).toMatch(/at most 3/);
        expect(validateField(field({ id: "e", kind: "email", label: "Email" }), "nope")).toMatch(/email/);
        expect(validateField(field({ id: "e", kind: "email", label: "Email" }), "a@b.co")).toBeNull();
        expect(validateField(field({ id: "p", kind: "phone", label: "Phone" }), "12")).toMatch(/phone/);
        expect(validateField(field({ id: "p", kind: "phone", label: "Phone" }), "+91 98765 43210")).toBeNull();
        expect(validateField(field({ id: "k", kind: "number", label: "Count", min: 1, max: 5 }), "9")).toBe("Count is at most 5");
        expect(validateField(field({ id: "k", kind: "number", label: "Count" }), "x")).toBe("Count is a number");
        expect(validateField(field({ id: "s", kind: "select", label: "Side", options: [{ value: "a", label: "A" }] }), "b")).toMatch(/Choose one/);
        expect(validateField(field({ id: "m", kind: "multiselect", label: "Many", options: [{ value: "a", label: "A" }], max: 1 }), ["a", "z"])).toMatch(/Choose from/);
        expect(validateField(field({ id: "d", kind: "date", label: "When" }), "2026-13-40")).toBe("When is a date");
        expect(validateField(field({ id: "d", kind: "date", label: "When" }), "2026-10-01")).toBeNull();
        expect(validateField(field({ id: "c", kind: "category", label: "Category" }), "SKY")).toBe("Choose a category");
        expect(validateField(field({ id: "l", kind: "location", label: "Pin", required: true }), { latitude: 12.9, longitude: 77.6 })).toBeNull();
        expect(validateField(field({ id: "l", kind: "location", label: "Pin", required: true }), { address: "x" })).toBe("Pin is needed");
        expect(validateField(field({ id: "ok", kind: "checkbox", label: "Agree", required: true }), false)).toMatch(/Tick/);
        expect(validateField(field({ id: "f", kind: "file", label: "Paper", required: true }), { url: "https://x/y.pdf", fileId: "1", name: "y.pdf" })).toBeNull();
    });

    it("shows a dependent field only when its answer is given, and never validates a hidden one", () => {
        const spaces = definition.screens[0]!.fields[3]!;
        expect(isFieldShown(spaces, { side: "ADV" })).toBe(false);
        expect(isFieldShown(spaces, { side: "PUB" })).toBe(true);
        expect(isFieldShown(field({ id: "x", kind: "text", dependsOn: { fieldId: "ok", equals: "true" } }), { ok: true })).toBe(true);
        expect(validateScreen(definition, 0, { name: "Ann", email: "a@b.co", side: "ADV", spaces: "999" })).toEqual({});
        expect(validateScreen(definition, 0, { name: "Ann", email: "a@b.co", side: "PUB", spaces: "999" })).toEqual({ spaces: "How many spaces is at most 50" });
    });

    it("checks one screen at a time, and all of them at once", () => {
        expect(validateScreen(definition, 0, {})).toEqual({ name: "Your name is needed", email: "Email is needed", side: "You are is needed" });
        expect(Object.keys(validateAll(definition, {}))).toEqual(["name", "email", "side", "city", "ok"]);
        expect(screenOfField(definition, "city")).toBe(1);
        expect(screenOfField(definition, "name")).toBe(0);
        expect(screenOfField(definition, "nope")).toBe(0);
    });

    it("sends the shown answers only, numbers as numbers", () => {
        expect(answersToSend(definition, { name: "Ann", email: "a@b.co", side: "ADV", spaces: "3", city: "Pune", ok: true, cat: "" })).toEqual({ name: "Ann", email: "a@b.co", side: "ADV", city: "Pune", ok: true });
        expect(answersToSend(definition, { side: "PUB", spaces: "3" })).toEqual({ side: "PUB", spaces: 3 });
    });

    it("reads the API's field errors by field id, from a flatten or from issues", () => {
        expect(fieldErrorsOf(new ApiError(400, "VALIDATION", "Bad", { fieldErrors: { "answers.email": ["Not an email"], name: ["Too long"] } }))).toEqual({ email: "Not an email", name: "Too long" });
        expect(fieldErrorsOf(new ApiError(400, "VALIDATION", "Bad", { issues: [{ fieldId: "city", message: "Unknown city" }, { path: "answers.pin", message: "Off the map" }] }))).toEqual({ city: "Unknown city", pin: "Off the map" });
        expect(fieldErrorsOf(new Error("x"))).toEqual({});
    });
});
