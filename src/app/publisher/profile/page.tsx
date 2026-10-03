"use client";

import * as React from "react";
import Link from "next/link";
import { BadgeCheck, Laptop, ShieldCheck, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { Panel } from "@/components/workspace/page-heading";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { AuthenticatorSetup } from "@/components/auth/authenticator-setup";
import { PrivacySection } from "@/components/account/privacy-section";
import { SettingsSections } from "@/components/account/settings-layout";
import { NotificationsSettings, PersonSettings, PublisherAgentAccess } from "@/components/account/settings-panels";
import { CustomFieldsSection } from "@/components/custom-fields/custom-fields-section";
import { ADDRESS_LINE_PLACEHOLDER, AddressFinder, CityField, fillFromPlace, PIN_PLACEHOLDER } from "@/components/listing-form/address-search";
import { Field as FloatingField, Row } from "@/components/listing-form/fields";
import { businessPatch } from "@/components/publisher-home/business-details";
import { brandButton, CardTitle, Chip, ErrorNote, Field, inputClass, Loading, outlineButton } from "@/components/publisher/parts";
import { useLoad } from "@/components/publisher/use-load";
import { useAuth } from "@/lib/auth";
import { accountIdLine } from "@/services/party";
import { messageOf } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { usePublisher } from "../layout";
import { twoFactorService, type TwoFactorStatus } from "@/services/auth";
import { describeSession, kycLabel, maskedPhone, NOTIFICATION_SWITCHES, publisherWorkspace, relativeTime, sessionPlace, type AccountMe, type DeviceSession, type NotificationPreference, type PublisherProfile } from "@/services/publisher-workspace";

interface Loaded {
    profile: PublisherProfile;
    me: AccountMe;
}

async function readProfile(): Promise<Loaded> {
    const [profile, me] = await Promise.all([publisherWorkspace.profile(), publisherWorkspace.me()]);
    return { profile, me };
}

/**
 * DR 12 · 10 · 16 · Business profile (5204:86665) — since 29 Sep 2026 the
 * publisher's one settings page (the owner: "Sure, go ahead with further
 * cleanup"); Settings & privacy is folded in and its route sends here.
 * Three sections under the frame's heading:
 *
 * - Profile — the frame's Profile card (the business's name, email and
 *   phone), where the business is, the custom fields and the business
 *   verification; beside them the person behind the account (picture, two
 *   names, date of birth, gender), the email and other contacts, the
 *   sign-in number and the language.
 * - Notifications — the frame's booking emails over every kind on every
 *   channel, with quiet hours.
 * - Privacy & security — the frame's password, sign-in security and
 *   sessions cards; the privacy switches, Download my data and Close my
 *   account; agent access.
 *
 * Verification (the KYC ladder) keeps its own page under this one.
 */
export default function ProfilePage() {
    const publisher = usePublisher();
    const { refresh } = useAuth();
    const { data, error, loading, reload } = useLoad("profile", readProfile);

    if (!data && loading) return <Loading label="Loading your profile…" />;
    if (!data) return <ErrorNote message={error ?? "Could not read your profile."} onRetry={reload} />;

    const name = data.profile.name || publisher?.name || "";
    const saved = () => {
        reload();
        void refresh();
    };

    return (
        <>
            <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight text-ink">
                Business profile
                {(data.profile.verified ?? data.profile.kycStatus === "VERIFIED") && <BadgeCheck className="size-5 text-success" aria-label="KYC verified" />}
            </h1>
            <p className="mt-1 text-sm text-dim">
                {name}
                {data.profile.displayId ? ` · ${accountIdLine("PUBLISHER", data.profile.displayId)}` : ""} · contact details, address, security and notifications
            </p>

            <React.Suspense fallback={<Loading label="Loading your profile…" />}>
                <SettingsSections
                    panels={{
                        profile: <ProfileSection data={data} onSaved={saved} />,
                        notifications: <NotificationsSettings quick={({ refreshKey, onChanged }) => <QuickSwitches refreshKey={refreshKey} onChanged={onChanged} />} />,
                        privacy: <PrivacySecuritySection me={data.me} onChanged={saved} />,
                    }}
                />
            </React.Suspense>
        </>
    );
}

function ProfileSection({ data, onSaved }: { data: Loaded; onSaved: () => void }) {
    const kyc = kycLabel(data.profile.kycStatus);
    return (
        <div className="grid gap-6 lg:grid-cols-[1fr_0.94fr]">
            <div className="grid content-start gap-6">
                <ProfileCard profile={data.profile} accountEmail={data.me.email} onSaved={onSaved} />

                <BusinessDetailsCard
                    key={`${data.profile.address ?? ""}|${data.profile.latitude ?? ""}|${data.profile.city ?? ""}|${data.profile.state ?? ""}|${data.profile.postalCode ?? ""}|${data.profile.gstin ?? ""}|${data.profile.contactName ?? ""}|${data.profile.contactMobile ?? ""}|${data.profile.contactEmail ?? ""}`}
                    profile={data.profile}
                    onSaved={onSaved}
                />

                {/* CF-1: the custom fields Settings › Custom fields shows on the website for a publisher. */}
                <CustomFieldsSection entity="PUBLISHER" entityId={data.profile.id} />

                <Panel className="p-0">
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-6 py-4">
                        <CardTitle>Business verification</CardTitle>
                        <Chip tone={kyc.tone}>{kyc.label}</Chip>
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4">
                        <p className="text-sm text-dim">{data.profile.kycStatus === "VERIFIED" ? "Your business is verified. Bookings pay out to your account without a hold." : "Verify your business to publish spaces and receive payouts."}</p>
                        <Link href="/publisher/profile/verify" className={outlineButton}>
                            {data.profile.kycStatus === "VERIFIED" ? "View verification" : "Verify your business"}
                        </Link>
                    </div>
                </Panel>
            </div>

            {/* The person behind the account — the names, and the date of birth an order asks for (never a listing). */}
            <PersonSettings />
        </div>
    );
}

/** The frame's booking emails, read again whenever the matrix under them saves. */
function QuickSwitches({ refreshKey, onChanged }: { refreshKey: number; onChanged: () => void }) {
    const [preferences, setPreferences] = React.useState<NotificationPreference[] | null>(null);
    const read = React.useCallback(() => {
        publisherWorkspace
            .notificationPreferences()
            .then(setPreferences)
            .catch(() => setPreferences((current) => current ?? []));
    }, []);
    React.useEffect(() => {
        read();
    }, [read, refreshKey]);
    if (!preferences) return <Loading label="Loading your notification settings…" />;
    return (
        <NotificationsCard
            preferences={preferences}
            onChanged={() => {
                read();
                onChanged();
            }}
        />
    );
}

async function readSecurity(): Promise<{ sessions: DeviceSession[]; twoFactor: TwoFactorStatus | null }> {
    const [sessions, twoFactor] = await Promise.all([publisherWorkspace.sessions().catch(() => [] as DeviceSession[]), twoFactorService.status().catch(() => null as TwoFactorStatus | null)]);
    return { sessions, twoFactor };
}

function PrivacySecuritySection({ me, onChanged }: { me: AccountMe; onChanged: () => void }) {
    const { data, reload } = useLoad("profile-security", readSecurity);

    return (
        <div className="grid gap-6 lg:grid-cols-[1fr_0.94fr]">
            <div className="grid content-start gap-6">
                <PasswordCard me={me} onChanged={onChanged} />

                <div id="security" className="scroll-mt-24">
                    <Panel className="p-0">
                        <div className="border-b border-line px-6 py-4">
                            <CardTitle>Security</CardTitle>
                            <p className="mt-1 text-sm text-dim">Protect your publisher account at sign-in</p>
                        </div>
                        <div className="px-6 py-4">
                            <div className="flex items-start justify-between gap-4">
                                <div className="flex items-start gap-3">
                                    <span className="flex size-8 items-center justify-center rounded-md bg-success-soft text-success">
                                        <ShieldCheck className="size-4" aria-hidden />
                                    </span>
                                    <div>
                                        <p className="text-sm font-medium text-ink">One-time code to your phone or email</p>
                                        <p className="text-xs text-dim">Every sign-in asks for a code — to {maskedPhone(me.mobile)} or your email</p>
                                    </div>
                                </div>
                                <Chip tone="success">On</Chip>
                            </div>
                            {/* 2FA-A: the authenticator app, the same body the advertiser's account page draws. */}
                            {data ? (
                                <AuthenticatorSetup status={data.twoFactor} onChanged={reload} sideLabel="publisher account" className="mt-4 border-t border-line pt-4" />
                            ) : (
                                <p className="mt-4 border-t border-line pt-4 text-sm text-dim">Loading…</p>
                            )}
                        </div>
                    </Panel>
                </div>

                <div id="sessions" className="scroll-mt-24">
                    {data ? <SessionsCard sessions={data.sessions} onChanged={reload} /> : <Loading label="Loading your sessions…" />}
                </div>
            </div>

            <div className="grid content-start gap-6">
                <PrivacySection party="PUBLISHER" />
                <PublisherAgentAccess />
            </div>
        </div>
    );
}

/* Profile — `PATCH /publishers/me` for the name and email. */
function ProfileCard({ profile, accountEmail, onSaved }: { profile: PublisherProfile; accountEmail: string | null; onSaved: () => void }) {
    /* 28 Sep 2026: never ask twice — a row still named after the number opens blank, and one without an email opens with the account's proven address. */
    const [name, setName] = React.useState(profile.name && profile.name !== profile.mobile ? profile.name : "");
    const [email, setEmail] = React.useState(profile.email ?? accountEmail ?? "");
    const [busy, setBusy] = React.useState(false);
    const dirty = name.trim() !== (profile.name ?? "") || email.trim() !== (profile.email ?? "");

    const save = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!name.trim()) return toast.error("The business name cannot be empty.");
        setBusy(true);
        try {
            await publisherWorkspace.updateProfile({ name: name.trim(), ...(email.trim() ? { email: email.trim() } : {}) });
            toast.success("Profile saved");
            onSaved();
        } catch (caught) {
            toast.error(messageOf(caught, "Could not save the profile."));
        } finally {
            setBusy(false);
        }
    };

    return (
        <Panel className="p-0">
            <div className="border-b border-line px-6 py-4">
                <CardTitle>Profile</CardTitle>
            </div>
            <form onSubmit={save} className="grid gap-5 px-6 py-5 md:grid-cols-2">
                <Field label="Business name" htmlFor="p-name">
                    <input id="p-name" value={name} onChange={(e) => setName(e.target.value)} className={inputClass} autoComplete="organization" />
                </Field>
                <Field label="Email" htmlFor="p-email">
                    <input id="p-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} placeholder="hello@yourbusiness.example" autoComplete="email" />
                </Field>
                <Field label="Phone" htmlFor="p-phone">
                    <input id="p-phone" value={maskedPhone(profile.mobile)} readOnly disabled className={inputClass} />
                </Field>
                <Field label="Role">
                    <p className="flex h-10 items-center text-sm text-dim">Business owner · {profile.name || "your"} publisher account</p>
                </Field>
                {dirty && (
                    <div className="md:col-span-2">
                        <button type="submit" disabled={busy} className={brandButton}>
                            {busy ? "Saving…" : "Save changes"}
                        </button>
                    </div>
                )}
            </form>
        </Panel>
    );
}

/*
 * QR-5: where the business is — the address, the city, the state and the
 * PIN — and, for a business or organisation, its GSTIN and the contact
 * person. `PATCH /publishers/me`, only what changed. The address is one of
 * the basics a listing needs, and the meeting place an accepted booking
 * sends the agent to. Onboarding addresses (the owner, 1 Oct 2026): the
 * "Find the address" bar over plain boxes, no map; a pick's coordinates
 * ride along with the save, never shown.
 */
function BusinessDetailsCard({ profile, onSaved }: { profile: PublisherProfile; onSaved: () => void }) {
    const business = (profile.type ?? "INDIVIDUAL") !== "INDIVIDUAL";
    const [address, setAddress] = React.useState(profile.address ?? "");
    const [city, setCity] = React.useState(profile.city ?? "");
    const [state, setState] = React.useState(profile.state ?? "");
    const [postalCode, setPostalCode] = React.useState(profile.postalCode ?? "");
    /* The coordinates of a place picked in the bar this visit — sent with the save, never shown. */
    const [point, setPoint] = React.useState<{ latitude: number; longitude: number } | null>(null);
    const near = React.useMemo(() => point ?? (typeof profile.latitude === "number" && typeof profile.longitude === "number" ? { latitude: profile.latitude, longitude: profile.longitude } : null), [point, profile.latitude, profile.longitude]);
    const [gstin, setGstin] = React.useState(profile.gstin ?? "");
    const [contactName, setContactName] = React.useState(profile.contactName ?? "");
    const [contactMobile, setContactMobile] = React.useState(profile.contactMobile ?? "");
    const [contactEmail, setContactEmail] = React.useState(profile.contactEmail ?? "");
    const [errors, setErrors] = React.useState<Record<string, string>>({});
    const [busy, setBusy] = React.useState(false);

    const form = { address, city, state, postalCode, gstin, contactName, contactMobile, contactEmail, point };
    const dirty = Object.keys(businessPatch(profile, form).patch).length > 0;

    const save = async (event: React.FormEvent) => {
        event.preventDefault();
        const result = businessPatch(profile, form);
        setErrors(result.errors);
        if (Object.keys(result.errors).length > 0 || Object.keys(result.patch).length === 0) return;
        setBusy(true);
        try {
            await publisherWorkspace.updateProfile(result.patch);
            toast.success("Business details saved");
            onSaved();
        } catch (caught) {
            toast.error(messageOf(caught, "Could not save the business details."));
        } finally {
            setBusy(false);
        }
    };

    const firstError = Object.values(errors)[0] ?? null;

    return (
        <Panel className="p-0">
            <div className="border-b border-line px-6 py-4">
                <CardTitle>{business ? "Business details" : "Where you are"}</CardTitle>
                <p className="mt-1 text-sm text-dim">Your address is where ADX sends an agent for an accepted booking, and one of the details a listing needs.</p>
            </div>
            <form onSubmit={save} className="grid gap-3 px-6 py-5">
                <AddressFinder id="publisher-address" near={near} onPlace={(place) => fillFromPlace(place, { address: setAddress, city: setCity, state: setState, postalCode: setPostalCode, point: setPoint })} />
                <FloatingField id="publisher-address-line" label="Address" value={address} onChange={setAddress} placeholder={ADDRESS_LINE_PLACEHOLDER} autoComplete="street-address" />
                <Row>
                    <CityField value={city} onChange={setCity} />
                    <FloatingField label="State" value={state} onChange={setState} placeholder="Karnataka" autoComplete="address-level1" />
                </Row>
                <Row>
                    <FloatingField id="publisher-postal-code" label="PIN code" value={postalCode} onChange={(v) => setPostalCode(v.replace(/\D/g, "").slice(0, 6))} placeholder={PIN_PLACEHOLDER} inputMode="numeric" autoComplete="postal-code" />
                </Row>
                {business && (
                    <>
                        <p className="pt-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-dim">Your business</p>
                        <FloatingField label="GSTIN · optional" value={gstin} onChange={(v) => setGstin(v.toUpperCase().slice(0, 15))} placeholder="22AAAAA0000A1Z5" />
                        <Row>
                            <FloatingField label="Contact person" value={contactName} onChange={setContactName} placeholder="Who ADX should ask for" />
                            <FloatingField label="Their mobile number" value={contactMobile} onChange={(v) => setContactMobile(v.replace(/[^\d+]/g, "").slice(0, 13))} placeholder="98XXXXXX10" type="tel" inputMode="tel" />
                        </Row>
                        <FloatingField label="Their email" value={contactEmail} onChange={setContactEmail} placeholder="bookings@yourbusiness.example" type="email" />
                    </>
                )}
                {firstError && (
                    <p role="alert" className="text-sm text-danger">
                        {firstError}
                    </p>
                )}
                <div className="flex items-center justify-between gap-3 pt-2">
                    <p className="text-xs text-dim">{dirty ? "Unsaved changes" : "Saved details"}</p>
                    <button type="submit" disabled={busy || !dirty} className={brandButton}>
                        {busy ? "Saving…" : "Save details"}
                    </button>
                </div>
            </form>
        </Panel>
    );
}

/* Active sessions — `GET /users/me/sessions`, `DELETE …/:id`, `DELETE …` for the rest. */
function SessionsCard({ sessions, onChanged }: { sessions: DeviceSession[]; onChanged: () => void }) {
    const [busy, setBusy] = React.useState<string | null>(null);
    const ordered = [...sessions.filter((s) => s.current), ...sessions.filter((s) => !s.current)];
    const others = sessions.filter((s) => !s.current).length;

    const revoke = async (id: string) => {
        setBusy(id);
        try {
            await publisherWorkspace.revokeSession(id);
            toast.success("Device signed out");
            onChanged();
        } catch (caught) {
            toast.error(messageOf(caught, "Could not sign that device out."));
        } finally {
            setBusy(null);
        }
    };

    const revokeAll = async () => {
        if (!window.confirm("Sign out every other device? This one stays signed in.")) return;
        setBusy("all");
        try {
            const result = await publisherWorkspace.revokeOtherSessions();
            toast.success(result.revoked === 0 ? "No other devices were signed in" : `${result.revoked} device${result.revoked === 1 ? "" : "s"} signed out`);
            onChanged();
        } catch (caught) {
            toast.error(messageOf(caught, "Could not sign the other devices out."));
        } finally {
            setBusy(null);
        }
    };

    return (
        <Panel className="p-0">
            <div className="border-b border-line px-6 py-4">
                <CardTitle>Active sessions</CardTitle>
            </div>
            <div className="px-6 py-2">
                {ordered.length === 0 && <p className="py-3 text-sm text-dim">Sessions could not be read.</p>}
                {ordered.map((session) => {
                    const device = describeSession(session.userAgent);
                    return (
                        <div key={session.id} className="flex items-center gap-3 border-b border-line py-3 last:border-b-0">
                            <span className="flex size-9 items-center justify-center rounded-md bg-ground text-dim">{device.kind === "phone" ? <Smartphone className="size-4" aria-hidden /> : <Laptop className="size-4" aria-hidden />}</span>
                            <div className="min-w-0 flex-1">
                                <p className="text-sm font-semibold text-ink">
                                    {device.name}
                                    {device.platform ? ` on ${device.platform}` : ""}
                                    {session.current && <span className="ml-2 text-[11px] font-medium text-success">This device</span>}
                                </p>
                                <p className="truncate text-xs text-dim">
                                    {[session.ipAddress ?? "Unknown network", sessionPlace(session), relativeTime(session.lastUsedAt ?? session.createdAt)].filter(Boolean).join(" · ")}
                                </p>
                            </div>
                            {!session.current && (
                                <button type="button" onClick={() => revoke(session.id)} disabled={busy !== null} className="text-sm font-medium text-brand-bright hover:underline disabled:opacity-50">
                                    {busy === session.id ? "Signing out…" : "Revoke"}
                                </button>
                            )}
                        </div>
                    );
                })}
            </div>
            {others > 0 && (
                <div className="px-6 pb-5 pt-2">
                    <button type="button" onClick={revokeAll} disabled={busy !== null} className="rounded-md border border-brand-bright/40 px-3 py-1.5 text-xs font-medium text-brand-bright hover:bg-brand-soft disabled:opacity-50">
                        Revoke all other sessions
                    </button>
                </div>
            )}
        </Panel>
    );
}

/* Password — `POST /auth/change-password`; doubles as "set a password" on an account without one. */
function PasswordCard({ me, onChanged }: { me: AccountMe; onChanged: () => void }) {
    const [open, setOpen] = React.useState(false);
    const [current, setCurrent] = React.useState("");
    const [next, setNext] = React.useState("");
    const [again, setAgain] = React.useState("");
    const [busy, setBusy] = React.useState(false);
    const [failure, setFailure] = React.useState<string | null>(null);
    const has = me.hasPassword === true;

    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        setFailure(null);
        if (next.length < 8) return setFailure("Use at least 8 characters.");
        if (next !== again) return setFailure("The two passwords do not match.");
        setBusy(true);
        try {
            await publisherWorkspace.changePassword({ ...(has ? { currentPassword: current } : {}), newPassword: next });
            toast.success(has ? "Password changed" : "Password set");
            setOpen(false);
            setCurrent("");
            setNext("");
            setAgain("");
            onChanged();
        } catch (caught) {
            setFailure(messageOf(caught, "Could not change the password."));
        } finally {
            setBusy(false);
        }
    };

    return (
        <Panel className="p-0">
            <div className="border-b border-line px-6 py-4">
                <CardTitle>Password</CardTitle>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4">
                <div>
                    <p className="text-sm font-semibold text-ink">Password</p>
                    <p className="text-xs text-dim">{has ? "Set · used with your email to sign in" : "Not set · you sign in with a one-time code"}</p>
                </div>
                <button type="button" onClick={() => setOpen(true)} className={cn(outlineButton, "h-9 px-4")}>
                    {has ? "Change password" : "Set a password"}
                </button>
            </div>
            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent className="max-w-[440px] rounded-lg border-line p-6">
                    <DialogHeader>
                        <DialogTitle className="text-lg font-semibold text-ink">{has ? "Change password" : "Set a password"}</DialogTitle>
                        <DialogDescription className="text-sm text-dim">At least 8 characters. Signing in with your phone number and a code keeps working either way.</DialogDescription>
                    </DialogHeader>
                    <form onSubmit={submit} className="grid gap-4">
                        {has && (
                            <Field label="Current password" htmlFor="pw-current">
                                <input id="pw-current" type="password" value={current} onChange={(e) => setCurrent(e.target.value)} className={inputClass} autoComplete="current-password" required />
                            </Field>
                        )}
                        <Field label="New password" htmlFor="pw-next">
                            <input id="pw-next" type="password" value={next} onChange={(e) => setNext(e.target.value)} className={inputClass} autoComplete="new-password" required minLength={8} />
                        </Field>
                        <Field label="Repeat new password" htmlFor="pw-again">
                            <input id="pw-again" type="password" value={again} onChange={(e) => setAgain(e.target.value)} className={inputClass} autoComplete="new-password" required minLength={8} />
                        </Field>
                        {failure && (
                            <p role="alert" className="text-sm text-danger">
                                {failure}
                            </p>
                        )}
                        <div className="flex justify-end gap-3">
                            <button type="button" onClick={() => setOpen(false)} className={outlineButton}>
                                Cancel
                            </button>
                            <button type="submit" disabled={busy} className={brandButton}>
                                {busy ? "Saving…" : "Save password"}
                            </button>
                        </div>
                    </form>
                </DialogContent>
            </Dialog>
        </Panel>
    );
}

/* Notification preferences — the EMAIL channel of three kinds, over `PUT /notifications/preferences`. */
function NotificationsCard({ preferences, onChanged }: { preferences: NotificationPreference[]; onChanged: () => void }) {
    const [busy, setBusy] = React.useState<string | null>(null);
    const enabledFor = (type: NotificationPreference["type"]) => preferences.find((p) => p.type === type && p.channel === "EMAIL")?.enabled ?? true;

    const toggle = async (row: (typeof NOTIFICATION_SWITCHES)[number], enabled: boolean) => {
        if (!row.type) return;
        setBusy(row.key);
        try {
            await publisherWorkspace.saveNotificationPreferences([{ type: row.type, channel: "EMAIL", enabled }]);
            toast.success(enabled ? `${row.label} on` : `${row.label} off`);
            onChanged();
        } catch (caught) {
            toast.error(messageOf(caught, "Could not save the preference."));
        } finally {
            setBusy(null);
        }
    };

    return (
        <Panel className="p-0">
            <div className="border-b border-line px-6 py-4">
                <CardTitle>Notification preferences</CardTitle>
            </div>
            <div className="px-6 py-2">
                {NOTIFICATION_SWITCHES.map((row) => {
                    const available = row.type !== null && preferences.length > 0;
                    return (
                        <div key={row.key} className="flex items-center justify-between gap-4 py-3.5">
                            <div>
                                <p className="text-sm font-semibold text-ink">{row.label}</p>
                                <p className="text-xs text-dim">
                                    {row.hint}
                                    {row.type === null && " · not available yet"}
                                </p>
                            </div>
                            <Switch checked={available ? enabledFor(row.type!) : false} disabled={!available || busy === row.key} onCheckedChange={(checked) => void toggle(row, checked)} aria-label={row.label} className="data-[state=checked]:bg-brand" />
                        </div>
                    );
                })}
            </div>
        </Panel>
    );
}
