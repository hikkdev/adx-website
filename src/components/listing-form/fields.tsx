"use client";

import * as React from "react";
import { Check, ChevronDown, Info } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The form controls the two boards draw: a bordered box with its label
 * floating on the top edge (ADX/Form Field), the same box with a chevron
 * for a choice, a tall box for a paragraph, the small-caps section word, a
 * tick row, and the one-line note under a row. Guidance goes in the label,
 * the placeholder or one line under the whole row — never under one cell
 * of a pair (the form symmetry rule).
 */

const box = "relative block w-full rounded-md border border-line bg-white transition-colors focus-within:border-ink";
const floatingLabel = "pointer-events-none absolute -top-[9px] left-3 bg-white px-1 text-[11px] leading-4 text-dim";

export function Field({
    label,
    value,
    onChange,
    placeholder,
    type = "text",
    inputMode,
    disabled,
    readOnly,
    suffix,
    className,
    id,
    autoComplete,
    onBlur,
}: {
    label: string;
    value: string;
    onChange: (next: string) => void;
    placeholder?: string;
    type?: "text" | "number" | "date" | "email" | "tel";
    inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
    disabled?: boolean;
    readOnly?: boolean;
    suffix?: string;
    className?: string;
    id?: string;
    autoComplete?: string;
    onBlur?: () => void;
}) {
    return (
        <label className={cn(box, "h-14", (disabled || readOnly) && "bg-ground", className)}>
            <span className={floatingLabel}>{label}</span>
            <span className="flex h-full items-center gap-2 px-3 pt-2">
                <input
                    id={id}
                    type={type}
                    inputMode={inputMode}
                    value={value}
                    disabled={disabled}
                    readOnly={readOnly}
                    autoComplete={autoComplete}
                    onBlur={onBlur}
                    onChange={(event) => onChange(event.target.value)}
                    placeholder={placeholder}
                    className="min-w-0 flex-1 bg-transparent text-sm text-ink placeholder:text-dim focus:outline-none disabled:cursor-not-allowed"
                />
                {suffix && <span className="shrink-0 text-sm text-dim">{suffix}</span>}
            </span>
        </label>
    );
}

export function SelectField({
    label,
    value,
    onChange,
    options,
    placeholder = "Choose",
    disabled,
    className,
}: {
    label: string;
    value: string;
    onChange: (next: string) => void;
    options: { value: string; label: string }[];
    placeholder?: string;
    disabled?: boolean;
    className?: string;
}) {
    return (
        <label className={cn(box, "h-14", disabled && "bg-ground", className)}>
            <span className={floatingLabel}>{label}</span>
            <span className="flex h-full items-center px-3 pt-2">
                <select
                    value={value}
                    disabled={disabled}
                    onChange={(event) => onChange(event.target.value)}
                    className={cn("min-w-0 flex-1 appearance-none bg-transparent pr-8 text-sm focus:outline-none disabled:cursor-not-allowed", value ? "text-ink" : "text-ink")}
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

export function TextareaField({
    label,
    value,
    onChange,
    placeholder,
    rows = 6,
    className,
    boxed = false,
}: {
    label: string;
    value: string;
    onChange: (next: string) => void;
    placeholder?: string;
    rows?: number;
    className?: string;
    /** The description box on the description step: a plain bold label above a tall ink-bordered box. */
    boxed?: boolean;
}) {
    if (boxed) {
        return (
            <label className={cn("block", className)}>
                <span className="mb-4 block text-sm font-semibold text-ink">{label}</span>
                <textarea
                    value={value}
                    rows={rows}
                    onChange={(event) => onChange(event.target.value)}
                    placeholder={placeholder}
                    className="block w-full resize-y rounded-md border border-ink bg-white px-3 py-3 text-sm leading-5 text-ink placeholder:text-dim focus:outline-none"
                />
            </label>
        );
    }
    return (
        <label className={cn(box, className)}>
            <span className={floatingLabel}>{label}</span>
            <textarea
                value={value}
                rows={rows}
                onChange={(event) => onChange(event.target.value)}
                placeholder={placeholder}
                className="block w-full resize-y bg-transparent px-3 pb-2 pt-4 text-sm leading-5 text-ink placeholder:text-dim focus:outline-none"
            />
        </label>
    );
}

/** AD SLOT · VEHICLE · LOCATION & ROUTE — the small-caps word over a group. */
export function SectionLabel({ children, className }: { children: React.ReactNode; className?: string }) {
    return <p className={cn("text-[11px] font-semibold uppercase tracking-[0.08em] text-dim", className)}>{children}</p>;
}

/** Dimensions & Visibility — the bold sentence-case heading over a group. */
export function GroupTitle({ children, className }: { children: React.ReactNode; className?: string }) {
    return <p className={cn("text-sm font-semibold text-ink", className)}>{children}</p>;
}

/** A one-line note under a row or a section, in the frames' muted voice. */
export function Note({ children, className }: { children: React.ReactNode; className?: string }) {
    return <p className={cn("text-sm leading-5 text-dim", className)}>{children}</p>;
}

/** What went wrong, next to the control that can fix it. */
export function Problem({ children }: { children: React.ReactNode }) {
    return (
        <p role="alert" className="rounded-md border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger">
            {children}
        </p>
    );
}

/** The red-filled square tick the content rules draw, with its label; a description turns it into the two-line row. */
export function CheckRow({ checked, onChange, label, description, className, disabled }: { checked: boolean; onChange: (next: boolean) => void; label: string; description?: string; className?: string; disabled?: boolean }) {
    return (
        <label className={cn("flex cursor-pointer items-start gap-3", disabled && "cursor-not-allowed opacity-60", className)}>
            <span className="relative mt-0.5 inline-flex size-5 shrink-0 items-center justify-center">
                <input type="checkbox" checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} className="peer sr-only" />
                <span className={cn("flex size-5 items-center justify-center rounded-[5px] border-[1.5px] transition-colors", checked ? "border-brand bg-brand text-white" : "border-line bg-white")}>{checked && <Check className="size-3.5" strokeWidth={3} aria-hidden />}</span>
            </span>
            <span className="min-w-0">
                <span className="block text-sm font-medium leading-5 text-ink">{label}</span>
                {description && <span className="block text-xs leading-4 text-dim">{description}</span>}
            </span>
        </label>
    );
}

/** A row of the "I own the venue" kind (5204:80756): a bordered bar with a tick at its left. */
export function CheckBar({ checked, onChange, label, className }: { checked: boolean; onChange: (next: boolean) => void; label: string; className?: string }) {
    return (
        <button type="button" role="checkbox" aria-checked={checked} onClick={() => onChange(!checked)} className={cn("flex h-11 w-full items-center gap-3 rounded-md border bg-white px-4 text-left text-sm font-semibold text-ink", checked ? "border-brand-bright" : "border-line", className)}>
            <span className={cn("flex size-4 items-center justify-center rounded-[4px] border-[1.5px]", checked ? "border-brand bg-brand text-white" : "border-line")}>{checked && <Check className="size-3" strokeWidth={3} aria-hidden />}</span>
            {label}
        </button>
    );
}

/** Required · Optional — the outlined red pill on a document requirement. */
export function Pill({ children, tone = "brand", className }: { children: React.ReactNode; tone?: "brand" | "success" | "warning" | "neutral" | "danger"; className?: string }) {
    const tones = {
        brand: "border-brand-bright text-brand-bright",
        success: "border-success/40 bg-success-soft text-success",
        warning: "border-warning/40 bg-warning-soft text-warning",
        danger: "border-danger/40 bg-danger-soft text-danger",
        neutral: "border-line bg-ground text-dim",
    };
    return <span className={cn("inline-flex h-[22px] items-center rounded-full border px-2.5 text-[11px] font-medium", tones[tone], className)}>{children}</span>;
}

/** The ⓘ at the right of a choice row. */
export function InfoDot({ active, title }: { active?: boolean; title?: string }) {
    return (
        <span title={title} className={cn("flex size-[18px] shrink-0 items-center justify-center rounded-full border", active ? "border-brand-bright text-brand-bright" : "border-line text-dim")} aria-hidden>
            <Info className="size-3" />
        </span>
    );
}

/** A two-column row of fields that stay the same height (the form symmetry rule). */
export function Row({ children, className }: { children: React.ReactNode; className?: string }) {
    return <div className={cn("grid gap-2.5 md:grid-cols-2", className)}>{children}</div>;
}

/** A field with a plain label above it — the business verification's arrangement (5204:82615). */
export function LabelledInput({ label, value, onChange, placeholder, type = "text", readOnly, disabled }: { label: string; value: string; onChange?: (next: string) => void; placeholder?: string; type?: "text" | "email" | "tel"; readOnly?: boolean; disabled?: boolean }) {
    return (
        <label className="block">
            <span className="mb-2 block text-sm font-medium text-ink">{label}</span>
            <input
                type={type}
                value={value}
                readOnly={readOnly}
                disabled={disabled}
                onChange={(event) => onChange?.(event.target.value)}
                placeholder={placeholder}
                className={cn("h-9 w-full rounded-md border border-line bg-white px-3 text-sm text-ink placeholder:text-dim focus:border-ink focus:outline-none", (readOnly || disabled) && "bg-ground text-dim")}
            />
        </label>
    );
}
