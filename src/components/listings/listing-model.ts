import { formatMoney, longDate, type InventoryShelf } from "@/services/publisher-workspace";
import type { RateGateVerdict } from "@/services/listing-editor";

/**
 * The words the app's listing screens print about a spot, as pure functions
 * — the shelf, the three small pills (verification, rights, floor), and the
 * listing page's rights, verification and below-the-floor cards
 * (`mobile/user-app/src/features/publisher/my-listings-screen.tsx`,
 * `bookings/view-listing-screen.tsx`). Same rules, same thresholds, so the
 * phone and the website never disagree about a spot.
 */

export type PillTone = "success" | "warning" | "danger" | "neutral" | "info";

type RightsFields = { rightsBasis?: "OWNED" | "LEASED" | "LICENSED" | "PERMIT" | null; rightsValidUntil?: string | null; rightsLapsedAt?: string | null };
type VerificationFields = { status: string; removability?: "PERMANENT" | "REMOVABLE" | null; verifiedAt?: string | null; verificationExpiresAt?: string | null };

const DAY_MS = 86_400_000;
const daysUntil = (iso: string, now: Date) => Math.ceil((new Date(iso).getTime() - now.getTime()) / DAY_MS);

/* ── The shelves ───────────────────────────────────────────────────────── */

export const SHELF_CHIPS: { value: "ALL" | InventoryShelf; label: string }[] = [
    { value: "ALL", label: "All" },
    { value: "AVAILABLE", label: "Available" },
    { value: "OCCUPIED", label: "Occupied" },
    { value: "INACTIVE", label: "Inactive" },
];

/** The chips with the page's counts on them; All is the three shelves added up. */
export function shelfChips(counts: Record<string, number> | undefined): { value: "ALL" | InventoryShelf; label: string; count?: number }[] {
    if (!counts) return SHELF_CHIPS.map((chip) => ({ ...chip }));
    const all = SHELF_CHIPS.filter((chip) => chip.value !== "ALL").reduce((sum, chip) => sum + (counts[chip.value] ?? 0), 0);
    return SHELF_CHIPS.map((chip) => ({ ...chip, count: chip.value === "ALL" ? all : (counts[chip.value] ?? 0) }));
}

/** The chip a `?shelf=` names, ALL for anything else. */
export function shelfFromParam(value: string | null | undefined): "ALL" | InventoryShelf {
    const upper = (value ?? "").toUpperCase();
    return upper === "AVAILABLE" || upper === "OCCUPIED" || upper === "INACTIVE" ? upper : "ALL";
}

/** The shelf a row is on — the same rule the server's chips use. */
export function shelfOf(row: { status: string; occupied: boolean }): InventoryShelf {
    if (row.status !== "ACTIVE") return "INACTIVE";
    return row.occupied ? "OCCUPIED" : "AVAILABLE";
}

/* ── The pills on an inventory row ─────────────────────────────────────── */

const WORD: Record<"LEASED" | "LICENSED" | "PERMIT", string> = { LEASED: "Lease", LICENSED: "Licence", PERMIT: "Permit" };

/**
 * QR-24: the lease, licence or permit running out or run out. Nothing for a
 * space the publisher owns, or one with more than thirty days to run.
 */
export function rightsPill(row: RightsFields, now = new Date()): { label: string; tone: "warning" | "danger" } | null {
    if (!row.rightsBasis || row.rightsBasis === "OWNED") return null;
    const word = WORD[row.rightsBasis];
    if (row.rightsLapsedAt) return { label: `${word} ended`, tone: "danger" };
    if (!row.rightsValidUntil) return null;
    const days = daysUntil(row.rightsValidUntil, now);
    if (days <= 0) return { label: `${word} ended`, tone: "danger" };
    if (days <= 30) return { label: `${word} ends in ${days} day${days === 1 ? "" : "s"}`, tone: "warning" };
    return null;
}

/** QR-26: the risk window before a verification falls due — the supply module's `RISK_WINDOW_DAYS`. */
export const RISK_WINDOW_DAYS = { PERMANENT: 15, REMOVABLE: 7 } as const;

/** QR-26: the re-verification falling due, or lapsed. Nothing outside the risk window, nothing for a spot not live. */
export function verificationPill(row: VerificationFields, now = new Date()): { label: string; tone: "warning" | "danger" } | null {
    if (!row.verificationExpiresAt || (row.status !== "ACTIVE" && row.status !== "SUSPENDED")) return null;
    const days = daysUntil(row.verificationExpiresAt, now);
    if (days <= 0) return { label: "Verification lapsed", tone: "danger" };
    if (days <= RISK_WINDOW_DAYS[row.removability ?? "PERMANENT"]) return { label: `Verify again in ${days} day${days === 1 ? "" : "s"}`, tone: "warning" };
    return null;
}

/* ── The listing page's cards ──────────────────────────────────────────── */

/** QR-24: the "Held on" row and the card's note, from the basis, the term and the lapse. */
export function rightsLine(listing: RightsFields, now = new Date()): { value: string; note: string; tone: "neutral" | "warning" | "danger" } | null {
    const basis = listing.rightsBasis;
    if (!basis) return null;
    if (basis === "OWNED") return { value: "Owned", note: "You own this space; no permit or lease runs out on it.", tone: "neutral" };
    const word = WORD[basis];
    const until = listing.rightsValidUntil ? new Date(listing.rightsValidUntil) : null;
    const day = listing.rightsValidUntil ? longDate(listing.rightsValidUntil) : null;
    if (listing.rightsLapsedAt || (until && until.getTime() <= now.getTime())) {
        return { value: `${word} ended${day ? ` ${day}` : ""}`, note: `The ${word.toLowerCase()} ran out${day ? ` on ${day}` : ""}. The space takes no new booking until you upload the renewed document and ADX approves it.`, tone: "danger" };
    }
    const days = listing.rightsValidUntil ? daysUntil(listing.rightsValidUntil, now) : null;
    if (days !== null && days <= 30) {
        return { value: `${word} until ${day}`, note: `The ${word.toLowerCase()} runs out in ${days} day${days === 1 ? "" : "s"}. Upload the renewal before then and the space stays on the shelf.`, tone: "warning" };
    }
    return { value: day ? `${word} until ${day}` : word, note: day ? `The ${word.toLowerCase()} runs out on ${day}. ADX reminds you 30 and 7 days before.` : `Held on a ${word.toLowerCase()}.`, tone: "neutral" };
}

/** QR-26: the verification card's note, from the last check and when the next falls due. Null for a spot that is not live. */
export function verificationLine(listing: VerificationFields, now = new Date()): { note: string; tone: "neutral" | "warning" | "danger" } | null {
    if (listing.status !== "ACTIVE" && listing.status !== "SUSPENDED") return null;
    const cadence = listing.removability === "REMOVABLE" ? 90 : 180;
    if (!listing.verificationExpiresAt) {
        return { note: `ADX verifies every space again every ${cadence} days. This one has no check on record yet.`, tone: "neutral" };
    }
    const days = daysUntil(listing.verificationExpiresAt, now);
    const due = longDate(listing.verificationExpiresAt);
    if (days <= 0) return { note: `The verification lapsed on ${due}. Earnings on this space pause until it is verified again.`, tone: "danger" };
    const window = RISK_WINDOW_DAYS[listing.removability ?? "PERMANENT"];
    if (days <= window) return { note: `The next verification is due by ${due}, in ${days} day${days === 1 ? "" : "s"}. The clock restarts once ADX accepts a fresh photograph.`, tone: "warning" };
    return { note: `Verified${listing.verifiedAt ? ` on ${longDate(listing.verifiedAt)}` : ""}; the next check is due by ${due}. Every ${cadence} days ADX asks for a fresh photograph.`, tone: "neutral" };
}

/** What the "Below the floor" card prints, or null when there is nothing to warn about. */
export interface BelowFloorNotice {
    floorRatePerDay: string;
    /** Floor minus rate, a day, as the gate measured it; null only on a read that could not say. */
    shortfall: string | null;
    /** The CARD_REVISION clock — the day ADX may unpublish; null on a case with no date, or no case. */
    graceUntil: string | null;
    /** A PENDING case stands on the listing: ADX is deciding. */
    pending: boolean;
    /** A booking is running on the listing: it stays up while the booking does. */
    running: boolean;
}

/**
 * Drawn for a listing the gate says is under the floor of a card it names —
 * whatever case stands on it — except one ADX has already agreed to keep (an
 * APPROVED case), which is nothing to warn about.
 */
export function belowFloorNotice(verdict: RateGateVerdict | null | undefined, listing: { occupied?: boolean } = {}): BelowFloorNotice | null {
    if (!verdict || !verdict.belowFloor || !verdict.floorRatePerDay) return null;
    const openCase = verdict.case;
    if (openCase?.status === "APPROVED") return null;
    const pending = openCase?.status === "PENDING";
    return {
        floorRatePerDay: verdict.floorRatePerDay,
        shortfall: verdict.shortfall,
        graceUntil: pending ? openCase!.graceUntil : null,
        pending,
        running: listing.occupied === true || (pending && openCase!.heldByRunningOrder === true),
    };
}

/** The card's sentence: the shortfall, then what the case means. */
export function belowFloorCopy(notice: BelowFloorNotice): string {
    const floor = `${formatMoney(notice.floorRatePerDay)}/day`;
    const opening = notice.shortfall ? `Your rate is ${formatMoney(notice.shortfall)}/day under ADX's floor of ${floor}.` : `Your rate is below ADX's floor of ${floor}.`;
    if (notice.graceUntil) {
        const deadline = `Raise it by ${longDate(notice.graceUntil)}`;
        return notice.running ? `${opening} ${deadline} — the listing stays up while your booking runs.` : `${opening} ${deadline} or ADX may unpublish this listing.`;
    }
    if (notice.pending) return `${opening} ADX is deciding whether to keep it — raise the rate and it can go live without waiting.`;
    return `${opening} Raise it so ADX can keep this listing live.`;
}

/** The last re-verification sent for a spot, in a line. */
export function lastVerificationLine(row: { status: "SUBMITTED" | "ACCEPTED" | "REJECTED"; capturedAt: string; rejectionReason: string | null } | null | undefined): string | null {
    if (!row) return null;
    const day = longDate(row.capturedAt);
    if (row.status === "ACCEPTED") return `Last check, photographed ${day}: accepted.`;
    if (row.status === "REJECTED") return `Last check, photographed ${day}: not accepted${row.rejectionReason ? ` — ${row.rejectionReason}` : ""}.`;
    return `Last check, photographed ${day}: with ADX's verification desk.`;
}
