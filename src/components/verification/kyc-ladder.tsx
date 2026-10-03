"use client";

import * as React from "react";
import Link from "next/link";
import { AlertCircle, Check } from "lucide-react";
import { brandButton, CardTitle, Field, inputClass, KeyRow, outlineButton, quietLink } from "@/components/publisher/parts";
import { Panel } from "@/components/workspace/page-heading";
import { DigioPanel } from "@/components/verification/digio-panel";
import { DocumentTile, type TileEntry } from "@/components/verification/document-tile";
import { AddressFinder, fillFromPlace } from "@/components/listing-form/address-search";
import type { GeocodedPlace } from "@/services/listing-editor";
import { RequestedByAdx } from "@/components/verification/requested-by-adx";
import { SessionResumeCard } from "@/components/verification/session-resume";
import { ApiError, messageOf } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { isoToday, isoYearsAgo, ORDER_AGE_HINT } from "@/services/party";
import {
    backupStandsIn,
    captureReady,
    digioUnavailableLine,
    identityStartOffered,
    fieldsFor,
    finalAnswers,
    formPatch,
    formProblems,
    GENDER_OPTIONS,
    isPartialManifest,
    isVideoStep,
    ladderSteps,
    partialSummaryOf,
    resumeIndex,
    SESSION_COPY,
    summaryOf,
    uploadPurposeFor,
    verification,
    visibleDocuments,
    type CaptureStep,
    type KycAnswers,
    type KycEntityType,
    type KycRequestStamp,
    type ManifestDocument,
    type ManifestStep,
    type OnboardingManifest,
    type ProfilePoint,
} from "@/services/verification";

export interface LadderOutcome {
    /** The flagged-only ladder was resubmitted, rather than the whole climb. */
    partial: boolean;
    /** Cashfree Phase 2: `session` — verified by ADX's own identity check. */
    via: "uploads" | "digio" | "session";
    /** What was sent, for the "Almost there" rows. */
    rows: { label: string; value: string }[];
}

/** The outcome a verified check hands the page: by Digio, or by ADX's own identity check (never named "Cashfree"). */
export function verifiedOutcome(how: "digio" | "session"): LadderOutcome {
    return { partial: false, via: how, rows: [{ label: "Identity", value: how === "session" ? "Verified" : "Verified by Digio" }] };
}

/**
 * The onboarding ladder on the web — `GET /users/me/onboarding-manifest`
 * drawn rung by rung, the way the app's `StepRoute` walks it (form steps,
 * the KYC intro, the capture steps, the review), never a fixed list of
 * documents: a flow edited in the console, or the flagged-only ladder of a
 * NEEDS_INFO record (Lot D, Q42), draws itself.
 *
 * The rungs sit in a rail on the left; a rung already passed can be gone
 * back to, the next only through its own Continue. Files go up the moment
 * they are picked, under the party's private purpose, so the review step
 * has nothing left to wait for. The liveness clip is recorded onto the
 * person's UserKyc row (`POST /user-kyc/me`) on its own step, before the
 * review — the desk's VERIFIED is gated on that row. The review posts the
 * documents to the party's own route and, for a publisher's whole climb,
 * closes the onboarding (`POST /publishers/me/complete-onboarding`).
 */
export function KycLadder({
    manifest,
    answers: initialAnswers,
    record,
    onFinished,
    onExit,
    exitLabel = "Back",
    entityType,
    onEntityType,
    resume,
}: {
    manifest: OnboardingManifest;
    /** The row's facts, for the form steps to start from. */
    answers: Record<string, string>;
    /** The party's KYC row, for the desk's "Requested by ADX" line on the intro — and the PAN it already holds. */
    record?: (KycRequestStamp & Pick<KycAnswers, "panNumber">) | null;
    onFinished: (outcome: LadderOutcome) => void;
    /** Out of the ladder, from its first rung. */
    onExit?: () => void;
    exitLabel?: string;
    /** Phase D: the party's legal form, when the page knows it better than the manifest it read — null asks before Digio starts. */
    entityType?: KycEntityType | null;
    /** Told the form a Digio check started on, when it was chosen on the intro. */
    onEntityType?: (value: KycEntityType) => void;
    /** Cashfree Phase 2: the person has an identity check open — the intro offers it back (C-RESUME) instead of the Digio start. */
    resume?: (() => void) | null;
}) {
    const steps = React.useMemo(() => ladderSteps(manifest), [manifest]);
    const partial = isPartialManifest(manifest);
    const party = manifest.party;
    const [answers, setAnswers] = React.useState<Record<string, string>>(initialAnswers);
    const [index, setIndex] = React.useState(() => resumeIndex(steps, manifest.accountType, initialAnswers, partial));
    const [reached, setReached] = React.useState(index);
    /* 28 Sep 2026: never ask twice — a re-upload opens with the PAN the row already holds. */
    const [kyc, setKyc] = React.useState<KycAnswers>(() => (record?.panNumber ? { panNumber: record.panNumber } : {}));
    const [files, setFiles] = React.useState<Record<string, TileEntry>>({});
    const [livenessFileId, setLivenessFileId] = React.useState<string | null>(null);
    const [digio, setDigio] = React.useState(false);
    const topRef = React.useRef<HTMLDivElement>(null);

    const step = steps[index];
    const go = (next: number) => {
        setIndex(next);
        setReached((current) => Math.max(current, next));
        setDigio(false);
        topRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
    };
    const back = () => (index > 0 ? go(index - 1) : onExit?.());
    const forward = () => go(Math.min(index + 1, steps.length - 1));

    /** Upload the picked file as it is picked, and put the URL against the tile's column. */
    const store = async (captureStep: CaptureStep, doc: ManifestDocument, file: File) => {
        setFiles((current) => ({ ...current, [doc.key]: { name: file.name, busy: true } }));
        try {
            const stored = await verification.upload(file, uploadPurposeFor(doc, party));
            setFiles((current) => {
                const next = { ...current, [doc.key]: { name: file.name, url: stored.url, id: stored.id, busy: false } };
                // Tiles on one column are alternatives: taking one clears the others.
                for (const other of captureStep.documents) if (other.key !== doc.key && other.field === doc.field) delete next[other.key];
                return next;
            });
            if (doc.video) setLivenessFileId(null);
            else setKyc((current) => ({ ...current, [doc.field]: stored.url, ...(doc.sets ? { [doc.sets.field]: doc.sets.value } : {}) }));
        } catch (caught) {
            setFiles((current) => ({ ...current, [doc.key]: { name: file.name, busy: false, error: messageOf(caught, "The upload did not go through. Try again.") } }));
        }
    };

    if (steps.length === 0 || !step) {
        return (
            <Panel className="mt-6">
                <p className="text-sm text-dim">There is nothing to fill in here right now.</p>
                {onExit && (
                    <button type="button" onClick={onExit} className={cn(outlineButton, "mt-4")}>
                        {exitLabel}
                    </button>
                )}
            </Panel>
        );
    }

    return (
        <div ref={topRef} className="mt-6 grid scroll-mt-6 gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
            <StepRail steps={steps} index={index} reached={reached} onJump={go} />
            <div className="min-w-0">
                {step.kind === "form" && (
                    <FormStepView
                        key={step.key}
                        step={step}
                        accountType={manifest.accountType}
                        answers={answers}
                        onSaved={(patch) => {
                            setAnswers((current) => ({ ...current, ...patch }));
                            forward();
                        }}
                        onBack={index > 0 || onExit ? back : undefined}
                        backLabel={index > 0 ? "Back" : exitLabel}
                    />
                )}
                {step.kind === "kyc-intro" &&
                    (digio ? (
                        <DigioPanel
                            side={party}
                            entityType={entityType === undefined ? manifest.entityType : entityType}
                            onEntityType={onEntityType}
                            allowTypeChange={identityStartOffered(manifest.verification?.digio)}
                            onVerified={(how) => onFinished(verifiedOutcome(how))}
                            onUploadsInstead={() => {
                                setDigio(false);
                                forward();
                            }}
                            onClose={() => setDigio(false)}
                        />
                    ) : (
                        <IntroStepView step={step} manifest={manifest} record={record ?? null} onDigio={() => setDigio(true)} resume={resume ?? null} onUploads={forward} onBack={index > 0 || onExit ? back : undefined} backLabel={index > 0 ? "Back" : exitLabel} />
                    ))}
                {step.kind === "capture" && (
                    <CaptureStepView
                        key={step.key}
                        step={step}
                        kyc={kyc}
                        files={files}
                        livenessFileId={livenessFileId}
                        onFile={(doc, file) => void store(step, doc, file)}
                        onText={(value) => setKyc((current) => ({ ...current, panNumber: value }))}
                        onLiveness={setLivenessFileId}
                        onContinue={forward}
                        onBack={index > 0 || onExit ? back : undefined}
                        backLabel={index > 0 ? "Back" : exitLabel}
                    />
                )}
                {step.kind === "checklist" && (
                    <ChecklistView
                        step={step}
                        manifest={manifest}
                        kyc={kyc}
                        files={files}
                        livenessFileId={livenessFileId}
                        onSubmitted={onFinished}
                        onBack={index > 0 || onExit ? back : undefined}
                        backLabel={index > 0 ? "Back" : exitLabel}
                    />
                )}
            </div>
        </div>
    );
}

/* ------------------------------------------------------------------ */
/* The rail                                                            */
/* ------------------------------------------------------------------ */

function StepRail({ steps, index, reached, onJump }: { steps: ManifestStep[]; index: number; reached: number; onJump: (index: number) => void }) {
    return (
        <nav aria-label="Verification steps" className="lg:sticky lg:top-6 lg:self-start">
            <p className="text-xs font-semibold uppercase tracking-wide text-dim">
                Step {index + 1} of {steps.length}
            </p>
            <ol className="mt-3 grid gap-1">
                {steps.map((step, position) => {
                    const current = position === index;
                    const done = position < reached && !current;
                    const reachable = position <= reached && !current;
                    return (
                        <li key={`${step.key}-${position}`}>
                            <button
                                type="button"
                                disabled={!reachable}
                                onClick={() => onJump(position)}
                                aria-current={current ? "step" : undefined}
                                className={cn("flex w-full items-center gap-3 rounded-md px-2 py-2 text-left text-sm transition-colors", current ? "bg-white font-semibold text-ink shadow-card" : reachable ? "text-ink hover:bg-white/70" : "text-dim")}
                            >
                                <span className={cn("flex size-6 shrink-0 items-center justify-center rounded-full border text-[11px] font-semibold", current ? "border-brand bg-brand text-white" : done ? "border-ink bg-ink text-white" : "border-line bg-white text-dim")}>
                                    {done && !current ? <Check className="size-3.5" aria-hidden /> : position + 1}
                                </span>
                                <span className="min-w-0 truncate">{step.title}</span>
                            </button>
                        </li>
                    );
                })}
            </ol>
        </nav>
    );
}

function StepFooter({ onBack, backLabel, children }: { onBack?: () => void; backLabel: string; children: React.ReactNode }) {
    return (
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-5">
            {onBack ? (
                <button type="button" onClick={onBack} className={outlineButton}>
                    {backLabel}
                </button>
            ) : (
                <span />
            )}
            <div className="flex flex-wrap items-center gap-3">{children}</div>
        </div>
    );
}

/* ------------------------------------------------------------------ */
/* Form steps — DR 08 Steps 2–4                                        */
/* ------------------------------------------------------------------ */

function FormStepView({
    step,
    accountType,
    answers,
    onSaved,
    onBack,
    backLabel,
}: {
    step: Extract<ManifestStep, { kind: "form" }>;
    accountType: OnboardingManifest["accountType"];
    answers: Record<string, string>;
    onSaved: (patch: Record<string, string>) => void;
    onBack?: () => void;
    backLabel: string;
}) {
    const specs = React.useMemo(() => fieldsFor(step.key, accountType), [step.key, accountType]);
    const [values, setValues] = React.useState<Record<string, string>>(() => Object.fromEntries(specs.map((spec) => [spec.key, answers[spec.key] ?? ""])));
    const [problems, setProblems] = React.useState<Record<string, string>>({});
    const [busy, setBusy] = React.useState(false);
    const [failure, setFailure] = React.useState<string | null>(null);
    /* Onboarding addresses (1 Oct 2026): the coordinates of the place picked in the bar — sent with the save, never shown. */
    const [point, setPoint] = React.useState<ProfilePoint | null>(null);

    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        const found = formProblems(specs, values);
        setProblems(found);
        if (Object.keys(found).length > 0) return;
        const patch = formPatch(specs, values);
        setBusy(true);
        setFailure(null);
        try {
            await verification.updatePublisherProfile(point && patch.address ? { ...patch, latitude: point.latitude, longitude: point.longitude } : patch);
            onSaved(patch as Record<string, string>);
        } catch (caught) {
            if (caught instanceof ApiError && Object.keys(caught.fieldErrors).length > 0) {
                setProblems(Object.fromEntries(Object.entries(caught.fieldErrors).map(([key, messages]) => [key, messages[0] ?? "Check this field."])));
            } else setFailure(messageOf(caught, "Could not save your details."));
            setBusy(false);
        }
    };

    const set = (key: string, value: string) => setValues((current) => ({ ...current, [key]: value }));
    const listed = specs.filter((spec) => problems[spec.key]);
    /* A pick fills the boxes the place names — never clears one it is silent on. */
    const onPlace = (place: GeocodedPlace) =>
        fillFromPlace(place, { address: (v) => set("address", v), city: (v) => set("city", v), state: (v) => set("state", v), postalCode: (v) => set("postalCode", v), point: setPoint });

    return (
        <form onSubmit={submit} noValidate>
            <Panel>
                <CardTitle>{step.title}</CardTitle>
                <p className="mt-1 text-sm text-dim">{step.subtitle}</p>
                <div className="mt-5 grid gap-5 md:grid-cols-2">
                    {specs.map((spec) => {
                        const id = `ladder-${spec.key}`;
                        const invalid = Boolean(problems[spec.key]);
                        const inputProps = { id, "aria-invalid": invalid || undefined, className: cn(inputClass, invalid && "border-danger focus:border-danger", spec.uppercase && "uppercase") };
                        const field = (
                            <Field label={`${spec.label}${spec.required ? "" : spec.kind === "gender" ? "" : " (optional)"}`} htmlFor={id}>
                                {spec.kind === "gender" ? (
                                    <select {...inputProps} value={values[spec.key] ?? ""} onChange={(event) => set(spec.key, event.target.value)}>
                                        <option value="">Choose</option>
                                        {GENDER_OPTIONS.map((option) => (
                                            <option key={option.id} value={option.id}>
                                                {option.title}
                                            </option>
                                        ))}
                                    </select>
                                ) : spec.kind === "dob" ? (
                                    <input {...inputProps} type="date" max={isoToday()} min={isoYearsAgo(120)} value={values[spec.key] ?? ""} onChange={(event) => set(spec.key, event.target.value)} autoComplete="bday" />
                                ) : (
                                    <input
                                        {...inputProps}
                                        type={spec.kind === "email" ? "email" : spec.kind === "tel" ? "tel" : "text"}
                                        inputMode={spec.kind === "tel" || spec.numeric ? "numeric" : undefined}
                                        value={values[spec.key] ?? ""}
                                        onChange={(event) => set(spec.key, spec.kind === "tel" || spec.numeric ? event.target.value.replace(/\D/g, "").slice(0, spec.maxLength ?? 15) : spec.uppercase ? event.target.value.toUpperCase() : event.target.value)}
                                        placeholder={spec.placeholder}
                                        maxLength={spec.maxLength}
                                        autoComplete={spec.autoComplete}
                                    />
                                )}
                            </Field>
                        );
                        /* The address: the "Find the address" bar above it and the line full width — City | State and the PIN fall into the pairs after it. */
                        if (spec.key === "address") {
                            return (
                                <React.Fragment key={spec.key}>
                                    <AddressFinder id="ladder-address" className="md:col-span-2" onPlace={onPlace} />
                                    <div className="md:col-span-2">{field}</div>
                                </React.Fragment>
                            );
                        }
                        return <React.Fragment key={spec.key}>{field}</React.Fragment>;
                    })}
                </div>
                {/* Form symmetry: the guidance and the problems go under the whole grid, never under one cell. */}
                {specs.some((spec) => spec.kind === "dob") && <p className="mt-3 text-xs text-dim">{ORDER_AGE_HINT}</p>}
                {listed.length > 0 && (
                    <ul role="alert" className="mt-4 grid gap-1 rounded-md bg-danger-soft px-4 py-3 text-sm text-danger">
                        {listed.map((spec) => (
                            <li key={spec.key}>
                                <span className="font-semibold">{spec.label.split(",")[0]}:</span> {problems[spec.key]}
                            </li>
                        ))}
                    </ul>
                )}
                {failure && (
                    <p role="alert" className="mt-4 text-sm text-danger">
                        {failure}
                    </p>
                )}
                <StepFooter onBack={onBack} backLabel={backLabel}>
                    <button type="submit" disabled={busy} className={brandButton}>
                        {busy ? "Saving…" : "Save & continue"}
                    </button>
                </StepFooter>
            </Panel>
        </form>
    );
}

/* ------------------------------------------------------------------ */
/* The KYC intro — Digio first, the uploads beside it (KYC-D)          */
/* ------------------------------------------------------------------ */

function IntroStepView({
    step,
    manifest,
    record,
    onDigio,
    resume,
    onUploads,
    onBack,
    backLabel,
}: {
    step: Extract<ManifestStep, { kind: "kyc-intro" }>;
    manifest: OnboardingManifest;
    record: KycRequestStamp | null;
    onDigio: () => void;
    resume: (() => void) | null;
    onUploads: () => void;
    onBack?: () => void;
    backLabel: string;
}) {
    const unavailable = digioUnavailableLine(manifest.verification?.digio);
    // Cashfree Phase 2: Digio is off but ADX's own check stands in — the same start, without Digio's name.
    const backup = backupStandsIn(manifest.verification?.digio);
    return (
        <Panel>
            <CardTitle>{step.title}</CardTitle>
            <p className="mt-1 text-sm text-dim">{step.subtitle}</p>
            <RequestedByAdx record={record} className="mt-4" />
            <div className="mt-4 divide-y divide-line border-y border-line">
                {step.bands.map((band) => (
                    <KeyRow key={band.label} label={band.label} value={band.value} />
                ))}
            </div>
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
                {resume ? (
                    <SessionResumeCard bare onContinue={resume} className="rounded-lg border border-ink p-4" />
                ) : (
                    <div className={cn("rounded-lg border p-4", unavailable ? "border-line bg-ground" : "border-ink")}>
                        <p className="text-sm font-semibold text-ink">{backup ? SESSION_COPY.title : "Verify with Digio"}</p>
                        <p className="mt-1 text-xs text-dim">{backup ? SESSION_COPY.intro : "Aadhaar and PAN checked by Digio in about a minute. No uploads, no video."}</p>
                        {unavailable ? (
                            <p className="mt-3 flex items-start gap-2 rounded-md bg-warning-soft px-3 py-2 text-xs text-warning">
                                <AlertCircle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                                {unavailable}
                            </p>
                        ) : (
                            <button type="button" onClick={onDigio} className={cn(brandButton, "mt-3 w-full")}>
                                {backup ? SESSION_COPY.title : "Verify with Digio"}
                            </button>
                        )}
                    </div>
                )}
                <div className="rounded-lg border border-line p-4">
                    <p className="text-sm font-semibold text-ink">Upload your documents</p>
                    <p className="mt-1 text-xs text-dim">ID, PAN, an address proof, a selfie and a short video. Reviewed by ADX, usually within a day.</p>
                    <button type="button" onClick={onUploads} className={cn(unavailable ? brandButton : outlineButton, "mt-3 w-full")}>
                        {unavailable ? step.cta : "Upload documents instead"}
                    </button>
                </div>
            </div>
            <StepFooter onBack={onBack} backLabel={backLabel}>
                {manifest.party === "PUBLISHER" && (
                    <Link href="/publisher/access#my-code" className={quietLink}>
                        An ADX agent is with me
                    </Link>
                )}
            </StepFooter>
        </Panel>
    );
}

/* ------------------------------------------------------------------ */
/* Capture steps — DR 08 Steps 6–10, and the liveness clip             */
/* ------------------------------------------------------------------ */

function CaptureStepView({
    step,
    kyc,
    files,
    livenessFileId,
    onFile,
    onText,
    onLiveness,
    onContinue,
    onBack,
    backLabel,
}: {
    step: CaptureStep;
    kyc: KycAnswers;
    files: Record<string, TileEntry>;
    livenessFileId: string | null;
    onFile: (doc: ManifestDocument, file: File) => void;
    onText: (value: string) => void;
    onLiveness: (fileId: string) => void;
    onContinue: () => void;
    onBack?: () => void;
    backLabel: string;
}) {
    const [text, setText] = React.useState(step.text ? (kyc[step.text.field] ?? "") : "");
    const [textProblem, setTextProblem] = React.useState<string | null>(null);
    const [busy, setBusy] = React.useState(false);
    const [failure, setFailure] = React.useState<string | null>(null);
    const documents = visibleDocuments(step, kyc);
    const video = isVideoStep(step);
    const alternatives = documents.filter((doc) => doc.field === documents[0]?.field).length > 1;
    const ready = captureReady(step, { files, kyc, text }) && !busy;

    const next = async () => {
        if (step.text) {
            if (!new RegExp(step.text.pattern).test(text.toUpperCase())) return setTextProblem(`${step.text.label}: ${step.text.hint}, like ABCDE1234F.`);
            onText(text.toUpperCase());
        }
        if (video) {
            // The clip onto the UserKyc row, by the id the upload minted — the desk's VERIFIED waits on this row.
            const clip = step.documents.map((doc) => files[doc.key]).find((entry) => entry?.id);
            if (!clip?.id) return;
            if (livenessFileId !== clip.id) {
                setBusy(true);
                setFailure(null);
                try {
                    await verification.submitLiveness(clip.id);
                    onLiveness(clip.id);
                } catch (caught) {
                    setFailure(messageOf(caught, "Could not record your video. Try again."));
                    setBusy(false);
                    return;
                }
                setBusy(false);
            }
        }
        onContinue();
    };

    return (
        <Panel>
            <CardTitle>{step.title}</CardTitle>
            <p className="mt-1 text-sm text-dim">{step.subtitle}</p>

            {step.guidance && step.guidance.length > 0 && (
                <div className="mt-4 grid gap-2 sm:grid-cols-3">
                    {step.guidance.map((row) => (
                        <div key={row.label} className="rounded-md bg-ground px-3 py-2.5">
                            <p className="text-xs font-semibold text-ink">{row.label}</p>
                            <p className="mt-0.5 text-xs text-dim">{row.hint}</p>
                        </div>
                    ))}
                </div>
            )}

            {step.text && (
                <div className="mt-5 max-w-sm">
                    <Field label={`${step.text.label} (${step.text.hint.toLowerCase()})`} htmlFor={`ladder-${step.text.field}`}>
                        <input
                            id={`ladder-${step.text.field}`}
                            value={text}
                            onChange={(event) => {
                                setText(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, step.text!.maxLength));
                                setTextProblem(null);
                            }}
                            maxLength={step.text.maxLength}
                            placeholder="ABCDE1234F"
                            aria-invalid={Boolean(textProblem) || undefined}
                            className={cn(inputClass, "uppercase tracking-wide", textProblem && "border-danger")}
                            autoComplete="off"
                        />
                    </Field>
                </div>
            )}

            {alternatives && <p className="mt-5 text-sm text-ink">Choose one:</p>}
            <div className={cn("grid gap-4", alternatives ? "mt-2" : "mt-5", documents.length > 2 ? "md:grid-cols-3" : documents.length === 2 ? "md:grid-cols-2" : "md:max-w-md")}>
                {documents.map((doc) => (
                    <DocumentTile
                        key={doc.key}
                        label={doc.label}
                        hint={doc.hint}
                        entry={files[doc.key]}
                        onFile={(file) => onFile(doc, file)}
                        flag={doc.flagged ? (doc.note ?? "") : null}
                        inert={doc.inert}
                        pdf={doc.pdf}
                        camera={doc.source === "camera" && !doc.video}
                        video={doc.video}
                        selected={alternatives && Boolean(files[doc.key]?.url)}
                    />
                ))}
            </div>
            {video && livenessFileId && <p className="mt-3 text-xs text-success">Your video is with ADX.</p>}

            {(textProblem || failure) && (
                <p role="alert" className="mt-4 text-sm text-danger">
                    {textProblem ?? failure}
                </p>
            )}

            <StepFooter onBack={onBack} backLabel={backLabel}>
                <button type="button" onClick={() => void next()} disabled={!ready} className={brandButton}>
                    {busy ? "Saving your video…" : "Continue"}
                </button>
            </StepFooter>
        </Panel>
    );
}

/* ------------------------------------------------------------------ */
/* The review — Step 11                                                */
/* ------------------------------------------------------------------ */

function ChecklistView({
    step,
    manifest,
    kyc,
    files,
    livenessFileId,
    onSubmitted,
    onBack,
    backLabel,
}: {
    step: Extract<ManifestStep, { kind: "checklist" }>;
    manifest: OnboardingManifest;
    kyc: KycAnswers;
    files: Record<string, TileEntry>;
    livenessFileId: string | null;
    onSubmitted: (outcome: LadderOutcome) => void;
    onBack?: () => void;
    backLabel: string;
}) {
    const [busy, setBusy] = React.useState(false);
    const [failure, setFailure] = React.useState<string | null>(null);
    const partial = isPartialManifest(manifest);
    const rows = partial ? partialSummaryOf(manifest, { files, livenessFileId }) : summaryOf(kyc);

    const submit = async () => {
        setBusy(true);
        setFailure(null);
        try {
            // Only what was collected this visit: on the partial ladder, exactly the flagged tiles retaken.
            // A ladder whose only flag was the video has nothing to post here — the video went up on its own step.
            const answers = finalAnswers(kyc);
            const hasAnswers = Object.keys(answers).length > 0;
            if (manifest.party === "ADVERTISER") {
                if (hasAnswers || !partial) await verification.submitAdvertiserKyc(answers);
            } else {
                if (hasAnswers || !partial) await verification.submitPublisherKyc(answers);
                if (!partial) await verification.completePublisherOnboarding();
            }
            onSubmitted({ partial, via: "uploads", rows: partial ? rows : summaryOf(kyc, "").slice(0, 3) });
        } catch (caught) {
            setFailure(messageOf(caught, "Could not submit your documents. Try again."));
            setBusy(false);
        }
    };

    return (
        <Panel>
            <CardTitle>{step.title}</CardTitle>
            <p className="mt-1 text-sm text-dim">{step.subtitle}</p>
            <div className="mt-4 divide-y divide-line border-y border-line">
                {rows.map((row) => (
                    <KeyRow key={row.label} label={row.label} value={row.value} />
                ))}
            </div>
            <p className="mt-4 text-xs text-dim">Documents are stored privately and read only by ADX’s reviewers.</p>
            {failure && (
                <p role="alert" className="mt-4 text-sm text-danger">
                    {failure}
                </p>
            )}
            <StepFooter onBack={onBack} backLabel={backLabel}>
                <button type="button" onClick={() => void submit()} disabled={busy} className={brandButton}>
                    {busy ? "Submitting…" : step.cta}
                </button>
            </StepFooter>
        </Panel>
    );
}

/** "Almost there" — what the app's Submitted screen says after the review, for a page to draw. */
export function SubmittedCard({ outcome, children }: { outcome: LadderOutcome; children?: React.ReactNode }) {
    return (
        <Panel className="mt-6">
            <CardTitle>{outcome.via === "uploads" ? "Almost there" : "Verified"}</CardTitle>
            <p className="mt-1 text-sm text-dim">
                {outcome.via === "session" ? SESSION_COPY.doneVerified : outcome.via === "digio" ? "Digio verified you, and ADX has recorded it." : outcome.partial ? "The flagged documents are back with ADX. We’ll notify you within 24 hours." : "KYC submitted. We’ll notify you within 24 hours."}
            </p>
            <div className="mt-4 divide-y divide-line border-y border-line">
                {outcome.rows.map((row) => (
                    <KeyRow key={row.label} label={row.label} value={row.value} />
                ))}
                {outcome.via === "uploads" && <KeyRow label="Status" value="Under review · < 24h" />}
            </div>
            {children}
        </Panel>
    );
}
