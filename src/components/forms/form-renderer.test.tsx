import "@testing-library/jest-dom/vitest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ApiError } from "@/lib/api-client";
import { formsService, type FormView } from "@/services/forms";
import { FormRenderer } from "./form-renderer";

const auth = { status: "signed-out" as "signed-out" | "signed-in" | "restoring" };
vi.mock("@/lib/auth", () => ({ useAuth: () => ({ status: auth.status, party: null, parties: [] }) }));
vi.mock("./location-field", () => ({ LocationField: ({ id }: { id: string }) => <div data-testid="location-field" data-field={id} /> }));
vi.mock("@/services/forms", async (importOriginal) => {
    const original = await importOriginal<typeof import("@/services/forms")>();
    return { ...original, formsService: { ...original.formsService, submit: vi.fn(), upload: vi.fn() } };
});

const submit = vi.mocked(formsService.submit);

const form: FormView = {
    key: "lead",
    title: "Tell us about your campaign",
    description: "Two quick steps.",
    audience: "PUBLIC",
    version: 2,
    definition: {
        screens: [
            {
                key: "who",
                title: "About you",
                fields: [
                    { id: "name", kind: "text", label: "Your name", required: true },
                    { id: "side", kind: "select", label: "You are", required: true, options: [{ value: "ADV", label: "An advertiser" }, { value: "PUB", label: "A publisher" }] },
                    { id: "spaces", kind: "number", label: "How many spaces", min: 1, dependsOn: { fieldId: "side", equals: "PUB" } },
                ],
            },
            {
                key: "where",
                title: "Where",
                fields: [
                    { id: "city", kind: "city", label: "City", required: true },
                    { id: "pin", kind: "location", label: "Where exactly" },
                ],
            },
        ],
        submitLabel: "Send it",
        successMessage: "Thanks — we will call you.",
        consentText: "ADX may contact me about this.",
    },
};

const type = (label: RegExp, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });

describe("FM-1: the form renderer", () => {
    beforeEach(() => {
        auth.status = "signed-out";
        submit.mockReset();
    });

    it("walks the screens as steps, checking each before the next, showing a dependent field only when asked for", async () => {
        render(<FormRenderer form={form} source="test" />);
        expect(screen.getByTestId("form-step")).toHaveTextContent("Step 1 of 2");
        expect(screen.queryByLabelText(/How many spaces/)).toBeNull();

        fireEvent.click(screen.getByRole("button", { name: "Continue" }));
        expect(screen.getByText("Your name is needed")).toBeInTheDocument();
        expect(screen.getByText("You are is needed")).toBeInTheDocument();
        expect(screen.getByTestId("form-step")).toHaveTextContent("Step 1 of 2");

        type(/Your name/, "Ann");
        type(/You are/, "PUB");
        expect(screen.getByLabelText(/How many spaces/)).toBeInTheDocument();
        type(/How many spaces/, "0");
        fireEvent.click(screen.getByRole("button", { name: "Continue" }));
        expect(screen.getByText("How many spaces is at least 1")).toBeInTheDocument();
        type(/How many spaces/, "3");
        fireEvent.click(screen.getByRole("button", { name: "Continue" }));

        expect(screen.getByTestId("form-step")).toHaveTextContent("Step 2 of 2");
        expect(screen.getByTestId("location-field")).toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: "Back" }));
        expect(screen.getByTestId("form-step")).toHaveTextContent("Step 1 of 2");
        expect(screen.getByLabelText(/Your name/)).toHaveValue("Ann");
    });

    it("asks for consent, sends the shown answers, and shows the success message in place", async () => {
        submit.mockResolvedValue({ id: "sub1", message: "Thanks — we will call you." });
        render(<FormRenderer form={form} source="web:diwali" />);
        type(/Your name/, "Ann");
        type(/You are/, "ADV");
        fireEvent.click(screen.getByRole("button", { name: "Continue" }));
        fireEvent.change(screen.getByLabelText("City"), { target: { value: "Pune" } });

        fireEvent.click(screen.getByRole("button", { name: "Send it" }));
        expect(screen.getByText("Tick the box to send your answer.")).toBeInTheDocument();
        expect(submit).not.toHaveBeenCalled();

        fireEvent.click(screen.getByLabelText("ADX may contact me about this."));
        fireEvent.click(screen.getByRole("button", { name: "Send it" }));
        await waitFor(() => expect(screen.getByTestId("form-done")).toHaveTextContent("Thanks — we will call you."));
        expect(submit).toHaveBeenCalledWith("lead", { answers: { name: "Ann", side: "ADV", city: "Pune" }, consent: true, source: "web:diwali" }, "PUBLIC");
        expect(screen.queryByTestId("form-renderer")).toBeNull();
    });

    it("names the API's field errors beside their fields and goes back to their step", async () => {
        submit.mockRejectedValue(new ApiError(400, "VALIDATION", "Check the answers", { fieldErrors: { "answers.name": ["That name is too short"] } }));
        render(<FormRenderer form={form} />);
        type(/Your name/, "A");
        type(/You are/, "ADV");
        fireEvent.click(screen.getByRole("button", { name: "Continue" }));
        fireEvent.change(screen.getByLabelText("City"), { target: { value: "Pune" } });
        fireEvent.click(screen.getByLabelText("ADX may contact me about this."));
        fireEvent.click(screen.getByRole("button", { name: "Send it" }));
        await waitFor(() => expect(screen.getByText("That name is too short")).toBeInTheDocument());
        expect(screen.getByTestId("form-step")).toHaveTextContent("Step 1 of 2");
        expect(screen.getByText("Have a look at the fields marked in red.")).toBeInTheDocument();
    });

    it("a one-screen form has no stepper; a SIGNED_IN form asks for a sign-in first", () => {
        const single: FormView = { ...form, definition: { ...form.definition, screens: [form.definition.screens[0]!] } };
        render(<FormRenderer form={single} />);
        expect(screen.queryByTestId("form-step")).toBeNull();
        expect(screen.getByRole("heading", { level: 3, name: "About you" })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Send it" })).toBeInTheDocument();

        render(<FormRenderer form={{ ...single, key: "members", audience: "SIGNED_IN" }} />);
        expect(screen.getByTestId("form-sign-in")).toBeInTheDocument();
        expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", expect.stringContaining("/sign-in"));
    });
});
