"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { stepsOf } from "@/services/layouts";

/** PB-4 · `steps`: two to eight numbered steps in a row, as the advertise page counts its own — "01", a title, a line. */
export function StepsBlock({ props }: { props: Record<string, unknown> }) {
    const steps = stepsOf(props);
    if (!steps) return null;
    return (
        <section data-testid="steps">
            {steps.title && <h2 className="text-[32px] font-semibold leading-10 text-ink">{steps.title}</h2>}
            <ol className={cn("grid gap-6 sm:grid-cols-2", steps.items.length >= 4 ? "lg:grid-cols-4" : "lg:grid-cols-3", steps.title && "mt-8")}>
                {steps.items.map((step, index) => (
                    <li key={index}>
                        <p className="text-xs font-medium uppercase leading-4 tracking-[1.2px] text-dim">{String(index + 1).padStart(2, "0")}</p>
                        <p className="mt-2 text-base font-semibold leading-6 text-ink">{step.title}</p>
                        {step.body && <p className="mt-1 text-sm leading-5 text-dim">{step.body}</p>}
                    </li>
                ))}
            </ol>
        </section>
    );
}
