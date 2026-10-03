"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ApiError, messageOf } from "@/lib/api-client";
import { ErrorNote, StepFooter } from "@/components/booking/booking-frame";
import { CheckBox, FloatingField } from "@/components/booking/fields";
import { ADDRESS_LINE_PLACEHOLDER, AddressFinder, fillFromPlace, PIN_PATTERN, PIN_PLACEHOLDER } from "@/components/listing-form/address-search";
import { StepPage, accountNameOf, stepHref, useCampaignId, type ReadyCampaign } from "@/components/booking/step-page";
import { SummaryRail } from "@/components/booking/summary-rail";
import { billingDraft, billingPatchOf, billingSeed, type BillingDraft } from "@/components/booking/billing-draft";
import { useAuth } from "@/lib/auth";
import { GSTIN_PATTERN, INDIAN_STATES, bookingService, chargesOf, estimateCart, flightDays } from "@/services/booking";

/**
 * Billing details (5204:64359 / 5204:64652): the invoice address in the
 * floating-label boxes, "Add GST details" opening the GSTIN, and "Save these
 * details to my business profile" — which is `PATCH /advertisers/:id`, the
 * one place the invoice reads them from. The PIN is the row's own
 * `postalCode` (AD-1), not the tail of the address line, and the email
 * opens with the account's proven one when the advertiser row has none.
 *
 * Onboarding addresses (the owner, 1 Oct 2026): for many advertisers this
 * is where the billing address is first given, so it is the same "Find the
 * address" bar over plain boxes — the address, City | State, PIN | Country.
 * A billing address takes no coordinates.
 */
export default function BillingPage({ params }: { params: Promise<{ id: string }> }) {
    const id = useCampaignId(params);
    return (
        <StepPage id={id} step={4} back={null} title={() => "Billing details"} subtitle={(ready) => `${accountNameOf(ready.advertiser)} · ${ready.campaign.name}`}>
            {(ready) => <Billing key={ready.campaign.id} ready={ready} />}
        </StepPage>
    );
}

function Billing({ ready }: { ready: ReadyCampaign }) {
    const router = useRouter();
    const { user } = useAuth();
    const { campaign, review, advertiser } = ready;
    const draft = React.useMemo(() => billingDraft.read(campaign.id), [campaign.id]);
    const [seed] = React.useState(() => billingSeed({ draft, advertiser, accountEmail: user?.email, fallbackCity: campaign.spots[0]?.listing.city }));
    const [legalName, setLegalName] = React.useState(seed.legalName);
    const [email, setEmail] = React.useState(seed.email);
    const [street, setStreet] = React.useState(seed.street);
    const [city, setCity] = React.useState(seed.city);
    const [postalCode, setPostalCode] = React.useState(seed.postalCode);
    const [state, setState] = React.useState(seed.state);
    const [gstOpen, setGstOpen] = React.useState(!!(draft?.gstin || advertiser?.gstin));
    const [gstin, setGstin] = React.useState(seed.gstin);
    const [save, setSave] = React.useState(true);
    const [busy, setBusy] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);
    const [invalid, setInvalid] = React.useState<Record<string, string>>({});

    const charges = review ? chargesOf(review) : estimateCart(campaign.spots.map((spot) => ({ ratePerDay: spot.ratePerDay, print: campaign.fulfilment !== "ADVERTISER_SHIPS" })), flightDays(campaign.startDate, campaign.endDate));

    const submit = async () => {
        const problems: Record<string, string> = {};
        if (legalName.trim().length < 2) problems.legalName = "Enter the name the invoice should carry.";
        if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) problems.email = "Enter a valid email address.";
        if (street.trim().length < 5) problems.street = "Enter the street address.";
        if (city.trim().length < 2) problems.city = "Enter the city.";
        if (postalCode.trim() && !PIN_PATTERN.test(postalCode.trim())) problems.postalCode = "A PIN code has six digits, like 560001.";
        if (gstOpen && gstin.trim() && !GSTIN_PATTERN.test(gstin.trim().toUpperCase())) problems.gstin = "Enter a valid 15-character GSTIN.";
        setInvalid(problems);
        if (Object.keys(problems).length > 0) {
            setError(Object.values(problems)[0] ?? null);
            return;
        }
        setBusy(true);
        setError(null);
        const values: BillingDraft = { legalName: legalName.trim(), email: email.trim(), street: street.trim(), city: city.trim(), postalCode: postalCode.trim(), state, gstin: gstOpen ? gstin.trim().toUpperCase() : "" };
        try {
            if (save && advertiser) {
                await bookingService.updateAdvertiser(advertiser.id, billingPatchOf(values, advertiser));
                billingDraft.write(campaign.id, null);
            } else {
                billingDraft.write(campaign.id, values);
            }
            router.push(stepHref(campaign.id, "pay"));
        } catch (caught) {
            const fields = caught instanceof ApiError ? caught.fieldErrors : {};
            const first = Object.values(fields)[0]?.[0];
            setError(first ?? messageOf(caught, "Could not save your billing details."));
            setBusy(false);
        }
    };

    return (
        <div className="mt-2 grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
            <div>
                <h2 className="text-lg font-semibold text-ink">Invoice address</h2>
                <p className="mt-3 text-sm text-dim">These details will appear on your campaign invoice.</p>
                <div className="mt-5 space-y-3">
                    <FloatingField label="Legal business name" value={legalName} onChange={(e) => setLegalName(e.target.value)} invalid={!!invalid.legalName} autoComplete="organization" />
                    <FloatingField label="Billing email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} invalid={!!invalid.email} autoComplete="email" />
                    {/* The bar fills the boxes under it: the address, the city, the PIN and — when it is one of the list's — the state. */}
                    <AddressFinder
                        id="campaign-billing"
                        onPlace={(place) =>
                            fillFromPlace(place, {
                                address: setStreet,
                                city: setCity,
                                postalCode: setPostalCode,
                                state: (named) => {
                                    const match = INDIAN_STATES.find((option) => option.toLowerCase() === named.trim().toLowerCase());
                                    if (match) setState(match);
                                },
                            })
                        }
                    />
                    <FloatingField label="Address" value={street} onChange={(e) => setStreet(e.target.value)} placeholder={ADDRESS_LINE_PLACEHOLDER} invalid={!!invalid.street} autoComplete="street-address" />
                    <div className="grid items-start gap-3 md:grid-cols-2">
                        <FloatingField label="City" value={city} onChange={(e) => setCity(e.target.value)} invalid={!!invalid.city} autoComplete="address-level2" />
                        <FloatingField label="State" select value={state} onChange={(e) => setState(e.target.value)}>
                            <option value="">Choose a state</option>
                            {INDIAN_STATES.map((name) => (
                                <option key={name} value={name}>
                                    {name}
                                </option>
                            ))}
                        </FloatingField>
                    </div>
                    <div className="grid items-start gap-3 md:grid-cols-2">
                        <FloatingField label="PIN code" inputMode="numeric" value={postalCode} onChange={(e) => setPostalCode(e.target.value.replace(/\D/g, "").slice(0, 6))} placeholder={PIN_PLACEHOLDER} maxLength={6} invalid={!!invalid.postalCode} autoComplete="postal-code" />
                        <FloatingField label="Country" select value="India" disabled onChange={() => undefined}>
                            <option value="India">India</option>
                        </FloatingField>
                    </div>
                    {gstOpen && (
                        <>
                            <FloatingField label="GSTIN (optional)" value={gstin} onChange={(e) => setGstin(e.target.value.toUpperCase())} placeholder="Enter your 15-character GSTIN" maxLength={15} invalid={!!invalid.gstin} />
                            <p className="text-xs text-dim">Use the registration details that should appear on your invoice.</p>
                        </>
                    )}
                </div>
                <button
                    type="button"
                    onClick={() => {
                        setGstOpen((open) => !open);
                        if (gstOpen) setGstin("");
                    }}
                    className="mt-5 text-sm font-medium text-brand"
                >
                    {gstOpen ? "Remove GST details" : "Add GST details"}
                </button>
                {gstOpen && advertiser?.gstin && !gstin && <p className="mt-1 text-xs text-dim">Removing it here leaves the GSTIN already on your profile untouched; change it under Account settings.</p>}
                <CheckBox className="mt-5" checked={save} onChange={setSave} label="Save these details to my business profile" />
                {!save && <p className="mt-2 text-xs text-dim">Not saved: the invoice will carry what is already on your profile.</p>}
                <ErrorNote message={error} className="mt-4" />
                <StepFooter className="mt-10" back={{ href: stepHref(campaign.id, "review"), label: "Back to review" }} next={{ label: "Continue to payment", onClick: () => void submit(), busy }} />
            </div>
            <SummaryRail campaign={campaign} review={review} charges={charges} />
        </div>
    );
}
