"use client";

import * as React from "react";
import { AlertCircle, ExternalLink, Loader2, ShieldCheck } from "lucide-react";
import { brandButton, CardTitle, KeyRow, outlineButton, quietLink } from "@/components/publisher/parts";
import { Panel } from "@/components/workspace/page-heading";
import { EntityTypePicker } from "@/components/verification/entity-type-picker";
import { VerificationSession } from "@/components/verification/verification-session";
import { ApiError, messageOf } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import {
    businessEntityTypes,
    DIGIO_FAILURE_WORDS,
    DIGIO_POLL_MS,
    DIGIO_UNAVAILABLE,
    digioFailureFrom,
    digioStatusWords,
    digioUnavailableFrom,
    ENTITY_CHANGE_LINK,
    ENTITY_UPGRADE_WARNING,
    entityTypeRequiredFrom,
    isSessionStart,
    KYC_ALREADY_VERIFIED,
    verification,
    type DigioFailure,
    type DigioSide,
    type DigioStatus,
    type EntityTypeOption,
    type KycEntityType,
} from "@/services/verification";

/** One start of the check: the legal form chosen here (null when the account's own is used), and which try it is. */
interface DigioRequest {
    entityType: KycEntityType | null;
    attempt: number;
}

/**
 * U7 — KYC by Digio on the web, for any side (the app's `DigioScreen` and
 * the partner's `PartnerDigioPane`).
 *
 * ADX asks Digio for a session (`…/digio/initiate`), the browser opens
 * Digio's page in a new tab, and this panel waits: Digio answers ADX by
 * webhook, not the browser, so the panel asks ADX every few seconds — and
 * the moment this tab is looked at again — until ADX has heard. Verified,
 * a publisher's onboarding is closed the way the review step closes it.
 *
 * Lot D (Q129): while the branch is off the initiate answers 503
 * KYC_PROVIDER_UNAVAILABLE. That is not a fault to retry into: the panel
 * says so, makes the uploads the way through, and offers a retry only when
 * the server said the outage is the passing kind.
 *
 * Phase D (the owner, 1 Oct 2026): the account's legal form decides which
 * Digio workflow runs, so it is known before the check starts. `entityType`
 * is what the party's own read said: null asks "Who is this account for?"
 * first and starts with the answer; a known form starts as before; left out
 * (the read did not say) the panel starts and lets the server ask — a 409
 * ENTITY_TYPE_REQUIRED draws the same picker from the server's own options
 * and the start is repeated with the choice. `upgrade` is the verified
 * individual's door to a business: it always asks, never offers Individual,
 * and warns that the account goes back to pending. Digio failing at its own
 * end (not answering, or no workflow for the form) prints the apps' two
 * sentences; the uploads stay beside them wherever the page offers them.
 *
 * 2 Oct 2026: a wrong choice is corrected here. While the account is not
 * verified and a check has started — or could not start — the quiet link
 * "Picked the wrong account type? Change it" opens the same picker with
 * every option of the side and the current form chosen; continuing starts
 * the check again with the new form (the server stores it on an unverified
 * account and opens a fresh Digio request). Never on a verified account —
 * that is the upgrade door's — and never while the page says Digio is off
 * (`allowTypeChange`).
 *
 * Cashfree Phase 2 (1 Oct 2026): every start says `supports: ['CASHFREE']`.
 * While Digio cannot be asked and the owner has the backup on, the answer
 * is a verification session instead, and this panel becomes ADX's own
 * identity check (`VerificationSession`) — the same doors around it: the
 * uploads, back, and "Start again" when the session timed out, which is
 * this party's own start once more. `sessionId` opens a session the person
 * already has (the resume card, the desk's notification, the DigiLocker
 * return) without starting anything.
 */
export function DigioPanel({
    side,
    onVerified,
    onUploadsInstead,
    uploadsLabel = "Upload documents instead",
    entityType,
    upgrade = false,
    onEntityType,
    allowTypeChange = true,
    sessionId = null,
    onClose,
}: {
    side: DigioSide;
    /** Verified — by Digio, or by ADX's own identity check (`session`). */
    onVerified: (how: "digio" | "session") => void;
    onUploadsInstead?: () => void;
    uploadsLabel?: string;
    /** The party's legal form, as its own read gave it: null asks before starting; left out, the server is the one to ask. */
    entityType?: KycEntityType | null;
    /** The upgrade door: a verified individual verifying a business. */
    upgrade?: boolean;
    /** Told the form a check started on, when it was chosen here — the page's read is a step behind by then. */
    onEntityType?: (value: KycEntityType) => void;
    /** Whether a wrong choice may be corrected from here: false while the page's read says Digio is switched off or down, or the account verified. */
    allowTypeChange?: boolean;
    /** Cashfree Phase 2: a session the person already has, opened as it stands — nothing is started. */
    sessionId?: string | null;
    /** Back to the verify page as it stands — where a session that is no longer there sends the person. */
    onClose?: () => void;
}) {
    // No request yet is the picker's turn; a known form starts on mount, as it always did.
    const [request, setRequest] = React.useState<DigioRequest | null>(() => (sessionId || upgrade || entityType === null ? null : { entityType: null, attempt: 0 }));
    // ADX's own identity check, when the start handed one out (or the page opened one the person has).
    const [session, setSession] = React.useState<string | null>(sessionId);
    const [options, setOptions] = React.useState<EntityTypeOption[] | null>(null);
    const [optionsError, setOptionsError] = React.useState<string | null>(null);
    const [optionsAttempt, setOptionsAttempt] = React.useState(0);
    const [sdkUrl, setSdkUrl] = React.useState<string | null>(null);
    const [status, setStatus] = React.useState<DigioStatus | null>(null);
    const [error, setError] = React.useState<string | null>(null);
    const [failure, setFailure] = React.useState<DigioFailure | null>(null);
    // The start was refused because the account is verified: there is nothing to correct from here.
    const [alreadyVerified, setAlreadyVerified] = React.useState(false);
    // The picker again, over a check that started or could not: correcting a wrong choice.
    const [changing, setChanging] = React.useState(false);
    // A check has started from this panel — from then on an upgrade's account is pending, no longer a verified individual.
    const [started, setStarted] = React.useState(false);
    const [unavailable, setUnavailable] = React.useState<ReturnType<typeof digioUnavailableFrom>>(null);
    const closing = React.useRef(false);
    const onEntityTypeRef = React.useRef(onEntityType);
    React.useEffect(() => {
        onEntityTypeRef.current = onEntityType;
    });

    // The picker's rows, read once it is the picker's turn and the server has not already listed them (the 409 does).
    const optionsWanted = !session && (!request || changing) && options === null;
    React.useEffect(() => {
        if (!optionsWanted) return undefined;
        let cancelled = false;
        verification
            .entityTypes()
            .then((all) => {
                if (cancelled) return;
                const rows = all?.[side] ?? [];
                if (rows.length === 0) setOptionsError("Could not read the account types.");
                else setOptions(rows);
            })
            .catch((caught: unknown) => {
                if (!cancelled) setOptionsError(messageOf(caught, "Could not read the account types."));
            });
        return () => {
            cancelled = true;
        };
    }, [optionsWanted, side, optionsAttempt]);

    // The session, for every request: the first start, the picker's answer, and every "try again".
    React.useEffect(() => {
        if (!request) return undefined;
        let cancelled = false;
        verification
            .digioInitiate(side, request.entityType)
            .then((start) => {
                if (cancelled) return;
                // Digio cannot be asked and the backup is on: ADX's own screens instead.
                if (isSessionStart(start)) {
                    setSession(start.sessionId);
                    setStarted(true);
                    if (request.entityType) onEntityTypeRef.current?.(request.entityType);
                    return;
                }
                setSdkUrl(start.sdkUrl);
                setStarted(true);
                setStatus({ method: "DIGIO", digioStatus: "pending", kycStatus: "PENDING", digioVerifiedAt: null });
                if (request.entityType) onEntityTypeRef.current?.(request.entityType);
                // Straight into Digio while the click that asked for it still counts; the link below is for coming back to it.
                const activation = (navigator as Navigator & { userActivation?: { isActive: boolean } }).userActivation;
                if (activation?.isActive) window.open(start.sdkUrl, "_blank", "noopener,noreferrer");
            })
            .catch((caught: unknown) => {
                if (cancelled) return;
                // The server does not know the legal form: nothing was stored or sent — ask, from its own list.
                const asked = entityTypeRequiredFrom(caught);
                if (asked) {
                    setOptions(asked.options.length > 0 ? asked.options : null);
                    setOptionsError(null);
                    setRequest(null);
                    return;
                }
                const off = digioUnavailableFrom(caught);
                if (off) {
                    setUnavailable(off);
                    return;
                }
                const failed = digioFailureFrom(caught);
                setFailure(failed);
                setAlreadyVerified(caught instanceof ApiError && caught.code === KYC_ALREADY_VERIFIED);
                setError(failed ? DIGIO_FAILURE_WORDS[failed] : messageOf(caught, "Could not start the Digio check."));
            });
        return () => {
            cancelled = true;
        };
    }, [side, request]);

    const verified = React.useCallback(
        async (how: "digio" | "session") => {
            if (closing.current) return;
            closing.current = true;
            // The publisher's ladder is closed here, as the review step closes it; the other sides re-read themselves.
            if (side === "PUBLISHER") await verification.completePublisherOnboarding().catch(() => undefined);
            onVerified(how);
        },
        [side, onVerified]
    );

    // Digio answers ADX, not the browser: ask until ADX has heard.
    React.useEffect(() => {
        if (!sdkUrl) return undefined;
        let stopped = false;
        const ask = async () => {
            try {
                const next = await verification.digioStatus(side);
                if (stopped) return;
                setStatus(next);
                if (next.kycStatus === "VERIFIED") void verified("digio");
            } catch {
                /* a missed poll is not news; the next one asks again */
            }
        };
        const timer = window.setInterval(() => void ask(), DIGIO_POLL_MS);
        const onVisible = () => {
            if (document.visibilityState === "visible") void ask();
        };
        document.addEventListener("visibilitychange", onVisible);
        return () => {
            stopped = true;
            window.clearInterval(timer);
            document.removeEventListener("visibilitychange", onVisible);
        };
    }, [sdkUrl, side, verified]);

    const clear = () => {
        setError(null);
        setFailure(null);
        setAlreadyVerified(false);
        setChanging(false);
        setUnavailable(null);
        setSdkUrl(null);
        setStatus(null);
    };

    /** Again, with the form chosen here if one was — an upgrade is only an upgrade while it is sent. */
    const retry = () => {
        clear();
        setRequest((current) => ({ entityType: current?.entityType ?? null, attempt: (current?.attempt ?? 0) + 1 }));
    };

    const start = (chosen: KycEntityType) => {
        clear();
        setRequest({ entityType: chosen, attempt: 0 });
    };

    /** A session that timed out: this party's own start again — the form chosen here, if one was. */
    const restart = () => {
        setSession(null);
        retry();
    };

    if (session) {
        return <VerificationSession key={session} sessionId={session} onVerified={() => void verified("session")} onUploads={onUploadsInstead} onRestart={restart} onGone={onClose ?? onUploadsInstead} />;
    }

    const uploads = onUploadsInstead && (
        <button type="button" onClick={onUploadsInstead} className={outlineButton}>
            {uploadsLabel}
        </button>
    );
    /** Out of the correction, back to the check as it stood. */
    const keep = (
        <button type="button" onClick={() => setChanging(false)} className={outlineButton}>
            Cancel
        </button>
    );

    if (unavailable) {
        return (
            <Panel className="mt-6">
                <div className="flex items-start gap-3">
                    <AlertCircle className="mt-0.5 size-5 shrink-0 text-warning" aria-hidden />
                    <div>
                        <CardTitle>Digio is unavailable right now</CardTitle>
                        <p className="mt-1 text-sm text-dim">{DIGIO_UNAVAILABLE}.</p>
                    </div>
                </div>
                <KeyRow className="mt-3 border-t border-line pt-3" label="Status" value={unavailable.provider === "MANUAL" ? "Switched off by ADX" : "Not answering"} />
                <div className="mt-4 flex flex-wrap gap-3">
                    {onUploadsInstead && (
                        <button type="button" onClick={onUploadsInstead} className={brandButton}>
                            {uploadsLabel}
                        </button>
                    )}
                    {unavailable.provider === "DEGRADED" && (
                        <button type="button" onClick={retry} className={outlineButton}>
                            Try Digio again
                        </button>
                    )}
                </div>
            </Panel>
        );
    }

    // The picker's turn: the legal form first, then the check — or the form again, to correct it.
    if (!request || changing) {
        // A correction is made on an unverified account: every form of the side is open to it, Individual too.
        const rows = options && upgrade && !changing ? businessEntityTypes(options) : options;
        if (!rows) {
            return (
                <Panel className="mt-6">
                    {optionsError ? (
                        <>
                            <p role="alert" className="text-sm text-danger">
                                {optionsError}
                            </p>
                            <div className="mt-4 flex flex-wrap items-center gap-3">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setOptionsError(null);
                                        setOptionsAttempt((n) => n + 1);
                                    }}
                                    className={brandButton}
                                >
                                    Try again
                                </button>
                                {changing ? keep : uploads}
                            </div>
                        </>
                    ) : (
                        <p role="status" className="flex items-center gap-2 text-sm text-dim">
                            <Loader2 className="size-4 animate-spin" aria-hidden />
                            Reading the account types…
                        </p>
                    )}
                </Panel>
            );
        }
        if (changing) {
            return (
                <Panel className="mt-6">
                    {/* The form the check ran on: chosen here this visit, else the one the page read. */}
                    <EntityTypePicker key="change" options={rows} onContinue={start} initial={request?.entityType ?? entityType ?? null}>
                        {keep}
                    </EntityTypePicker>
                </Panel>
            );
        }
        return (
            <Panel className="mt-6">
                <EntityTypePicker key="ask" options={rows} onContinue={start} warning={upgrade ? ENTITY_UPGRADE_WARNING : undefined}>
                    {uploads}
                </EntityTypePicker>
            </Panel>
        );
    }

    const rejected = status?.kycStatus === "REJECTED";
    const done = status?.kycStatus === "VERIFIED";
    // A start that failed has no session to wait on: the sentence stands alone.
    const failed = Boolean(error) && !sdkUrl;
    const starting = !sdkUrl && !error;
    // Only an unverified account corrects its form: an upgrade that has not started is still a verified individual.
    const canChange = allowTypeChange && !done && !alreadyVerified && (Boolean(sdkUrl) || failed) && !(upgrade && !started);

    return (
        <Panel className="mt-6">
            <div className="flex items-start gap-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-brand-soft text-brand">
                    <ShieldCheck className="size-5" aria-hidden />
                </span>
                <div>
                    <CardTitle>{done ? "Verified by Digio" : rejected ? "Digio could not verify you" : sdkUrl ? "Waiting for Digio" : failed ? "Digio did not start" : "Starting Digio"}</CardTitle>
                    {!failed && (
                        <p className="mt-1 text-sm text-dim">
                            {done
                                ? "ADX has heard from Digio. Your verification is complete."
                                : rejected
                                  ? "You can try again, or upload your documents instead."
                                  : "Finish the check on Digio’s page — Aadhaar and PAN, about a minute. This page updates by itself as soon as ADX hears back."}
                        </p>
                    )}
                </div>
            </div>

            {error && (
                <p role="alert" className="mt-4 text-sm text-danger">
                    {error}
                </p>
            )}

            {!failed && <KeyRow className="mt-4 border-t border-line pt-3" label="Status" value={digioStatusWords(status, starting)} />}

            {sdkUrl && !rejected && !done && (
                <p role="status" className="mt-2 flex items-center gap-2 text-xs text-dim">
                    <Loader2 className="size-3.5 animate-spin" aria-hidden />
                    Asking ADX every few seconds.
                </p>
            )}

            <div className="mt-5 flex flex-wrap items-center gap-3">
                {sdkUrl && !rejected && !done && (
                    <a href={sdkUrl} target="_blank" rel="noopener noreferrer" className={cn(brandButton, "gap-2")}>
                        Open Digio
                        <ExternalLink className="size-4" aria-hidden />
                    </a>
                )}
                {/* No workflow for this form is not a fault another try gets past; that sentence sends the person to support. */}
                {(rejected || (error && failure !== "NOT_AVAILABLE")) && (
                    <button type="button" onClick={retry} className={brandButton}>
                        Try again
                    </button>
                )}
                {!done && uploads}
            </div>

            {canChange && (
                <button type="button" onClick={() => setChanging(true)} className={cn(quietLink, "mt-4 block")}>
                    {ENTITY_CHANGE_LINK}
                </button>
            )}
        </Panel>
    );
}
