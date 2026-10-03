"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { messageOf } from "@/lib/api-client";
import { BookingCard, ErrorNote, StepFooter } from "@/components/booking/booking-frame";
import { ChoiceCard, SelectField, TextAreaField, TextField } from "@/components/booking/fields";
import { StepPage, stepHref, useCampaignId, type ReadyCampaign } from "@/components/booking/step-page";
import { useListingCards } from "@/components/booking/summary-rail";
import { DESIGN_STYLES, bookingService, isDigital, refreshSecondsOf, type CampaignPatch } from "@/services/booking";

/**
 * Step 3 · Artwork preparation (5204:62791): "Upload my artwork" or "Get
 * design help". The first is the campaign's creative path — static for
 * print, video for an all-digital booking — and leads to the uploads; the
 * second is ADX's design agency, and takes the brief the backend needs
 * before the campaign can be priced (`creative.creativeConfig`). The third
 * is the app's Dynamic HTML5 path: digital screens fed live from the
 * advertiser's own endpoint (`creativeConfig: { endpointUrl, refreshSeconds }`),
 * with no files to upload.
 */
export default function ArtworkPage({ params }: { params: Promise<{ id: string }> }) {
    const id = useCampaignId(params);
    return (
        <StepPage id={id} step={3}>
            {(ready) => <ArtworkPrep key={ready.campaign.id} ready={ready} />}
        </StepPage>
    );
}

type Path = "UPLOAD" | "DESIGN" | "FEED";

function ArtworkPrep({ ready }: { ready: ReadyCampaign }) {
    const router = useRouter();
    const { campaign } = ready;
    const cards = useListingCards(campaign.spots.map((spot) => spot.listingId));
    const brief = (campaign.creativeConfig ?? {}) as { objective?: string; keyMessage?: string; style?: string };
    const [path, setPath] = React.useState<Path>(campaign.creativePath === "ADX_DESIGN_AGENCY" ? "DESIGN" : campaign.creativePath === "DYNAMIC_HTML5" ? "FEED" : "UPLOAD");
    const feed = (campaign.creativeConfig ?? {}) as { endpointUrl?: string; refreshSeconds?: number };
    const [endpointUrl, setEndpointUrl] = React.useState(typeof feed.endpointUrl === "string" ? feed.endpointUrl : "");
    const [refreshSeconds, setRefreshSeconds] = React.useState(String(typeof feed.refreshSeconds === "number" ? feed.refreshSeconds : 60));
    const feedOk = /^https?:\/\/.+/i.test(endpointUrl.trim());
    const [objective, setObjective] = React.useState(brief.objective ?? "");
    const [keyMessage, setKeyMessage] = React.useState(brief.keyMessage ?? "");
    const [style, setStyle] = React.useState(brief.style ?? DESIGN_STYLES[0]!.value);
    const [busy, setBusy] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);

    const allDigital = campaign.spots.length > 0 && campaign.spots.every((spot) => isDigital({ display: cards[spot.listingId]?.display, mediaTypeName: spot.listing.mediaType?.name }));

    const submit = async () => {
        if (path === "FEED" && !feedOk) {
            setError("The feed needs an endpoint address that starts with https://.");
            return;
        }
        setBusy(true);
        setError(null);
        try {
            const creative: CampaignPatch["creative"] =
                path === "DESIGN"
                    ? { creativePath: "ADX_DESIGN_AGENCY", ...(objective.trim().length >= 2 && keyMessage.trim().length >= 2 ? { creativeConfig: { objective: objective.trim(), keyMessage: keyMessage.trim(), style } } : {}) }
                    : path === "FEED"
                      ? { creativePath: "DYNAMIC_HTML5", creativeConfig: { endpointUrl: endpointUrl.trim(), refreshSeconds: refreshSecondsOf(refreshSeconds) } }
                      : { creativePath: allDigital ? "VIDEO_OR_MOTION" : "STATIC_IMAGES" };
            const saved = await bookingService.patch(campaign.id, { step: 12, creative });
            ready.applyCampaign(saved);
            router.push(stepHref(campaign.id, path === "UPLOAD" ? "artwork/files" : "artwork/production"));
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
                    <ChoiceCard checked={path === "FEED"} onSelect={() => setPath("FEED")} title="Serve it live from my endpoint" description="Dynamic HTML5 for digital screens: the screen reads your feed and redraws the ad as it changes." />
                </div>
                {path === "FEED" && (
                    <div className="mt-5 rounded-md bg-ground p-5">
                        <p className="text-sm font-semibold text-ink">Live feed setup</p>
                        <div className="mt-4 grid gap-5 md:grid-cols-[minmax(0,1fr)_200px]">
                            <TextField label="API endpoint URL" value={endpointUrl} onChange={(e) => setEndpointUrl(e.target.value)} placeholder="https://your-feed.example/ad-data" inputMode="url" autoComplete="off" />
                            <TextField label="Refresh interval (seconds)" value={refreshSeconds} onChange={(e) => setRefreshSeconds(e.target.value.replace(/[^\d]/g, "").slice(0, 5))} inputMode="numeric" />
                        </div>
                        <p className="mt-3 text-xs text-dim">Your endpoint must return JSON with the keys headline, cta and image_url. The screen asks it again every interval — five seconds at the least. Print placements need artwork files; a feed only reaches digital screens.</p>
                        {!allDigital && campaign.spots.length > 0 && <p className="mt-2 text-xs text-brand">Some of your spaces are print. They cannot show a live feed — choose “Upload my artwork” to cover them.</p>}
                    </div>
                )}
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
            <StepFooter className="mt-6" back={{ href: stepHref(campaign.id, "spaces"), label: "Back" }} next={{ label: path === "UPLOAD" ? "Continue to uploads" : "Continue to production", onClick: () => void submit(), busy, disabled: path === "FEED" && !feedOk }} />
        </>
    );
}
