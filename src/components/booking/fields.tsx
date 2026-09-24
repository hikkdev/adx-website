"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/** Label above, box below — the campaign brief's inputs (5204:62521). */
export function TextField({ label, hint, className, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string }) {
    const id = React.useId();
    return (
        <div className={className}>
            <label htmlFor={id} className="block text-sm font-medium text-ink">
                {label}
            </label>
            <input id={id} {...props} className={cn("mt-2 h-11 w-full rounded-md border border-line bg-white px-3 text-sm text-ink placeholder:text-dim focus:border-ink focus:outline-none disabled:bg-ground disabled:text-dim", props.disabled && "cursor-not-allowed")} />
            {hint && <p className="mt-1.5 text-xs text-dim">{hint}</p>}
        </div>
    );
}

export function SelectField({ label, hint, className, children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement> & { label: string; hint?: string }) {
    const id = React.useId();
    return (
        <div className={className}>
            <label htmlFor={id} className="block text-sm font-medium text-ink">
                {label}
            </label>
            <select id={id} {...props} className="mt-2 h-11 w-full rounded-md border border-line bg-white px-3 text-sm text-ink focus:border-ink focus:outline-none disabled:bg-ground disabled:text-dim">
                {children}
            </select>
            {hint && <p className="mt-1.5 text-xs text-dim">{hint}</p>}
        </div>
    );
}

export function TextAreaField({ label, hint, className, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string; hint?: string }) {
    const id = React.useId();
    return (
        <div className={className}>
            <label htmlFor={id} className="block text-sm font-medium text-ink">
                {label}
            </label>
            <textarea id={id} {...props} className="mt-2 min-h-[88px] w-full rounded-md border border-line bg-white px-3 py-2 text-sm text-ink placeholder:text-dim focus:border-ink focus:outline-none" />
            {hint && <p className="mt-1.5 text-xs text-dim">{hint}</p>}
        </div>
    );
}

/**
 * The billing form's box with its small capital label inside the border
 * (5204:64359: LEGAL BUSINESS NAME over the value). A select draws the same
 * box with a chevron.
 */
export function FloatingField({ label, className, select, children, invalid, ...props }: (React.InputHTMLAttributes<HTMLInputElement> & { label: string; className?: string; select?: false; children?: never; invalid?: boolean }) | (React.SelectHTMLAttributes<HTMLSelectElement> & { label: string; className?: string; select: true; children: React.ReactNode; invalid?: boolean })) {
    const id = React.useId();
    return (
        <div className={cn("relative rounded-md border bg-white shadow-card focus-within:border-ink", invalid ? "border-[#e32227]" : "border-line", className)}>
            <label htmlFor={id} className="absolute left-3 top-1.5 text-[10px] font-medium uppercase tracking-wide text-dim">
                {label}
            </label>
            {select ? (
                <>
                    <select id={id} {...(props as React.SelectHTMLAttributes<HTMLSelectElement>)} className="h-[52px] w-full appearance-none bg-transparent px-3 pb-1 pt-4 text-sm text-ink focus:outline-none disabled:text-dim">
                        {children}
                    </select>
                    <svg className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-dim" width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
                        <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                </>
            ) : (
                <input id={id} {...(props as React.InputHTMLAttributes<HTMLInputElement>)} className="h-[52px] w-full bg-transparent px-3 pb-1 pt-4 text-sm text-ink placeholder:text-dim focus:outline-none disabled:text-dim" />
            )}
        </div>
    );
}

/**
 * A choice drawn as a bordered row with a radio dot (5204:62791, 5204:63336):
 * the chosen one in brand with a brand-soft wash.
 */
export function ChoiceCard({ checked, onSelect, title, description, trailing, className, disabled }: { checked: boolean; onSelect: () => void; title: React.ReactNode; description?: React.ReactNode; trailing?: React.ReactNode; className?: string; disabled?: boolean }) {
    return (
        <button
            type="button"
            role="radio"
            aria-checked={checked}
            disabled={disabled}
            onClick={onSelect}
            className={cn("flex w-full items-center gap-4 rounded-md border px-4 py-4 text-left transition-colors", checked ? "border-brand bg-[#fff7f7]" : "border-line bg-white hover:border-ink", disabled && "cursor-not-allowed opacity-60", className)}
        >
            <RadioDot checked={checked} />
            <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-ink">{title}</span>
                {description && <span className="mt-1 block text-sm text-dim">{description}</span>}
            </span>
            {trailing}
        </button>
    );
}

export function RadioDot({ checked }: { checked: boolean }) {
    return (
        <span className={cn("flex size-[18px] shrink-0 items-center justify-center rounded-full border-2", checked ? "border-brand" : "border-dim")} aria-hidden>
            {checked && <span className="size-2.5 rounded-full bg-brand" />}
        </span>
    );
}

export function CheckBox({ checked, onChange, label, className }: { checked: boolean; onChange: (next: boolean) => void; label: React.ReactNode; className?: string }) {
    return (
        <label className={cn("flex cursor-pointer items-center gap-3 text-sm text-ink", className)}>
            <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="peer sr-only" />
            <span className={cn("flex size-4 items-center justify-center rounded-[3px] border", checked ? "border-brand bg-brand" : "border-dim bg-white")} aria-hidden>
                {checked && (
                    <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                        <path d="M1 4l2.5 2.5L9 1" stroke="white" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                )}
            </span>
            <span>{label}</span>
        </label>
    );
}
