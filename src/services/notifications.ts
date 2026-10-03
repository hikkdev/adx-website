import { api } from "@/lib/api-client";
import type { Party } from "@/services/party";

/**
 * What ADX has told a person, over the `/notifications` routes — the same
 * list the apps' bell counts (`mobile/shared/features/notifications`). One
 * feed per account, whichever side it is read from; the side only decides
 * which page a row's record opens on.
 *
 *   GET   /notifications?limit&offset   → { notifications, unreadCount, readCount }
 *   PATCH /notifications/:id/read
 *   PATCH /notifications/read-all
 */

export type NotificationType = "BOOKING" | "PAYOUT" | "KYC" | "MESSAGE" | "SYSTEM" | "ORDER" | "DISPUTE" | "ANNOUNCEMENT" | "WEEKLY_SUMMARY" | "WORK" | (string & {});

export interface AppNotification {
    id: string;
    type: NotificationType;
    title: string;
    subtitle: string | null;
    message: string;
    suggestedAction: string | null;
    relatedId: string | null;
    /** Lot E9: what `relatedId` names — ORDER, CAMPAIGN, TICKET… — so a row opens the right record. */
    relatedType?: string | null;
    /** Lot E9: the structured facts behind a notice drawn whole (an ANNOUNCEMENT's `{ title, body, importance }`). */
    payload?: Record<string, unknown> | null;
    read: boolean;
    createdAt: string;
}

export interface NotificationPage {
    notifications: AppNotification[];
    unreadCount: number;
    readCount?: number;
}

/** How many rows one page of the feed holds; "Load more" reads the next. */
export const NOTIFICATIONS_PAGE = 20;

/** How many the bell's dropdown shows. */
export const BELL_PAGE = 6;

export const notificationsService = {
    list: (opts: { limit?: number; offset?: number } = {}) => {
        const params = new URLSearchParams();
        if (opts.limit !== undefined) params.set("limit", String(opts.limit));
        if (opts.offset) params.set("offset", String(opts.offset));
        const query = params.toString();
        return api.get<NotificationPage>(query ? `/notifications?${query}` : "/notifications");
    },
    markRead: (id: string) => api.patch<unknown>(`/notifications/${encodeURIComponent(id)}/read`, {}),
    markAllRead: () => api.patch<unknown>("/notifications/read-all", {}),
};

/* ------------------------------------------------------------------ */
/* Announcements                                                       */
/* ------------------------------------------------------------------ */

export type AnnouncementImportance = "NORMAL" | "CRITICAL";

export interface AnnouncementView {
    title: string;
    body: string;
    importance: AnnouncementImportance;
}

/**
 * The announcement behind a row, or null for a row that is not one. The
 * payload wins; a row written before it has only the prose, and a CRITICAL
 * one was stamped with the subtitle "Service notice" — the app's rule.
 */
export function announcementOf(item: Pick<AppNotification, "type" | "title" | "subtitle" | "message" | "payload">): AnnouncementView | null {
    if (item.type !== "ANNOUNCEMENT") return null;
    const payload = item.payload ?? {};
    const title = typeof payload.title === "string" && payload.title.trim() ? payload.title : item.title;
    const body = typeof payload.body === "string" && payload.body.trim() ? payload.body : item.message;
    const importance: AnnouncementImportance = payload.importance === "CRITICAL" || (payload.importance === undefined && item.subtitle === "Service notice") ? "CRITICAL" : "NORMAL";
    return { title, body, importance };
}

/* ------------------------------------------------------------------ */
/* The record a row names                                              */
/* ------------------------------------------------------------------ */

/** The backend's closed list (`notifications/README.md`, "relatedType and payload"), plus the two the apps read ahead of it. */
export const RELATED_TYPES = ["ORDER", "PUBLISHER", "ADVERTISER", "CAMPAIGN", "STATEMENT", "WITHDRAWAL", "TICKET", "DISPUTE", "ANNOUNCEMENT", "LISTING", "SUBSCRIPTION", "PACKAGE_SALE", "KYC", "WORK", "LEAD", "VERIFICATION_SESSION"] as const;

export type RelatedType = (typeof RELATED_TYPES)[number];

export interface RelatedRecord {
    type: RelatedType;
    id: string;
    /** The notice's own kind — a KYC notice about a PUBLISHER opens the KYC door, not the publisher. */
    notice?: string;
}

/**
 * Cashfree Phase 2: the desk's "Resend on backup" notice names the identity
 * check to finish (`relatedType: VERIFICATION_SESSION`). A row written
 * before the backend stamped the type is known by its title alone.
 */
export const FINISH_IDENTITY_CHECK = "Finish your identity check";

export const isRelatedType = (value: unknown): value is RelatedType => typeof value === "string" && (RELATED_TYPES as readonly string[]).includes(value);

/**
 * The record a row names, or null — `related.ts` in the apps, read the same
 * way: a known type with an id; a KYC notice resolves to the KYC door even
 * when it names nothing openable; an older WORK row names its task by id.
 */
export function relatedOf(item: (Pick<AppNotification, "relatedType" | "relatedId" | "type"> & { title?: string | null }) | null | undefined): RelatedRecord | null {
    if (!item) return null;
    const kind = typeof item.type === "string" ? item.type : null;
    const notice = kind ? { notice: kind } : {};
    const id = typeof item.relatedId === "string" && item.relatedId.trim() !== "" ? item.relatedId : null;
    // Cashfree Phase 2: an older "Finish your identity check" row carries the session id without its type.
    if (kind === "KYC" && id && !isRelatedType(item.relatedType) && item.title?.trim() === FINISH_IDENTITY_CHECK) return { type: "VERIFICATION_SESSION", id, notice: "KYC" };
    if (isRelatedType(item.relatedType) && id) return { type: item.relatedType, id, ...notice };
    if (kind === "KYC") return { type: "KYC", id: id ?? "kyc", notice: "KYC" };
    if (kind === "WORK" && id) return { type: "WORK", id, notice: "WORK" };
    return null;
}

const enc = encodeURIComponent;

/** Each side's KYC door on the website. */
export const KYC_HREF: Record<Party, string> = { ADVERTISER: "/advertiser/verify", PUBLISHER: "/publisher/profile/verify", PRINT_PARTNER: "/partner/verify" };

/** Each side's full feed. */
export const FEED_HREF: Record<Party, string> = { ADVERTISER: "/advertiser/notifications", PUBLISHER: "/publisher/notifications", PRINT_PARTNER: "/partner/notifications" };

/**
 * The website page a record opens on, from the side the feed is read on —
 * the app's `openRelated` (App.tsx) mapped to the website's routes. A kind
 * the side has no page for answers null, and the row stays where it is,
 * whole, as the app's feed does.
 */
export function hrefForRelated(record: RelatedRecord | null, party: Party): string | null {
    if (!record) return null;
    // Cashfree Phase 2: an identity check opens on the side's KYC door, as it stands.
    if (record.type === "VERIFICATION_SESSION") return `${KYC_HREF[party]}?session=${enc(record.id)}`;
    if (record.notice === "KYC" || record.type === "KYC") return KYC_HREF[party];
    const id = enc(record.id);
    if (party === "ADVERTISER") {
        switch (record.type) {
            case "ORDER":
                return `/advertiser/proofs/${id}`;
            case "CAMPAIGN":
                return `/advertiser/campaigns/${id}`;
            case "PACKAGE_SALE":
                return "/advertiser/billing";
            case "TICKET":
                return `/advertiser/requests/${id}`;
            case "DISPUTE":
                return `/advertiser/disputes/${id}`;
            case "LISTING":
                return `/spaces/${id}`;
            case "ADVERTISER":
                return "/advertiser/account";
            default:
                return null;
        }
    }
    if (party === "PUBLISHER") {
        switch (record.type) {
            case "ORDER":
                return `/publisher/bookings/${id}`;
            case "LISTING":
                return `/publisher/listings/${id}`;
            case "STATEMENT":
                return "/publisher/earnings";
            case "WITHDRAWAL":
                return `/publisher/earnings/${id}`;
            case "SUBSCRIPTION":
                return "/publisher/subscription";
            case "TICKET":
                return `/publisher/help/${id}`;
            case "DISPUTE":
                return `/publisher/disputes/${id}`;
            case "PUBLISHER":
                return "/publisher/profile";
            case "CAMPAIGN":
                return "/publisher/bookings";
            default:
                return null;
        }
    }
    switch (record.type) {
        case "ORDER":
            // The notice names the order; the jobs page finds the shop's job for it (`?orderId=`) and opens it.
            return `/partner/jobs?orderId=${id}`;
        case "STATEMENT":
        case "WITHDRAWAL":
            return "/partner/earnings";
        case "TICKET":
            return `/partner/help/${id}`;
        default:
            return null;
    }
}

/* ------------------------------------------------------------------ */
/* The list                                                            */
/* ------------------------------------------------------------------ */

export type NotificationFilter = "ALL" | "ORDERS" | "PAYMENTS" | "SYSTEM";

export const FILTERS: { id: NotificationFilter; label: string; types: string[] | null }[] = [
    { id: "ALL", label: "All", types: null },
    { id: "ORDERS", label: "Orders", types: ["ORDER", "BOOKING", "DISPUTE"] },
    { id: "PAYMENTS", label: "Payments", types: ["PAYOUT"] },
    { id: "SYSTEM", label: "System", types: ["SYSTEM", "KYC", "MESSAGE", "ANNOUNCEMENT", "WEEKLY_SUMMARY"] },
];

/** Which rows a chip keeps. */
export function matchesFilter(item: Pick<AppNotification, "type">, filter: NotificationFilter): boolean {
    const spec = FILTERS.find((entry) => entry.id === filter);
    return !spec?.types || spec.types.includes(item.type);
}

/** The feed's two groups: what arrived today, and everything before it. */
export function groupByDay<T extends { createdAt: string }>(items: T[], now: Date = new Date()): { label: string; items: T[] }[] {
    const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const today = items.filter((item) => new Date(item.createdAt).getTime() >= dayStart);
    const earlier = items.filter((item) => new Date(item.createdAt).getTime() < dayStart);
    const groups: { label: string; items: T[] }[] = [];
    if (today.length) groups.push({ label: "Today", items: today });
    if (earlier.length) groups.push({ label: "Earlier", items: earlier });
    return groups;
}

/** "now", "2m", "1h", "3d", then the date — the row's time as the app prints it. */
export function timeAgo(iso: string, now: Date = new Date()): string {
    const at = new Date(iso);
    const seconds = Math.max(0, Math.floor((now.getTime() - at.getTime()) / 1000));
    if (seconds < 60) return "now";
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d`;
    return at.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

/** The bell's count as drawn: nothing at zero, "99+" past it. */
export const badgeLabel = (count: number): string | null => (count <= 0 ? null : count > 99 ? "99+" : String(count));

/** The second line of a row: the subtitle, else the message. */
export const rowLine = (item: Pick<AppNotification, "subtitle" | "message">): string => (item.subtitle && item.subtitle.trim() ? item.subtitle : item.message);
