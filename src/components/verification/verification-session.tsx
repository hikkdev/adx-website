"use client";

import * as React from "react";
import { AlertCircle, Camera, CheckCircle2, ExternalLink, Loader2, ShieldCheck } from "lucide-react";
import { brandButton, CardTitle, Chip, Field, inputClass, outlineButton, quietLink } from "@/components/publisher/parts";
import { Panel } from "@/components/workspace/page-heading";
import { selfieJpeg } from "@/components/verification/selfie-image";
import { WebcamCapture } from "@/components/verification/webcam-capture";
import { apiConfig } from "@/lib/api-config";
import { cn } from "@/lib/utils";
import {
    DIGILOCKER_RETURN_KEY,
    digilockerReturnNote,
    digilockerReturnUrl,
    failureWords,
    groupOfCheck,
    SESSION_COPY,
    sessionGroups,
    sessionIsOpen,
    sessionProblemOf,
    triesWords,
    verification,
    type CheckKind,
    type SessionGroup,
    type SessionGroupKey,
    type SessionView,
} from "@/services/verification";

const C = SESSION_COPY;

/** A line under one group: what the server said, in the person's words. */
interface GroupNote {
    tone: "danger" | "warning";
    text: string;
}

/** The DigiLocker page: the same tab, so the return page brings the person back here. Overridable for tests. */
const leaveFor = (url: string) => window.location.assign(url);

/**
 * Cashfree Phase 2 — ADX's own identity check, on the website: the session
 * screen every party walks when Digio cannot be asked and the backup is on
 * (or the desk sent the case to the backup). One screen for the publisher,
 * the advertiser and the print partner; the words are the apps' own
 * (`SESSION_COPY`), and the person never hears the word "Cashfree".
 *
 * The session's steps are drawn as groups — one action each, in the
 * person's order, only those the session has: DigiLocker, the selfie, the
 * licence and the vehicle, the business numbers, the papers, the bank.
 * Every answer carries the session as it now stands and the screen
 * re-renders from it; it never works the session's status out itself.
 *
 * DigiLocker is the same-tab round trip: the page to come back to is kept
 * in sessionStorage, the person goes to DigiLocker, and
 * `/verify/digilocker-return` reads the answer and brings them back here.
 * The selfie is the webcam's (a file where there is none), sent as a JPEG
 * no longer than 1280 px a side, and never kept.
 */
export function VerificationSession({
    sessionId,
    onVerified,
    onUploads,
    onRestart,
    onGone,
    navigate = leaveFor,
}: {
    sessionId: string;
    /** The session reads VERIFIED — the page reads itself again. */
    onVerified?: () => void;
    /** The existing document uploads: the papers, and the way on when the session failed. Hidden when absent. */
    onUploads?: () => void;
    /** The party's own start again, for a session that timed out. */
    onRestart?: () => void;
    /** The session is not there (not theirs, or gone): back to the verify page. */
    onGone?: () => void;
    navigate?: (url: string) => void;
}) {
    const [session, setSession] = React.useState<SessionView | null>(null);
    const [loadError, setLoadError] = React.useState<string | null>(null);
    const [attempt, setAttempt] = React.useState(0);
    const [busy, setBusy] = React.useState<SessionGroupKey | null>(null);
    const [notes, setNotes] = React.useState<Partial<Record<SessionGroupKey, GroupNote>>>({});
    const [focus, setFocus] = React.useState<SessionGroupKey | null>(null);
    const onGoneRef = React.useRef(onGone);
    React.useEffect(() => {
        onGoneRef.current = onGone;
    });

    const loaded = React.useCallback((view: SessionView) => {
        setSession(view);
        setLoadError(null);
    }, []);
    const unread = React.useCallback((caught: unknown) => {
        const problem = sessionProblemOf(caught);
        if (problem.kind === "gone") onGoneRef.current?.();
        setLoadError(problem.kind === "gone" ? "This identity check is no longer there." : "message" in problem ? problem.message : "Could not read your identity check.");
    }, []);
    const read = React.useCallback(() => verification.session(sessionId).then(loaded, unread), [sessionId, loaded, unread]);

    React.useEffect(() => {
        let cancelled = false;
        verification.session(sessionId).then(
            (view) => !cancelled && loaded(view),
            (caught: unknown) => !cancelled && unread(caught)
        );
        return () => {
            cancelled = true;
        };
    }, [sessionId, attempt, loaded, unread]);

    // Verified: the page that drew this reads itself again — once.
    const told = React.useRef(false);
    const onVerifiedRef = React.useRef(onVerified);
    React.useEffect(() => {
        onVerifiedRef.current = onVerified;
    });
    React.useEffect(() => {
        if (session?.status !== "VERIFIED" || told.current) return;
        told.current = true;
        onVerifiedRef.current?.();
    }, [session?.status]);

    const note = (key: SessionGroupKey, value: GroupNote | null) => setNotes((current) => ({ ...current, [key]: value ?? undefined }));

    /** Every failure, handled the way the contract says: re-read where the session moved, words where it did not. */
    const handle = async (caught: unknown, key: SessionGroupKey) => {
        const problem = sessionProblemOf(caught);
        switch (problem.kind) {
            case "gone":
                onGone?.();
                setLoadError("This identity check is no longer there.");
                return;
            case "unavailable":
                note(key, { tone: "warning", text: C.unavailable });
                return;
            case "invalid":
            case "other":
                note(key, { tone: "danger", text: problem.message });
                return;
            case "digilocker-again":
                note(key, null);
                note("DIGILOCKER", { tone: "warning", text: C.digilockerAgain });
                setFocus("DIGILOCKER");
                await read();
                return;
            case "out-of-order": {
                note(key, null);
                const needed = problem.needs ? groupOfCheck(problem.needs) : null;
                if (needed) setFocus(needed);
                await read();
                return;
            }
            case "closed":
                await read();
                return;
        }
    };

    /** One step's call: the session it answers with replaces the one on screen. */
    const run = async (key: SessionGroupKey, call: () => Promise<{ session: SessionView }>): Promise<boolean> => {
        setBusy(key);
        note(key, null);
        try {
            const answer = await call();
            setSession(answer.session);
            setFocus(null);
            return true;
        } catch (caught) {
            await handle(caught, key);
            return false;
        } finally {
            setBusy(null);
        }
    };

    const openDigilocker = async () => {
        setBusy("DIGILOCKER");
        note("DIGILOCKER", null);
        try {
            const opened = await verification.openDigilocker(sessionId, digilockerReturnUrl(apiConfig.siteUrl, sessionId));
            setSession(opened.session);
            // The page to come back to, kept for the return page; a browser that keeps nothing falls back to the account's verify page.
            try {
                window.sessionStorage.setItem(DIGILOCKER_RETURN_KEY, digilockerReturnNote(sessionId, window.location.pathname, window.location.search));
            } catch {
                /* storage refused: the return page falls back */
            }
            navigate(opened.url);
        } catch (caught) {
            await handle(caught, "DIGILOCKER");
        } finally {
            setBusy(null);
        }
    };

    const refreshDigilocker = () => run("DIGILOCKER", () => verification.refreshDigilocker(sessionId));

    // Back on this tab while DigiLocker is with the person: ask whether it has answered.
    const waitingOnDigilocker = session?.steps.some((step) => step.check === "DIGILOCKER" && step.status === "PENDING") ?? false;
    React.useEffect(() => {
        if (!waitingOnDigilocker) return undefined;
        const onVisible = () => {
            if (document.visibilityState === "visible") void verification.refreshDigilocker(sessionId).then((answer) => setSession(answer.session), () => undefined);
        };
        document.addEventListener("visibilitychange", onVisible);
        return () => document.removeEventListener("visibilitychange", onVisible);
    }, [waitingOnDigilocker, sessionId]);

    if (!session) {
        return (
            <Panel className="mt-6">
                {loadError ? (
                    <>
                        <p role="alert" className="text-sm text-danger">
                            {loadError}
                        </p>
                        <button type="button" onClick={() => setAttempt((n) => n + 1)} className={cn(outlineButton, "mt-4")}>
                            Try again
                        </button>
                    </>
                ) : (
                    <p role="status" className="flex items-center gap-2 text-sm text-dim">
                        <Loader2 className="size-4 animate-spin" aria-hidden />
                        Reading your identity check…
                    </p>
                )}
            </Panel>
        );
    }

    const groups = sessionGroups(session.steps);
    const byKey = new Map(groups.map((group) => [group.key, group] as const));
    const open = sessionIsOpen(session.status);
    const doneOrAbsent = (key: SessionGroupKey) => {
        const group = byKey.get(key);
        return !group || group.state === "done";
    };
    // The selfie is matched to the DigiLocker photograph; the bank to the identity's name (the business's, once its PAN is in).
    const selfieReady = !session.steps.some((step) => step.check === "FACE_MATCH") || doneOrAbsent("DIGILOCKER");
    const panStep = session.steps.find((step) => step.check === "PAN");
    const bankReady = panStep ? panStep.status === "VERIFIED" : doneOrAbsent("DIGILOCKER");

    return (
        <div className="mt-6 grid gap-4">
            <Panel>
                <div className="flex items-start gap-3">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-brand-soft text-brand">
                        <ShieldCheck className="size-5" aria-hidden />
                    </span>
                    <div>
                        <CardTitle>{C.title}</CardTitle>
                        <p className="mt-1 text-sm text-dim">{C.intro}</p>
                    </div>
                </div>
                {!open && <EndState session={session} onUploads={onUploads} onRestart={onRestart} />}
            </Panel>

            {groups.map((group) => (
                <GroupCard key={group.key} group={group} note={notes[group.key] ?? null} focused={focus === group.key} closed={!open}>
                    {open && group.state !== "done" && group.state !== "locked" && (
                        <GroupAction
                            group={group}
                            sessionId={sessionId}
                            busy={busy}
                            selfieReady={selfieReady}
                            bankReady={bankReady}
                            gstinRequired={group.steps.some((step) => step.check === "GSTIN" && step.required)}
                            hasGstin={group.steps.some((step) => step.check === "GSTIN")}
                            onDigilocker={() => void openDigilocker()}
                            onRefresh={() => void refreshDigilocker()}
                            run={run}
                            onSelfieProblem={(text) => note("SELFIE", { tone: "danger", text })}
                            onUploads={onUploads}
                        />
                    )}
                    {/* The papers stay reachable once the checks have passed and the desk reads them. */}
                    {!open && group.key === "PAPERS" && session.status === "IN_REVIEW" && onUploads && (
                        <button type="button" onClick={onUploads} className={cn(quietLink, "mt-3 block")}>
                            {C.papersLink}
                        </button>
                    )}
                </GroupCard>
            ))}
        </div>
    );
}

const GROUP_TITLE: Record<SessionGroupKey, string> = {
    DIGILOCKER: C.digilocker,
    SELFIE: C.selfie,
    DRIVING_LICENCE: C.licence,
    VEHICLE: C.vehicle,
    BUSINESS: C.business,
    PAPERS: C.papers,
    BANK: C.bank,
};

function GroupCard({ group, note, focused, closed, children }: { group: SessionGroup; note: GroupNote | null; focused: boolean; closed: boolean; children?: React.ReactNode }) {
    const ref = React.useRef<HTMLElement>(null);
    React.useEffect(() => {
        if (focused) ref.current?.scrollIntoView?.({ block: "center", behavior: "smooth" });
    }, [focused]);
    const failedCheck: CheckKind | null = group.failed?.check ?? null;
    return (
        <section ref={ref} aria-label={GROUP_TITLE[group.key]} className={cn("rounded-lg border bg-white p-5", focused ? "border-brand-bright ring-2 ring-brand-bright/30" : "border-line", closed && group.state !== "done" && group.key !== "PAPERS" && "opacity-70")}>
            <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="text-base font-semibold text-ink">{GROUP_TITLE[group.key]}</h3>
                {group.state === "done" && (
                    <Chip tone="success">
                        <CheckCircle2 className="mr-1 inline size-3.5 align-[-2px]" aria-hidden />
                        {C.stepDone}
                    </Chip>
                )}
                {group.state === "waiting" && <Chip tone="info">{C.digilockerWaiting}</Chip>}
            </div>
            {group.key === "PAPERS" && <p className="mt-1 text-sm text-dim">{C.papersText}</p>}
            {(group.state === "failed" || group.state === "locked") && failedCheck && (
                <p role="alert" className="mt-2 flex items-start gap-2 text-sm text-danger">
                    <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
                    <span>
                        {failureWords(failedCheck, group.failed?.failureCode)}
                        {group.triesLeft !== null && group.triesLeft > 0 && <span className="ml-1 text-dim">· {triesWords(group.triesLeft)}</span>}
                    </span>
                </p>
            )}
            {note && (
                <p role={note.tone === "danger" ? "alert" : "status"} className={cn("mt-2 text-sm", note.tone === "danger" ? "text-danger" : "text-warning")}>
                    {note.text}
                </p>
            )}
            {children}
        </section>
    );
}

type Run = (key: SessionGroupKey, call: () => Promise<{ session: SessionView }>) => Promise<boolean>;

function GroupAction({
    group,
    sessionId,
    busy,
    selfieReady,
    bankReady,
    gstinRequired,
    hasGstin,
    onDigilocker,
    onRefresh,
    run,
    onSelfieProblem,
    onUploads,
}: {
    group: SessionGroup;
    sessionId: string;
    busy: SessionGroupKey | null;
    selfieReady: boolean;
    bankReady: boolean;
    gstinRequired: boolean;
    hasGstin: boolean;
    onDigilocker: () => void;
    onRefresh: () => void;
    run: Run;
    onSelfieProblem: (text: string) => void;
    onUploads?: () => void;
}) {
    const working = busy === group.key;
    const anyBusy = busy !== null;
    switch (group.key) {
        case "DIGILOCKER":
            return (
                <>
                    <p className="mt-1 text-sm text-dim">{C.digilockerHint}</p>
                    <div className="mt-4 flex flex-wrap items-center gap-3">
                        {group.state === "waiting" ? (
                            <>
                                <button type="button" onClick={onRefresh} disabled={anyBusy} className={brandButton}>
                                    {working ? <Loader2 className="size-4 animate-spin" aria-hidden /> : C.digilockerFinished}
                                </button>
                                <button type="button" onClick={onDigilocker} disabled={anyBusy} className={cn(outlineButton, "gap-2")}>
                                    {C.digilockerButton}
                                    <ExternalLink className="size-4" aria-hidden />
                                </button>
                            </>
                        ) : (
                            <button type="button" onClick={onDigilocker} disabled={anyBusy} className={cn(brandButton, "gap-2")}>
                                {working ? <Loader2 className="size-4 animate-spin" aria-hidden /> : C.digilockerButton}
                                {!working && <ExternalLink className="size-4" aria-hidden />}
                            </button>
                        )}
                    </div>
                </>
            );
        case "SELFIE":
            return <SelfieAction sessionId={sessionId} disabled={anyBusy || !selfieReady} working={working} run={run} onProblem={onSelfieProblem} />;
        case "DRIVING_LICENCE":
            return <LicenceForm sessionId={sessionId} disabled={anyBusy} working={working} run={run} />;
        case "VEHICLE":
            return <VehicleForm sessionId={sessionId} disabled={anyBusy} working={working} run={run} />;
        case "BUSINESS":
            return <BusinessForm sessionId={sessionId} disabled={anyBusy} working={working} run={run} hasGstin={hasGstin} gstinRequired={gstinRequired} />;
        case "PAPERS":
            return onUploads ? (
                <button type="button" onClick={onUploads} className={cn(quietLink, "mt-3 block")}>
                    {C.papersLink}
                </button>
            ) : null;
        case "BANK":
            return <BankForm sessionId={sessionId} disabled={anyBusy || !bankReady} working={working} run={run} />;
    }
}

const submitLabel = (working: boolean, label: string) => (working ? <Loader2 className="size-4 animate-spin" aria-hidden /> : label);

/** The selfie: the webcam with a live preview and "Take photo"; a photo file where there is no camera. Never kept. */
function SelfieAction({ sessionId, disabled, working, run, onProblem }: { sessionId: string; disabled: boolean; working: boolean; run: Run; onProblem: (text: string) => void }) {
    const [camera, setCamera] = React.useState(false);
    const fileRef = React.useRef<HTMLInputElement>(null);
    const [hasCamera, setHasCamera] = React.useState(true);
    React.useEffect(() => {
        if (!navigator.mediaDevices?.getUserMedia) queueMicrotask(() => setHasCamera(false));
    }, []);

    const send = async (picked: Blob) => {
        let jpeg: Blob;
        try {
            jpeg = await selfieJpeg(picked);
        } catch (caught) {
            onProblem(caught instanceof Error ? caught.message : "Could not prepare the photo. Take it again.");
            return;
        }
        // The JPEG goes up and is let go; nothing of it stays in this screen.
        await run("SELFIE", () => verification.submitSelfie(sessionId, jpeg));
    };

    return (
        <>
            <p className="mt-1 text-sm text-dim">{C.selfieHint}</p>
            <div className="mt-4 flex flex-wrap items-center gap-3">
                <button type="button" onClick={() => (hasCamera ? setCamera(true) : fileRef.current?.click())} disabled={disabled} className={cn(brandButton, "gap-2")}>
                    {working ? (
                        <Loader2 className="size-4 animate-spin" aria-hidden />
                    ) : (
                        <>
                            <Camera className="size-4" aria-hidden />
                            {C.selfieButton}
                        </>
                    )}
                </button>
                {hasCamera && (
                    <button type="button" onClick={() => fileRef.current?.click()} disabled={disabled} className={quietLink}>
                        Use a photo file instead
                    </button>
                )}
                <input
                    ref={fileRef}
                    type="file"
                    accept="image/jpeg,image/png"
                    capture="user"
                    className="sr-only"
                    tabIndex={-1}
                    aria-label="Selfie photo file"
                    data-testid="selfie-file"
                    onChange={(event) => {
                        const file = event.target.files?.[0];
                        event.target.value = "";
                        if (file) void send(file);
                    }}
                />
            </div>
            <WebcamCapture mode="photo" open={camera} onOpenChange={setCamera} description={C.selfieHint} onCaptured={(file) => void send(file)} />
        </>
    );
}

const upperNoSpace = (value: string) => value.toUpperCase().replace(/\s+/g, "");

function BusinessForm({ sessionId, disabled, working, run, hasGstin, gstinRequired }: { sessionId: string; disabled: boolean; working: boolean; run: Run; hasGstin: boolean; gstinRequired: boolean }) {
    const [pan, setPan] = React.useState("");
    const [gstin, setGstin] = React.useState("");
    const ready = pan.trim().length > 0 && (!gstinRequired || gstin.trim().length > 0);
    return (
        <form
            className="mt-4"
            onSubmit={(event) => {
                event.preventDefault();
                if (!ready) return;
                void run("BUSINESS", () => verification.submitBusiness(sessionId, hasGstin && gstin.trim() ? { pan: pan.trim(), gstin: gstin.trim() } : { pan: pan.trim() }));
            }}
        >
            <div className={cn("grid gap-4", hasGstin && "md:grid-cols-2")}>
                <Field label={C.businessPan} htmlFor="session-pan">
                    <input id="session-pan" value={pan} onChange={(event) => setPan(upperNoSpace(event.target.value).slice(0, 10))} maxLength={10} placeholder="ABCDE1234F" autoComplete="off" className={cn(inputClass, "uppercase tracking-wide")} />
                </Field>
                {hasGstin && (
                    <Field label={gstinRequired ? C.businessGstin : C.businessGstinOptional} htmlFor="session-gstin">
                        <input id="session-gstin" value={gstin} onChange={(event) => setGstin(upperNoSpace(event.target.value).slice(0, 15))} maxLength={15} placeholder="22ABCDE1234F1Z5" autoComplete="off" className={cn(inputClass, "uppercase tracking-wide")} />
                    </Field>
                )}
            </div>
            <button type="submit" disabled={disabled || !ready} className={cn(brandButton, "mt-4")}>
                {submitLabel(working, C.businessButton)}
            </button>
        </form>
    );
}

function BankForm({ sessionId, disabled, working, run }: { sessionId: string; disabled: boolean; working: boolean; run: Run }) {
    const [accountNumber, setAccountNumber] = React.useState("");
    const [ifsc, setIfsc] = React.useState("");
    const ready = accountNumber.trim().length > 0 && ifsc.trim().length > 0;
    return (
        <form
            className="mt-4"
            onSubmit={(event) => {
                event.preventDefault();
                if (ready) void run("BANK", () => verification.submitBank(sessionId, { accountNumber: accountNumber.trim(), ifsc: ifsc.trim() }));
            }}
        >
            <div className="grid gap-4 md:grid-cols-2">
                <Field label={C.bankAccount} htmlFor="session-account">
                    <input id="session-account" value={accountNumber} onChange={(event) => setAccountNumber(upperNoSpace(event.target.value).slice(0, 40))} inputMode="numeric" autoComplete="off" className={inputClass} />
                </Field>
                <Field label={C.bankIfsc} htmlFor="session-ifsc">
                    <input id="session-ifsc" value={ifsc} onChange={(event) => setIfsc(upperNoSpace(event.target.value).slice(0, 11))} maxLength={11} placeholder="HDFC0001234" autoComplete="off" className={cn(inputClass, "uppercase tracking-wide")} />
                </Field>
            </div>
            {/* One line under the whole row: the pair stays the same height. */}
            <p className="mt-2 text-xs text-dim">{C.bankHint}</p>
            <button type="submit" disabled={disabled || !ready} className={cn(brandButton, "mt-4")}>
                {submitLabel(working, C.bankButton)}
            </button>
        </form>
    );
}

function LicenceForm({ sessionId, disabled, working, run }: { sessionId: string; disabled: boolean; working: boolean; run: Run }) {
    const [dlNumber, setDlNumber] = React.useState("");
    const [dob, setDob] = React.useState("");
    const ready = dlNumber.trim().length > 0 && /^\d{4}-\d{2}-\d{2}$/.test(dob);
    return (
        <form
            className="mt-4"
            onSubmit={(event) => {
                event.preventDefault();
                if (ready) void run("DRIVING_LICENCE", () => verification.submitDrivingLicence(sessionId, { dlNumber: dlNumber.trim(), dob }));
            }}
        >
            <div className="grid gap-4 md:grid-cols-2">
                <Field label={C.licenceNumber} htmlFor="session-dl">
                    <input id="session-dl" value={dlNumber} onChange={(event) => setDlNumber(event.target.value.toUpperCase().slice(0, 30))} autoComplete="off" className={cn(inputClass, "uppercase tracking-wide")} />
                </Field>
                <Field label={C.licenceDob} htmlFor="session-dob">
                    <input id="session-dob" type="date" value={dob} onChange={(event) => setDob(event.target.value)} className={inputClass} />
                </Field>
            </div>
            <button type="submit" disabled={disabled || !ready} className={cn(brandButton, "mt-4")}>
                {submitLabel(working, C.licenceButton)}
            </button>
        </form>
    );
}

function VehicleForm({ sessionId, disabled, working, run }: { sessionId: string; disabled: boolean; working: boolean; run: Run }) {
    const [vehicleNumber, setVehicleNumber] = React.useState("");
    const ready = vehicleNumber.trim().length > 0;
    return (
        <form
            className="mt-4"
            onSubmit={(event) => {
                event.preventDefault();
                if (ready) void run("VEHICLE", () => verification.submitVehicle(sessionId, { vehicleNumber: vehicleNumber.trim() }));
            }}
        >
            <Field label={C.vehicleNumber} htmlFor="session-vehicle">
                <input id="session-vehicle" value={vehicleNumber} onChange={(event) => setVehicleNumber(upperNoSpace(event.target.value).slice(0, 12))} autoComplete="off" className={cn(inputClass, "max-w-xs uppercase tracking-wide")} />
            </Field>
            <button type="submit" disabled={disabled || !ready} className={cn(brandButton, "mt-4")}>
                {submitLabel(working, C.vehicleButton)}
            </button>
        </form>
    );
}

/** Where a closed session ended, in the person's words, and the one way on from there. */
function EndState({ session, onUploads, onRestart }: { session: SessionView; onUploads?: () => void; onRestart?: () => void }) {
    const tone = session.status === "VERIFIED" ? "bg-success-soft text-success" : session.status === "IN_REVIEW" ? "bg-info-soft text-info" : "bg-warning-soft text-warning";
    const words = session.status === "VERIFIED" ? C.doneVerified : session.status === "IN_REVIEW" ? C.doneReview : session.status === "FAILED" ? C.doneFailed : C.doneExpired;
    return (
        <div className="mt-4">
            <p role="status" className={cn("rounded-md px-4 py-3 text-sm", tone)}>
                {words}
            </p>
            {session.status === "FAILED" && onUploads && (
                <button type="button" onClick={onUploads} className={cn(brandButton, "mt-4")}>
                    {C.doneFailedButton}
                </button>
            )}
            {session.status === "EXPIRED" && onRestart && (
                <button type="button" onClick={onRestart} className={cn(brandButton, "mt-4")}>
                    {C.doneExpiredButton}
                </button>
            )}
        </div>
    );
}
