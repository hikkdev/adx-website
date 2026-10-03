"use client";

import * as React from "react";
import { dividerOf } from "@/services/layouts";

/** PB-4 · `divider`: a rule across the page, or just some air. */
export function DividerBlock({ props }: { props: Record<string, unknown> }) {
    const divider = dividerOf(props);
    if (divider.style === "SPACE") return <div data-testid="divider-space" className="h-10" aria-hidden />;
    return <hr data-testid="divider-line" className="border-0 border-t border-line" />;
}
