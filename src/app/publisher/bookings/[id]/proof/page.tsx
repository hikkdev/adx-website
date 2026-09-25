"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { CalendarDays, ChevronLeft } from "lucide-react";
import { toast } from "sonner";
import { Panel } from "@/components/workspace/page-heading";
import { brandButton, CardTitle, Chip, ErrorNote, Loading, outlineButton, textareaClass } from "@/components/publisher/parts";
import { UploadBox } from "@/components/publisher/upload-box";
import { useLoad } from "@/components/publisher/use-load";
import { messageOf } from "@/lib/api-client";
import { bookingRef, dateRange, isDigital, longDate, publisherWorkspace, type BookingDetail, type Evidence, type EvidenceKind, type UploadedFile } from "@/services/publisher-workspace";

const KIND_LABEL: Record<EvidenceKind, string> = {
    PICKUP: "Prints collected",
    CONDITION: "The spot before the work",
    INSTALLATION: "The advertisement in place",
    REJECTION: "Why the site was refused",
};

const STEPS: { key: "prints" | "before" | "after"; label: string; digital: string }[] = [
    { key: "prints", label: "Photo 1 · Prints collected", digital: "Photo 1 · Creative received" },
    { key: "before", label: "Photo 2 · The spot before installation", digital: "Photo 2 · The screen before playback" },
    { key: "after", label: "Photo 3 · The advertisement in place", digital: "Photo 3 · The creative playing" },
];

async function readProof(id: string): Promise<{ booking: BookingDetail; evidence: Evidence | null }> {
    const booking = await publisherWorkspace.booking(id);
    const evidence = ["PENDING_PUBLISHER", "PUBLISHER_REJECTED", "DRAFT", "PENDING_PRINT", "CANCELLED"].includes(booking.status) ? null : await publisherWorkspace.evidence(id).catch(() => null);
    return { booking, evidence };
}

/**
 * DR 12 · 10 · 10/11 · Installation proof (5204:89393, 5204:89762): the
 * draft the publisher assembles when they install it themselves — three
 * photographs, then submit — and the same record once it is filed and
 * under review, or filed by ADX's installer.
 */
export default function ProofPage() {
    const { id } = useParams<{ id: string }>();
    const { data, error, loading, reload } = useLoad(`proof:${id}`, () => readProof(id));

    if (!data && loading) return <Loading label="Loading the proof…" />;
    if (!data) return <ErrorNote message={error ?? "Could not read this booking."} onRetry={reload} />;

    const { booking, evidence } = data;
    const draft = booking.status === "SELF_INSTALL";
    return draft ? <Draft booking={booking} reload={reload} /> : <Filed booking={booking} evidence={evidence} />;
}

function Header({ booking, title }: { booking: BookingDetail; title: string }) {
    return (
        <>
            <Link href={`/publisher/bookings/${booking.id}`} className="inline-flex items-center gap-1 text-sm text-dim hover:text-ink">
                <ChevronLeft className="size-4" aria-hidden />
                Bookings
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

/* Draft — the publisher's own three photographs, then the four self-install calls in order. */
function Draft({ booking, reload }: { booking: BookingDetail; reload: () => void }) {
    const digital = booking.listing ? isDigital(booking.listing) : false;
    const [photos, setPhotos] = React.useState<Record<"prints" | "before" | "after", UploadedFile | null>>({ prints: null, before: null, after: null });
    const [notes, setNotes] = React.useState("");
    const [busy, setBusy] = React.useState(false);
    const [failure, setFailure] = React.useState<string | null>(null);
    const ready = !!photos.prints && !!photos.before && !!photos.after;

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
            await publisherWorkspace.selfCollectPrints(booking.id, photos.prints!.url);
            await publisherWorkspace.selfCaptureCondition(booking.id, [photos.before!.url], notes);
            await publisherWorkspace.selfCheckIn(booking.id, position);
            await publisherWorkspace.selfCaptureInstallation(booking.id, photos.after!.url, notes);
            toast.success("Installation proof submitted");
            reload();
        } catch (caught) {
            setFailure(messageOf(caught, "Could not submit the proof. Anything already filed is kept — try again."));
            setBusy(false);
        }
    };

    return (
        <>
            <Header booking={booking} title={`${digital ? "Playback proof" : "Installation proof"} · ${bookingRef(booking)}`} />
            <Panel className="mt-6 p-0">
                <Identity booking={booking} line="Draft · not submitted" chip={<Chip tone={ready ? "warning" : "neutral"}>{ready ? "Ready to submit" : "Add three photos"}</Chip>} />
                <div className="border-t border-line px-6 py-6">
                    <CardTitle>{digital ? "Playback photos" : "Installation photos"}</CardTitle>
                    <div className="mt-4 grid gap-4 md:grid-cols-3">
                        {STEPS.map((step) => (
                            <div key={step.key}>
                                <UploadBox compact purpose="VERIFICATION" accept="image/*" label="Add photo" hint="JPG or PNG, up to 10MB" value={photos[step.key]} onChange={(file) => setPhotos((current) => ({ ...current, [step.key]: file }))} />
                                <p className="mt-2 text-xs text-dim">{digital ? step.digital : step.label}</p>
                            </div>
                        ))}
                    </div>
                    <CardTitle className="mt-6">{digital ? "Playback notes" : "Installation notes"}</CardTitle>
                    <textarea value={notes} onChange={(event) => setNotes(event.target.value.slice(0, 500))} rows={3} maxLength={500} placeholder="What you did, when, and anything ADX should know — lighting, mounting, timing. Optional." className={`${textareaClass} mt-3`} />
                    <p className="mt-2 text-xs text-dim">Sent with the photos and kept on the booking for ADX and the advertiser · {500 - notes.length} characters left</p>
                    {failure && <ErrorNote message={failure} />}
                </div>
            </Panel>
            <div className="mt-6 flex flex-wrap justify-end gap-3">
                <Link href={`/publisher/bookings/${booking.id}`} className={outlineButton}>
                    Back to bookings
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
    const filedOn = photos.length > 0 ? photos.reduce((latest, p) => (p.capturedAt > latest ? p.capturedAt : latest), photos[0]!.capturedAt) : null;
    const title = signedOff ? "Installation proof · Approved" : inReview ? "Installation proof · In review" : `Installation proof · ${bookingRef(booking)}`;
    const line = filedOn ? `${signedOff ? "Approved" : "Submitted"} · ${longDate(booking.adminApprovedAt ?? filedOn, { month: "long" })}` : "Waiting for the installer";

    return (
        <>
            <Header booking={booking} title={title} />
            <Panel className="mt-6 p-0">
                <Identity booking={booking} line={line} chip={chip} />
                <div className="border-t border-line px-6 py-6">
                    <CardTitle>Installation photos</CardTitle>
                    {photos.length === 0 ? (
                        <p className="mt-3 text-sm text-dim">{booking.status === "PENDING_PRINT" ? "Photos appear here once the prints are ready and the work begins." : "Nothing has been filed against this booking yet. Photographs appear here as the installer files them."}</p>
                    ) : (
                        <div className="mt-4 grid gap-4 md:grid-cols-3">
                            {photos.map((photo, index) => (
                                <figure key={photo.id}>
                                    { }
                                    <img src={photo.url} alt={photo.label ?? KIND_LABEL[photo.kind]} className="aspect-[16/10] w-full rounded-lg object-cover" />
                                    <figcaption className="mt-2 text-xs text-dim">
                                        Photo {index + 1} · {photo.label ?? KIND_LABEL[photo.kind]}
                                    </figcaption>
                                </figure>
                            ))}
                        </div>
                    )}
                    {evidence && evidence.requirements.length > 0 && (
                        <ul className="mt-5 grid gap-1 text-sm">
                            {evidence.requirements.map((requirement) => (
                                <li key={requirement.key} className={requirement.met ? "text-success" : "text-dim"}>
                                    {requirement.met ? "✓" : "○"} {requirement.label}
                                </li>
                            ))}
                        </ul>
                    )}
                    <CardTitle className="mt-6">Installation notes</CardTitle>
                    {booking.selfInstallNotes && <p className="mt-2 whitespace-pre-line rounded-md bg-ground px-3 py-2 text-sm text-ink">{booking.selfInstallNotes}</p>}
                    <p className="mt-2 text-sm text-dim">{booking.verification?.notes ?? (booking.checkIn ? `Checked in at the site ${longDate(booking.checkIn.checkedInAt, { month: "long" })}${booking.checkIn.distanceM ? `, ${Math.round(booking.checkIn.distanceM)} m from the pin` : ""}.` : booking.selfInstallNotes ? "" : "No notes were added.")}</p>
                </div>
            </Panel>
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
