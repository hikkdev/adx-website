import { api } from "@/lib/api-client";

/**
 * CF-1 (27 Sep 2026): custom fields — the extra details Settings › Custom
 * fields adds to a publisher, an advertiser, a listing or a lead. The
 * website draws the ones marked `showOnWebsite` under "More details" on
 * the publisher profile, the advertiser account and the listing pages, and
 * lets the owner change those marked `editableByOwner`. `GET
 * /app/custom-fields/:entity` answers the definitions; the values are read
 * and written at `/app/custom-fields/values/:entity/:entityId` — the
 * record must be the caller's own.
 */

export type CustomFieldEntity = "PUBLISHER" | "ADVERTISER" | "LISTING" | "LEAD";

export const CUSTOM_FIELD_KINDS = ["text", "textarea", "number", "select", "multiselect", "checkbox", "date", "email", "phone", "url", "location"] as const;
export type CustomFieldKind = (typeof CUSTOM_FIELD_KINDS)[number];

export interface CustomFieldDef {
    id: string;
    entity: CustomFieldEntity;
    key: string;
    label: string;
    kind: CustomFieldKind;
    options: { value: string; label: string }[];
    hint: string | null;
    required: boolean;
    showInApps: boolean;
    showOnWebsite: boolean;
    editableByOwner: boolean;
    sortOrder: number;
}

export interface LocationValue {
    latitude: number;
    longitude: number;
    address?: string;
    cityId?: string;
}

export type CustomValues = Record<string, unknown>;

const str = (value: unknown): string | null => (typeof value === "string" && value.trim() ? value.trim() : null);

/** The definitions, read strictly and in their order; only the kinds the site can draw. */
export function parseDefs(answer: unknown): CustomFieldDef[] {
    const rows = Array.isArray(answer) ? answer : answer && typeof answer === "object" && Array.isArray((answer as { items?: unknown }).items) ? (answer as { items: unknown[] }).items : [];
    const out: CustomFieldDef[] = [];
    for (const row of rows) {
        if (!row || typeof row !== "object") continue;
        const def = row as Record<string, unknown>;
        const id = str(def.id);
        const key = str(def.key);
        const label = str(def.label);
        if (!id || !key || !label || !(CUSTOM_FIELD_KINDS as readonly string[]).includes(String(def.kind))) continue;
        const options = (Array.isArray(def.options) ? def.options : [])
            .map((option) => (option && typeof option === "object" ? { value: str((option as Record<string, unknown>).value), label: str((option as Record<string, unknown>).label) } : typeof option === "string" ? { value: option, label: option } : null))
            .filter((option): option is { value: string; label: string } => !!option && !!option.value && !!option.label);
        out.push({
            id,
            entity: (["PUBLISHER", "ADVERTISER", "LISTING", "LEAD"].includes(String(def.entity)) ? def.entity : "PUBLISHER") as CustomFieldEntity,
            key,
            label,
            kind: def.kind as CustomFieldKind,
            options,
            hint: str(def.hint),
            required: def.required === true,
            showInApps: def.showInApps === true,
            showOnWebsite: def.showOnWebsite === true,
            editableByOwner: def.editableByOwner === true,
            sortOrder: typeof def.sortOrder === "number" ? def.sortOrder : out.length,
        });
    }
    return out.sort((a, b) => a.sortOrder - b.sortOrder);
}

/** The values by key, whether the API answered `{ values: {…} }`, a map, or rows of `{ key, value }`. */
export function parseValues(answer: unknown): CustomValues {
    if (!answer || typeof answer !== "object") return {};
    const row = answer as Record<string, unknown>;
    const inner = row.values && typeof row.values === "object" ? row.values : Array.isArray(row.items) ? row.items : row;
    if (Array.isArray(inner)) {
        const out: CustomValues = {};
        for (const entry of inner) {
            if (!entry || typeof entry !== "object") continue;
            const key = str((entry as Record<string, unknown>).key) ?? str((entry as Record<string, unknown>).defKey);
            if (key) out[key] = (entry as Record<string, unknown>).value;
        }
        return out;
    }
    return { ...(inner as CustomValues) };
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE = /^\+?[0-9][0-9\s-]{7,15}$/;
const URL_RE = /^https?:\/\/[^\s]+$/i;
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

export function isEmptyValue(value: unknown): boolean {
    if (value === null || value === undefined) return true;
    if (typeof value === "string") return value.trim() === "";
    if (Array.isArray(value)) return value.length === 0;
    if (typeof value === "boolean") return false;
    if (typeof value === "object") return !Number.isFinite((value as LocationValue).latitude);
    return false;
}

/** What is wrong with a value for its definition — null when nothing. */
export function validateCustomValue(def: CustomFieldDef, value: unknown): string | null {
    if (isEmptyValue(value)) return def.required && def.kind !== "checkbox" ? `${def.label} is needed` : null;
    switch (def.kind) {
        case "number":
            return Number.isFinite(typeof value === "number" ? value : Number(String(value).trim())) ? null : `${def.label} is a number`;
        case "email":
            return EMAIL.test(String(value).trim()) ? null : "That does not look like an email address";
        case "phone":
            return PHONE.test(String(value).trim()) ? null : "That does not look like a phone number";
        case "url":
            return URL_RE.test(String(value).trim()) ? null : "A link starts with http:// or https://";
        case "date":
            return ISO_DAY.test(String(value)) ? null : `${def.label} is a date`;
        case "select":
            return def.options.length === 0 || def.options.some((option) => option.value === String(value)) ? null : `Choose one of the ${def.label.toLowerCase()} options`;
        case "multiselect": {
            const chosen = Array.isArray(value) ? value.map(String) : [];
            return def.options.length === 0 || chosen.every((v) => def.options.some((option) => option.value === v)) ? null : `Choose from the ${def.label.toLowerCase()} options`;
        }
        case "location": {
            const point = value as LocationValue;
            return Number.isFinite(point.latitude) && Number.isFinite(point.longitude) && Math.abs(point.latitude) <= 90 && Math.abs(point.longitude) <= 180 ? null : "Drop the pin on the map";
        }
        default:
            return null;
    }
}

/** The value as a read-only line. */
export function formatCustomValue(def: CustomFieldDef, value: unknown): string {
    if (isEmptyValue(value)) return "—";
    switch (def.kind) {
        case "checkbox":
            return value === true ? "Yes" : "No";
        case "select":
            return def.options.find((option) => option.value === String(value))?.label ?? String(value);
        case "multiselect":
            return (Array.isArray(value) ? value : []).map((v) => def.options.find((option) => option.value === String(v))?.label ?? String(v)).join(", ");
        case "location": {
            const point = value as LocationValue;
            return point.address?.trim() || `${point.latitude.toFixed(5)}, ${point.longitude.toFixed(5)}`;
        }
        case "date": {
            const at = Date.parse(String(value));
            return Number.isNaN(at) ? String(value) : new Date(at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
        }
        default:
            return String(value);
    }
}

/** The value to send: a number as a number, text trimmed. */
export function normaliseCustomValue(def: CustomFieldDef, value: unknown): unknown {
    if (isEmptyValue(value)) return null;
    if (def.kind === "number") return typeof value === "number" ? value : Number(String(value).trim());
    if (typeof value === "string") return value.trim();
    return value;
}

export const customFieldsService = {
    /** The definitions the website draws for an entity (`showOnWebsite`), in order. */
    defs: async (entity: CustomFieldEntity): Promise<CustomFieldDef[]> => parseDefs(await api.get<unknown>(`/app/custom-fields/${entity}`)).filter((def) => def.showOnWebsite),
    values: async (entity: CustomFieldEntity, entityId: string): Promise<CustomValues> => parseValues(await api.get<unknown>(`/app/custom-fields/values/${entity}/${encodeURIComponent(entityId)}`)),
    save: (entity: CustomFieldEntity, entityId: string, values: CustomValues) => api.put<unknown>(`/app/custom-fields/values/${entity}/${encodeURIComponent(entityId)}`, { values }),
};
