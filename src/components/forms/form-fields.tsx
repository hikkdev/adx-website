"use client";

import * as React from "react";
import { Paperclip, X } from "lucide-react";
import { CityField } from "@/components/site/city-field";
import { messageOf } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { CATEGORY_LABEL } from "@/services/browse";
import { FORM_CATEGORIES, formsService, type FileAnswer, type LocationAnswer } from "@/services/forms";
import { box, ChoiceChips, FieldRow, floatingLabel, inputText, LabelText, SelectBox, TextAreaBox, TextBox, TickRow } from "./field-box";
import { LocationField } from "./location-field";

/**
 * FM-1 / CF-1: one field by its kind — the flow field vocabulary a form
 * or a custom field is built from: `text, textarea, email, phone, number,
 * select, multiselect, checkbox, date, city, category, location, file`
 * (forms) and `url` (custom fields). A kind the site does not draw is
 * skipped with a warning, never a crash.
 */
export type InputKind = "text" | "textarea" | "email" | "phone" | "number" | "select" | "multiselect" | "checkbox" | "date" | "city" | "category" | "location" | "file" | "url";

export interface InputSpec {
    id: string;
    kind: InputKind;
    label: string;
    hint?: string | null;
    placeholder?: string | null;
    required?: boolean;
    options?: { value: string; label: string }[];
    min?: number | null;
    max?: number | null;
    maxLength?: number | null;
    accept?: string[];
}

const text = (value: unknown): string => (value === null || value === undefined ? "" : typeof value === "number" ? String(value) : typeof value === "string" ? value : "");

export function FormFieldInput({ field, value, onChange, error, disabled }: { field: InputSpec; value: unknown; onChange: (next: unknown) => void; error?: string | null; disabled?: boolean }) {
    const common = { id: field.id, label: field.label, required: field.required, error, disabled, placeholder: field.placeholder };
    switch (field.kind) {
        case "text":
            return (
                <FieldRow id={field.id} hint={field.hint} error={error}>
                    <TextBox {...common} value={text(value)} onChange={onChange} maxLength={field.maxLength} />
                </FieldRow>
            );
        case "textarea":
            return (
                <FieldRow id={field.id} hint={field.hint} error={error}>
                    <TextAreaBox {...common} value={text(value)} onChange={onChange} maxLength={field.maxLength} />
                </FieldRow>
            );
        case "email":
            return (
                <FieldRow id={field.id} hint={field.hint} error={error}>
                    <TextBox {...common} type="email" inputMode="email" autoComplete="email" value={text(value)} onChange={onChange} placeholder={field.placeholder ?? "you@example.com"} />
                </FieldRow>
            );
        case "phone":
            return (
                <FieldRow id={field.id} hint={field.hint} error={error}>
                    <TextBox {...common} type="tel" inputMode="tel" autoComplete="tel" value={text(value)} onChange={(next) => onChange(next.replace(/[^\d+\s-]/g, "").slice(0, 16))} placeholder={field.placeholder ?? "98XXXXXX10"} />
                </FieldRow>
            );
        case "url":
            return (
                <FieldRow id={field.id} hint={field.hint} error={error}>
                    <TextBox {...common} type="url" inputMode="url" autoComplete="url" value={text(value)} onChange={onChange} placeholder={field.placeholder ?? "https://"} />
                </FieldRow>
            );
        case "number":
            return (
                <FieldRow id={field.id} hint={field.hint} error={error}>
                    <TextBox {...common} type="number" inputMode="decimal" value={text(value)} onChange={onChange} min={field.min} max={field.max} step="any" />
                </FieldRow>
            );
        case "date":
            return (
                <FieldRow id={field.id} hint={field.hint} error={error}>
                    <TextBox {...common} type="date" value={text(value)} onChange={onChange} />
                </FieldRow>
            );
        case "select":
            return (
                <FieldRow id={field.id} hint={field.hint} error={error}>
                    <SelectBox {...common} value={text(value)} onChange={onChange} options={field.options ?? []} />
                </FieldRow>
            );
        case "multiselect":
            return (
                <FieldRow id={field.id} hint={field.hint} error={error}>
                    <ChoiceChips id={field.id} label={field.label} required={field.required} error={error} disabled={disabled} multiple options={field.options ?? []} value={Array.isArray(value) ? value.map(String) : []} onChange={onChange} />
                </FieldRow>
            );
        case "category":
            return (
                <FieldRow id={field.id} hint={field.hint} error={error}>
                    <ChoiceChips id={field.id} label={field.label} required={field.required} error={error} disabled={disabled} options={FORM_CATEGORIES.map((category) => ({ value: category, label: CATEGORY_LABEL[category] }))} value={text(value)} onChange={onChange} />
                </FieldRow>
            );
        case "checkbox":
            return (
                <FieldRow id={field.id} error={error}>
                    <TickRow id={field.id} label={field.label} required={field.required} description={field.hint} checked={value === true} onChange={onChange} disabled={disabled} error={error} />
                </FieldRow>
            );
        case "city":
            return (
                <FieldRow id={field.id} hint={field.hint} error={error}>
                    <div className={cn(box, "h-14", error ? "border-danger" : "border-line", disabled && "bg-ground")}>
                        <span className={floatingLabel}>
                            <LabelText label={field.label} required={field.required} />
                        </span>
                        <div className="flex h-full items-center px-3 pt-2">
                            <CityField id={field.id} value={text(value)} onChange={onChange} placeholder={field.placeholder ?? "Any city in India"} className="min-w-0 flex-1" inputClassName={cn(inputText, "font-normal")} />
                        </div>
                    </div>
                </FieldRow>
            );
        case "location":
            return <LocationField id={field.id} label={field.label} required={field.required} hint={field.hint} value={(value as LocationAnswer | null) ?? null} onChange={onChange} error={error} disabled={disabled} />;
        case "file":
            return (
                <FieldRow id={field.id} hint={field.hint} error={error}>
                    <FileBox id={field.id} label={field.label} required={field.required} accept={field.accept} value={(value as FileAnswer | null) ?? null} onChange={onChange} error={error} disabled={disabled} />
                </FieldRow>
            );
        default:
            console.warn(`[forms] the website cannot draw a "${String((field as InputSpec).kind)}" field; skipped`);
            return null;
    }
}

/** A `file` field (SIGNED_IN forms): the box takes a file, sends it through the uploads door, and keeps what came back. */
function FileBox({ id, label, required, accept, value, onChange, error, disabled }: { id: string; label: string; required?: boolean; accept?: string[]; value: FileAnswer | null; onChange: (next: FileAnswer | null) => void; error?: string | null; disabled?: boolean }) {
    const [busy, setBusy] = React.useState(false);
    const [failure, setFailure] = React.useState<string | null>(null);

    const pick = async (file: File | undefined) => {
        if (!file) return;
        setBusy(true);
        setFailure(null);
        try {
            onChange(await formsService.upload(file));
        } catch (caught) {
            setFailure(messageOf(caught, "Could not upload the file."));
        } finally {
            setBusy(false);
        }
    };

    return (
        <div>
            <label className={cn(box, "h-14", error || failure ? "border-danger" : "border-line", disabled && "bg-ground")}>
                <span className={floatingLabel}>
                    <LabelText label={label} required={required} />
                </span>
                <span className="flex h-full items-center gap-3 px-3 pt-2">
                    <Paperclip className="size-4 shrink-0 text-dim" aria-hidden />
                    {value ? (
                        <>
                            <span className="min-w-0 flex-1 truncate text-sm text-ink">{value.name}</span>
                            {!disabled && (
                                <button type="button" onClick={() => onChange(null)} className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-dim hover:bg-ground hover:text-ink" aria-label="Remove the file">
                                    <X className="size-4" aria-hidden />
                                </button>
                            )}
                        </>
                    ) : (
                        <input id={id} name={id} type="file" accept={accept?.join(",")} disabled={disabled || busy} onChange={(event) => void pick(event.target.files?.[0])} className="min-w-0 flex-1 text-sm text-ink file:mr-3 file:rounded-md file:border file:border-line file:bg-white file:px-3 file:py-1 file:text-xs file:font-semibold file:text-ink" />
                    )}
                    {busy && <span className="shrink-0 text-xs text-dim">Uploading…</span>}
                </span>
            </label>
            {failure && (
                <p role="alert" className="mt-1.5 text-xs leading-4 text-danger">
                    {failure}
                </p>
            )}
        </div>
    );
}
