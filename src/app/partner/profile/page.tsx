"use client";

import * as React from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { PageHeading, Panel } from "@/components/workspace/page-heading";
import { Switch } from "@/components/ui/switch";
import { brandButton, CardTitle, ErrorNote, Field, inputClass, KeyRow, Loading, outlineButton } from "@/components/publisher/parts";
import { usePartnerAccount } from "@/components/partner/partner-context";
import { FLAG_PARTNER_KYC, FLAG_PRINT_FLOOR, useSwitchedOff } from "@/lib/flags";
import { Note } from "@/components/partner/parts";
import { ADDRESS_LINE_PLACEHOLDER, AddressFinder, fillFromPlace, PIN_PLACEHOLDER } from "@/components/listing-form/address-search";
import { FeatureOff } from "@/components/platform/feature-off";
import { PrivacySection } from "@/components/account/privacy-section";
import { SettingsSections } from "@/components/account/settings-layout";
import { NotificationsSettings, PartnerSecurity, PersonSettings } from "@/components/account/settings-panels";
import { cn } from "@/lib/utils";
import {
    CAPABILITIES,
    formatDay,
    isApplicant,
    kycStanding,
    kycStandingWords,
    kycSummaryOf,
    partnerMessage,
    partnerService,
    profileFormOf,
    profilePatch,
    signHref,
    signingOpen,
    type PartnerProfile,
    type ProfileForm,
} from "@/services/partner";
import { useAuth } from "@/lib/auth";
import { accountIdLine, ADX_ID_LABEL } from "@/services/party";


/**
 * Shop profile — since 29 Sep 2026 the print partner's one settings page
 * (the owner: "Sure, go ahead with further cleanup"); Settings & privacy is
 * folded in and its route sends here. Three sections:
 *
 * - Profile — the shop as ADX has it, and the parts of it the shop may
 *   change (`PATCH /print-partners/me`): the contact, the address the agent
 *   collects from, what the press can do, the widest print, the turnaround,
 *   and the switch that decides whether quote requests reach this shop. The
 *   legal identity — the name, GSTIN, PAN and the mobile the account is —
 *   stays ADX's once the account is on, so it is printed, not editable.
 *   Beside the shop, the person behind it: picture, names, date of birth,
 *   gender, the email and other contacts, the sign-in number, the language.
 * - Notifications — every kind on every channel, with quiet hours.
 * - Privacy & security — the password, the authenticator app and the
 *   signed-in devices; the privacy switches, Download my data and Close my
 *   account.
 *
 * The shop's own cards are `partners.print-floor`'s: while the platform has
 * it switched off they say so, and the person's settings still draw — the
 * page is how a partner reaches them, so it stays in the navigation.
 */
export default function PartnerProfilePage() {
    return (
        <>
            <PageHeading title="Shop profile" subtitle="Your shop as ADX has it, your details, notifications, privacy and security." />
            <React.Suspense fallback={<Loading label="Loading your shop…" />}>
                <SettingsSections
                    panels={{
                        profile: (
                            <div className="grid gap-6">
                                <ShopSection />
                                <div className="max-w-[920px]">
                                    <PersonSettings />
                                </div>
                            </div>
                        ),
                        notifications: <NotificationsSettings />,
                        privacy: (
                            <div className="grid gap-4 xl:grid-cols-2">
                                <PartnerSecurity />
                                <div className="grid content-start gap-4">
                                    <PrivacySection party="PRINT_PARTNER" />
                                </div>
                            </div>
                        ),
                    }}
                />
            </React.Suspense>
        </>
    );
}

/** The shop's own cards — the print floor's — with the links to the rest of the shop beside them. */
function ShopSection() {
    const { partner, loaded, error, reload } = usePartnerAccount();
    /* The person's own id, beside the shop's. */
    const adxId = useAuth().user?.displayId ?? null;
    const kycOff = useSwitchedOff(FLAG_PARTNER_KYC);
    const floorOff = useSwitchedOff(FLAG_PRINT_FLOOR);
    const [editing, setEditing] = React.useState(false);

    if (floorOff) return <FeatureOff flag={FLAG_PRINT_FLOOR} />;
    if (!loaded) return <Loading label="Loading your shop…" />;
    if (!partner) return <ErrorNote message={error ?? "Could not read your shop's details."} onRetry={reload} />;

    const applicant = isApplicant(partner);
    const identity = [partner.legalName, partner.gstin ? `GSTIN ${partner.gstin}` : null, partner.panNumber ? `PAN ${partner.panNumber}` : null].filter(Boolean).join(" · ");

    return (
        <div>
            {applicant && (
                <Note tone="warning" className="mb-6">
                    Your application is still with ADX. The shop's name, GSTIN and PAN are edited on{" "}
                    <Link href="/partner/apply" className="font-semibold underline underline-offset-4">
                        your application
                    </Link>{" "}
                    until the account is switched on.
                </Note>
            )}

            <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
                <div className="grid min-w-0 content-start gap-6">
                    <Panel>
                        <div className="flex items-center gap-4">
                            <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-ground text-sm font-semibold text-ink">{initials(partner.name)}</span>
                            <div className="min-w-0">
                                <p className="truncate text-base font-semibold text-ink">{partner.name}</p>
                                {/* 28 Sep 2026: the shop's id named as the shop's; the person's own is "Your ADX ID". */}
                                <p className="text-sm text-dim">{[accountIdLine("PRINT_PARTNER", partner.displayId), partner.mobile].filter(Boolean).join(" · ")}</p>
                                {adxId && <p className="text-sm text-dim">{ADX_ID_LABEL} {adxId}</p>}
                                <p className="text-sm text-dim">{partner.activatedAt ? `Print partner since ${formatDay(partner.activatedAt)}` : "Print partner · application"}</p>
                            </div>
                        </div>
                        {identity && <p className="mt-4 text-sm text-ink">{identity}</p>}
                        <p className="mt-2 text-xs text-dim">The shop's legal details and this number are set by ADX. Ask Help & support to change them.</p>
                    </Panel>

                    <QuoteSwitch partner={partner} />

                    <Panel>
                        <div className="flex items-center justify-between gap-3">
                            <CardTitle>Contact and capabilities</CardTitle>
                            {!editing && (
                                <button type="button" onClick={() => setEditing(true)} className={outlineButton}>
                                    Edit
                                </button>
                            )}
                        </div>
                        {editing ? (
                            <DetailsForm partner={partner} onDone={() => setEditing(false)} />
                        ) : (
                            <div className="mt-3">
                                <KeyRow label="Contact" value={partner.contactName ?? "—"} />
                                <KeyRow label="Email" value={partner.email ?? "—"} />
                                <KeyRow label="Address" value={[partner.address, partner.city, partner.state, partner.postalCode].filter(Boolean).join(", ") || "—"} />
                                <KeyRow label="Prints" value={partner.capabilities.length ? partner.capabilities.join(", ") : "—"} />
                                <KeyRow label="Widest print" value={partner.maxWidthFt ? `${partner.maxWidthFt} ft` : "—"} />
                                <KeyRow label="Turnaround" value={partner.turnaroundDays === null ? "—" : `${partner.turnaroundDays} day${partner.turnaroundDays === 1 ? "" : "s"}`} />
                            </div>
                        )}
                    </Panel>
                </div>

                <Panel className="self-start">
                    <CardTitle>Your shop</CardTitle>
                    <ul className="mt-2 divide-y divide-line">
                        <Row href="/partner/rate-card" label="Rate card" hint={partner.rateCard.hasRateCard ? `${partner.rateCard.rows.length} line${partner.rateCard.rows.length === 1 ? "" : "s"}${partner.rateCard.fileId ? " · file on record" : ""}` : "None on file — add one to be asked first"} />
                        <Row href="/partner/invoices" label="Invoices" hint="Upload the month's invoice to ADX" />
                        <Row href="/partner/earnings#methods" label="Payout methods" hint="Bank account or UPI, checked by ADX" />
                        {!kycOff && <Row href="/partner/verify" label="Verification" hint={kycStandingWords(kycStanding(kycSummaryOf(partner))).label} />}
                        <AgreementRow partner={partner} />
                        <Row href="/partner/agreements" label="Agreements" hint="Everything sent to you for signature, with your copies" />
                        <Row href="/partner/help" label="Help & support" hint="Talk to ADX" />
                    </ul>
                </Panel>
            </div>
        </div>
    );
}

function initials(name: string): string {
    const words = name.trim().split(/\s+/).filter(Boolean);
    return words.length ? words.slice(0, 2).map((word) => word[0]!.toUpperCase()).join("") : "PP";
}

function Row({ href, label, hint }: { href: string; label: string; hint: string }) {
    return (
        <li>
            <Link href={href} className="flex items-center justify-between gap-3 py-3 hover:underline">
                <span className="min-w-0">
                    <span className="block text-sm font-medium text-ink">{label}</span>
                    <span className="block truncate text-xs text-dim">{hint}</span>
                </span>
                <ChevronRight className="size-4 shrink-0 text-dim" aria-hidden />
            </Link>
        </li>
    );
}

/** DS-2: the service agreement — asked for once KYC verifies; quotes and jobs wait on it. */
function AgreementRow({ partner }: { partner: PartnerProfile }) {
    const agreement = partner.agreement;
    if (!agreement?.required) return null;
    const open = !agreement.satisfied && signingOpen(agreement.status) && !!agreement.requestId;
    const hint = agreement.satisfied ? "Signed — your copy is under Agreements" : open ? "Sign it to quote and take jobs — Aadhaar OTP, about a minute" : "ADX sends a fresh document; quoting and jobs open once it is signed";
    return <Row href={open ? signHref(agreement.requestId!, "/partner/profile") : "/partner/agreements"} label="Service agreement" hint={hint} />;
}

/** The owner's "opts to receive quote requests": its own one-field PATCH, never waiting on a Save. */
function QuoteSwitch({ partner }: { partner: PartnerProfile }) {
    const { replace } = usePartnerAccount();
    const [busy, setBusy] = React.useState(false);
    const toggle = async (next: boolean) => {
        setBusy(true);
        try {
            replace(await partnerService.updateMe({ acceptsQuoteRequests: next }));
            toast.success(next ? "Quote requests are on." : "Quote requests are off.");
        } catch (caught) {
            toast.error(partnerMessage(caught, "Could not change the switch."));
        } finally {
            setBusy(false);
        }
    };
    return (
        <Panel>
            <div className="flex items-start justify-between gap-6">
                <div>
                    <CardTitle>Accept quote requests</CardTitle>
                    <p className="mt-1 text-sm text-dim">
                        {partner.rateCard.hasRateCard
                            ? "You have a rate card, so ADX asks you first. With this on, you are also invited to quote when a print goes out to tender."
                            : "With this on, ADX invites you to quote on prints in your city or within 50 km. A shop with a rate card on file is asked first."}
                    </p>
                </div>
                <Switch checked={partner.acceptsQuoteRequests} disabled={busy} onCheckedChange={(checked) => void toggle(checked)} aria-label="Accept quote requests" className="mt-1 data-[state=checked]:bg-brand" />
            </div>
        </Panel>
    );
}

function DetailsForm({ partner, onDone }: { partner: PartnerProfile; onDone: () => void }) {
    const { replace } = usePartnerAccount();
    const [form, setForm] = React.useState<ProfileForm>(() => profileFormOf(partner));
    const [busy, setBusy] = React.useState(false);
    const [failure, setFailure] = React.useState<string | null>(null);
    const set = (patch: Partial<ProfileForm>) => setForm((current) => ({ ...current, ...patch }));
    const offered = [...CAPABILITIES, ...form.capabilities.filter((item) => !(CAPABILITIES as readonly string[]).includes(item))];
    const toggle = (item: string) => set({ capabilities: form.capabilities.includes(item) ? form.capabilities.filter((c) => c !== item) : [...form.capabilities, item] });
    /* Onboarding addresses (1 Oct 2026): no map — a pick in the bar fills the boxes and keeps the coordinates out of sight; typing keeps what they were. */
    const near = React.useMemo(() => (typeof form.latitude === "number" && typeof form.longitude === "number" ? { latitude: form.latitude, longitude: form.longitude } : null), [form.latitude, form.longitude]);

    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        const result = profilePatch(form);
        if ("problem" in result) return setFailure(result.problem);
        setBusy(true);
        setFailure(null);
        try {
            replace(await partnerService.updateMe(result.body));
            toast.success("Saved.");
            onDone();
        } catch (caught) {
            setFailure(partnerMessage(caught, "Could not save your details."));
        } finally {
            setBusy(false);
        }
    };

    return (
        <form onSubmit={submit} className="mt-4 grid gap-4">
            <div className="grid gap-4 md:grid-cols-2">
                <Field label="Contact person" htmlFor="pp-contact">
                    <input id="pp-contact" value={form.contactName} onChange={(e) => set({ contactName: e.target.value })} placeholder="Who ADX and the agent ask for" className={inputClass} maxLength={120} />
                </Field>
                <Field label="Email" htmlFor="pp-email">
                    <input id="pp-email" type="email" value={form.email} onChange={(e) => set({ email: e.target.value })} placeholder="shop@example.com" className={inputClass} autoComplete="email" />
                </Field>
            </div>
            <div className="grid items-start gap-4 md:grid-cols-2">
                <AddressFinder
                    id="pp-address"
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
                    <Field label="Address the agent collects from" htmlFor="pp-address-line">
                        <input id="pp-address-line" value={form.address} onChange={(e) => set({ address: e.target.value })} placeholder={ADDRESS_LINE_PLACEHOLDER} className={inputClass} maxLength={500} autoComplete="street-address" />
                    </Field>
                </div>
                <Field label="City" htmlFor="pp-city">
                    <input id="pp-city" value={form.city} onChange={(e) => set({ city: e.target.value })} placeholder="Bengaluru" className={inputClass} maxLength={80} autoComplete="address-level2" />
                </Field>
                <Field label="State" htmlFor="pp-state">
                    <input id="pp-state" value={form.state} onChange={(e) => set({ state: e.target.value })} placeholder="Karnataka" className={inputClass} maxLength={80} autoComplete="address-level1" />
                </Field>
                <Field label="PIN code" htmlFor="pp-postal-code">
                    <input id="pp-postal-code" value={form.postalCode} onChange={(e) => set({ postalCode: e.target.value.replace(/\D/g, "").slice(0, 6) })} placeholder={PIN_PLACEHOLDER} inputMode="numeric" className={inputClass} maxLength={6} autoComplete="postal-code" />
                </Field>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
                <Field label="Widest print (ft)" htmlFor="pp-width">
                    <input id="pp-width" value={form.maxWidth} onChange={(e) => set({ maxWidth: e.target.value.replace(/[^\d.]/g, "") })} inputMode="decimal" placeholder="10" className={inputClass} />
                </Field>
                <Field label="Usual turnaround (days)" htmlFor="pp-turnaround">
                    <input id="pp-turnaround" value={form.turnaround} onChange={(e) => set({ turnaround: e.target.value.replace(/[^\d]/g, "").slice(0, 3) })} inputMode="numeric" placeholder="3" className={inputClass} />
                </Field>
            </div>
            <div>
                <p className="text-sm font-medium text-ink">What you print</p>
                <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label="What you print">
                    {offered.map((item) => {
                        const on = form.capabilities.includes(item);
                        return (
                            <button key={item} type="button" aria-pressed={on} onClick={() => toggle(item)} className={cn("h-9 rounded-full border px-4 text-sm transition-colors", on ? "border-ink bg-ink text-white" : "border-line bg-white text-ink hover:border-ink")}>
                                {item}
                            </button>
                        );
                    })}
                </div>
            </div>
            {failure && (
                <p role="alert" className="text-sm text-danger">
                    {failure}
                </p>
            )}
            <div className="flex flex-wrap gap-3">
                <button type="submit" disabled={busy} className={brandButton}>
                    {busy ? "Saving…" : "Save"}
                </button>
                <button type="button" onClick={onDone} disabled={busy} className={outlineButton}>
                    Cancel
                </button>
            </div>
        </form>
    );
}
