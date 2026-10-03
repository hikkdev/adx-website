"use client";

import * as React from "react";
import { areaSqFt, isDigitalMediaType, matchedSizeClass, PRICING_UNITS, ratePerDayFrom, type ContentStance } from "@/services/listing-editor";
import { SITE_LABEL } from "@/services/listing-site-questions";
import { CheckRow, Field, GroupTitle, Note, Row, SectionLabel, SelectField, SwitchRow } from "./fields";
import { InstantBookingSwitch } from "./instant-booking";
import { ADVANCE_BOOKING, BOOKING_PERIODS, CANCELLATION_NOTICE, MAX_BOOKING_PERIODS, SEASONAL_VARIATIONS, VISIBILITY_WINDOWS, type ListingForm } from "./form-model";
import { PriceIndicatorLine } from "./price-indicator";
import type { StepProps } from "./steps-choose";
import { DropZone, FileRow } from "./uploads";

const YEAR_ROUND = [
    { value: "yes", label: "Yes · available all year" },
    { value: "no", label: "No · from a date or by season" },
];

/** 15 · Availability and booking terms (5204:78822). */
export function TermsStep({ form, set }: StepProps) {
    return (
        <div className="space-y-2.5">
            <SectionLabel>Availability</SectionLabel>
            <SelectField label="Available year-round?" value={form.availableYearRound} onChange={(availableYearRound) => set({ availableYearRound: availableYearRound as ListingForm["availableYearRound"] })} options={YEAR_ROUND} placeholder="Choose" />
            <SwitchRow label={SITE_LABEL.availableNow} checked={form.availableNow} onChange={(availableNow) => set({ availableNow })} />
            <HoursSelect label="Visibility window" form={form} set={set} placeholder="Choose" />
            <InstantBookingSwitch value={form.instantBooking} onChange={(instantBooking) => set({ instantBooking })} className="mt-2" />

            <SectionLabel className="pt-5">Booking terms</SectionLabel>
            <SelectField label="Minimum booking period" value={form.minBookingDays} onChange={(minBookingDays) => set({ minBookingDays })} options={BOOKING_PERIODS} placeholder="Choose" />
            <SelectField label="Maximum booking period" value={form.maxBookingDays} onChange={(maxBookingDays) => set({ maxBookingDays })} options={MAX_BOOKING_PERIODS} placeholder="Choose" />
            <SelectField label="Advance booking required" value={form.advanceBookingDays} onChange={(advanceBookingDays) => set({ advanceBookingDays })} options={ADVANCE_BOOKING} placeholder="Choose" />

            <SectionLabel className="pt-5">Cancellation</SectionLabel>
            <SelectField label="Cancellation notice" value={form.cancellationNotice} onChange={(cancellationNotice) => set({ cancellationNotice })} options={CANCELLATION_NOTICE} placeholder="Choose" />

            <Note className="pt-2">These are your listing terms. They are saved with the listing and shown to advertisers before booking.</Note>
        </div>
    );
}

/** The select's value for hours none of the five windows name. */
const CUSTOM_HOURS = "custom";

/**
 * The five visibility windows — and, when the listing or a phone's draft
 * holds hours none of them name, those hours as a choice of their own, so
 * they are seen and kept rather than dropped (listing-data-gaps lot).
 */
function HoursSelect({ label, form, set, placeholder }: Pick<StepProps, "form" | "set"> & { label: string; placeholder: string }) {
    const custom = !form.visibilityWindow && form.customHours ? form.customHours : null;
    return (
        <SelectField
            label={label}
            value={form.visibilityWindow || (custom ? CUSTOM_HOURS : "")}
            onChange={(next) => {
                if (next === CUSTOM_HOURS) return;
                set({ visibilityWindow: next, customHours: next ? null : form.customHours });
            }}
            options={[...VISIBILITY_WINDOWS.map((w) => ({ value: w.key, label: w.label })), ...(custom ? [{ value: CUSTOM_HOURS, label: `${custom.from} – ${custom.to}` }] : [])]}
            placeholder={placeholder}
        />
    );
}

/** The loop a digital screen carries (Lot G): 1..24, stepped, under the rate. FL-1: also drawn under the flow's `base_price`. */
export function SlotsStepper({ value, onChange }: { value: number; onChange: (next: number) => void }) {
    const put = (next: number) => onChange(Math.min(24, Math.max(1, next)));
    return (
        <div className="flex flex-wrap items-center gap-3 rounded-md border border-line bg-ground px-3 py-2.5">
            <span className="text-sm font-medium text-ink">Slots</span>
            <button type="button" onClick={() => put(value - 1)} disabled={value <= 1} className="flex size-8 items-center justify-center rounded-md border border-line bg-white text-lg text-ink disabled:opacity-40" aria-label="Fewer slots">
                −
            </button>
            <span className="min-w-8 text-center text-sm font-semibold tabular-nums text-ink">{value}</span>
            <button type="button" onClick={() => put(value + 1)} disabled={value >= 24} className="flex size-8 items-center justify-center rounded-md border border-line bg-white text-lg text-ink disabled:opacity-40" aria-label="More slots">
                +
            </button>
            <span className="text-xs text-dim">{value === 1 ? "One advertiser at a time." : `${value} advertisers share the loop — the rate is per slot.`}</span>
        </div>
    );
}

/** 16 · Listing price (5204:79001): the publisher's own unit and figure, the dates, the hours; ADX's comparison under the price. */
export function PricingStep({ form, set, catalogue, listingId }: StepProps & { listingId?: string | null }) {
    const mediaType = catalogue?.mediaTypes.find((m) => m.id === form.mediaTypeId) ?? null;
    const digital = isDigitalMediaType(mediaType);
    const area = areaSqFt(form.widthFt, form.heightFt);
    const sizeClass = catalogue ? matchedSizeClass(catalogue.sizeClasses, form.widthFt, form.heightFt) : null;
    const ratePerDay = form.pricingUnit ? ratePerDayFrom(form.basePrice, form.pricingUnit, area) : null;
    const blockedBy = !form.mediaTypeId ? "Choose a format first to compare prices nearby." : !form.location ? "Drop the pin on the spot to compare prices nearby." : !sizeClass && form.category !== "MEDIA" ? "ADX compares once your size is filed — it names the class when the listing is saved." : null;
    const perSqft = form.pricingUnit === "PER_SQFT_PER_DAY" || form.pricingUnit === "PER_SQFT_PER_MONTH";

    return (
        <div className="space-y-2.5">
            <GroupTitle>Pricing Model</GroupTitle>
            <SelectField label="Rate basis" value={form.pricingUnit} onChange={(pricingUnit) => set({ pricingUnit: pricingUnit as ListingForm["pricingUnit"] })} options={PRICING_UNITS.map((u) => ({ value: u.id, label: `Per placement / ${u.per}` }))} placeholder="Choose" />
            <Field label="Base price" value={form.basePrice} onChange={(basePrice) => set({ basePrice: basePrice.replace(/[^\d.]/g, "") })} placeholder="₹12,600" inputMode="decimal" suffix={form.pricingUnit ? `₹ / ${PRICING_UNITS.find((u) => u.id === form.pricingUnit)?.per}` : "₹"} />
            {perSqft && <Note className="text-xs">{area ? `${area} sq.ft measured, so this is ${ratePerDay ? `₹${Math.round(Number(ratePerDay)).toLocaleString("en-IN")} a day for the whole face` : "worked out from the area"}.` : "A per sq.ft rate needs the width and height from the details step."}</Note>}
            <PriceIndicatorLine venueTypeId={form.venueTypeId} mediaTypeId={form.mediaTypeId} sizeClassId={sizeClass?.id ?? null} latitude={form.location?.latitude ?? null} longitude={form.location?.longitude ?? null} city={form.city || null} ratePerDay={ratePerDay} excludeListingId={listingId ?? undefined} blockedBy={blockedBy} />
            {digital && <SlotsStepper value={form.slotsTotal} onChange={(slotsTotal) => set({ slotsTotal })} />}
            <Row>
                <Field label="Min. booking" value={form.minBookingDays} onChange={(minBookingDays) => set({ minBookingDays: minBookingDays.replace(/\D/g, "") })} placeholder="14" suffix="days" inputMode="numeric" />
                <Field label="Available from" type="date" value={form.availableFrom} onChange={(availableFrom) => set({ availableFrom })} />
            </Row>

            <GroupTitle className="pt-4">Availability</GroupTitle>
            <HoursSelect label="Visibility hours" form={form} set={set} placeholder="24 hours" />
            <Field label="Peak period note" value={form.peakPeriodNote} onChange={(peakPeriodNote) => set({ peakPeriodNote })} placeholder="Add peak period information" />
            <Note className="pt-2">Your rate card comes next. Include any separate printing or installation charges in the commercial terms.</Note>
        </div>
    );
}

/** 17 · Rate card (5204:79601). */
export function RateCardStep({ form, set }: StepProps) {
    return (
        <div className="space-y-2.5">
            {form.rateCard ? (
                <FileRow file={form.rateCard} status={{ label: "On file", tone: "success" }} onRemove={() => set({ rateCard: null })} className="mb-1" />
            ) : (
                <DropZone title="Drop rate card here or browse" caption="PDF / Excel · Max 20 MB · 1 file" accept="application/pdf,image/*,.xls,.xlsx,.csv" purpose="OTHER" onStored={(rateCard) => set({ rateCard })} className="mb-4 min-h-[176px]" />
            )}
            <Field label="Validity start" type="date" value={form.rateCardValidFrom} onChange={(rateCardValidFrom) => set({ rateCardValidFrom })} />
            <Field label="Validity end" type="date" value={form.rateCardValidTo} onChange={(rateCardValidTo) => set({ rateCardValidTo })} />
            <SelectField label="Seasonal variation" value={form.rateCardSeasonal} onChange={(rateCardSeasonal) => set({ rateCardSeasonal })} options={SEASONAL_VARIATIONS} placeholder="Add any seasonal change" />
            <Note className="pt-2">{form.category === "MEDIA" ? "Required for media listings." : "Optional commercial evidence for other spaces."} The card, its validity dates and the seasonal note are saved with the listing.</Note>
        </div>
    );
}

/** The three answers a restricted category takes, in the frame's words. FL-1: shared with the flow's `content-stance` field. */
export const STANCES: { value: ContentStance; label: string }[] = [
    { value: "ALLOWED", label: "Accepted" },
    { value: "REQUIRES_APPROVAL", label: "Requires owner approval" },
    { value: "NOT_ALLOWED", label: "Not accepted" },
];

/** 18 · Content rules (5204:79771): a stance per category, and a tick per never-on-this-venue category. */
export function RulesStep({ form, set, catalogue }: StepProps) {
    const categories = catalogue?.contentCategories ?? [];
    const restricted = categories.filter((c) => !c.isSensitive);
    const prohibited = categories.filter((c) => c.isSensitive);
    const write = (id: string, stance: ContentStance | "") => {
        const next = { ...form.contentRules };
        if (stance) next[id] = stance;
        else delete next[id];
        set({ contentRules: next });
    };
    return (
        <div className="space-y-2.5 border-t border-line pt-5">
            <GroupTitle>Restricted Categories</GroupTitle>
            <p className="text-xs text-dim">These require owner approval before publishing.</p>
            {restricted.length === 0 && <Note>No content categories are set up yet — ADX adds them from the console.</Note>}
            {restricted.map((c) => (
                <SelectField key={c.id} label={c.name} value={form.contentRules[c.id] ?? ""} onChange={(stance) => write(c.id, stance as ContentStance | "")} options={STANCES} placeholder="Accepted" />
            ))}
            <div className="border-t border-line pt-4">
                <GroupTitle>Prohibited Content</GroupTitle>
                <p className="mt-1 text-xs text-dim">Select the content types this placement does not accept.</p>
            </div>
            <div className="space-y-3 pt-1">
                {prohibited.map((c) => (
                    <CheckRow key={c.id} checked={form.contentRules[c.id] === "PROHIBITED"} onChange={(on) => write(c.id, on ? "PROHIBITED" : "")} label={c.name} />
                ))}
            </div>
            <Note className="pt-2">If a category needs approval, advertisers must provide the approval before the artwork is accepted.</Note>
        </div>
    );
}
