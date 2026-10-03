import { api } from "@/lib/api-client";
import { apiConfig } from "@/lib/api-config";
import { accountIdLine } from "@/services/party";

/**
 * Agent access on the web — the ADX app's "My QR code" and "Who has had
 * access" (`mobile/user-app/src/features/onboarding/my-qr-screen.tsx`,
 * `access-log-screen.tsx`) and, for a publisher, the ticket-bound access
 * grants (`features/publisher/access-grant-screen.tsx`).
 *
 * QR-27: the account's own durable code. What a scan of it means is decided
 * by who scans and by the owner, here: an agent asks, the owner approves or
 * declines on this page, and nothing changes without that tap. The page
 * polls `…/me/qr/status` while it is open, the way the phone does.
 */

export type AccessParty = "PUBLISHER" | "ADVERTISER";

/** Whose `/me` routes the code lives on. */
export const SELF: Record<AccessParty, string> = { PUBLISHER: "/publishers/me", ADVERTISER: "/advertisers/me" };

/** How often the page asks whether somebody scanned, while the code is on screen. */
export const POLL_MS = 3000;

export interface OnboardingQr {
    qrId: string;
    token: string;
    /** QR-27: null — the code is the account's to keep. */
    expiresAt: string | null;
    pngUrl?: string;
}

export interface AccessAsk {
    scope: "PROFILE" | "LISTINGS";
    reason: string;
    durationMinutes: number;
}

export interface PendingScan {
    scanId: string;
    scannedAt: string;
    distanceM: number | null;
    kind?: "ONBOARDING" | "ACCESS";
    ask?: AccessAsk | null;
    agent: { id: string; displayId: string | null; city: string | null; name: string | null; avatarUrl: string | null } | null;
}

export interface QrStatus {
    onboardingStatus?: string;
    onboarding?: "SELF" | "WITH_AGENT";
    qr: { qrId: string; expiresAt: string | null; live: boolean } | null;
    pending: PendingScan | null;
    displayId?: string | null;
}

export interface AccessLog {
    scans: { id: string; at: string; outcome: string; distanceM: number | null; decidedAt: string | null; agent: { name: string | null; displayId: string | null; mobile?: string } }[];
    grants: { id: string; purpose: string; scope: string; status: string; from: string | null; until: string | null; revokedAt: string | null }[];
    changes: { id: string; at: string; action: string; fields: string[]; grantId: string | null; by: { name: string | null } }[];
}

/* ------------------------------------------------------------------ */
/* Publisher access grants                                             */
/* ------------------------------------------------------------------ */

export interface AccessGrant {
    id: string;
    reason: string;
    scope: "PROFILE" | "LISTINGS";
    listingIds: string[];
    assignedAgentId: string;
    status: "PENDING" | "ACTIVE" | "EXPIRED" | "REVOKED";
    durationMinutes: number;
    qrId: string | null;
    claimedAt: string | null;
    expiresAt: string | null;
    createdAt: string;
}

export interface GrantTicket {
    id: string;
    title: string;
    description: string;
    category: string;
    status: string;
    assignedAgentId: string | null;
    assignedAt?: string | null;
    createdAt: string;
}

export interface IssuedGrant {
    grant: AccessGrant;
    token: string;
    /** The server's own warning, shown under the code as it is written. */
    warning: string;
}

/** A grant's reason: the server wants 10–500 characters, because "help" describes nothing. */
export const GRANT_REASON_MIN = 10;

export const accessService = {
    /** The account's code; the fix rides along when the page has one, so a scan's distance can be measured. */
    qr: (party: AccessParty, position?: { latitude: number; longitude: number } | null) =>
        api.get<OnboardingQr>(position ? `${SELF[party]}/qr?latitude=${position.latitude}&longitude=${position.longitude}` : `${SELF[party]}/qr`),
    status: (party: AccessParty) => api.get<QrStatus>(`${SELF[party]}/qr/status`),
    decide: (party: AccessParty, scanId: string, decision: "approve" | "decline") =>
        api.post<{ outcome: "GRANTED" | "USER_DECLINED"; grantId: string | null }>(`${SELF[party]}/qr/scans/${encodeURIComponent(scanId)}/${decision}`),
    accessLog: (party: AccessParty) => api.get<AccessLog>(`${SELF[party]}/access-log`),

    /* The publisher's ticket-bound grants. */
    grants: (publisherId: string) => api.get<AccessGrant[]>(`/access-grants/publisher/${encodeURIComponent(publisherId)}`),
    openTickets: () => api.get<GrantTicket[]>("/support/tickets?status=OPEN"),
    raiseTicket: (body: { title: string; description: string }) => api.post<GrantTicket>("/support/tickets", { ...body, category: "listings" }),
    issueGrant: (body: { publisherId: string; reason: string; scope: "PROFILE" | "LISTINGS"; supportTicketId: string }) => api.post<IssuedGrant>("/access-grants", body),
    revokeGrant: (grantId: string) => api.post<AccessGrant>(`/access-grants/${encodeURIComponent(grantId)}/revoke`),
};

/** The code's picture — public, rendered where it is signed; no QR library on the page. */
export function qrImageUrl(qrId: string): string {
    return `${apiConfig.baseUrl}/qr/${encodeURIComponent(qrId)}/image.png`;
}

/** The link a camera lands on: the account's public card on adx.in. */
export function qrShareLink(token: string, siteUrl: string = apiConfig.siteUrl): string {
    return `${siteUrl}/q/${encodeURIComponent(token)}`;
}

/** What the share line says, by side — the code's id named as the account's (28 Sep 2026), not as the person's. */
export function shareText(party: AccessParty, displayId: string | null | undefined, link: string): string {
    const id = accountIdLine(party, displayId);
    return `${party === "PUBLISHER" ? "My spaces on ADX" : "Find me on ADX"}${id ? ` (${id})` : ""}: ${link}`;
}

const SCOPE_WORDS: Record<"PROFILE" | "LISTINGS", string> = { PROFILE: "your profile and documents", LISTINGS: "your listings" };

/** "for 2 hours", "for the day" — the span an agent asked for. */
export function spanWords(minutes: number): string {
    if (minutes >= 24 * 60) return "for the day";
    if (minutes % 60 === 0) return `for ${minutes / 60} hour${minutes === 60 ? "" : "s"}`;
    return `for ${minutes} minutes`;
}

function scopeWords(party: AccessParty, scope: "PROFILE" | "LISTINGS"): string {
    return party === "PUBLISHER" && scope === "LISTINGS" ? SCOPE_WORDS.LISTINGS : SCOPE_WORDS.PROFILE;
}

/** What the approve card says the scan is asking for, by kind. */
export function askSentence(pending: Pick<PendingScan, "kind" | "ask">, party: AccessParty): string {
    if (pending.kind === "ACCESS" && pending.ask) {
        const why = pending.ask.reason ? ` — "${pending.ask.reason}"` : "";
        return `Asks to work on ${scopeWords(party, pending.ask.scope)} ${spanWords(pending.ask.durationMinutes)}${why}.`;
    }
    return party === "PUBLISHER"
        ? "Asks to complete your onboarding with you — your details and documents. Their access ends when it does."
        : "Asks to complete your onboarding with you — your business details and documents. Their access ends when it does.";
}

/** What the page says once the owner allowed a scan. */
export function grantedSentence(pending: Pick<PendingScan, "kind" | "ask" | "agent">, party: AccessParty): { title: string; body: string } {
    const name = pending.agent?.name ?? null;
    if (pending.kind === "ACCESS" && pending.ask) {
        return {
            title: name ? `${name} is in` : "Your agent is in",
            body: `${name ?? "Your agent"} can now work on ${scopeWords(party, pending.ask.scope)} ${spanWords(pending.ask.durationMinutes)}. You can withdraw it any time from "Who has had access".`,
        };
    }
    return {
        title: name ? `Onboarding with ${name}` : "Onboarding with your agent",
        body:
            party === "PUBLISHER"
                ? "They can fill in your details and documents with you. Their access ends when your onboarding does, and you can withdraw it from your account at any time."
                : "They can fill in your business details and documents with you. The ADX terms and any money are yours to accept and add yourself. Their access ends when your onboarding does.",
    };
}

/** "Their phone is about 40 m from yours", or nothing when either side had no fix. */
export function distanceLine(distanceM: number | null | undefined): string | null {
    if (distanceM === null || distanceM === undefined) return null;
    return distanceM < 1000 ? `Their phone is about ${Math.round(distanceM)} m from where this code was opened` : `Their phone is about ${(distanceM / 1000).toFixed(1)} km from where this code was opened`;
}

/* ------------------------------------------------------------------ */
/* The access log                                                      */
/* ------------------------------------------------------------------ */

export const SCAN_OUTCOME: Record<string, string> = {
    GRANTED: "Approved by you",
    PENDING_APPROVAL: "Waiting for your answer",
    USER_DECLINED: "Declined by you",
    EXPIRED: "Code had expired",
    ALREADY_USED: "Code already used",
    NOT_AN_AGENT: "Refused — not an ADX agent",
};

export const GRANT_STATUS: Record<string, string> = { ACTIVE: "Open", EXPIRED: "Ended", REVOKED: "Withdrawn", PENDING: "Not yet used" };

/** "12 Sep, 4:05 pm" — when, in the viewer's zone. */
export function whenLabel(iso: string | null | undefined): string {
    if (!iso) return "";
    const at = new Date(iso);
    if (Number.isNaN(at.getTime())) return "";
    return at.toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
}

/** "40 m away" / "1.2 km away". */
export function distanceShort(m: number | null): string | null {
    if (m === null) return null;
    return m < 1000 ? `${Math.round(m)} m away` : `${(m / 1000).toFixed(1)} km away`;
}

export function scanTitle(scan: AccessLog["scans"][number]): string {
    return [scan.agent.name ?? "An ADX agent", scan.agent.displayId].filter(Boolean).join(" · ");
}

export function scanMeta(scan: AccessLog["scans"][number]): string {
    return [whenLabel(scan.at), SCAN_OUTCOME[scan.outcome] ?? scan.outcome, distanceShort(scan.distanceM)].filter(Boolean).join(" · ");
}

export function grantTitle(grant: AccessLog["grants"][number]): string {
    return `${grant.purpose === "ONBOARDING" ? "Onboarding" : "Support"} · ${grant.scope === "LISTINGS" ? "your listings" : "your profile"}`;
}

export function grantMeta(grant: AccessLog["grants"][number]): string {
    return [grant.from ? `From ${whenLabel(grant.from)}` : null, grant.until ? `until ${whenLabel(grant.until)}` : null, grant.revokedAt ? `withdrawn ${whenLabel(grant.revokedAt)}` : (GRANT_STATUS[grant.status] ?? grant.status)]
        .filter(Boolean)
        .join(" ");
}

export function changeTitle(change: AccessLog["changes"][number]): string {
    return change.action.includes("KYC") ? "Documents submitted" : `Changed: ${change.fields.join(", ") || "details"}`;
}

export function changeMeta(change: AccessLog["changes"][number]): string {
    return [`by ${change.by.name ?? "an ADX agent"}`, whenLabel(change.at)].join(" · ");
}

/** The grants still in force: not yet scanned, or in use. */
export function liveGrants<T extends Pick<AccessGrant, "status">>(grants: readonly T[]): T[] {
    return grants.filter((grant) => grant.status === "PENDING" || grant.status === "ACTIVE");
}

/** "4:05 pm" — until when a grant runs. */
export function timeLabel(iso: string | null | undefined): string {
    if (!iso) return "later today";
    const at = new Date(iso);
    if (Number.isNaN(at.getTime())) return "later today";
    return at.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
}
