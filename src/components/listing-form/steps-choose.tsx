"use client";

import * as React from "react";
import { CATEGORY_OPTIONS, offeredMediaTypes, offeredVenues, shortName, type Catalogue, type ListingCategory } from "@/services/listing-editor";
import { ChoiceList } from "./choice-list";
import { Note } from "./fields";
import type { ListingForm } from "./form-model";

export interface StepProps {
    form: ListingForm;
    set: (patch: Partial<ListingForm>) => void;
    catalogue: Catalogue | null;
}

/** 01 · Ad space category (5204:75982): the four cards, and the line about business verification. */
export function CategoryStep({ form, set, kycVerified }: StepProps & { kycVerified: boolean }) {
    return (
        <div className="space-y-6">
            <ChoiceList
                options={CATEGORY_OPTIONS.map((c) => ({ id: c.id, title: c.title, description: c.description }))}
                value={form.category}
                onChange={(id) => {
                    const category = id as ListingCategory;
                    if (category !== form.category) set({ category, venueTypeId: null, mediaTypeId: null, materialId: null, slotsTotal: 1 });
                }}
                forceSearch={false}
            />
            <Note>
                {kycVerified ? "Your business is verified. Business details are managed separately in Business profile." : "Listing a space for the first time? Your business verification is managed separately in Business profile."}
            </Note>
        </div>
    );
}

/** 02–05 · The venue (5204:76531 …): the catalogue's venues for the category, searchable past eight. */
export function VenueStep({ form, set, catalogue }: StepProps) {
    const venues = offeredVenues(catalogue?.venues ?? [], form.category);
    const media = form.category === "MEDIA";
    return (
        <div className="space-y-6">
            <ChoiceList
                options={venues.map((v) => ({ id: v.id, title: v.name, description: v.description ?? (v.subVenues.length ? v.subVenues.slice(0, 3).join(", ") : null) }))}
                value={form.venueTypeId}
                onChange={(id) => {
                    if (id !== form.venueTypeId) set({ venueTypeId: id, mediaTypeId: null, materialId: null, placement: "" });
                }}
                searchPlaceholder={media ? "Search media outlets" : "Search venue type"}
                emptyLabel={form.category === "OUTDOOR" ? "A roadside spot needs no venue — continue to the format." : "No venues are set up for this category yet. Ask ADX to add one, or pick a different category."}
            />
            {form.category === "OUTDOOR" && venues.length > 0 && <Note>A hoarding on a road belongs to no venue — you can continue without choosing one.</Note>}
        </div>
    );
}

/** 06–09 · The format (5204:77214 …): only the spot types this venue has, grouped as the catalogue groups them. */
export function FormatStep({ form, set, catalogue }: StepProps) {
    const offered = offeredMediaTypes(catalogue?.mediaTypes ?? [], form.venueTypeId, form.category);
    const groups = new Set(offered.map((m) => m.formatGroup ?? ""));
    return (
        <div className="space-y-6">
            <ChoiceList
                options={offered.map((m) => ({ id: m.id, title: shortName(m.name), description: m.description, group: groups.size > 1 ? (m.formatGroup ?? "Other formats") : null }))}
                value={form.mediaTypeId}
                onChange={(id) => {
                    if (id !== form.mediaTypeId) set({ mediaTypeId: id, materialId: null, slotsTotal: 1 });
                }}
                searchPlaceholder="Search ad spot type"
                emptyLabel="No spot types are listed for this venue yet. Ask ADX to add one, or pick a different venue."
            />
        </div>
    );
}
