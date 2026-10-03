import "@testing-library/jest-dom/vitest";
import * as React from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import type { BoostPlacement, BoostPlacementInfo } from "@/services/promotions";
import { PlacementPicker } from "./placement-picker";

const PLACEMENTS: BoostPlacementInfo[] = [
    { placement: "SEARCH_TOP", label: "Top of search", ratePerDay: "500.00", minDays: 3, maxConcurrent: 3 },
    { placement: "SIMILAR_TOP", label: "Top of similar", ratePerDay: "300.00", minDays: 1, maxConcurrent: 2 },
];

function Harness({ onChange }: { onChange: (next: BoostPlacement[]) => void }) {
    const [value, setValue] = React.useState<BoostPlacement[]>(["SEARCH_TOP"]);
    return (
        <PlacementPicker
            placements={PLACEMENTS}
            value={value}
            onChange={(next) => {
                setValue(next);
                onChange(next);
            }}
        />
    );
}

describe("the placement picker", () => {
    it("draws each placement's meaning, price and minimum, and toggles them", () => {
        const onChange = vi.fn();
        render(<Harness onChange={onChange} />);
        const search = screen.getByTestId("placement-SEARCH_TOP");
        expect(within(search).getByText("Top of search")).toBeInTheDocument();
        expect(within(search).getByText(/leads the Explore results/)).toBeInTheDocument();
        expect(within(search).getByText("₹500 / day + GST")).toBeInTheDocument();
        expect(within(search).getByText("At least 3 days")).toBeInTheDocument();
        expect(within(screen.getByTestId("placement-SIMILAR_TOP")).getByText("At least 1 day")).toBeInTheDocument();

        const boxes = screen.getAllByRole("checkbox");
        expect(boxes[0]).toBeChecked();
        expect(boxes[1]).not.toBeChecked();
        fireEvent.click(boxes[1]);
        expect(onChange).toHaveBeenLastCalledWith(["SEARCH_TOP", "SIMILAR_TOP"]);
        fireEvent.click(boxes[0]);
        expect(onChange).toHaveBeenLastCalledWith(["SIMILAR_TOP"]);
    });
});
