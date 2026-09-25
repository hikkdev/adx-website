"use client";

import * as React from "react";
import { BookingCard, EditLink, KeyRows, StepFooter } from "@/components/booking/booking-frame";
import { ItemisedCharges } from "@/components/booking/charges";
import { StepPage, stepHref, useCampaignId, type ReadyCampaign } from "@/components/booking/step-page";
import { kindLineOf, useListingCards } from "@/components/booking/summary-rail";
import {
    AWARENESS_LABEL,
    CREATIVE_STATUS_LABEL,
    GOAL_LABEL,
    PERSONA_LABEL,
    STRATEGY_LABEL,
    TARGETING_LABEL,
    TRACKING_LABEL,
    briefMissing,
    chargesOf,
    creativeFor,
    formatDay,
    fulfilmentOfLine,
    isDigital,
    prettySize,
    rupees,
} from "@/services/booking";

/**
 * Step 4 · Campaign review (5204:63726): every answer the brief holds in
 * its section with an "Edit" back to the step that owns it, the spaces,
 * the tracking, where the artwork stands, the print and playback plan, and
 * the itemised charges — the priced review from `GET /campaigns/:id/review`.
 * What the brief still lacks is named here, before billing.
 */
export default function ReviewPage({ params }: { params: Promise<{ id: string }> }) {
    const id = useCampaignId(params);
    return (
        <StepPage id={id} step={4}>
            {(ready) => <Review key={ready.campaign.id} ready={ready} />}
        </StepPage>
    );
}

const NOT_SET = <span className="text-brand">Not set</span>;
const show = (value: string | null | undefined) => (value ? value : NOT_SET);

function Review({ ready }: { ready: ReadyCampaign }) {
    const { campaign, review } = ready;
    const cards = useListingCards(campaign.spots.map((spot) => spot.listingId));
    const charges = review ? chargesOf(review) : null;
    const missing = review ? briefMissing(review) : [];
    const tracking = (campaign.trackingConfig ?? {}) as Record<string, string | undefined>;
    const details = (focus: string) => `${stepHref(campaign.id, "details")}?focus=${focus}`;
    const launchGate = campaign.launchBlockedBy?.includes("KYC") ? "Account verification required before launch" : "Publisher approval of artwork before launch";
    const printSpots = campaign.spots.filter((spot) => !isDigital({ display: cards[spot.listingId]?.display, mediaTypeName: spot.listing.mediaType?.name }));
    const days = review?.days ?? campaign.spots[0]?.days ?? 0;

    return (
        <>
            <BookingCard>
                <h2 className="text-base font-semibold text-ink">Campaign review</h2>
                <div className="mt-6 grid gap-x-8 gap-y-8 lg:grid-cols-2">
                    <div className="space-y-8">
                        <Section title="Brand and product" edit={details("brand")}>
                            <KeyRows rows={[{ label: "Brand", value: show(campaign.brandName) }, { label: "Product or offer", value: show(campaign.productName) }, { label: "Industry", value: show(campaign.industry) }, { label: "Subcategory", value: show(campaign.subCategory) }]} />
                        </Section>
                        <Section title="Campaign goal" edit={details("goal")}>
                            <KeyRows rows={[{ label: "Primary goal", value: show(campaign.goal ? GOAL_LABEL[campaign.goal] : null) }, { label: "Brand awareness", value: show(campaign.awareness ? AWARENESS_LABEL[campaign.awareness] : null) }]} />
                        </Section>
                        <Section title="Audience and strategy" edit={details("audience")}>
                            <KeyRows rows={[{ label: "Audience", value: show(campaign.persona ? PERSONA_LABEL[campaign.persona] : null) }, { label: "Strategy", value: show(campaign.strategy ? STRATEGY_LABEL[campaign.strategy] : null) }]} />
                        </Section>
                        <Section title="Targeting and placement safety" edit={details("targeting")}>
                            <KeyRows
                                rows={[
                                    { label: "Targeting method", value: show(campaign.targetingMethod ? TARGETING_LABEL[campaign.targetingMethod] : null) },
                                    { label: "Area", value: show(campaign.targetMarkets?.join(", ") || campaign.targetLocation || campaign.targetMarket) },
                                    ...(campaign.targetingMethod === "RADIUS" ? [{ label: "Radius", value: campaign.targetRadiusKm ? `${campaign.targetRadiusKm} km` : NOT_SET }] : []),
                                    { label: "Alcohol adjacency", value: "Not offered on the web yet", muted: true },
                                    { label: "Political adjacency", value: "Not offered on the web yet", muted: true },
                                    { label: "Competitor adjacency", value: "No exclusion", muted: true },
                                ]}
                            />
                        </Section>
                        <Section title="Delivery triggers" edit={details("schedule")}>
                            <KeyRows rows={[{ label: "Trigger", value: campaign.triggerType === "NONE" ? "None" : campaign.triggerType.replace(/_/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase()) }]} />
                        </Section>
                        <Section title="Schedule and budget" edit={stepHref(campaign.id, "spaces")}>
                            <KeyRows rows={[{ label: "Starts", value: formatDay(campaign.startDate) }, { label: "Ends", value: formatDay(campaign.endDate) }, { label: "Planning budget", value: campaign.budget ? rupees(campaign.budget) : NOT_SET }]} />
                            <p className="mt-3 text-xs text-dim">Your selected spaces and services are itemised on the right. The planning budget is a spending limit, not an addition.</p>
                        </Section>
                    </div>

                    <div className="space-y-8">
                        <Section title="Your advertising spaces" edit={stepHref(campaign.id, "spaces")}>
                            <ul className="space-y-1.5 text-sm text-ink">
                                {campaign.spots.map((spot) => {
                                    const line = review?.lines.find((l) => l.spotId === spot.id);
                                    const size = prettySize(cards[spot.listingId]?.size ?? line?.size ?? null);
                                    return (
                                        <li key={spot.id}>
                                            {spot.listing.title}
                                            {size ? ` · ${size}` : ""} · {rupees(line?.lineTotal ?? spot.lineTotal)}
                                        </li>
                                    );
                                })}
                                {campaign.spots.length === 0 && <li className="text-brand">No spaces chosen</li>}
                            </ul>
                            <p className="mt-2 text-xs text-dim">Selected spaces run on the {days}-day campaign schedule.</p>
                        </Section>
                        <Section title="Tracking and launch approval" edit={stepHref(campaign.id, "artwork/production")}>
                            <KeyRows
                                labelWidth="w-[130px]"
                                rows={[
                                    { label: "Method", value: TRACKING_LABEL[campaign.trackingMethod] },
                                    ...(campaign.trackingMethod === "QR_OR_DEEPLINK" ? [{ label: "Destination URL", value: tracking.destinationUrl ?? "ADX thank-you page" }, { label: "UTM campaign tag", value: tracking.utmCampaign ?? "—" }] : []),
                                    ...(campaign.trackingMethod === "VANITY_OR_PROMO" ? [{ label: "Vanity URL", value: tracking.vanityUrl ?? "—" }, { label: "Promo code", value: tracking.promoCode ?? "—" }] : []),
                                    ...(campaign.trackingMethod === "LOCATION_LIFT" ? [{ label: "Business address", value: tracking.businessAddress ?? "—" }] : []),
                                    { label: "Launch gate", value: launchGate },
                                ]}
                            />
                        </Section>
                        <Section title="Artwork and publisher review" edit={stepHref(campaign.id, campaign.creativePath === "ADX_DESIGN_AGENCY" ? "artwork" : "artwork/files")}>
                            <ul className="space-y-1.5 text-sm text-ink">
                                {campaign.creativePath === "ADX_DESIGN_AGENCY" && (
                                    <li>
                                        ADX designs the artwork ·{" "}
                                        {campaign.designQuoteStatus === "ACCEPTED" && review?.designFee
                                            ? `quote of ${rupees(review.designFee.amount)} accepted · on the charges as "Design by ADX"`
                                            : campaign.designQuoteStatus === "QUOTED"
                                              ? `quote of ${rupees(campaign.designQuoteAmount)} awaiting your answer`
                                              : campaign.designQuoteStatus === "DECLINED"
                                                ? "quote declined"
                                                : "separate quote before design work begins"}
                                    </li>
                                )}
                                {campaign.creativePath !== "ADX_DESIGN_AGENCY" &&
                                    campaign.spots.map((spot) => {
                                        const creative = creativeFor(campaign.creatives, spot.id);
                                        const digital = isDigital({ display: cards[spot.listingId]?.display, mediaTypeName: spot.listing.mediaType?.name });
                                        return (
                                            <li key={spot.id}>
                                                {spot.listing.title} · {creative?.fileUrl ? `${digital ? "Digital" : "Print"} file uploaded · ${CREATIVE_STATUS_LABEL[creative.status]}` : <span className="text-brand">No file yet</span>}
                                            </li>
                                        );
                                    })}
                            </ul>
                            <p className="mt-2 text-xs text-dim">The publisher checks file specifications before installation or digital playback. Payment does not approve the artwork or start the campaign.</p>
                        </Section>
                        <Section title="Print, installation and playback" edit={stepHref(campaign.id, "artwork/production")}>
                            <ul className="space-y-1.5 text-sm text-ink">
                                {campaign.spots.map((spot) => {
                                    const print = printSpots.includes(spot);
                                    /* PS-1: the line's own print choice, else the campaign's. */
                                    const fulfilment = fulfilmentOfLine(review?.lines.find((l) => l.spotId === spot.id) ?? spot, campaign);
                                    return (
                                        <li key={spot.id}>
                                            {spot.listing.title} · {print ? (fulfilment === "ADVERTISER_SHIPS" ? "You ship the print; the publisher installs it · no printing fee" : fulfilment ? `ADX prints and the publisher installs it` : <span className="text-brand">Print choice not made</span>) : "Approved digital playback included"}
                                        </li>
                                    );
                                })}
                            </ul>
                            <p className="mt-2 text-xs text-dim">Your publisher coordinates installation. Delivery address and handover timing must be confirmed if you supply your own print.</p>
                        </Section>
                        {charges && <ItemisedCharges charges={charges} days={days} />}
                    </div>
                </div>
            </BookingCard>

            {review && missing.length > 0 && (
                <div className="mt-4 rounded-md border border-[#f3c1c1] bg-[#fdf2f2] px-4 py-3 text-sm text-ink">
                    <p className="font-semibold">Before you can pay</p>
                    <ul className="mt-1 list-disc pl-5 text-[#b42318]">
                        {missing.map((item) => (
                            <li key={item.field}>{item.label}</li>
                        ))}
                    </ul>
                </div>
            )}
            {review && review.clashes.length > 0 && <p className="mt-4 rounded-md border border-[#f3c1c1] bg-[#fdf2f2] px-4 py-3 text-sm text-[#b42318]">{review.clashes.map((c) => c.title).join(", ")} no longer {review.clashes.length === 1 ? "has" : "have"} a slot on these dates. Remove them on the Ad spaces step or change the dates.</p>}

            <StepFooter className="mt-6" back={{ href: stepHref(campaign.id, "artwork/production"), label: "Back" }} next={{ label: "Continue to billing", href: stepHref(campaign.id, "review/billing"), disabled: !review || missing.length > 0 || review.clashes.length > 0 }} />
        </>
    );
}

function Section({ title, edit, children }: { title: string; edit: string; children: React.ReactNode }) {
    return (
        <section>
            <div className="flex items-start justify-between gap-4">
                <h3 className="text-base font-semibold text-ink">{title}</h3>
                <EditLink href={edit} />
            </div>
            <div className="mt-3">{children}</div>
        </section>
    );
}
