import { describe, expect, it } from "vitest";
import { belowFloorCopy, belowFloorNotice, lastVerificationLine, rightsLine, rightsPill, shelfChips, shelfFromParam, shelfOf, verificationLine, verificationPill } from "./listing-model";

const NOW = new Date("2026-09-26T06:00:00.000Z");
const inDays = (n: number) => new Date(NOW.getTime() + n * 86_400_000).toISOString();

describe("the shelves", () => {
    it("adds the three shelves up for All", () => {
        expect(shelfChips({ AVAILABLE: 6, OCCUPIED: 4, INACTIVE: 1 }).map((c) => [c.value, c.count])).toEqual([
            ["ALL", 11],
            ["AVAILABLE", 6],
            ["OCCUPIED", 4],
            ["INACTIVE", 1],
        ]);
        expect(shelfChips(undefined).every((c) => c.count === undefined)).toBe(true);
    });

    it("reads the shelf off the URL, All for anything else", () => {
        expect(shelfFromParam("occupied")).toBe("OCCUPIED");
        expect(shelfFromParam("Inactive")).toBe("INACTIVE");
        expect(shelfFromParam("published")).toBe("ALL");
        expect(shelfFromParam(null)).toBe("ALL");
    });

    it("puts a row on the shelf the server would", () => {
        expect(shelfOf({ status: "ACTIVE", occupied: true })).toBe("OCCUPIED");
        expect(shelfOf({ status: "ACTIVE", occupied: false })).toBe("AVAILABLE");
        expect(shelfOf({ status: "PENDING_REVIEW", occupied: false })).toBe("INACTIVE");
    });
});

describe("QR-24: the rights pill and card", () => {
    it("says nothing for an owned space or a long term", () => {
        expect(rightsPill({ rightsBasis: "OWNED" }, NOW)).toBeNull();
        expect(rightsPill({ rightsBasis: "LEASED", rightsValidUntil: inDays(90) }, NOW)).toBeNull();
    });

    it("warns inside thirty days and says ended once it has", () => {
        expect(rightsPill({ rightsBasis: "PERMIT", rightsValidUntil: inDays(12) }, NOW)).toEqual({ label: "Permit ends in 12 days", tone: "warning" });
        expect(rightsPill({ rightsBasis: "LICENSED", rightsValidUntil: inDays(1) }, NOW)?.label).toBe("Licence ends in 1 day");
        expect(rightsPill({ rightsBasis: "LEASED", rightsLapsedAt: inDays(-2) }, NOW)).toEqual({ label: "Lease ended", tone: "danger" });
    });

    it("words the card by the term", () => {
        expect(rightsLine({ rightsBasis: null }, NOW)).toBeNull();
        expect(rightsLine({ rightsBasis: "OWNED" }, NOW)?.value).toBe("Owned");
        expect(rightsLine({ rightsBasis: "PERMIT", rightsValidUntil: "2026-10-06T00:00:00.000Z" }, NOW)).toMatchObject({ value: "Permit until 6 Oct 2026", tone: "warning" });
        expect(rightsLine({ rightsBasis: "PERMIT", rightsValidUntil: "2027-03-31T00:00:00.000Z" }, NOW)).toMatchObject({ tone: "neutral", note: expect.stringContaining("30 and 7 days before") });
        expect(rightsLine({ rightsBasis: "LEASED", rightsValidUntil: "2026-09-01T00:00:00.000Z", rightsLapsedAt: "2026-09-02T00:00:00.000Z" }, NOW)).toMatchObject({ value: "Lease ended 1 Sep 2026", tone: "danger" });
    });
});

describe("QR-26: the re-verification pill and card", () => {
    it("says nothing for a spot that is not live, or outside the risk window", () => {
        expect(verificationPill({ status: "PENDING_REVIEW", verificationExpiresAt: inDays(2) }, NOW)).toBeNull();
        expect(verificationPill({ status: "ACTIVE", removability: "PERMANENT", verificationExpiresAt: inDays(40) }, NOW)).toBeNull();
    });

    it("uses fifteen days for a permanent structure and seven for a removable one", () => {
        expect(verificationPill({ status: "ACTIVE", removability: "PERMANENT", verificationExpiresAt: inDays(15) }, NOW)?.label).toBe("Verify again in 15 days");
        expect(verificationPill({ status: "ACTIVE", removability: "REMOVABLE", verificationExpiresAt: inDays(10) }, NOW)).toBeNull();
        expect(verificationPill({ status: "SUSPENDED", verificationExpiresAt: inDays(-1) }, NOW)).toEqual({ label: "Verification lapsed", tone: "danger" });
    });

    it("words the card by the clock", () => {
        expect(verificationLine({ status: "DRAFT" }, NOW)).toBeNull();
        expect(verificationLine({ status: "ACTIVE", removability: "REMOVABLE" }, NOW)?.note).toMatch(/every 90 days/);
        expect(verificationLine({ status: "ACTIVE", verificationExpiresAt: inDays(-3) }, NOW)?.tone).toBe("danger");
        expect(verificationLine({ status: "ACTIVE", verificationExpiresAt: inDays(5) }, NOW)?.tone).toBe("warning");
        expect(verificationLine({ status: "ACTIVE", verifiedAt: "2026-07-18T00:00:00.000Z", verificationExpiresAt: "2027-01-14T00:00:00.000Z" }, NOW)?.note).toBe("Verified on 18 Jul 2026; the next check is due by 14 Jan 2027. Every 180 days ADX asks for a fresh photograph.");
    });

    it("says where the last check stands", () => {
        expect(lastVerificationLine(null)).toBeNull();
        expect(lastVerificationLine({ status: "REJECTED", capturedAt: "2026-09-20T10:00:00.000Z", rejectionReason: "Blurred" })).toBe("Last check, photographed 20 Sep 2026: not accepted — Blurred.");
        expect(lastVerificationLine({ status: "SUBMITTED", capturedAt: "2026-09-20T10:00:00.000Z", rejectionReason: null })).toMatch(/verification desk/);
    });
});

describe("Lot E: below the floor", () => {
    const verdict = { state: "BELOW_FLOOR" as const, belowFloor: true, floorRatePerDay: "1500.00", shortfall: "300.00", case: null };

    it("draws nothing when the gate names no floor, or ADX already agreed", () => {
        expect(belowFloorNotice(null)).toBeNull();
        expect(belowFloorNotice({ ...verdict, belowFloor: false })).toBeNull();
        expect(belowFloorNotice({ ...verdict, case: { id: "c", status: "APPROVED", source: "PUBLISH_REQUEST", graceUntil: null, heldByRunningOrder: false } })).toBeNull();
    });

    it("says the shortfall and what happens next", () => {
        const plain = belowFloorNotice(verdict)!;
        expect(belowFloorCopy(plain)).toBe("Your rate is ₹300/day under ADX's floor of ₹1,500/day. Raise it so ADX can keep this listing live.");
        const pending = belowFloorNotice({ ...verdict, case: { id: "c", status: "PENDING", source: "PUBLISH_REQUEST", graceUntil: null, heldByRunningOrder: false } })!;
        expect(belowFloorCopy(pending)).toMatch(/ADX is deciding/);
        const clock = belowFloorNotice({ ...verdict, case: { id: "c", status: "PENDING", source: "CARD_REVISION", graceUntil: "2026-10-10T00:00:00.000Z", heldByRunningOrder: false } })!;
        expect(belowFloorCopy(clock)).toBe("Your rate is ₹300/day under ADX's floor of ₹1,500/day. Raise it by 10 Oct 2026 or ADX may unpublish this listing.");
        const running = belowFloorNotice({ ...verdict, case: { id: "c", status: "PENDING", source: "CARD_REVISION", graceUntil: "2026-10-10T00:00:00.000Z", heldByRunningOrder: false } }, { occupied: true })!;
        expect(belowFloorCopy(running)).toMatch(/stays up while your booking runs/);
    });
});
