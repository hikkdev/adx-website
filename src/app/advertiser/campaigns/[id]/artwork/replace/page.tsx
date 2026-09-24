"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { messageOf } from "@/lib/api-client";
import { BookingCard, BookingHeader, ErrorNote, primaryButton, secondaryButton, smallButton } from "@/components/booking/booking-frame";
import { useCampaign } from "@/components/booking/use-campaign";
import { stepHref, useCampaignId } from "@/components/booking/step-page";
import { useListingCards } from "@/components/booking/summary-rail";
import { UploadTile, measureFile } from "@/components/booking/upload-tile";
import { artworkRequirements, bookingService, creativeFor, creativeNeedsChange, isDigital, orientationOf, prettySize } from "@/services/booking";

/**
 * "Replace the mall video" (5204:67327): the desk's note in the pink
 * banner, the current file, "Choose replacement video", the export settings
 * to meet, and where the other placements stand. Saving uploads the file
 * and adds it as the new row for the spot — the backend points it at the
 * one it replaces.
 */
export default function ReplacePage({ params }: { params: Promise<{ id: string }> }) {
    const id = useCampaignId(params);
    return (
        <React.Suspense>
            <Replace id={id} />
        </React.Suspense>
    );
}

function Replace({ id }: { id: string }) {
    const router = useRouter();
    const search = useSearchParams();
    const { state } = useCampaign(id);
    const campaign = state.kind === "ready" ? state.campaign : null;
    const cards = useListingCards(campaign?.spots.map((spot) => spot.listingId) ?? []);
    const wanted = search.get("spot");
    const spot = campaign?.spots.find((s) => s.id === wanted) ?? null;
    const [picked, setPicked] = React.useState<File | null>(null);
    const [busy, setBusy] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);
    const back = stepHref(id, "artwork/files");

    if (state.kind !== "ready" || !campaign || !spot) {
        return (
            <div className="mx-auto max-w-[1008px]">
                <BookingHeader back={{ href: back, label: "Back to artwork" }} title="Replace the file" subtitle={state.kind === "error" ? state.message : state.kind === "ready" ? "That placement is not part of this campaign." : "Loading…"} />
            </div>
        );
    }

    const card = cards[spot.listingId];
    const digital = isDigital({ display: card?.display, mediaTypeName: spot.listing.mediaType?.name });
    const size = prettySize(card?.size ?? null);
    const current = creativeFor(campaign.creatives, spot.id);
    const others = campaign.spots.filter((s) => s.id !== spot.id);
    const rows = artworkRequirements(digital ? "digital" : "print", card?.size ?? null);
    const wantedOrientation = orientationOf(size);
    const currentOrientation = current?.widthPx && current?.heightPx ? orientationOf(`${current.widthPx}×${current.heightPx}`) : null;
    const noun = digital ? "video" : "file";

    const save = async () => {
        if (!picked) return;
        setBusy(true);
        setError(null);
        try {
            const stored = await bookingService.uploadFile(picked, "CAMPAIGN_CREATIVE");
            const measured = await measureFile(picked);
            await bookingService.addCreative(campaign.id, { spotId: spot.id, fileUrl: stored.url, fileName: picked.name, fileSize: picked.size, mimeType: picked.type || undefined, ...measured });
            router.push(back);
        } catch (caught) {
            setError(messageOf(caught, "Could not upload the replacement."));
            setBusy(false);
        }
    };

    return (
        <div className="mx-auto max-w-[1008px]">
            <BookingHeader back={{ href: back, label: "Back to artwork" }} title={`Replace the ${spot.listing.title.split(" ")[0]?.toLowerCase() ?? ""} ${noun}`} subtitle={`${campaign.name} · ${spot.listing.title}`} />
            <BookingCard className="mt-6">
                {(creativeNeedsChange(current) || wantedOrientation) && (
                    <div className="rounded-md bg-brand-soft px-4 py-4">
                        <p className="text-base font-semibold text-ink">{creativeNeedsChange(current) ? (current?.status === "REJECTED" ? "The file was not accepted" : "A change was asked for") : `Use a ${wantedOrientation?.toLowerCase()} export`}</p>
                        <p className="mt-1 text-sm text-ink">
                            {current?.reviewNote ??
                                (currentOrientation && wantedOrientation && currentOrientation !== wantedOrientation
                                    ? `The current ${noun} is ${currentOrientation.toLowerCase()}. Export it at ${size} for the ${spot.listing.title} screen.`
                                    : `Export it at ${size ?? "the placement's size"} for ${spot.listing.title}.`)}
                        </p>
                    </div>
                )}

                <p className="mt-6 text-sm font-medium text-ink">{digital ? "Video file" : "Artwork file"}</p>
                <UploadTile className="mt-2" file={picked ? { fileName: picked.name, mimeType: picked.type, fileSize: picked.size } : current?.fileUrl ? current : null} empty={`Choose a replacement ${noun}`} accept={digital ? "video/mp4,video/quicktime,image/jpeg,image/png" : "application/pdf,image/jpeg,image/png"} busy={busy} onPick={setPicked} statusLine={picked ? "Ready to save" : current ? `Current file${currentOrientation ? ` · ${currentOrientation} orientation` : ""}` : undefined} />
                <label className={`${smallButton} mt-3`}>
                    Choose replacement {noun}
                    <input type="file" className="sr-only" accept={digital ? "video/mp4,video/quicktime,image/jpeg,image/png" : "application/pdf,image/jpeg,image/png"} onChange={(event) => setPicked(event.target.files?.[0] ?? null)} />
                </label>

                <p className="mt-7 text-sm font-medium text-ink">Export settings</p>
                <dl className="mt-2 divide-y divide-line">
                    {rows.map((row) => (
                        <div key={row.label} className="flex items-center justify-between gap-4 py-3 text-sm">
                            <dt className="text-dim">{row.label}</dt>
                            <dd className="text-right font-medium text-ink">{row.value}</dd>
                        </div>
                    ))}
                </dl>
                <Link href={`${stepHref(id, "artwork/requirements")}?spot=${encodeURIComponent(spot.id)}`} className="mt-4 inline-flex text-sm font-medium text-ink underline underline-offset-2">
                    View full artwork requirements
                </Link>

                {others.length > 0 && (
                    <div className="mt-6 border-t border-line pt-6">
                        {others.map((other) => {
                            const theirs = creativeFor(campaign.creatives, other.id);
                            const ready = !!theirs?.fileUrl && !creativeNeedsChange(theirs);
                            return (
                                <div key={other.id} className="text-sm">
                                    <p className="font-medium text-ink">
                                        {other.listing.title} artwork {ready ? "is ready" : theirs?.fileUrl ? "needs a change" : "is not uploaded"}
                                    </p>
                                    <p className="text-dim">{theirs?.fileName ? `${theirs.fileName} · ${ready ? "No changes needed" : (theirs.reviewNote ?? "See the note on the artwork step")}` : "Upload it on the artwork step."}</p>
                                </div>
                            );
                        })}
                    </div>
                )}
                <ErrorNote message={error} className="mt-4" />
            </BookingCard>
            <div className="mt-6 flex items-center justify-between">
                <Link href={back} className={secondaryButton}>
                    Cancel
                </Link>
                <button type="button" disabled={!picked || busy} onClick={() => void save()} className={primaryButton}>
                    {busy ? "Saving…" : "Save replacement"}
                </button>
            </div>
        </div>
    );
}
