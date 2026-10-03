"use client";

import * as React from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight, Laptop, Smartphone } from "lucide-react";
import { messageOf } from "@/lib/api-client";
import { useAuth } from "@/lib/auth";
import { Switch } from "@/components/ui/switch";
import { AuthenticatorSetup } from "@/components/auth/authenticator-setup";
import { ADDRESS_LINE_PLACEHOLDER, AddressFinder, fillFromPlace, PIN_PATTERN, PIN_PLACEHOLDER } from "@/components/listing-form/address-search";
import { btnSmall, HeaderCard, inputClass, StatusChip } from "@/components/advertiser/bits";
import { EMAIL_CODE_LENGTH, normaliseCode } from "@/services/auth";
import {
    advertiserWorkspace,
    companyNameOf,
    describeSession,
    groupEnabled,
    groupRows,
    kycLabel,
    maskPhone,
    orderSessions,
    PREFERENCE_GROUPS,
    relativeTime,
    sessionPlace,
    type AdvertiserKyc,
    type AdvertiserProfile,
    type DeviceSession,
    type NotificationPreference,
    type TwoFactorStatus,
    type UserProfile,
} from "@/services/advertiser-workspace";
import { ACCOUNT_ID_LABEL, ADX_ID_LABEL } from "@/services/party";
import { nameParts, namesPatch } from "@/services/account";

/* ------------------------------------------------------------------ */
/* Profile                                                             */
/* ------------------------------------------------------------------ */

/**
 * Frame 09's Profile card: the name (`PATCH /users/me`), the email proved
 * with a code (`POST /users/me/email/send-code` → `/verify`), the masked
 * phone, and the role line. 29 Sep 2026: the frame's "Full name" is asked
 * as the two names the account keeps — saved together, the display name
 * composed from them by the server — so it can never drift from them.
 */
export function ProfileCard({ profile, advertiser, onChanged }: { profile: UserProfile; advertiser: AdvertiserProfile | null; onChanged: () => void }) {
    const { refresh } = useAuth();
    const savedNames = React.useMemo(() => nameParts(profile), [profile]);
    const [firstName, setFirstName] = React.useState(savedNames.firstName);
    const [lastName, setLastName] = React.useState(savedNames.lastName);
    const [email, setEmail] = React.useState(profile.email ?? "");
    const [code, setCode] = React.useState("");
    const [sent, setSent] = React.useState<{ email: string; devOtp?: string; resendAfterSeconds: number } | null>(null);
    const [busy, setBusy] = React.useState<null | "name" | "send" | "verify">(null);
    const [note, setNote] = React.useState<{ tone: "ok" | "bad"; text: string } | null>(null);

    const names = namesPatch(savedNames, { firstName, lastName });
    const nameChanged = Object.keys(names).length > 0;
    const emailChanged = email.trim().toLowerCase() !== (profile.email ?? "").trim().toLowerCase();
    const verified = !!profile.emailVerifiedAt && !emailChanged && !!profile.email;

    const saveName = async () => {
        setBusy("name");
        setNote(null);
        try {
            await advertiserWorkspace.updateProfile(names);
            setNote({ tone: "ok", text: "Name saved." });
            onChanged();
            void refresh();
        } catch (caught) {
            setNote({ tone: "bad", text: messageOf(caught, "Could not save the name.") });
        } finally {
            setBusy(null);
        }
    };

    const sendCode = async () => {
        setBusy("send");
        setNote(null);
        try {
            const answer = await advertiserWorkspace.sendEmailCode(email.trim());
            setSent({ email: answer.email ?? email.trim(), devOtp: answer.devOtp, resendAfterSeconds: answer.resendAfterSeconds });
            setCode(answer.devOtp ?? "");
            setNote({ tone: "ok", text: `We sent an ${EMAIL_CODE_LENGTH}-letter code to ${answer.email ?? email.trim()}.` });
        } catch (caught) {
            setNote({ tone: "bad", text: messageOf(caught, "Could not send the code.") });
        } finally {
            setBusy(null);
        }
    };

    const verify = async () => {
        if (!sent) return;
        setBusy("verify");
        setNote(null);
        try {
            await advertiserWorkspace.verifyEmail(sent.email, code.trim());
            setSent(null);
            setCode("");
            setNote({ tone: "ok", text: "Email verified." });
            onChanged();
        } catch (caught) {
            setNote({ tone: "bad", text: messageOf(caught, "That code did not match.") });
        } finally {
            setBusy(null);
        }
    };

    return (
        <HeaderCard title="Profile">
            <div className="grid gap-x-4 gap-y-5 md:grid-cols-2">
                <Field label="First name" htmlFor="account-first-name">
                    <input id="account-first-name" value={firstName} onChange={(e) => setFirstName(e.target.value)} className={inputClass} maxLength={60} autoComplete="given-name" />
                </Field>
                <Field label="Last name" htmlFor="account-last-name">
                    <div className="flex gap-2">
                        <input id="account-last-name" value={lastName} onChange={(e) => setLastName(e.target.value)} className={inputClass} maxLength={60} autoComplete="family-name" />
                        {nameChanged && (
                            <button type="button" onClick={() => void saveName()} className={btnSmall} disabled={busy !== null}>
                                {busy === "name" ? "Saving…" : "Save"}
                            </button>
                        )}
                    </div>
                </Field>
                <Field label="Email" trailing={verified ? <StatusChip label="Verified" tone="success" /> : null}>
                    <div className="flex gap-2">
                        <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="Add your email" className={inputClass} />
                        {!verified && (
                            <button type="button" onClick={() => void sendCode()} className={`${btnSmall} whitespace-nowrap`} disabled={busy !== null || !/^\S+@\S+\.\S+$/.test(email.trim())}>
                                {busy === "send" ? "Sending…" : sent ? "Resend" : "Verify"}
                            </button>
                        )}
                    </div>
                    {sent && (
                        <div className="mt-2 flex gap-2">
                            <input value={code} onChange={(e) => setCode(normaliseCode(e.target.value, "email").slice(0, EMAIL_CODE_LENGTH))} inputMode="text" autoCapitalize="characters" autoCorrect="off" spellCheck={false} placeholder={`${EMAIL_CODE_LENGTH}-letter code`} className={`${inputClass} uppercase tracking-widest`} aria-label="Verification code" />
                            <button type="button" onClick={() => void verify()} className={`${btnSmall} whitespace-nowrap`} disabled={busy !== null || code.length !== EMAIL_CODE_LENGTH}>
                                {busy === "verify" ? "Checking…" : "Confirm"}
                            </button>
                        </div>
                    )}
                </Field>
                <Field label="Phone">
                    <input value={maskPhone(profile.mobile)} readOnly disabled className={inputClass} aria-describedby="phone-note" />
                </Field>
                <Field label="Role">
                    <p className="pt-2.5 text-sm text-dim">Account owner{advertiser?.name ? ` · ${advertiser.name}` : ""}</p>
                </Field>
                {/* 28 Sep 2026: the person's one id; the advertiser account's is named as the account's. */}
                <Field label={ADX_ID_LABEL}>
                    <p className="pt-2.5 text-sm font-semibold text-ink">{profile.displayId ?? "—"}</p>
                </Field>
                <Field label={ACCOUNT_ID_LABEL.ADVERTISER}>
                    <p className="pt-2.5 text-sm text-dim">{advertiser?.displayId ?? "—"}</p>
                </Field>
            </div>
            <p id="phone-note" className="mt-4 text-xs text-dim">
                Your phone is the number you sign in with. {note && <span className={note.tone === "ok" ? "text-success" : "text-danger"}>{note.text}</span>}
            </p>
        </HeaderCard>
    );
}

/* ------------------------------------------------------------------ */
/* Billing details                                                     */
/* ------------------------------------------------------------------ */

/**
 * The company and billing details ADX prints on every invoice — `PATCH
 * /advertisers/:id`. Onboarding addresses (the owner, 1 Oct 2026): the
 * "Find the address" bar over plain boxes — the address, City | State,
 * PIN | Country. A billing address takes no coordinates.
 */
export function BillingDetailsCard({ advertiser, kyc, onChanged }: { advertiser: AdvertiserProfile; kyc: AdvertiserKyc | null; onChanged: () => void }) {
    const [form, setForm] = React.useState({
        companyName: companyNameOf(advertiser),
        gstin: advertiser.gstin ?? "",
        billingAddress: advertiser.billingAddress ?? "",
        city: advertiser.city ?? "",
        state: advertiser.state ?? "",
        /* AD-1: the PIN and the country, their own fields on the row. */
        postalCode: advertiser.postalCode ?? "",
        country: advertiser.country ?? "",
    });
    const [busy, setBusy] = React.useState(false);
    const [note, setNote] = React.useState<{ tone: "ok" | "bad"; text: string } | null>(null);
    const individual = advertiser.type === "INDIVIDUAL";
    const verification = kycLabel(advertiser.kycStatus, !!kyc);

    const changed = (Object.keys(form) as (keyof typeof form)[]).some((key) => form[key].trim() !== ((advertiser[key] as string | null) ?? ""));

    const pinInvalid = !!form.postalCode.trim() && !PIN_PATTERN.test(form.postalCode.trim());

    const save = async () => {
        if (pinInvalid) {
            setNote({ tone: "bad", text: "A PIN code has six digits." });
            return;
        }
        setBusy(true);
        setNote(null);
        try {
            const patch: Record<string, string | null> = {};
            for (const key of Object.keys(form) as (keyof typeof form)[]) {
                const value = form[key].trim();
                const before = (advertiser[key] as string | null | undefined) ?? "";
                if (value === before) continue;
                /* AD-1: the PIN and the country may be cleared; the rest is only ever replaced. */
                if (!value && (key === "postalCode" || key === "country")) patch[key] = null;
                else if (value) patch[key] = key === "gstin" ? value.toUpperCase() : value;
            }
            if (Object.keys(patch).length) await advertiserWorkspace.updateAdvertiser(advertiser.id, patch);
            setNote({ tone: "ok", text: "Billing details saved. New invoices use them." });
            onChanged();
        } catch (caught) {
            setNote({ tone: "bad", text: messageOf(caught, "Could not save the billing details.") });
        } finally {
            setBusy(false);
        }
    };

    const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [key]: e.target.value }));

    return (
        <HeaderCard
            id="billing"
            title="Billing details"
            line="Printed on every invoice ADX issues to you"
            actions={
                <Link href="/advertiser/verify" className="inline-flex items-center gap-1 rounded-md hover:opacity-80" aria-label={`Verification: ${verification.label}. Open Verification`}>
                    <StatusChip label={`Verification · ${verification.label}`} tone={verification.tone} />
                    <ChevronRight className="size-4 text-dim" aria-hidden />
                </Link>
            }
        >
            <div className="grid gap-x-4 gap-y-5 md:grid-cols-2">
                {!individual && (
                    <Field label="Company name">
                        <input value={form.companyName} onChange={set("companyName")} className={inputClass} maxLength={160} />
                    </Field>
                )}
                <Field label="GSTIN">
                    <input value={form.gstin} onChange={set("gstin")} className={`${inputClass} uppercase`} placeholder="29ABCDE1234F1Z5" maxLength={15} />
                </Field>
                {/* The bar fills the boxes under it — the line, city, state, PIN and country the place names; never a pin. */}
                <AddressFinder
                    id="billing"
                    className="md:col-span-2"
                    onPlace={(place) =>
                        fillFromPlace(place, {
                            address: (billingAddress) => setForm((f) => ({ ...f, billingAddress })),
                            city: (city) => setForm((f) => ({ ...f, city })),
                            state: (state) => setForm((f) => ({ ...f, state })),
                            postalCode: (postalCode) => setForm((f) => ({ ...f, postalCode })),
                            country: (country) => setForm((f) => ({ ...f, country })),
                        })
                    }
                />
                <Field label="Billing address" htmlFor="billing-address" className="md:col-span-2">
                    <input id="billing-address" value={form.billingAddress} onChange={set("billingAddress")} placeholder={ADDRESS_LINE_PLACEHOLDER} autoComplete="street-address" className={inputClass} maxLength={400} />
                </Field>
                <Field label="City" htmlFor="billing-city">
                    <input id="billing-city" value={form.city} onChange={set("city")} autoComplete="address-level2" className={inputClass} maxLength={80} />
                </Field>
                <Field label="State" htmlFor="billing-state">
                    <input id="billing-state" value={form.state} onChange={set("state")} autoComplete="address-level1" className={inputClass} maxLength={80} />
                </Field>
                <Field label="PIN code" htmlFor="billing-postal-code">
                    <input id="billing-postal-code" value={form.postalCode} onChange={(e) => setForm((f) => ({ ...f, postalCode: e.target.value.replace(/\D/g, "").slice(0, 6) }))} inputMode="numeric" autoComplete="postal-code" placeholder={PIN_PLACEHOLDER} className={`${inputClass} ${pinInvalid ? "border-danger" : ""}`} maxLength={6} />
                </Field>
                <Field label="Country" htmlFor="billing-country">
                    <input id="billing-country" value={form.country} onChange={set("country")} autoComplete="country-name" placeholder="India" className={inputClass} maxLength={60} />
                </Field>
            </div>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs text-dim">
                    {verification.label === "Verified" ? (
                        "Your account is verified."
                    ) : (
                        <>
                            A paid campaign goes live once your business is verified.{" "}
                            <Link href="/advertiser/verify" className="font-medium text-ink underline underline-offset-4 hover:text-brand">
                                Verify now
                            </Link>
                        </>
                    )}
                    {note && <span className={`ml-1 ${note.tone === "ok" ? "text-success" : "text-danger"}`}>{note.text}</span>}
                </p>
                <button type="button" onClick={() => void save()} className={btnSmall} disabled={busy || !changed}>
                    {busy ? "Saving…" : "Save billing details"}
                </button>
            </div>
        </HeaderCard>
    );
}

/* ------------------------------------------------------------------ */
/* Sessions                                                            */
/* ------------------------------------------------------------------ */

/** Active sessions: `GET /users/me/sessions`, `DELETE …/:id`, `DELETE …` (every other device). */
export function SessionsCard({ sessions, onChanged }: { sessions: DeviceSession[]; onChanged: () => void }) {
    const [busy, setBusy] = React.useState<string | null>(null);
    const [note, setNote] = React.useState<string | null>(null);
    const ordered = orderSessions(sessions);
    const others = ordered.filter((s) => !s.current).length;

    const revoke = async (id: string | null) => {
        setBusy(id ?? "all");
        setNote(null);
        try {
            if (id) await advertiserWorkspace.revokeSession(id);
            else {
                const answer = await advertiserWorkspace.revokeOtherSessions();
                setNote(`${answer.revoked} other session${answer.revoked === 1 ? "" : "s"} signed out.`);
            }
            onChanged();
        } catch (caught) {
            setNote(messageOf(caught, "Could not sign that device out."));
        } finally {
            setBusy(null);
        }
    };

    return (
        <HeaderCard title="Active sessions">
            <ul className="divide-y divide-line">
                {ordered.map((session) => {
                    const device = describeSession(session.userAgent);
                    const mobile = device.badge === "Android" || device.badge === "iPhone";
                    return (
                        <li key={session.id} className="flex items-center gap-3 py-3 first:pt-0">
                            <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-ground text-dim">{mobile ? <Smartphone className="size-4" aria-hidden /> : <Laptop className="size-4" aria-hidden />}</span>
                            <div className="min-w-0 flex-1">
                                <p className="text-sm font-medium text-ink">
                                    {device.name}
                                    {device.badge ? ` · ${device.badge}` : ""}
                                    {session.current ? " · This device" : ""}
                                </p>
                                <p className="text-xs text-dim">{[session.ipAddress, sessionPlace(session), relativeTime(session.lastUsedAt ?? session.createdAt)].filter(Boolean).join(" · ")}</p>
                            </div>
                            {!session.current && (
                                <button type="button" onClick={() => void revoke(session.id)} className="text-sm font-medium text-brand-bright hover:underline disabled:opacity-50" disabled={busy !== null}>
                                    {busy === session.id ? "Revoking…" : "Revoke"}
                                </button>
                            )}
                        </li>
                    );
                })}
                {ordered.length === 0 && <li className="py-2 text-sm text-dim">No sessions to show.</li>}
            </ul>
            <div className="mt-4 flex flex-wrap items-center gap-3">
                <button type="button" onClick={() => void revoke(null)} className={`${btnSmall} text-brand-bright`} disabled={busy !== null || others === 0}>
                    {busy === "all" ? "Signing out…" : "Revoke all other sessions"}
                </button>
                {note && <p className="text-xs text-dim">{note}</p>}
            </div>
        </HeaderCard>
    );
}

/* ------------------------------------------------------------------ */
/* Password                                                            */
/* ------------------------------------------------------------------ */

/** Password: set or change it — `POST /auth/change-password`. */
export function PasswordCard({ profile, onChanged }: { profile: UserProfile; onChanged: () => void }) {
    const [open, setOpen] = React.useState(false);
    const [current, setCurrent] = React.useState("");
    const [next, setNext] = React.useState("");
    const [again, setAgain] = React.useState("");
    const [busy, setBusy] = React.useState(false);
    const [note, setNote] = React.useState<{ tone: "ok" | "bad"; text: string } | null>(null);

    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (next.length < 8) return setNote({ tone: "bad", text: "Use at least 8 characters." });
        if (next !== again) return setNote({ tone: "bad", text: "The two passwords differ." });
        setBusy(true);
        setNote(null);
        try {
            await advertiserWorkspace.changePassword(profile.hasPassword ? { currentPassword: current, newPassword: next } : { newPassword: next });
            setOpen(false);
            setCurrent("");
            setNext("");
            setAgain("");
            setNote({ tone: "ok", text: profile.hasPassword ? "Password changed." : "Password set." });
            onChanged();
        } catch (caught) {
            setNote({ tone: "bad", text: messageOf(caught, "Could not change the password.") });
        } finally {
            setBusy(false);
        }
    };

    return (
        <HeaderCard title="Password">
            <div className="flex items-center justify-between gap-4">
                <div>
                    <p className="text-sm font-medium text-ink">Password</p>
                    <p className="text-xs text-dim">{profile.hasPassword ? "Set · you can also sign in with a code" : "Not set · you sign in with a code sent to your phone"}</p>
                </div>
                <button type="button" onClick={() => setOpen((o) => !o)} className={`${btnSmall} whitespace-nowrap`}>
                    {profile.hasPassword ? "Change password" : "Set a password"}
                </button>
            </div>
            {open && (
                <form onSubmit={(event) => void submit(event)} className="mt-4 grid gap-3 border-t border-line pt-4 md:grid-cols-3">
                    {profile.hasPassword && <input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} placeholder="Current password" className={inputClass} autoComplete="current-password" />}
                    <input type="password" value={next} onChange={(e) => setNext(e.target.value)} placeholder="New password (8+ characters)" className={inputClass} autoComplete="new-password" />
                    <input type="password" value={again} onChange={(e) => setAgain(e.target.value)} placeholder="New password again" className={inputClass} autoComplete="new-password" />
                    <div className="md:col-span-3 flex justify-end">
                        <button type="submit" className={btnSmall} disabled={busy}>
                            {busy ? "Saving…" : "Save password"}
                        </button>
                    </div>
                </form>
            )}
            {note && <p className={`mt-3 text-xs ${note.tone === "ok" ? "text-success" : "text-danger"}`}>{note.text}</p>}
        </HeaderCard>
    );
}

/* ------------------------------------------------------------------ */
/* Two-factor                                                          */
/* ------------------------------------------------------------------ */

/**
 * Security (2FA-A): the authenticator app as this account's second factor,
 * as `GET /auth/2fa/status` reports it — set up, recovery codes, remove.
 */
export function TwoFactorCard({ status, onChanged, sideLabel = "advertiser account" }: { status: TwoFactorStatus | null; onChanged: () => void; sideLabel?: string }) {
    return (
        <HeaderCard id="security" title="Security" line="An authenticator app adds a second step to every sign-in — by email, phone, Google or Facebook">
            <AuthenticatorSetup status={status} onChanged={onChanged} sideLabel={sideLabel} />
        </HeaderCard>
    );
}

/* ------------------------------------------------------------------ */
/* Notifications                                                       */
/* ------------------------------------------------------------------ */

/** The four switches — `GET`/`PUT /notifications/preferences`, each over the kinds it stands for. */
export function NotificationsCard({ preferences, onChanged }: { preferences: NotificationPreference[]; onChanged: () => void }) {
    const [busy, setBusy] = React.useState<string | null>(null);
    const [note, setNote] = React.useState<string | null>(null);
    const [local, setLocal] = React.useState<Record<string, boolean>>({});

    const toggle = async (groupId: string, enabled: boolean) => {
        const group = PREFERENCE_GROUPS.find((g) => g.id === groupId)!;
        const rows = groupRows(preferences, group, enabled);
        if (!rows.length) return;
        setLocal((l) => ({ ...l, [groupId]: enabled }));
        setBusy(groupId);
        setNote(null);
        try {
            await advertiserWorkspace.savePreferences(rows);
            onChanged();
        } catch (caught) {
            setLocal((l) => ({ ...l, [groupId]: !enabled }));
            setNote(messageOf(caught, "Could not save that preference."));
        } finally {
            setBusy(null);
        }
    };

    return (
        <HeaderCard
            title="Notification preferences"
            line="Four quick switches; every kind on every channel is in the table below"
            actions={
                <a href="#notifications" className="inline-flex items-center gap-1 text-sm font-medium text-ink hover:text-brand">
                    Every kind
                    <ChevronDown className="size-4" aria-hidden />
                </a>
            }
        >
            <ul className="divide-y divide-line">
                {PREFERENCE_GROUPS.map((group) => {
                    const available = group.types.length > 0 && preferences.some((p) => group.types.includes(p.type) && !p.mandatory);
                    const checked = local[group.id] ?? groupEnabled(preferences, group);
                    return (
                        <li key={group.id} className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
                            <div>
                                <p className="text-sm font-medium text-ink">{group.label}</p>
                                <p className="text-xs text-dim">
                                    {group.hint}
                                    {!available && <span className="ml-1 text-warning">· Not available yet</span>}
                                </p>
                            </div>
                            <Switch checked={available ? checked : false} onCheckedChange={(value) => void toggle(group.id, value)} disabled={!available || busy !== null} aria-label={group.label} className="data-[state=checked]:bg-brand" />
                        </li>
                    );
                })}
            </ul>
            {note && <p className="mt-3 text-xs text-danger">{note}</p>}
        </HeaderCard>
    );
}

/* ------------------------------------------------------------------ */

function Field({ label, htmlFor, trailing, className, children }: { label: string; htmlFor?: string; trailing?: React.ReactNode; className?: string; children: React.ReactNode }) {
    return (
        <div className={className}>
            <div className="flex items-center justify-between gap-2">
                {htmlFor ? (
                    <label htmlFor={htmlFor} className="text-sm font-medium text-ink">
                        {label}
                    </label>
                ) : (
                    <p className="text-sm font-medium text-ink">{label}</p>
                )}
                {trailing}
            </div>
            <div className="mt-2">{children}</div>
        </div>
    );
}
