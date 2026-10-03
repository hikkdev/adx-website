"use client";

import * as React from "react";
import { brandButton } from "@/components/publisher/parts";
import { cn } from "@/lib/utils";
import { ENTITY_PICKER_BUTTON, ENTITY_PICKER_HEADING, ENTITY_PICKER_HELPER, type EntityTypeOption, type KycEntityType } from "@/services/verification";

/**
 * Phase D (the owner, 1 Oct 2026) — "Who is this account for?": the legal
 * form an account verifies as, asked the moment the Digio check starts and
 * never before (KYC is not a sign-up gate). One choice from the rows the
 * server listed for the side — its labels, in its order — one line of help
 * under the whole list, and the button that starts the check with the
 * answer. The words are the apps' own, kept in `services/verification`.
 *
 * `warning` is the line the upgrade door prints above the button (a verified
 * individual verifying a business); `initial` is the form already on the
 * account, pre-selected when the person is correcting it; `children` sit
 * beside the button — the page's way out (the uploads, or back).
 */
export function EntityTypePicker({
    options,
    onContinue,
    warning,
    initial = null,
    children,
}: {
    options: EntityTypeOption[];
    onContinue: (value: KycEntityType) => void;
    warning?: string;
    initial?: KycEntityType | null;
    children?: React.ReactNode;
}) {
    const name = React.useId();
    const [value, setValue] = React.useState<KycEntityType | null>(initial);
    // A choice counts only while it is one of the rows drawn.
    const chosen = options.some((option) => option.value === value) ? value : null;

    return (
        <form
            onSubmit={(event) => {
                event.preventDefault();
                if (chosen) onContinue(chosen);
            }}
        >
            <fieldset>
                <legend className="text-base font-semibold text-ink">{ENTITY_PICKER_HEADING}</legend>
                <div className="mt-4 grid gap-2 sm:grid-cols-2">
                    {options.map((option) => {
                        const checked = chosen === option.value;
                        return (
                            <label key={option.value} className={cn("flex cursor-pointer items-center gap-3 rounded-lg border px-4 py-3 transition-colors", checked ? "border-brand-bright bg-[#fff7f7]" : "border-line hover:border-dim")}>
                                <input type="radio" name={name} value={option.value} checked={checked} onChange={() => setValue(option.value)} className="shrink-0 accent-[#e32227]" />
                                <span className="text-sm font-medium text-ink">{option.label}</span>
                            </label>
                        );
                    })}
                </div>
            </fieldset>
            <p className="mt-3 text-xs text-dim">{ENTITY_PICKER_HELPER}</p>
            {warning && <p className="mt-5 text-sm text-warning">{warning}</p>}
            <div className={cn("flex flex-wrap items-center gap-3", warning ? "mt-3" : "mt-5")}>
                <button type="submit" disabled={!chosen} className={brandButton}>
                    {ENTITY_PICKER_BUTTON}
                </button>
                {children}
            </div>
        </form>
    );
}
