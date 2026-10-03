"use client";

import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CheckCircle2, Info } from "lucide-react";
import { toast } from "sonner";
import { PageHeading, Panel } from "@/components/workspace/page-heading";
import { brandButton, CardTitle, Chip, ErrorNote, KeyRow, Loading, outlineButton, quietLink } from "@/components/publisher/parts";
import { useLoad } from "@/components/publisher/use-load";
import { DigioPanel } from "@/components/verification/digio-panel";
import { KycLadder, SubmittedCard, verifiedOutcome, type LadderOutcome } from "@/components/verification/kyc-ladder";
import { RequestedByAdx } from "@/components/verification/requested-by-adx";
import { SessionResumeCard, useResumableSession } from "@/components/verification/session-resume";
import { cn } from "@/lib/utils";
import { safeNext } from "@/services/agreements";
import {
    ADVERTISER_STANDING,
    advertiserStanding,
    backupStandsIn,
    advertiserStandingWords,
    advertiserTakesDocuments,
    canUpgradeEntity,
    digioUnavailableLine,
    ENTITY_UPGRADE_LINK,
    SESSION_COPY,
    shortDay,
    verification,
    type AdvertiserKycRecord,
    type KycEntityType,
    type OnboardingManifest,
} from "@/services/verification";

interface Loaded {
    me: Awaited<ReturnType<typeof verification.advertiserMe>>;
    record: AdvertiserKycRecord | null;
    read: "done" | "failed";
    manifest: OnboardingManifest | null;
}

async function readVerification(): Promise<Loaded> {
    const [me, record, manifest] = await Promise.allSettled([verification.advertiserMe(), verification.advertiserKyc(), verification.manifest("ADVERTISER")]);
    if (me.status === "rejected") throw me.reason;
    return {
        me: me.value,
        record: record.status === "fulfilled" ? record.value : null,
        // A 404 is answered as null above; any other failure is not "nothing sent".
        read: record.status === "fulfilled" ? "done" : "failed",
        manifest: manifest.status === "fulfilled" ? manifest.value : null,
    };
}

/**
 * The advertiser's verification — the app's `AdvertiserVerificationScreen`
 * and its `KycGate` (QR-16/QR-18): where the record stands in its own
 * words, the desk's request line, Digio first (KYC-D), the uploads beside
 * it (`PUT /advertiser-kyc/me`, the same manifest-driven capture steps as
 * the publisher's), the flagged-only re-upload while the desk asks for
 * documents again, "Check again" — and the way out, "Continue unverified":
 * verification holds a campaign's launch, never a booking or a payment.
 *
 * Phase D (1 Oct 2026): Digio asks "Who is this account for?" before it
 * starts when the account's legal form is not on file (`entityType` on
 * `/advertisers/me`), and a verified Individual gets the quiet door
 * "Registered a business? Verify it" — the same check, on the business's
 * own workflow, the account back to pending until it clears.
 *
 * Cashfree Phase 2 (1 Oct 2026): a Digio start may hand out ADX's own
 * identity check instead (the panel draws it). An open one is offered back
 * first — "Finish your identity check" — in place of the Digio start, and
 * `?session=<id>` (the desk's notification, the DigiLocker return) opens it
 * straight away.
 */
export function AdvertiserVerify() {
    const search = useSearchParams();
    const next = safeNext(search.get("next"), "/advertiser/campaigns");
    const { data, error, loading, reload } = useLoad("advertiser-verify", readVerification);
    // A session named in the address (a notification, the DigiLocker return) opens as it stands.
    const [sessionId, setSessionId] = React.useState<string | null>(() => search.get("session") || null);
    const resumable = useResumableSession("ADVERTISER");
    const [mode, setMode] = React.useState<"status" | "digio" | "ladder" | "upgrade">(() => (sessionId ? "digio" : "status"));
    // The legal form a Digio start stored this visit — the read below is a step behind it.
    const [picked, setPicked] = React.useState<KycEntityType | null>(null);
    const [outcome, setOutcome] = React.useState<LadderOutcome | null>(null);

    if (!data && loading) return <Loading label="Checking your record…" />;
    if (!data) return <ErrorNote message={error ?? "Could not read your verification."} onRetry={reload} />;

    const standing = advertiserStanding(data.me.kycStatus, data.record, data.read);
    const chip = ADVERTISER_STANDING[standing];
    // Cashfree Phase 2: null too while the backup stands in for Digio — the start is offered, named "Verify your identity".
    const digioOff = digioUnavailableLine(data.manifest?.verification?.digio);
    const backup = backupStandsIn(data.manifest?.verification?.digio);
    const canUpload = advertiserTakesDocuments(standing) || standing === "NEEDS_INFO";
    const entityType = picked ?? data.me.entityType;
    // While the business is being verified the page draws only that: what it read about the account is no longer true.
    const upgrading = mode === "upgrade" && !outcome;
    // An identity check the person left open: offered back instead of any Digio start.
    const resume = !outcome && mode !== "digio" ? resumable.session : null;
    const continueSession = (id: string) => {
        setSessionId(id);
        setMode("digio");
    };
    /** Out of the identity check, back to where the verification stands, read again. */
    const closeSession = () => {
        setSessionId(null);
        setMode("status");
        resumable.recheck();
        reload();
    };

    const finished = (result: LadderOutcome) => {
        setOutcome(result);
        setMode("status");
        setSessionId(null);
        toast.success(result.via === "digio" ? "Verified with Digio" : result.via === "session" ? "Verified" : result.partial ? "Sent back for review" : "Submitted for review");
        reload();
        window.scrollTo({ top: 0, behavior: "smooth" });
    };

    const heading = (
        <PageHeading
            title="Verify your identity"
            subtitle="Required once, before your first campaign goes live. Usually reviewed within a day."
            actions={upgrading ? undefined : standing === "VERIFIED" ? <Chip tone="success">Verified</Chip> : mode !== "status" && !outcome ? <Chip tone={chip.tone}>{chip.label}</Chip> : undefined}
        />
    );

    // Phase D: a verified individual verifying a business — the picker without Individual, then the same wait (or the identity check it left open).
    if (upgrading || (standing === "VERIFIED" && mode === "digio" && sessionId && !outcome)) {
        return (
            <>
                {heading}
                <DigioPanel
                    key={sessionId ?? "upgrade"}
                    side="ADVERTISER"
                    upgrade
                    sessionId={sessionId}
                    entityType={entityType}
                    onEntityType={setPicked}
                    allowTypeChange={!digioOff}
                    onVerified={(how) => finished(verifiedOutcome(how))}
                    onUploadsInstead={() => {
                        setMode("status");
                        resumable.recheck();
                        reload();
                    }}
                    onClose={closeSession}
                    uploadsLabel="Back"
                />
            </>
        );
    }

    if (standing === "VERIFIED") {
        return (
            <>
                {heading}
                <Panel className="mt-8">
                    <div className="flex items-start gap-3">
                        <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-success" aria-hidden />
                        <div>
                            <CardTitle>Your identity is verified</CardTitle>
                            <p className="mt-1 text-sm text-dim">A campaign you pay for goes live on its start date. Nothing more is needed.</p>
                            {data.record?.reviewedAt && <p className="mt-1 text-xs text-dim">Verified on {shortDay(data.record.reviewedAt)}</p>}
                        </div>
                    </div>
                    <Link href={next} className={cn(brandButton, "mt-5")}>
                        {next === "/advertiser/campaigns" ? "Go to campaigns" : "Continue"}
                    </Link>
                    {/* Phase D: the quiet door for an individual who has since registered a business — never a banner. */}
                    {canUpgradeEntity(standing, entityType) && !digioOff && !resume && (
                        <button type="button" onClick={() => setMode("upgrade")} className={cn(quietLink, "mt-4 block")}>
                            {ENTITY_UPGRADE_LINK}
                        </button>
                    )}
                </Panel>
                {/* A business check started from the upgrade door and left open. */}
                {resume && <SessionResumeCard onContinue={() => continueSession(resume.id)} />}
            </>
        );
    }

    const openLadder = () => {
        if (!data.manifest) {
            toast.error("Could not read the verification steps. Try again in a moment.");
            reload();
            return;
        }
        setOutcome(null);
        setSessionId(null);
        resumable.recheck();
        setMode("ladder");
    };

    return (
        <>
            {heading}

            {outcome && (
                <SubmittedCard outcome={outcome}>
                    <div className="mt-5 flex flex-wrap gap-3">
                        <Link href={next} className={brandButton}>
                            {next === "/advertiser/campaigns" ? "Back to campaigns" : "Continue"}
                        </Link>
                    </div>
                </SubmittedCard>
            )}

            {/* Cashfree Phase 2: an identity check left open is the way on, in place of the Digio start. */}
            {resume && mode === "status" && <SessionResumeCard className="mt-8" onContinue={() => continueSession(resume.id)} />}

            {mode === "status" && !outcome && (
                <Panel className={resume ? "mt-6" : "mt-8"}>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <CardTitle>Where your verification stands</CardTitle>
                        <Chip tone={chip.tone}>{chip.label}</Chip>
                    </div>
                    <RequestedByAdx record={data.record} className="mt-4" />
                    <p className="mt-4 text-sm text-ink">{advertiserStandingWords(standing, data.record)}</p>
                    {data.record?.submittedAt && standing !== "NOT_STARTED" && (
                        <div className="mt-3 border-t border-line pt-1">
                            <KeyRow label="Sent" value={shortDay(data.record.submittedAt)} />
                            {data.record.method && <KeyRow label="How" value={data.record.method === "DIGIO" ? "Digio" : "Documents"} />}
                        </div>
                    )}
                    {data.read === "failed" && <p className="mt-3 text-xs text-dim">Your record could not be read just now; what is shown comes from your account. Check again in a moment.</p>}

                    <div className="mt-4 flex items-start gap-2 rounded-md bg-info-soft px-4 py-3 text-sm text-info">
                        <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
                        <span className="text-ink">You can browse, build a campaign and pay while this is open. Verification is only needed before a campaign of yours goes live.</span>
                    </div>

                    <div className="mt-5 flex flex-wrap items-center gap-3">
                        {standing === "NEEDS_INFO" ? (
                            <button type="button" onClick={openLadder} className={brandButton}>
                                Re-upload the flagged documents
                            </button>
                        ) : digioOff || resume ? null : (
                            <button type="button" onClick={() => setMode("digio")} className={brandButton}>
                                {backup ? SESSION_COPY.title : standing === "REJECTED" ? "Try Digio instead" : standing === "NOT_STARTED" ? "Verify with Digio" : standing === "REQUESTED" && data.record?.requestedChannel === "DIGIO" ? "Open Digio" : "Verify with Digio instead"}
                            </button>
                        )}
                        {canUpload && standing !== "NEEDS_INFO" && (
                            <button type="button" onClick={openLadder} className={digioOff && !resume ? brandButton : outlineButton}>
                                Upload documents instead
                            </button>
                        )}
                        <button type="button" onClick={reload} disabled={loading} className={outlineButton}>
                            {loading ? "Checking…" : "Check again"}
                        </button>
                    </div>
                    {digioOff && standing !== "NEEDS_INFO" && <p className="mt-3 text-xs text-warning">{digioOff}.</p>}
                </Panel>
            )}

            {mode === "digio" && !outcome && (
                <>
                    <DigioPanel
                        key={sessionId ?? "start"}
                        side="ADVERTISER"
                        entityType={entityType}
                        onEntityType={setPicked}
                        allowTypeChange={!digioOff}
                        sessionId={sessionId}
                        onVerified={(how) => finished(verifiedOutcome(how))}
                        onUploadsInstead={canUpload ? openLadder : closeSession}
                        onClose={closeSession}
                        uploadsLabel={canUpload ? "Upload documents instead" : "Back"}
                    />
                    {canUpload && (
                        <button type="button" onClick={closeSession} className={cn(quietLink, "mt-4 inline-block")}>
                            Back to where it stands
                        </button>
                    )}
                </>
            )}

            {mode === "ladder" && data.manifest && !outcome && (
                <KycLadder
                    key={`${data.manifest.mode}-${data.manifest.manifestVersion ?? 0}`}
                    manifest={data.manifest}
                    answers={{}}
                    onFinished={finished}
                    onExit={() => setMode("status")}
                    exitLabel="Cancel"
                    resume={resumable.session ? () => continueSession(resumable.session!.id) : null}
                />
            )}

            {/* QR-18: the way out — verification waits until a campaign of theirs is about to go live. */}
            {!outcome && (
                <div className="mt-8 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line pt-6">
                    <Link href={next} className={outlineButton}>
                        Continue unverified
                    </Link>
                    <p className="text-sm text-dim">Browse, build and pay now; verify before your campaign goes live.</p>
                </div>
            )}
        </>
    );
}
