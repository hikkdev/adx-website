"use client";

import * as React from "react";
import { documentSlotsFor, RIGHTS_OPTIONS, type Catalogue, type RightsBasis } from "@/services/listing-editor";
import { cn } from "@/lib/utils";
import { CheckBar, Field, GroupTitle, Note, Pill, Row, SelectField } from "./fields";
import { formatName, missingBeforeSubmit, photosOf, summaryOf, type ListingForm, type StepKey } from "./form-model";
import type { StepProps } from "./steps-choose";
import { DocumentSlot, PhotoSlot, RequirementRow } from "./uploads";

/** One review row: a title, a line under it, Edit at the right (5204:80161). */
function ReviewRow({ title, line, onEdit, muted }: { title: string; line: string; onEdit: () => void; muted?: boolean }) {
    return (
        <div className="flex items-center justify-between gap-6 border-t border-line py-4">
            <div>
                <p className="text-sm font-semibold text-ink">{title}</p>
                <p className={cn("mt-1 text-sm", muted ? "text-dim" : "text-dim")}>{line}</p>
            </div>
            <button type="button" onClick={onEdit} className="inline-flex h-10 items-center rounded-md border border-line bg-white px-6 text-sm font-semibold text-ink hover:border-ink">
                Edit
            </button>
        </div>
    );
}

function Fact({ label, value }: { label: string; value: string }) {
    return (
        <div>
            <p className="text-xs text-dim">{label}</p>
            <p className="mt-1 text-sm font-semibold text-ink">{value}</p>
        </div>
    );
}

/** 20 · Listing review (5204:80161): the summary, the two red links, six sections with Edit. */
export function ReviewStep({ form, catalogue, go }: StepProps & { go: (step: StepKey) => void }) {
    const s = summaryOf(form, catalogue);
    const missing = missingBeforeSubmit(form, catalogue);
    const describe = (parts: (string | null)[], empty: string) => {
        const filled = parts.filter(Boolean);
        return filled.length ? filled.join(" · ") : empty;
    };
    return (
        <div>
            <p className="text-sm font-semibold text-ink">Listing Summary</p>
            <p className="mt-1 text-xs text-dim">Built from your selected category, venue and pricing details.</p>
            <div className="mt-5 space-y-5">
                <Fact label="Category" value={s.category} />
                <Fact label="Venue" value={s.venue} />
                <div className="grid gap-5 md:grid-cols-2">
                    <Fact label="Spot type" value={s.spotType} />
                    <Fact label="Area" value={s.area} />
                </div>
                <Fact label="Location" value={s.location} />
                <Fact label="Pricing" value={s.pricing} />
            </div>
            <div className="mt-6 space-y-3">
                <button type="button" onClick={() => go("category")} className="block text-sm font-medium text-brand-bright hover:underline">
                    Edit category, venue or format
                </button>
                <button type="button" onClick={() => go("pricing")} className="block text-sm font-medium text-brand-bright hover:underline">
                    Edit listing price
                </button>
            </div>
            {missing.length > 0 && (
                <div className="mt-5 rounded-md border border-warning/30 bg-warning-soft px-4 py-3 text-sm text-warning">
                    Still needed before this can be sent: {missing.map((m) => `${m.fields.join(", ")}`).join("; ")}.
                </div>
            )}
            <div className="mt-6">
                <ReviewRow title="Space details" line={form.category === "MEDIA" ? describe([form.address || null, form.slotDuration || null], "Outlet details not added yet") : form.location ? "Location and dimensions entered. Confirm the exact map pin." : "Location, dimensions and placement information"} onEdit={() => go("details")} />
                <ReviewRow title="Listing description" line={form.description.trim() ? `${form.description.trim().slice(0, 90)}${form.description.trim().length > 90 ? "…" : ""}` : "Not added yet"} onEdit={() => go("description")} muted={!form.description.trim()} />
                <ReviewRow title="Audience evidence" line={describe([form.audience.ageBand || null, form.audience.genderSplit || null, form.audienceDocs.barc ? "BARC / TAM sheet" : null, form.audienceDocs.footfall ? "Footfall audit" : null], "Not added · Optional")} onEdit={() => go("audience")} />
                <ReviewRow title="Booking terms" line={describe([form.availableYearRound === "yes" ? "Year-round" : form.availableYearRound === "no" ? "Seasonal" : null, form.minBookingDays ? `Min ${form.minBookingDays} days` : null, form.cancellationNotice ? "Cancellation set" : null], "Availability window, minimum and maximum booking, cancellation")} onEdit={() => go("terms")} />
                <ReviewRow title="Rate card" line={form.rateCard ? form.rateCard.name : "Current commercial evidence, validity and seasonal rates"} onEdit={() => go("ratecard")} />
                <ReviewRow title="Content rules" line={Object.keys(form.contentRules).length ? `${Object.values(form.contentRules).filter((v) => v === "PROHIBITED").length} prohibited · ${Object.values(form.contentRules).filter((v) => v === "REQUIRES_APPROVAL").length} need approval` : "Restricted categories, prior approval and prohibited content"} onEdit={() => go("rules")} />
                <div className="border-t border-line pt-4">
                    <Note>Next, add the proof needed for ADX verification. Your listing is not live yet.</Note>
                </div>
            </div>
        </div>
    );
}

/** A checklist row on the verification step (5204:79968): the requirement, a line under it, the state at the right. */
function ProofRow({ title, line, state, tone, children }: { title: string; line: string; state: string; tone: "success" | "neutral" | "warning"; children?: React.ReactNode }) {
    return (
        <div className="rounded-md border border-line bg-white px-2.5 py-2.5">
            <div className="flex items-start justify-between gap-4">
                <div>
                    <p className="text-xs font-semibold text-ink">{title}</p>
                    <p className="text-[11px] leading-4 text-dim">{line}</p>
                </div>
                <Pill tone={tone}>{state}</Pill>
            </div>
            {children && <div className="mt-3">{children}</div>}
        </div>
    );
}

/** 19 · Verification documents (5204:79968): what ADX checks, and the photographs taken here. */
export function VerifyStep({ form, set, catalogue, go }: StepProps & { go: (step: StepKey) => void }) {
    const photos = photosOf(form).length;
    const slots = documentSlotsFor(form.category);
    const noc = slots.find((s) => s.kind === "OWNER_NOC");
    const nocAnswer = noc ? form.documents[noc.key] : null;
    const pinned = !!form.location && (form.category === "MEDIA" || form.category === "TRANSIT" || (!!form.widthFt && !!form.heightFt));
    const photoKeys = ["front", "left", "right", "wide"] as const;
    const labels = { front: "Front face", left: "Left angle", right: "Right angle", wide: "Wide context" };
    return (
        <div className="space-y-3">
            <div className="grid grid-cols-2 rounded-md border border-line bg-white">
                <div className="border-r border-line px-3 py-2.5">
                    <p className="text-xs text-dim">Spot</p>
                    <p className="text-sm font-medium text-ink">{formatName(form, catalogue) ?? form.title ?? "—"}</p>
                </div>
                <div className="px-3 py-2.5">
                    <p className="text-xs text-dim">Status</p>
                    <p className="text-sm font-medium text-ink">{photos >= 3 && pinned ? "Proof ready" : "Pending proof"}</p>
                </div>
            </div>
            <ProofRow title="Photos: 3 to 5 angles" line="Front, left, right and wide-area context." state={photos >= 3 ? `${photos} added` : photos ? `${photos} of 3` : "Not added"} tone={photos >= 3 ? "success" : "neutral"}>
                <div className="grid gap-5 md:grid-cols-2">
                    {photoKeys.map((key) => (
                        <PhotoSlot key={key} label={labels[key]} file={form.photos[key]} onChange={(next) => set({ photos: { ...form.photos, [key]: next } })} title="Add a photo" hint="JPG or PNG · Clear, full-size photo" />
                    ))}
                </div>
            </ProofRow>
            <ProofRow title="Location and measurement proof" line="Map pin, dimensions and visible surroundings." state={pinned ? "Entered" : "Missing"} tone={pinned ? "success" : "warning"}>
                {!pinned && (
                    <button type="button" onClick={() => go("details")} className="text-xs font-semibold text-brand-bright hover:underline">
                        Add the pin and dimensions ›
                    </button>
                )}
            </ProofRow>
            <ProofRow title="Owner permission / NOC" line="Required when the venue owner is different." state={form.ownVenue || form.rightsBasis === "OWNED" ? "You own the venue" : nocAnswer && "url" in nocAnswer ? "On file" : nocAnswer && "waived" in nocAnswer ? nocAnswer.waived : "Next step"} tone={form.ownVenue || (nocAnswer && "url" in nocAnswer) ? "success" : "neutral"} />
            <ProofRow title="Rate card or commercial terms" line="Upload rate proof if available for this spot." state={form.rateCard ? "On file" : "Optional"} tone={form.rateCard ? "success" : "neutral"} />
            <Note className="pt-2">Business verification is managed in Business profile. Complete any outstanding business requirements before the listing can go live.</Note>
        </div>
    );
}

/** The rights term under the papers (QR-24): how the space is held and until when. */
function RightsFields({ form, set }: StepProps) {
    const held = form.rightsBasis && form.rightsBasis !== "OWNED";
    return (
        <div className="space-y-2.5">
            <CheckBar checked={form.ownVenue} onChange={(ownVenue) => set({ ownVenue, rightsBasis: ownVenue ? "OWNED" : form.rightsBasis === "OWNED" ? "" : form.rightsBasis, ...(ownVenue ? { rightsValidUntil: "" } : {}) })} label={form.category === "TRANSIT" ? "I own the vehicle" : "I own the venue"} />
            {!form.ownVenue && (
                <Row>
                    <SelectField label="How do you hold this space?" value={form.rightsBasis === "OWNED" ? "" : form.rightsBasis} onChange={(rightsBasis) => set({ rightsBasis: rightsBasis as RightsBasis | "" })} options={RIGHTS_OPTIONS.filter((o) => o.id !== "OWNED").map((o) => ({ value: o.id, label: `${o.title} — ${o.description}` }))} placeholder="Choose" />
                    <Field label="Right runs out on" type="date" value={form.rightsValidUntil} onChange={(rightsValidUntil) => set({ rightsValidUntil })} disabled={!held} />
                </Row>
            )}
            {!form.ownVenue && <Note className="text-xs">The end date on the lease, licence or permit. ADX reminds you 30 and 7 days before; after that day the spot takes no new booking until you upload the renewal.</Note>}
        </div>
    );
}

/** 21 · Venue documents / 22 · Transit verification / 23 · Media verification. */
export function DocumentsStep({ form, set, catalogue, listing }: StepProps & { listing?: boolean }) {
    const slots = documentSlotsFor(form.category);
    const answer = (key: string) => form.documents[key] ?? null;
    const write = (key: string, next: ListingForm["documents"][string]) => set({ documents: { ...form.documents, [key]: next } });
    const fileOf = (key: string) => {
        const a = answer(key);
        return a && "url" in a ? a : null;
    };
    const waivedOf = (key: string) => {
        const a = answer(key);
        return a && "waived" in a ? a.waived : null;
    };

    if (form.category === "TRANSIT" || form.category === "MEDIA") {
        const media = form.category === "MEDIA";
        return (
            <div className="space-y-6">
                {slots.map((slot) => (
                    <RequirementRow
                        key={slot.key}
                        title={slot.title}
                        description={slot.description}
                        required={slot.required}
                        file={fileOf(slot.key)}
                        waived={waivedOf(slot.key)}
                        waiver={slot.waiver}
                        layout={media ? "media" : "left"}
                        onChange={(file) => {
                            write(slot.key, file);
                            if (slot.rateCard && file) set({ rateCard: file });
                        }}
                        onWaive={slot.waiver ? (waived) => {
                            write(slot.key, waived ? { waived } : null);
                            if (slot.kind === "OWNER_NOC") set({ ownVenue: !!waived, rightsBasis: waived ? "OWNED" : form.rightsBasis === "OWNED" ? "" : form.rightsBasis });
                        } : undefined}
                    />
                ))}
                {!media && <RightsFields form={form} set={set} catalogue={catalogue} />}
                {media && listing && <Note>Media rights are recorded on the outlet's agreement; upload it above as the Business Registration & License.</Note>}
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {slots.map((slot) => (
                <DocumentSlot key={slot.key} title={slot.title} description={slot.description} file={fileOf(slot.key)} onChange={(file) => write(slot.key, file)} />
            ))}
            <RightsFields form={form} set={set} catalogue={catalogue} />
        </div>
    );
}

export function documentsTitle(category: ListingForm["category"], editing = false): { title: string; subtitle: string } {
    if (category === "TRANSIT") return editing ? { title: "Edit transit documents", subtitle: "Update this section, then save your changes to this listing." } : { title: "Transit verification", subtitle: "Use current documents for the vehicle and operating route in this listing." };
    if (category === "MEDIA") return editing ? { title: "Edit media documents", subtitle: "Update this section, then save your changes to this listing." } : { title: "Media verification", subtitle: "Support your outlet details, reach and commercial terms with current documents." };
    return editing ? { title: "Edit venue documents", subtitle: "Update this section, then save your changes to this listing." } : { title: "Venue documents", subtitle: "Add the documents that show your right to offer this ad space." };
}

export function useCatalogueName(catalogue: Catalogue | null, form: ListingForm): string | null {
    return React.useMemo(() => formatName(form, catalogue), [catalogue, form]);
}

export { GroupTitle };
