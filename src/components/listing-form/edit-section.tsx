"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ApiError, messageOf } from "@/lib/api-client";
import { documentSlotsFor, isNotBuilt, listingEditorService, RIGHTS_PAPERS, type Catalogue, type ListingAudience, type ListingDocument, type MyListing } from "@/services/listing-editor";
import { Note, Problem } from "./fields";
import { EDIT_SECTIONS, formFromListing, patchFor, photosOf, type EditSection, type ListingForm } from "./form-model";
import { DetailsStep, DescriptionStep, AudienceStep, VehicleStep, OutletStep } from "./steps-details";
import { PricingStep, RateCardStep, RulesStep, TermsStep } from "./steps-pricing";
import { DocumentsStep, documentsTitle } from "./steps-review";
import { SuggestedRateCard } from "./suggested-rate";
import { PhotoSlot } from "./uploads";
import { ListingChrome, StepActions, TaskCard } from "./wizard-frame";

type Loaded = { key: string; listing: MyListing | null; catalogue: Catalogue | null; documents: ListingDocument[]; audience: ListingAudience | null; error: string | null };

/**
 * Board 09 · one section of a listing, edited and saved. The form is read
 * off the listing (`GET /publishers/me/listings`, its content rules and
 * its papers), the section's step is drawn as the wizard draws it, and
 * "Save changes" sends only that section's columns (`PATCH /listings/:id`);
 * papers go through `/supply`, and a photograph change has no route yet
 * and says so.
 */
export function EditSection({ listingId, section }: { listingId: string; section: EditSection | "vehicle" }) {
    const router = useRouter();
    const [loaded, setLoaded] = React.useState<Loaded>({ key: "", listing: null, catalogue: null, documents: [], audience: null, error: null });
    const [form, setForm] = React.useState<ListingForm | null>(null);
    const [hydrated, setHydrated] = React.useState<string>("");
    const [saving, setSaving] = React.useState(false);
    const [problem, setProblem] = React.useState<string | null>(null);
    const key = `${listingId}:${section}`;

    React.useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const listing = await listingEditorService.myListing(listingId);
                if (cancelled) return;
                if (!listing) {
                    setLoaded({ key, listing: null, catalogue: null, documents: [], audience: null, error: "That listing is not in your inventory." });
                    return;
                }
                const [catalogue, rules, documents, audience] = await Promise.all([
                    listingEditorService.catalogue().catch(() => null),
                    section === "rules" ? listingEditorService.contentRules(listing.id).catch(() => []) : Promise.resolve([]),
                    section === "documents" || section === "audience" ? listingEditorService.documents(listing.id).catch(() => [] as ListingDocument[]) : Promise.resolve([] as ListingDocument[]),
                    section === "audience" ? listingEditorService.audience(listing.id).catch(() => null) : Promise.resolve(null),
                ]);
                if (cancelled) return;
                setLoaded({ key, listing: { ...listing, ...(rules.length ? {} : {}) }, catalogue, documents, audience, error: null });
                setForm(formFromListing(listing, rules, documents));
                setHydrated(key);
            } catch (caught) {
                if (!cancelled) setLoaded({ key, listing: null, catalogue: null, documents: [], audience: null, error: caught instanceof ApiError && caught.status === 404 ? "That listing is not in your inventory." : messageOf(caught, "Could not load this listing.") });
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [listingId, section, key]);

    const ready = loaded.key === key && hydrated === key && form !== null;
    const listing = loaded.key === key ? loaded.listing : null;
    const catalogue = loaded.key === key ? loaded.catalogue : null;
    const set = React.useCallback((patch: Partial<ListingForm>) => setForm((current) => (current ? { ...current, ...patch } : current)), []);
    const overview = `/publisher/listings/${encodeURIComponent(listingId)}`;
    const meta = EDIT_SECTIONS.find((s) => s.key === (section === "vehicle" ? "details" : section));

    const save = async () => {
        if (!form || !listing) return;
        setSaving(true);
        setProblem(null);
        try {
            if (section === "photos") {
                if (photosOf(form).length === 0) throw new ApiError(0, "NO_PHOTOS", "Add at least one photograph.");
                throw new ApiError(0, "NOT_AVAILABLE", "Replacing a listing's photographs is not available yet — ADX can swap them from the console. Your existing photos stay on the listing.");
            }
            if (section === "documents") {
                const slots = documentSlotsFor(form.category);
                const term = form.rightsBasis && form.rightsBasis !== "OWNED" && form.rightsValidUntil ? form.rightsValidUntil : null;
                for (const slot of slots) {
                    const answer = form.documents[slot.key];
                    if (!answer || !("url" in answer)) continue;
                    const already = loaded.documents.some((d) => d.url === answer.url);
                    if (already) continue;
                    await listingEditorService.addDocument(listing.id, { kind: slot.kind, url: answer.url, ...(term && RIGHTS_PAPERS.has(slot.kind) ? { expiresAt: term } : {}) });
                }
                if (form.rightsBasis) {
                    await listingEditorService.setRights(listing.id, { basis: form.rightsBasis, validUntil: form.rightsBasis === "OWNED" ? null : form.rightsValidUntil || null });
                }
                if (form.category === "MEDIA" && form.rateCard && form.rateCard.url !== listing.rateCardUrl) await listingEditorService.update(listing.id, { rateCardUrl: form.rateCard.url });
            } else if (section === "audience") {
                for (const file of [form.audienceDocs.barc, form.audienceDocs.footfall]) {
                    if (!file || loaded.documents.some((d) => d.url === file.url)) continue;
                    await listingEditorService.addDocument(listing.id, { kind: "OTHER", url: file.url });
                }
            } else {
                const patch = patchFor(section === "vehicle" ? "vehicle" : section, form);
                if (Object.keys(patch).length === 0) throw new ApiError(0, "NOTHING", "Nothing to save on this section yet.");
                await listingEditorService.update(listing.id, patch);
            }
            toast.success("Changes saved", { description: listing.status === "ACTIVE" ? "They are live on the listing." : "They are part of the review." });
            router.push(overview);
        } catch (caught) {
            setProblem(isNotBuilt(caught) ? "That part of the listing cannot be changed from here yet." : messageOf(caught, "Could not save the changes."));
        } finally {
            setSaving(false);
        }
    };

    const title = section === "vehicle" ? "Edit vehicle and route" : section === "documents" && form ? documentsTitle(form.category, true).title : section === "details" && form?.category === "MEDIA" ? "Edit outlet and audience reach" : (meta?.heading ?? "Edit listing");

    const body = (() => {
        if (!form) return null;
        switch (section) {
            case "details":
                return form.category === "MEDIA" ? <OutletStep form={form} set={set} catalogue={catalogue} /> : form.category === "TRANSIT" ? <VehicleStep form={form} set={set} catalogue={catalogue} listingId={listingId} locked /> : <DetailsStep form={form} set={set} catalogue={catalogue} locked />;
            case "vehicle":
                return <VehicleStep form={form} set={set} catalogue={catalogue} listingId={listingId} locked />;
            case "description":
                return <DescriptionStep form={form} set={set} catalogue={catalogue} />;
            case "audience":
                return (
                    <div className="space-y-6">
                        <AudiencePanel audience={loaded.audience} />
                        <AudienceStep form={form} set={set} catalogue={catalogue} />
                    </div>
                );
            case "terms":
                return <TermsStep form={form} set={set} catalogue={catalogue} />;
            case "price":
                return (
                    <div className="space-y-6">
                        <PricingStep form={form} set={set} catalogue={catalogue} listingId={listingId} />
                        {listing && <SuggestedRateCard listingId={listing.id} onAccepted={(next) => set({ basePrice: next.basePrice ? String(Number(next.basePrice)) : form.basePrice, pricingUnit: (next.pricingUnit as ListingForm["pricingUnit"]) || form.pricingUnit })} />}
                        <Note>Manage the rate card from your listing overview. Include separate printing or installation charges in the commercial terms.</Note>
                    </div>
                );
            case "ratecard":
                return <RateCardStep form={form} set={set} catalogue={catalogue} />;
            case "rules":
                return <RulesStep form={form} set={set} catalogue={catalogue} />;
            case "photos":
                return <PhotosEditor form={form} set={set} cover={listing?.photos?.[0]?.url ?? null} />;
            case "documents":
                return <DocumentsStep form={form} set={set} catalogue={catalogue} listing />;
        }
    })();

    return (
        <ListingChrome crumb={<Link href={overview} className="hover:text-ink">Listing overview</Link>} chapter={null}>
            {loaded.key === key && loaded.error && <Problem>{loaded.error}</Problem>}
            <TaskCard title={title} subtitle="Update this section, then save your changes to this listing." className={loaded.error ? "mt-4" : undefined}>
                {ready ? body : <div className="h-40 animate-pulse rounded-md bg-ground" />}
                {problem && <div className="mt-4"><Problem>{problem}</Problem></div>}
            </TaskCard>
            <StepActions back="Cancel" backHref={overview} primary="Save changes" onPrimary={() => void save()} busy={saving} primaryDisabled={!ready} />
            {listing && <p className="mt-3 text-right text-xs text-dim">{listing.status === "ACTIVE" ? "Changes go live on the listing as soon as you save." : "Changes are included in ADX's review."}</p>}
        </ListingChrome>
    );
}

/** 09 · 10 · Edit listing photos (5204:84858): the cover as it stands, four replacement slots. */
function PhotosEditor({ form, set, cover }: { form: ListingForm; set: (patch: Partial<ListingForm>) => void; cover: string | null }) {
    const keys = ["front", "left", "right", "wide"] as const;
    const labels = { front: "Front face", left: "Left angle", right: "Right angle", wide: "Wide context" };
    return (
        <div>
            <div className="flex flex-wrap items-center gap-6">
                <div className="h-[180px] w-[320px] shrink-0 overflow-hidden rounded-lg bg-[#f1f1ee]">{cover ? <img src={cover} alt="Current cover photo" className="size-full object-cover" /> : <div className="flex size-full items-center justify-center text-xs text-dim">No cover photo yet</div>}</div>
                <div className="min-w-0 flex-1">
                    <p className="text-lg font-semibold text-ink">Current cover photo</p>
                    <p className="mt-2 text-sm text-dim">Choose replacement photos below. Your existing photos stay on the listing until you save.</p>
                </div>
            </div>
            <div className="mt-6 grid gap-6 md:grid-cols-2">
                {keys.map((key) => (
                    <PhotoSlot key={key} label={labels[key]} file={form.photos[key]} onChange={(next) => set({ photos: { ...form.photos, [key]: next } })} />
                ))}
            </div>
            <Note className="mt-4 text-xs">Photographs upload here at once; swapping them on a listed spot is not available from the website yet — ADX does it from the console on request.</Note>
        </div>
    );
}

/** ADX's own audience estimate for the spot's catchment (`GET /listings/:id/audience`), above the publisher's own figures. */
function AudiencePanel({ audience }: { audience: ListingAudience | null }) {
    if (!audience) return null;
    const a = audience.audience;
    const shares = (rows: { label: string; share: number }[] | null | undefined) => (rows && rows.length ? rows.slice(0, 4).map((r) => `${r.label} ${Math.round(r.share)}%`).join(" · ") : null);
    return (
        <div className="rounded-lg border border-line bg-ground p-4">
            <p className="text-sm font-semibold text-ink">ADX's audience estimate</p>
            <p className="mt-1 text-xs text-dim">{audience.basis}</p>
            {a && (
                <dl className="mt-3 grid gap-2 text-xs text-ink md:grid-cols-2">
                    {a.footfall.daily !== null && (
                        <div>
                            <dt className="text-dim">Daily footfall</dt>
                            <dd className="font-medium">{Math.round(a.footfall.daily).toLocaleString("en-IN")}</dd>
                        </div>
                    )}
                    {shares(a.demographics.ageBands) && (
                        <div>
                            <dt className="text-dim">Age</dt>
                            <dd className="font-medium">{shares(a.demographics.ageBands)}</dd>
                        </div>
                    )}
                    {shares(a.demographics.gender) && (
                        <div>
                            <dt className="text-dim">Gender</dt>
                            <dd className="font-medium">{shares(a.demographics.gender)}</dd>
                        </div>
                    )}
                    {shares(a.demographics.incomeBands) && (
                        <div>
                            <dt className="text-dim">Income</dt>
                            <dd className="font-medium">{shares(a.demographics.incomeBands)}</dd>
                        </div>
                    )}
                </dl>
            )}
        </div>
    );
}
