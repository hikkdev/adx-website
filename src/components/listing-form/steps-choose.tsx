"use client";

import * as React from "react";
import Link from "next/link";
import { FileSpreadsheet } from "lucide-react";
import { CATEGORY_OPTIONS, offeredMediaTypes, offeredVenues, shortName, type Catalogue, type ListingCategory } from "@/services/listing-editor";
import { ChoiceList } from "./choice-list";
import { Note } from "./fields";
import type { ListingForm } from "./form-model";

export interface StepProps {
    form: ListingForm;
    set: (patch: Partial<ListingForm>) => void;
    catalogue: Catalogue | null;
}

/**
 * 01 · Ad space category (5204:75982): the four cards, and the line about
 * business verification. QR-5: a publisher with more than three spaces is
 * pointed at the sheet upload — the page the ADX app sends them to — and may
 * still carry on here one at a time. QR-3: until the basics are in, the step
 * says what is missing, since the submit would be refused without them.
 */
export function CategoryStep({ form, set, kycVerified, missingBasics = null }: StepProps & { kycVerified: boolean; missingBasics?: { words: string; href: string } | null }) {
    return (
        <div className="space-y-6">
            <MissingBasicsNotice missingBasics={missingBasics} />
            <ChoiceList
                options={CATEGORY_OPTIONS.map((c) => ({ id: c.id, title: c.title, description: c.description }))}
                value={form.category}
                onChange={(id) => {
                    const category = id as ListingCategory;
                    if (category !== form.category) set({ category, venueTypeId: null, mediaTypeId: null, materialId: null, slotsTotal: 1 });
                }}
                forceSearch={false}
            />
            <CategoryExtras kycVerified={kycVerified} />
        </div>
    );
}

/** QR-3: the line over the category cards while the basics are missing, since the submit would be refused without them. */
export function MissingBasicsNotice({ missingBasics }: { missingBasics: { words: string; href: string } | null }) {
    if (!missingBasics) return null;
    return (
        <div role="status" className="rounded-md border border-warning/30 bg-warning-soft px-4 py-3 text-sm text-warning">
            ADX needs your {missingBasics.words} before a listing can be sent for review. You can prepare it now —{" "}
            <Link href={missingBasics.href} className="font-semibold underline underline-offset-4">
                complete your details
            </Link>{" "}
            before you submit.
        </div>
    );
}

/**
 * What the category step draws under its cards, whichever list the cards
 * came from (FL-1: the flow's options, or the baked four): the sheet
 * nudge (QR-5) and the business-verification line.
 */
export function CategoryExtras({ kycVerified }: { kycVerified: boolean }) {
    return (
        <>
            <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-line bg-ground px-4 py-3.5 md:flex-nowrap">
                <div className="flex min-w-0 flex-1 items-start gap-3">
                    <FileSpreadsheet className="mt-0.5 size-5 shrink-0 text-brand-bright" aria-hidden />
                    <div>
                        <p className="text-sm font-semibold text-ink">Listing more than three spaces? Use a sheet</p>
                        <p className="mt-0.5 text-xs text-dim">Upload one CSV sheet, check every row, and add them in one go — then finish each from your inventory. You can still carry on here, one space at a time.</p>
                    </div>
                </div>
                <Link href="/publisher/listings/bulk" className="inline-flex h-9 shrink-0 items-center rounded-md border border-line bg-white px-4 text-sm font-semibold text-ink hover:border-ink">
                    Add many at once
                </Link>
            </div>
            <Note>
                {kycVerified ? "Your business is verified. Business details are managed separately in Business profile." : "Listing a space for the first time? Your business verification is managed separately in Business profile."}
            </Note>
        </>
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
