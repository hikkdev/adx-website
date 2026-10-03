import { areaSqFt, documentSlotsFor, isDigitalMediaType, offeredMediaTypes, offeredVenues, shortName, type Catalogue, type ContentStance, type ListingCategory, type ListingDraftInput, type MediaType, type PricingUnit, type RightsBasis } from "@/services/listing-editor";
import { fieldsOf, FLOW_FIELD_KINDS, screensFor, type FlowField, type FlowScreen, type WizardFlow } from "@/services/flows";
import { digitsOnly, PHOTO_META_FIELD, SITE_FIELD, TERMS_FIELD, type ExtraAnswer } from "@/services/listing-site-questions";
import { contentRulesOf, emptyForm, fileNameOf, hoursPairOf, isStepKey, photoMetaOf, pointFromAnswer, siteAsks, VISIBILITY_WINDOWS, visibilityWindowOf, withPhotoMeta, type ListingForm, type StepKey, type StoredFile } from "../form-model";

/**
 * FL-1 (27 Sep 2026): the flow-driven listing wizard's contract with the
 * form — "a flow-field-id → form-model mapping, with the apps'
 * `fields.tsx` as the reference for ids and semantics".
 *
 * `flows.listing` names its questions by the apps' field ids (`title`,
 * `venue_type_id`, `location`, `base_price`, …) and stores answers in the
 * apps' shapes (a pin as `{ latitude, longitude }`, the hours as `{ from,
 * to }`, the papers as `[{ kind, url }]`). The website's answers object is
 * `ListingForm`, and `toCreateBody` there is the only place a form field
 * meets a column. So the flow never writes a column itself: every flow
 * field id has a binding here that reads its answer off the form in the
 * apps' shape and writes it back into the form's own keys — and the create
 * body is `toCreateBody(formInPlay(form, flow))`, exactly the body the
 * baked steps would have sent for the same answers (the parity test in
 * `flow-model.test.ts` holds it to the body captured before this lot).
 *
 * A field id with no binding is a question the console added that the
 * listing has no column for: its answer lives in `form.extra[id]`, kept
 * with the draft, never sent.
 */

/* ── Bindings ──────────────────────────────────────────────────────────── */

export interface FieldBinding {
    /** The form-model key the answer lives under — the mapping table's right-hand column. */
    key: string;
    /** The answer in the apps' shape, off the form. */
    read: (form: ListingForm) => unknown;
    /** The patch that stores an answer in the apps' shape into the form. */
    write: (form: ListingForm, value: unknown) => Partial<ListingForm>;
}

const CATEGORIES: readonly ListingCategory[] = ["INDOOR", "OUTDOOR", "TRANSIT", "MEDIA"];
const PRICING_UNIT_IDS: readonly string[] = ["PER_DAY", "PER_WEEK", "PER_MONTH", "PER_SQFT_PER_DAY", "PER_SQFT_PER_MONTH"];
const RIGHTS_IDS: readonly string[] = ["OWNED", "LEASED", "LICENSED", "PERMIT"];
const STANCES: readonly string[] = ["ALLOWED", "REQUIRES_APPROVAL", "NOT_ALLOWED", "PROHIBITED"];

/** The app-drawn answers with no field of their own (`use-listing-flow.ts`). */
export const CONTENT_RULES_FIELD = "content_rules";
export const INSTANT_BOOKING_FIELD = "instant_booking";
export const SLOTS_FIELD = "slots_total";
/** The server's fields the app-only extras are drawn beside. */
export const AVAILABILITY_FIELD = "available_from";
export const PRICE_FIELD = "base_price";
export const VEHICLE_NUMBER_FIELD = "vehicle_number";
export const SLOTS_MIN = 1;
export const SLOTS_MAX = 24;

/** The two content fields write into the one `content_rules` answer, as the apps do. */
const ALIASES: Record<string, string> = { restricted_categories: CONTENT_RULES_FIELD, prohibited_content: CONTENT_RULES_FIELD };

export const asString = (value: unknown): string => (typeof value === "string" ? value : typeof value === "number" && Number.isFinite(value) ? String(value) : "");

/** A stored file from the apps' url string or the site's `{ url, name }`. */
export function asFile(value: unknown): StoredFile | null {
    if (typeof value === "string") return value.trim() ? { url: value, name: fileNameOf(value) } : null;
    if (value && typeof value === "object" && typeof (value as StoredFile).url === "string" && (value as StoredFile).url.trim()) {
        const file = value as { url: string; name?: unknown; fileId?: unknown; takenAt?: unknown };
        return {
            url: file.url,
            name: typeof file.name === "string" && file.name ? file.name : fileNameOf(file.url),
            // A photograph's upload row and moment ride with it (listing-data-gaps lot).
            ...(typeof file.fileId === "string" && file.fileId ? { fileId: file.fileId } : {}),
            ...(typeof file.takenAt === "string" && file.takenAt ? { takenAt: file.takenAt } : {}),
        };
    }
    return null;
}

function rulesRecord(value: unknown): Record<string, ContentStance> {
    if (!Array.isArray(value)) return {};
    const out: Record<string, ContentStance> = {};
    for (const row of value as { contentCategoryId?: unknown; stance?: unknown }[]) {
        if (row && typeof row.contentCategoryId === "string" && typeof row.stance === "string" && STANCES.includes(row.stance)) out[row.contentCategoryId] = row.stance as ContentStance;
    }
    return out;
}

function clampSlots(value: unknown): number {
    const count = typeof value === "number" ? value : Number(value);
    return Number.isInteger(count) ? Math.min(SLOTS_MAX, Math.max(SLOTS_MIN, count)) : SLOTS_MIN;
}

/** The hours the form answers, in the apps' `{ from, to }` — the same order of preference `toCreateBody` files them in. */
function hoursOf(form: ListingForm): { from: string; to: string } | undefined {
    return hoursPairOf(form) ?? undefined;
}

/**
 * The apps' pair as the form holds it: one of the five windows by its key,
 * else the pair itself under `customHours` — the listing-data-gaps lot's
 * fix, since a pair none of the windows names used to answer "" and was
 * dropped on its way to the create.
 */
export function hoursFrom(value: unknown): Pick<ListingForm, "visibilityWindow" | "customHours"> {
    if (typeof value === "string") return { visibilityWindow: VISIBILITY_WINDOWS.some((w) => w.key === value) ? value : "", customHours: null };
    const pair = value as { from?: unknown; to?: unknown } | null | undefined;
    const from = pair ? asString(pair.from).trim() : "";
    const to = pair ? asString(pair.to).trim() : "";
    const key = visibilityWindowOf(from, to);
    return key ? { visibilityWindow: key, customHours: null } : { visibilityWindow: "", customHours: from && to ? { from, to } : null };
}

/** The papers on the form as the apps file them: one row per kind, from the site's slot keys and the `kind:` keys the flow adds. */
export function documentRowsOf(form: ListingForm): { kind: string; url: string }[] {
    const slots = documentSlotsFor(form.category);
    const rows: { kind: string; url: string }[] = [];
    for (const [key, answer] of Object.entries(form.documents)) {
        if (!answer || !("url" in answer) || !answer.url) continue;
        const kind = key.startsWith("kind:") ? key.split(":")[1] : slots.find((s) => s.key === key)?.kind;
        if (kind) rows.push({ kind, url: answer.url });
    }
    return rows;
}

/**
 * Where a paper of this kind lives on the form: the site's own slot for the
 * category when one of that kind is still free (so a draft resumed under
 * the baked steps finds it), else a `kind:<KIND>` key the submit files by
 * its kind.
 */
export function documentKeyFor(category: ListingCategory | null, kind: string, used: ReadonlySet<string>): string {
    const slot = documentSlotsFor(category).find((s) => s.kind === kind && !used.has(s.key));
    if (slot) return slot.key;
    let key = `kind:${kind}`;
    for (let n = 2; used.has(key); n += 1) key = `kind:${kind}:${n}`;
    return key;
}

function documentsFromRows(category: ListingCategory | null, value: unknown): ListingForm["documents"] {
    const documents: ListingForm["documents"] = {};
    if (!Array.isArray(value)) return documents;
    const used = new Set<string>();
    for (const row of value as { kind?: unknown; url?: unknown }[]) {
        if (!row || typeof row.kind !== "string" || typeof row.url !== "string" || !row.url.trim()) continue;
        const key = documentKeyFor(category, row.kind, used);
        used.add(key);
        documents[key] = { url: row.url, name: fileNameOf(row.url) };
    }
    return documents;
}

type TextKey = { [K in keyof ListingForm]: ListingForm[K] extends string ? K : never }[keyof ListingForm];
type AudienceKey = keyof ListingForm["audience"];
type EvidenceKey = keyof ListingForm["audienceDocs"];
type PhotoKey = keyof ListingForm["photos"];

const text = (key: TextKey): FieldBinding => ({ key, read: (form) => form[key], write: (_form, value) => ({ [key]: asString(value) }) as Partial<ListingForm> });
const flag = (key: "installationByAdx"): FieldBinding => ({ key, read: (form) => form[key], write: (_form, value) => ({ [key]: value === true }) });
const audience = (key: AudienceKey): FieldBinding => ({ key: `audience.${key}`, read: (form) => form.audience[key], write: (form, value) => ({ audience: { ...form.audience, [key]: asString(value) } }) });
const evidence = (key: EvidenceKey): FieldBinding => ({ key: `audienceDocs.${key}`, read: (form) => form.audienceDocs[key]?.url ?? null, write: (form, value) => ({ audienceDocs: { ...form.audienceDocs, [key]: asFile(value) } }) });
const photo = (key: PhotoKey): FieldBinding => ({
    key: `photos.${key}`,
    read: (form) => form.photos[key]?.url ?? null,
    // The same photograph back keeps its upload row and moment; a new one carries its own.
    write: (form, value) => {
        const next = asFile(value);
        const kept = form.photos[key];
        const same = !!next && !!kept && kept.url === next.url && !next.fileId && !next.takenAt;
        return { photos: { ...form.photos, [key]: same ? { ...kept, name: next.name } : next } };
    },
});
type WholeKey = "estimatedDailyFootfall" | "widthPx" | "heightPx";
const whole = (key: WholeKey): FieldBinding => ({ key, read: (form) => form[key], write: (_form, value) => ({ [key]: digitsOnly(asString(value)) }) as Partial<ListingForm> });

/**
 * The mapping table: flow field id (the apps' `fields.tsx` id) → form-model
 * key. The first block is the ids the flow asked before LF-2; the second is
 * the frames' questions the flow asks again since LF-2 (installation, the
 * vehicle model, the outlet, the audience evidence, the booking terms, the
 * rate card's validity), filed where the site's own steps file them.
 */
export const FIELD_BINDINGS: Record<string, FieldBinding> = {
    category: {
        key: "category",
        read: (form) => (form.category ? form.category.toLowerCase() : null),
        write: (form, value) => {
            const upper = asString(value).toUpperCase();
            const category = CATEGORIES.includes(upper as ListingCategory) ? (upper as ListingCategory) : null;
            // The site's rule (steps-choose): a new category invalidates the venue, the format, the material and the loop.
            return category === form.category ? {} : { category, venueTypeId: null, mediaTypeId: null, materialId: null, slotsTotal: 1 };
        },
    },
    venue_type_id: {
        key: "venueTypeId",
        read: (form) => form.venueTypeId,
        write: (form, value) => {
            const id = asString(value) || null;
            return id === form.venueTypeId ? {} : { venueTypeId: id, mediaTypeId: null, materialId: null, placement: "" };
        },
    },
    media_type_id: {
        key: "mediaTypeId",
        read: (form) => form.mediaTypeId,
        write: (form, value) => {
            const id = asString(value) || null;
            return id === form.mediaTypeId ? {} : { mediaTypeId: id, materialId: null, slotsTotal: 1 };
        },
    },
    material_id: { key: "materialId", read: (form) => form.materialId, write: (_form, value) => ({ materialId: asString(value) || null }) },
    title: text("title"),
    placement: text("placement"),
    address: text("address"),
    city: text("city"),
    /* The pin with its GPS accuracy when it has one (`accuracyM`, as the apps keep it). */
    location: { key: "location", read: (form) => form.location, write: (_form, value) => ({ location: pointFromAnswer(value) }) },
    width_ft: text("widthFt"),
    height_ft: text("heightFt"),
    illumination: text("illumination"),
    facing: text("facing"),
    vehicle_number: text("vehicleNumber"),
    description: text("description"),
    target_audience: text("targetAudience"),
    unique_selling_point: text("uniqueSellingPoint"),
    footfall_note: text("footfallNote"),
    [CONTENT_RULES_FIELD]: { key: "contentRules", read: (form) => contentRulesOf(form), write: (_form, value) => ({ contentRules: rulesRecord(value) }) },
    pricing_unit: { key: "pricingUnit", read: (form) => form.pricingUnit, write: (_form, value) => ({ pricingUnit: (PRICING_UNIT_IDS.includes(asString(value)) ? asString(value) : "") as PricingUnit | "" }) },
    [PRICE_FIELD]: { key: "basePrice", read: (form) => form.basePrice, write: (_form, value) => ({ basePrice: asString(value).replace(/[^\d.]/g, "") }) },
    min_booking_days: { key: "minBookingDays", read: (form) => form.minBookingDays, write: (_form, value) => ({ minBookingDays: asString(value).replace(/\D/g, "") }) },
    [AVAILABILITY_FIELD]: text("availableFrom"),
    available_hours: { key: "visibilityWindow", read: (form) => hoursOf(form), write: (_form, value) => hoursFrom(value) },
    peak_period_note: text("peakPeriodNote"),
    rate_card: { key: "rateCard", read: (form) => form.rateCard?.url ?? null, write: (_form, value) => ({ rateCard: asFile(value) }) },
    [INSTANT_BOOKING_FIELD]: { key: "instantBooking", read: (form) => form.instantBooking, write: (_form, value) => ({ instantBooking: value === true }) },
    [SLOTS_FIELD]: { key: "slotsTotal", read: (form) => form.slotsTotal, write: (_form, value) => ({ slotsTotal: clampSlots(value) }) },
    rights_basis: {
        key: "rightsBasis",
        read: (form) => form.rightsBasis,
        write: (_form, value) => {
            const basis = (RIGHTS_IDS.includes(asString(value)) ? asString(value) : "") as RightsBasis | "";
            // The site's rule (steps-review): "I own the venue" is OWNED, and an owned space has no date it runs out.
            return { rightsBasis: basis, ownVenue: basis === "OWNED", ...(basis === "OWNED" ? { rightsValidUntil: "" } : {}) };
        },
    },
    rights_valid_until: text("rightsValidUntil"),
    documents: { key: "documents", read: (form) => documentRowsOf(form), write: (form, value) => ({ documents: documentsFromRows(form.category, value) }) },
    main_photo: photo("front"),
    /* LF-2: the review's "3 to 5 angles" — front (the main photo), left, right and wide, filed as FRONT / LEFT / RIGHT / WIDE. */
    left_photo: photo("left"),
    right_photo: photo("right"),
    wide_photo: photo("wide"),

    /*
     * The frames' questions the flow took back in LF-2 (28 Sep 2026) — every
     * one now a column (`toCreateBody`) or, for the two reports, a paper
     * (`documentPostsOf`). `operating_hours` and `coverage` stay the site's
     * own: the hours fall back to `availableHours*`, the coverage is the city.
     */
    installation_by_adx: flag("installationByAdx"),
    vehicle_model: text("vehicleModel"),
    operating_hours: text("operatingHours"),
    broadcast_language: text("broadcastLanguage"),
    content_format: text("contentFormat"),
    /* Its own column since the listing-data-gaps lot — no longer written into the city. */
    coverage: { key: "coverage", read: (form) => form.coverage, write: (_form, value) => ({ coverage: asString(value) }) },
    slot_duration: text("slotDuration"),
    age_band: audience("ageBand"),
    gender_split: audience("genderSplit"),
    urban_rural: audience("urbanRural"),
    sec_profile: audience("secProfile"),
    income_bracket: audience("incomeBracket"),
    occupation: audience("occupation"),
    barc_report: evidence("barc"),
    footfall_report: evidence("footfall"),
    available_year_round: { key: "availableYearRound", read: (form) => form.availableYearRound, write: (_form, value) => ({ availableYearRound: value === "yes" || value === true ? "yes" : value === "no" || value === false ? "no" : "" }) },
    max_booking_days: text("maxBookingDays"),
    advance_booking_days: text("advanceBookingDays"),
    cancellation_notice: text("cancellationNotice"),
    rate_card_valid_from: text("rateCardValidFrom"),
    rate_card_valid_to: text("rateCardValidTo"),
    rate_card_seasonal: text("rateCardSeasonal"),

    /*
     * The listing-data-gaps lot (3 Oct 2026): the site questions, by the ids
     * `listing-site-questions.ts` names (the apps' `SITE_FIELD`). The selects
     * hold codes; the whole numbers keep digits only; the switch is a
     * yes/no that opens on yes.
     */
    [SITE_FIELD.footfall]: whole("estimatedDailyFootfall"),
    [SITE_FIELD.traffic]: text("trafficGrade"),
    [SITE_FIELD.visibility]: text("visibility"),
    [SITE_FIELD.elevation]: text("elevation"),
    [SITE_FIELD.widthPx]: whole("widthPx"),
    [SITE_FIELD.heightPx]: whole("heightPx"),
    [SITE_FIELD.vehicleType]: text("vehicleType"),
    [SITE_FIELD.availableNow]: { key: "availableNow", read: (form) => form.availableNow, write: (_form, value) => ({ availableNow: !(value === false || value === "no") }) },
    /* A photograph's upload row and moment, by URL — the apps keep them beside the photo answers; written after the photographs. */
    [PHOTO_META_FIELD]: { key: "photos", read: (form) => photoMetaOf(form.photos), write: (form, value) => ({ photos: withPhotoMeta(form.photos, value) }) },
};

/** A question the listing has no column for: the answer lives under `extra`, a stored file as its url in the apps' shape. */
export function extraBinding(id: string): FieldBinding {
    return {
        key: `extra.${id}`,
        read: (form) => {
            const value = form.extra[id];
            return value && typeof value === "object" && typeof (value as StoredFile).url === "string" ? (value as StoredFile).url : value;
        },
        write: (form, value) => ({ extra: { ...form.extra, [id]: value } }),
    };
}

/** The answer id a field writes: its own, except the two content fields, which share `content_rules`. */
export const answerIdOf = (fieldId: string): string => ALIASES[fieldId] ?? fieldId;

export const isBound = (fieldId: string): boolean => answerIdOf(fieldId) in FIELD_BINDINGS;

export function bindingFor(fieldId: string): FieldBinding {
    return FIELD_BINDINGS[answerIdOf(fieldId)] ?? extraBinding(fieldId);
}

export const readAnswer = (form: ListingForm, fieldId: string): unknown => bindingFor(fieldId).read(form);

/** The form's own slot for each bound file answer — read whole, so a file keeps the name it was uploaded under. */
const FILE_SLOTS: Record<string, (form: ListingForm) => StoredFile | null> = {
    main_photo: (form) => form.photos.front,
    left_photo: (form) => form.photos.left,
    right_photo: (form) => form.photos.right,
    wide_photo: (form) => form.photos.wide,
    rate_card: (form) => form.rateCard,
    barc_report: (form) => form.audienceDocs.barc,
    footfall_report: (form) => form.audienceDocs.footfall,
};

/**
 * A file or image field's answer as a stored file: from the form key its
 * binding writes (so an upload lands where `toCreateBody` and the papers
 * read it), else off the answer itself. Written back through `writeAnswer`.
 */
export function fileAnswerOf(form: ListingForm, fieldId: string): StoredFile | null {
    const slot = Object.prototype.hasOwnProperty.call(FILE_SLOTS, fieldId) ? FILE_SLOTS[fieldId] : undefined;
    if (slot) return slot(form);
    return isBound(fieldId) ? asFile(readAnswer(form, fieldId)) : asFile(form.extra[fieldId]);
}

export const writeAnswer = (form: ListingForm, fieldId: string, value: unknown): Partial<ListingForm> => bindingFor(fieldId).write(form, value);

/* ── The answers, in the apps' shape ───────────────────────────────────── */

/** Kinds that draw a heading or a derived value and collect nothing. */
export const collects = (field: Pick<FlowField, "type">): boolean => field.type !== "section" && field.type !== "computed";

/** Every kind the site has a designed control for — the apps' twenty-three. A newer kind is skipped with a warning. */
export const DRAWABLE_KINDS: ReadonlySet<string> = new Set<string>(FLOW_FIELD_KINDS);

export function isBlank(value: unknown): boolean {
    if (value === undefined || value === null) return true;
    if (typeof value === "string") return value.trim() === "";
    if (Array.isArray(value)) return value.length === 0;
    return false;
}

/** The form as the apps' `values` bag: one entry per answered flow field (every branch's), plus the app-drawn extras. */
export function flowAnswersOf(form: ListingForm, flow: WizardFlow): Record<string, unknown> {
    const answers: Record<string, unknown> = {};
    for (const field of fieldsOf(flow)) {
        if (!collects(field)) continue;
        const id = answerIdOf(field.id);
        if (id in answers) continue;
        const value = bindingFor(field.id).read(form);
        if (!isBlank(value)) answers[id] = value;
    }
    for (const id of [INSTANT_BOOKING_FIELD, SLOTS_FIELD, PHOTO_META_FIELD]) {
        const value = FIELD_BINDINGS[id]!.read(form);
        if (!isBlank(value)) answers[id] = value;
    }
    return answers;
}

/**
 * The answers the screens in play asked for — the apps' `answersInPlay`,
 * so a branch the publisher walked away from is not filed: `content_rules`
 * while a stance field is asked, the switch while `available_from` is, the
 * loop while `base_price` is, a paper only while its kind is offered.
 */
export function answersInPlay(values: Record<string, unknown>, screens: FlowScreen[]): Record<string, unknown> {
    const fields = new Map<string, FlowField>();
    for (const screen of screens) for (const field of screen.fields) fields.set(field.id, field);
    const rulesAsked = [...fields.values()].some((f) => f.type === "content-stance" || f.type === "content-prohibited");
    const kept: Record<string, unknown> = {};
    for (const [id, value] of Object.entries(values)) {
        if (id === CONTENT_RULES_FIELD) {
            if (rulesAsked) kept[id] = value;
            continue;
        }
        if (id === INSTANT_BOOKING_FIELD) {
            if (fields.has(AVAILABILITY_FIELD)) kept[id] = value;
            continue;
        }
        if (id === SLOTS_FIELD) {
            if (fields.has(PRICE_FIELD)) kept[id] = value;
            continue;
        }
        if (id === PHOTO_META_FIELD) {
            // The photographs' rows ride while any photograph is asked; the write puts each back on its own URL.
            if ([...fields.values()].some((f) => f.type === "image-upload")) kept[id] = value;
            continue;
        }
        const field = fields.get(id);
        if (!field) continue;
        kept[id] = field.type === "document-upload" && Array.isArray(value) ? value.filter((row) => row && typeof row === "object" && (field.options ?? []).some((o) => o.id === (row as { kind?: unknown }).kind)) : value;
    }
    return kept;
}

/** Applied first, in this order, because a category clears the venue and a venue the format (the site's own rules); `rights_basis` last, since OWNED clears the date, and the photographs' rows after the photographs. */
const WRITE_FIRST = ["category", "venue_type_id", "media_type_id", "material_id"];
const WRITE_LAST = ["rights_basis", PHOTO_META_FIELD];

/** A form from answers in the apps' shape — a phone draft, or the site's own answers on their way back. */
export function formFromFlowAnswers(answers: Record<string, unknown>): ListingForm {
    let form = emptyForm();
    const ids = Object.keys(answers).filter((id) => id !== "web");
    const ordered = [...WRITE_FIRST.filter((id) => ids.includes(id)), ...ids.filter((id) => !WRITE_FIRST.includes(id) && !WRITE_LAST.includes(id)), ...WRITE_LAST.filter((id) => ids.includes(id))];
    for (const id of ordered) form = { ...form, ...bindingFor(id).write(form, answers[id]) };
    return form;
}

/** The branch a category walks: the branching option's id is the category, lower-cased. */
export const branchIdOf = (category: ListingCategory | null): string | null => (category ? category.toLowerCase() : null);

/** The screens this form passes through: the root, then the chosen category's branch. */
export const flowScreens = (flow: WizardFlow, form: Pick<ListingForm, "category">): FlowScreen[] => screensFor(flow, branchIdOf(form.category));

/**
 * The form as the flow files it: only the answers the screens in play asked
 * for, written back through the bindings. `toCreateBody(formInPlay(form,
 * flow))` is the body the flow-driven wizard sends; the papers it files are
 * `formInPlay(...).documents`.
 */
export function formInPlay(form: ListingForm, flow: WizardFlow): ListingForm {
    return formFromFlowAnswers(answersInPlay(flowAnswersOf(form, flow), flowScreens(flow, form)));
}

/* ── Every other answer (listing-data-gaps lot) ────────────────────────── */

/**
 * Every answer in play that no column takes, as `[{ key, label, value }]`
 * — the field's id, the words it was asked in, and the answer as given (a
 * file as its URL). The review's tick is not one: it is `termsAcceptedAt`.
 * Filed as `extraAnswers`, so a question the console adds in the Flow
 * Editor is never thrown away again.
 */
export function extraAnswersOf(form: ListingForm, flow: WizardFlow): ExtraAnswer[] {
    const out: ExtraAnswer[] = [];
    const seen = new Set<string>();
    for (const screen of flowScreens(flow, form)) {
        for (const field of screen.fields) {
            if (seen.has(field.id) || !collects(field) || field.id === TERMS_FIELD || isBound(field.id)) continue;
            seen.add(field.id);
            const value = readAnswer(form, field.id);
            if (isBlank(value)) continue;
            out.push({ key: field.id, label: field.label, value: typeof value === "string" ? value.trim() : value });
        }
    }
    return out;
}

/**
 * Whether a field is asked of this spot: every field the flow puts on a
 * screen, except a site question the spot is not asked (`siteFieldApplies`
 * — footfall, how busy and how far for a fixed spot, how high outdoors,
 * pixels for a screen, the vehicle for transit). The apps' `applies`.
 */
export const fieldAsked = (field: Pick<FlowField, "id">, form: Pick<ListingForm, "category" | "mediaTypeId" | "illumination">, catalogue: Catalogue | null): boolean => siteAsks(field.id, form, catalogue);

/* ── What a screen still needs ─────────────────────────────────────────── */

/** "Width (ft)" → { label: "Width", suffix: "ft" }: the unit goes in the box's suffix, as the frames draw it. */
export function splitUnit(label: string): { label: string; suffix: string | null } {
    const match = /^(.*?)\s*\((ft|px|days|day|rs\.?|₹|inr|sq\.? ?ft|%)\)\s*$/i.exec(label);
    if (!match) return { label, suffix: null };
    const unit = match[2]!.toLowerCase();
    return { label: match[1]!.trim() || label, suffix: unit === "rs" || unit === "rs." || unit === "inr" ? "₹" : unit === "day" ? "days" : /^sq/.test(unit) ? "sq.ft" : unit };
}

export const labelOf = (field: Pick<FlowField, "label">): string => splitUnit(field.label).label;

/**
 * The required flow fields on a screen with nothing in them, in the words
 * of their labels, plus the two rules the server enforces on the price
 * (the site's own `missingOn("pricing")`). A required venue or format with
 * nothing to offer does not block — the site's grace, kept.
 */
export function flowMissingOn(screen: FlowScreen, form: ListingForm, catalogue: Catalogue | null): string[] {
    const missing = new Set<string>();
    for (const field of screen.fields) {
        if (!field.required || !collects(field) || !DRAWABLE_KINDS.has(field.type) || !fieldAsked(field, form, catalogue)) continue;
        if (field.type === "venue-type" && offeredVenues(catalogue?.venues ?? [], form.category).length === 0) continue;
        if (field.type === "media-type" && offeredMediaTypes(catalogue?.mediaTypes ?? [], form.venueTypeId, form.category).length === 0) continue;
        const value = bindingFor(field.id).read(form);
        const unanswered = field.type === "checkbox" ? value !== true : isBlank(value);
        if (unanswered) missing.add(labelOf(field));
    }
    const price = screen.fields.find((f) => f.id === PRICE_FIELD);
    if (price) {
        if (!/^\d+(\.\d{1,2})?$/.test(form.basePrice.trim()) || Number(form.basePrice) <= 0) missing.add(labelOf(price));
        if ((form.pricingUnit === "PER_SQFT_PER_DAY" || form.pricingUnit === "PER_SQFT_PER_MONTH") && !areaSqFt(form.widthFt, form.heightFt)) missing.add("Width and height (for a per sq.ft rate)");
    }
    return [...missing];
}

/** Every screen's gaps at once — what blocks the submit. */
export function flowGaps(flow: WizardFlow, form: ListingForm, catalogue: Catalogue | null): { screen: FlowScreen; fields: string[] }[] {
    return flowScreens(flow, form)
        .map((screen) => ({ screen, fields: flowMissingOn(screen, form, catalogue) }))
        .filter((row) => row.fields.length > 0);
}

/* ── Where a screen sits ───────────────────────────────────────────────── */

const CHAPTER_WORDS: [RegExp, number][] = [
    [/categor|venue|spot-type|format|medium/, 1],
    [/detail|more-info|description|audience|outlet|vehicle/, 2],
    [/rule|pric|terms|rate|avail/, 3],
    [/document|review|verify|proof|submit/, 4],
];

/** The frames' four chapters over the flow's screens: by the screen's key, else by where it falls in the sequence. */
export function chapterOfScreen(key: string, index: number, count: number): number {
    const match = CHAPTER_WORDS.find(([words]) => words.test(key.toLowerCase()));
    if (match) return match[1];
    return Math.min(4, Math.max(1, Math.floor((index / Math.max(count, 1)) * 4) + 1));
}

/** The screen that asks a field, by id. */
export const screenAsking = (screens: FlowScreen[], fieldId: string): FlowScreen | null => screens.find((s) => s.fields.some((f) => f.id === fieldId)) ?? null;

const BAKED_STEP_FIELDS: Record<StepKey, string[]> = {
    category: ["category"],
    venue: ["venue_type_id"],
    format: ["media_type_id"],
    details: ["title", "address", "location"],
    description: ["description", "target_audience"],
    audience: ["age_band", "barc_report", "description"],
    terms: ["available_year_round", "available_from", "available_hours"],
    pricing: ["base_price", "pricing_unit"],
    ratecard: ["rate_card", "base_price"],
    rules: ["restricted_categories", "prohibited_content"],
    review: [],
    verify: ["main_photo", "documents"],
    documents: ["documents", "rights_basis"],
};

/** A baked step's screen on the flow — an old link, or the review's Edit buttons — by the field it asked; the review is the last screen. */
export function screenForBakedStep(step: StepKey, screens: FlowScreen[]): FlowScreen | null {
    if (step === "review") return screens[screens.length - 1] ?? null;
    for (const id of BAKED_STEP_FIELDS[step]) {
        const screen = screenAsking(screens, id);
        if (screen) return screen;
    }
    return null;
}

/** The screen `?step=` names: a flow key as it is, a baked key by its field, anything else the first screen. */
export function resolveScreenKey(param: string | null | undefined, screens: FlowScreen[]): string {
    if (param && screens.some((s) => s.key === param)) return param;
    if (isStepKey(param)) {
        const screen = screenForBakedStep(param, screens);
        if (screen) return screen.key;
    }
    return screens[0]?.key ?? "";
}

/** Two short controls side by side, as the frames pair Width | Height, Illumination | Facing, Min. booking | Available from. */
const PAIRABLE = new Set(["number", "date", "select"]);
export const pairable = (a: FlowField, b: FlowField | undefined): boolean => !!b && PAIRABLE.has(a.type) && PAIRABLE.has(b.type);

/** A screen that is only choices — category, venue, format — where the "still needed" line would state the obvious. */
export const isChoiceScreen = (screen: FlowScreen): boolean => screen.fields.every((f) => ["section", "selectable-cards", "venue-type", "media-type", "material"].includes(f.type));

/** Whether the spot type chosen names a screen — the server's own rule, so the loop is asked exactly where the API takes it. */
export const isDigital = (mediaType: Pick<MediaType, "name" | "formatGroup"> | null | undefined): boolean => isDigitalMediaType(mediaType);

/** A computed field's value — "area = width × height", the one op the apps know. */
export function computedOf(field: FlowField, form: ListingForm): string | null {
    if (field.op !== "multiply" || !field.from || field.from.length < 2) return null;
    return areaSqFt(asString(readAnswer(form, field.from[0]!)), asString(readAnswer(form, field.from[1]!)));
}

/** A section's heading: the answer `from` names (a format's short name for `media_type_id`), else its label. */
export function sectionText(field: FlowField, form: ListingForm, catalogue: Catalogue | null): string {
    const source = field.from?.[0];
    if (!source) return field.label;
    if (source === "media_type_id") {
        const type = catalogue?.mediaTypes.find((m) => m.id === form.mediaTypeId);
        return type ? shortName(type.name) : field.label;
    }
    const value = readAnswer(form, source);
    return typeof value === "string" && value.trim() ? value.trim() : field.label;
}

/* ── Drafts ────────────────────────────────────────────────────────────── */

/**
 * The draft the flow-driven wizard saves: the apps' answers beside the
 * site's own form, so a spot started here resumes on the phone at the same
 * screen, and `formFromDraft` still finds `web`.
 */
export function toFlowDraftInput(form: ListingForm, flow: WizardFlow, screenKey: string): ListingDraftInput {
    const screens = flowScreens(flow, form);
    const index = Math.max(0, screens.findIndex((s) => s.key === screenKey));
    return {
        category: form.category ? form.category.toLowerCase() : null,
        title: form.title.trim() || null,
        stepIndex: index,
        stepKey: screenKey,
        answers: { ...flowAnswersOf(form, flow), web: form },
    };
}
