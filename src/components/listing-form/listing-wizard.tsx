"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ApiError, messageOf } from "@/lib/api-client";
import { usePublisher } from "@/app/publisher/layout";
import { CATEGORY_OPTIONS, descriptionDraftKey, listingEditorService, type Catalogue, type ListingDraft } from "@/services/listing-editor";
import { flowsService, type WizardFlow } from "@/services/flows";
import type { PublisherReadiness } from "@/services/publisher-workspace";
import { missingWords, readinessAction } from "@/components/publisher-home/home-model";
import { AgreementGate } from "./agreement-gate";
import { useInstantBookingOn } from "./instant-booking";
import { SuggestedRateCard } from "./suggested-rate";
import { Problem } from "./fields";
import { termsVersionOf, TERMS_FIELD, type ExtraAnswer } from "@/services/listing-site-questions";
import { chapterOf, declarationsBody, documentPostsOf, emptyForm, formFromDraft, isStepKey, missingBeforeSubmit, missingOn, nextStep, previousStep, toCreateBody, toDraftInput, type ListingForm, type StepKey } from "./form-model";
import { chapterOfScreen, extraAnswersOf, flowGaps, flowMissingOn, flowScreens, formFromFlowAnswers, formInPlay, isBlank, isChoiceScreen, resolveScreenKey, toFlowDraftInput } from "./flow/flow-model";
import { FlowScreenView } from "./flow/flow-screen";
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
 *
 * FL-1 (27 Sep 2026): the screens, fields, labels, order and branches come
 * from `flows.listing` (`GET /config`, the flow the console's flow editor
 * keeps and both apps render), drawn with the site's designed controls
 * (`flow/`). The form stays the answers object; `flow-model.ts` binds each
 * flow field id to its key, and the create body is `toCreateBody` of the
 * answers in play — the same body the baked steps sent. When the flow
 * read fails, or the row holds no wizard, the baked steps below draw the
 * wizard exactly as before.
 */
type Loaded = { catalogue: Catalogue | null; draft: ListingDraft | null; flow: WizardFlow | null; error: string | null };

export function ListingWizard({ step: stepParam, draftId: draftParam }: { step: string | null; draftId: string | null }) {
    const router = useRouter();
    const me = usePublisher();
    /* QR-3: the server's readiness rides on the same read the layout made; the type there is narrower than the row. */
    const readiness = (me as (typeof me & { readiness?: PublisherReadiness | null }) | null)?.readiness ?? null;
    const instantOn = useInstantBookingOn();
    /* The AI allowance's bucket: the saved draft's id once there is one, else a key made for this visit. */
    const [visitKey] = React.useState(() => descriptionDraftKey(null));
    const step: StepKey = isStepKey(stepParam) ? stepParam : "category";
    const [loaded, setLoaded] = React.useState<Loaded & { key: string }>({ key: "", catalogue: null, draft: null, flow: null, error: null });
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

    /* The catalogue once, the flow once, the draft when the URL names one. */
    const loadKey = draftParam ?? "";
    React.useEffect(() => {
        let cancelled = false;
        (async () => {
            const [catalogue, drafts, flow] = await Promise.all([
                listingEditorService.catalogue().catch((caught: unknown) => {
                    if (!cancelled) setLoaded((c) => ({ ...c, key: loadKey, error: messageOf(caught, "Could not load the venue and format catalogue.") }));
                    return null;
                }),
                draftParam ? listingEditorService.drafts().catch(() => [] as ListingDraft[]) : Promise.resolve([] as ListingDraft[]),
                // FL-1: a failed read, or a row with no wizard under `listing`, means the baked steps.
                flowsService.listing().catch(() => null),
            ]);
            if (cancelled) return;
            const draft = draftParam ? (drafts.find((d) => d.id === draftParam || d.displayId === draftParam) ?? null) : null;
            setLoaded((c) => ({ key: loadKey, catalogue, draft, flow, error: draftParam && !draft ? "That draft is not yours, or is gone. Starting a new listing." : c.error }));
        })();
        return () => {
            cancelled = true;
        };
    }, [draftParam, loadKey]);

    const ready = loaded.key === loadKey;
    const flow = ready ? loaded.flow : null;

    /* Hydrate the form from the draft once it is read — one write, keyed on the draft, never a mirror. A phone draft under the flow keeps every answer, bound or not. */
    if (ready && loaded.draft && hydratedFrom !== loaded.draft.id) {
        const answers = loaded.draft.answers ?? {};
        setForm(flow && !(answers.web && typeof answers.web === "object") ? formFromFlowAnswers(answers) : formFromDraft(loaded.draft).form);
        setDraftId(loaded.draft.id);
        setHydratedFrom(loaded.draft.id);
    }
    /* A draft the URL names but the account no longer has: start clean rather than PUT to a gone id. */
    if (ready && draftParam && !loaded.draft && draftId === draftParam) setDraftId(null);

    /* FL-1: the screens in play — the root, then the chosen category's branch — and the one `?step=` names (an old baked key finds its screen by the field it asked). */
    const screens = React.useMemo(() => (flow ? flowScreens(flow, form) : []), [flow, form]);
    const screenKey = flow ? resolveScreenKey(stepParam, screens) : null;
    const screenIndex = screenKey ? screens.findIndex((s) => s.key === screenKey) : -1;
    const screen = screenIndex >= 0 ? screens[screenIndex]! : null;
    /** The current position in whichever vocabulary is in force: a flow screen key, or a baked step key. */
    const at: string = screenKey ?? step;

    /* A resumed draft with no step in the URL opens where the person stopped. */
    React.useEffect(() => {
        if (!stepParam && loaded.draft && hydratedFrom === loaded.draft.id) {
            const resumeAt = flow ? resolveScreenKey(loaded.draft.stepKey, flowScreens(flow, formFromDraft(loaded.draft).form)) : formFromDraft(loaded.draft).step;
            router.replace(`/publisher/listings/new?step=${resumeAt}&draft=${encodeURIComponent(loaded.draft.id)}`);
        }
    }, [stepParam, loaded.draft, hydratedFrom, router, flow]);

    const catalogue = loaded.catalogue;
    const set = React.useCallback((patch: Partial<ListingForm>) => setForm((current) => ({ ...current, ...patch })), []);

    const persist = React.useCallback(
        async (next: ListingForm, position: string): Promise<string | null> => {
            setSaving(true);
            try {
                const input = flow ? toFlowDraftInput(next, flow, position) : toDraftInput(next, isStepKey(position) ? position : "category");
                const saved = await listingEditorService.saveDraft(input, draftId);
                setDraftId(saved.id);
                return saved.id;
            } catch (caught) {
                toast.error(messageOf(caught, "Could not save the draft."));
                return draftId;
            } finally {
                setSaving(false);
            }
        },
        [draftId, flow]
    );

    const go = React.useCallback(
        async (to: string, save = true) => {
            setProblem(null);
            const id = save ? await persist(form, to) : draftId;
            router.push(`/publisher/listings/new?step=${to}${id ? `&draft=${encodeURIComponent(id)}` : ""}`);
        },
        [draftId, form, persist, router]
    );

    const saveAndExit = async () => {
        await persist(form, at);
        router.push("/publisher/inventory");
    };

    const missing = screen ? flowMissingOn(screen, form, catalogue) : missingOn(step, form, catalogue);
    const chapter = screen ? chapterOfScreen(screen.key, screenIndex, screens.length) : chapterOf(step);
    const media = form.category === "MEDIA";
    const transit = form.category === "TRANSIT";

    /* The last step: create, file the papers, submit. Idempotent across a retry — the created id and the filed kinds are remembered. */
    const submit = async () => {
        setSubmitting(true);
        setProblem(null);
        try {
            const gaps = flow ? flowGaps(flow, form, catalogue).map((g) => ({ fields: g.fields })) : missingBeforeSubmit(form, catalogue);
            if (gaps.length) {
                setProblem(`Still needed: ${gaps.map((g) => g.fields.join(", ")).join("; ")}.`);
                return;
            }
            /* FL-1: under the flow, only the answers its screens asked for are filed — a branch the publisher left is not. */
            const filing = flow ? formInPlay(form, flow) : form;
            let id = createdId;
            if (!id) {
                /*
                 * The listing-data-gaps lot: beside the columns, what the create used to lose — the tick (and
                 * the flow it was ticked on), "I own the venue", the papers marked not applicable, and every
                 * answer no column takes, in the words the flow asked it.
                 */
                const extraAnswers: ExtraAnswer[] = flow
                    ? extraAnswersOf(filing, flow)
                    : Object.entries(filing.extra)
                          .filter(([key, value]) => key !== TERMS_FIELD && !isBlank(value))
                          .map(([key, value]) => ({ key, label: key, value: value && typeof value === "object" && "url" in (value as object) ? (value as { url: string }).url : value }));
                const body: Record<string, unknown> = { ...toCreateBody(filing, catalogue), ...declarationsBody(filing, { termsVersion: termsVersionOf(flow), extraAnswers }), ...(draftId ? { draftId } : {}) };
                // Lot D: the switch is only drawn while the flag is on; a draft saved before it went off does not opt in.
                if (!instantOn) delete body.instantBooking;
                const created = await listingEditorService.create(body);
                id = created.id;
                setCreatedId(id);
            }
            /* The site's slots, the flow's `kind:` papers, then the two audience reports as AUDIENCE_RATING / FOOTFALL_AUDIT (LF-2) — one post each. */
            for (const { key, ...paper } of documentPostsOf(filing)) {
                if (filed.current.has(key)) continue;
                await listingEditorService.addDocument(id, paper);
                filed.current.add(key);
            }
            const listing = await listingEditorService.submit(id);
            router.push(`/publisher/listings/new/submitted?id=${encodeURIComponent(listing.id)}`);
        } catch (caught) {
            if (caught instanceof ApiError && caught.code === "AGREEMENT_REQUIRED") {
                setAgreement({ version: (caught.details as { version?: number | string } | undefined)?.version ?? null });
                return;
            }
            if (caught instanceof ApiError && caught.code === "PROFILE_INCOMPLETE") {
                setProblem(`${caught.message} Complete your details in Business profile, then submit again — this listing is kept as a draft.`);
                return;
            }
            if (caught instanceof ApiError && caught.code === "CITY_NOT_OPEN") {
                setProblem(`${caught.message} This listing is kept as a draft; ADX lets you know when the city opens.`);
                return;
            }
            if (caught instanceof ApiError && (caught.code === "FEATURE_OFF" || caught.code === "NO_MEETING_PLACE")) {
                setProblem(`${caught.message} Turn off "Accept bookings automatically" on the booking terms step, or add your address, and submit again.`);
                return;
            }
            setProblem(createdId ? `${messageOf(caught, "Could not send this listing.")} The listing is saved as a draft — pressing submit again picks up where this left off.` : messageOf(caught, "Could not save this listing."));
        } finally {
            setSubmitting(false);
        }
    };

    const aiKey = draftId && descriptionDraftKey(draftId) === draftId ? draftId : visitKey;
    const categoryName = CATEGORY_OPTIONS.find((c) => c.id === form.category)?.title.replace(" Ad Spots", "") ?? null;
    const formatLine = catalogue?.mediaTypes.find((m) => m.id === form.mediaTypeId)?.name.split(" — ").pop() ?? null;
    const missingBasics = readiness && !readiness.canList ? { words: missingWords(readiness), href: readinessAction(readiness)?.href ?? "/publisher/profile" } : null;

    /* FL-1: under the flow, the root screen is the end only once there is nothing to branch to (the apps' rule). */
    const flowAtEnd = !!flow && screenIndex === screens.length - 1 && (form.category !== null || Object.keys(flow.branches).length === 0);

    const card: { title: string; subtitle?: string; format?: string | null; body: React.ReactNode; primary: string; submit?: boolean } = (() => {
        if (flow && screen) {
            return {
                title: screen.title,
                subtitle: screen.subtitle,
                body: <FlowScreenView flow={flow} screen={screen} screens={screens} isLast={flowAtEnd} form={form} set={set} catalogue={catalogue} listingId={createdId} aiBucket={{ draftKey: aiKey }} kycVerified={me?.kycStatus === "VERIFIED"} missingBasics={missingBasics} go={(to) => void go(to)} />,
                primary: screen.ctaLabel,
                submit: flowAtEnd,
            };
        }
        switch (step) {
            case "category":
                return {
                    title: "Ad space category",
                    body: <CategoryStep form={form} set={set} catalogue={catalogue} kycVerified={me?.kycStatus === "VERIFIED"} missingBasics={missingBasics} />,
                    primary: form.category ? `Continue with ${categoryName}` : "Choose a category",
                };
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
                return { title: "Space description", subtitle: "Describe the setting, audience and what makes this placement useful.", body: <DescriptionStep form={form} set={set} catalogue={catalogue} aiBucket={{ draftKey: aiKey }} />, primary: "Continue" };
            case "audience":
                return { title: "Audience evidence", subtitle: "Optional details. Add figures you can support, and leave anything you do not know blank.", body: <AudienceStep form={form} set={set} catalogue={catalogue} />, primary: Object.values(form.audience).some(Boolean) || form.audienceDocs.barc || form.audienceDocs.footfall ? "Continue" : "Continue without extra evidence" };
            case "terms":
                return { title: "Availability and booking terms", body: <TermsStep form={form} set={set} catalogue={catalogue} />, primary: "Continue" };
            case "pricing":
                return {
                    title: "Listing price",
                    body: (
                        <div className="space-y-6">
                            <PricingStep form={form} set={set} catalogue={catalogue} listingId={createdId} />
                            {/* Lot E: ADX's offer, once the listing exists — a submit that got part of the way. Accepting writes the rate; the form follows it, per day. */}
                            {createdId && <SuggestedRateCard listingId={createdId} onAccepted={(next) => next.ratePerDay && set({ basePrice: String(Number(next.ratePerDay)), pricingUnit: "PER_DAY" })} />}
                        </div>
                    ),
                    primary: "Continue",
                };
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

    const back: string | null = screen ? (screens[screenIndex - 1]?.key ?? null) : previousStep(step);
    const forward: string | null = screen ? (screens[screenIndex + 1]?.key ?? null) : nextStep(step);
    const first = screen ? screenIndex === 0 : step === "category";
    const quiet = screen ? isChoiceScreen(screen) : step === "category" || step === "format" || step === "venue";

    /* The chrome waits for the flow read, so the wizard never flashes one set of steps and then draws another. */
    if (!ready) {
        return (
            <ListingChrome crumb="Add a listing" chapter={1} saving={false}>
                <TaskCard title="Add a listing">
                    <div className="h-40 animate-pulse rounded-md bg-ground" aria-busy="true" />
                </TaskCard>
            </ListingChrome>
        );
    }

    return (
        <ListingChrome crumb="Add a listing" chapter={chapter} onSaveAndExit={saveAndExit} saving={saving}>
            {loaded.error && <Problem>{loaded.error}</Problem>}
            <TaskCard title={card.title} subtitle={card.subtitle} className={loaded.error ? "mt-4" : undefined}>
                {card.format && <SelectedFormat>{card.format}</SelectedFormat>}
                <div className={card.format ? "mt-4" : undefined}>{card.body}</div>
                {problem && <div className="mt-4"><Problem>{problem}</Problem></div>}
            </TaskCard>
            <StepActions
                back={first ? "Business profile" : "Back"}
                backHref={first ? (me?.kycStatus === "VERIFIED" ? "/publisher/profile" : "/publisher/listings/new/verify-business") : undefined}
                onBack={back ? () => void go(back) : undefined}
                primary={card.primary}
                primaryDisabled={missing.length > 0}
                busy={submitting || (saving && !submitting)}
                onPrimary={() => {
                    if (card.submit) void submit();
                    else if (forward) void go(forward);
                }}
            />
            {missing.length > 0 && !quiet && <p className="mt-3 text-right text-xs text-dim">Still needed: {missing.join(", ")}.</p>}
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
