"use client";

import * as React from "react";
import { Check, ChevronDown } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { formatDate, isoDate } from "@/services/planner";

/* ------------------------------------------------------------------ */
/* Text                                                                */
/* ------------------------------------------------------------------ */

/**
 * The planner's "native mobile field" (5204:69932): the label small inside
 * the box, the value under it. With `options` it is the dropdown the frame
 * draws; with `suggestions` it stays free text and offers them.
 */
export function NativeField({
    label,
    value,
    onChange,
    placeholder,
    options,
    suggestions,
    id,
}: {
    label: string;
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    options?: string[];
    suggestions?: string[];
    id?: string;
}) {
    const reactId = React.useId();
    const inputId = id ?? reactId;
    const listId = `${inputId}-list`;
    return (
        <label htmlFor={inputId} className="relative block min-h-[78px] rounded-lg border border-line bg-white px-3.5 py-3 focus-within:border-ink">
            <span className="block text-xs text-dim">{label}</span>
            {options ? (
                <>
                    <select id={inputId} value={value} onChange={(e) => onChange(e.target.value)} className="mt-2 block w-full appearance-none bg-transparent pr-8 text-sm text-ink outline-none">
                        <option value="">{placeholder ?? "Choose…"}</option>
                        {options.map((option) => (
                            <option key={option} value={option}>
                                {option}
                            </option>
                        ))}
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-4 top-[45px] size-4 text-ink" aria-hidden />
                </>
            ) : (
                <>
                    <input
                        id={inputId}
                        value={value}
                        onChange={(e) => onChange(e.target.value)}
                        placeholder={placeholder}
                        list={suggestions ? listId : undefined}
                        className="mt-2 block w-full bg-transparent pr-8 text-sm text-ink outline-none placeholder:text-dim"
                    />
                    {suggestions && (
                        <>
                            <datalist id={listId}>
                                {suggestions.map((option) => (
                                    <option key={option} value={option} />
                                ))}
                            </datalist>
                            <ChevronDown className="pointer-events-none absolute right-4 top-[45px] size-4 text-ink" aria-hidden />
                        </>
                    )}
                </>
            )}
        </label>
    );
}

/** Label above, box under (5204:68087's brief fields, 5204:70835's centre location). */
export function LabeledInput({
    label,
    value,
    onChange,
    placeholder,
    type = "text",
    hint,
    id,
    onKeyDown,
    autoComplete,
}: {
    label: string;
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    type?: string;
    hint?: string;
    id?: string;
    onKeyDown?: React.KeyboardEventHandler<HTMLInputElement>;
    autoComplete?: string;
}) {
    const reactId = React.useId();
    const inputId = id ?? reactId;
    return (
        <div>
            <label htmlFor={inputId} className="block text-sm font-medium text-ink">
                {label}
            </label>
            <input
                id={inputId}
                type={type}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder={placeholder}
                autoComplete={autoComplete}
                className="mt-2 block min-h-12 w-full rounded-lg border border-line bg-white px-4 py-3 text-sm text-ink outline-none placeholder:text-dim focus:border-ink"
            />
            {hint && <p className="mt-2 text-sm text-dim">{hint}</p>}
        </div>
    );
}

export function LabeledTextarea({
    label,
    value,
    onChange,
    placeholder,
    rows = 3,
    hint,
    id,
}: {
    label: string;
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    rows?: number;
    hint?: string;
    id?: string;
}) {
    const reactId = React.useId();
    const inputId = id ?? reactId;
    return (
        <div>
            <label htmlFor={inputId} className="block text-sm font-medium text-ink">
                {label}
            </label>
            <textarea
                id={inputId}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                placeholder={placeholder}
                rows={rows}
                className="mt-2 block w-full resize-y rounded-lg border border-line bg-white px-4 py-3 text-sm leading-5 text-ink outline-none placeholder:text-dim focus:border-ink"
            />
            {hint && <p className="mt-2 text-sm text-dim">{hint}</p>}
        </div>
    );
}

/* ------------------------------------------------------------------ */
/* Choices                                                             */
/* ------------------------------------------------------------------ */

/** One row of a single choice (5204:70135): a 56px box, red-edged and pink when chosen; with `radio` the dot the audience frame draws. */
export function ChoiceRow({
    title,
    description,
    selected,
    onSelect,
    radio,
    compact,
}: {
    title: string;
    description?: string;
    selected: boolean;
    onSelect: () => void;
    radio?: boolean;
    compact?: boolean;
}) {
    return (
        <button
            type="button"
            role={radio ? "radio" : undefined}
            aria-checked={radio ? selected : undefined}
            aria-pressed={radio ? undefined : selected}
            onClick={onSelect}
            className={cn(
                "flex w-full items-center gap-3 rounded-lg border bg-white px-4 text-left transition-colors",
                compact ? "min-h-[52px] py-3" : description ? "min-h-14 py-3" : "h-14",
                selected ? "border-brand bg-[#fffafa]" : "border-line hover:border-ink"
            )}
        >
            {radio && (
                <span className={cn("flex size-4 shrink-0 items-center justify-center rounded-full border", selected ? "border-brand" : "border-dim")} aria-hidden>
                    {selected && <span className="size-2 rounded-full bg-brand" />}
                </span>
            )}
            <span className="min-w-0">
                <span className="block text-sm font-medium text-ink">{title}</span>
                {description && <span className="mt-0.5 block text-sm text-dim">{description}</span>}
            </span>
        </button>
    );
}

/** A tile of a four-across choice (5204:71149's triggers, 5204:71988's tracking methods). */
export function ChoiceTile({ title, selected, onSelect, radio }: { title: string; selected: boolean; onSelect: () => void; radio?: boolean }) {
    return (
        <button
            type="button"
            role={radio ? "radio" : undefined}
            aria-checked={radio ? selected : undefined}
            aria-pressed={radio ? undefined : selected}
            onClick={onSelect}
            className={cn(
                "flex items-center justify-center gap-3 rounded-lg border bg-white px-4 text-sm font-medium text-ink transition-colors",
                radio ? "h-[82px] justify-start pl-6" : "h-[58px]",
                selected ? "border-brand bg-[#fffafa]" : "border-line hover:border-ink"
            )}
        >
            {radio && (
                <span className={cn("flex size-[18px] shrink-0 items-center justify-center rounded-full border", selected ? "border-brand" : "border-dim")} aria-hidden>
                    {selected && <span className="size-2.5 rounded-full bg-brand" />}
                </span>
            )}
            {title}
        </button>
    );
}

/** The 40px pill chip (5204:70868): outlined idle, brand-red when on. */
export function Chip({ label, on, onClick, className }: { label: string; on: boolean; onClick: () => void; className?: string }) {
    return (
        <button
            type="button"
            aria-pressed={on}
            onClick={onClick}
            className={cn("inline-flex h-10 items-center justify-center rounded-full border px-3.5 text-xs font-semibold transition-colors", on ? "border-brand bg-brand text-white" : "border-[#d9d9de] bg-white text-[#596673] hover:border-ink", className)}
        >
            {label}
        </button>
    );
}

/** A small square-ish chip for a day of the week (5204:71371's Mon–Sun). */
export function DayChip({ label, on, onClick }: { label: string; on: boolean; onClick: () => void }) {
    return (
        <button
            type="button"
            aria-pressed={on}
            onClick={onClick}
            className={cn("inline-flex h-11 w-[72px] items-center justify-center rounded-lg border text-sm font-medium transition-colors", on ? "border-brand bg-brand text-white" : "border-line bg-white text-ink hover:border-ink")}
        >
            {label}
        </button>
    );
}

/** The dark segmented control (5204:70831): white pill on the chosen option. */
export function Segmented<T extends string>({ options, value, onChange, className }: { options: { id: T; title: string }[]; value: T; onChange: (value: T) => void; className?: string }) {
    return (
        <div role="radiogroup" className={cn("inline-flex h-11 items-stretch rounded-full bg-[rgba(26,26,30,0.8)] p-1", className)}>
            {options.map((option) => {
                const on = option.id === value;
                return (
                    <button
                        key={option.id}
                        type="button"
                        role="radio"
                        aria-checked={on}
                        onClick={() => onChange(option.id)}
                        className={cn("flex min-w-[100px] flex-1 items-center justify-center rounded-full px-3.5 text-xs font-semibold transition-colors", on ? "bg-white text-ink" : "text-white hover:bg-white/10")}
                    >
                        {option.title}
                    </button>
                );
            })}
        </div>
    );
}

/** The 44×24 switch the frames draw (ADX/Switch), red when on. */
export function Toggle({ on, onChange, label }: { on: boolean; onChange: (on: boolean) => void; label: string }) {
    return (
        <button
            type="button"
            role="switch"
            aria-checked={on}
            aria-label={label}
            onClick={() => onChange(!on)}
            className={cn("relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors", on ? "bg-brand" : "bg-[#d9d9de]")}
        >
            <span className={cn("absolute size-5 rounded-full bg-white shadow transition-transform", on ? "translate-x-[22px]" : "translate-x-0.5")} />
        </button>
    );
}

/** A bordered row with a title, a line under it and a switch on the right (5204:71113, 5204:72390). */
export function ToggleRow({ title, description, on, onChange }: { title: string; description?: string; on: boolean; onChange: (on: boolean) => void }) {
    return (
        <div className="flex items-center justify-between gap-4 rounded-lg border border-line bg-white px-5 py-4">
            <div className="min-w-0">
                <p className="text-sm font-medium text-ink">{title}</p>
                {description && <p className="mt-1 text-sm text-dim">{description}</p>}
            </div>
            <Toggle on={on} onChange={onChange} label={title} />
        </div>
    );
}

/* ------------------------------------------------------------------ */
/* Dates                                                               */
/* ------------------------------------------------------------------ */

function toDate(iso: string): Date | undefined {
    const date = isoDate(iso);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return undefined;
    return new Date(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10)));
}

function toIso(date: Date): string {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/**
 * A date box with the calendar behind it (5204:69728 "12 Oct 2026 ▾").
 * `native` draws the label small inside the box, the way the budget
 * step's STARTS / ENDS fields are; otherwise the label sits above.
 */
export function DateField({ label, value, onChange, min, native, disabled }: { label: string; value: string; onChange: (iso: string) => void; min?: string; native?: boolean; disabled?: boolean }) {
    const [open, setOpen] = React.useState(false);
    const selected = toDate(value);
    const floor = min ? toDate(min) : undefined;
    return (
        <div>
            {!native && <p className="mb-2 text-sm font-medium text-ink">{label}</p>}
            <Popover open={open} onOpenChange={setOpen}>
                <PopoverTrigger asChild>
                    <button
                        type="button"
                        disabled={disabled}
                        aria-label={`${label}: ${value ? formatDate(value) : "not set"}`}
                        className={cn("flex w-full items-center justify-between rounded-lg border border-line bg-white px-4 text-left text-sm text-ink hover:border-ink disabled:opacity-60", native ? "h-14 flex-col items-stretch justify-center py-2" : "h-[52px]")}
                    >
                        {native ? (
                            <>
                                <span className="text-xs uppercase tracking-wide text-dim">{label}</span>
                                <span className="flex items-center justify-between">
                                    <span>{value ? formatDate(value) : "Choose a date"}</span>
                                    <ChevronDown className="size-4 text-ink" aria-hidden />
                                </span>
                            </>
                        ) : (
                            <>
                                <span>{value ? formatDate(value) : "Choose a date"}</span>
                                <ChevronDown className="size-4 text-ink" aria-hidden />
                            </>
                        )}
                    </button>
                </PopoverTrigger>
                <PopoverContent align="start" className="w-auto p-0">
                    <Calendar
                        mode="single"
                        selected={selected}
                        defaultMonth={selected ?? floor}
                        disabled={floor ? { before: floor } : undefined}
                        onSelect={(date) => {
                            if (!date) return;
                            onChange(toIso(date));
                            setOpen(false);
                        }}
                    />
                </PopoverContent>
            </Popover>
        </div>
    );
}

/* ------------------------------------------------------------------ */
/* Small things                                                        */
/* ------------------------------------------------------------------ */

/** The soft grey panel a step explains itself in (5204:71149's "No trigger requirements"). */
export function Notice({ title, children, className }: { title?: string; children: React.ReactNode; className?: string }) {
    return (
        <div className={cn("rounded-lg bg-ground px-5 py-5", className)}>
            {title && <p className="text-base font-semibold text-ink">{title}</p>}
            <div className={cn("text-sm text-dim", title && "mt-2")}>{children}</div>
        </div>
    );
}

export function SectionTitle({ children, line }: { children: React.ReactNode; line?: string }) {
    return (
        <div>
            <h3 className="text-lg font-semibold leading-6 text-ink">{children}</h3>
            {line && <p className="mt-2 text-sm text-dim">{line}</p>}
        </div>
    );
}

export function Divider() {
    return <div className="h-px w-full bg-line" />;
}

/** "Selected ✓" / "Add" on a space card (5204:71746). */
export function SelectButton({ selected, onClick, title }: { selected: boolean; onClick: () => void; title: string }) {
    return (
        <button
            type="button"
            aria-pressed={selected}
            aria-label={`${selected ? "Remove" : "Add"} ${title}`}
            onClick={onClick}
            className={cn("inline-flex h-8 items-center gap-1 rounded-md border px-3 text-xs font-semibold transition-colors", selected ? "border-brand bg-[#fffafa] text-brand" : "border-ink bg-white text-ink hover:bg-ground")}
        >
            {selected ? (
                <>
                    Selected <Check className="size-3.5" aria-hidden />
                </>
            ) : (
                "Add"
            )}
        </button>
    );
}
