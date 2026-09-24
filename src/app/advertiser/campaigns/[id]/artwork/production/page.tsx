"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { messageOf } from "@/lib/api-client";
import { BookingCard, EditLink, ErrorNote, StepFooter, smallButton } from "@/components/booking/booking-frame";
import { ChoiceCard, SelectField, TextField } from "@/components/booking/fields";
import { StepPage, accountNameOf, stepHref, useCampaignId, type ReadyCampaign } from "@/components/booking/step-page";
import { useListingCards } from "@/components/booking/summary-rail";
import { TRACKING_LABEL, bookingService, chargesOf, isDigital, rupees, type CampaignPatch, type FulfilmentChoice, type TrackingMethod } from "@/services/booking";

/**
 * Step 3 · Print production (5204:63336): "Print for me" or "I will ship my
 * own" — the campaign's `fulfilment` — over the publisher's printing and
 * installation charges as the review rates them, the campaign contact, and
 * the measurement plan (the campaign's tracking method) with its editor.
 */
export default function ProductionPage({ params }: { params: Promise<{ id: string }> }) {
    const id = useCampaignId(params);
    return (
        <StepPage id={id} step={3}>
            {(ready) => <Production key={ready.campaign.id} ready={ready} />}
        </StepPage>
    );
}

function Production({ ready }: { ready: ReadyCampaign }) {
    const router = useRouter();
    const { campaign, review, advertiser } = ready;
    const cards = useListingCards(campaign.spots.map((spot) => spot.listingId));
    const [choice, setChoice] = React.useState<FulfilmentChoice>(campaign.fulfilment ?? "ADX_PRINTS");
    const [editingTracking, setEditingTracking] = React.useState(false);
    const [busy, setBusy] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);

    const printSpots = campaign.spots.filter((spot) => !isDigital({ display: cards[spot.listingId]?.display, mediaTypeName: spot.listing.mediaType?.name }));
    const digitalSpots = campaign.spots.filter((spot) => !printSpots.includes(spot));
    const charges = review ? chargesOf(review) : null;
    const printTitles = printSpots.map((spot) => spot.listing.title.replace(/ (roadside )?billboard$/i, "")).join(", ");

    const submit = async () => {
        setBusy(true);
        setError(null);
        try {
            const saved = await bookingService.patch(campaign.id, { step: 14, fulfilment: choice });
            ready.applyCampaign(saved);
            router.push(stepHref(campaign.id, "review"));
        } catch (caught) {
            setError(messageOf(caught, "Could not save your choice."));
            setBusy(false);
        }
    };

    const tracking = campaign.trackingConfig ?? {};

    return (
        <>
            <BookingCard title="Print production" description={printSpots.length > 0 ? `Choose how the ${printTitles} print is supplied. Your publisher handles installation and site access.` : "Nothing to print: every space in this campaign is a digital screen. Your publisher schedules the playback."}>
                {printSpots.length > 0 && (
                    <div className="mt-6 grid gap-3 md:grid-cols-2" role="radiogroup" aria-label="Print supply">
                        <ChoiceCard checked={choice === "ADX_PRINTS"} onSelect={() => setChoice("ADX_PRINTS")} title="Print for me" description={charges ? `${rupees(charges.printing)}.` : "Priced by your publisher."} />
                        <ChoiceCard checked={choice === "ADVERTISER_SHIPS"} onSelect={() => setChoice("ADVERTISER_SHIPS")} title="I will ship my own" description="No printing charge." />
                    </div>
                )}

                <div className="mt-4 divide-y divide-line rounded-md border border-line">
                    {printSpots.length > 0 && (
                        <>
                            <FeeRow label="Printing" note="Publisher production charge for the selected supply option" value={charges ? rupees(charges.printing) : "—"} />
                            <FeeRow label="Installation" note="Publisher coordination, site access and installation" value={charges ? rupees(charges.installation) : "—"} />
                        </>
                    )}
                    {digitalSpots.length > 0 && <FeeRow label="Digital playback" note={`${digitalSpots.map((spot) => spot.listing.title).join(", ")} · approved playback included`} value="Included" />}
                    <FeeRow label="Production services" value={charges ? rupees(charges.production) : "—"} strong />
                </div>
                {choice === "ADVERTISER_SHIPS" && printSpots.length > 0 && <p className="mt-3 text-sm text-dim">The printing charge stays on this quote until ADX confirms your own print has arrived; delivery address and handover timing are confirmed with your publisher after payment.</p>}

                <div className="mt-6 rounded-md border border-line p-4">
                    <p className="text-sm font-semibold text-ink">Campaign contact</p>
                    <p className="mt-1 text-sm text-ink">{advertiser?.name ?? accountNameOf(advertiser)}</p>
                    <p className="text-sm text-dim">{advertiser?.email ?? advertiser?.mobile ?? "No email on your account"}</p>
                    <p className="mt-2 text-xs text-dim">From your account settings — the person your publisher writes to about this campaign.</p>
                </div>

                <div className="mt-6 flex items-start justify-between gap-4">
                    <div>
                        <p className="text-sm font-semibold text-ink">Measurement plan</p>
                        {!editingTracking && (
                            <p className="mt-1 text-sm text-ink">
                                {TRACKING_LABEL[campaign.trackingMethod]}
                                {campaign.trackingMethod === "QR_OR_DEEPLINK" && typeof tracking.destinationUrl === "string" ? ` · ${tracking.destinationUrl}` : ""}
                                {campaign.trackingMethod === "VANITY_OR_PROMO" && typeof tracking.promoCode === "string" ? ` · ${tracking.promoCode}` : ""}
                            </p>
                        )}
                    </div>
                    {!editingTracking && <EditLink onClick={() => setEditingTracking(true)} />}
                </div>
                {editingTracking && (
                    <TrackingEditor
                        method={campaign.trackingMethod}
                        config={tracking as Record<string, string | number | undefined>}
                        onCancel={() => setEditingTracking(false)}
                        onSave={async (patch) => {
                            setError(null);
                            try {
                                const saved = await bookingService.patch(campaign.id, { step: 13, tracking: patch });
                                ready.applyCampaign(saved);
                                setEditingTracking(false);
                            } catch (caught) {
                                setError(messageOf(caught, "Could not save the measurement plan."));
                            }
                        }}
                    />
                )}
            </BookingCard>
            <ErrorNote message={error} className="mt-4" />
            <StepFooter className="mt-6" back={{ href: stepHref(campaign.id, campaign.creativePath === "ADX_DESIGN_AGENCY" ? "artwork" : "artwork/files"), label: "Back" }} next={{ label: "Review campaign", onClick: () => void submit(), busy }} />
        </>
    );
}

function FeeRow({ label, note, value, strong }: { label: string; note?: string; value: string; strong?: boolean }) {
    return (
        <div className="flex items-center justify-between gap-4 px-4 py-4">
            <div>
                <p className={`text-sm ${strong ? "font-semibold" : "font-medium"} text-ink`}>{label}</p>
                {note && <p className="mt-0.5 text-xs text-dim">{note}</p>}
            </div>
            <p className={`text-base font-semibold ${strong ? "text-brand" : "text-ink"}`}>{value}</p>
        </div>
    );
}

function TrackingEditor({ method: initial, config, onSave, onCancel }: { method: TrackingMethod; config: Record<string, string | number | undefined>; onSave: (patch: NonNullable<CampaignPatch["tracking"]>) => Promise<void>; onCancel: () => void }) {
    const [method, setMethod] = React.useState<TrackingMethod>(initial);
    const [destinationUrl, setDestinationUrl] = React.useState(String(config.destinationUrl ?? ""));
    const [utm, setUtm] = React.useState(String(config.utmCampaign ?? ""));
    const [vanityUrl, setVanityUrl] = React.useState(String(config.vanityUrl ?? ""));
    const [promoCode, setPromoCode] = React.useState(String(config.promoCode ?? ""));
    const [businessAddress, setBusinessAddress] = React.useState(String(config.businessAddress ?? ""));
    const [busy, setBusy] = React.useState(false);

    const patch = (): NonNullable<CampaignPatch["tracking"]> => {
        if (method === "QR_OR_DEEPLINK") return { trackingMethod: "QR_OR_DEEPLINK", trackingConfig: { ...(destinationUrl.trim() ? { destinationUrl: destinationUrl.trim() } : {}), ...(utm.trim() ? { utmCampaign: utm.trim() } : {}) } };
        if (method === "VANITY_OR_PROMO") return { trackingMethod: "VANITY_OR_PROMO", trackingConfig: { ...(vanityUrl.trim() ? { vanityUrl: vanityUrl.trim() } : {}), ...(promoCode.trim() ? { promoCode: promoCode.trim() } : {}), redemptionWindow: "CAMPAIGN_DURATION" } };
        if (method === "LOCATION_LIFT") return { trackingMethod: "LOCATION_LIFT", trackingConfig: { businessAddress: businessAddress.trim(), measurementWindowDays: 14, baselinePeriod: "PRIOR_MONTH" } };
        return { trackingMethod: "NONE" };
    };

    return (
        <div className="mt-3 grid gap-4 rounded-md bg-ground p-4">
            <SelectField label="How will you measure the campaign?" value={method} onChange={(e) => setMethod(e.target.value as TrackingMethod)}>
                {(Object.keys(TRACKING_LABEL) as TrackingMethod[]).map((value) => (
                    <option key={value} value={value}>
                        {TRACKING_LABEL[value]}
                    </option>
                ))}
            </SelectField>
            {method === "QR_OR_DEEPLINK" && (
                <div className="grid gap-4 md:grid-cols-2">
                    <TextField label="Destination URL" value={destinationUrl} onChange={(e) => setDestinationUrl(e.target.value)} placeholder="https://asterhome.example/festive" hint="Leave empty and the scan lands on ADX's own thank-you page." />
                    <TextField label="UTM campaign tag" value={utm} onChange={(e) => setUtm(e.target.value)} placeholder="aster-festive-oct26" />
                </div>
            )}
            {method === "VANITY_OR_PROMO" && (
                <div className="grid gap-4 md:grid-cols-2">
                    <TextField label="Vanity URL" value={vanityUrl} onChange={(e) => setVanityUrl(e.target.value)} placeholder="https://asterhome.example/festive" />
                    <TextField label="Promo code" value={promoCode} onChange={(e) => setPromoCode(e.target.value)} placeholder="FESTIVE20" maxLength={40} />
                </div>
            )}
            {method === "LOCATION_LIFT" && <TextField label="Business address" value={businessAddress} onChange={(e) => setBusinessAddress(e.target.value)} placeholder="Whitefield, Bengaluru" hint="Visits over 14 days, against the month before." />}
            <div className="flex gap-2">
                <button
                    type="button"
                    disabled={busy || (method === "LOCATION_LIFT" && businessAddress.trim().length < 2)}
                    onClick={async () => {
                        setBusy(true);
                        await onSave(patch());
                        setBusy(false);
                    }}
                    className={smallButton}
                >
                    {busy ? "Saving…" : "Save plan"}
                </button>
                <button type="button" onClick={onCancel} className="text-sm text-dim underline underline-offset-2">
                    Cancel
                </button>
            </div>
        </div>
    );
}
