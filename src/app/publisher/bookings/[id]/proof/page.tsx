"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { CalendarDays, ChevronLeft, Plus } from "lucide-react";
import { toast } from "sonner";
import { Panel } from "@/components/workspace/page-heading";
import { brandButton, CardTitle, Chip, ErrorNote, KeyRow, Loading, outlineButton, textareaClass } from "@/components/publisher/parts";
import { UploadBox } from "@/components/publisher/upload-box";
import { PrivateImage } from "@/components/files/private-file";
import { useLoad } from "@/components/publisher/use-load";
import { messageOf } from "@/lib/api-client";
import { disputeHref, MAX_BEFORE_PHOTOS, selfInstallFiled } from "@/services/publisher-bookings";
import { bookingRef, dateRange, dateTime, isDigital, longDate, publisherWorkspace, type BookingDetail, type Evidence, type EvidenceKind, type EvidencePhoto, type UploadedFile } from "@/services/publisher-workspace";

const KIND_LABEL: Record<EvidenceKind, string> = {
    PICKUP: "Prints collected",
    CONDITION: "The spot before the work",
    INSTALLATION: "The advertisement in place",
    REJECTION: "Why the site was refused",
};

const KIND_ORDER: EvidenceKind[] = ["PICKUP", "CONDITION", "INSTALLATION", "REJECTION"];

async function readProof(id: string): Promise<{ booking: BookingDetail; evidence: Evidence | null }> {
    const booking = await publisherWorkspace.booking(id);
    const evidence = ["PENDING_PUBLISHER", "PUBLISHER_REJECTED", "DRAFT", "PENDING_PRINT", "CANCELLED"].includes(booking.status) ? null : await publisherWorkspace.evidence(id).catch(() => null);
    return { booking, evidence };
}

/**
 * DR 12 · 10 · 10/11 · Installation proof (5204:89393, 5204:89762): the
 * draft the publisher assembles when they install it themselves — the
 * prints, as many photos of the spot before the work as it takes, the
 * advertisement in place, and a note — and the same record once it is
 * filed, by them or by ADX's installer, with the requirements it was gated
 * on and "Raise a dispute" when something is wrong with the work.
 */
export default function ProofPage() {
    const { id } = useParams<{ id: string }>();
    const { data, error, loading, reload } = useLoad(`proof:${id}`, () => readProof(id));

    if (!data && loading) return <Loading label="Loading the proof…" />;
    if (!data) return <ErrorNote message={error ?? "Could not read this booking."} onRetry={reload} />;

    const { booking, evidence } = data;
    return booking.status === "SELF_INSTALL" ? <Draft booking={booking} evidence={evidence} reload={reload} /> : <Filed booking={booking} evidence={evidence} />;
}

function Header({ booking, title }: { booking: BookingDetail; title: string }) {
    return (
        <>
            <Link href={`/publisher/bookings/${booking.id}`} className="inline-flex items-center gap-1 text-sm text-dim hover:text-ink">
                <ChevronLeft className="size-4" aria-hidden />
                {bookingRef(booking)}
            </Link>
            <h1 className="mt-4 text-2xl font-semibold tracking-tight text-ink">{title}</h1>
        </>
    );
}

function Identity({ booking, line, chip }: { booking: BookingDetail; line: string; chip: React.ReactNode }) {
    return (
        <div className="px-6 pb-6 pt-5">
            <p className="text-sm text-dim">{line}</p>
            <p className="mt-3 text-lg font-semibold text-ink">{booking.campaignName ?? "Campaign"}</p>
            <p className="text-sm text-dim">
                {booking.listing?.title ?? "Space"} · {bookingRef(booking)}
            </p>
            <p className="mt-3 flex items-center gap-2 text-sm text-ink">
                <CalendarDays className="size-4 text-dim" aria-hidden />
                {dateRange(booking.startDate, booking.endDate, { month: "long" })}
            </p>
            <div className="mt-3">{chip}</div>
        </div>
    );
}

function PhotoGrid({ photos }: { photos: EvidencePhoto[] }) {
    return (
        <div className="mt-3 grid gap-4 sm:grid-cols-2 md:grid-cols-3">
            {photos.map((photo, index) => (
                <figure key={photo.id}>
                    {/* ST-2: a photo filed as VERIFICATION is a private file — drawn with the bearer. */}
                    <PrivateImage src={photo.url} alt={photo.label ?? KIND_LABEL[photo.kind]} className="aspect-[16/10] w-full rounded-lg object-cover" />
                    <figcaption className="mt-2 text-xs text-dim">
                        {photo.label ?? `Photo ${index + 1}`} · {dateTime(photo.capturedAt)}
                    </figcaption>
                </figure>
            ))}
        </div>
    );
}

/* Draft — the publisher's own photographs, then the self-install calls in order; steps already on file are not filed again. */
function Draft({ booking, evidence, reload }: { booking: BookingDetail; evidence: Evidence | null; reload: () => void }) {
    const digital = booking.listing ? isDigital(booking.listing) : false;
    const filed = selfInstallFiled(evidence?.counts);
    const filedPhotos = evidence?.photos ?? [];
    const [prints, setPrints] = React.useState<UploadedFile | null>(null);
    const [before, setBefore] = React.useState<(UploadedFile | null)[]>([null]);
    const [after, setAfter] = React.useState<UploadedFile | null>(null);
    const [notes, setNotes] = React.useState("");
    const [busy, setBusy] = React.useState(false);
    const [failure, setFailure] = React.useState<string | null>(null);
    const beforeShots = before.filter((shot): shot is UploadedFile => shot !== null);
    const ready = (filed.prints || !!prints) && (filed.condition || beforeShots.length > 0) && !!after;
    const missing = [!filed.prints && !prints ? (digital ? "the creative received" : "the prints collected") : null, !filed.condition && beforeShots.length === 0 ? "the spot before the work" : null, !after ? (digital ? "the creative playing" : "the advertisement in place") : null].filter(Boolean);

    const submit = async () => {
        if (!ready || busy) return;
        setBusy(true);
        setFailure(null);
        try {
            const position = await new Promise<{ latitude: number; longitude: number } | undefined>((resolve) => {
                if (typeof navigator === "undefined" || !navigator.geolocation) return resolve(undefined);
                navigator.geolocation.getCurrentPosition(
                    (fix) => resolve({ latitude: fix.coords.latitude, longitude: fix.coords.longitude }),
                    () => resolve(undefined),
                    { timeout: 4000, maximumAge: 60_000 }
                );
            });
            if (prints) await publisherWorkspace.selfCollectPrints(booking.id, prints.url);
            if (beforeShots.length > 0) await publisherWorkspace.selfCaptureCondition(booking.id, beforeShots.map((shot) => shot.url), notes);
            // The check-in is best-effort and goes before the last step, which moves the booking on.
            await publisherWorkspace.selfCheckIn(booking.id, position).catch(() => undefined);
            await publisherWorkspace.selfCaptureInstallation(booking.id, after!.url, notes);
            toast.success(digital ? "Playback proof submitted" : "Installation proof submitted");
            reload();
        } catch (caught) {
            setFailure(messageOf(caught, "Could not submit the proof. Anything already filed is kept — try again and only the rest is sent."));
            setBusy(false);
            reload();
        }
    };

    const setBeforeAt = (index: number, file: UploadedFile | null) =>
        setBefore((current) => {
            const next = current.map((shot, at) => (at === index ? file : shot));
            const kept = next.filter((shot, at) => shot !== null || at === next.length - 1);
            return kept.length === 0 ? [null] : kept;
        });

    return (
        <>
            <Header booking={booking} title={`${digital ? "Playback proof" : "Installation proof"} · ${bookingRef(booking)}`} />
            <section className="mt-6 rounded-lg border border-line bg-white">
                <Identity booking={booking} line="Draft · not submitted" chip={<Chip tone={ready ? "warning" : "neutral"}>{ready ? "Ready to submit" : "Add the photos"}</Chip>} />

                {filedPhotos.length > 0 && (
                    <div className="border-t border-line px-6 py-6">
                        <CardTitle>Already on file</CardTitle>
                        <p className="mt-1 text-sm text-dim">
                            {filedPhotos.length} photo{filedPhotos.length === 1 ? " is" : "s are"} filed against this booking already. Anything you add now goes on top; nothing is filed twice.
                        </p>
                        <PhotoGrid photos={filedPhotos} />
                    </div>
                )}

                <div className="border-t border-line px-6 py-6">
                    <CardTitle>{digital ? "1 · The creative received" : "1 · Prints collected"}</CardTitle>
                    {filed.prints ? (
                        <p className="mt-2 text-sm text-success">On file — photographed when you collected them.</p>
                    ) : (
                        <div className="mt-3 max-w-[260px]">
                            <UploadBox compact purpose="VERIFICATION" accept="image/*" label="Add photo" hint="JPG or PNG, up to 10MB" value={prints} onChange={setPrints} />
                        </div>
                    )}

                    <CardTitle className="mt-6">{digital ? "2 · The screen before playback" : "2 · The spot before you start"}</CardTitle>
                    <p className="mt-1 text-sm text-dim">As many photos as it takes to show the spot as you found it — a crack in the wall, the old frame, the light. Up to {MAX_BEFORE_PHOTOS} at a time.</p>
                    <div className="mt-3 grid gap-4 sm:grid-cols-2 md:grid-cols-3">
                        {before.map((shot, index) => (
                            <UploadBox key={index} compact purpose="VERIFICATION" accept="image/*" label="Add photo" hint="JPG or PNG, up to 10MB" value={shot} onChange={(file) => setBeforeAt(index, file)} />
                        ))}
                        {before.length < MAX_BEFORE_PHOTOS && before[before.length - 1] !== null && (
                            <button type="button" onClick={() => setBefore((current) => [...current, null])} className="flex aspect-[16/10] w-full flex-col items-center justify-center rounded-lg border border-dashed border-line text-sm text-dim hover:border-dim hover:text-ink">
                                <Plus className="size-5" aria-hidden />
                                Another photo
                            </button>
                        )}
                    </div>
                    {filed.condition && <p className="mt-2 text-xs text-dim">Photos of the spot are already on file; these are optional extras.</p>}

                    <CardTitle className="mt-6">{digital ? "3 · The creative playing" : "3 · The advertisement in place"}</CardTitle>
                    <div className="mt-3 max-w-[260px]">
                        <UploadBox compact purpose="VERIFICATION" accept="image/*" label="Add photo" hint="JPG or PNG, up to 10MB" value={after} onChange={setAfter} />
                    </div>

                    <CardTitle className="mt-6">{digital ? "Playback notes" : "Installation notes"}</CardTitle>
                    <textarea value={notes} onChange={(event) => setNotes(event.target.value.slice(0, 500))} rows={3} maxLength={500} placeholder="Anything ADX should know — a crack in the wall, the frame you used, where you hung it. Optional." className={`${textareaClass} mt-3`} />
                    <p className="mt-2 text-xs text-dim">Sent with the photos and kept on the booking for ADX and the advertiser · {500 - notes.length} characters left</p>
                    <p className="mt-3 text-xs text-dim">Where you are is asked once, when you submit, to record how far from the spot the work was filed. Saying no does not stop the proof.</p>
                    {failure && (
                        <div className="mt-4">
                            <ErrorNote message={failure} />
                        </div>
                    )}
                </div>
            </section>
            <div className="mt-6 flex flex-wrap items-center justify-end gap-3">
                {!ready && missing.length > 0 && <p className="mr-auto text-sm text-dim">Still needed: {missing.join(", ")}.</p>}
                <Link href={`/publisher/bookings/${booking.id}`} className={outlineButton}>
                    Back to the booking
                </Link>
                <button type="button" onClick={submit} disabled={!ready || busy} className={brandButton}>
                    {busy ? "Submitting…" : digital ? "Submit playback proof" : "Submit installation proof"}
                </button>
            </div>
        </>
    );
}

/* Filed — what stands against the booking, by whoever filed it. */
function Filed({ booking, evidence }: { booking: BookingDetail; evidence: Evidence | null }) {
    const photos = evidence?.photos ?? [];
    const inReview = booking.status === "PENDING_APPROVAL" || booking.status === "PENDING_OTP";
    const signedOff = booking.status === "COMPLETED";
    const chip = signedOff ? <Chip tone="success">Approved</Chip> : inReview ? <Chip tone="warning">In review</Chip> : photos.length > 0 ? <Chip tone="info">Being filed</Chip> : <Chip tone="neutral">Nothing filed yet</Chip>;
    const filedOn = booking.verification?.verifiedAt ?? (photos.length > 0 ? photos.reduce((latest, p) => (p.capturedAt > latest ? p.capturedAt : latest), photos[0]!.capturedAt) : null);
    const title = signedOff ? "Installation proof · Approved" : inReview ? "Installation proof · In review" : `Installation proof · ${bookingRef(booking)}`;
    const line = signedOff && booking.adminApprovedAt ? `Approved · ${longDate(booking.adminApprovedAt, { month: "long" })}` : filedOn ? `Submitted · ${longDate(filedOn, { month: "long" })}` : "Waiting for the installer";
    const groups = KIND_ORDER.map((kind) => ({ kind, photos: photos.filter((photo) => photo.kind === kind) })).filter((group) => group.photos.length > 0);
    const canDispute = photos.length > 0 || ["IN_PROGRESS", "PENDING_OTP", "PENDING_APPROVAL", "COMPLETED"].includes(booking.status);

    return (
        <>
            <Header booking={booking} title={title} />
            <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_300px]">
                <div className="grid content-start gap-6">
                    <section className="rounded-lg border border-line bg-white">
                        <Identity booking={booking} line={line} chip={chip} />
                        <div className="border-t border-line px-6 py-6">
                            {groups.length === 0 ? (
                                <>
                                    <CardTitle>Installation photos</CardTitle>
                                    <p className="mt-3 text-sm text-dim">{booking.status === "PENDING_PRINT" ? "Photos appear here once the prints are ready and the work begins." : "Nothing has been filed against this booking yet. Photographs appear here as the installer takes them."}</p>
                                </>
                            ) : (
                                groups.map((group, index) => (
                                    <div key={group.kind} className={index > 0 ? "mt-6" : undefined}>
                                        <CardTitle>{KIND_LABEL[group.kind]}</CardTitle>
                                        <PhotoGrid photos={group.photos} />
                                    </div>
                                ))
                            )}
                            <CardTitle className="mt-6">Installation notes</CardTitle>
                            {booking.selfInstallNotes && <p className="mt-2 whitespace-pre-line rounded-md bg-ground px-3 py-2 text-sm text-ink">{booking.selfInstallNotes}</p>}
                            {booking.verification?.notes && <p className="mt-2 whitespace-pre-line rounded-md bg-ground px-3 py-2 text-sm text-ink">From the installer: {booking.verification.notes}</p>}
                            {!booking.selfInstallNotes && !booking.verification?.notes && <p className="mt-2 text-sm text-dim">No notes were added.</p>}
                        </div>
                    </section>

                    {booking.status === "PENDING_OTP" && (
                        <Panel>
                            <CardTitle>Your confirmation</CardTitle>
                            <p className="mt-2 text-sm text-dim">ADX has sent you a six-digit code. Read it out to the installer once you are happy the advertisement is up and looks like these photographs. That code is your confirmation, so do not give it before then — nothing on this page signs the work off.</p>
                        </Panel>
                    )}
                    {booking.status === "PENDING_APPROVAL" && (
                        <Panel>
                            <CardTitle>Confirmed</CardTitle>
                            <p className="mt-2 text-sm text-dim">The work is confirmed. ADX is reviewing the evidence before the campaign starts earning.</p>
                        </Panel>
                    )}
                    {signedOff && (
                        <Panel>
                            <CardTitle>Signed off</CardTitle>
                            <p className="mt-2 text-sm text-dim">ADX approved this installation{booking.adminApprovedAt ? ` on ${longDate(booking.adminApprovedAt, { month: "long" })}` : ""}. Your earnings accrue a day at a time from there.</p>
                        </Panel>
                    )}
                </div>

                <div className="grid content-start gap-6">
                    {evidence && evidence.requirements.length > 0 && (
                        <Panel>
                            <CardTitle>Requirements</CardTitle>
                            <p className="mt-1 text-sm text-dim">{evidence.met === evidence.total ? `All requirements met · ${evidence.met} of ${evidence.total}` : `${evidence.met} of ${evidence.total} met`}</p>
                            <ul className="mt-3 grid gap-1.5 text-sm">
                                {evidence.requirements.map((requirement) => (
                                    <li key={requirement.key} className="flex items-start justify-between gap-3">
                                        <span className="text-ink">{requirement.label}</span>
                                        <span className={requirement.met ? "text-success" : "text-dim"}>{requirement.met ? "Done" : "Outstanding"}</span>
                                    </li>
                                ))}
                            </ul>
                        </Panel>
                    )}
                    <Panel>
                        <CardTitle>Campaign period</CardTitle>
                        <div className="mt-2">
                            <KeyRow label="Run dates" value={dateRange(booking.startDate, booking.endDate)} />
                            {booking.checkIn && <KeyRow label="Checked in" value={`${dateTime(booking.checkIn.checkedInAt)} · ${Math.round(booking.checkIn.distanceM)} m from the spot`} />}
                            {booking.agent?.user?.name && <KeyRow label="Installed by" value={booking.agent.user.name} />}
                        </div>
                    </Panel>
                    {canDispute && (
                        <Panel>
                            <CardTitle>Something wrong with this work?</CardTitle>
                            <p className="mt-2 text-sm text-dim">Raise a dispute on this booking. ADX reads the same photographs you see here, hears the installer&apos;s side, and decides — you follow the case under Disputes.</p>
                            <Link href={disputeHref(booking.id)} className={`${outlineButton} mt-4 w-full`}>
                                Raise a dispute
                            </Link>
                        </Panel>
                    )}
                </div>
            </div>
            <div className="mt-6 flex flex-wrap justify-end gap-3">
                <Link href={`/publisher/bookings/${booking.id}`} className={outlineButton}>
                    View booking
                </Link>
                <Link href="/publisher/bookings" className={brandButton}>
                    Back to bookings
                </Link>
            </div>
        </>
    );
}
