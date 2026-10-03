"use client";

import * as React from "react";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * FM-1 (27 Sep 2026): the controls a published form draws — the site's
 * bordered box with its label floating on the top edge (the listing
 * boards' ADX/Form Field), the same box with a chevron for a choice, a
 * tall one for a paragraph, chips for a pick, a tick row. Every field
 * stands on its own row, so guidance and a fault go under the whole row
 * (the form symmetry rule) and a required field carries a red mark in its
 * label.
 */

export const box = "relative block w-full rounded-md border bg-white transition-colors focus-within:border-ink";
export const floatingLabel = "pointer-events-none absolute -top-[9px] left-3 bg-white px-1 text-[11px] leading-4 text-dim";
export const inputText = "min-w-0 flex-1 bg-transparent text-sm text-ink placeholder:text-dim focus:outline-none disabled:cursor-not-allowed";

export function LabelText({ label, required }: { label: string; required?: boolean }) {
    return (
        <>
            {label}
            {required && (
                <span className="text-brand-bright" aria-hidden>
                    {" "}
                    *
                </span>
            )}
        </>
    );
}

/** The row: the control, then its hint and — when it has one — what is wrong, in red. */
export function FieldRow({ id, hint, error, children, className }: { id: string; hint?: string | null; error?: string | null; children: React.ReactNode; className?: string }) {
    return (
        <div className={className} data-field={id}>
            {children}
            {hint && !error && (
                <p id={`${id}-hint`} className="mt-1.5 text-xs leading-4 text-dim">
                    {hint}
                </p>
            )}
            {error && (
                <p id={`${id}-error`} role="alert" className="mt-1.5 text-xs leading-4 text-danger">
                    {error}
                </p>
            )}
        </div>
    );
}

interface Common {
    id: string;
    label: string;
    required?: boolean;
    error?: string | null;
    disabled?: boolean;
    placeholder?: string | null;
}

export function TextBox({
    id,
    label,
    required,
    error,
    disabled,
    placeholder,
    value,
    onChange,
    type = "text",
    inputMode,
    autoComplete,
    maxLength,
    min,
    max,
    step,
}: Common & {
    value: string;
    onChange: (next: string) => void;
    type?: "text" | "email" | "tel" | "number" | "date" | "url";
    inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
    autoComplete?: string;
    maxLength?: number | null;
    min?: number | null;
    max?: number | null;
    step?: number | string;
}) {
    return (
        <label className={cn(box, "h-14", error ? "border-danger" : "border-line", disabled && "bg-ground")}>
            <span className={floatingLabel}>
                <LabelText label={label} required={required} />
            </span>
            <span className="flex h-full items-center gap-2 px-3 pt-2">
                <input
                    id={id}
                    name={id}
                    type={type}
                    inputMode={inputMode}
                    autoComplete={autoComplete}
                    value={value}
                    disabled={disabled}
                    maxLength={maxLength ?? undefined}
                    min={min ?? undefined}
                    max={max ?? undefined}
                    step={step}
                    onChange={(event) => onChange(event.target.value)}
                    placeholder={placeholder ?? undefined}
                    aria-invalid={error ? true : undefined}
                    aria-describedby={error ? `${id}-error` : undefined}
                    className={inputText}
                />
            </span>
        </label>
    );
}

export function TextAreaBox({ id, label, required, error, disabled, placeholder, value, onChange, rows = 5, maxLength }: Common & { value: string; onChange: (next: string) => void; rows?: number; maxLength?: number | null }) {
    return (
        <label className={cn(box, error ? "border-danger" : "border-line", disabled && "bg-ground")}>
            <span className={floatingLabel}>
                <LabelText label={label} required={required} />
            </span>
            <textarea
                id={id}
                name={id}
                value={value}
                rows={rows}
                disabled={disabled}
                maxLength={maxLength ?? undefined}
                onChange={(event) => onChange(event.target.value)}
                placeholder={placeholder ?? undefined}
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? `${id}-error` : undefined}
                className="block w-full resize-y bg-transparent px-3 pb-2 pt-4 text-sm leading-5 text-ink placeholder:text-dim focus:outline-none disabled:cursor-not-allowed"
            />
        </label>
    );
}

export function SelectBox({ id, label, required, error, disabled, placeholder = "Choose", value, onChange, options }: Common & { value: string; onChange: (next: string) => void; options: { value: string; label: string }[] }) {
    return (
        <label className={cn(box, "h-14", error ? "border-danger" : "border-line", disabled && "bg-ground")}>
            <span className={floatingLabel}>
                <LabelText label={label} required={required} />
            </span>
            <span className="flex h-full items-center px-3 pt-2">
                <select
                    id={id}
                    name={id}
                    value={value}
                    disabled={disabled}
                    onChange={(event) => onChange(event.target.value)}
                    aria-invalid={error ? true : undefined}
                    aria-describedby={error ? `${id}-error` : undefined}
                    className="min-w-0 flex-1 appearance-none bg-transparent pr-8 text-sm text-ink focus:outline-none disabled:cursor-not-allowed"
                >
                    <option value="">{placeholder}</option>
                    {options.map((option) => (
                        <option key={option.value} value={option.value}>
                            {option.label}
                        </option>
                    ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-ink" aria-hidden />
            </span>
        </label>
    );
}

/** A pick from chips: one (radio) or several (checkbox), each a bordered pill that fills red when chosen. */
export function ChoiceChips({
    id,
    label,
    required,
    error,
    disabled,
    options,
    value,
    onChange,
    multiple = false,
}: Omit<Common, "placeholder"> & { options: { value: string; label: string }[]; value: string | string[]; onChange: (next: string | string[]) => void; multiple?: boolean }) {
    const chosen = new Set(Array.isArray(value) ? value : value ? [value] : []);
    const toggle = (option: string) => {
        if (disabled) return;
        if (!multiple) return onChange(chosen.has(option) && !required ? "" : option);
        const next = new Set(chosen);
        if (next.has(option)) next.delete(option);
        else next.add(option);
        onChange([...next]);
    };
    return (
        <fieldset id={id} aria-invalid={error ? true : undefined} aria-describedby={error ? `${id}-error` : undefined} className="min-w-0">
            <legend className="mb-2 text-sm font-medium text-ink">
                <LabelText label={label} required={required} />
            </legend>
            <div className="flex flex-wrap gap-2" role={multiple ? "group" : "radiogroup"}>
                {options.map((option) => {
                    const on = chosen.has(option.value);
                    return (
                        <button
                            key={option.value}
                            type="button"
                            role={multiple ? "checkbox" : "radio"}
                            aria-checked={on}
                            disabled={disabled}
                            onClick={() => toggle(option.value)}
                            className={cn("inline-flex h-10 items-center gap-1.5 rounded-full border px-4 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60", on ? "border-brand bg-brand text-white" : "border-line bg-white text-ink hover:border-ink")}
                        >
                            {on && <Check className="size-3.5" strokeWidth={3} aria-hidden />}
                            {option.label}
                        </button>
                    );
                })}
            </div>
        </fieldset>
    );
}

/** The red-filled square tick with its label — a checkbox field, and the consent line. */
export function TickRow({ id, label, required, description, checked, onChange, disabled, error }: { id: string; label: React.ReactNode; required?: boolean; description?: string | null; checked: boolean; onChange: (next: boolean) => void; disabled?: boolean; error?: string | null }) {
    return (
        <label className={cn("flex cursor-pointer items-start gap-3", disabled && "cursor-not-allowed opacity-60")}>
            <span className="relative mt-0.5 inline-flex size-5 shrink-0 items-center justify-center">
                <input id={id} name={id} type="checkbox" checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} aria-invalid={error ? true : undefined} aria-describedby={error ? `${id}-error` : undefined} className="peer sr-only" />
                <span className={cn("flex size-5 items-center justify-center rounded-[5px] border-[1.5px] transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-brand/40", checked ? "border-brand bg-brand text-white" : error ? "border-danger bg-white" : "border-line bg-white")}>
                    {checked && <Check className="size-3.5" strokeWidth={3} aria-hidden />}
                </span>
            </span>
            <span className="min-w-0">
                <span className="block text-sm font-medium leading-5 text-ink">
                    {typeof label === "string" ? <LabelText label={label} required={required} /> : label}
                </span>
                {description && <span className="block text-xs leading-4 text-dim">{description}</span>}
            </span>
        </label>
    );
}
