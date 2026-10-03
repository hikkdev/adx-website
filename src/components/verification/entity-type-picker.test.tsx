import * as React from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { EntityTypePicker } from "./entity-type-picker";
import type { EntityTypeOption } from "@/services/verification";

/**
 * Phase D (1 Oct 2026) — "Who is this account for?": one choice from the
 * rows the server listed, the helper as one line under the list, and the
 * button that starts the check with the answer. The words are the apps'.
 */

const OPTIONS: EntityTypeOption[] = [
    { value: "INDIVIDUAL", label: "Individual" },
    { value: "SOLE_PROPRIETOR", label: "Sole proprietor" },
    { value: "COMPANY", label: "Company" },
    { value: "LLP_PARTNERSHIP", label: "LLP or partnership" },
];

describe("EntityTypePicker", () => {
    it("draws the heading, every option as one choice, the helper under the list and the button", () => {
        render(<EntityTypePicker options={OPTIONS} onContinue={vi.fn()} />);
        const group = screen.getByRole("group", { name: "Who is this account for?" });
        expect(within(group).getAllByRole("radio").map((radio) => (radio as HTMLInputElement).value)).toEqual(["INDIVIDUAL", "SOLE_PROPRIETOR", "COMPANY", "LLP_PARTNERSHIP"]);
        for (const option of OPTIONS) expect(screen.getByLabelText(option.label)).not.toBeChecked();

        const helper = screen.getByText("This decides which documents the check asks for. Pick the one your PAN is registered as.");
        // One line under the whole list, not a hint inside any one card.
        expect(group).not.toContainElement(helper);
        expect(group.compareDocumentPosition(helper) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        expect(screen.getByRole("button", { name: "Continue to verification" })).toBeInTheDocument();
    });

    it("waits for a choice, takes only one, and hands it over", () => {
        const onContinue = vi.fn();
        render(<EntityTypePicker options={OPTIONS} onContinue={onContinue} />);
        const button = screen.getByRole("button", { name: "Continue to verification" });
        expect(button).toBeDisabled();

        fireEvent.click(screen.getByLabelText("Sole proprietor"));
        fireEvent.click(screen.getByLabelText("Company"));
        expect(screen.getByLabelText("Company")).toBeChecked();
        expect(screen.getByLabelText("Sole proprietor")).not.toBeChecked();
        expect(button).toBeEnabled();

        fireEvent.click(button);
        expect(onContinue).toHaveBeenCalledTimes(1);
        expect(onContinue).toHaveBeenCalledWith("COMPANY");
    });

    it("prints the upgrade's warning above the button, and the page's way out beside it", () => {
        render(
            <EntityTypePicker options={OPTIONS.slice(1)} onContinue={vi.fn()} warning="Your account goes back to 'verification pending' until the business is verified.">
                <button type="button">Back</button>
            </EntityTypePicker>
        );
        expect(screen.queryByLabelText("Individual")).not.toBeInTheDocument();
        const warning = screen.getByText("Your account goes back to 'verification pending' until the business is verified.");
        const button = screen.getByRole("button", { name: "Continue to verification" });
        expect(warning.compareDocumentPosition(button) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        expect(screen.getByRole("button", { name: "Back" })).toBeInTheDocument();
    });

    it("opens on the form already on the account when one is being corrected", () => {
        const onContinue = vi.fn();
        render(<EntityTypePicker options={OPTIONS} onContinue={onContinue} initial="SOLE_PROPRIETOR" />);
        expect(screen.getByLabelText("Sole proprietor")).toBeChecked();
        expect(screen.getAllByRole("radio").filter((radio) => (radio as HTMLInputElement).checked)).toHaveLength(1);
        // Keeping it is a choice too: the button is ready at once.
        fireEvent.click(screen.getByRole("button", { name: "Continue to verification" }));
        expect(onContinue).toHaveBeenCalledWith("SOLE_PROPRIETOR");
    });

    it("forgets a choice that is no longer one of the rows", () => {
        const { rerender } = render(<EntityTypePicker options={OPTIONS} onContinue={vi.fn()} />);
        fireEvent.click(screen.getByLabelText("Individual"));
        expect(screen.getByRole("button", { name: "Continue to verification" })).toBeEnabled();
        rerender(<EntityTypePicker options={OPTIONS.slice(1)} onContinue={vi.fn()} />);
        expect(screen.getByRole("button", { name: "Continue to verification" })).toBeDisabled();
    });
});
