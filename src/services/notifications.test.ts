import { beforeEach, describe, expect, it, vi } from "vitest";

const calls: { method: string; path: string; body?: unknown }[] = [];
vi.mock("@/lib/api-client", () => ({
    api: {
        get: vi.fn(async (path: string) => {
            calls.push({ method: "GET", path });
            return { notifications: [], unreadCount: 0 };
        }),
        patch: vi.fn(async (path: string, body?: unknown) => {
            calls.push({ method: "PATCH", path, body });
            return {};
        }),
    },
}));

import {
    announcementOf,
    badgeLabel,
    FEED_HREF,
    groupByDay,
    hrefForRelated,
    KYC_HREF,
    matchesFilter,
    notificationsService,
    relatedOf,
    rowLine,
    timeAgo,
    type AppNotification,
} from "./notifications";

const row = (over: Partial<AppNotification> = {}): AppNotification => ({
    id: "n1",
    type: "ORDER",
    title: "Booking accepted",
    subtitle: null,
    message: "Skyline accepted your booking.",
    suggestedAction: null,
    relatedId: "ord1",
    relatedType: "ORDER",
    payload: null,
    read: false,
    createdAt: "2026-09-26T08:00:00.000Z",
    ...over,
});

beforeEach(() => {
    calls.length = 0;
});

describe("the feed's routes", () => {
    it("pages by limit and offset, and marks one or all read", async () => {
        await notificationsService.list();
        await notificationsService.list({ limit: 20 });
        await notificationsService.list({ limit: 20, offset: 40 });
        await notificationsService.markRead("n 1");
        await notificationsService.markAllRead();
        expect(calls).toEqual([
            { method: "GET", path: "/notifications" },
            { method: "GET", path: "/notifications?limit=20" },
            { method: "GET", path: "/notifications?limit=20&offset=40" },
            { method: "PATCH", path: "/notifications/n%201/read", body: {} },
            { method: "PATCH", path: "/notifications/read-all", body: {} },
        ]);
    });
});

describe("the record a row names", () => {
    it("reads a known type with an id, and nothing else", () => {
        expect(relatedOf(row())).toEqual({ type: "ORDER", id: "ord1", notice: "ORDER" });
        expect(relatedOf(row({ relatedType: "FRAUD_CASE" }))).toBeNull();
        expect(relatedOf(row({ relatedId: "  " }))).toBeNull();
        expect(relatedOf(null)).toBeNull();
    });

    it("sends a KYC notice to the KYC door even when it names a publisher or nothing", () => {
        expect(relatedOf(row({ type: "KYC", relatedType: "PUBLISHER", relatedId: "pub1" }))).toEqual({ type: "PUBLISHER", id: "pub1", notice: "KYC" });
        expect(relatedOf(row({ type: "KYC", relatedType: null, relatedId: null }))).toEqual({ type: "KYC", id: "kyc", notice: "KYC" });
        expect(hrefForRelated(relatedOf(row({ type: "KYC", relatedType: "PUBLISHER", relatedId: "pub1" })), "PUBLISHER")).toBe(KYC_HREF.PUBLISHER);
        expect(hrefForRelated({ type: "KYC", id: "kyc" }, "ADVERTISER")).toBe("/advertiser/verify");
        expect(hrefForRelated({ type: "KYC", id: "kyc" }, "PRINT_PARTNER")).toBe("/partner/verify");
    });

    it("maps each record to the page it opens on, by side", () => {
        expect(hrefForRelated({ type: "ORDER", id: "o1" }, "PUBLISHER")).toBe("/publisher/bookings/o1");
        expect(hrefForRelated({ type: "ORDER", id: "o1" }, "ADVERTISER")).toBe("/advertiser/proofs/o1");
        expect(hrefForRelated({ type: "ORDER", id: "o1" }, "PRINT_PARTNER")).toBe("/partner/jobs?orderId=o1");
        expect(hrefForRelated({ type: "CAMPAIGN", id: "c1" }, "ADVERTISER")).toBe("/advertiser/campaigns/c1");
        expect(hrefForRelated({ type: "TICKET", id: "t1" }, "ADVERTISER")).toBe("/advertiser/requests/t1");
        expect(hrefForRelated({ type: "TICKET", id: "t1" }, "PUBLISHER")).toBe("/publisher/help/t1");
        expect(hrefForRelated({ type: "TICKET", id: "t1" }, "PRINT_PARTNER")).toBe("/partner/help/t1");
        expect(hrefForRelated({ type: "DISPUTE", id: "d1" }, "PUBLISHER")).toBe("/publisher/disputes/d1");
        expect(hrefForRelated({ type: "LISTING", id: "l1" }, "PUBLISHER")).toBe("/publisher/listings/l1");
        expect(hrefForRelated({ type: "WITHDRAWAL", id: "w1" }, "PUBLISHER")).toBe("/publisher/earnings/w1");
        expect(hrefForRelated({ type: "SUBSCRIPTION", id: "s1" }, "PUBLISHER")).toBe("/publisher/subscription");
        expect(hrefForRelated({ type: "PACKAGE_SALE", id: "p1" }, "ADVERTISER")).toBe("/advertiser/billing");
    });

    it("opens nothing for a record the side has no page for", () => {
        expect(hrefForRelated({ type: "WORK", id: "w1" }, "ADVERTISER")).toBeNull();
        expect(hrefForRelated({ type: "LEAD", id: "l1" }, "PUBLISHER")).toBeNull();
        expect(hrefForRelated({ type: "DISPUTE", id: "d1" }, "PRINT_PARTNER")).toBeNull();
        expect(hrefForRelated(null, "ADVERTISER")).toBeNull();
        expect(FEED_HREF.PRINT_PARTNER).toBe("/partner/notifications");
    });

    it("escapes an id before it goes into a path", () => {
        expect(hrefForRelated({ type: "CAMPAIGN", id: "a/b" }, "ADVERTISER")).toBe("/advertiser/campaigns/a%2Fb");
    });
});

describe("announcements", () => {
    it("prefers the payload, and reads CRITICAL off an older row's subtitle", () => {
        expect(announcementOf(row())).toBeNull();
        expect(announcementOf(row({ type: "ANNOUNCEMENT", payload: { title: "Downtime", body: "Tonight 2–3 AM", importance: "CRITICAL" } }))).toEqual({ title: "Downtime", body: "Tonight 2–3 AM", importance: "CRITICAL" });
        expect(announcementOf(row({ type: "ANNOUNCEMENT", title: "T", message: "M", subtitle: "Service notice", payload: null }))).toEqual({ title: "T", body: "M", importance: "CRITICAL" });
        expect(announcementOf(row({ type: "ANNOUNCEMENT", title: "T", message: "M", subtitle: null }))?.importance).toBe("NORMAL");
    });
});

describe("the list", () => {
    it("filters by the four chips", () => {
        expect(matchesFilter(row({ type: "DISPUTE" }), "ORDERS")).toBe(true);
        expect(matchesFilter(row({ type: "PAYOUT" }), "ORDERS")).toBe(false);
        expect(matchesFilter(row({ type: "PAYOUT" }), "PAYMENTS")).toBe(true);
        expect(matchesFilter(row({ type: "ANNOUNCEMENT" }), "SYSTEM")).toBe(true);
        expect(matchesFilter(row({ type: "ANYTHING" }), "ALL")).toBe(true);
    });

    it("groups today and earlier", () => {
        const now = new Date(2026, 8, 26, 15, 0);
        const groups = groupByDay([row({ id: "a", createdAt: new Date(2026, 8, 26, 9).toISOString() }), row({ id: "b", createdAt: new Date(2026, 8, 25, 23).toISOString() })], now);
        expect(groups.map((g) => [g.label, g.items.map((i) => i.id)])).toEqual([
            ["Today", ["a"]],
            ["Earlier", ["b"]],
        ]);
        expect(groupByDay([], now)).toEqual([]);
    });

    it("prints the time as the app does", () => {
        const now = new Date("2026-09-26T12:00:00Z");
        expect(timeAgo("2026-09-26T11:59:30Z", now)).toBe("now");
        expect(timeAgo("2026-09-26T11:58:00Z", now)).toBe("2m");
        expect(timeAgo("2026-09-26T09:00:00Z", now)).toBe("3h");
        expect(timeAgo("2026-09-23T12:00:00Z", now)).toBe("3d");
        expect(timeAgo("2026-09-01T12:00:00Z", now)).toMatch(/Sept?/);
    });

    it("draws the badge and the second line", () => {
        expect(badgeLabel(0)).toBeNull();
        expect(badgeLabel(7)).toBe("7");
        expect(badgeLabel(120)).toBe("99+");
        expect(rowLine(row({ subtitle: "Order ORD-1" }))).toBe("Order ORD-1");
        expect(rowLine(row({ subtitle: " " }))).toBe("Skyline accepted your booking.");
    });
});

describe("Cashfree Phase 2: the desk's \"Resend on backup\" notice", () => {
    it("opens the identity check its VERIFICATION_SESSION names on the side's KYC door", () => {
        const notice = row({ type: "KYC", relatedType: "VERIFICATION_SESSION", relatedId: "vs 1", title: "Finish your identity check" });
        expect(relatedOf(notice)).toEqual({ type: "VERIFICATION_SESSION", id: "vs 1", notice: "KYC" });
        expect(hrefForRelated(relatedOf(notice), "PUBLISHER")).toBe("/publisher/profile/verify?session=vs%201");
        expect(hrefForRelated(relatedOf(notice), "ADVERTISER")).toBe("/advertiser/verify?session=vs%201");
        expect(hrefForRelated(relatedOf(notice), "PRINT_PARTNER")).toBe("/partner/verify?session=vs%201");
    });

    it("lets the type decide, whatever the title says", () => {
        const reworded = row({ type: "KYC", relatedType: "VERIFICATION_SESSION", relatedId: "vs_2", title: "Your identity check is waiting" });
        expect(hrefForRelated(relatedOf(reworded), "ADVERTISER")).toBe("/advertiser/verify?session=vs_2");
    });

    it("still opens an older row that carries only the title", () => {
        const older = row({ type: "KYC", relatedType: null, relatedId: "vs_3", title: "Finish your identity check" });
        expect(relatedOf(older)).toEqual({ type: "VERIFICATION_SESSION", id: "vs_3", notice: "KYC" });
        expect(hrefForRelated(relatedOf(older), "PUBLISHER")).toBe("/publisher/profile/verify?session=vs_3");
    });

    it("leaves every other KYC notice on the plain KYC door", () => {
        expect(hrefForRelated(relatedOf(row({ type: "KYC", relatedType: null, relatedId: "kyc_1", title: "KYC approved" })), "ADVERTISER")).toBe("/advertiser/verify");
        expect(hrefForRelated(relatedOf(row({ type: "KYC", relatedType: "PUBLISHER", relatedId: "pub1", title: "Finish your identity check" })), "PUBLISHER")).toBe(KYC_HREF.PUBLISHER);
    });
});
