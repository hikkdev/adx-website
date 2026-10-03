import { api, apiFetch, ApiError } from "@/lib/api-client";

/**
 * FM-1 (27 Sep 2026): the forms Content › Forms builds — published on the
 * website through the `form` block. A form is a key, a title, who may
 * answer it (PUBLIC or SIGNED_IN) and a published definition: one to ten
 * screens of fields in the flow field vocabulary, a consent line, a
 * success message. `GET /app/forms/:key` answers the published one; `POST
 * /app/forms/:key/submissions` takes the answers. Every answer is checked
 * here before it is sent — required, kind, options, ranges, `dependsOn` —
 * so the reader hears what is wrong beside the field, and again by the
 * API's own field errors when it disagrees.
 */

export const FORM_FIELD_KINDS = ["text", "textarea", "email", "phone", "number", "select", "multiselect", "checkbox", "date", "city", "category", "location", "file"] as const;
export type FormFieldKind = (typeof FORM_FIELD_KINDS)[number];

export type FormAudience = "PUBLIC" | "SIGNED_IN";

export interface FormFieldOption {
    value: string;
    label: string;
}

export interface FormField {
    id: string;
    kind: FormFieldKind;
    label: string;
    hint?: string | null;
    placeholder?: string | null;
    required?: boolean;
    options?: FormFieldOption[];
    min?: number | null;
    max?: number | null;
    maxLength?: number | null;
    /** For a file field: the accepted types (`image/*`, `.pdf`). */
    accept?: string[];
    /** Shown only when an earlier field's answer equals this. */
    dependsOn?: { fieldId: string; equals: string } | null;
}

export interface FormScreen {
    key: string;
    title?: string | null;
    description?: string | null;
    fields: FormField[];
}

export interface FormDefinition {
    screens: FormScreen[];
    submitLabel?: string | null;
    successMessage: string;
    consentText: string;
    contactMap?: { name?: string; email?: string; phone?: string } | null;
}

export interface FormView {
    key: string;
    title: string;
    description: string | null;
    audience: FormAudience;
    version: number;
    definition: FormDefinition;
}

export type FormAnswers = Record<string, unknown>;

/** A `location` answer, as the API lifts it into its columns. */
export interface LocationAnswer {
    latitude: number;
    longitude: number;
    address?: string;
    cityId?: string;
}

/** A `file` answer: the upload the API stored (SIGNED_IN forms only). */
export interface FileAnswer {
    fileId: string;
    url: string;
    name: string;
    size?: number;
    mimeType?: string;
}

export interface SubmissionReceipt {
    id: string;
    message: string;
}

/* ------------------------------------------------------------------ */
/* Reading the answer                                                  */
/* ------------------------------------------------------------------ */

const str = (value: unknown): string | null => (typeof value === "string" && value.trim() ? value.trim() : null);
const num = (value: unknown): number | null => (typeof value === "number" && Number.isFinite(value) ? value : null);

function fieldOf(value: unknown): FormField | null {
    if (!value || typeof value !== "object") return null;
    const row = value as Record<string, unknown>;
    const id = str(row.id);
    const label = str(row.label);
    if (!id || !label || !(FORM_FIELD_KINDS as readonly string[]).includes(String(row.kind))) return null;
    const options = Array.isArray(row.options)
        ? row.options
              .map((option) => (option && typeof option === "object" ? { value: str((option as Record<string, unknown>).value), label: str((option as Record<string, unknown>).label) } : null))
              .filter((option): option is FormFieldOption => !!option && !!option.value && !!option.label)
        : undefined;
    const depends = row.dependsOn && typeof row.dependsOn === "object" ? (row.dependsOn as Record<string, unknown>) : null;
    return {
        id,
        kind: row.kind as FormFieldKind,
        label,
        hint: str(row.hint),
        placeholder: str(row.placeholder),
        required: row.required === true,
        ...(options ? { options } : {}),
        min: num(row.min),
        max: num(row.max),
        maxLength: num(row.maxLength),
        ...(Array.isArray(row.accept) ? { accept: row.accept.filter((a): a is string => typeof a === "string" && !!a.trim()) } : {}),
        dependsOn: depends && str(depends.fieldId) && typeof depends.equals === "string" ? { fieldId: str(depends.fieldId)!, equals: depends.equals } : null,
    };
}

export function parseDefinition(value: unknown): FormDefinition | null {
    if (!value || typeof value !== "object") return null;
    const row = value as Record<string, unknown>;
    if (!Array.isArray(row.screens)) return null;
    const screens = row.screens
        .map((screen, index): FormScreen | null => {
            if (!screen || typeof screen !== "object") return null;
            const s = screen as Record<string, unknown>;
            const fields = (Array.isArray(s.fields) ? s.fields : []).map(fieldOf).filter((field): field is FormField => field !== null);
            return { key: str(s.key) ?? `screen-${index + 1}`, title: str(s.title), description: str(s.description), fields };
        })
        .filter((screen): screen is FormScreen => screen !== null);
    if (screens.length === 0) return null;
    const contact = row.contactMap && typeof row.contactMap === "object" ? (row.contactMap as Record<string, unknown>) : null;
    return {
        screens,
        submitLabel: str(row.submitLabel),
        successMessage: str(row.successMessage) ?? "Thank you — we have your answer.",
        consentText: str(row.consentText) ?? "I agree to ADX contacting me about this.",
        contactMap: contact ? { name: str(contact.name) ?? undefined, email: str(contact.email) ?? undefined, phone: str(contact.phone) ?? undefined } : null,
    };
}

/** A form as the API answers it — null for anything that is not one. */
export function parseFormView(value: unknown): FormView | null {
    const row = value && typeof value === "object" && "data" in (value as object) && !("key" in (value as object)) ? (value as { data: unknown }).data : value;
    if (!row || typeof row !== "object") return null;
    const form = row as Record<string, unknown>;
    const key = str(form.key);
    const definition = parseDefinition(form.definition);
    if (!key || !definition) return null;
    return {
        key,
        title: str(form.title) ?? key,
        description: str(form.description),
        audience: form.audience === "SIGNED_IN" ? "SIGNED_IN" : "PUBLIC",
        version: num(form.version) ?? 0,
        definition,
    };
}

/* ------------------------------------------------------------------ */
/* Validation                                                          */
/* ------------------------------------------------------------------ */

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE = /^\+?[0-9][0-9\s-]{7,15}$/;
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
export const FORM_CATEGORIES = ["OUTDOOR", "INDOOR", "TRANSIT", "MEDIA"] as const;

/** The answer a `dependsOn` compares against, as text — a checkbox says "true"/"false". */
export function answerText(value: unknown): string {
    if (value === null || value === undefined) return "";
    if (typeof value === "boolean") return value ? "true" : "false";
    if (Array.isArray(value)) return value.map(String).join(",");
    if (typeof value === "object") return "";
    return String(value);
}

/** Whether a field is on screen: its `dependsOn` is unset, or the field it names answers what it wants. */
export function isFieldShown(field: Pick<FormField, "dependsOn">, answers: FormAnswers): boolean {
    if (!field.dependsOn) return true;
    return answerText(answers[field.dependsOn.fieldId]) === field.dependsOn.equals;
}

/** Whether an answer counts as given. */
export function isAnswered(field: Pick<FormField, "kind">, value: unknown): boolean {
    switch (field.kind) {
        case "checkbox":
            return value === true;
        case "multiselect":
            return Array.isArray(value) && value.length > 0;
        case "location":
            return !!value && typeof value === "object" && Number.isFinite((value as LocationAnswer).latitude) && Number.isFinite((value as LocationAnswer).longitude);
        case "file":
            return !!value && typeof value === "object" && !!str((value as FileAnswer).url);
        case "number":
            return typeof value === "number" ? Number.isFinite(value) : !!str(value);
        default:
            return !!str(value);
    }
}

/** What is wrong with one answer, in the reader's words — null when nothing is. */
export function validateField(field: FormField, value: unknown): string | null {
    const label = field.label;
    if (!isAnswered(field, value)) return field.required ? (field.kind === "checkbox" ? `Tick "${label}" to continue` : `${label} is needed`) : null;
    switch (field.kind) {
        case "text":
        case "textarea": {
            const text = String(value);
            if (field.maxLength && text.length > field.maxLength) return `${label} is at most ${field.maxLength} characters`;
            if (field.min && text.trim().length < field.min) return `${label} is at least ${field.min} characters`;
            return null;
        }
        case "email":
            return EMAIL.test(String(value).trim()) ? null : "That does not look like an email address";
        case "phone":
            return PHONE.test(String(value).trim()) ? null : "That does not look like a phone number";
        case "number": {
            const n = typeof value === "number" ? value : Number(String(value).trim());
            if (!Number.isFinite(n)) return `${label} is a number`;
            if (field.min !== null && field.min !== undefined && n < field.min) return `${label} is at least ${field.min}`;
            if (field.max !== null && field.max !== undefined && n > field.max) return `${label} is at most ${field.max}`;
            return null;
        }
        case "select": {
            const allowed = (field.options ?? []).map((option) => option.value);
            return allowed.length === 0 || allowed.includes(String(value)) ? null : `Choose one of the ${label.toLowerCase()} options`;
        }
        case "multiselect": {
            const chosen = Array.isArray(value) ? value.map(String) : [];
            const allowed = (field.options ?? []).map((option) => option.value);
            if (allowed.length && chosen.some((v) => !allowed.includes(v))) return `Choose from the ${label.toLowerCase()} options`;
            if (field.min && chosen.length < field.min) return `Choose at least ${field.min}`;
            if (field.max && chosen.length > field.max) return `Choose at most ${field.max}`;
            return null;
        }
        case "date":
            return ISO_DAY.test(String(value)) && !Number.isNaN(Date.parse(String(value))) ? null : `${label} is a date`;
        case "category":
            return (FORM_CATEGORIES as readonly string[]).includes(String(value)) ? null : "Choose a category";
        case "location": {
            const point = value as LocationAnswer;
            return Math.abs(point.latitude) <= 90 && Math.abs(point.longitude) <= 180 ? null : "Drop the pin on the map";
        }
        case "checkbox":
        case "city":
        case "file":
        default:
            return null;
    }
}

/** Every problem on one screen, by field id — hidden fields are skipped. */
export function validateScreen(definition: FormDefinition, index: number, answers: FormAnswers): Record<string, string> {
    const screen = definition.screens[index];
    const errors: Record<string, string> = {};
    if (!screen) return errors;
    for (const field of screen.fields) {
        if (!isFieldShown(field, answers)) continue;
        const problem = validateField(field, answers[field.id]);
        if (problem) errors[field.id] = problem;
    }
    return errors;
}

/** Every problem on every screen. */
export function validateAll(definition: FormDefinition, answers: FormAnswers): Record<string, string> {
    return definition.screens.reduce((all, _screen, index) => ({ ...all, ...validateScreen(definition, index, answers) }), {} as Record<string, string>);
}

/** The answers worth sending: the shown fields' only, a number as a number. */
export function answersToSend(definition: FormDefinition, answers: FormAnswers): FormAnswers {
    const out: FormAnswers = {};
    for (const screen of definition.screens) {
        for (const field of screen.fields) {
            if (!isFieldShown(field, answers)) continue;
            const value = answers[field.id];
            if (!isAnswered(field, value)) continue;
            out[field.id] = field.kind === "number" && typeof value !== "number" ? Number(String(value).trim()) : value;
        }
    }
    return out;
}

/** The screen a field is on, for jumping back to an error the API found. */
export function screenOfField(definition: FormDefinition, fieldId: string): number {
    const at = definition.screens.findIndex((screen) => screen.fields.some((field) => field.id === fieldId));
    return at === -1 ? 0 : at;
}

/** The API's field errors, keyed by field id whether it said `answers.<id>` or `<id>`. */
export function fieldErrorsOf(caught: unknown): Record<string, string> {
    if (!(caught instanceof ApiError)) return {};
    const out: Record<string, string> = {};
    for (const [key, messages] of Object.entries(caught.fieldErrors)) {
        const id = key.startsWith("answers.") ? key.slice("answers.".length) : key;
        const first = Array.isArray(messages) ? messages[0] : undefined;
        if (id && typeof first === "string") out[id] = first;
    }
    const issues = (caught.details as { issues?: { path?: unknown; fieldId?: unknown; message?: unknown }[] } | undefined)?.issues;
    if (Array.isArray(issues)) {
        for (const issue of issues) {
            const id = typeof issue?.fieldId === "string" ? issue.fieldId : typeof issue?.path === "string" ? issue.path.replace(/^answers\./, "") : null;
            if (id && typeof issue?.message === "string" && !out[id]) out[id] = issue.message;
        }
    }
    return out;
}

/* ------------------------------------------------------------------ */
/* Reading and answering                                               */
/* ------------------------------------------------------------------ */

export interface SubmitBody {
    answers: FormAnswers;
    consent: true;
    source?: string;
    captchaToken?: string;
}

export const formsService = {
    /** The published form; null for one that is not published (404). */
    read: async (key: string): Promise<FormView | null> => {
        try {
            return parseFormView(await api.get<unknown>(`/app/forms/${encodeURIComponent(key)}`, { anonymous: true }));
        } catch (caught) {
            if (caught instanceof ApiError && caught.status === 404) return null;
            throw caught;
        }
    },
    /** A PUBLIC form is answered anonymously; a SIGNED_IN one with the session. */
    submit: (key: string, body: SubmitBody, audience: FormAudience = "PUBLIC") =>
        api.post<SubmissionReceipt>(`/app/forms/${encodeURIComponent(key)}/submissions`, body, { anonymous: audience === "PUBLIC" }),
    /** A file for a SIGNED_IN form's `file` field — the uploads door, purpose FORM_UPLOAD. */
    upload: async (file: File): Promise<FileAnswer> => {
        const form = new FormData();
        form.append("file", file);
        form.append("purpose", "FORM_UPLOAD");
        const stored = await apiFetch<{ id?: string; fileId?: string; url: string; name?: string; originalName?: string; size?: number; mimeType?: string }>("/upload", { method: "POST", body: form });
        return { fileId: stored.id ?? stored.fileId ?? "", url: stored.url, name: stored.name ?? stored.originalName ?? file.name, size: stored.size ?? file.size, mimeType: stored.mimeType ?? file.type };
    },
};
