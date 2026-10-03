"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Clock } from "lucide-react";
import { toast } from "sonner";
import { SiteHeader } from "@/components/site/site-header";
import { Panel } from "@/components/workspace/page-heading";
import { brandButton, Chip, ChoiceCard, ErrorNote, Field, inputClass, Loading, outlineButton } from "@/components/publisher/parts";
import { PartnerAccountProvider, usePartnerAccount } from "@/components/partner/partner-context";
import { Note } from "@/components/partner/parts";
import { ADDRESS_LINE_PLACEHOLDER, AddressFinder, fillFromPlace, PIN_PLACEHOLDER } from "@/components/listing-form/address-search";
import { FeatureOff } from "@/components/platform/feature-off";
import { useAuth } from "@/lib/auth";
import { FLAG_PARTNER_KYC, useSwitchedOff } from "@/lib/flags";
import { cn } from "@/lib/utils";
import { accountIdLine, LABEL_OF, type AccountType } from "@/services/party";
import {
    applicationBody,
    applicationFormOf,
    applicationSent,
    appliedOn,
    CAPABILITIES,
    isApplicant,
    kycStanding,
    kycStandingWords,
    kycSummaryOf,
    partnerMessage,
    partnerService,
    type ApplicationForm,
    type PartnerProfile,
} from "@/services/partner";

const NEXT = "/partner/apply";


const ACCOUNT_TYPES: { value: AccountType; label: string; hint: string }[] = [
    { value: "INDIVIDUAL", label: "Individual", hint: "Single person owner" },
    { value: "BUSINESS", label: "Business entity", hint: "Registered company or firm" },
    { value: "ORGANISATION", label: "Organisation", hint: "NGO, government, education or political" },
];

/**
 * PP-1 on the web: a print shop applies. The app's door is "I print and
 * install" on the first question, then the kind of account, then the
 * shop's details; the desk reviews (Print partners › Applications),
 * verifies the KYC and switches the account on. Until then this page is
 * the whole print floor for the applicant — the details can be edited
 * until activation, and KYC and the rate card are open meanwhile.
 *
 * Drawn without the workspace shell: before the side is chosen there is
 * no workspace to draw.
 */
export default function PartnerApplyPage() {
    return (
        <div className="flex min-h-screen flex-col bg-ground">
            <SiteHeader />
            <main className="mx-auto w-full max-w-[760px] flex-1 px-4 pb-16 pt-12">
                <PartnerAccountProvider>
                    <Apply />
                </PartnerAccountProvider>
            </main>
        </div>
    );
}

function Apply() {
    const router = useRouter();
    const { status, parties, needsEmail } = useAuth();
    const { partner, loaded, error, reload } = usePartnerAccount();
    const isPartner = parties.includes("PRINT_PARTNER");
    const otherSides = parties.filter((side) => side !== "PRINT_PARTNER");
    const activated = !!partner && !isApplicant(partner);

    React.useEffect(() => {
        if (status === "signed-out") router.replace(`/sign-in?next=${encodeURIComponent(NEXT)}`);
        else if (status === "signed-in" && needsEmail) router.replace(`/verify-email?next=${encodeURIComponent(NEXT)}`);
        else if (activated) router.replace("/partner");
    }, [status, needsEmail, activated, router]);

    if (status !== "signed-in" || needsEmail) return <Loading label="Checking your session…" />;
    if (!isPartner && otherSides.length > 0) return <OwnNumberNeeded sides={otherSides.map((side) => LABEL_OF[side].toLowerCase())} />;
    if (!isPartner) return <AccountStep />;
    if (!loaded) return <Loading label="Reading your application…" />;
    if (!partner) return <ErrorNote message={error ?? "Could not read your application."} onRetry={reload} />;
    if (activated) return <Loading label="Your shop is on ADX — opening your workspace…" />;
    return <Application partner={partner} />;
}

function Steps({ at }: { at: 1 | 2 | 3 }) {
    const steps = ["Your account", "Your print shop", "ADX review"];
    return (
        <ol className="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs font-medium" aria-label="Application steps">
            {steps.map((label, index) => {
                const n = index + 1;
                return (
                    <li key={label} className="flex items-center gap-2">
                        {index > 0 && <span aria-hidden className="h-px w-6 bg-line" />}
                        <span className={cn("flex size-5 items-center justify-center rounded-full text-[11px]", n < at ? "bg-ink text-white" : n === at ? "bg-brand text-white" : "bg-white text-dim ring-1 ring-line")}>{n}</span>
                        <span className={n === at ? "text-ink" : "text-dim"} aria-current={n === at ? "step" : undefined}>
                            {label}
                        </span>
                    </li>
                );
            })}
        </ol>
    );
}

function Title({ title, subtitle }: { title: string; subtitle: string }) {
    return (
        <div className="mt-6">
            <h1 className="text-[30px] font-bold leading-10 tracking-tight text-ink">{title}</h1>
            <p className="mt-1 text-sm text-dim">{subtitle}</p>
        </div>
    );
}

/** The server refuses a number that already holds another side: a shop shares a phone with nobody. Said before it is asked. */
function OwnNumberNeeded({ sides }: { sides: string[] }) {
    const { signOut } = useAuth();
    return (
        <>
            <Title title="Apply as a print partner" subtitle="Print ADX jobs for spaces near you — apply, and ADX brings you on." />
            <Panel className="mt-6">
                <p className="text-base font-semibold text-ink">A print shop needs its own number</p>
                <p className="mt-2 text-sm text-dim">
                    This number already has an ADX {sides.join(" and ")} account. Sign out, then sign in with the shop's own mobile number to apply — the print floor, its jobs and its payouts stay apart from your {sides.join(" and ")} work.
                </p>
                <div className="mt-5 flex flex-wrap gap-3">
                    <button type="button" onClick={() => void signOut()} className={brandButton}>
                        Sign out
                    </button>
                    <Link href="/choose-workspace" className={outlineButton}>
                        Back to my workspace
                    </Link>
                </div>
            </Panel>
        </>
    );
}

/** "I print and install" → the kind of account: `POST /users/me/party { party: PRINT_PARTNER }`, the re-signed token adopted. */
function AccountStep() {
    const { chooseParty } = useAuth();
    const [accountType, setAccountType] = React.useState<AccountType | null>(null);
    const [name, setName] = React.useState("");
    const [busy, setBusy] = React.useState(false);
    const [failure, setFailure] = React.useState<string | null>(null);

    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!accountType || busy) return;
        setBusy(true);
        setFailure(null);
        try {
            await chooseParty({ party: "PRINT_PARTNER", accountType, ...(name.trim() ? { name: name.trim() } : {}) });
        } catch (caught) {
            setFailure(partnerMessage(caught, "Could not open your application."));
            setBusy(false);
        }
    };

    return (
        <>
            <Steps at={1} />
            <Title title="I print and install" subtitle="Print ADX jobs for spaces near you. Apply, and ADX brings you on." />
            <form onSubmit={submit}>
                <Panel className="mt-6">
                    <p className="text-base font-semibold text-ink">Who runs the shop?</p>
                    <p className="mt-1 text-sm text-dim">Details must match your KYC papers.</p>
                    <div className="mt-4 grid gap-3" role="radiogroup" aria-label="Kind of account">
                        {ACCOUNT_TYPES.map((option) => (
                            <ChoiceCard key={option.value} name="accountType" checked={accountType === option.value} title={option.label} hint={option.hint} onSelect={() => setAccountType(option.value)} />
                        ))}
                    </div>
                    <div className="mt-5">
                        <Field label="Shop name" htmlFor="apply-shop-name">
                            <input id="apply-shop-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Rapid Prints" className={inputClass} maxLength={120} autoComplete="organization" />
                        </Field>
                    </div>
                    {failure && (
                        <p role="alert" className="mt-4 text-sm text-danger">
                            {failure}
                        </p>
                    )}
                    <div className="mt-6 flex flex-wrap items-center gap-3">
                        <button type="submit" disabled={!accountType || busy} className={brandButton}>
                            {busy ? "Opening…" : "Continue"}
                        </button>
                        <p className="text-xs text-dim">One number, one print shop. ADX reviews every application before the account opens.</p>
                    </div>
                </Panel>
            </form>
        </>
    );
}

function Application({ partner }: { partner: PartnerProfile }) {
    const [editing, setEditing] = React.useState(false);
    const sent = applicationSent(partner);
    if (!sent || editing) return <ApplicationFormView partner={partner} sent={sent} onDone={() => setEditing(false)} />;
    return <UnderReview partner={partner} onEdit={() => setEditing(true)} />;
}

/** `POST /print-partners/me/application` — what the desk's form would have asked, from the shop itself. */
function ApplicationFormView({ partner, sent, onDone }: { partner: PartnerProfile; sent: boolean; onDone: () => void }) {
    const { replace } = usePartnerAccount();
    const [form, setForm] = React.useState<ApplicationForm>(() => applicationFormOf(partner));
    const [busy, setBusy] = React.useState(false);
    const [failure, setFailure] = React.useState<string | null>(null);
    const set = (patch: Partial<ApplicationForm>) => setForm((current) => ({ ...current, ...patch }));
    const toggle = (item: string) => set({ capabilities: form.capabilities.includes(item) ? form.capabilities.filter((c) => c !== item) : [...form.capabilities, item] });
    const offered = [...CAPABILITIES, ...form.capabilities.filter((item) => !(CAPABILITIES as readonly string[]).includes(item))];
    /* Onboarding addresses (1 Oct 2026): no map — a pick in the bar fills the boxes and keeps the coordinates out of sight; typing keeps what they were. */
    const near = React.useMemo(() => (typeof form.latitude === "number" && typeof form.longitude === "number" ? { latitude: form.latitude, longitude: form.longitude } : null), [form.latitude, form.longitude]);

    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        const result = applicationBody(form);
        if ("problem" in result) {
            setFailure(result.problem);
            return;
        }
        setBusy(true);
        setFailure(null);
        try {
            replace(await partnerService.completeApplication(result.body));
            toast.success(sent ? "Your application is updated." : "Application sent. ADX is reviewing it.");
            onDone();
        } catch (caught) {
            setFailure(partnerMessage(caught, "Could not send your application."));
        } finally {
            setBusy(false);
        }
    };

    return (
        <>
            <Steps at={2} />
            <Title title="Your print shop" subtitle="What ADX needs to bring you on. Details must match your KYC papers." />
            <form onSubmit={submit} className="mt-6 grid gap-6">
                <Panel>
                    <p className="text-base font-semibold text-ink">The shop</p>
                    <div className="mt-4 grid gap-4 md:grid-cols-2">
                        <Field label="Shop name" htmlFor="app-name">
                            <input id="app-name" value={form.name} onChange={(e) => set({ name: e.target.value })} placeholder="Rapid Prints" className={inputClass} maxLength={120} />
                        </Field>
                        <Field label="Legal name (if different)" htmlFor="app-legal">
                            <input id="app-legal" value={form.legalName} onChange={(e) => set({ legalName: e.target.value })} placeholder="Rapid Prints LLP" className={inputClass} maxLength={200} />
                        </Field>
                        <Field label="GSTIN (optional)" htmlFor="app-gstin">
                            <input id="app-gstin" value={form.gstin} onChange={(e) => set({ gstin: e.target.value.toUpperCase() })} placeholder="29ABCDE1234F1Z5" className={inputClass} maxLength={15} autoComplete="off" />
                        </Field>
                        <Field label="PAN (optional)" htmlFor="app-pan">
                            <input id="app-pan" value={form.pan} onChange={(e) => set({ pan: e.target.value.toUpperCase() })} placeholder="ABCDE1234F" className={inputClass} maxLength={10} autoComplete="off" />
                        </Field>
                        <Field label="Contact person" htmlFor="app-contact">
                            <input id="app-contact" value={form.contactName} onChange={(e) => set({ contactName: e.target.value })} placeholder="Who ADX should call" className={inputClass} maxLength={120} autoComplete="name" />
                        </Field>
                        <Field label="Turnaround (days)" htmlFor="app-turnaround">
                            <input id="app-turnaround" value={form.turnaround} onChange={(e) => set({ turnaround: e.target.value.replace(/[^\d]/g, "").slice(0, 3) })} placeholder="2" inputMode="numeric" className={inputClass} />
                        </Field>
                    </div>
                </Panel>

                <Panel>
                    <p className="text-base font-semibold text-ink">Where the agent collects from</p>
                    <div className="mt-4 grid items-start gap-4 md:grid-cols-2">
                        <AddressFinder
                            id="app-address"
                            className="md:col-span-2"
                            near={near}
                            onPlace={(place) =>
                                fillFromPlace(place, {
                                    address: (address) => set({ address }),
                                    city: (city) => set({ city }),
                                    state: (state) => set({ state }),
                                    postalCode: (postalCode) => set({ postalCode }),
                                    point: ({ latitude, longitude }) => set({ latitude, longitude }),
                                })
                            }
                        />
                        <div className="md:col-span-2">
                            <Field label="Shop address" htmlFor="app-address-line">
                                <input id="app-address-line" value={form.address} onChange={(e) => set({ address: e.target.value })} placeholder={ADDRESS_LINE_PLACEHOLDER} className={inputClass} maxLength={500} autoComplete="street-address" />
                            </Field>
                        </div>
                        <Field label="City" htmlFor="app-city">
                            <input id="app-city" value={form.city} onChange={(e) => set({ city: e.target.value })} placeholder="Bengaluru" className={inputClass} maxLength={80} autoComplete="address-level2" />
                        </Field>
                        <Field label="State" htmlFor="app-state">
                            <input id="app-state" value={form.state} onChange={(e) => set({ state: e.target.value })} placeholder="Karnataka" className={inputClass} maxLength={80} autoComplete="address-level1" />
                        </Field>
                        <Field label="PIN code" htmlFor="app-postal-code">
                            <input id="app-postal-code" value={form.postalCode} onChange={(e) => set({ postalCode: e.target.value.replace(/\D/g, "").slice(0, 6) })} placeholder={PIN_PLACEHOLDER} inputMode="numeric" className={inputClass} maxLength={6} autoComplete="postal-code" />
                        </Field>
                    </div>
                    <p className="mt-3 text-xs text-dim">ADX sends print jobs for spaces in your city or within 50 km of it.</p>
                </Panel>

                <Panel>
                    <p className="text-base font-semibold text-ink">What you print</p>
                    <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="What you print">
                        {offered.map((item) => {
                            const on = form.capabilities.includes(item);
                            return (
                                <button key={item} type="button" aria-pressed={on} onClick={() => toggle(item)} className={cn("h-9 rounded-full border px-4 text-sm transition-colors", on ? "border-ink bg-ink text-white" : "border-line bg-white text-ink hover:border-ink")}>
                                    {item}
                                </button>
                            );
                        })}
                    </div>
                </Panel>

                <Panel>
                    <p className="text-base font-semibold text-ink">How you price</p>
                    <div className="mt-4 grid gap-3 md:grid-cols-2">
                        <ChoiceCard name="pricing" checked={form.pricing === "QUOTES"} title="Quote each job" hint="ADX sends the job; you quote; the lowest quote wins." onSelect={() => set({ pricing: "QUOTES" })} />
                        <ChoiceCard name="pricing" checked={form.pricing === "RATE_CARD"} title="Rate card" hint="A shop with a rate card is asked first for jobs in reach." onSelect={() => set({ pricing: "RATE_CARD" })} />
                    </div>
                    <p className="mt-3 text-xs text-dim">{form.pricing === "RATE_CARD" ? "Add the rate card after sending this — it opens from your application." : "You can add a rate card later as well; it puts you first in line."}</p>
                </Panel>

                {failure && (
                    <p role="alert" className="text-sm text-danger">
                        {failure}
                    </p>
                )}
                <div className="flex flex-wrap gap-3">
                    <button type="submit" disabled={busy} className={brandButton}>
                        {busy ? "Sending…" : sent ? "Save the changes" : "Send application"}
                    </button>
                    {sent && (
                        <button type="button" onClick={onDone} disabled={busy} className={outlineButton}>
                            Cancel
                        </button>
                    )}
                </div>
            </form>
        </>
    );
}

/** The application sent: what ADX has, the two doors still open (KYC, the rate card), and the edit. */
function UnderReview({ partner, onEdit }: { partner: PartnerProfile; onEdit: () => void }) {
    const kyc = kycStandingWords(kycStanding(kycSummaryOf(partner)));
    const verified = partner.kycStatus === "VERIFIED";
    // Verification is `print.partner-kyc`: switched off, its door is not offered.
    const kycOff = useSwitchedOff(FLAG_PARTNER_KYC);
    const identity = [partner.legalName, partner.gstin ? `GSTIN ${partner.gstin}` : null, partner.panNumber ? `PAN ${partner.panNumber}` : null].filter(Boolean).join(" · ");
    return (
        <>
            <Steps at={3} />
            <Title title="Application received" subtitle={[accountIdLine("PRINT_PARTNER", partner.displayId) ?? "Your shop", appliedOn(partner) ? `applied ${appliedOn(partner)}` : null, "ADX is reviewing it"].filter(Boolean).join(" · ")} />
            <div className="mt-6 grid gap-6">
                <Note tone="warning" className="flex items-start gap-3 text-ink">
                    <Clock className="mt-0.5 size-5 shrink-0 text-warning" aria-hidden />
                    <span>ADX checks the details and the papers, then switches the account on. You get a message when it is, and the print floor — jobs, quote requests, earnings — opens here.</span>
                </Note>

                <Panel>
                    <div className="flex flex-wrap items-start justify-between gap-4">
                        <div className="min-w-0">
                            <p className="text-base font-semibold text-ink">{partner.name}</p>
                            <p className="mt-1 text-sm text-dim">{identity || "Individual"}</p>
                            <p className="mt-1 text-sm text-dim">{[partner.address, partner.city, partner.state, partner.postalCode].filter(Boolean).join(", ")}</p>
                        </div>
                        <button type="button" onClick={onEdit} className={outlineButton}>
                            Edit details
                        </button>
                    </div>
                    {partner.capabilities.length > 0 && (
                        <div className="mt-4 flex flex-wrap gap-2">
                            {partner.capabilities.map((item) => (
                                <Chip key={item} tone="neutral">
                                    {item}
                                </Chip>
                            ))}
                        </div>
                    )}
                    <p className="mt-4 text-sm text-dim">
                        {partner.acceptsQuoteRequests ? "Quotes on request" : "Rate card"}
                        {partner.turnaroundDays ? ` · ${partner.turnaroundDays}-day turnaround` : ""}
                        {partner.contactName ? ` · Contact: ${partner.contactName}` : ""}
                    </p>
                </Panel>

                <Panel>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <p className="text-base font-semibold text-ink">Identity check (KYC)</p>
                        <Chip tone={kyc.tone}>{kyc.label}</Chip>
                    </div>
                    {kycOff ? (
                        <FeatureOff flag={FLAG_PARTNER_KYC} className="mt-2 border-0 p-0 text-dim" />
                    ) : (
                        <>
                            <p className="mt-2 text-sm text-dim">Verify with Digio — it takes a minute. Uploading the documents is the fallback if Digio cannot be used.</p>
                            <Link href="/partner/verify" className={cn(verified ? outlineButton : brandButton, "mt-4")}>
                                {verified ? "View verification" : "Verify identity"}
                            </Link>
                        </>
                    )}
                </Panel>

                {!partner.acceptsQuoteRequests && (
                    <Panel>
                        <p className="text-base font-semibold text-ink">Rate card</p>
                        <p className="mt-2 text-sm text-dim">A shop with a rate card is asked first for jobs in reach. Add it now or after the account opens.</p>
                        <Link href="/partner/rate-card" className={cn(outlineButton, "mt-4")}>
                            {partner.rateCard.hasRateCard ? "Update rate card" : "Add rate card"}
                        </Link>
                    </Panel>
                )}

                <p className="text-sm text-dim">
                    Questions?{" "}
                    <Link href="/partner/help" className="font-medium text-ink underline underline-offset-4">
                        Talk to ADX
                    </Link>
                </p>
            </div>
        </>
    );
}
