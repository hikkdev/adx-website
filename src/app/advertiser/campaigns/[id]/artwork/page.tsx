"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { messageOf } from "@/lib/api-client";
import { BookingCard, ErrorNote, StepFooter } from "@/components/booking/booking-frame";
import { ChoiceCard, SelectField, TextAreaField, TextField } from "@/components/booking/fields";
import { StepPage, stepHref, useCampaignId, type ReadyCampaign } from "@/components/booking/step-page";
import { useListingCards } from "@/components/booking/summary-rail";
import { DESIGN_STYLES, bookingService, isDigital, type CampaignPatch } from "@/services/booking";

/**
 * Step 3 · Artwork preparation (5204:62791): "Upload my artwork" or "Get
 * design help". The first is the campaign's creative path — static for
 * print, video for an all-digital booking — and leads to the uploads; the
 * second is ADX's design agency, and takes the brief the backend needs
 * before the campaign can be priced (`creative.creativeConfig`).
 */
export default function ArtworkPage({ params }: { params: Promise<{ id: string }> }) {
    const id = useCampaignId(params);
    return (
        <StepPage id={id} step={3}>
            {(ready) => <ArtworkPrep key={ready.campaign.id} ready={ready} />}
        </StepPage>
    );
}

type Path = "UPLOAD" | "DESIGN";

function ArtworkPrep({ ready }: { ready: ReadyCampaign }) {
    const router = useRouter();
    const { campaign } = ready;
    const cards = useListingCards(campaign.spots.map((spot) => spot.listingId));
    const brief = (campaign.creativeConfig ?? {}) as { objective?: string; keyMessage?: string; style?: string };
    const [path, setPath] = React.useState<Path>(campaign.creativePath === "ADX_DESIGN_AGENCY" ? "DESIGN" : "UPLOAD");
    const [objective, setObjective] = React.useState(brief.objective ?? "");
    const [keyMessage, setKeyMessage] = React.useState(brief.keyMessage ?? "");
    const [style, setStyle] = React.useState(brief.style ?? DESIGN_STYLES[0]!.value);
    const [busy, setBusy] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);

    const allDigital = campaign.spots.length > 0 && campaign.spots.every((spot) => isDigital({ display: cards[spot.listingId]?.display, mediaTypeName: spot.listing.mediaType?.name }));

    const submit = async () => {
        setBusy(true);
        setError(null);
        try {
            const creative: CampaignPatch["creative"] =
                path === "DESIGN"
                    ? { creativePath: "ADX_DESIGN_AGENCY", ...(objective.trim().length >= 2 && keyMessage.trim().length >= 2 ? { creativeConfig: { objective: objective.trim(), keyMessage: keyMessage.trim(), style } } : {}) }
                    : { creativePath: allDigital ? "VIDEO_OR_MOTION" : "STATIC_IMAGES" };
            const saved = await bookingService.patch(campaign.id, { step: 12, creative });
            ready.applyCampaign(saved);
            router.push(stepHref(campaign.id, path === "DESIGN" ? "artwork/production" : "artwork/files"));
        } catch (caught) {
            setError(messageOf(caught, "Could not save your choice."));
            setBusy(false);
        }
    };

    return (
        <>
            <BookingCard title="Artwork preparation" description="Each selected space has its own format and artwork requirements.">
                <div className="mt-6 space-y-3" role="radiogroup" aria-label="How the artwork is prepared">
                    <ChoiceCard checked={path === "UPLOAD"} onSelect={() => setPath("UPLOAD")} title="Upload my artwork" description="Add artwork for each selected space. We'll show its requirements." />
                    <ChoiceCard checked={path === "DESIGN"} onSelect={() => setPath("DESIGN")} title="Get design help" description="Send us a creative brief. ADX will share a separate quote for your approval before design work begins." />
                </div>
                {path === "DESIGN" && (
                    <div className="mt-5 grid gap-5 rounded-md bg-ground p-5">
                        <p className="text-sm font-semibold text-ink">Your creative brief</p>
                        <TextField label="What should the artwork achieve?" value={objective} onChange={(e) => setObjective(e.target.value)} placeholder="Launch the festive collection to families in Whitefield" maxLength={200} />
                        <TextAreaField label="Key message" value={keyMessage} onChange={(e) => setKeyMessage(e.target.value)} placeholder="Up to 40% off this festive season, in store from 12 October." maxLength={500} />
                        <SelectField label="Style" value={style} onChange={(e) => setStyle(e.target.value)}>
                            {DESIGN_STYLES.map((option) => (
                                <option key={option.value} value={option.value}>
                                    {option.label}
                                </option>
                            ))}
                        </SelectField>
                        <p className="text-xs text-dim">ADX quotes the design separately; the campaign's price below does not include it.</p>
                    </div>
                )}
                <p className="mt-5 text-sm text-dim">Your publisher reviews the files before production or display. Uploading artwork does not mean the campaign is live.</p>
            </BookingCard>
            <ErrorNote message={error} className="mt-4" />
            <StepFooter className="mt-6" back={{ href: stepHref(campaign.id, "spaces"), label: "Back" }} next={{ label: path === "DESIGN" ? "Continue to production" : "Continue to uploads", onClick: () => void submit(), busy }} />
        </>
    );
}
