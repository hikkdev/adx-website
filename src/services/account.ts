import { api, apiBlob, ApiError } from "@/lib/api-client";
import { normaliseMobile } from "@/services/auth";
import { birthDateFault } from "@/services/party";

/**
 * Each side's settings page on the web — the same person, over the same `users`
 * and `auth` routes the ADX app's account screens use
 * (`mobile/shared/features/account/*`): who they are (`/users/me`), their
 * picture (an AVATAR upload, cut to a 512 px square by the server), the
 * contacts beside the primary pair (`/users/me/contacts*`), the two-code
 * number change (`/auth/change-mobile/*`), the preference map
 * (`/users/me/preferences`), the notification matrix
 * (`/notifications/preferences`), the data export and the closure request.
 * One file for all three sides: nothing here is about one party.
 */

/* ------------------------------------------------------------------ */
/* The person                                                          */
/* ------------------------------------------------------------------ */

export type Gender = "MALE" | "FEMALE" | "OTHER" | "PREFER_NOT_TO_SAY";

/** The four answers `PATCH /users/me` accepts, as the app's basics screen words them. */
export const GENDERS: { id: Gender; label: string }[] = [
    { id: "FEMALE", label: "Female" },
    { id: "MALE", label: "Male" },
    { id: "OTHER", label: "Other" },
    { id: "PREFER_NOT_TO_SAY", label: "Prefer not to say" },
];

/** `GET /users/me` — the fields the settings page draws. */
export interface AccountProfile {
    id: string;
    displayId?: string | null;
    mobile: string;
    name: string | null;
    firstName?: string | null;
    lastName?: string | null;
    /** YYYY-MM-DD, or an ISO instant on an older read. */
    dateOfBirth?: string | null;
    gender?: string | null;
    email: string | null;
    mobileVerifiedAt?: string | null;
    emailVerifiedAt?: string | null;
    avatarUrl: string | null;
    hasPassword: boolean;
    language: string;
    roles: string[];
}

/** What `PATCH /users/me` takes from this page. The email is never here: it changes only through its code. */
export interface ProfilePatch {
    firstName?: string;
    lastName?: string;
    language?: string;
    dateOfBirth?: string;
    gender?: Gender;
    /** The URL an AVATAR upload answered; null removes the picture. */
    avatarUrl?: string | null;
}

/** The crop as fractions of the picture, the way the server's `uploads/avatar.ts` reads it. */
export type CropRect = { x: number; y: number; width: number; height: number };

export interface UploadedFile {
    id: string;
    url: string;
}

/* ------------------------------------------------------------------ */
/* Contacts                                                            */
/* ------------------------------------------------------------------ */

export type ContactKind = "EMAIL" | "PHONE";

export interface UserContact {
    id: string;
    kind: ContactKind;
    value: string;
    label: string | null;
    verifiedAt: string | null;
    /** Who put it on the account; absent on an older read. */
    addedBy?: { id: string; name: string | null };
    createdAt: string;
}

export interface ContactsView {
    primary: { mobile: string; mobileVerifiedAt: string | null; email: string | null; emailVerified: boolean };
    contacts: UserContact[];
}

export interface CodeSent {
    expiresInSeconds?: number;
    resendAfterSeconds?: number;
    sendsRemaining?: number;
    /** Outside production only — the page pre-fills it the way the sign-in page does. */
    devOtp?: string;
}

export interface EmailCodeSent extends CodeSent {
    email: string;
}

export interface PrimaryChange {
    kind: ContactKind;
    before: string | null;
    after: string;
    wasVerified: boolean;
    primary: { mobile: string; email: string | null };
    /** True on a PHONE swap: every session went, this one included. */
    sessionsRevoked: boolean;
}

/** 409 CONTACT_TAKEN — the value is on another ADX account. */
export const isContactTaken = (caught: unknown): boolean => caught instanceof ApiError && caught.code === "CONTACT_TAKEN";

/* ------------------------------------------------------------------ */
/* The number change                                                   */
/* ------------------------------------------------------------------ */

export type ChangePhoneStage = "number" | "old-code" | "new-code" | "done";

export interface MobileChangeDone {
    mobile: string;
    previousMobile: string | null;
    sessionsRevoked: boolean;
}

/* ------------------------------------------------------------------ */
/* Preferences                                                         */
/* ------------------------------------------------------------------ */

export type PreferenceKey =
    | "privacy.showName"
    | "privacy.showPhoto"
    | "privacy.locationSharing"
    | "privacy.backgroundLocation"
    | "privacy.personalisedTips"
    | "notifications.doNotDisturb"
    | "notifications.quietHours"
    | "notifications.weekendMode";

/** The map `GET /users/me/preferences` answers — whole, every key defaulted — and the unsubscribe stamp beside it. */
export type PreferenceRead = Partial<Record<PreferenceKey, boolean | string>> & Record<string, unknown> & { emailUnsubscribedAt?: string | null };
export type PreferencePatch = Partial<Record<PreferenceKey, boolean | string>>;

export const boolAt = (map: PreferenceRead | null, key: PreferenceKey, fallback = false): boolean => (typeof map?.[key] === "boolean" ? (map[key] as boolean) : fallback);
export const textAt = (map: PreferenceRead | null, key: PreferenceKey, fallback: string): string => (typeof map?.[key] === "string" ? (map[key] as string) : fallback);

/** The three windows the app offers for quiet hours, in its order. */
export const QUIET_WINDOWS = ["22:00-07:00", "21:00-08:00", "23:00-06:00"] as const;

/** "10:00 PM to 7:00 AM" — the window as the app prints it, from "22:00-07:00". */
export function quietHoursLabel(window: string): string {
    const [from, to] = window.split("-");
    const clock = (value: string | undefined) => {
        const [hours, minutes] = (value ?? "").split(":").map(Number);
        if (hours === undefined || Number.isNaN(hours)) return value ?? "";
        const hour12 = hours % 12 === 0 ? 12 : hours % 12;
        return `${hour12}:${String(minutes ?? 0).padStart(2, "0")} ${hours < 12 ? "AM" : "PM"}`;
    };
    return `${clock(from)} to ${clock(to)}`;
}

/* ------------------------------------------------------------------ */
/* The notification matrix                                             */
/* ------------------------------------------------------------------ */

export type NotificationType = "ORDER" | "BOOKING" | "PAYOUT" | "KYC" | "MESSAGE" | "SYSTEM" | "DISPUTE" | "ANNOUNCEMENT" | "WEEKLY_SUMMARY";
export type NotificationChannel = "IN_APP" | "PUSH" | "EMAIL" | "SMS";

export const NOTIFICATION_TYPES: NotificationType[] = ["ORDER", "BOOKING", "PAYOUT", "KYC", "MESSAGE", "SYSTEM", "DISPUTE", "ANNOUNCEMENT", "WEEKLY_SUMMARY"];
export const NOTIFICATION_CHANNELS: NotificationChannel[] = ["IN_APP", "PUSH", "EMAIL", "SMS"];

export interface NotificationPreference {
    type: NotificationType;
    /** Absent on a body written before the channel axis; read as IN_APP. */
    channel?: NotificationChannel;
    enabled: boolean;
    mandatory?: boolean;
}

/** The kinds, as the app's Notification preferences screen words them. */
export const KIND_COPY: Record<NotificationType, { label: string; hint?: string }> = {
    ORDER: { label: "New order offers and updates", hint: "Time-critical — an offer expires in 25 minutes" },
    BOOKING: { label: "Booking updates" },
    PAYOUT: { label: "Payouts and earnings" },
    KYC: { label: "Identity and documents" },
    MESSAGE: { label: "Messages from ADX" },
    SYSTEM: { label: "System and account" },
    DISPUTE: { label: "Disputes", hint: "Case updates and decisions" },
    ANNOUNCEMENT: { label: "Announcements from ADX", hint: "Service notices and platform news" },
    WEEKLY_SUMMARY: { label: "Weekly campaign summary", hint: "Every Monday: reach, scans and spend across your campaigns" },
};

/** The rows the server never saves off: a sign-in code and a service notice by SMS. */
export function isMandatory(type: NotificationType, channel: NotificationChannel): boolean {
    return channel === "SMS" && (type === "SYSTEM" || type === "ANNOUNCEMENT");
}

/** The same defaults the server applies, so an unsaved switch reads the same on both sides. */
export function defaultEnabled(type: NotificationType, channel: NotificationChannel): boolean {
    if (isMandatory(type, channel)) return true;
    if (channel === "IN_APP") return true;
    if (channel === "PUSH") return type !== "SYSTEM";
    if (channel === "EMAIL") return type === "PAYOUT" || type === "ANNOUNCEMENT" || type === "WEEKLY_SUMMARY";
    return false;
}

/** The app's four sections, each with the kinds worth offering on that channel. */
export const CHANNEL_SECTIONS: { channel: NotificationChannel; label: string; note?: string; types: NotificationType[] }[] = [
    { channel: "IN_APP", label: "In the app and on the website", note: "The list the bell counts. Always on — this is the record of what ADX told you.", types: [...NOTIFICATION_TYPES] },
    {
        channel: "PUSH",
        label: "Push",
        note: "On your phone, even with ADX closed. The sound and how a group interrupts are set in your phone’s notification settings.",
        types: ["ORDER", "BOOKING", "PAYOUT", "DISPUTE", "MESSAGE"],
    },
    { channel: "EMAIL", label: "Email", types: ["PAYOUT", "KYC", "DISPUTE", "WEEKLY_SUMMARY"] },
    { channel: "SMS", label: "SMS", types: ["ORDER", "PAYOUT", "SYSTEM"] },
];

/** Every kind on every channel, defaulting the way the server does. */
export function fillPreferences(saved: readonly NotificationPreference[]): Required<NotificationPreference>[] {
    return NOTIFICATION_TYPES.flatMap((type) =>
        NOTIFICATION_CHANNELS.map((channel) => {
            const row = saved.find((entry) => entry.type === type && (entry.channel ?? "IN_APP") === channel);
            return { type, channel, enabled: row?.enabled ?? defaultEnabled(type, channel), mandatory: row?.mandatory ?? isMandatory(type, channel) };
        })
    );
}

/** The rows the matrix draws a switch for — in-app is the record and the mandatory rows are security messages. */
export function switchableRows(preferences: readonly NotificationPreference[]): NotificationPreference[] {
    return CHANNEL_SECTIONS.filter((section) => section.channel !== "IN_APP")
        .flatMap((section) =>
            section.types.map((type) => {
                const row = preferences.find((entry) => entry.type === type && (entry.channel ?? "IN_APP") === section.channel);
                return row ?? { type, channel: section.channel, enabled: defaultEnabled(type, section.channel), mandatory: isMandatory(type, section.channel) };
            })
        )
        .filter((row) => !row.mandatory);
}

/** Whether a row is drawn locked ("Always on"): the in-app record, or a row the server marks mandatory. */
export function isLocked(channel: NotificationChannel, row: Pick<NotificationPreference, "mandatory"> | undefined): boolean {
    return channel === "IN_APP" || row?.mandatory === true;
}

/**
 * The web's matrix: every kind on every channel — the server keeps a row
 * for each and the dispatcher reads each one (`mayDeliver(type, channel)`),
 * so every cell is a real switch. In-app and the mandatory rows are locked.
 */
export function matrixRows(preferences: readonly NotificationPreference[]): Required<NotificationPreference>[] {
    return fillPreferences(preferences).filter((row) => !isLocked(row.channel, row));
}

/** "18 of 26 on" — over the switches the matrix draws. */
export function enabledSummary(preferences: readonly NotificationPreference[]): string {
    const rows = matrixRows(preferences);
    return `${rows.filter((row) => row.enabled).length} of ${rows.length} on`;
}

/** Every switch the matrix draws, set one way — the "all off / all on" control. In-app and mandatory rows are left alone. */
export function setAllRows(preferences: readonly NotificationPreference[], enabled: boolean): NotificationPreference[] {
    return matrixRows(preferences).map((row) => ({ type: row.type, channel: row.channel, enabled }));
}

/** The channel columns, as the matrix heads them. */
export const CHANNEL_LABEL: Record<NotificationChannel, string> = { IN_APP: "In ADX", PUSH: "Push", EMAIL: "Email", SMS: "SMS" };

/** The sentence the Email section prints when the read carries the unsubscribe stamp. */
export function unsubscribedSentence(read: Pick<PreferenceRead, "emailUnsubscribedAt"> | null): string | null {
    const at = read?.emailUnsubscribedAt;
    if (typeof at !== "string" || !at) return null;
    return `You unsubscribed from ADX emails on ${fullDate(at)}.`;
}

/* ------------------------------------------------------------------ */
/* Download my data                                                    */
/* ------------------------------------------------------------------ */

export type DataExportStatus = "PENDING" | "READY" | "FAILED" | "EXPIRED";

export interface DataExportRequest {
    id: string;
    status: DataExportStatus;
    requestedAt: string;
    readyAt: string | null;
    expiresAt: string | null;
    fileId: string | null;
    deepLink?: string | null;
    error: string | null;
}

export const DATA_EXPORT_OPEN = "DATA_EXPORT_OPEN";
export const DATA_EXPORT_FILE_NAME = "adx-data-export.zip";

function isExportRequest(value: unknown): value is DataExportRequest {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    const row = value as { id?: unknown; status?: unknown };
    return typeof row.id === "string" && typeof row.status === "string";
}

/** The open request a 409 `DATA_EXPORT_OPEN` carries, or null for any other failure. */
export function openRequestOf(caught: unknown): DataExportRequest | null {
    if (!(caught instanceof ApiError) || caught.status !== 409) return null;
    const details = caught.details as { code?: unknown; request?: unknown } | undefined;
    if (details?.code !== DATA_EXPORT_OPEN && caught.code !== DATA_EXPORT_OPEN) return null;
    return isExportRequest(details?.request) ? details.request : null;
}

/** Whether the row's file can still be downloaded. */
export function exportReady(request: DataExportRequest | null): request is DataExportRequest & { fileId: string } {
    return request?.status === "READY" && typeof request.fileId === "string" && request.fileId !== "";
}

/** The state beside "Download my data": Preparing, Ready until <date>, Failed — nothing when there is none or it expired. */
export function exportRowValue(request: DataExportRequest | null): string | null {
    if (!request) return null;
    switch (request.status) {
        case "PENDING":
            return "Preparing";
        case "READY":
            return request.expiresAt ? `Ready until ${shortDate(request.expiresAt)}` : "Ready";
        case "FAILED":
            return "Failed";
        default:
            return null;
    }
}

/** The line under the row when the state needs a word more than the value gives. */
export function exportRowHint(request: DataExportRequest | null): string {
    if (!request || request.status === "EXPIRED") return "A zip of what ADX holds about you, ready within a few minutes and kept for seven days.";
    switch (request.status) {
        case "PENDING":
            return "A few minutes. ADX tells you when the copy is ready.";
        case "READY":
            return "A zip of what ADX holds about you.";
        case "FAILED":
            return request.error ? `${request.error} Ask again to retry.` : "The copy could not be built. Ask again to retry.";
    }
}

/** The feature switch refused the call — ops turned the export off. One mapping, the API client's (`isFeatureOff(caught, key?)`). */
export { isFeatureOff } from "@/lib/api-client";

/* ------------------------------------------------------------------ */
/* Closing the account                                                 */
/* ------------------------------------------------------------------ */

export interface ClosureCase {
    id: string;
    userId: string;
    ticketId: string | null;
    reason: string;
    decision: "PENDING" | "CLOSED" | "REFUSED";
    walletBalance: string | null;
    withdrawalsInFlight: number;
    openOrders: number;
    openWork: number;
    createdAt: string;
}

/** What the request sends when the reason is left blank — the server wants 3–500 characters. */
export const DEFAULT_CLOSURE_REASON = "Requested from Privacy & security on the website.";

export function closureReason(raw: string): string {
    const trimmed = raw.trim();
    return trimmed.length >= 3 ? trimmed.slice(0, 500) : DEFAULT_CLOSURE_REASON;
}

/* ------------------------------------------------------------------ */
/* Languages                                                           */
/* ------------------------------------------------------------------ */

/** The five languages the app offers, each in its own script over its English name. */
export const LANGUAGES: { code: string; native: string; english: string }[] = [
    { code: "en", native: "English", english: "English" },
    { code: "hi", native: "हिन्दी", english: "Hindi" },
    { code: "kn", native: "ಕನ್ನಡ", english: "Kannada" },
    { code: "ta", native: "தமிழ்", english: "Tamil" },
    { code: "te", native: "తెలుగు", english: "Telugu" },
];

export function languageName(code: string | null | undefined): string {
    return LANGUAGES.find((entry) => entry.code === code)?.english ?? "English";
}

/* ------------------------------------------------------------------ */
/* The service                                                         */
/* ------------------------------------------------------------------ */

export const accountService = {
    profile: () => api.get<AccountProfile>("/users/me"),
    updateProfile: (patch: ProfilePatch) => api.patch<AccountProfile>("/users/me", patch),

    /** QR-7: the picture — multipart `POST /upload` with purpose AVATAR and the crop as JSON fractions. */
    uploadAvatar: (file: Blob, fileName: string, crop: CropRect | null) => {
        const form = new FormData();
        form.append("file", file, fileName);
        form.append("purpose", "AVATAR");
        if (crop) form.append("crop", JSON.stringify(crop));
        return api.post<UploadedFile>("/upload", form);
    },

    /* The email, proved with an 8-letter code. */
    sendEmailCode: (email: string) => api.post<EmailCodeSent>("/users/me/email/send-code", { email }),
    verifyEmail: (email: string, code: string) => api.post<AccountProfile>("/users/me/email/verify", { email, code }),

    /* K-M: the contacts beside the primary pair. */
    contacts: () => api.get<ContactsView>("/users/me/contacts"),
    addContact: (input: { kind: ContactKind; value: string; label?: string }) => api.post<UserContact>("/users/me/contacts", input),
    removeContact: (id: string) => api.delete<{ message: string }>(`/users/me/contacts/${encodeURIComponent(id)}`),
    sendContactCode: (id: string) => api.post<CodeSent & { kind: ContactKind }>(`/users/me/contacts/${encodeURIComponent(id)}/send-code`, {}),
    verifyContact: (id: string, code: string) => api.post<UserContact>(`/users/me/contacts/${encodeURIComponent(id)}/verify`, { code }),
    makeContactPrimary: (id: string) => api.post<PrimaryChange>(`/users/me/contacts/${encodeURIComponent(id)}/make-primary`, {}),

    /* Lot D: the number change, two codes in order. */
    startMobileChange: (newMobile: string) => api.post<CodeSent & { sentTo?: "CURRENT" }>("/auth/change-mobile/start", { newMobile }),
    confirmOldMobile: (newMobile: string, code: string) => api.post<CodeSent & { sentTo?: "NEW" }>("/auth/change-mobile/confirm-old", { newMobile, code }),
    verifyMobileChange: (newMobile: string, code: string) => api.post<MobileChangeDone>("/auth/change-mobile/verify", { newMobile, code }),

    /* The preference map. */
    preferences: () => api.get<PreferenceRead>("/users/me/preferences"),
    savePreferences: (patch: PreferencePatch) => api.put<PreferenceRead>("/users/me/preferences", patch),
    resubscribe: () => api.post<{ emailUnsubscribedAt: null }>("/users/me/email-resubscribe", {}),

    /* The notification matrix. */
    notificationPreferences: () => api.get<NotificationPreference[]>("/notifications/preferences"),
    saveNotificationPreferences: (rows: NotificationPreference[]) => api.put<unknown>("/notifications/preferences", rows),

    /* G6: a copy of the person's data. */
    latestExport: async (): Promise<DataExportRequest | null> => {
        const answer = await api.get<unknown>("/users/me/data-export");
        return isExportRequest(answer) ? answer : null;
    },
    /** Asks for a fresh copy; answers the new request, or the open one a 409 names. */
    requestExport: async (): Promise<DataExportRequest> => {
        try {
            return await api.post<DataExportRequest>("/users/me/data-export", {});
        } catch (caught) {
            const open = openRequestOf(caught);
            if (open) return open;
            throw caught;
        }
    },
    exportFile: (fileId: string) => apiBlob(`/files/${encodeURIComponent(fileId)}`),

    /** Lot A: ask support to close the account — 201 opened a case, 200 found one pending; both read alike. */
    requestClosure: (reason: string) => api.post<{ case: ClosureCase; summary: unknown }>("/users/me/closure-request", { reason: closureReason(reason) }),
};

/* ------------------------------------------------------------------ */
/* Pure helpers                                                        */
/* ------------------------------------------------------------------ */

const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** "4 Apr" — the short date. */
export function shortDate(iso: string | null | undefined): string {
    if (!iso) return "";
    const at = new Date(iso);
    if (Number.isNaN(at.getTime())) return "";
    return `${at.getDate()} ${MONTHS_SHORT[at.getMonth()]}`;
}

/** "4 April 2026". */
export function fullDate(iso: string | null | undefined): string {
    if (!iso) return "";
    const at = new Date(iso);
    if (Number.isNaN(at.getTime())) return "";
    return `${at.getDate()} ${MONTHS_LONG[at.getMonth()]} ${at.getFullYear()}`;
}

/** The date of birth as the date input holds it (YYYY-MM-DD), whatever the read carried. */
export function dobInputValue(value: string | null | undefined): string {
    if (!value) return "";
    const match = /^(\d{4}-\d{2}-\d{2})/.exec(value);
    return match ? match[1]! : "";
}

/**
 * Why a date of birth would be refused — the server's calendar rule
 * (`birthDateFault`): a real day, not in the future, at most 120 years ago.
 * Any age is kept (29 Sep 2026): 18 or over is asked only to place an order.
 * Null when fine.
 */
export function dobProblem(value: string, now: Date = new Date()): string | null {
    if (!value) return null;
    const fault = birthDateFault(value, now);
    if (fault === "format") return "Use the date picker, or type the date as YYYY-MM-DD.";
    if (fault === "not-a-day") return "That is not a date.";
    if (fault === "future") return "That date is in the future.";
    if (fault === "too-old") return "Check the year.";
    return null;
}

/** The first and last name to start the form with: the stored pair, else the display name split at its last space. */
export function nameParts(profile: Pick<AccountProfile, "name" | "firstName" | "lastName">): { firstName: string; lastName: string } {
    if (profile.firstName || profile.lastName) return { firstName: profile.firstName ?? "", lastName: profile.lastName ?? "" };
    const words = (profile.name ?? "").trim().split(/\s+/).filter(Boolean);
    if (words.length <= 1) return { firstName: words[0] ?? "", lastName: "" };
    return { firstName: words.slice(0, -1).join(" "), lastName: words[words.length - 1]! };
}

/**
 * The two names as `PATCH /users/me` takes them (29 Sep 2026): both
 * together once either changed — the server composes the display name from
 * what is on file, so a last name sent alone to an account whose first name
 * was never stored would become the whole name. An emptied first name is
 * left alone (the server wants one), as is an emptied last name.
 */
export function namesPatch(before: { firstName: string; lastName: string }, after: { firstName: string; lastName: string }): Pick<ProfilePatch, "firstName" | "lastName"> {
    const first = after.firstName.trim();
    const last = after.lastName.trim();
    if (!first || (first === before.firstName.trim() && last === before.lastName.trim())) return {};
    return { firstName: first, ...(last ? { lastName: last } : {}) };
}

/** The patch a basics form sends: only what changed, trimmed — the two names together (`namesPatch`). */
export function basicsPatch(
    before: { firstName: string; lastName: string; dateOfBirth: string; gender: string },
    after: { firstName: string; lastName: string; dateOfBirth: string; gender: string }
): ProfilePatch {
    const patch: ProfilePatch = { ...namesPatch(before, after) };
    if (after.dateOfBirth && after.dateOfBirth !== before.dateOfBirth) patch.dateOfBirth = after.dateOfBirth;
    if (after.gender && after.gender !== before.gender && GENDERS.some((g) => g.id === after.gender)) patch.gender = after.gender as Gender;
    return patch;
}

/** "AK" — the initials on the avatar disc when there is no picture. */
export function initialsOf(name: string | null | undefined, fallback = "?"): string {
    const words = (name ?? "").trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) return fallback;
    return words
        .slice(0, 2)
        .map((word) => word[0]!.toUpperCase())
        .join("");
}

/** A number as the server keeps it (E.164), from what was typed. */
export function e164(raw: string): string {
    return normaliseMobile(raw);
}

/** The ten digits of an Indian number, for the "Enter the full ten-digit number" check. */
export function digitsOf(raw: string): string {
    return raw.replace(/\D/g, "");
}

/** The row's small line: the label, else the kind, "not verified", and who added it when it was not the person. */
export function contactHint(contact: Pick<UserContact, "label" | "kind" | "verifiedAt" | "addedBy">, selfId: string | null | undefined): string {
    const what = contact.label?.trim() || (contact.kind === "EMAIL" ? "Email" : "Phone number");
    const by = contact.addedBy && contact.addedBy.id !== selfId ? ` · added by ${contact.addedBy.name ?? "ADX"}` : "";
    return `${what}${contact.verifiedAt ? "" : " · not verified"}${by}`;
}

/** What the make-primary confirm says changes — the sign-in number, or where notices go. */
export function makePrimaryBody(contact: Pick<UserContact, "kind" | "value">, primary: ContactsView["primary"]): string {
    if (contact.kind === "PHONE") {
        return `${contact.value} becomes your sign-in number. Every device is signed out, this one included, and you sign in again with the new number. ${primary.mobile} stays on your account as a verified contact.`;
    }
    return primary.email
        ? `${contact.value} becomes where ADX sends your notices and receipts. ${primary.email} stays on your account as a verified contact.`
        : `${contact.value} becomes where ADX sends your notices and receipts.`;
}

/** Whether an email address is whole enough to send a code to. */
export const isEmail = (value: string): boolean => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());

/* ------------------------------------------------------------------ */
/* The avatar crop                                                     */
/* ------------------------------------------------------------------ */

/** The longest side a picked picture is downscaled to before it is sent, as the app does. */
export const AVATAR_PICK_MAX = 1600;

/** The scale at which the picture just covers the square window. */
export function coverScale(window: number, imageWidth: number, imageHeight: number): number {
    return Math.max(window / imageWidth, window / imageHeight);
}

/** Keeps the picture over the whole window: the offset may never expose the window's edge. */
export function clampOffset(offset: number, window: number, imageSide: number, scale: number): number {
    const shown = imageSide * scale;
    return Math.max(window - shown, Math.min(0, offset));
}

/** The crop as fractions, from the window's size, the picture's, and where the picture sits under the window. */
export function cropFromView(input: { window: number; imageWidth: number; imageHeight: number; scale: number; offsetX: number; offsetY: number }): CropRect {
    const { window, imageWidth, imageHeight, scale, offsetX, offsetY } = input;
    const size = window / scale;
    const clamp = (value: number, max: number) => Math.max(0, Math.min(value, max));
    const x = clamp(-offsetX / scale, Math.max(0, imageWidth - size));
    const y = clamp(-offsetY / scale, Math.max(0, imageHeight - size));
    return { x: x / imageWidth, y: y / imageHeight, width: Math.min(1, size / imageWidth), height: Math.min(1, size / imageHeight) };
}

/** The size a picture is drawn at before upload: the longest side at most `max`, never enlarged. */
export function downscaledSize(width: number, height: number, max = AVATAR_PICK_MAX): { width: number; height: number } {
    const longest = Math.max(width, height);
    if (longest <= max) return { width, height };
    const factor = max / longest;
    return { width: Math.round(width * factor), height: Math.round(height * factor) };
}

/** Saves a blob the browser holds as a file. */
export function saveFile(blob: Blob, fileName: string): void {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}
