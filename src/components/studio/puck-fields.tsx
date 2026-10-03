"use client";

import * as React from "react";
import { Info } from "lucide-react";
import { FieldLabel, type Field } from "@puckeditor/core";
import { defaultProps, type FieldSpec } from "@/services/studio";
import { ChecklistField, FormKeyField, JsonField, ListingIdsField, MediaField, SlotKeyField, TargetField, type TargetValue } from "./field-widgets";

/**
 * ST-1: the registry's `FieldSpec[]` as Puck fields.
 *
 * `GET /layouts/block-types` describes every block's props with the
 * console's vocabulary (`text`, `textarea`, `markdown`, `number`, `select`,
 * `multiselect`, `media`, `target`, `listingIds`, `slotKey`, `contentSlug`,
 * `formKey`, `cta`, `list`). Puck has the first five natively; the rest
 * are custom fields over `field-widgets.tsx`; a `list` is a Puck array of
 * the item's fields; anything this build has never heard of is edited as
 * JSON so a new input never blocks an editor.
 */

const labelOf = (spec: FieldSpec): string => (spec.required ? `${spec.label} *` : spec.label);

const iconOf = (spec: FieldSpec): React.ReactElement | undefined => (spec.hint ? <Info className="size-3.5" aria-label={spec.hint} /> : undefined);

type WidgetProps<V> = { value: V; onChange: (next: V) => void; readOnly?: boolean; spec: FieldSpec };

/** A Puck custom field around one widget, with the field's label and hint drawn the way Puck draws its own. */
function custom<V>(spec: FieldSpec, Widget: (props: WidgetProps<V>) => React.ReactElement): Field {
    const label = labelOf(spec);
    return {
        type: "custom",
        label,
        render: ({ value, onChange, readOnly }) => (
            <FieldLabel label={label} icon={iconOf(spec)} readOnly={readOnly} el="div">
                <Widget value={value as V} onChange={(next) => onChange(next)} readOnly={readOnly} spec={spec} />
                {spec.hint && <p className="mt-1 text-[11px] text-dim">{spec.hint}</p>}
            </FieldLabel>
        ),
    };
}

const MARKDOWN_HINT = "Markdown: **bold**, _italic_, # headings, - lists, [links](https://…)";

/** A one-line summary of a list item for Puck's array rows: its first words. */
export function itemSummary(fields: readonly FieldSpec[]): (item: Record<string, unknown>, index?: number) => string {
    return (item, index) => {
        for (const spec of fields) {
            const value = item?.[spec.key];
            if (typeof value === "string" && value.trim() && spec.input !== "media") return value.trim().slice(0, 40);
        }
        return `Item ${(index ?? 0) + 1}`;
    };
}

export function fieldFor(spec: FieldSpec): Field {
    const label = labelOf(spec);
    const labelIcon = iconOf(spec);
    switch (spec.input) {
        case "text":
        case "contentSlug":
            return { type: "text", label, labelIcon, placeholder: spec.hint };
        case "textarea":
            return { type: "textarea", label, labelIcon, placeholder: spec.hint };
        case "markdown":
            return { type: "textarea", label: `${label} (Markdown)`, labelIcon, placeholder: spec.hint ?? MARKDOWN_HINT };
        case "number":
            return { type: "number", label, labelIcon, min: spec.min, max: spec.max };
        case "select":
            return { type: "select", label, labelIcon, options: [...(spec.required ? [] : [{ label: "—", value: "" }]), ...(spec.options ?? [])] };
        case "multiselect":
            return custom<string[]>(spec, ({ value, onChange, readOnly, spec: own }) => <ChecklistField options={own.options ?? []} value={value} onChange={onChange} readOnly={readOnly} />);
        case "media":
            return custom<string>(spec, ({ value, onChange, readOnly, spec: own }) => <MediaField value={value} onChange={onChange} spec={own.spec} readOnly={readOnly} />);
        case "target":
            return custom<TargetValue>(spec, ({ value, onChange, readOnly }) => <TargetField value={value} onChange={onChange} readOnly={readOnly} />);
        case "listingIds":
            return custom<string[]>(spec, ({ value, onChange, readOnly, spec: own }) => <ListingIdsField value={value} onChange={onChange} max={own.max} readOnly={readOnly} />);
        case "slotKey":
            return custom<string>(spec, ({ value, onChange, readOnly }) => <SlotKeyField value={value} onChange={onChange} readOnly={readOnly} />);
        case "formKey":
            return custom<string>(spec, ({ value, onChange, readOnly }) => <FormKeyField value={value} onChange={onChange} readOnly={readOnly} />);
        case "cta":
            return {
                type: "object",
                label,
                labelIcon,
                objectFields: {
                    label: { type: "text", label: "Label" },
                    target: fieldFor({ key: "target", label: "Opens", input: "target", required: true }),
                },
            };
        case "list": {
            const of = spec.of ?? [];
            return {
                type: "array",
                label,
                labelIcon,
                arrayFields: fieldsFor(of),
                min: spec.min,
                max: spec.max,
                defaultItemProps: defaultProps(of),
                getItemSummary: itemSummary(of),
            };
        }
        default:
            return custom<unknown>(spec, ({ value, onChange, readOnly }) => <JsonField value={value} onChange={onChange} readOnly={readOnly} />);
    }
}

/** Every prop of a block type as Puck fields, keyed by prop. */
export function fieldsFor(specs: readonly FieldSpec[]): Record<string, Field> {
    const fields: Record<string, Field> = {};
    for (const spec of specs) fields[spec.key] = fieldFor(spec);
    return fields;
}
