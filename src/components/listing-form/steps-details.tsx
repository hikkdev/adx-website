"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import { areaSqFt, FACING_OPTIONS, ILLUMINATION_OPTIONS, type GeocodedPlace } from "@/services/listing-editor";
import { AddressSearch, CityField } from "./address-search";
import { CheckRow, Field, GroupTitle, Note, Row, SectionLabel, SelectField, TextareaField } from "./fields";
import { AGE_BANDS, CONTENT_FORMATS, GENDER_SPLITS, INCOME_BRACKETS, LANGUAGES, OCCUPATIONS, OPERATING_HOURS, SEC_PROFILES, SLOT_DURATIONS, URBAN_RURAL, VEHICLE_TYPES, type ListingForm } from "./form-model";
import type { StepProps } from "./steps-choose";
import { EvidenceRow } from "./uploads";
import { VehicleVerify } from "./vehicle-verify";

const LocationMap = dynamic(() => import("./location-map").then((m) => m.LocationMap), {
    ssr: false,
    loading: () => <div className="h-[280px] animate-pulse rounded-lg border border-line bg-[#f1f1ee]" />,
});

const opts = (values: string[]) => values.map((v) => ({ value: v, label: v }));

/**
 * 10 · Location and dimensions (5204:77900): name, placement, address with
 * the map's suggestions, the pin, the tape and the two visibility facts,
 * then the "Installation by ADX" tick. `locked` is the edit page's rule: a
 * spot at a different address is a different spot, so the address, the
 * city and the pin are shown as they stand.
 */
export function DetailsStep({ form, set, locked = false }: StepProps & { locked?: boolean }) {
    const area = areaSqFt(form.widthFt, form.heightFt);
    const onPlace = (place: GeocodedPlace) => set({ location: { latitude: place.latitude, longitude: place.longitude }, ...(place.city && !form.city ? { city: place.city } : {}) });
    return (
        <div className="space-y-2.5">
            <Field label="Ad spot name" value={form.title} onChange={(title) => set({ title })} placeholder="Whitefield East billboard" />
            <Field label="Placement area" value={form.placement} onChange={(placement) => set({ placement })} placeholder="Roadside · Main road facing" />
            <AddressSearch label="Street address / landmark" value={form.address} onChange={(address) => set({ address })} onPlace={onPlace} placeholder="Whitefield Main Road, near Hope Farm junction" near={form.location} disabled={locked} />
            <CityField value={form.city} onChange={(city) => set({ city })} disabled={locked} />

            <GroupTitle className="pt-4">Confirm the location pin</GroupTitle>
            <LocationMap point={form.location} onChange={(location) => set({ location })} disabled={locked} />
            <Note>{locked ? "The address and pin stay as listed — a spot at a different address is a new listing. Ask ADX from Help & support to correct them." : "Confirm the exact address and pin before submitting. Nearby prices are found within 200 m, so this needs to be the spot rather than the area."}</Note>

            <GroupTitle className="pt-4">Dimensions & Visibility</GroupTitle>
            <Row>
                <Field label="Width" value={form.widthFt} onChange={(widthFt) => set({ widthFt })} placeholder="40" suffix="ft" inputMode="decimal" />
                <Field label="Height" value={form.heightFt} onChange={(heightFt) => set({ heightFt })} placeholder="20" suffix="ft" inputMode="decimal" />
            </Row>
            <Field label="Total area" value={area ? `${area} sq.ft` : ""} onChange={() => undefined} placeholder="Enter a width and a height" readOnly />
            <Row>
                <SelectField label="Illumination" value={form.illumination} onChange={(illumination) => set({ illumination })} options={opts(ILLUMINATION_OPTIONS)} placeholder="Choose" />
                <SelectField label="Facing" value={form.facing} onChange={(facing) => set({ facing })} options={opts(FACING_OPTIONS)} placeholder="Choose" />
            </Row>

            <div className="mt-6 border-t border-ink pt-5">
                <CheckRow checked={form.installationByAdx} onChange={(installationByAdx) => set({ installationByAdx })} label="Installation by ADX" description="Special Pricing Applicable " />
                <Note className="mt-2 text-xs">Noted with your listing for ADX to price; the choice is confirmed on each booking.</Note>
            </div>
        </div>
    );
}

/** 11 · Vehicle and route (5204:78093): the moving spot's registration with its check, the base, the route and the hours. */
export function VehicleStep({ form, set, locked = false, listingId }: StepProps & { locked?: boolean; listingId?: string | null }) {
    const onPlace = (place: GeocodedPlace) => set({ location: { latitude: place.latitude, longitude: place.longitude }, ...(place.city ? { city: place.city } : {}) });
    return (
        <div className="space-y-2.5">
            <SectionLabel>Ad slot</SectionLabel>
            <Field label="Ad slot name" value={form.title} onChange={(title) => set({ title })} placeholder="Transit placement" />

            <SectionLabel className="pt-5">Vehicle</SectionLabel>
            <Field label="Vehicle registration" value={form.vehicleNumber} onChange={(vehicleNumber) => set({ vehicleNumber })} placeholder="Enter registration number" />
            <VehicleVerify value={form.vehicleNumber} listingId={listingId ?? null} />
            <SelectField label="Vehicle type / model" value={form.vehicleModel} onChange={(vehicleModel) => set({ vehicleModel })} options={opts(VEHICLE_TYPES)} placeholder="Choose vehicle type / model" />
            <Note className="text-xs">The model is kept with your draft for ADX's review; the listing carries the registration.</Note>

            <SectionLabel className="pt-5">Location & route</SectionLabel>
            <AddressSearch label="Base location" value={form.address} onChange={(address) => set({ address })} onPlace={onPlace} placeholder="Choose the vehicle base location" near={form.location} disabled={locked} chevron />
            <CityField value={form.city} onChange={(city) => set({ city })} disabled={locked} label="City" />
            <Field label="Primary route" value={form.placement} onChange={(placement) => set({ placement })} placeholder="Enter the operating route" />

            <SectionLabel className="pt-5">Schedule</SectionLabel>
            <SelectField label="Operating hours" value={form.operatingHours} onChange={(operatingHours) => set({ operatingHours })} options={OPERATING_HOURS.map((o) => ({ value: o.value, label: o.label }))} placeholder="Set operating days and hours" />
        </div>
    );
}

/** 12 · Outlet and audience reach (5204:78275): the media branch's details. */
export function OutletStep({ form, set }: StepProps) {
    return (
        <div className="space-y-2.5">
            <SectionLabel>Outlet</SectionLabel>
            <Field label="Channel / publication name" value={form.address} onChange={(address) => set({ address })} placeholder="Sunrise FM 92.7" />
            <SelectField label="Broadcast language" value={form.broadcastLanguage} onChange={(broadcastLanguage) => set({ broadcastLanguage })} options={opts(LANGUAGES)} placeholder="Choose the language" />
            <SelectField label="Content format" value={form.contentFormat} onChange={(contentFormat) => set({ contentFormat })} options={opts(CONTENT_FORMATS)} placeholder="Describe the content format" />
            <Note className="text-xs">Language and format are kept with your draft for ADX's review.</Note>

            <SectionLabel className="pt-5">Reach</SectionLabel>
            <CityField label="Geographic coverage" value={form.coverage} onChange={(coverage) => set({ coverage, city: coverage })} placeholder="Bengaluru + 50 km radius" />
            <Field label="Audience / circulation" value={form.footfallNote} onChange={(footfallNote) => set({ footfallNote })} placeholder="Add figure and source" />

            <SectionLabel className="pt-5">Slot</SectionLabel>
            <SelectField label="Slot duration" value={form.slotDuration} onChange={(slotDuration) => set({ slotDuration })} options={opts(SLOT_DURATIONS)} placeholder="30 seconds" />
        </div>
    );
}

/** 13 · Space description (5204:78454). */
export function DescriptionStep({ form, set }: StepProps) {
    return (
        <div className="space-y-2.5">
            <TextareaField boxed label="Advertising Space Description" value={form.description} onChange={(description) => set({ description })} placeholder={"Describe the placement, surroundings and\nwhat advertisers should know."} rows={8} className="mb-6" />
            <Field label="Target audience" value={form.targetAudience} onChange={(targetAudience) => set({ targetAudience })} placeholder="Describe the audience this placement reaches" />
            <Field label="Unique selling point" value={form.uniqueSellingPoint} onChange={(uniqueSellingPoint) => set({ uniqueSellingPoint })} placeholder="What makes this placement useful?" />
            <Field label="Past success or footfall" value={form.footfallNote} onChange={(footfallNote) => set({ footfallNote })} placeholder="Add supported footfall or previous results" />
        </div>
    );
}

/** 14 · Audience evidence (5204:78629): six optional facts and two reports. */
export function AudienceStep({ form, set }: StepProps) {
    const audience = (patch: Partial<ListingForm["audience"]>) => set({ audience: { ...form.audience, ...patch } });
    return (
        <div className="space-y-2.5">
            <SectionLabel>Demographics</SectionLabel>
            <SelectField label="Primary age band" value={form.audience.ageBand} onChange={(ageBand) => audience({ ageBand })} options={opts(AGE_BANDS)} placeholder="Add if known" />
            <SelectField label="Gender split" value={form.audience.genderSplit} onChange={(genderSplit) => audience({ genderSplit })} options={opts(GENDER_SPLITS)} placeholder="Add if known" />

            <div className="border-t border-line pt-4">
                <SectionLabel>Geographic</SectionLabel>
            </div>
            <SelectField label="Urban / rural mix" value={form.audience.urbanRural} onChange={(urbanRural) => audience({ urbanRural })} options={opts(URBAN_RURAL)} placeholder="Add if known" />
            <SelectField label="SEC profile" value={form.audience.secProfile} onChange={(secProfile) => audience({ secProfile })} options={opts(SEC_PROFILES)} placeholder="Add if known" />

            <div className="border-t border-line pt-4">
                <SectionLabel>Income & occupation</SectionLabel>
            </div>
            <SelectField label="Income bracket" value={form.audience.incomeBracket} onChange={(incomeBracket) => audience({ incomeBracket })} options={opts(INCOME_BRACKETS)} placeholder="Add if known" />
            <SelectField label="Top occupation" value={form.audience.occupation} onChange={(occupation) => audience({ occupation })} options={opts(OCCUPATIONS)} placeholder="Add if known" />
            <Note className="text-xs">These six facts are kept with your draft for ADX's review; the reports below are filed with the listing.</Note>

            <div className="border-t border-line pt-4">
                <SectionLabel>Documents</SectionLabel>
                <p className="mt-3 text-xs text-dim">Upload supporting evidence</p>
            </div>
            <EvidenceRow title="BARC / TAM rating sheet" meta="PDF · Latest quarter" file={form.audienceDocs.barc} onChange={(barc) => set({ audienceDocs: { ...form.audienceDocs, barc } })} />
            <EvidenceRow title="Footfall audit report" meta="PDF or Excel" file={form.audienceDocs.footfall} onChange={(footfall) => set({ audienceDocs: { ...form.audienceDocs, footfall } })} />
            <Note className="pt-2">Supporting reports are optional. Use current figures and identify the period your evidence covers.</Note>
        </div>
    );
}
