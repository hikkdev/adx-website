"use client";

import * as React from "react";
import { Laptop, Smartphone } from "lucide-react";
import { messageOf } from "@/lib/api-client";
import { Switch } from "@/components/ui/switch";
import { AuthenticatorSetup } from "@/components/auth/authenticator-setup";
import { btnSmall, HeaderCard, inputClass, StatusChip } from "@/components/advertiser/bits";
import { EMAIL_CODE_LENGTH, normaliseCode } from "@/services/auth";
import {
    advertiserWorkspace,
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

/* ------------------------------------------------------------------ */
/* Profile                                                             */
/* ------------------------------------------------------------------ */

/**
 * Frame 09's Profile card: the name (`PATCH /users/me`), the email proved
 * with a code (`POST /users/me/email/send-code` → `/verify`), the masked
 * phone, and the role line.
 */
export function ProfileCard({ profile, advertiser, onChanged }: { profile: UserProfile; advertiser: AdvertiserProfile | null; onChanged: () => void }) {
    const [name, setName] = React.useState(profile.name ?? "");
    const [email, setEmail] = React.useState(profile.email ?? "");
    const [code, setCode] = React.useState("");
    const [sent, setSent] = React.useState<{ email: string; devOtp?: string; resendAfterSeconds: number } | null>(null);
    const [busy, setBusy] = React.useState<null | "name" | "send" | "verify">(null);
    const [note, setNote] = React.useState<{ tone: "ok" | "bad"; text: string } | null>(null);

    const nameChanged = name.trim() !== (profile.name ?? "").trim() && name.trim().length > 0;
    const emailChanged = email.trim().toLowerCase() !== (profile.email ?? "").trim().toLowerCase();
    const verified = !!profile.emailVerifiedAt && !emailChanged && !!profile.email;

    const saveName = async () => {
        setBusy("name");
        setNote(null);
        try {
            await advertiserWorkspace.updateProfile({ name: name.trim() });
            setNote({ tone: "ok", text: "Name saved." });
            onChanged();
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
                <Field label="Full name">
                    <div className="flex gap-2">
                        <input value={name} onChange={(e) => setName(e.target.value)} className={inputClass} maxLength={120} />
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

/** The company and billing details ADX prints on every invoice — `PATCH /advertisers/:id`. */
export function BillingDetailsCard({ advertiser, kyc, onChanged }: { advertiser: AdvertiserProfile; kyc: AdvertiserKyc | null; onChanged: () => void }) {
    const [form, setForm] = React.useState({
        companyName: advertiser.companyName ?? "",
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

    const pinInvalid = !!form.postalCode.trim() && !/^\d{6}$/.test(form.postalCode.trim());

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
        <HeaderCard id="billing" title="Billing details" line="Printed on every invoice ADX issues to you" actions={<StatusChip label={`Verification · ${verification.label}`} tone={verification.tone} />}>
            <div className="grid gap-x-4 gap-y-5 md:grid-cols-2">
                {!individual && (
                    <Field label="Company name">
                        <input value={form.companyName} onChange={set("companyName")} className={inputClass} maxLength={160} />
                    </Field>
                )}
                <Field label="GSTIN">
                    <input value={form.gstin} onChange={set("gstin")} className={`${inputClass} uppercase`} placeholder="29ABCDE1234F1Z5" maxLength={15} />
                </Field>
                <Field label="Billing address" className="md:col-span-2">
                    <input value={form.billingAddress} onChange={set("billingAddress")} className={inputClass} maxLength={400} />
                </Field>
                <Field label="City">
                    <input value={form.city} onChange={set("city")} className={inputClass} maxLength={80} />
                </Field>
                <Field label="State">
                    <input value={form.state} onChange={set("state")} className={inputClass} maxLength={80} />
                </Field>
                <Field label="PIN code (6 digits)">
                    <input value={form.postalCode} onChange={(e) => setForm((f) => ({ ...f, postalCode: e.target.value.replace(/\D/g, "").slice(0, 6) }))} inputMode="numeric" autoComplete="postal-code" placeholder="560001" className={`${inputClass} ${pinInvalid ? "border-danger" : ""}`} maxLength={6} />
                </Field>
                <Field label="Country">
                    <input value={form.country} onChange={set("country")} autoComplete="country-name" placeholder="India" className={inputClass} maxLength={60} />
                </Field>
            </div>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs text-dim">
                    {verification.label === "Verified" ? "Your account is verified." : "Verification is completed in the ADX app under My account; a paid campaign goes live once it is done."}
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
export function TwoFactorCard({ status, onChanged }: { status: TwoFactorStatus | null; onChanged: () => void }) {
    return (
        <HeaderCard id="security" title="Security" line="An authenticator app adds a second step to every sign-in — by email, phone, Google or Facebook">
            <AuthenticatorSetup status={status} onChanged={onChanged} sideLabel="advertiser account" />
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
        <HeaderCard title="Notification preferences">
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

function Field({ label, trailing, className, children }: { label: string; trailing?: React.ReactNode; className?: string; children: React.ReactNode }) {
    return (
        <div className={className}>
            <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium text-ink">{label}</p>
                {trailing}
            </div>
            <div className="mt-2">{children}</div>
        </div>
    );
}
