"use client";

import * as React from "react";
import { messageOf } from "@/lib/api-client";
import { btnSmall } from "@/components/advertiser/bits";
import { NoteLine, SettingRow, SettingsCard, Toggle, type Note } from "./parts";
import {
    accountService,
    boolAt,
    CHANNEL_LABEL,
    enabledSummary,
    fillPreferences,
    isLocked,
    KIND_COPY,
    matrixRows,
    NOTIFICATION_CHANNELS,
    NOTIFICATION_TYPES,
    QUIET_WINDOWS,
    quietHoursLabel,
    setAllRows,
    textAt,
    unsubscribedSentence,
    type NotificationChannel,
    type NotificationPreference,
    type NotificationType,
    type PreferenceRead,
} from "@/services/account";

/**
 * The app's Notification preferences, drawn as the matrix it is: every kind
 * down the side, In ADX / Push / Email / SMS across (`GET|PUT
 * /notifications/preferences`). In ADX is the record the bell counts and is
 * always on; a mandatory row (a sign-in code, a service notice by SMS) is
 * locked. Every other cell is a switch the dispatcher reads. Under it quiet
 * hours, do-not-disturb and weekend mode (`/users/me/preferences`), and —
 * when the person unsubscribed through an email's link — the undo,
 * `POST /users/me/email-resubscribe`. `onChanged` hears every switch that
 * saved, so quick switches drawn beside the matrix can read theirs again.
 */
export function NotificationsMatrix({ onChanged }: { onChanged?: () => void } = {}) {
    const [rows, setRows] = React.useState<Required<NotificationPreference>[] | null>(null);
    const [quiet, setQuiet] = React.useState<PreferenceRead | null>(null);
    const [note, setNote] = React.useState<Note>(null);
    const [busy, setBusy] = React.useState<string | null>(null);

    const readQuiet = React.useCallback(async () => {
        try {
            setQuiet(await accountService.preferences());
        } catch {
            setQuiet(null);
        }
    }, []);

    React.useEffect(() => {
        let cancelled = false;
        accountService
            .notificationPreferences()
            .then((saved) => {
                if (!cancelled) setRows(fillPreferences(Array.isArray(saved) ? saved : []));
            })
            .catch((caught: unknown) => {
                if (cancelled) return;
                setRows(fillPreferences([]));
                setNote({ tone: "bad", text: messageOf(caught, "Could not read your notification settings. What you see are the defaults.") });
            });
        accountService
            .preferences()
            .then((read) => {
                if (!cancelled) setQuiet(read);
            })
            .catch(() => undefined);
        return () => {
            cancelled = true;
        };
    }, []);

    const at = (type: NotificationType, channel: NotificationChannel) => rows?.find((row) => row.type === type && row.channel === channel);

    const set = async (type: NotificationType, channel: NotificationChannel, enabled: boolean) => {
        const before = rows;
        setRows((current) => current?.map((row) => (row.type === type && row.channel === channel ? { ...row, enabled } : row)) ?? current);
        setBusy(`${type}:${channel}`);
        setNote(null);
        try {
            await accountService.saveNotificationPreferences([{ type, channel, enabled }]);
            onChanged?.();
        } catch (caught) {
            setRows(before);
            setNote({ tone: "bad", text: messageOf(caught, "Could not save that.") });
        } finally {
            setBusy(null);
        }
    };

    const setAll = async (enabled: boolean) => {
        if (!rows) return;
        const before = rows;
        const changing = setAllRows(rows, enabled);
        setRows(rows.map((row) => (isLocked(row.channel, row) ? row : { ...row, enabled })));
        setBusy("all");
        setNote(null);
        try {
            await accountService.saveNotificationPreferences(changing);
            onChanged?.();
            setNote({ tone: "ok", text: enabled ? "Every switch is on." : "Everything but the record in ADX and the security messages is off." });
        } catch (caught) {
            setRows(before);
            setNote({ tone: "bad", text: messageOf(caught, "Could not save that.") });
        } finally {
            setBusy(null);
        }
    };

    const setQuietKey = async (key: "notifications.doNotDisturb" | "notifications.weekendMode" | "notifications.quietHours", value: boolean | string) => {
        const before = quiet;
        setQuiet((current) => (current ? { ...current, [key]: value } : current));
        setBusy(key);
        try {
            setQuiet(await accountService.savePreferences({ [key]: value }));
        } catch (caught) {
            setQuiet(before);
            setNote({ tone: "bad", text: messageOf(caught, "Could not save that.") });
        } finally {
            setBusy(null);
        }
    };

    const resubscribe = async () => {
        setBusy("resubscribe");
        setNote(null);
        try {
            await accountService.resubscribe();
            setNote({ tone: "ok", text: "You are subscribed to ADX emails again." });
        } catch (caught) {
            setNote({ tone: "bad", text: messageOf(caught, "Could not subscribe you again.") });
        }
        /* Read again either way: the sentence goes only when the server says the stamp has. */
        await readQuiet();
        setBusy(null);
    };

    const switches = rows ? matrixRows(rows) : [];
    const allOn = switches.length > 0 && switches.every((row) => row.enabled);
    const unsubscribed = unsubscribedSentence(quiet);
    const window = textAt(quiet, "notifications.quietHours", QUIET_WINDOWS[0]);

    return (
        <SettingsCard
            id="notifications"
            title="Notifications"
            line={rows ? `What ADX tells you, and where · ${enabledSummary(rows)}` : "What ADX tells you, and where"}
            actions={
                rows ? (
                    <button type="button" onClick={() => void setAll(!allOn)} className={btnSmall} disabled={busy !== null}>
                        {busy === "all" ? "Saving…" : allOn ? "Turn all off" : "Turn all on"}
                    </button>
                ) : undefined
            }
        >
            {!rows ? (
                <p className="text-sm text-dim">Loading your notification settings…</p>
            ) : (
                <div className="overflow-x-auto rounded-md border border-line">
                    <table className="w-full min-w-[560px] text-sm">
                        <thead>
                            <tr className="bg-ground text-left text-xs font-medium text-dim">
                                <th scope="col" className="px-3 py-2.5 font-medium">
                                    What
                                </th>
                                {NOTIFICATION_CHANNELS.map((channel) => (
                                    <th key={channel} scope="col" className="w-[84px] px-2 py-2.5 text-center font-medium">
                                        {CHANNEL_LABEL[channel]}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {NOTIFICATION_TYPES.map((type) => (
                                <tr key={type} className="border-t border-line">
                                    <th scope="row" className="px-3 py-3 text-left font-normal">
                                        <span className="block text-sm font-medium text-ink">{KIND_COPY[type].label}</span>
                                        {KIND_COPY[type].hint && <span className="block text-xs text-dim">{KIND_COPY[type].hint}</span>}
                                    </th>
                                    {NOTIFICATION_CHANNELS.map((channel) => {
                                        const row = at(type, channel);
                                        const locked = isLocked(channel, row);
                                        return (
                                            <td key={channel} className="px-2 py-3 text-center">
                                                {locked ? (
                                                    <span className="text-[11px] font-medium text-dim">Always on</span>
                                                ) : (
                                                    <span className="inline-flex">
                                                        <Toggle checked={row?.enabled ?? false} onChange={(value) => void set(type, channel, value)} disabled={busy === "all"} label={`${KIND_COPY[type].label} by ${CHANNEL_LABEL[channel]}`} />
                                                    </span>
                                                )}
                                            </td>
                                        );
                                    })}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
            <ul className="mt-3 space-y-1 text-xs text-dim">
                <li>In ADX is the list the bell counts — always on, because it is the record of what ADX told you.</li>
                <li>Push reaches your phone through the ADX app; its sound and how it interrupts are set in your phone’s notification settings.</li>
                <li>A sign-in code and a service notice by SMS are security messages and always go.</li>
            </ul>

            {unsubscribed && (
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-md bg-warning-soft px-3 py-3">
                    <p className="text-sm text-ink">{unsubscribed}</p>
                    <button type="button" onClick={() => void resubscribe()} className={btnSmall} disabled={busy !== null}>
                        {busy === "resubscribe" ? "Subscribing…" : "Subscribe again"}
                    </button>
                </div>
            )}

            <div className="mt-5 border-t border-line pt-4">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-dim">Quiet hours</p>
                <div className="mt-2 divide-y divide-line">
                    <SettingRow label="Do not disturb" hint={quietHoursLabel(window)}>
                        <Toggle checked={boolAt(quiet, "notifications.doNotDisturb")} onChange={(value) => void setQuietKey("notifications.doNotDisturb", value)} disabled={quiet === null || busy !== null} label="Do not disturb" />
                    </SettingRow>
                    <SettingRow label="Quiet window" hint="When ADX holds everything but the time-critical">
                        <select value={window} onChange={(event) => void setQuietKey("notifications.quietHours", event.target.value)} disabled={quiet === null || busy !== null} aria-label="Quiet window" className="h-9 rounded-md border border-line bg-white px-3 text-sm text-ink focus:border-ink focus:outline-none">
                            {Array.from(new Set([window, ...QUIET_WINDOWS])).map((option) => (
                                <option key={option} value={option}>
                                    {quietHoursLabel(option)}
                                </option>
                            ))}
                        </select>
                    </SettingRow>
                    <SettingRow label="Weekend mode" hint="Quiet all day Saturday and Sunday">
                        <Toggle checked={boolAt(quiet, "notifications.weekendMode")} onChange={(value) => void setQuietKey("notifications.weekendMode", value)} disabled={quiet === null || busy !== null} label="Weekend mode" />
                    </SettingRow>
                </div>
                <p className="mt-3 text-xs text-dim">A time-critical order offer still reaches you in ADX during quiet hours — it expires in 25 minutes, and a missed one costs you the job.</p>
            </div>
            <NoteLine note={note} className="mt-3" />
        </SettingsCard>
    );
}
