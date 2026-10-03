"use client";

import * as React from "react";
import { buttonRowOf } from "@/services/layouts";
import { CtaButton } from "./target-link";

/** PB-4 · `button_row`: one to four buttons in a row — red for the main thing, outlined for the rest. */
export function ButtonRowBlock({ props }: { props: Record<string, unknown> }) {
    const row = buttonRowOf(props);
    if (!row) return null;
    return (
        <div data-testid="button-row" className="flex flex-wrap gap-3">
            {row.buttons.map((button, index) => (
                <CtaButton key={index} label={button.label} target={button.target} style={button.style} />
            ))}
        </div>
    );
}
