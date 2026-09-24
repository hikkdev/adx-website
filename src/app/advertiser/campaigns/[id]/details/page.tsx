"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { messageOf } from "@/lib/api-client";
import { BookingCard, ErrorNote, StepFooter } from "@/components/booking/booking-frame";
import { SelectField, TextField } from "@/components/booking/fields";
import { StepPage, accountNameOf, stepHref, useCampaignId, type ReadyCampaign } from "@/components/booking/step-page";
import {
    AWARENESS_LABEL,
    GOAL_LABEL,
    PERSONA_LABEL,
    STRATEGY_LABEL,
    bookingService,
    formatFlight,
    rupees,
    type AudiencePersona,
    type AwarenessLevel,
    type CampaignGoal,
    type CampaignPatch,
    type CampaignStrategy,
} from "@/services/booking";

/**
 * Step 1 · Campaign brief (5204:62521): "Name your campaign" — the name and
 * the brand, with the booking's facts under the heading. The card under it
 * takes what the review needs to price and pay the campaign (the industry,
 * the goal, the audience, the market and a planning budget), each an answer
 * `PATCH /campaigns/:id` keeps; the review's "Edit" links land back here.
 */
export default function DetailsPage({ params }: { params: Promise<{ id: string }> }) {
    const id = useCampaignId(params);
    return (
        <StepPage id={id} step={1}>
            {(ready) => (
                <React.Suspense>
                    <DetailsForm key={ready.campaign.id} ready={ready} />
                </React.Suspense>
            )}
        </StepPage>
    );
}

function DetailsForm({ ready }: { ready: ReadyCampaign }) {
    const router = useRouter();
    const search = useSearchParams();
    const focus = search.get("focus");
    const { campaign, review, advertiser } = ready;
    const untitled = !campaign.name || /^untitled/i.test(campaign.name);
    const [name, setName] = React.useState(untitled ? "" : campaign.name);
    const [brand, setBrand] = React.useState(campaign.brandName ?? accountNameOf(advertiser));
    const [product, setProduct] = React.useState(campaign.productName ?? "");
    const [industry, setIndustry] = React.useState(campaign.industry ?? "");
    const [subCategory, setSubCategory] = React.useState(campaign.subCategory ?? "");
    const [goal, setGoal] = React.useState<CampaignGoal | "">(campaign.goal ?? "");
    const [awareness, setAwareness] = React.useState<AwarenessLevel | "">(campaign.awareness ?? "");
    const [persona, setPersona] = React.useState<AudiencePersona | "">(campaign.persona ?? "");
    const [strategy, setStrategy] = React.useState<CampaignStrategy | "">(campaign.strategy ?? "GENERAL");
    const [market, setMarket] = React.useState(campaign.targetMarkets?.[0] ?? campaign.targetMarket ?? campaign.spots[0]?.listing.city ?? "");
    const [budget, setBudget] = React.useState(campaign.budget ? String(Math.round(Number(campaign.budget))) : review ? String(Math.ceil(Number(review.total))) : "");
    const [industries, setIndustries] = React.useState<string[]>([]);
    const [busy, setBusy] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);
    const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({});

    React.useEffect(() => {
        let cancelled = false;
        bookingService.industries().then((rows) => {
            if (!cancelled) setIndustries(rows);
        });
        return () => {
            cancelled = true;
        };
    }, []);

    React.useEffect(() => {
        if (!focus) return;
        document.getElementById(`section-${focus}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, [focus]);

    const spaces = campaign.spots.length;
    const city = campaign.spots.find((spot) => spot.listing.city)?.listing.city ?? market;

    const submit = async () => {
        const errors: Record<string, string> = {};
        if (!name.trim()) errors.name = "Give your campaign a name.";
        if (!brand.trim()) errors.brand = "Which brand is this for?";
        if (budget && !/^\d{1,12}(\.\d{1,2})?$/.test(budget.trim())) errors.budget = "Enter an amount in rupees, such as 50000.";
        setFieldErrors(errors);
        if (Object.keys(errors).length > 0) return;
        setBusy(true);
        setError(null);
        try {
            const patch: CampaignPatch = {
                step: 1,
                name: name.trim(),
                brandName: brand.trim(),
                productName: product.trim() || null,
                industry: industry || null,
                subCategory: subCategory.trim() || null,
                goal: goal || null,
                awareness: awareness || null,
                persona: persona || null,
                strategy: strategy || null,
                budget: budget.trim() ? Number(budget).toFixed(2) : null,
                ...(market.trim() ? { targetingMethod: "MARKET_OR_DMA", targetMarket: market.trim(), targetMarkets: [market.trim()], targetLocation: market.trim() } : {}),
            };
            const saved = await bookingService.patch(campaign.id, patch);
            ready.applyCampaign(saved);
            router.push(stepHref(campaign.id, "artwork"));
        } catch (caught) {
            setError(messageOf(caught, "Could not save the campaign."));
            setBusy(false);
        }
    };

    return (
        <>
            <BookingCard title="Name your campaign" description={`Your booking: ${spaces} space${spaces === 1 ? "" : "s"}${city ? ` in ${city}` : ""} · ${formatFlight(campaign.startDate, campaign.endDate, { long: true })}.`}>
                <div className="mt-6 space-y-5">
                    <TextField label="Campaign name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Festive launch" maxLength={160} hint={fieldErrors.name} />
                    <TextField label="Brand" value={brand} onChange={(e) => setBrand(e.target.value)} placeholder={accountNameOf(advertiser)} maxLength={160} hint={fieldErrors.brand} />
                </div>
                <p className="mt-5 text-sm text-dim">This campaign belongs to your {accountNameOf(advertiser)} advertiser account.</p>
            </BookingCard>

            <BookingCard className="mt-4" title="About the campaign" description="What the campaign is for. Your publisher and the review use these; nothing here changes the price.">
                <div className="mt-6 grid gap-5 md:grid-cols-2">
                    <div id="section-brand" className="contents">
                        <TextField label="Product or offer" value={product} onChange={(e) => setProduct(e.target.value)} placeholder="Festive collection" maxLength={160} />
                        <SelectField label="Industry" value={industry} onChange={(e) => setIndustry(e.target.value)}>
                            <option value="">Choose an industry</option>
                            {(industries.length > 0 ? industries : [industry].filter(Boolean)).map((row) => (
                                <option key={row} value={row}>
                                    {row}
                                </option>
                            ))}
                        </SelectField>
                        <TextField label="Subcategory" value={subCategory} onChange={(e) => setSubCategory(e.target.value)} placeholder="Home furnishings" maxLength={120} />
                    </div>
                    <div id="section-goal" className="contents">
                        <SelectField label="Campaign goal" value={goal} onChange={(e) => setGoal(e.target.value as CampaignGoal | "")}>
                            <option value="">Choose a goal</option>
                            {(Object.keys(GOAL_LABEL) as CampaignGoal[]).map((value) => (
                                <option key={value} value={value}>
                                    {GOAL_LABEL[value]}
                                </option>
                            ))}
                        </SelectField>
                        <SelectField label="Brand awareness" value={awareness} onChange={(e) => setAwareness(e.target.value as AwarenessLevel | "")}>
                            <option value="">Is the brand new here?</option>
                            {(Object.keys(AWARENESS_LABEL) as AwarenessLevel[]).map((value) => (
                                <option key={value} value={value}>
                                    {AWARENESS_LABEL[value]}
                                </option>
                            ))}
                        </SelectField>
                    </div>
                    <div id="section-audience" className="contents">
                        <SelectField label="Audience" value={persona} onChange={(e) => setPersona(e.target.value as AudiencePersona | "")}>
                            <option value="">Who should see it?</option>
                            {(Object.keys(PERSONA_LABEL) as AudiencePersona[]).map((value) => (
                                <option key={value} value={value}>
                                    {PERSONA_LABEL[value]}
                                </option>
                            ))}
                        </SelectField>
                        <SelectField label="Strategy" value={strategy} onChange={(e) => setStrategy(e.target.value as CampaignStrategy | "")}>
                            <option value="">Choose a strategy</option>
                            {(Object.keys(STRATEGY_LABEL) as CampaignStrategy[]).map((value) => (
                                <option key={value} value={value}>
                                    {STRATEGY_LABEL[value]}
                                </option>
                            ))}
                        </SelectField>
                    </div>
                    <div id="section-targeting" className="contents">
                        <TextField label="Market" value={market} onChange={(e) => setMarket(e.target.value)} placeholder="Bengaluru" maxLength={120} hint="The city your spaces are in." />
                    </div>
                    <div id="section-schedule" className="contents">
                        <TextField label="Planning budget (₹)" inputMode="numeric" value={budget} onChange={(e) => setBudget(e.target.value)} placeholder="50000" hint={fieldErrors.budget ?? (review ? `Your spaces come to ${rupees(review.total)} including GST.` : undefined)} />
                    </div>
                </div>
            </BookingCard>

            <ErrorNote message={error} className="mt-4" />
            <StepFooter className="mt-6" back={{ href: "/advertiser", label: "Back" }} next={{ label: "Continue to artwork", onClick: () => void submit(), busy }} />
        </>
    );
}
