"use client";

import * as React from "react";
import Link from "next/link";
import { ChevronRight, KeyRound, QrCode } from "lucide-react";
import { btnOutline, LoadingLine, useAsync } from "@/components/advertiser/bits";
import { PasswordCard, SessionsCard, TwoFactorCard } from "@/components/advertiser/account-cards";
import { MyQrPanel } from "@/components/access/my-qr";
import { AccessLogPanel } from "@/components/access/access-log";
import { advertiserWorkspace, type DeviceSession, type TwoFactorStatus } from "@/services/advertiser-workspace";
import { accountService } from "@/services/account";
import { ChangePhone } from "./change-phone";
import { ContactsSection } from "./contacts-section";
import { LanguageSection } from "./language-section";
import { NotificationsMatrix } from "./notifications-matrix";
import { SettingsCard } from "./parts";
import { ProfileBasics } from "./profile-basics";

/**
 * The sections of the old Settings & privacy page (the ADX app's Settings
 * index, `mobile/shared/features/account/*`), as each side's one settings
 * page draws them since 29 Sep 2026: the person in the profile section, the
 * notification matrix in Notifications, and in Privacy & security the
 * privacy switches, the data copy, the closure request, agent access and —
 * for a print partner, whose shop page had none — the security cards.
 * Every card reads and saves on its own, so one failing read never blanks
 * the page.
 */

/**
 * The person behind the account, in the profile section: the picture, the
 * two names (unless the side's own card asks them), the date of birth and
 * the gender; the email and the other contacts; the sign-in number; the
 * language.
 */
export function PersonSettings({ names = true, basicsLine }: { names?: boolean; basicsLine?: React.ReactNode }) {
    const state = useAsync("settings-person", () => accountService.profile(), "Could not read your account.");
    const [phoneOpen, setPhoneOpen] = React.useState(false);

    if (state.kind === "loading") {
        return (
            <SettingsCard id="profile" title="About you">
                <LoadingLine>Loading your details…</LoadingLine>
            </SettingsCard>
        );
    }
    if (state.kind === "error") {
        return (
            <SettingsCard id="profile" title="About you">
                <p className="text-sm text-danger">{state.message}</p>
            </SettingsCard>
        );
    }

    const profile = state.value;
    const stamp = [profile.firstName, profile.lastName, profile.name, profile.dateOfBirth, profile.gender, profile.avatarUrl].join("|");
    const openPhone = () => {
        setPhoneOpen(true);
        document.getElementById("phone")?.scrollIntoView?.({ behavior: "smooth", block: "start" });
    };

    return (
        <div className="grid content-start gap-4">
            <ProfileBasics key={stamp} profile={profile} onChanged={state.reload} names={names} title="About you" line={basicsLine} />
            <ContactsSection onChanged={state.reload} onChangePhone={openPhone} />
            <ChangePhone currentMobile={profile.mobile} open={phoneOpen} onOpenChange={setPhoneOpen} />
            <LanguageSection key={profile.language} saved={profile.language} onChanged={state.reload} />
        </div>
    );
}

/**
 * The Notifications section: the side's quick switches (the designed card,
 * where the side has one) over the full matrix. A flip in either is read
 * back by the other, so the two never disagree on screen.
 */
export function NotificationsSettings({ quick }: { quick?: (sync: { refreshKey: number; onChanged: () => void }) => React.ReactNode }) {
    const [quickKey, setQuickKey] = React.useState(0);
    const [matrixKey, setMatrixKey] = React.useState(0);
    return (
        <div className="grid max-w-[920px] gap-4">
            {quick?.({ refreshKey: quickKey, onChanged: () => setMatrixKey((n) => n + 1) })}
            <NotificationsMatrix key={matrixKey} onChanged={() => setQuickKey((n) => n + 1)} />
        </div>
    );
}

/** The advertiser's code and record — the app keeps them under My account. */
export function AdvertiserAgentAccess() {
    const [logKey, setLogKey] = React.useState(0);
    return (
        <SettingsCard id="agent-access" title="Agent access" line="Your QR code, and who has had access to your account">
            <MyQrPanel party="ADVERTISER" onDecided={() => setLogKey((n) => n + 1)} />
            <div className="mt-6 border-t border-line pt-5">
                <p className="text-sm font-semibold text-ink">Who has had access</p>
                <div className="mt-2">
                    <AccessLogPanel party="ADVERTISER" refreshKey={logKey} />
                </div>
            </div>
        </SettingsCard>
    );
}

/** The publisher's agent access has its own page in the workspace; the card is the way to it. */
export function PublisherAgentAccess() {
    return (
        <SettingsCard id="agent-access" title="Agent access" line="Your QR code, and who has had access to your account">
            <LinkRow icon={QrCode} title="Agent access" body="Show your code to an ADX agent, approve their scan, give a code for a support request, and see every window of access." href="/publisher/access" />
        </SettingsCard>
    );
}

/**
 * The print partner's security: the signed-in devices, the password and
 * the authenticator app — the advertiser's and the publisher's are their
 * designed cards; the shop's page had none, so these are the same cards.
 */
export function PartnerSecurity() {
    const state = useAsync(
        "settings-security",
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
    if (state.kind === "loading") {
        return (
            <SettingsCard id="security" title="Security">
                <LoadingLine>Loading…</LoadingLine>
            </SettingsCard>
        );
    }
    if (state.kind === "error") {
        return (
            <SettingsCard id="security" title="Security">
                <p className="text-sm text-danger">{state.message}</p>
            </SettingsCard>
        );
    }
    return (
        <div className="grid content-start gap-4">
            <PasswordCard key={`password-${state.value.profile.hasPassword}`} profile={state.value.profile} onChanged={state.reload} />
            <TwoFactorCard status={state.value.twoFactor} onChanged={state.reload} sideLabel="print partner account" />
            <div id="sessions" className="scroll-mt-24">
                <SessionsCard sessions={state.value.sessions} onChanged={state.reload} />
            </div>
        </div>
    );
}

function LinkRow({ icon: Icon, title, body, href }: { icon: typeof KeyRound; title: string; body: string; href: string }) {
    return (
        <div className="flex flex-wrap items-center gap-4">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-brand-soft text-brand-bright">
                <Icon className="size-5" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-ink">{title}</p>
                <p className="text-xs text-dim">{body}</p>
            </div>
            <Link href={href} className={`${btnOutline} gap-1`}>
                Open
                <ChevronRight className="size-4" aria-hidden />
            </Link>
        </div>
    );
}
