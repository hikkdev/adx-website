"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import { areaSqFt, matchedSizeClass, offeredMediaTypes, offeredVenues, PRICING_UNITS, ratePerDayFrom, shortName, type Catalogue, type ContentStance, type DescriptionBucket } from "@/services/listing-editor";
import type { FlowField } from "@/services/flows";
import { AddressSearch, CityField } from "../address-search";
import { ChoiceList } from "../choice-list";
import { DescriptionAssist } from "../description-assist";
import { CheckRow, Field, GroupTitle, Note, SelectField, SwitchRow, TextareaField } from "../fields";
import { VISIBILITY_WINDOWS, visibilityWindowOf, type ListingForm, type StoredFile } from "../form-model";
import { PriceIndicatorLine } from "../price-indicator";
import { descriptionContextOf } from "../steps-details";
import { SlotsStepper, STANCES } from "../steps-pricing";
import { DocumentSlot, DropZone, FileRow, PhotoSlot } from "../uploads";
import { VehicleVerify } from "../vehicle-verify";
import { SITE_OPTIONS, siteOptionsFor, WHOLE_NUMBER_FIELDS } from "@/services/listing-site-questions";
import { asString, computedOf, documentKeyFor, fileAnswerOf, isDigital, readAnswer, sectionText, SLOTS_MAX, SLOTS_MIN, splitUnit, writeAnswer } from "./flow-model";

const LocationMap = dynamic(() => import("../location-map").then((m) => m.LocationMap), {
    ssr: false,
    loading: () => <div className="h-[280px] animate-pulse rounded-lg border border-line bg-[#f1f1ee]" />,
});

/**
 * FL-1 (27 Sep 2026): one designed control per flow field kind — the
 * website's answer to the apps' `fields.tsx` switch. The flow names a kind
 * and this decides what the frames' boxes make of it: the floating-label
 * Field, the chevron SelectField, the radio-card ChoiceList, the address
 * search with the map's suggestions, the OpenStreetMap pin, the dashed
 * drop zones. The look is the boards' (W5/W6); only the question comes
 * from the flow. A kind the site has no control for is skipped with one
 * warning per kind, never a crash — an older site meeting a newer console.
 */
export interface FlowFieldContext {
    form: ListingForm;
    set: (patch: Partial<ListingForm>) => void;
    catalogue: Catalogue | null;
    /** The listing once the last step has created it — the vehicle check records against it, the price compare excludes it. */
    listingId: string | null;
    /** The AI allowance's bucket, for a paragraph the flow marks `aiAssist`. */
    aiBucket: DescriptionBucket | null;
}

const warned = new Set<string>();

/** For tests: forget which kinds have been warned about. */
export function resetUnknownKindWarnings(): void {
    warned.clear();
}

function warnUnknownKind(field: FlowField): void {
    if (warned.has(field.type)) return;
    warned.add(field.type);
    console.warn(`[listing flow] The website cannot draw a "${field.type}" field yet ("${field.id}" · ${field.label}); it is skipped. Add it in the apps' fields.tsx vocabulary first.`);
}

/** The select's value for hours none of the windows name. */
const CUSTOM_HOURS = "custom";

const opts = (field: FlowField) => (field.options ?? []).map((o) => ({ value: o.id, label: o.title }));

/**
 * The stored file behind an upload field, and the patch that puts one there:
 * through the field's binding (LF-2 — the four photo angles, the rate card
 * and the two audience reports each land on the key the create body and the
 * papers read), else under `extra`.
 */
const fileOf = (form: ListingForm, id: string): StoredFile | null => fileAnswerOf(form, id);
const filePatch = (form: ListingForm, id: string, next: StoredFile | null): Partial<ListingForm> => writeAnswer(form, id, next);

export function FlowFieldView({ field, ctx }: { field: FlowField; ctx: FlowFieldContext }) {
    const { form, set, catalogue } = ctx;
    const value = readAnswer(form, field.id);
    const write = (next: unknown) => set(writeAnswer(form, field.id, next));
    const { label, suffix } = splitUnit(field.label);

    switch (field.type) {
        case "selectable-cards":
            return <ChoiceList options={(field.options ?? []).map((o) => ({ id: o.id, title: o.title, description: o.description ?? null }))} value={asString(value) || null} onChange={write} forceSearch={false} />;

        case "venue-type": {
            const venues = offeredVenues(catalogue?.venues ?? [], field.filterByCategory === false ? null : form.category);
            const media = form.category === "MEDIA";
            return (
                <div className="space-y-6">
                    <ChoiceList
                        options={venues.map((v) => ({ id: v.id, title: v.name, description: v.description ?? (v.subVenues.length ? v.subVenues.slice(0, 3).join(", ") : null) }))}
                        value={form.venueTypeId}
                        onChange={write}
                        searchPlaceholder={field.placeholder ?? (media ? "Search media outlets" : "Search venue type")}
                        emptyLabel={form.category === "OUTDOOR" ? "A roadside spot needs no venue — continue to the format." : "No venues are set up for this category yet. Ask ADX to add one, or pick a different category."}
                    />
                    {form.category === "OUTDOOR" && venues.length > 0 && <Note>A hoarding on a road belongs to no venue — you can continue without choosing one.</Note>}
                </div>
            );
        }

        case "media-type": {
            const offered = offeredMediaTypes(catalogue?.mediaTypes ?? [], form.venueTypeId, form.category);
            const groups = new Set(offered.map((m) => m.formatGroup ?? ""));
            const grouped = !!field.groupBy && groups.size > 1;
            return (
                <ChoiceList
                    options={offered.map((m) => ({ id: m.id, title: shortName(m.name), description: m.description, group: grouped ? (m.formatGroup ?? "Other formats") : null }))}
                    value={form.mediaTypeId}
                    onChange={write}
                    searchPlaceholder={field.placeholder ?? "Search ad spot type"}
                    emptyLabel="No spot types are listed for this venue yet. Ask ADX to add one, or pick a different venue."
                />
            );
        }

        case "material": {
            const mediaType = catalogue?.mediaTypes.find((m) => m.id === form.mediaTypeId);
            // An empty list on the type means unconstrained, not none (the apps' rule).
            const offered = mediaType && mediaType.materialIds.length > 0 ? (catalogue?.materials ?? []).filter((m) => mediaType.materialIds.includes(m.id)) : (catalogue?.materials ?? []);
            return <SelectField label={label} value={form.materialId ?? ""} onChange={write} options={offered.map((m) => ({ value: m.id, label: m.name }))} placeholder={field.placeholder ?? "Choose"} />;
        }

        case "sub-venue": {
            const venue = catalogue?.venues.find((v) => v.id === form.venueTypeId);
            const areas = venue?.subVenues ?? [];
            // Free text when the venue names no areas: a required field with nothing in it is the alternative.
            if (areas.length === 0) return <Field label={label} value={asString(value)} onChange={write} placeholder={field.placeholder ?? "Roadside · Main road facing"} />;
            return <SelectField label={label} value={asString(value)} onChange={write} options={areas.map((a) => ({ value: a, label: a }))} placeholder={field.placeholder ?? "Choose the area"} />;
        }

        case "section":
            return <GroupTitle>{sectionText(field, form, catalogue)}</GroupTitle>;

        case "city":
            return <CityField label={label} value={asString(value)} onChange={write} placeholder={field.placeholder ?? "Bengaluru"} />;

        case "text": {
            // QR-5: the spot's address searches the map; a media listing's "address" is a channel, not a place.
            if (field.id === "address" && form.category !== "MEDIA") {
                return (
                    <AddressSearch
                        label={label}
                        value={form.address}
                        onChange={write}
                        onPlace={(place) => set({ location: { latitude: place.latitude, longitude: place.longitude }, ...(place.city && !form.city ? { city: place.city } : {}) })}
                        placeholder={field.placeholder ?? "Street, area, landmark"}
                        near={form.location}
                        chevron={form.category === "TRANSIT"}
                    />
                );
            }
            if (field.id === "vehicle_number") {
                // VH-3: the Verify button under the registration, on whichever screen the flow asks for one.
                return (
                    <div className="space-y-2.5">
                        <Field label={label} value={asString(value)} onChange={write} placeholder={field.placeholder ?? "KA 01 AB 1234"} />
                        <VehicleVerify value={asString(value)} listingId={ctx.listingId} />
                    </div>
                );
            }
            return <Field label={label} value={asString(value)} onChange={write} placeholder={field.placeholder} />;
        }

        case "textarea":
            return (
                <div className="mb-6">
                    <TextareaField boxed label={label} value={asString(value)} onChange={write} placeholder={field.placeholder} rows={8} />
                    {field.aiAssist && ctx.aiBucket && <DescriptionAssist bucket={ctx.aiBucket} current={asString(value)} context={descriptionContextOf(form, catalogue)} onDrafted={write} />}
                </div>
            );

        case "number":
            // The listing-data-gaps lot: a count (footfall, pixels) is a whole number — digits only, on the number pad.
            if (WHOLE_NUMBER_FIELDS.has(field.id)) return <Field label={label} value={asString(value)} onChange={(next) => write(next.replace(/\D/g, ""))} placeholder={field.placeholder} suffix={suffix ?? undefined} inputMode="numeric" />;
            return <Field label={label} value={asString(value)} onChange={(next) => write(next.replace(/[^\d.]/g, ""))} placeholder={field.placeholder} suffix={suffix ?? undefined} inputMode="decimal" />;

        case "computed": {
            const computed = computedOf(field, form);
            return <Field label={label} value={computed ? `${computed} ${suffix ?? "sq.ft"}` : ""} onChange={() => undefined} placeholder={field.placeholder ?? "Enter a width and a height"} readOnly />;
        }

        case "geo-point":
            return <LocationMap point={form.location} onChange={write} />;

        case "select": {
            // A coded site question keeps words stored before the codes existed as a choice of their own, rather than showing nothing.
            const coded = SITE_OPTIONS[field.id];
            const options = coded ? siteOptionsFor(field.options?.length ? opts(field) : coded, asString(value)) : opts(field);
            return <SelectField label={label} value={asString(value)} onChange={write} options={options} placeholder={field.placeholder ?? "Choose"} />;
        }

        case "base-price": {
            const mediaType = catalogue?.mediaTypes.find((m) => m.id === form.mediaTypeId) ?? null;
            const area = areaSqFt(form.widthFt, form.heightFt);
            const sizeClass = catalogue ? matchedSizeClass(catalogue.sizeClasses, form.widthFt, form.heightFt) : null;
            const ratePerDay = form.pricingUnit ? ratePerDayFrom(form.basePrice, form.pricingUnit, area) : null;
            const perSqft = form.pricingUnit === "PER_SQFT_PER_DAY" || form.pricingUnit === "PER_SQFT_PER_MONTH";
            const blockedBy = !form.mediaTypeId ? "Choose a format first to compare prices nearby." : !form.location ? "Drop the pin on the spot to compare prices nearby." : !sizeClass && form.category !== "MEDIA" ? "ADX compares once your size is filed — it names the class when the listing is saved." : null;
            return (
                <div className="space-y-2.5">
                    <Field label={label} value={form.basePrice} onChange={write} placeholder={field.placeholder ?? "₹12,600"} inputMode="decimal" suffix={form.pricingUnit ? `₹ / ${PRICING_UNITS.find((u) => u.id === form.pricingUnit)?.per}` : "₹"} />
                    {perSqft && <Note className="text-xs">{area ? `${area} sq.ft measured, so this is ${ratePerDay ? `₹${Math.round(Number(ratePerDay)).toLocaleString("en-IN")} a day for the whole face` : "worked out from the area"}.` : "A per sq.ft rate needs the width and height from the details step."}</Note>}
                    {field.showIndicator && <PriceIndicatorLine venueTypeId={form.venueTypeId} mediaTypeId={form.mediaTypeId} sizeClassId={sizeClass?.id ?? null} latitude={form.location?.latitude ?? null} longitude={form.location?.longitude ?? null} city={form.city || null} ratePerDay={ratePerDay} excludeListingId={ctx.listingId ?? undefined} blockedBy={blockedBy} />}
                    {/* Lot G (Q116/136): the loop, only once the spot type chosen names a screen. */}
                    {isDigital(mediaType) && <SlotsStepper value={Math.min(SLOTS_MAX, Math.max(SLOTS_MIN, form.slotsTotal))} onChange={(slotsTotal) => set({ slotsTotal })} />}
                </div>
            );
        }

        case "date":
            return <Field label={label} type="date" value={asString(value)} onChange={write} />;

        case "time-range": {
            // The site's control for the apps' from–to pair: the five visibility windows the frames offer.
            // Hours none of the five windows name (a phone's own pair) are offered as they are, so they are seen and kept.
            const pair = value as { from?: unknown; to?: unknown } | string | undefined;
            const custom = pair && typeof pair === "object" && asString(pair.from) && asString(pair.to) && !visibilityWindowOf(asString(pair.from), asString(pair.to)) ? { from: asString(pair.from), to: asString(pair.to) } : null;
            const key = typeof pair === "string" ? pair : custom ? CUSTOM_HOURS : pair ? visibilityWindowOf(asString(pair.from), asString(pair.to)) : "";
            return (
                <SelectField
                    label={label}
                    value={key}
                    onChange={(next) => {
                        if (next === CUSTOM_HOURS) return;
                        const window = VISIBILITY_WINDOWS.find((w) => w.key === next);
                        write(window ? { from: window.from, to: window.to } : undefined);
                    }}
                    options={[...VISIBILITY_WINDOWS.map((w) => ({ value: w.key, label: w.label })), ...(custom ? [{ value: CUSTOM_HOURS, label: `${custom.from} – ${custom.to}` }] : [])]}
                    placeholder={field.placeholder ?? "Choose"}
                />
            );
        }

        case "content-stance": {
            const restricted = (catalogue?.contentCategories ?? []).filter((c) => !c.isSensitive);
            return (
                <div className="space-y-2.5">
                    <GroupTitle>{label}</GroupTitle>
                    {restricted.length === 0 && <Note>No content categories are set up yet — ADX adds them from the console.</Note>}
                    {restricted.map((c) => (
                        <SelectField key={c.id} label={c.name} value={form.contentRules[c.id] ?? ""} onChange={(stance) => writeRule(form, set, c.id, stance as ContentStance | "")} options={STANCES} placeholder="Accepted" />
                    ))}
                </div>
            );
        }

        case "content-prohibited": {
            const prohibited = (catalogue?.contentCategories ?? []).filter((c) => c.isSensitive);
            return (
                <div className="border-t border-line pt-4">
                    <GroupTitle>{label}</GroupTitle>
                    <div className="mt-3 space-y-3">
                        {prohibited.map((c) => (
                            <CheckRow key={c.id} checked={form.contentRules[c.id] === "PROHIBITED"} onChange={(on) => writeRule(form, set, c.id, on ? "PROHIBITED" : "")} label={c.name} />
                        ))}
                    </div>
                </div>
            );
        }

        case "image-upload":
            return <PhotoSlot label={label} file={fileOf(form, field.id)} onChange={(next) => set(filePatch(form, field.id, next))} title="Add a photo" hint={field.placeholder ?? "JPG or PNG · Clear, full-size photo"} />;

        case "file-upload": {
            const file = fileOf(form, field.id);
            return file ? (
                <FileRow file={file} status={{ label: "On file", tone: "success" }} onRemove={() => set(filePatch(form, field.id, null))} />
            ) : (
                <DropZone title={field.placeholder ?? `Drop ${label.toLowerCase().replace(/^upload\s+/, "")} here or browse`} caption="PDF or image · Max 20 MB · 1 file" accept="application/pdf,image/*,.xls,.xlsx,.csv" purpose={field.id === "rate_card" ? "OTHER" : "VERIFICATION"} onStored={(next) => set(filePatch(form, field.id, next))} className="min-h-[176px]" />
            );
        }

        case "document-upload": {
            const used = new Set<string>();
            return (
                <div className="space-y-6">
                    {(field.options ?? []).map((option) => {
                        const key = documentKeyFor(form.category, option.id, used);
                        used.add(key);
                        const answer = form.documents[key];
                        return <DocumentSlot key={key} title={option.title} description={option.description ?? ""} file={answer && "url" in answer ? answer : null} onChange={(next) => set({ documents: { ...form.documents, [key]: next } })} />;
                    })}
                </div>
            );
        }

        case "checkbox":
            return <CheckRow checked={value === true} onChange={write} label={label} description={field.description} />;

        case "switch":
            return <SwitchRow label={label} description={field.description} checked={value === true} onChange={write} />;

        default:
            warnUnknownKind(field);
            return null;
    }
}

/** Both content fields write into the one `contentRules` record, as the apps write one array. */
function writeRule(form: ListingForm, set: (patch: Partial<ListingForm>) => void, id: string, stance: ContentStance | "") {
    const next = { ...form.contentRules };
    if (stance) next[id] = stance;
    else delete next[id];
    set({ contentRules: next });
}
