import { api } from "@/lib/api-client";

/**
 * FL-1 (27 Sep 2026): the flows the console's flow editor keeps on the
 * `AppConfig` row — `GET /config`, the same public read both apps make on
 * boot (`app-config/README.md`: "GET is deliberately unauthenticated").
 * The website reads one of them, `flows.listing`, the wizard the publisher
 * apps render (`mobile/user-app/src/features/publisher/listing-flow`), so
 * the screens, fields, labels, order and branches of the site's listing
 * wizard come from the same definition rather than from a baked list.
 *
 * The types mirror the apps' `publisher-api.ts` (`FlowField`, `FlowScreen`,
 * `FlowBranch`, `Flow`); the vocabulary is the backend's `flow-schema.ts`.
 * The read is loose on purpose: a flow the console has since extended is
 * still drawn, and a row that is not a wizard at all reads as `null`, which
 * the wizard takes as "fall back to the baked steps".
 */

/** The twenty-three field kinds the apps' `fields.tsx` switch on (`FIELD_KINDS` in `flow-schema.ts`). */
export const FLOW_FIELD_KINDS = [
    "selectable-cards",
    "venue-type",
    "media-type",
    "section",
    "city",
    "document-upload",
    "sub-venue",
    "material",
    "textarea",
    "number",
    "computed",
    "geo-point",
    "select",
    "base-price",
    "date",
    "time-range",
    "content-stance",
    "content-prohibited",
    "image-upload",
    "file-upload",
    "checkbox",
    "switch",
    "text",
] as const;

export type FlowFieldKind = (typeof FLOW_FIELD_KINDS)[number];

export interface FlowOption {
    id: string;
    title: string;
    description?: string;
}

export interface FlowField {
    id: string;
    /** One of `FLOW_FIELD_KINDS` — or a kind a newer console added, which the site skips with a warning. */
    type: string;
    label: string;
    required?: boolean;
    placeholder?: string;
    hint?: string;
    description?: string;
    options?: FlowOption[];
    branching?: boolean;
    dependsOn?: string;
    filterByCategory?: boolean;
    groupBy?: string;
    from?: string[];
    op?: string;
    readOnly?: boolean;
    showIndicator?: boolean;
    scope?: string;
    aiAssist?: boolean;
}

export interface FlowScreen {
    key: string;
    title: string;
    subtitle?: string;
    step: number;
    totalSteps: number;
    /** Printed instead of the counter on a screen outside the numbered sequence ("Verification"). */
    badge?: string;
    ctaLabel: string;
    fields: FlowField[];
}

export interface FlowBranch {
    id: string;
    title: string;
    description: string;
    screens: FlowScreen[];
}

export interface WizardFlow {
    label: string;
    description?: string;
    /** The root: one screen carries the branching field. */
    screens: FlowScreen[];
    /** Keyed by the branching option's id — `indoor`, `outdoor`, `transit`, `media` on the listing flow. */
    branches: Record<string, FlowBranch>;
    /** Stamped by the server on every PATCH; null for a row written without one. */
    version: number | null;
}

/* ── Reading the row loosely ───────────────────────────────────────────── */

const isRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const str = (value: unknown): string | undefined => (typeof value === "string" && value.trim() !== "" ? value : undefined);
const bool = (value: unknown): boolean | undefined => (typeof value === "boolean" ? value : undefined);

function parseOption(raw: unknown): FlowOption | null {
    if (!isRecord(raw)) return null;
    const id = str(raw.id);
    const title = str(raw.title);
    if (!id || !title) return null;
    return { id, title, ...(str(raw.description) ? { description: raw.description as string } : {}) };
}

/** A field with an id, a type and a label; anything less is not a question and is dropped. */
export function parseFlowField(raw: unknown): FlowField | null {
    if (!isRecord(raw)) return null;
    const id = str(raw.id);
    const type = str(raw.type);
    const label = str(raw.label);
    if (!id || !type || !label) return null;
    const options = Array.isArray(raw.options) ? raw.options.map(parseOption).filter((o): o is FlowOption => o !== null) : undefined;
    const from = Array.isArray(raw.from) ? raw.from.filter((v): v is string => typeof v === "string") : undefined;
    const field: FlowField = { id, type, label };
    if (bool(raw.required) !== undefined) field.required = raw.required as boolean;
    if (str(raw.placeholder)) field.placeholder = raw.placeholder as string;
    if (str(raw.hint)) field.hint = raw.hint as string;
    if (str(raw.description)) field.description = raw.description as string;
    if (options && options.length) field.options = options;
    if (bool(raw.branching)) field.branching = true;
    if (str(raw.dependsOn)) field.dependsOn = raw.dependsOn as string;
    if (bool(raw.filterByCategory)) field.filterByCategory = true;
    if (str(raw.groupBy)) field.groupBy = raw.groupBy as string;
    if (from && from.length) field.from = from;
    if (str(raw.op)) field.op = raw.op as string;
    if (bool(raw.readOnly)) field.readOnly = true;
    if (bool(raw.showIndicator)) field.showIndicator = true;
    if (str(raw.scope)) field.scope = raw.scope as string;
    if (bool(raw.aiAssist)) field.aiAssist = true;
    return field;
}

export function parseFlowScreen(raw: unknown): FlowScreen | null {
    if (!isRecord(raw)) return null;
    const key = str(raw.key);
    const title = str(raw.title);
    if (!key || !title) return null;
    const fields = Array.isArray(raw.fields) ? raw.fields.map(parseFlowField).filter((f): f is FlowField => f !== null) : [];
    return {
        key,
        title,
        ...(str(raw.subtitle) ? { subtitle: raw.subtitle as string } : {}),
        step: typeof raw.step === "number" && Number.isFinite(raw.step) ? raw.step : 0,
        totalSteps: typeof raw.totalSteps === "number" && Number.isFinite(raw.totalSteps) ? raw.totalSteps : 0,
        ...(str(raw.badge) ? { badge: raw.badge as string } : {}),
        ctaLabel: str(raw.ctaLabel) ?? "Continue",
        fields,
    };
}

/**
 * The row's `flows.listing` as a wizard, or null when it is not one (no
 * row yet, a ladder under that key, a screens list that is not a list).
 * Screens that cannot be drawn at all — no key, no title — are dropped
 * rather than crashing the wizard; a screen with no fields is kept, since
 * a heading-only screen is a thing the console may make.
 */
export function parseWizardFlow(raw: unknown): WizardFlow | null {
    if (!isRecord(raw) || !Array.isArray(raw.screens)) return null;
    const screens = raw.screens.map(parseFlowScreen).filter((s): s is FlowScreen => s !== null);
    if (screens.length === 0) return null;
    const branches: Record<string, FlowBranch> = {};
    if (isRecord(raw.branches)) {
        for (const [key, value] of Object.entries(raw.branches)) {
            if (!isRecord(value) || !Array.isArray(value.screens)) continue;
            const branchScreens = value.screens.map(parseFlowScreen).filter((s): s is FlowScreen => s !== null);
            branches[key] = { id: str(value.id) ?? key, title: str(value.title) ?? key, description: str(value.description) ?? "", screens: branchScreens };
        }
    }
    return {
        label: str(raw.label) ?? "Listing",
        ...(str(raw.description) ? { description: raw.description as string } : {}),
        screens,
        branches,
        version: typeof raw.version === "number" ? raw.version : null,
    };
}

/* ── Walking a flow ────────────────────────────────────────────────────── */

/** The screens a listing on this branch passes through: the root, then the branch's own. Unknown or no branch: the root alone. */
export function screensFor(flow: WizardFlow, branchId: string | null): FlowScreen[] {
    const branch = branchId ? flow.branches[branchId] : undefined;
    return [...flow.screens, ...(branch?.screens ?? [])];
}

/** Every field the flow can ask, root first then each branch, one entry per id (a branch repeats the root's ids only by mistake). */
export function fieldsOf(flow: WizardFlow): FlowField[] {
    const seen = new Set<string>();
    const out: FlowField[] = [];
    for (const screen of [...flow.screens, ...Object.values(flow.branches).flatMap((b) => b.screens)]) {
        for (const field of screen.fields) {
            if (seen.has(field.id)) continue;
            seen.add(field.id);
            out.push(field);
        }
    }
    return out;
}

/** The root field that branches the flow — the category on the listing flow. */
export function branchingField(flow: WizardFlow): FlowField | null {
    for (const screen of flow.screens) {
        const field = screen.fields.find((f) => f.branching && f.type === "selectable-cards");
        if (field) return field;
    }
    return null;
}

/* ── The service ───────────────────────────────────────────────────────── */

export const flowsService = {
    /** `flows.listing` as a wizard, or null — a failed read throws, and the wizard falls back to its baked steps. */
    listing: async (): Promise<WizardFlow | null> => {
        const config = await api.get<{ flows?: Record<string, unknown> } | null>("/config", { anonymous: true });
        return parseWizardFlow(config?.flows?.listing);
    },
};
