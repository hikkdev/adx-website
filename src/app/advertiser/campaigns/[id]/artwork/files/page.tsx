"use client";

import * as React from "react";
import Link from "next/link";
import { messageOf } from "@/lib/api-client";
import { BookingCard, ErrorNote, StepFooter, smallButton } from "@/components/booking/booking-frame";
import { StepPage, stepHref, useCampaignId, type ReadyCampaign } from "@/components/booking/step-page";
import { useListingCards } from "@/components/booking/summary-rail";
import { UploadTile, measureFile } from "@/components/booking/upload-tile";
import { CREATIVE_STATUS_LABEL, bookingService, creativeFor, creativeNeedsChange, isDigital, orientationOf, prettySize, type CampaignSpot } from "@/services/booking";

const PRINT_ACCEPT = "application/pdf,image/jpeg,image/png";
const VIDEO_ACCEPT = "video/mp4,video/quicktime,image/jpeg,image/png";

/**
 * Step 3 · Artwork files (5204:63047): one upload per placement — the
 * file's name, kind and size in its box, "Replace file" and "Remove" under
 * it, and the desk's note when a file was sent back (5204:67327 opens from
 * it). A file goes to `POST /upload` and then onto the campaign as a
 * creative row for that spot.
 */
export default function ArtworkFilesPage({ params }: { params: Promise<{ id: string }> }) {
    const id = useCampaignId(params);
    return (
        <StepPage id={id} step={3}>
            {(ready) => <ArtworkFiles key={ready.campaign.id} ready={ready} />}
        </StepPage>
    );
}

function ArtworkFiles({ ready }: { ready: ReadyCampaign }) {
    const { campaign } = ready;
    const cards = useListingCards(campaign.spots.map((spot) => spot.listingId));
    const [busy, setBusy] = React.useState<string | null>(null);
    const [error, setError] = React.useState<string | null>(null);

    const upload = async (spot: CampaignSpot, file: File) => {
        setBusy(spot.id);
        setError(null);
        try {
            const limit = file.type.startsWith("video/") ? 50 * 1024 * 1024 : 10 * 1024 * 1024;
            if (file.size > limit) throw new Error(`${file.name} is larger than ${file.type.startsWith("video/") ? "50" : "10"} MB.`);
            const stored = await bookingService.uploadFile(file, "CAMPAIGN_CREATIVE");
            const measured = await measureFile(file);
            await bookingService.addCreative(campaign.id, { spotId: spot.id, fileUrl: stored.url, fileName: file.name, fileSize: file.size, mimeType: file.type || undefined, ...measured });
            ready.reload();
        } catch (caught) {
            setError(caught instanceof Error && !("status" in caught) ? caught.message : messageOf(caught, "Could not upload the file."));
        } finally {
            setBusy(null);
        }
    };

    const remove = async (spot: CampaignSpot, creativeId: string) => {
        setBusy(spot.id);
        setError(null);
        try {
            await bookingService.deleteCreative(campaign.id, creativeId);
            ready.reload();
        } catch (caught) {
            setError(messageOf(caught, "Could not remove the file."));
        } finally {
            setBusy(null);
        }
    };

    const uploaded = campaign.spots.filter((spot) => creativeFor(campaign.creatives, spot.id)?.fileUrl).length;

    return (
        <>
            <BookingCard title="Artwork files" description="Upload the required file for each placement. Your publisher checks the files before printing or display.">
                <ErrorNote message={error} className="mt-4" />
                <div className="mt-6 divide-y divide-line">
                    {campaign.spots.map((spot) => {
                        const card = cards[spot.listingId];
                        const digital = isDigital({ display: card?.display, mediaTypeName: spot.listing.mediaType?.name });
                        const size = prettySize(card?.size ?? null);
                        const creative = creativeFor(campaign.creatives, spot.id);
                        const needsChange = creativeNeedsChange(creative);
                        const has = !!creative?.fileUrl;
                        return (
                            <div key={spot.id} className="py-6 first:pt-0 last:pb-0">
                                <p className="text-base font-semibold text-ink">{spot.listing.title}</p>
                                <p className="mt-1 text-sm text-dim">{digital ? `${orientationOf(size) ?? "Digital"} digital screen · 30-second creative` : `Print placement${size ? ` · ${size}` : ""}`}</p>
                                {needsChange && creative && (
                                    <div className="mt-4 rounded-md bg-brand-soft px-4 py-3">
                                        <p className="text-sm font-semibold text-ink">{creative.status === "REJECTED" ? "This file was not accepted" : "This file needs a change"}</p>
                                        <p className="mt-1 text-sm text-dim">{creative.reviewNote ?? "Your publisher asked for a new file."}</p>
                                        <Link href={`${stepHref(campaign.id, "artwork/replace")}?spot=${encodeURIComponent(spot.id)}`} className="mt-2 inline-flex text-sm font-medium text-brand underline underline-offset-2">
                                            Replace the file
                                        </Link>
                                    </div>
                                )}
                                <p className="mt-4 text-[11px] font-medium uppercase tracking-wide text-dim">Artwork file</p>
                                <UploadTile
                                    className="mt-2"
                                    file={has ? creative : null}
                                    empty={digital ? "Choose a video or image" : "Choose a PDF or image"}
                                    accept={digital ? VIDEO_ACCEPT : PRINT_ACCEPT}
                                    busy={busy === spot.id}
                                    onPick={(file) => void upload(spot, file)}
                                    statusLine={creative ? CREATIVE_STATUS_LABEL[creative.status] : undefined}
                                />
                                <div className="mt-3 flex flex-wrap items-center gap-2">
                                    <label className={smallButton}>
                                        {has ? "Replace file" : "Choose file"}
                                        <input type="file" accept={digital ? VIDEO_ACCEPT : PRINT_ACCEPT} className="sr-only" disabled={busy === spot.id} onChange={(event) => event.target.files?.[0] && void upload(spot, event.target.files[0])} />
                                    </label>
                                    {has && creative && (
                                        <button type="button" disabled={busy === spot.id} onClick={() => void remove(spot, creative.id)} className={smallButton}>
                                            Remove
                                        </button>
                                    )}
                                    <Link href={`${stepHref(campaign.id, "artwork/requirements")}?spot=${encodeURIComponent(spot.id)}`} className="ml-auto text-sm text-dim underline underline-offset-2 hover:text-ink">
                                        Artwork requirements
                                    </Link>
                                </div>
                            </div>
                        );
                    })}
                </div>
                {campaign.spots.length > 0 && uploaded < campaign.spots.length && <p className="mt-6 text-sm text-dim">{uploaded} of {campaign.spots.length} placements have a file. You can continue and upload the rest before you pay; the review lists what is missing.</p>}
            </BookingCard>
            <StepFooter className="mt-6" back={{ href: stepHref(campaign.id, "artwork"), label: "Back" }} next={{ label: "Continue to production", href: stepHref(campaign.id, "artwork/production") }} />
        </>
    );
}
