"use client";

import * as React from "react";
import Link from "next/link";
import { ApiError, messageOf } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { Panel } from "@/components/workspace/page-heading";
import { AgreementAccept } from "@/components/agreements/agreement-accept";
import { ADDRESS_LINE_PLACEHOLDER, AddressFinder, fillFromPlace, PIN_PATTERN, PIN_PLACEHOLDER } from "@/components/listing-form/address-search";
import { btnOutline, btnPrimary, inputClass } from "@/components/advertiser/bits";
import { advertiserWorkspace, companyNameOf, type AdvertiserProfile } from "@/services/advertiser-workspace";
import { pendingGates, type SetupGate } from "@/services/campaigns";

const STEPS = 3;

const GATE_COPY: Record<SetupGate, { step: number; title: string; blurb: string }> = {
    PROFILE: { step: 2, title: "Tell us who is advertising", blurb: "Your billing details — where the invoices go." },
    AGREEMENT: { step: 3, title: "Accept the ADX terms", blurb: "One agreement, covering everything you book on ADX." },
};

const LATER_KEY = "adx.web.advertiser.setup-later";

/** The gates put away with "Later" for this visit (this tab's session); they come back on the next. */
function laterGates(): SetupGate[] {
    try {
        const raw = window.sessionStorage.getItem(LATER_KEY);
        const parsed = raw ? (JSON.parse(raw) as unknown) : [];
        return Array.isArray(parsed) ? (parsed.filter((g) => g === "PROFILE" || g === "AGREEMENT") as SetupGate[]) : [];
    } catch {
        return [];
    }
}

function rememberLater(gate: SetupGate) {
    try {
        window.sessionStorage.setItem(LATER_KEY, JSON.stringify([...new Set([...laterGates(), gate])]));
    } catch {
        /* Private mode: "Later" holds until the page reloads. */
    }
}

interface Loaded {
    advertiser: AdvertiserProfile;
    gates: SetupGate[];
}

/**
 * QR-17 / QR-18: the set-up card at the top of the advertiser's home — the
 * two things a booking needs that are still open (the billing details, then
 * the agreement), one step at a time with its progress, and "Later" to put
 * it away for this visit (the checkout asks again). The server decides what
 * is open (`GET /advertisers/:id/eligibility`) and is asked again after
 * every step. Verification is not pushed here: it is asked on a paid
 * campaign, before it goes live — except when ADX asked for a re-upload.
 */
export function SetupCard({ advertiserId }: { advertiserId: string }) {
    const [state, setState] = React.useState<{ loaded: Loaded | null; error: string | null }>({ loaded: null, error: null });
    /* The card draws only after its reads land, in the browser, so the session's "Later" is safe to read at once. */
    const [later, setLater] = React.useState<SetupGate[]>(() => (typeof window === "undefined" ? [] : laterGates()));
    const [tick, setTick] = React.useState(0);

    React.useEffect(() => {
        let cancelled = false;
        Promise.all([advertiserWorkspace.advertiser(), advertiserWorkspace.eligibility(advertiserId)])
            .then(([advertiser, eligibility]) => {
                if (!cancelled) setState({ loaded: { advertiser, gates: pendingGates(eligibility) }, error: null });
            })
            .catch((caught: unknown) => {
                /* A set-up card that cannot be read is no card: the list below still works, and the checkout asks. */
                if (!cancelled) setState({ loaded: null, error: messageOf(caught, "") });
            });
        return () => {
            cancelled = true;
        };
    }, [advertiserId, tick]);

    const loaded = state.loaded;
    if (!loaded) return null;
    const refresh = () => setTick((n) => n + 1);
    const open = loaded.gates.filter((gate) => !later.includes(gate));
    const gate = open[0] ?? null;
    const needsReupload = loaded.advertiser.kycStatus === "NEEDS_INFO";
    if (!gate && !needsReupload) return null;
    const putAway = (which: SetupGate) => {
        rememberLater(which);
        setLater((current) => [...new Set([...current, which])]);
    };

    return (
        <div className="mt-6 space-y-4" data-testid="advertiser-setup">
            {gate && (
                <Panel>
                    <StepBar current={GATE_COPY[gate].step} />
                    <h2 className="mt-4 text-base font-semibold text-ink">{GATE_COPY[gate].title}</h2>
                    <p className="mt-1 text-sm text-dim">{GATE_COPY[gate].blurb}</p>
                    <div className="mt-5">{gate === "PROFILE" ? <ProfileStep advertiser={loaded.advertiser} onDone={refresh} /> : <AgreementStep onDone={refresh} onLater={() => putAway("AGREEMENT")} />}</div>
                    <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
                        <p className="text-xs text-dim">
                            {open.length > 1 ? `${open.length - 1} more step after this. ` : ""}You can browse and build a campaign now; this is asked again before you book.
                        </p>
                        <button
                            type="button"
                            className={btnOutline}
                            onClick={() => putAway(gate)}
                        >
                            Later
                        </button>
                    </div>
                </Panel>
            )}
            {needsReupload && (
                <Panel>
                    <h2 className="text-base font-semibold text-ink">Needs a re-upload</h2>
                    <p className="mt-1 text-sm text-dim">ADX could not accept some of your documents. Send the flagged ones again — everything else is kept, and the review picks up where it left off.</p>
                    <Link href="/advertiser/verify" className={cn(btnPrimary, "mt-4")}>
                        Re-upload the flagged documents
                    </Link>
                </Panel>
            )}
        </div>
    );
}

function StepBar({ current }: { current: number }) {
    return (
        <div className="flex items-center gap-2" aria-label={`Step ${current} of ${STEPS}`}>
            {Array.from({ length: STEPS }, (_, index) => (
                <span key={index} className={cn("h-1 flex-1 rounded-full", index < current ? "bg-brand" : "bg-ground")} aria-hidden />
            ))}
            <span className="ml-2 shrink-0 text-xs text-dim">
                Step {current} of {STEPS}
            </span>
        </div>
    );
}

/** A labelled plain box. */
function Field({ label, value, onChange, placeholder, error, inputMode, maxLength, autoComplete }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string; error?: string; inputMode?: "numeric" | "text"; maxLength?: number; autoComplete?: string }) {
    const id = React.useId();
    return (
        <div>
            <label htmlFor={id} className="block text-sm font-medium text-ink">
                {label}
            </label>
            <input id={id} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} inputMode={inputMode} maxLength={maxLength} autoComplete={autoComplete} className={cn(inputClass, "mt-2", error && "border-danger")} aria-invalid={!!error} />
        </div>
    );
}

/**
 * The billing details, as the app's profile gate asks them. Onboarding
 * addresses (the owner, 1 Oct 2026): the "Find the address" bar over plain
 * boxes — the address, City | State, PIN | Country, each pair the same
 * height. A billing address takes no coordinates, so a pick sends none.
 */
function ProfileStep({ advertiser, onDone }: { advertiser: AdvertiserProfile; onDone: () => void }) {
    const needsCompany = advertiser.type !== "INDIVIDUAL";
    /* The business name given on the side form is the registered name: offered, not asked again. */
    const [companyName, setCompanyName] = React.useState(() => companyNameOf(advertiser));
    const [billingAddress, setBillingAddress] = React.useState(advertiser.billingAddress ?? "");
    const [city, setCity] = React.useState(advertiser.city ?? "");
    const [state, setState] = React.useState(advertiser.state ?? "");
    const [postalCode, setPostalCode] = React.useState(advertiser.postalCode ?? "");
    const [country, setCountry] = React.useState(advertiser.country ?? "");
    const [gstin, setGstin] = React.useState(advertiser.gstin ?? "");
    const [busy, setBusy] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);
    const [fields, setFields] = React.useState<Record<string, string[]>>({});

    const complete = billingAddress.trim().length > 4 && city.trim().length > 1 && (postalCode.trim() === "" || PIN_PATTERN.test(postalCode.trim())) && (!needsCompany || companyName.trim().length > 1);

    const submit = async () => {
        if (!complete || busy) return;
        setBusy(true);
        setError(null);
        setFields({});
        try {
            await advertiserWorkspace.updateAdvertiser(advertiser.id, {
                ...(companyName.trim() ? { companyName: companyName.trim() } : {}),
                ...(gstin.trim() ? { gstin: gstin.trim().toUpperCase() } : {}),
                billingAddress: billingAddress.trim(),
                city: city.trim(),
                ...(state.trim() ? { state: state.trim() } : {}),
                ...(postalCode.trim() ? { postalCode: postalCode.trim() } : {}),
                ...(country.trim() ? { country: country.trim() } : {}),
            });
            onDone();
        } catch (caught) {
            if (caught instanceof ApiError) setFields(caught.fieldErrors);
            setError(messageOf(caught, "Could not save your details."));
            setBusy(false);
        }
    };

    const fieldError = Object.entries(fields)
        .map(([, messages]) => messages[0])
        .filter(Boolean)[0];

    return (
        <div className="grid gap-4 md:grid-cols-2">
            {needsCompany && (
                <div className="md:col-span-2">
                    <Field label="Registered company name" value={companyName} onChange={setCompanyName} error={fields.companyName?.[0]} maxLength={160} />
                </div>
            )}
            <AddressFinder id="setup-billing" className="md:col-span-2" onPlace={(place) => fillFromPlace(place, { address: setBillingAddress, city: setCity, state: setState, postalCode: setPostalCode, country: setCountry })} />
            <div className="md:col-span-2">
                <Field label="Billing address" value={billingAddress} onChange={setBillingAddress} placeholder={ADDRESS_LINE_PLACEHOLDER} error={fields.billingAddress?.[0]} maxLength={400} autoComplete="street-address" />
            </div>
            <Field label="City" value={city} onChange={setCity} placeholder="Bengaluru" error={fields.city?.[0]} maxLength={120} autoComplete="address-level2" />
            <Field label="State" value={state} onChange={setState} placeholder="Karnataka" error={fields.state?.[0]} maxLength={120} autoComplete="address-level1" />
            <Field label="PIN code" value={postalCode} onChange={(v) => setPostalCode(v.replace(/\D/g, "").slice(0, 6))} placeholder={PIN_PLACEHOLDER} inputMode="numeric" error={fields.postalCode?.[0]} autoComplete="postal-code" />
            <Field label="Country" value={country} onChange={setCountry} placeholder="India" error={fields.country?.[0]} maxLength={80} autoComplete="country-name" />
            <div className="md:col-span-2">
                <Field label="GSTIN (optional — to claim input credit on your invoices)" value={gstin} onChange={(v) => setGstin(v.toUpperCase())} placeholder="29ABCDE1234F1Z5" error={fields.gstin?.[0]} maxLength={15} />
            </div>
            {(error || fieldError) && <p className="text-sm text-danger md:col-span-2">{fieldError ?? error}</p>}
            <div className="md:col-span-2">
                <button type="button" onClick={() => void submit()} disabled={!complete || busy} className={btnPrimary}>
                    {busy ? "Saving…" : "Save and continue"}
                </button>
            </div>
        </div>
    );
}

/**
 * The agreement step: what it covers, then the live text and the click the
 * server records (`POST /advertisers/:id/agreements/platform`) — the shared
 * agreement block the other agreement pages use.
 */
function AgreementStep({ onDone, onLater }: { onDone: () => void; onLater: () => void }) {
    return (
        <div>
            <p className="text-sm text-ink">The ADX advertiser agreement covers what you are buying, what ADX guarantees about a site, and what happens if a site becomes unavailable while your campaign is running.</p>
            <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-ink">
                <li>Sites are verified by an ADX agent before they can be booked.</li>
                <li>If a site lapses mid-campaign you get a comparable replacement, plus goodwill credit for the days lost.</li>
                <li>Goodwill credit is spent on your next booking and cannot be withdrawn.</li>
                <li>You accept a separate insertion order for each campaign, listing its exact sites.</li>
            </ul>
            <AgreementAccept kind="ADVERTISER_PLATFORM" acceptLabel="Accept and continue" onAccepted={onDone} onSkip={onLater} className="mt-4" />
        </div>
    );
}
