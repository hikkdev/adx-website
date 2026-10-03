"use client";

import * as React from "react";
import { PageHeading } from "@/components/workspace/page-heading";
import { useAdvertiser } from "@/app/advertiser/layout";
import { ErrorPanel, LoadingLine, useAsync } from "@/components/advertiser/bits";
import { BillingDetailsCard, NotificationsCard, PasswordCard, ProfileCard, SessionsCard, TwoFactorCard } from "@/components/advertiser/account-cards";
import { CustomFieldsSection } from "@/components/custom-fields/custom-fields-section";
import { PrivacySection } from "@/components/account/privacy-section";
import { SettingsSections } from "@/components/account/settings-layout";
import { AdvertiserAgentAccess, NotificationsSettings, PersonSettings } from "@/components/account/settings-panels";
import { advertiserWorkspace, type AdvertiserKyc, type AdvertiserProfile, type DeviceSession, type NotificationPreference, type TwoFactorStatus } from "@/services/advertiser-workspace";

/**
 * DR 12 · 07 · 09 · Account settings (5204:74064) — since 29 Sep 2026 the
 * advertiser's one settings page (the owner: "Sure, go ahead with further
 * cleanup"); Settings & privacy is folded in and its route sends here.
 * Three sections under the frame's heading:
 *
 * - Profile — the frame's Profile card (the two names, the email proved
 *   with a code, the phone, the role, the ids), the billing details ADX
 *   invoices (`/advertisers/me`) and the custom fields; beside them the
 *   person (picture, date of birth, gender), the email and other contacts,
 *   the sign-in number and the language.
 * - Notifications — the frame's four quick switches over every kind on
 *   every channel, with quiet hours.
 * - Privacy & security — the frame's password, authenticator and sessions
 *   cards; the privacy switches, Download my data and Close my account;
 *   agent access.
 *
 * Every card saves on its own and re-reads what it shows.
 */
export default function AccountPage() {
    const advertiser = useAdvertiser();
    const heading = <PageHeading title="Account settings" subtitle={`${advertiser?.name ? `${advertiser.name} · ` : ""}Profile, security and notifications`} />;
    return (
        <>
            {heading}
            <React.Suspense fallback={<LoadingLine>Loading your account…</LoadingLine>}>
                <SettingsSections panels={{ profile: <ProfileSection />, notifications: <NotificationsSection />, privacy: <PrivacySecuritySection /> }} />
            </React.Suspense>
        </>
    );
}

function ProfileSection() {
    const state = useAsync(
        "account-profile",
        async () => {
            const [profile, advertiser, kyc] = await Promise.all([
                advertiserWorkspace.profile(),
                advertiserWorkspace.advertiser().catch(() => null as AdvertiserProfile | null),
                advertiserWorkspace.kyc().catch(() => null as AdvertiserKyc | null),
            ]);
            return { profile, advertiser, kyc };
        },
        "Could not read your account."
    );

    if (state.kind === "loading") return <LoadingLine>Loading your account…</LoadingLine>;
    if (state.kind === "error") return <ErrorPanel className="mt-0" title="Could not read your account" message={state.message} />;

    const { profile, advertiser, kyc } = state.value;
    const stamp = `${profile.firstName ?? ""}|${profile.lastName ?? ""}|${profile.name ?? ""}|${profile.email ?? ""}|${profile.emailVerifiedAt ?? ""}|${advertiser?.gstin ?? ""}|${advertiser?.billingAddress ?? ""}|${advertiser?.postalCode ?? ""}|${advertiser?.country ?? ""}`;

    return (
        <div className="grid gap-4 xl:grid-cols-2">
            <div className="grid content-start gap-4">
                <ProfileCard key={stamp} profile={profile} advertiser={advertiser} onChanged={state.reload} />
                {advertiser && <BillingDetailsCard key={`billing-${stamp}`} advertiser={advertiser} kyc={kyc} onChanged={state.reload} />}
                {/* CF-1: the custom fields Settings › Custom fields shows on the website for an advertiser. */}
                {advertiser && <CustomFieldsSection entity="ADVERTISER" entityId={advertiser.id} />}
            </div>
            {/* The names are the Profile card's; this card holds the rest of the person. */}
            <PersonSettings names={false} basicsLine="Your picture, date of birth and gender" />
        </div>
    );
}

function NotificationsSection() {
    return <NotificationsSettings quick={({ refreshKey, onChanged }) => <QuickSwitches refreshKey={refreshKey} onChanged={onChanged} />} />;
}

/** The frame's four switches, read again whenever the matrix under them saves. */
function QuickSwitches({ refreshKey, onChanged }: { refreshKey: number; onChanged: () => void }) {
    const [preferences, setPreferences] = React.useState<NotificationPreference[] | null>(null);
    const read = React.useCallback(() => {
        advertiserWorkspace
            .preferences()
            .then(setPreferences)
            .catch(() => setPreferences((current) => current ?? []));
    }, []);
    React.useEffect(() => {
        read();
    }, [read, refreshKey]);
    if (!preferences) return <LoadingLine>Loading your notification settings…</LoadingLine>;
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

function PrivacySecuritySection() {
    const state = useAsync(
        "account-security",
        async () => {
            const [profile, sessions, twoFactor] = await Promise.all([
                advertiserWorkspace.profile(),
                advertiserWorkspace.sessions().catch(() => [] as DeviceSession[]),
                advertiserWorkspace.twoFactorStatus().catch(() => null as TwoFactorStatus | null),
            ]);
            return { profile, sessions, twoFactor };
        },
        "Could not read your security settings."
    );

    return (
        <div className="grid gap-4 xl:grid-cols-2">
            <div className="grid content-start gap-4">
                {state.kind === "loading" && <LoadingLine>Loading your security settings…</LoadingLine>}
                {state.kind === "error" && <ErrorPanel className="mt-0" title="Could not read your security settings" message={state.message} />}
                {state.kind === "ready" && (
                    <>
                        <PasswordCard key={`password-${state.value.profile.hasPassword}`} profile={state.value.profile} onChanged={state.reload} />
                        <TwoFactorCard status={state.value.twoFactor} onChanged={state.reload} />
                        <div id="sessions" className="scroll-mt-24">
                            <SessionsCard sessions={state.value.sessions} onChanged={state.reload} />
                        </div>
                    </>
                )}
            </div>
            <div className="grid content-start gap-4">
                <PrivacySection party="ADVERTISER" />
                <AdvertiserAgentAccess />
            </div>
        </div>
    );
}
