"use client";

import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { toast } from "sonner";
import { Panel } from "@/components/workspace/page-heading";
import { brandButton, CardTitle, Chip, ErrorNote, Loading, outlineButton, quietLink } from "@/components/publisher/parts";
import { useLoad } from "@/components/publisher/use-load";
import { AgreementAccept } from "@/components/agreements/agreement-accept";
import { DigioPanel } from "@/components/verification/digio-panel";
import { KycLadder, SubmittedCard, verifiedOutcome, type LadderOutcome } from "@/components/verification/kyc-ladder";
import { RequestedByAdx } from "@/components/verification/requested-by-adx";
import { SessionResumeCard, useResumableSession } from "@/components/verification/session-resume";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { backupStandsIn, canUpgradeEntity, ENTITY_UPGRADE_LINK, identityStartOffered, SESSION_COPY, profileAnswers, publisherStanding, shortDay, verification, type KycEntityType, type OnboardingManifest, type PublisherKycRecord } from "@/services/verification";

interface Loaded {
    profile: Awaited<ReturnType<typeof verification.publisherProfile>>;
    record: PublisherKycRecord | null;
    manifest: OnboardingManifest;
}

async function readVerification(): Promise<Loaded> {
    const [profile, record, manifest] = await Promise.all([verification.publisherProfile(), verification.publisherKyc().catch(() => null), verification.manifest("PUBLISHER")]);
    return { profile, record, manifest };
}

/**
 * Verify your business — the publisher's onboarding ladder on the web
 * (DR 08), drawn from `GET /users/me/onboarding-manifest` the way the app's
 * `StepRoute` draws it: the details (`PATCH /publishers/me`), the KYC intro
 * with Digio first and the uploads beside it, the capture steps, the short
 * video (`POST /user-kyc/me`), and the review, which posts the documents
 * (`POST /publishers/me/kyc`) and closes the onboarding
 * (`POST /publishers/me/complete-onboarding`). A NEEDS_INFO record draws
 * the flagged-only ladder — just what the desk asked for again. After a
 * first submission the platform terms follow, as the app's Submitted
 * screen leads to them, unless they were taken at sign-up.
 *
 * Phase D (1 Oct 2026): Digio asks "Who is this account for?" before it
 * starts when the account's legal form is not on file (`entityType` on
 * `/publishers/me`), and a verified Individual gets the quiet door
 * "Registered a business? Verify it" — the same check, on the business's
 * own workflow, the account back to pending until it clears.
 *
 * Cashfree Phase 2 (1 Oct 2026): a Digio start may hand out ADX's own
 * identity check instead (the panel draws it). An open one is offered back
 * first — "Finish your identity check" — in place of the Digio start, and
 * `?session=<id>` (the desk's notification, the DigiLocker return) opens it
 * straight away.
 */
export default function VerifyPage() {
    return (
        <React.Suspense>
            <PublisherVerify />
        </React.Suspense>
    );
}

function PublisherVerify() {
    const { refresh } = useAuth();
    const search = useSearchParams();
    const { data, error, loading, reload } = useLoad("publisher-verify", readVerification);
    // A session named in the address (a notification, the DigiLocker return) opens as it stands.
    const [sessionId, setSessionId] = React.useState<string | null>(() => search?.get("session") || null);
    const resumable = useResumableSession("PUBLISHER");
    const [mode, setMode] = React.useState<"auto" | "ladder" | "digio" | "upgrade">(() => (sessionId ? "digio" : "auto"));
    // The legal form a Digio start stored this visit — the read below is a step behind it.
    const [picked, setPicked] = React.useState<KycEntityType | null>(null);
    const [outcome, setOutcome] = React.useState<LadderOutcome | null>(null);
    const [termsDone, setTermsDone] = React.useState(false);

    if (!data && loading) return <Loading label="Reading your verification…" />;
    if (!data) return <ErrorNote message={error ?? "Could not read your verification."} onRetry={reload} />;

    const { profile, record, manifest } = data;
    const standing = publisherStanding(profile.kycStatus, record);
    const note = record?.reviewNote ?? record?.rejectionReason ?? manifest.verification?.reviewNote ?? null;
    // Under review, the ladder waits behind a button; anything else that can take documents opens it.
    const ladderOpen = !outcome && standing.key !== "VERIFIED" && (mode === "ladder" || (mode === "auto" && standing.key !== "PENDING"));
    const entityType = picked ?? profile.entityType;
    // Cashfree Phase 2: the start is offered while Digio is open or the backup stands in for it.
    const digioOpen = identityStartOffered(manifest.verification?.digio);
    const backup = backupStandsIn(manifest.verification?.digio);
    // While the business is being verified the page draws only that: what it read about the account is no longer true.
    const upgrading = !outcome && mode === "upgrade";
    // An identity check the person left open: offered back instead of any Digio start.
    const resume = !outcome && mode !== "digio" ? resumable.session : null;
    const continueSession = (id: string) => {
        setSessionId(id);
        setMode("digio");
    };
    /** Out of the identity check, back to the page as it stands. */
    const closeSession = () => {
        setSessionId(null);
        setMode("auto");
        resumable.recheck();
        reload();
    };

    const finished = (result: LadderOutcome) => {
        setOutcome(result);
        setMode("auto");
        setSessionId(null);
        toast.success(result.via === "digio" ? "Verified with Digio" : result.via === "session" ? "Verified" : "Submitted for review");
        void refresh();
        window.scrollTo({ top: 0, behavior: "smooth" });
    };

    return (
        <>
            <Link href="/publisher/profile" className="inline-flex items-center gap-1 text-sm text-dim hover:text-ink">
                <ChevronLeft className="size-4" aria-hidden />
                Business profile
            </Link>
            <div className="mt-4 flex flex-wrap items-center gap-3">
                <h1 className="text-2xl font-semibold tracking-tight text-ink">Verify your business</h1>
                {!upgrading && <Chip tone={outcome?.via === "uploads" ? "warning" : outcome ? "success" : standing.tone}>{outcome?.via === "uploads" ? "In review" : outcome ? "Verified" : standing.label}</Chip>}
            </div>
            <p className="mt-1 text-sm text-dim">Your details, then your identity — with Digio in a minute, or by uploading your documents. ADX reviews uploads within a working day.</p>

            {!outcome && !upgrading && (
                <StatusBanner standing={standing.key} record={record} note={note} verifiedAt={record?.reviewedAt ?? null}>
                    <RequestedByAdx record={record} className="mt-3 bg-white/60" />
                </StatusBanner>
            )}

            {outcome && (
                <>
                    <SubmittedCard outcome={outcome}>
                        <div className="mt-5 flex flex-wrap gap-3">
                            <Link href="/publisher" className={brandButton}>
                                Go to overview
                            </Link>
                            <button
                                type="button"
                                onClick={() => {
                                    setOutcome(null);
                                    reload();
                                }}
                                className={outlineButton}
                            >
                                See where it stands
                            </button>
                        </div>
                    </SubmittedCard>
                    {!outcome.partial && !profile.platformAgreementAcceptedAt && !termsDone && (
                        <section className="mt-6">
                            <h2 className="text-base font-semibold text-ink">One more thing: the platform terms</h2>
                            <p className="mt-1 text-sm text-dim">Accept the ADX publisher agreement to list and take bookings.</p>
                            <AgreementAccept
                                className="mt-3"
                                kind="PLATFORM"
                                onAccepted={() => {
                                    setTermsDone(true);
                                    toast.success("Accepted. Thank you.");
                                }}
                                onSkip={() => setTermsDone(true)}
                            />
                        </section>
                    )}
                </>
            )}

            {/* Cashfree Phase 2: an identity check left open is the way on — the ladder offers it on its own intro. */}
            {resume && !ladderOpen && <SessionResumeCard onContinue={() => continueSession(resume.id)} />}

            {!outcome && standing.key === "PENDING" && mode === "auto" && (
                <Panel className="mt-6">
                    <CardTitle>While ADX reviews</CardTitle>
                    <p className="mt-1 text-sm text-dim">Nothing more is needed. If you would rather be verified now, Digio checks your Aadhaar and PAN in about a minute; or change a detail or a document you sent.</p>
                    <div className="mt-5 flex flex-wrap gap-3">
                        {digioOpen && !resume && (
                            <button type="button" onClick={() => setMode("digio")} className={brandButton}>
                                {backup ? SESSION_COPY.title : "Verify with Digio instead"}
                            </button>
                        )}
                        <button type="button" onClick={() => setMode("ladder")} className={outlineButton}>
                            Update details or documents
                        </button>
                    </div>
                </Panel>
            )}

            {!outcome && mode === "digio" && (
                <DigioPanel
                    key={sessionId ?? "start"}
                    side="PUBLISHER"
                    entityType={entityType}
                    onEntityType={setPicked}
                    allowTypeChange={digioOpen && standing.key !== "VERIFIED"}
                    sessionId={sessionId}
                    onVerified={(how) => finished(verifiedOutcome(how))}
                    onUploadsInstead={() => {
                        setSessionId(null);
                        resumable.recheck();
                        setMode("ladder");
                    }}
                    onClose={closeSession}
                />
            )}

            {/* Phase D: a verified individual verifying a business — the picker without Individual, then the same wait. */}
            {upgrading && (
                <DigioPanel
                    side="PUBLISHER"
                    upgrade
                    entityType={entityType}
                    onEntityType={setPicked}
                    allowTypeChange={digioOpen}
                    onVerified={(how) => finished(verifiedOutcome(how))}
                    onUploadsInstead={() => {
                        setMode("auto");
                        resumable.recheck();
                        reload();
                    }}
                    onClose={closeSession}
                    uploadsLabel="Back"
                />
            )}

            {ladderOpen && (
                <KycLadder
                    key={`${manifest.mode}-${manifest.manifestVersion ?? 0}`}
                    manifest={manifest}
                    answers={profileAnswers(profile)}
                    record={record}
                    onFinished={finished}
                    onExit={standing.key === "PENDING" ? () => setMode("auto") : undefined}
                    exitLabel="Cancel"
                    entityType={entityType}
                    onEntityType={setPicked}
                    resume={resume ? () => continueSession(resume.id) : null}
                />
            )}

            {!outcome && !upgrading && standing.key === "VERIFIED" && (
                <Panel className="mt-6">
                    <CardTitle>Your business is verified</CardTitle>
                    <p className="mt-1 text-sm text-dim">Listings you submit go straight to review, and bookings pay out to your account. To change a registered detail now, contact ADX support.</p>
                    <div className="mt-5 flex flex-wrap gap-3">
                        <Link href="/publisher/profile" className={outlineButton}>
                            Back to profile
                        </Link>
                        <Link href="/publisher/agreements" className={outlineButton}>
                            Agreements
                        </Link>
                    </div>
                    {/* Phase D: the quiet door for an individual who has since registered a business — never a banner. */}
                    {canUpgradeEntity(standing.key, entityType) && digioOpen && !resume && (
                        <button type="button" onClick={() => setMode("upgrade")} className={cn(quietLink, "mt-4 block")}>
                            {ENTITY_UPGRADE_LINK}
                        </button>
                    )}
                </Panel>
            )}
        </>
    );
}

function StatusBanner({ standing, record, note, verifiedAt, children }: { standing: string; record: PublisherKycRecord | null; note: string | null; verifiedAt: string | null; children?: React.ReactNode }) {
    const tone = standing === "VERIFIED" ? "bg-success-soft text-success" : standing === "REJECTED" ? "bg-danger-soft text-danger" : standing === "NEEDS_INFO" || standing === "REQUESTED" ? "bg-warning-soft text-warning" : standing === "PENDING" ? "bg-info-soft text-info" : "bg-white text-ink border border-line";
    const words =
        standing === "VERIFIED"
            ? `Verified${verifiedAt ? ` on ${shortDay(verifiedAt)}` : ""}. Nothing more is needed.`
            : standing === "PENDING"
              ? `Submitted${record?.submittedAt ? ` on ${shortDay(record.submittedAt)}` : ""} · ADX is reviewing your documents.`
              : standing === "REJECTED"
                ? `Not approved${note ? `: ${note}` : ""}. Verify with Digio, or correct your documents and submit again.`
                : standing === "NEEDS_INFO"
                  ? `ADX needs some documents again${note ? `: ${note}` : ""}. Only the flagged ones are asked for below; everything else is kept.`
                  : standing === "REQUESTED"
                    ? "ADX has asked you to verify your business. Verify with Digio, or upload your documents."
                    : "Not started. It takes a few minutes with Digio.";
    return (
        <div className={cn("mt-6 rounded-lg px-4 py-3 text-sm", tone)}>
            {words}
            {children}
        </div>
    );
}
