"use client";

import * as React from "react";
import Link from "next/link";
import { Laptop, ShieldCheck, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { Panel } from "@/components/workspace/page-heading";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { brandButton, CardTitle, Chip, ErrorNote, Field, inputClass, Loading, outlineButton } from "@/components/publisher/parts";
import { useLoad } from "@/components/publisher/use-load";
import { useAuth } from "@/lib/auth";
import { messageOf } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { usePublisher } from "../layout";
import { describeSession, kycLabel, maskedPhone, NOTIFICATION_SWITCHES, publisherWorkspace, relativeTime, type AccountMe, type DeviceSession, type NotificationPreference, type PublisherProfile } from "@/services/publisher-workspace";

interface Loaded {
    profile: PublisherProfile;
    me: AccountMe;
    sessions: DeviceSession[];
    preferences: NotificationPreference[];
}

async function readProfile(): Promise<Loaded> {
    const [profile, me, sessions, preferences] = await Promise.all([
        publisherWorkspace.profile(),
        publisherWorkspace.me(),
        publisherWorkspace.sessions().catch(() => [] as DeviceSession[]),
        publisherWorkspace.notificationPreferences().catch(() => [] as NotificationPreference[]),
    ]);
    return { profile, me, sessions, preferences };
}

/**
 * DR 12 · 10 · 16 · Business profile (5204:86665): the business's name,
 * email and phone, the devices signed in, the password, the second factor,
 * and which emails the publisher wants. Verification (the KYC ladder)
 * lives on its own page under it.
 */
export default function ProfilePage() {
    const publisher = usePublisher();
    const { refresh } = useAuth();
    const { data, error, loading, reload } = useLoad("profile", readProfile);

    if (!data && loading) return <Loading label="Loading your profile…" />;
    if (!data) return <ErrorNote message={error ?? "Could not read your profile."} onRetry={reload} />;

    const name = data.profile.name || publisher?.name || "";
    const kyc = kycLabel(data.profile.kycStatus);

    return (
        <>
            <h1 className="text-2xl font-semibold tracking-tight text-ink">Business profile</h1>
            <p className="mt-1 text-sm text-dim">{name} · contact details, security and booking notifications</p>

            <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_0.94fr]">
                <div className="grid content-start gap-6">
                    <ProfileCard
                        profile={data.profile}
                        onSaved={() => {
                            reload();
                            void refresh();
                        }}
                    />

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

                    <SessionsCard sessions={data.sessions} onChanged={reload} />
                </div>

                <div className="grid content-start gap-6">
                    <PasswordCard me={data.me} onChanged={reload} />

                    <Panel className="p-0">
                        <div className="border-b border-line px-6 py-4">
                            <CardTitle>Two-factor authentication</CardTitle>
                            <p className="mt-1 text-sm text-dim">Protect your publisher account at sign-in</p>
                        </div>
                        <div className="px-6 py-4">
                            <div className="flex items-start justify-between gap-4">
                                <div className="flex items-start gap-3">
                                    <span className="flex size-9 items-center justify-center rounded-md bg-success-soft text-success">
                                        <ShieldCheck className="size-4" aria-hidden />
                                    </span>
                                    <div>
                                        <p className="text-sm font-semibold text-ink">One-time code to your phone</p>
                                        <p className="text-xs text-dim">Every sign-in asks for the code sent to {maskedPhone(data.me.mobile)}</p>
                                    </div>
                                </div>
                                <Chip tone="success">On</Chip>
                            </div>
                            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
                                <p className="text-xs text-dim">An authenticator app is not available for publisher accounts yet.</p>
                                <button type="button" disabled className={cn(outlineButton, "h-9 px-4")}>
                                    Set up authenticator app
                                </button>
                            </div>
                        </div>
                    </Panel>

                    <NotificationsCard preferences={data.preferences} onChanged={reload} />
                </div>
            </div>
        </>
    );
}

/* Profile — `PATCH /publishers/me` for the name and email. */
function ProfileCard({ profile, onSaved }: { profile: PublisherProfile; onSaved: () => void }) {
    const [name, setName] = React.useState(profile.name ?? "");
    const [email, setEmail] = React.useState(profile.email ?? "");
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
                                    {session.ipAddress ?? "Unknown network"} · {relativeTime(session.lastUsedAt ?? session.createdAt)}
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
