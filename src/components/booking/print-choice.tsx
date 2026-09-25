"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { FULFILMENT_LABEL, type FulfilmentChoice } from "@/services/booking";

const CHOICES: FulfilmentChoice[] = ["ADX_PRINTS", "ADVERTISER_SHIPS"];

/**
 * PS-1: one space's print choice — "ADX prints" or "I'll ship my own
 * prints" — under its line in the cart and on the Ad spaces step. A space
 * without its own choice follows the campaign's (`value` null); picking one
 * sets it for this space alone, and "campaign's choice" lets it go again.
 */
export function PrintChoice({ value, campaignChoice, onChange, disabled, className }: { value: FulfilmentChoice | null; campaignChoice: FulfilmentChoice | null; onChange: (next: FulfilmentChoice | null) => void; disabled?: boolean; className?: string }) {
    const effective = value ?? campaignChoice ?? "ADX_PRINTS";
    return (
        <div className={cn("flex flex-wrap items-center gap-x-3 gap-y-1 text-xs", className)}>
            <span className="text-dim">Printing:</span>
            <div role="radiogroup" aria-label="Printing for this space" className="inline-flex rounded-md border border-line bg-white p-0.5">
                {CHOICES.map((choice) => {
                    const checked = effective === choice;
                    return (
                        <button
                            key={choice}
                            type="button"
                            role="radio"
                            aria-checked={checked}
                            disabled={disabled}
                            onClick={() => onChange(choice)}
                            className={cn("h-7 rounded px-2.5 font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60", checked ? "bg-ink text-white" : "text-ink hover:bg-ground")}
                        >
                            {FULFILMENT_LABEL[choice]}
                        </button>
                    );
                })}
            </div>
            {value ? (
                <button type="button" disabled={disabled} onClick={() => onChange(null)} className="text-dim underline underline-offset-2 hover:text-ink disabled:opacity-60">
                    Use the campaign&apos;s choice
                </button>
            ) : (
                <span className="text-dim">Campaign&apos;s choice</span>
            )}
        </div>
    );
}
