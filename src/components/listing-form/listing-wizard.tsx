"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ApiError, messageOf } from "@/lib/api-client";
import { usePublisher } from "@/app/publisher/layout";
import { CATEGORY_OPTIONS, documentSlotsFor, listingEditorService, RIGHTS_PAPERS, type Catalogue, type ListingDocumentKind, type ListingDraft } from "@/services/listing-editor";
import { AgreementGate } from "./agreement-gate";
import { Problem } from "./fields";
import { chapterOf, emptyForm, formFromDraft, isStepKey, missingBeforeSubmit, missingOn, nextStep, previousStep, toCreateBody, toDraftInput, type ListingForm, type StepKey } from "./form-model";
import { CategoryStep, FormatStep, VenueStep } from "./steps-choose";
import { AudienceStep, DescriptionStep, DetailsStep, OutletStep, VehicleStep } from "./steps-details";
import { PricingStep, RateCardStep, RulesStep, TermsStep } from "./steps-pricing";
import { DocumentsStep, documentsTitle, ReviewStep, VerifyStep } from "./steps-review";
import { ListingChrome, SelectedFormat, StepActions, TaskCard } from "./wizard-frame";

/**
 * Board 08 · Add a listing. The URL is the state — `?step=` names the
 * screen and `?draft=` the saved draft — so Back, refresh and "Save and
 * exit" all land where they should. Every step forward saves the whole
 * form as a draft (`POST`/`PUT /listings/drafts`, the app's LST-… drafts),
 * and the last step creates the listing, files the papers and submits it.
 */
type Loaded = { catalogue: Catalogue | null; draft: ListingDraft | null; error: string | null };

export function ListingWizard({ step: stepParam, draftId: draftParam }: { step: string | null; draftId: string | null }) {
    const router = useRouter();
    const me = usePublisher();
    const step: StepKey = isStepKey(stepParam) ? stepParam : "category";
    const [loaded, setLoaded] = React.useState<Loaded & { key: string }>({ key: "", catalogue: null, draft: null, error: null });
    const [form, setForm] = React.useState<ListingForm>(emptyForm);
    const [draftId, setDraftId] = React.useState<string | null>(draftParam);
    const [hydratedFrom, setHydratedFrom] = React.useState<string | null>(null);
    const [saving, setSaving] = React.useState(false);
    const [submitting, setSubmitting] = React.useState(false);
    const [problem, setProblem] = React.useState<string | null>(null);
    const [agreement, setAgreement] = React.useState<{ version: number | string | null } | null>(null);
    /** The listing once the last step has created it — a retry after a failed paper or submit reuses it. */
    const [createdId, setCreatedId] = React.useState<string | null>(null);
    const filed = React.useRef<Set<string>>(new Set());

    /* The catalogue once, the draft when the URL names one. */
    const loadKey = draftParam ?? "";
    React.useEffect(() => {
        let cancelled = false;
        (async () => {
            const [catalogue, drafts] = await Promise.all([
                listingEditorService.catalogue().catch((caught: unknown) => {
                    if (!cancelled) setLoaded((c) => ({ ...c, key: loadKey, error: messageOf(caught, "Could not load the venue and format catalogue.") }));
                    return null;
                }),
                draftParam ? listingEditorService.drafts().catch(() => [] as ListingDraft[]) : Promise.resolve([] as ListingDraft[]),
            ]);
            if (cancelled) return;
            const draft = draftParam ? (drafts.find((d) => d.id === draftParam || d.displayId === draftParam) ?? null) : null;
            setLoaded((c) => ({ key: loadKey, catalogue, draft, error: draftParam && !draft ? "That draft is not yours, or is gone. Starting a new listing." : c.error }));
        })();
        return () => {
            cancelled = true;
        };
    }, [draftParam, loadKey]);

    /* Hydrate the form from the draft once it is read — one write, keyed on the draft, never a mirror. */
    if (loaded.key === loadKey && loaded.draft && hydratedFrom !== loaded.draft.id) {
        setForm(formFromDraft(loaded.draft).form);
        setDraftId(loaded.draft.id);
        setHydratedFrom(loaded.draft.id);
    }
    /* A draft the URL names but the account no longer has: start clean rather than PUT to a gone id. */
    if (loaded.key === loadKey && draftParam && !loaded.draft && draftId === draftParam) setDraftId(null);

    /* A resumed draft with no step in the URL opens where the person stopped. */
    React.useEffect(() => {
        if (!stepParam && loaded.draft && hydratedFrom === loaded.draft.id) {
            router.replace(`/publisher/listings/new?step=${formFromDraft(loaded.draft).step}&draft=${encodeURIComponent(loaded.draft.id)}`);
        }
    }, [stepParam, loaded.draft, hydratedFrom, router]);

    const catalogue = loaded.catalogue;
    const set = React.useCallback((patch: Partial<ListingForm>) => setForm((current) => ({ ...current, ...patch })), []);

    const persist = React.useCallback(
        async (next: ListingForm, at: StepKey): Promise<string | null> => {
            setSaving(true);
            try {
                const saved = await listingEditorService.saveDraft(toDraftInput(next, at), draftId);
                setDraftId(saved.id);
                return saved.id;
            } catch (caught) {
                toast.error(messageOf(caught, "Could not save the draft."));
                return draftId;
            } finally {
                setSaving(false);
            }
        },
        [draftId]
    );

    const go = React.useCallback(
        async (to: StepKey, save = true) => {
            setProblem(null);
            const id = save ? await persist(form, to) : draftId;
            router.push(`/publisher/listings/new?step=${to}${id ? `&draft=${encodeURIComponent(id)}` : ""}`);
        },
        [draftId, form, persist, router]
    );

    const saveAndExit = async () => {
        await persist(form, step);
        router.push("/publisher/inventory");
    };

    const missing = missingOn(step, form, catalogue);
    const chapter = chapterOf(step);
    const media = form.category === "MEDIA";
    const transit = form.category === "TRANSIT";

    /* The last step: create, file the papers, submit. Idempotent across a retry — the created id and the filed kinds are remembered. */
    const submit = async () => {
        setSubmitting(true);
        setProblem(null);
        try {
            const gaps = missingBeforeSubmit(form, catalogue);
            if (gaps.length) {
                setProblem(`Still needed: ${gaps.map((g) => g.fields.join(", ")).join("; ")}.`);
                return;
            }
            let id = createdId;
            if (!id) {
                const created = await listingEditorService.create({ ...toCreateBody(form, catalogue), ...(draftId ? { draftId } : {}) });
                id = created.id;
                setCreatedId(id);
            }
            const term = form.rightsBasis && form.rightsBasis !== "OWNED" && form.rightsValidUntil ? form.rightsValidUntil : null;
            for (const slot of documentSlotsFor(form.category)) {
                const answer = form.documents[slot.key];
                if (!answer || !("url" in answer) || filed.current.has(slot.key)) continue;
                await listingEditorService.addDocument(id, { kind: slot.kind, url: answer.url, ...(term && RIGHTS_PAPERS.has(slot.kind) ? { expiresAt: term } : {}) });
                filed.current.add(slot.key);
            }
            for (const [key, file] of Object.entries(form.audienceDocs)) {
                if (!file || filed.current.has(`audience:${key}`)) continue;
                await listingEditorService.addDocument(id, { kind: "OTHER" as ListingDocumentKind, url: file.url });
                filed.current.add(`audience:${key}`);
            }
            const listing = await listingEditorService.submit(id);
            router.push(`/publisher/listings/new/submitted?id=${encodeURIComponent(listing.id)}`);
        } catch (caught) {
            if (caught instanceof ApiError && caught.code === "AGREEMENT_REQUIRED") {
                setAgreement({ version: (caught.details as { version?: number | string } | undefined)?.version ?? null });
                return;
            }
            setProblem(createdId ? `${messageOf(caught, "Could not send this listing.")} The listing is saved as a draft — pressing submit again picks up where this left off.` : messageOf(caught, "Could not save this listing."));
        } finally {
            setSubmitting(false);
        }
    };

    const categoryName = CATEGORY_OPTIONS.find((c) => c.id === form.category)?.title.replace(" Ad Spots", "") ?? null;
    const formatLine = catalogue?.mediaTypes.find((m) => m.id === form.mediaTypeId)?.name.split(" — ").pop() ?? null;

    const card = (() => {
        switch (step) {
            case "category":
                return { title: "Ad space category", body: <CategoryStep form={form} set={set} catalogue={catalogue} kycVerified={me?.kycStatus === "VERIFIED"} />, primary: form.category ? `Continue with ${categoryName}` : "Choose a category" };
            case "venue":
                return { title: CATEGORY_OPTIONS.find((c) => c.id === form.category)?.venueTitle ?? "Venue", body: <VenueStep form={form} set={set} catalogue={catalogue} />, primary: "Continue" };
            case "format":
                return { title: CATEGORY_OPTIONS.find((c) => c.id === form.category)?.formatTitle ?? "Format", body: <FormatStep form={form} set={set} catalogue={catalogue} />, primary: form.mediaTypeId ? "Continue" : "Select a format" };
            case "details":
                return {
                    title: media ? "Outlet and audience reach" : transit ? "Vehicle and route" : "Location and dimensions",
                    subtitle: media ? "Use the outlet details and audience figures from your current media information." : undefined,
                    format: formatLine,
                    body: media ? <OutletStep form={form} set={set} catalogue={catalogue} /> : transit ? <VehicleStep form={form} set={set} catalogue={catalogue} /> : <DetailsStep form={form} set={set} catalogue={catalogue} />,
                    primary: "Continue",
                };
            case "description":
                return { title: "Space description", subtitle: "Describe the setting, audience and what makes this placement useful.", body: <DescriptionStep form={form} set={set} catalogue={catalogue} />, primary: "Continue" };
            case "audience":
                return { title: "Audience evidence", subtitle: "Optional details. Add figures you can support, and leave anything you do not know blank.", body: <AudienceStep form={form} set={set} catalogue={catalogue} />, primary: Object.values(form.audience).some(Boolean) || form.audienceDocs.barc || form.audienceDocs.footfall ? "Continue" : "Continue without extra evidence" };
            case "terms":
                return { title: "Availability and booking terms", body: <TermsStep form={form} set={set} catalogue={catalogue} />, primary: "Continue" };
            case "pricing":
                return { title: "Listing price", body: <PricingStep form={form} set={set} catalogue={catalogue} listingId={createdId} />, primary: "Continue" };
            case "ratecard":
                return { title: "Rate card", subtitle: "Include the current rate card and any seasonal variations.", body: <RateCardStep form={form} set={set} catalogue={catalogue} />, primary: "Continue" };
            case "rules":
                return { title: "Content rules", subtitle: "Tell advertisers which categories you accept and where prior approval is required.", body: <RulesStep form={form} set={set} catalogue={catalogue} />, primary: "Continue" };
            case "review":
                return { title: "Listing review", subtitle: "Check the information below before adding verification proof.", body: <ReviewStep form={form} set={set} catalogue={catalogue} go={(to) => void go(to)} />, primary: "Continue to verification" };
            case "verify":
                return { title: "Verification documents", subtitle: "ADX reviews the listing information and supporting documents before it goes live.", body: <VerifyStep form={form} set={set} catalogue={catalogue} go={(to) => void go(to)} />, primary: "Add verification proof" };
            case "documents": {
                const t = documentsTitle(form.category);
                return { title: t.title, subtitle: t.subtitle, body: <DocumentsStep form={form} set={set} catalogue={catalogue} />, primary: "Submit listing for review", submit: true };
            }
        }
    })();

    const back = previousStep(step);
    const forward = nextStep(step);

    return (
        <ListingChrome crumb="Add a listing" chapter={chapter} onSaveAndExit={saveAndExit} saving={saving}>
            {loaded.error && <Problem>{loaded.error}</Problem>}
            <TaskCard title={card.title} subtitle={card.subtitle} className={loaded.error ? "mt-4" : undefined}>
                {"format" in card && card.format && <SelectedFormat>{card.format}</SelectedFormat>}
                <div className={"format" in card && card.format ? "mt-4" : undefined}>{card.body}</div>
                {problem && <div className="mt-4"><Problem>{problem}</Problem></div>}
            </TaskCard>
            <StepActions
                back={step === "category" ? "Business profile" : "Back"}
                backHref={step === "category" ? (me?.kycStatus === "VERIFIED" ? "/publisher/profile" : "/publisher/listings/new/verify-business") : undefined}
                onBack={back ? () => void go(back) : undefined}
                primary={card.primary}
                primaryDisabled={missing.length > 0}
                busy={submitting || (saving && !submitting)}
                onPrimary={() => {
                    if ("submit" in card && card.submit) void submit();
                    else if (forward) void go(forward);
                }}
            />
            {missing.length > 0 && step !== "category" && step !== "format" && step !== "venue" && <p className="mt-3 text-right text-xs text-dim">Still needed: {missing.join(", ")}.</p>}
            {agreement && (
                <AgreementGate
                    onAccepted={() => {
                        setAgreement(null);
                        void submit();
                    }}
                    onClose={() => setAgreement(null)}
                />
            )}
        </ListingChrome>
    );
}
