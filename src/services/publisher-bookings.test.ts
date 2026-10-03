import { beforeEach, describe, expect, it, vi } from "vitest";

const calls: { method: string; path: string; body?: unknown }[] = [];
vi.mock("@/lib/api-client", async (original) => {
    const real = await original<typeof import("@/lib/api-client")>();
    return {
        ...real,
        api: {
            get: vi.fn(async (path: string) => {
                calls.push({ method: "GET", path });
                return {};
            }),
            post: vi.fn(async (path: string, body?: unknown) => {
                calls.push({ method: "POST", path, body });
                return {};
            }),
        },
    };
});

import {
    creativeKind,
    disputeHref,
    etaLine,
    filterCounts,
    filterFromParam,
    matchesFilter,
    matchesSearch,
    needsPublisher,
    publisherBookings,
    runState,
    selfInstallFiled,
    sinceWhen,
    stagesDone,
    stagesFor,
    timeLeft,
    waitingLine,
} from "./publisher-bookings";
import type { Booking, BookingDetail, BookingsPage } from "./publisher-workspace";

const NOW = new Date("2026-10-15T10:00:00.000Z").getTime();

const booking = (over: Partial<BookingDetail> = {}): BookingDetail => ({
    id: "cmu5tney600124kvvo64jo8cf",
    displayId: "BKG-1510-2601",
    status: "PENDING_PUBLISHER",
    campaignName: "Aster Festive Launch",
    designUrl: null,
    startDate: "2026-10-12T00:00:00.000Z",
    endDate: "2026-10-25T00:00:00.000Z",
    notes: null,
    meetingPlace: null,
    slotTime: null,
    slotCounterCount: 0,
    publisherTimerExpiry: null,
    publisherAcceptedAt: null,
    slotConfirmedAt: null,
    adminApprovedAt: null,
    printReadyAt: null,
    installBy: null,
    agentId: null,
    listingId: "lst1",
    listing: { id: "lst1", title: "Whitefield billboard", address: "ITPL Main Road", city: "Bengaluru", ratePerDay: "400.00" },
    createdAt: "2026-10-01T00:00:00.000Z",
    ...over,
});

beforeEach(() => {
    calls.length = 0;
});

describe("the four chips", () => {
    it("files each status under the chip the app does", () => {
        expect(matchesFilter(booking({ status: "PENDING_PUBLISHER" }), "PENDING", NOW)).toBe(true);
        expect(matchesFilter(booking({ status: "SLOT_PROPOSED" }), "PENDING", NOW)).toBe(true);
        expect(matchesFilter(booking({ status: "SELF_INSTALL" }), "ACTIVE", NOW)).toBe(true);
        expect(matchesFilter(booking({ status: "PENDING_APPROVAL" }), "ACTIVE", NOW)).toBe(true);
        expect(matchesFilter(booking({ status: "CANCELLED" }), "COMPLETED", NOW)).toBe(true);
        expect(matchesFilter(booking({ status: "PUBLISHER_REJECTED" }), "COMPLETED", NOW)).toBe(true);
        expect(matchesFilter(booking({ status: "SELF_INSTALL" }), "PENDING", NOW)).toBe(false);
    });
    it("reads a signed-off booking as Active until its end date and Completed after", () => {
        const live = booking({ status: "COMPLETED", endDate: "2026-10-25T00:00:00.000Z" });
        const over = booking({ status: "COMPLETED", endDate: "2026-10-01T00:00:00.000Z" });
        expect(runState(live, NOW)).toEqual({ live: true, finished: false });
        expect(matchesFilter(live, "ACTIVE", NOW)).toBe(true);
        expect(matchesFilter(live, "COMPLETED", NOW)).toBe(false);
        expect(matchesFilter(over, "COMPLETED", NOW)).toBe(true);
        expect(runState(booking({ status: "COMPLETED", endDate: null }), NOW)).toEqual({ live: true, finished: false });
    });
    it("counts every chip over the whole list", () => {
        const rows = [booking({ status: "PENDING_PUBLISHER" }), booking({ status: "IN_PROGRESS" }), booking({ status: "CANCELLED" })];
        expect(filterCounts(rows, NOW)).toEqual({ ALL: 3, PENDING: 1, ACTIVE: 1, COMPLETED: 1 });
    });
    it("reads the tab from the address, the older upcoming link included", () => {
        expect(filterFromParam("upcoming")).toBe("PENDING");
        expect(filterFromParam("active")).toBe("ACTIVE");
        expect(filterFromParam("completed")).toBe("COMPLETED");
        expect(filterFromParam(null)).toBe("ALL");
    });
});

describe("search and who is waiting", () => {
    it("matches the campaign, the space, the city and the booking id", () => {
        const row = booking();
        expect(matchesSearch(row, "aster")).toBe(true);
        expect(matchesSearch(row, "whitefield")).toBe(true);
        expect(matchesSearch(row, "bengaluru")).toBe(true);
        expect(matchesSearch(row, "BKG-1510")).toBe(true);
        expect(matchesSearch(row, "jo8cf")).toBe(true);
        expect(matchesSearch(row, "   ")).toBe(true);
        expect(matchesSearch(row, "mumbai")).toBe(false);
    });
    it("counts artwork review as the publisher's turn only while nobody has said who installs it", () => {
        expect(needsPublisher(booking({ status: "PENDING_PRINT", installBy: null }))).toBe(true);
        expect(needsPublisher(booking({ status: "PENDING_PRINT", installBy: "ADX" }))).toBe(false);
        expect(needsPublisher(booking({ status: "PENDING_OTP" }))).toBe(true);
        expect(needsPublisher(booking({ status: "PENDING_APPROVAL" }))).toBe(false);
        expect(waitingLine(0)).toBeNull();
        expect(waitingLine(1)).toBe("1 booking is waiting on you.");
        expect(waitingLine(3)).toBe("3 bookings are waiting on you.");
    });
});

describe("the five-stage ladder", () => {
    it("puts a new booking on the first stage", () => {
        const stages = stagesFor(booking({ status: "PENDING_PUBLISHER" }));
        expect(stages.map((s) => s.state)).toEqual(["current", "todo", "todo", "todo", "todo"]);
        expect(stages[0]!.detail).toBe("Runs from 12 Oct 2026");
    });
    it("names the installer, and skips assignment on the publisher's own install", () => {
        const agent = stagesFor(booking({ status: "SLOT_CONFIRMED", agent: { id: "a", city: "Bengaluru", user: { id: "u", name: "Ramesh Yadav" } } }));
        expect(agent.map((s) => s.state)).toEqual(["done", "done", "current", "todo", "todo"]);
        expect(agent[1]!.detail).toBe("Ramesh Yadav is on it");
        const self = stagesFor(booking({ status: "SELF_INSTALL", installBy: "PUBLISHER" }));
        expect(self[1]!.detail).toBe("You are installing this one");
        expect(stagesDone(self)).toBe(2);
    });
    it("waits on the code, ticks every row once signed off, and none on a cancelled booking", () => {
        expect(stagesFor(booking({ status: "PENDING_OTP" }))[3]!.detail).toBe("Waiting on your six-digit code");
        expect(stagesDone(stagesFor(booking({ status: "COMPLETED", adminApprovedAt: "2026-10-13T00:00:00.000Z" })))).toBe(5);
        expect(stagesFor(booking({ status: "CANCELLED" })).every((s) => s.state === "todo")).toBe(true);
        expect(stagesFor(booking({ status: "PENDING_PRINT", adminApprovedAt: "2026-09-30T00:00:00.000Z" }))[4]!.detail).toBeNull();
        expect(stagesFor(booking({ status: "COMPLETED", adminApprovedAt: "2026-10-13T00:00:00.000Z" }))[4]!.detail).toBe("Signed off 13 Oct 2026");
    });
});

describe("where the installer is", () => {
    it("says how far, and 'at your site' inside 150 m", () => {
        expect(etaLine({ latitude: 1, longitude: 1, updatedAt: "x", eta: { minutes: 12, distanceM: 4800 } })).toBe("About 12 minutes away (4.8 km).");
        expect(etaLine({ latitude: 1, longitude: 1, updatedAt: "x", eta: { minutes: 1, distanceM: 90 } })).toBe("At your site now.");
        expect(etaLine({ latitude: 1, longitude: 1, updatedAt: "x", eta: { minutes: 1, distanceM: 600 } })).toBe("About 1 minute away (600 m).");
        expect(etaLine({ latitude: null, longitude: null, updatedAt: null })).toBeNull();
    });
    it("ages a fix and counts a window down", () => {
        expect(sinceWhen(new Date(NOW - 20 * 60_000).toISOString(), NOW)).toBe("20 minutes ago");
        expect(sinceWhen(new Date(NOW - 10_000).toISOString(), NOW)).toBe("just now");
        expect(sinceWhen(new Date(NOW - 3 * 3_600_000).toISOString(), NOW)).toBe("3 hours ago");
        expect(timeLeft(new Date(NOW + 25 * 60_000).toISOString(), NOW)).toBe("25 minutes left");
        expect(timeLeft(new Date(NOW - 60_000).toISOString(), NOW)).toBe("The window has passed");
        expect(timeLeft(null, NOW)).toBeNull();
    });
});

describe("the creative, the proof and the dispute", () => {
    it("draws a picture, a video, a PDF or a link", () => {
        expect(creativeKind("https://cdn/x/art.JPG?sig=1")).toBe("image");
        expect(creativeKind("https://cdn/x/loop.mp4")).toBe("video");
        expect(creativeKind("https://cdn/x/art.pdf")).toBe("pdf");
        expect(creativeKind("https://cdn/x/file")).toBe("file");
        expect(creativeKind(null)).toBeNull();
    });
    it("never files the prints or the before photos twice", () => {
        expect(selfInstallFiled({ PICKUP: 1 })).toEqual({ prints: true, condition: false });
        expect(selfInstallFiled({ PICKUP: 1, CONDITION: 3 })).toEqual({ prints: true, condition: true });
        expect(selfInstallFiled(null)).toEqual({ prints: false, condition: false });
    });
    it("raises the dispute on this booking", () => {
        expect(disputeHref("ord 1")).toBe("/publisher/disputes/new?orderId=ord%201");
    });
});

describe("the requests", () => {
    it("walks every page of the publisher's orders", async () => {
        const page = (n: number, items: Booking[], total: number): BookingsPage => ({ items, total, page: n, pageSize: 100, counts: {} });
        const pages = [page(1, [booking({ id: "a" }), booking({ id: "b" })], 3), page(2, [booking({ id: "c" })], 3)];
        const asked: number[] = [];
        const rows = await publisherBookings.all(async (n) => {
            asked.push(n);
            return pages[n - 1]!;
        });
        expect(rows.map((r) => r.id)).toEqual(["a", "b", "c"]);
        expect(asked).toEqual([1, 2]);
    });
    it("stops on an empty page even when the total says more", async () => {
        const rows = await publisherBookings.all(async (n) => ({ items: n === 1 ? [booking({ id: "a" })] : [], total: 50, page: n, pageSize: 100, counts: {} }));
        expect(rows).toHaveLength(1);
    });
    it("asks the default read for the publisher's side, newest first", async () => {
        await publisherBookings.all().catch(() => undefined);
        expect(calls[0]).toEqual({ method: "GET", path: "/orders/my?as=publisher&sort=NEWEST&page=1&pageSize=100" });
    });
    it("reads the installer's position and rates them with a trimmed note", async () => {
        await publisherBookings.agentLocation("o1");
        await publisherBookings.rateEligibility("o1");
        await publisherBookings.rateAgent("o1", { rating: 4, note: "  tidy  " });
        await publisherBookings.rateAgent("o1", { rating: 5, note: "   " });
        expect(calls).toEqual([
            { method: "GET", path: "/orders/o1/agent-location" },
            { method: "GET", path: "/orders/o1/rate-agent/eligibility" },
            { method: "POST", path: "/orders/o1/rate-agent", body: { rating: 4, note: "tidy" } },
            { method: "POST", path: "/orders/o1/rate-agent", body: { rating: 5 } },
        ]);
    });
});
