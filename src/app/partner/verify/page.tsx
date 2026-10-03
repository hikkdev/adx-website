"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import { Flag, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { PageHeading, Panel } from "@/components/workspace/page-heading";
import { brandButton, CardTitle, Chip, ErrorNote, Field, inputClass, Loading, outlineButton, quietLink } from "@/components/publisher/parts";
import { useLoad } from "@/components/publisher/use-load";
import { DigioPanel } from "@/components/verification/digio-panel";
import { DocumentTile, type TileEntry } from "@/components/verification/document-tile";
import { RequestedByAdx } from "@/components/verification/requested-by-adx";
import { SessionResumeCard, useResumableSession } from "@/components/verification/session-resume";
import { FeatureOff } from "@/components/platform/feature-off";
import { usePartnerAccount } from "@/components/partner/partner-context";
import { isFeatureOff, messageOf } from "@/lib/api-client";
import { FLAG_PARTNER_KYC, useSwitchedOff } from "@/lib/flags";
import { cn } from "@/lib/utils";
import {
    backupStandsIn,
    canUpgradeEntity,
    ENTITY_UPGRADE_LINK,
    identityStartOffered,
    PAN_PATTERN,
    PARTNER_STANDING,
    PARTNER_TILES,
    partnerAcceptsDocuments,
    SESSION_COPY,
    partnerKycBody,
    partnerLivenessWanted,
    partnerStanding,
    partnerStandingWords,
    partnerTilesFor,
    shortDay,
    verification,
    type DigioAvailability,
    type GovIdType,
    type PartnerKycRecord,
    type PartnerTile,
} from "@/services/verification";

const GOV_ID_OPTIONS: { id: GovIdType; title: string }[] = [
    { id: "AADHAAR", title: "Aadhaar" },
    { id: "PASSPORT", title: "Passport" },
    { id: "DRIVING_LICENCE", title: "Driving licence" },
];

type Read = { kind: "record"; record: PartnerKycRecord | null; digio: DigioAvailability | null } | { kind: "off" };

/** Which Digio door is open: the shop's own check, or — Phase D — a verified individual verifying a business. */
type DigioDoor = "verify" | "upgrade" | null;

/** Cashfree Phase 2: the identity check being walked — its id, or null while the page starts one itself. */
interface DigioState {
    door: DigioDoor;
    sessionId: string | null;
}

async function readRecord(): Promise<Read> {
    try {
        return { kind: "record", ...(await verification.partnerKycWithDigio()) };
    } catch (caught) {
        // The partner KYC switch (`print.partner-kyc`) is off: 503 FEATURE_OFF.
        if (isFeatureOff(caught, FLAG_PARTNER_KYC)) return { kind: "off" };
        throw caught;
    }
}

/**
 * The print partner's KYC — the app's partner `KycScreen` (Lot N-M) on the
 * web: the record on `/print-partners/me/kyc`, laid out as one page rather
 * than a ladder. Digio first (KYC-D); the ten documents beside it as the
 * last resort, each uploaded privately the moment it is picked
 * (PRINT_PARTNER_KYC); NEEDS_INFO draws only the flagged tiles with the
 * reviewer's notes and posts only what was retaken; and the short video
 * (`POST /user-kyc/me`) the desk's VERIFIED waits on, recorded with the
 * webcam or uploaded as a file.
 *
 * Phase D (1 Oct 2026): Digio asks "Who is this account for?" before it
 * starts when the shop's legal form is not on file (`entityType` on
 * `/print-partners/me` — one of the four a print partner may be), and a
 * verified Individual gets the quiet door "Registered a business? Verify
 * it".
 *
 * Cashfree Phase 2 (1 Oct 2026): a Digio start may hand out ADX's own
 * identity check instead (the panel draws it). An open one is offered back
 * first — "Finish your identity check" — in place of the Digio start, and
 * `?session=<id>` (the desk's notification, the DigiLocker return) opens it
 * straight away.
 */
export default function PartnerVerifyPage() {
    return (
        <React.Suspense>
            <PartnerVerify />
        </React.Suspense>
    );
}

function PartnerVerify() {
    // Switched off (`print.partner-kyc`), the record is not asked for: the page says so instead.
    const switchedOff = useSwitchedOff(FLAG_PARTNER_KYC);
    const search = useSearchParams();
    const { data, error, loading, reload } = useLoad(switchedOff ? "partner-verify:off" : "partner-verify", () => (switchedOff ? Promise.resolve<Read>({ kind: "off" }) : readRecord()));
    // A session named in the address (a notification, the DigiLocker return) opens as it stands.
    const [digio, setDigioState] = React.useState<DigioState>(() => {
        const sessionId = search?.get("session") || null;
        return { door: sessionId ? "verify" : null, sessionId };
    });
    const resumable = useResumableSession("PRINT_PARTNER");

    if (!data && loading) return <Loading label="Reading your record…" />;
    if (!data) return <ErrorNote message={error ?? "Could not read your verification."} onRetry={reload} />;

    if (switchedOff || data.kind === "off") {
        return (
            <>
                <PageHeading title="Verification" subtitle="Verify the shop once, so ADX can send it quote requests and jobs." />
                <FeatureOff flag={FLAG_PARTNER_KYC} className="mt-8">
                    Nothing is needed from you now; you will be told when it opens.
                </FeatureOff>
            </>
        );
    }

    return (
        <PartnerKyc
            key={data.record?.updatedAt ?? "none"}
            record={data.record}
            availability={data.digio}
            reload={() => {
                resumable.recheck();
                reload();
            }}
            digio={digio.door}
            sessionId={digio.sessionId}
            setDigio={(door, sessionId = null) => setDigioState({ door, sessionId })}
            resume={resumable.session?.id ?? null}
        />
    );
}

function PartnerKyc({
    record,
    availability,
    reload,
    digio,
    sessionId,
    setDigio,
    resume,
}: {
    record: PartnerKycRecord | null;
    availability: DigioAvailability | null;
    reload: () => void;
    digio: DigioDoor;
    /** Cashfree Phase 2: the identity check to open as it stands, when there is one. */
    sessionId: string | null;
    setDigio: (value: DigioDoor, sessionId?: string | null) => void;
    /** An identity check the shop left open, offered back in place of the Digio start. */
    resume: string | null;
}) {
    const [files, setFiles] = React.useState<Record<string, TileEntry>>({});
    /* 28 Sep 2026: never ask twice — the PAN typed on the application opens the first KYC. Phase D: the shop's legal form is read off the same row. */
    const { partner, reload: reloadAccount } = usePartnerAccount();
    const [panNumber, setPanNumber] = React.useState(record?.panNumber ?? partner?.panNumber ?? "");
    const [govIdType, setGovIdType] = React.useState<GovIdType | null>(record?.govIdType ?? null);
    const [busy, setBusy] = React.useState(false);
    const [problem, setProblem] = React.useState<string | null>(null);
    const [video, setVideo] = React.useState<TileEntry | null>(null);

    const standing = partnerStanding(record);
    const words = PARTNER_STANDING[standing];
    const open = partnerAcceptsDocuments(record);
    const tiles = partnerTilesFor(record);
    // 26 Sep 2026: the read says whether Digio is open (`digio.available`); switched off or down, the papers are the way.
    // Cashfree Phase 2: not down while ADX's own check stands in for Digio — the start is offered without Digio's name.
    const digioDown = !identityStartOffered(availability);
    const backup = backupStandsIn(availability);
    const digioOffered = open && record?.status !== "NEEDS_INFO" && !digioDown;
    const digioAsked = record?.requestedChannel === "DIGIO" && !record.submittedAt;
    const uploading = Object.values(files).some((entry) => entry.busy);
    const uploaded = tiles.filter((tile) => files[tile.key]?.url);
    const panShown = tiles.some((tile) => tile.key === "pan");
    const panValid = panNumber === "" || PAN_PATTERN.test(panNumber);
    const canSubmit = open && uploaded.length > 0 && !uploading && !busy && panValid;

    const store = async (tile: PartnerTile, file: File) => {
        setFiles((current) => ({ ...current, [tile.key]: { name: file.name, busy: true } }));
        try {
            const stored = await verification.upload(file, "PRINT_PARTNER_KYC");
            setFiles((current) => ({ ...current, [tile.key]: { name: file.name, url: stored.url, id: stored.id, busy: false } }));
        } catch (caught) {
            setFiles((current) => ({ ...current, [tile.key]: { name: file.name, busy: false, error: messageOf(caught, "The upload did not go through. Try again.") } }));
        }
    };

    const submit = async () => {
        if (!panValid) return setProblem("The PAN is ten characters: five letters, four digits, a letter.");
        setBusy(true);
        setProblem(null);
        try {
            await verification.submitPartnerKyc(partnerKycBody({ tiles, files, panNumber, govIdType }));
            toast.success("Sent to ADX. Usually reviewed within a day.");
            setFiles({});
            reload();
        } catch (caught) {
            setProblem(messageOf(caught, "Could not send your documents. Try again."));
        } finally {
            setBusy(false);
        }
    };

    /** The clip up with purpose USER_KYC, then onto the partner's own UserKyc row by its id. */
    const recordVideo = async (file: File) => {
        setVideo({ name: file.name, busy: true });
        try {
            const clip = await verification.upload(file, "USER_KYC");
            await verification.submitLiveness(clip.id);
            setVideo({ name: file.name, url: clip.url, id: clip.id, busy: false });
            toast.success("Video recorded and with ADX.");
            reload();
        } catch (caught) {
            setVideo({ name: file.name, busy: false, error: messageOf(caught, "Could not record your video. Try again.") });
        }
    };

    if (digio) {
        // Leaving the upgrade re-reads both rows: a check that started has put the record back to pending.
        const leave = () => {
            setDigio(null);
            if (digio === "upgrade" || sessionId) {
                reload();
                reloadAccount();
            }
        };
        return (
            <>
                {sessionId || backup ? (
                    <PageHeading title="Verification" subtitle="Verify the shop once — so ADX can put it on the roster for quote requests and jobs." />
                ) : (
                    <PageHeading title="Verify with Digio" subtitle={digio === "upgrade" ? "The business the shop is registered as, checked by Digio — no uploads, no video." : "The owner’s identity, checked by Digio — no uploads, no video."} />
                )}
                <DigioPanel
                    key={sessionId ?? digio}
                    side="PRINT_PARTNER"
                    upgrade={digio === "upgrade"}
                    sessionId={sessionId}
                    entityType={partner?.entityType}
                    // The legal form is on the shop's row from here on: the workspace re-reads it.
                    onEntityType={reloadAccount}
                    allowTypeChange={!digioDown && (digio === "upgrade" || record?.status !== "VERIFIED")}
                    onVerified={(how) => {
                        toast.success(how === "session" ? "Verified" : "Verified with Digio");
                        setDigio(null);
                        reload();
                        reloadAccount();
                    }}
                    onUploadsInstead={leave}
                    onClose={() => {
                        setDigio(null);
                        reload();
                    }}
                    uploadsLabel={digio === "upgrade" ? "Back" : undefined}
                />
            </>
        );
    }

    return (
        <>
            <PageHeading title="Verification" subtitle="Verify the shop once — so ADX can put it on the roster for quote requests and jobs." />

            {/* Cashfree Phase 2: an identity check left open is the way on, in place of the Digio start. */}
            {resume && <SessionResumeCard className="mt-8" onContinue={() => setDigio("verify", resume)} />}

            {/* KYC-D: Digio first — the primary path; the papers below are the last resort. */}
            {digioOffered && !resume && (
                <Panel className="mt-8">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                        <div className="flex items-start gap-3">
                            <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-brand-soft text-brand">
                                <ShieldCheck className="size-5" aria-hidden />
                            </span>
                            <div>
                                <CardTitle>{backup ? SESSION_COPY.title : "Verify with Digio"}</CardTitle>
                                <p className="mt-1 max-w-xl text-sm text-dim">{backup ? SESSION_COPY.intro : digioAsked ? "ADX has started a Digio check for the shop. Digio has sent you a link; you can also open it from here." : "Digio checks the owner’s identity in about a minute — no uploads, no video. Upload the papers below only if Digio cannot be used."}</p>
                            </div>
                        </div>
                        <button type="button" onClick={() => setDigio("verify")} className={brandButton}>
                            {backup ? SESSION_COPY.title : digioAsked ? "Open Digio" : "Verify with Digio"}
                        </button>
                    </div>
                </Panel>
            )}

            {open && digioDown && record?.status !== "NEEDS_INFO" && (
                <p className="mt-8 text-sm text-dim">{availability?.provider === "DEGRADED" ? "Digio is not answering right now — upload the papers below, or come back in a few minutes." : "Digio verification is switched off — upload the papers below."}</p>
            )}

            <Panel className={digioOffered || resume ? "mt-6" : digioDown && open && record?.status !== "NEEDS_INFO" ? "mt-4" : "mt-8"}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <CardTitle>Shop verification</CardTitle>
                    <Chip tone={words.tone}>{words.label}</Chip>
                </div>
                <RequestedByAdx record={record} className="mt-4" />
                <p className="mt-3 text-sm text-ink">{partnerStandingWords(standing, record)}</p>
                {record?.status === "VERIFIED" && <p className="mt-1 text-xs text-dim">{record.digioVerifiedAt ? `Verified by Digio on ${shortDay(record.digioVerifiedAt)}` : record.reviewedAt ? `Verified by ADX on ${shortDay(record.reviewedAt)}` : "Verified by ADX"}</p>}
                {/* Phase D: the quiet door for an individual who has since registered a business — never a banner. */}
                {canUpgradeEntity(record?.status, partner?.entityType) && !digioDown && !resume && (
                    <button type="button" onClick={() => setDigio("upgrade")} className={cn(quietLink, "mt-3 block")}>
                        {ENTITY_UPGRADE_LINK}
                    </button>
                )}
                {record?.status === "NEEDS_INFO" && (
                    <ul className="mt-3 grid gap-1.5">
                        {record.reviewNote && <li className="text-sm text-dim">{record.reviewNote}</li>}
                        {record.flagged.map((flag) => (
                            <li key={flag.field} className="flex items-start gap-2 text-sm text-ink">
                                <Flag className="mt-0.5 size-3.5 shrink-0 text-danger" aria-hidden />
                                <span>
                                    <span className="font-semibold">{PARTNER_TILES.find((tile) => tile.field === flag.field)?.label ?? flag.field}</span>
                                    {flag.note ? ` — ${flag.note}` : ""}
                                </span>
                            </li>
                        ))}
                        {record.liveness?.status === "REJECTED" && (
                            <li className="flex items-start gap-2 text-sm text-ink">
                                <Flag className="mt-0.5 size-3.5 shrink-0 text-danger" aria-hidden />
                                <span>
                                    <span className="font-semibold">Video</span>
                                    {record.liveness.rejectionReason ? ` — ${record.liveness.rejectionReason}` : ""}
                                </span>
                            </li>
                        )}
                    </ul>
                )}
                {record?.status === "REJECTED" && record.rejectionReason && <p className="mt-3 rounded-md bg-danger-soft px-4 py-3 text-sm text-danger">{record.rejectionReason}</p>}
            </Panel>

            {/* The liveness clip: the desk's VERIFIED waits on it. */}
            {partnerLivenessWanted(record) && (
                <Panel className="mt-6">
                    <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_320px]">
                        <div>
                            <CardTitle>Record a short video</CardTitle>
                            <p className="mt-1 text-sm text-dim">
                                {record?.liveness?.status === "REJECTED"
                                    ? `ADX could not use the last video${record.liveness.rejectionReason ? ` — ${record.liveness.rejectionReason}` : ""}. Record it again: face the camera, good light, up to fifteen seconds.`
                                    : "A few seconds of you, facing the camera, so ADX can match the selfie to a person. Up to fifteen seconds; the desk cannot verify the shop without it."}
                            </p>
                        </div>
                        <DocumentTile label="Your video" hint="Say your name and today’s date" entry={video} onFile={(file) => void recordVideo(file)} video />
                    </div>
                </Panel>
            )}
            {record?.liveness && record.liveness.status !== "REJECTED" && record.status !== "VERIFIED" && record.method !== "DIGIO" && <p className="mt-3 text-xs text-dim">{record.liveness.status === "VERIFIED" ? "Video accepted." : "Video recorded and with ADX."}</p>}

            {/* The tiles. */}
            {open && (
                <Panel className="mt-6">
                    <CardTitle>{record?.status === "NEEDS_INFO" ? "Send the flagged documents again" : digioOffered ? "Or upload the papers" : "Documents"}</CardTitle>
                    <p className="mt-1 text-sm text-dim">{record?.status === "NEEDS_INFO" ? "Only the flagged documents are needed; everything else is kept." : `${digioOffered && !backup ? "If Digio cannot be used: each" : "Each"} file goes to ADX as you add it, privately. Send what you have; ADX asks for anything missing.`}</p>

                    {(panShown || tiles.some((tile) => tile.key.startsWith("gov-id"))) && (
                        <div className="mt-5 grid gap-5 md:grid-cols-2">
                            {panShown ? (
                                <Field label="PAN number, as printed on the card" htmlFor="partner-pan">
                                    <input id="partner-pan" value={panNumber} onChange={(event) => setPanNumber(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10))} maxLength={10} placeholder="ABCDE1234F" aria-invalid={!panValid || undefined} className={cn(inputClass, "uppercase tracking-wide", !panValid && "border-danger")} />
                                </Field>
                            ) : (
                                <span />
                            )}
                            {tiles.some((tile) => tile.key.startsWith("gov-id")) ? (
                                <Field label="Government ID type" htmlFor="partner-gov-id">
                                    <select id="partner-gov-id" value={govIdType ?? ""} onChange={(event) => setGovIdType((event.target.value || null) as GovIdType | null)} className={inputClass}>
                                        <option value="">Choose the ID</option>
                                        {GOV_ID_OPTIONS.map((option) => (
                                            <option key={option.id} value={option.id}>
                                                {option.title}
                                            </option>
                                        ))}
                                    </select>
                                </Field>
                            ) : (
                                <span />
                            )}
                        </div>
                    )}
                    {!panValid && <p className="mt-2 text-sm text-danger">The PAN is five letters, four digits, a letter.</p>}

                    <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                        {tiles.map((tile) => {
                            const flag = record?.flagged.find((item) => item.field === tile.field);
                            const inert = tile.key === "gov-id-back" && govIdType === "PASSPORT";
                            return (
                                <DocumentTile
                                    key={tile.key}
                                    label={tile.label}
                                    hint={inert ? "Not applicable — a passport has no back" : tile.hint}
                                    entry={files[tile.key]}
                                    onFile={(file) => void store(tile, file)}
                                    flag={flag ? (flag.note ?? "") : null}
                                    inert={inert}
                                    pdf={tile.pdf}
                                    camera={tile.camera}
                                />
                            );
                        })}
                    </div>

                    {problem && (
                        <p role="alert" className="mt-4 text-sm text-danger">
                            {problem}
                        </p>
                    )}
                    <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-line pt-5">
                        <button type="button" onClick={() => void submit()} disabled={!canSubmit} className={brandButton}>
                            {busy ? "Sending…" : record?.status === "NEEDS_INFO" ? "Resubmit for review" : "Send to ADX"}
                        </button>
                        <button type="button" onClick={reload} className={outlineButton}>
                            Check again
                        </button>
                        <p className="text-xs text-dim">
                            {uploaded.length} of {tiles.length} document{tiles.length === 1 ? "" : "s"} ready
                        </p>
                    </div>
                </Panel>
            )}
        </>
    );
}
