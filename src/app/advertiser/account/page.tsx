"use client";

import * as React from "react";
import { PageHeading } from "@/components/workspace/page-heading";
import { useAdvertiser } from "@/app/advertiser/layout";
import { ErrorPanel, LoadingLine, useAsync } from "@/components/advertiser/bits";
import { BillingDetailsCard, NotificationsCard, PasswordCard, ProfileCard, SessionsCard, TwoFactorCard } from "@/components/advertiser/account-cards";
import { advertiserWorkspace, type AdvertiserKyc, type AdvertiserProfile, type DeviceSession, type NotificationPreference, type TwoFactorStatus } from "@/services/advertiser-workspace";

/**
 * DR 12 · 07 · 09 · Account & billing profile (5204:74064): the person
 * (`/users/me`), their sessions, password and second factor on one side;
 * the billing details ADX invoices (`/advertisers/me`) and the four
 * notification switches. Every card saves on its own and re-reads the page.
 */
export default function AccountPage() {
    const advertiserFromShell = useAdvertiser();
    const state = useAsync(
        "account",
        async () => {
            const [profile, advertiser, sessions, twoFactor, preferences, kyc] = await Promise.all([
                advertiserWorkspace.profile(),
                advertiserWorkspace.advertiser().catch(() => null as AdvertiserProfile | null),
                advertiserWorkspace.sessions().catch(() => [] as DeviceSession[]),
                advertiserWorkspace.twoFactorStatus().catch(() => null as TwoFactorStatus | null),
                advertiserWorkspace.preferences().catch(() => [] as NotificationPreference[]),
                advertiserWorkspace.kyc().catch(() => null as AdvertiserKyc | null),
            ]);
            return { profile, advertiser, sessions, twoFactor, preferences, kyc };
        },
        "Could not read your account."
    );

    const name = state.kind === "ready" ? state.value.advertiser?.name : advertiserFromShell?.name;
    const heading = <PageHeading title="Account settings" subtitle={`${name ? `${name} · ` : ""}Profile, security and notifications`} />;

    if (state.kind === "loading") {
        return (
            <>
                {heading}
                <div className="mt-6">
                    <LoadingLine>Loading your account…</LoadingLine>
                </div>
            </>
        );
    }
    if (state.kind === "error") {
        return (
            <>
                {heading}
                <ErrorPanel title="Could not read your account" message={state.message} />
            </>
        );
    }

    const { profile, advertiser, sessions, twoFactor, preferences, kyc } = state.value;
    const stamp = `${profile.name ?? ""}|${profile.email ?? ""}|${profile.emailVerifiedAt ?? ""}|${profile.hasPassword}|${advertiser?.gstin ?? ""}|${advertiser?.billingAddress ?? ""}|${advertiser?.postalCode ?? ""}|${advertiser?.country ?? ""}`;

    return (
        <>
            {heading}
            <div className="mt-6 grid gap-4 xl:grid-cols-2">
                <div className="space-y-4">
                    <ProfileCard key={stamp} profile={profile} advertiser={advertiser} onChanged={state.reload} />
                    {advertiser && <BillingDetailsCard key={`billing-${stamp}`} advertiser={advertiser} kyc={kyc} onChanged={state.reload} />}
                    <SessionsCard sessions={sessions} onChanged={state.reload} />
                </div>
                <div className="space-y-4">
                    <PasswordCard key={`password-${profile.hasPassword}`} profile={profile} onChanged={state.reload} />
                    <TwoFactorCard status={twoFactor} onChanged={state.reload} />
                    <NotificationsCard preferences={preferences} onChanged={state.reload} />
                </div>
            </div>
        </>
    );
}
