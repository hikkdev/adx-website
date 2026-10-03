"use client";

import * as React from "react";
import { toast } from "sonner";
import { FormFieldInput, type InputSpec } from "@/components/forms/form-fields";
import { Panel } from "@/components/workspace/page-heading";
import { messageOf } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { customFieldsService, formatCustomValue, isEmptyValue, normaliseCustomValue, validateCustomValue, type CustomFieldDef, type CustomFieldEntity, type CustomValues } from "@/services/custom-fields";

const BRAND_BUTTON = "inline-flex h-10 shrink-0 items-center justify-center whitespace-nowrap rounded-md bg-brand px-5 text-sm font-semibold text-white transition-colors hover:bg-[#a51b1b] disabled:pointer-events-none disabled:opacity-50";

/**
 * CF-1 (27 Sep 2026): "More details" — the custom fields Settings › Custom
 * fields shows on the website for this kind of record, with this record's
 * values. A field the owner may edit is an input; the rest are read-only
 * lines. Saving writes only what the owner may change, through
 * `PUT /app/custom-fields/values/:entity/:entityId`. With no field to
 * show, the card is not drawn at all.
 */
export function CustomFieldsSection({ entity, entityId, title = "More details", className }: { entity: CustomFieldEntity; entityId: string; title?: string; className?: string }) {
    const [state, setState] = React.useState<{ key: string; defs: CustomFieldDef[]; values: CustomValues; error: string | null } | null>(null);
    const [draft, setDraft] = React.useState<CustomValues>({});
    const [errors, setErrors] = React.useState<Record<string, string>>({});
    const [busy, setBusy] = React.useState(false);
    const [tick, setTick] = React.useState(0);
    const key = `${entity}|${entityId}|${tick}`;

    React.useEffect(() => {
        let cancelled = false;
        Promise.all([customFieldsService.defs(entity), customFieldsService.values(entity, entityId).catch(() => ({}) as CustomValues)])
            .then(([defs, values]) => {
                if (cancelled) return;
                setState({ key, defs, values, error: null });
                setDraft(values);
                setErrors({});
            })
            .catch((caught: unknown) => !cancelled && setState({ key, defs: [], values: {}, error: messageOf(caught, "Could not read the extra details.") }));
        return () => {
            cancelled = true;
        };
    }, [entity, entityId, key]);

    const ready = state?.key === key ? state : null;
    if (!ready || (ready.defs.length === 0 && !ready.error)) return null;

    const editable = ready.defs.filter((def) => def.editableByOwner);
    const dirty = editable.some((def) => JSON.stringify(normaliseCustomValue(def, draft[def.key])) !== JSON.stringify(normaliseCustomValue(def, ready.values[def.key])));

    const save = async (event: React.FormEvent) => {
        event.preventDefault();
        const problems: Record<string, string> = {};
        for (const def of editable) {
            const problem = validateCustomValue(def, draft[def.key]);
            if (problem) problems[def.key] = problem;
        }
        setErrors(problems);
        if (Object.keys(problems).length) return;
        setBusy(true);
        try {
            const values: CustomValues = {};
            for (const def of editable) values[def.key] = normaliseCustomValue(def, draft[def.key]);
            await customFieldsService.save(entity, entityId, values);
            toast.success("Details saved");
            setTick((n) => n + 1);
        } catch (caught) {
            toast.error(messageOf(caught, "Could not save the details."));
        } finally {
            setBusy(false);
        }
    };

    return (
        <Panel className={cn("p-0", className)}>
            <div className="border-b border-line px-6 py-4">
                <p className="text-base font-semibold text-ink">{title}</p>
                <p className="mt-1 text-sm text-dim">{editable.length ? "Extra details ADX asks for — the ones you can change are open below." : "Extra details ADX keeps on this record."}</p>
            </div>
            {ready.error ? (
                <p className="px-6 py-5 text-sm text-dim">{ready.error}</p>
            ) : (
                <form onSubmit={save} className="grid gap-5 px-6 py-5" data-testid="custom-fields">
                    {ready.defs.map((def) =>
                        def.editableByOwner ? (
                            <FormFieldInput key={def.id} field={specOf(def)} value={draft[def.key]} onChange={(value) => setDraft((current) => ({ ...current, [def.key]: value }))} error={errors[def.key] ?? null} disabled={busy} />
                        ) : (
                            <div key={def.id} className="flex items-baseline justify-between gap-4 border-b border-line pb-3 last:border-b-0" data-field={def.key}>
                                <dt className="text-sm text-dim">{def.label}</dt>
                                <dd className={cn("text-right text-sm", isEmptyValue(ready.values[def.key]) ? "text-dim" : "text-ink")}>{formatCustomValue(def, ready.values[def.key])}</dd>
                            </div>
                        )
                    )}
                    {editable.length > 0 && (
                        <div className="flex items-center justify-between gap-3 pt-1">
                            <p className="text-xs text-dim">{dirty ? "Unsaved changes" : "Saved details"}</p>
                            <button type="submit" disabled={busy || !dirty} className={BRAND_BUTTON}>
                                {busy ? "Saving…" : "Save details"}
                            </button>
                        </div>
                    )}
                </form>
            )}
        </Panel>
    );
}

/** A definition as the shared field switch draws it. */
export function specOf(def: CustomFieldDef): InputSpec {
    return { id: def.key, kind: def.kind, label: def.label, hint: def.hint, required: def.required, options: def.options };
}
