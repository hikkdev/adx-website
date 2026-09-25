/* The jest-dom matchers are wired in vitest.setup.ts; this import is for their types, which tsc reads from here. */
import "@testing-library/jest-dom/vitest";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import * as React from "react";
import { CodeBoxes, CODE_LENGTH, emptyCode } from "./verify-form";

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), push: vi.fn() }), useSearchParams: () => new URLSearchParams() }));

function Harness({ channel, prefill = "" }: { channel: "mobile" | "email"; prefill?: string }) {
    const [code, setCode] = React.useState(() => emptyCode(prefill, channel === "email" ? 8 : 6));
    return (
        <>
            <CodeBoxes code={code} onChange={setCode} onSubmit={() => undefined} channel={channel} />
            <output data-testid="value">{code.join("")}</output>
        </>
    );
}

describe("EC-8: the code boxes per channel", () => {
    it("draws six numeric boxes for a phone and eight letter boxes for an email", () => {
        expect(CODE_LENGTH).toBe(6);
        expect(emptyCode("", 8)).toHaveLength(8);
        expect(emptyCode("ABC", 8)).toEqual(["A", "B", "C", "", "", "", "", ""]);

        const { unmount } = render(<Harness channel="mobile" />);
        const digits = screen.getAllByRole("textbox");
        expect(digits).toHaveLength(6);
        expect(digits[0]).toHaveAttribute("inputmode", "numeric");
        unmount();

        render(<Harness channel="email" />);
        const letters = screen.getAllByRole("textbox");
        expect(letters).toHaveLength(8);
        expect(letters[0]).toHaveAttribute("inputmode", "text");
        expect(letters[0]).toHaveAttribute("autocapitalize", "characters");
        expect(letters[0]).toHaveAccessibleName("Letter 1");
    });

    it("fills every box from a pasted eight-letter code, upper-cased, and ignores what the alphabet lacks", () => {
        render(<Harness channel="email" />);
        const boxes = screen.getAllByRole("textbox");
        fireEvent.change(boxes[0]!, { target: { value: "abcd efgh" } });
        expect(screen.getByTestId("value")).toHaveTextContent("ABCDEFGH");
        /* I and O are not in the alphabet; digits neither. */
        fireEvent.change(boxes[0]!, { target: { value: "io12qrst" } });
        expect(screen.getByTestId("value")).toHaveTextContent("QRSTEFGH");
    });

    it("keeps a phone code to its digits", () => {
        render(<Harness channel="mobile" />);
        const boxes = screen.getAllByRole("textbox");
        fireEvent.change(boxes[0]!, { target: { value: "12a3456" } });
        expect(screen.getByTestId("value")).toHaveTextContent("123456");
        fireEvent.change(boxes[2]!, { target: { value: "" } });
        expect(screen.getByTestId("value")).toHaveTextContent("12456");
    });
});
