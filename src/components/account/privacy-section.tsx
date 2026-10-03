"use client";

import * as React from "react";
import Link from "next/link";
import { messageOf } from "@/lib/api-client";
import { FLAG_DATA_EXPORT, useSwitchedOff } from "@/lib/flags";
import { btnSmall } from "@/components/advertiser/bits";
import { FeatureOff } from "@/components/platform/feature-off";
import type { Party } from "@/services/party";
import { ticketHref } from "./routes";
import { ConfirmDialog, NoteLine, SettingRow, SettingsCard, Toggle, type Note } from "./parts";
import {
    accountService,
    boolAt,
    DATA_EXPORT_FILE_NAME,
    exportReady,
    exportRowHint,
    exportRowValue,
    isFeatureOff,
    saveFile,
    textAt,
    type ClosureCase,
    type DataExportRequest,
    type PreferenceKey,
    type PreferenceRead,
} from "@/services/account";

const SHOW_NAME_TO: Record<Party, string> = {
    ADVERTISER: "Show my name to publishers",
    PUBLISHER: "Show my name to advertisers",
    PRINT_PARTNER: "Show my name to advertisers and publishers",
};

const LOCATION_WORDS: Record<string, string> = { never: "Never", duringJobs: "During jobs", always: "Always" };

/**
 * The app's Privacy settings: the profile switches, the data switch,
 * Download my data (`/users/me/data-export` — request, state, download) and
 * Close my account (`POST /users/me/closure-request`). Every switch saves as
 * it flips and reverts if the server refuses. An account is closed by
 * support after a review of the balance, payouts in progress and open
 * matters, so the row says "close", not "delete", and says what the review
 * covers. Location sharing is about a phone on a job, so it stays the app's.
 * Download my data sits behind the `users.data-export` switch: while it is
 * off — the flags say so, or a call just came back 503 FEATURE_OFF — the row
 * is the plain "switched off" line and the export is neither read nor asked for.
 */
export function PrivacySection({ party }: { party: Party }) {
    const [prefs, setPrefs] = React.useState<PreferenceRead | null>(null);
    const [exportRequest, setExportRequest] = React.useState<DataExportRequest | null>(null);
    const [exportRefused, setExportRefused] = React.useState(false);
    const exportSwitchedOff = useSwitchedOff(FLAG_DATA_EXPORT);
    const exportOff = exportSwitchedOff || exportRefused;
    const [note, setNote] = React.useState<Note>(null);
    const [busy, setBusy] = React.useState<string | null>(null);
    const [confirm, setConfirm] = React.useState<"export" | "close" | null>(null);
    const [confirmError, setConfirmError] = React.useState<string | null>(null);
    const [reason, setReason] = React.useState("");
    const [closure, setClosure] = React.useState<ClosureCase | null>(null);

    React.useEffect(() => {
        let cancelled = false;
        accountService
            .preferences()
            .then((read) => {
                if (!cancelled) setPrefs(read);
            })
            .catch((caught: unknown) => {
                if (!cancelled) setNote({ tone: "bad", text: messageOf(caught, "Could not read your privacy settings.") });
            });
        return () => {
            cancelled = true;
        };
    }, []);

    /* The export's state — not read while the switch is off. */
    React.useEffect(() => {
        if (exportSwitchedOff) return;
        let cancelled = false;
        accountService
            .latestExport()
            .then((latest) => {
                if (!cancelled) setExportRequest(latest);
            })
            .catch((caught: unknown) => {
                if (!cancelled && isFeatureOff(caught)) setExportRefused(true);
            });
        return () => {
            cancelled = true;
        };
    }, [exportSwitchedOff]);

    const set = async (key: PreferenceKey, value: boolean) => {
        const before = prefs;
        setPrefs((current) => (current ? { ...current, [key]: value } : current));
        setBusy(key);
        setNote(null);
        try {
            setPrefs(await accountService.savePreferences({ [key]: value }));
        } catch (caught) {
            setPrefs(before);
            setNote({ tone: "bad", text: messageOf(caught, "Could not save that.") });
        } finally {
            setBusy(null);
        }
    };

    /** Download my data, by the state it is in: download a ready copy, re-read one being prepared, else ask. */
    const onExport = async () => {
        if (exportReady(exportRequest)) {
            setBusy("export");
            setNote(null);
            try {
                saveFile(await accountService.exportFile(exportRequest.fileId), DATA_EXPORT_FILE_NAME);
            } catch (caught) {
                setNote({ tone: "bad", text: messageOf(caught, "The download did not go through.") });
            } finally {
                setBusy(null);
            }
            return;
        }
        if (exportRequest?.status === "PENDING") {
            setBusy("export");
            try {
                setExportRequest(await accountService.latestExport());
            } catch {
                /* Still preparing as far as the page knows. */
            } finally {
                setBusy(null);
            }
            return;
        }
        setConfirmError(null);
        setConfirm("export");
    };

    const requestExport = async () => {
        setBusy("export");
        setConfirmError(null);
        try {
            setExportRequest(await accountService.requestExport());
            setConfirm(null);
        } catch (caught) {
            if (isFeatureOff(caught)) {
                setExportRefused(true);
                setConfirm(null);
            } else setConfirmError(messageOf(caught, "Could not ask for your data."));
        } finally {
            setBusy(null);
        }
    };

    const requestClosure = async () => {
        setBusy("close");
        setConfirmError(null);
        try {
            const result = await accountService.requestClosure(reason);
            setClosure(result.case);
            setConfirm(null);
            setReason("");
        } catch (caught) {
            setConfirmError(messageOf(caught, "Could not send that request."));
        } finally {
            setBusy(null);
        }
    };

    const exportValue = exportRowValue(exportRequest);
    const exportAction = exportReady(exportRequest) ? "Download" : exportRequest?.status === "PENDING" ? "Check again" : "Ask for my copy";

    return (
        <SettingsCard id="privacy" title="Privacy" line="What others see of you, and your data">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-dim">Profile</p>
            <div className="mt-2 divide-y divide-line">
                <SettingRow label={SHOW_NAME_TO[party]}>
                    <Toggle checked={boolAt(prefs, "privacy.showName", true)} onChange={(value) => void set("privacy.showName", value)} disabled={prefs === null || busy !== null} label={SHOW_NAME_TO[party]} />
                </SettingRow>
                <SettingRow label="Show my photo">
                    <Toggle checked={boolAt(prefs, "privacy.showPhoto", true)} onChange={(value) => void set("privacy.showPhoto", value)} disabled={prefs === null || busy !== null} label="Show my photo" />
                </SettingRow>
                <SettingRow label="Share location on a job" hint="Set in the ADX app — it is about your phone's location while a job is open.">
                    <span className="text-sm text-dim">{LOCATION_WORDS[textAt(prefs, "privacy.locationSharing", "duringJobs")] ?? "During jobs"}</span>
                </SettingRow>
            </div>

            <p className="mt-5 text-[11px] font-semibold uppercase tracking-wide text-dim">Data</p>
            <div className="mt-2 divide-y divide-line">
                <SettingRow label="Personalised tips" hint="Suggestions drawn from how you use ADX">
                    <Toggle checked={boolAt(prefs, "privacy.personalisedTips", true)} onChange={(value) => void set("privacy.personalisedTips", value)} disabled={prefs === null || busy !== null} label="Personalised tips" />
                </SettingRow>
                {exportOff ? (
                    <div className="py-3">
                        <FeatureOff flag={FLAG_DATA_EXPORT}>Ask support if you need a copy.</FeatureOff>
                    </div>
                ) : (
                    <SettingRow label={exportValue ? `Download my data · ${exportValue}` : "Download my data"} hint={exportRowHint(exportRequest)}>
                        <button type="button" onClick={() => void onExport()} className={btnSmall} disabled={busy !== null}>
                            {busy === "export" ? "Working…" : exportAction}
                        </button>
                    </SettingRow>
                )}
                {!closure && (
                    <SettingRow label="Close my account" tone="danger" hint="Support reviews your balance, payouts in progress and open matters first.">
                        <button
                            type="button"
                            onClick={() => {
                                setConfirmError(null);
                                setConfirm("close");
                            }}
                            className={`${btnSmall} text-danger`}
                            disabled={busy !== null}
                        >
                            Close my account
                        </button>
                    </SettingRow>
                )}
            </div>

            {closure && (
                <div className="mt-4 rounded-md border border-line bg-ground px-4 py-3">
                    <p className="text-sm font-semibold text-ink">Closure requested</p>
                    <p className="mt-1 text-sm text-dim">ADX support has your request — they review your balance, payouts in progress and open matters before closing. Anything owed to you is paid out first.</p>
                    {closure.ticketId && (
                        <Link href={ticketHref(party, closure.ticketId)} className="mt-2 inline-block text-sm font-medium text-ink underline underline-offset-4 hover:text-brand">
                            See the ticket
                        </Link>
                    )}
                </div>
            )}

            <p className="mt-4 text-xs text-dim">ADX keeps KYC records and tax forms for as long as the law requires, whatever you switch off here.</p>
            <NoteLine note={note} className="mt-2" />

            <ConfirmDialog
                open={confirm === "export" && !exportOff}
                title="Send you a copy of your data?"
                body="ADX builds a zip of what it holds about you — your profile, KYC decisions, listings, bookings, campaigns, wallet and notices; no images — within a few minutes, and tells you when it is ready. The copy stays for seven days."
                confirmLabel="Ask for my copy"
                cancelLabel="Not now"
                busy={busy === "export"}
                error={confirmError}
                onConfirm={() => void requestExport()}
                onClose={() => setConfirm(null)}
            />
            <ConfirmDialog
                open={confirm === "close"}
                title="Close your account?"
                body="Support reviews your wallet balance, any payouts in progress and any open matters — disputes, tickets, bookings under way — before closing. Anything owed to you is paid out first. This sends the request; support takes it from there."
                confirmLabel="Ask support to close my account"
                cancelLabel="Not now"
                tone="danger"
                busy={busy === "close"}
                error={confirmError}
                onConfirm={() => void requestClosure()}
                onClose={() => setConfirm(null)}
            >
                <div>
                    <label htmlFor="closure-reason" className="text-sm font-medium text-ink">
                        Why are you closing? (optional)
                    </label>
                    <textarea
                        id="closure-reason"
                        value={reason}
                        onChange={(event) => setReason(event.target.value)}
                        maxLength={500}
                        rows={3}
                        placeholder="A line for support"
                        className="mt-2 w-full rounded-md border border-line bg-white px-3 py-2.5 text-sm text-ink placeholder:text-dim focus:border-ink focus:outline-none"
                    />
                </div>
            </ConfirmDialog>
        </SettingsCard>
    );
}
