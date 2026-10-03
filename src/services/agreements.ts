import { api, apiBlob, ApiError } from "@/lib/api-client";

/**
 * Agreements on the web — the two kinds of document a party meets:
 *
 * - **The platform terms**, read and clicked: the live text is
 *   `GET /agreements/current/:kind` (404 `NO_ACTIVE_TEMPLATE` while nothing
 *   is published) and the click is recorded by the party's own module —
 *   `POST /supply/agreements/accept-platform { publisherId }` for a
 *   publisher, `POST /advertisers/:id/agreements/platform` for an advertiser
 *   — exactly as the app's `agreement-screen.tsx` does.
 * - **The e-signed documents** (DS-1, Digio eSign): the licence to display,
 *   the insertion order, the print partner's service agreement. The party
 *   never signs here: the page opens Digio's gateway and asks ADX where the
 *   request stands (`/agreements/signing/:id`, `/refresh`) until ADX has
 *   heard. `GET /agreements/signing/mine` is "My agreements"; the signed
 *   copy is a private file, `GET /files/:id` with the session's bearer.
 */

export type PlatformKind = "PLATFORM" | "ADVERTISER_PLATFORM";
export type AgreementKind = PlatformKind | "INSERTION_ORDER" | "PACKAGE_SALE" | "JOB_TERMS" | "LISTING" | "PUBLISHER_LICENCE" | "PRINT_PARTNER_SERVICE";

export interface AgreementText {
    id: string;
    kind: string;
    version: number;
    title: string;
    /** Markdown, as ADX published it. */
    body: string;
}

/** DS-3: the insertion order's accept answers a signing request instead of a click when the policy asks for a signature. */
export type AcceptAnswer = { accepted: true; templateVersion?: number; acceptanceId?: string } | { accepted: false; signing: { id: string; status: string; signingUrl: string | null; mock: boolean } } | unknown;

export type SigningStatus = "REQUESTED" | "PARTIALLY_SIGNED" | "COMPLETED" | "EXPIRED" | "CANCELLED" | "FAILED";

/** What a party's own read (`/publishers/me`'s `licence`, `/print-partners/me`'s `agreement`) says about one signed document. */
export interface SigningSlice {
    required: boolean;
    satisfied: boolean;
    status: SigningStatus | string | null;
    requestId: string | null;
    signingUrl: string | null;
    mock: boolean;
    expiresAt: string | null;
    completedAt: string | null;
    signedFileId: string | null;
    label?: string | null;
}

export interface SignerState {
    role: "PARTY" | "ADX";
    name: string;
    identifier: string;
    status: "requested" | "signed" | "expired" | "declined" | "cancelled" | string;
    signedAt: string | null;
}

/** One request, as `GET /agreements/signing/:id` answers it. */
export interface SigningRequest {
    id: string;
    kind: string;
    label: string;
    title: string;
    templateVersion: number;
    partyType: string;
    partyId: string;
    campaignId: string | null;
    status: SigningStatus;
    mock: boolean;
    signer: { name: string; identifier: string; userId: string | null };
    signers: SignerState[];
    signMethod: string;
    signingUrl: string | null;
    countersign: boolean;
    files: { document: string | null; signed: string | null; certificate: string | null };
    requestedAt: string;
    expiresAt: string;
    completedAt: string | null;
    cancelReason: string | null;
    failureReason: string | null;
}

/**
 * One line of `GET /agreements/mine` (26 Sep 2026): a platform agreement the
 * signed-in account accepted — the version, when, and whether that is still
 * the live one (`current: false` is outdated, enforced or not).
 */
export interface MyPlatformAgreement {
    kind: string;
    label?: string;
    templateVersion: number;
    acceptedAt: string;
    currentVersion?: number | null;
    current: boolean;
    requiresReacceptance?: boolean;
}

/** Where the party's platform terms stand — the live text beside the account's own acceptance (`/agreements/mine`). */
export interface PlatformStanding {
    kind: PlatformKind;
    /** The live version, or null while nothing is published. */
    current: AgreementText | null;
    /** Accepted some version. */
    accepted: boolean;
    acceptedAt: string | null;
    /** The version accepted, null when none. */
    acceptedVersion: number | null;
    /** Accepted, but an older version than the live one — whether or not the live one is enforced. */
    outdated: boolean;
    /** The live version still wants a click before the party may go on (never accepted, or re-acceptance is enforced). */
    pending: boolean;
}

/** The standing from the live text and the account's own line of `/agreements/mine` — pure, so the rule is tested once. */
export function platformStandingOf(kind: PlatformKind, current: AgreementText | null, mine: MyPlatformAgreement | null): PlatformStanding {
    const outdated = Boolean(mine && current && !mine.current);
    const pending = Boolean(current) && (!mine || (outdated && Boolean(mine.requiresReacceptance)));
    return { kind, current, accepted: Boolean(mine), acceptedAt: mine?.acceptedAt ?? null, acceptedVersion: mine?.templateVersion ?? null, outdated, pending };
}

/** How often an open signing request is asked about. */
export const SIGNING_POLL_MS = 5000;

const enc = encodeURIComponent;

export const agreements = {
    /** The live text; 404 `NO_ACTIVE_TEMPLATE` when nothing is published — answered here as null. */
    current: (kind: AgreementKind) =>
        api.get<AgreementText>(`/agreements/current/${kind}`).catch((caught: unknown) => {
            if (caught instanceof ApiError && caught.status === 404) return null;
            throw caught;
        }),

    /** The platform click, with the party's own endpoint, as the app records it. */
    acceptPlatform: async (kind: PlatformKind): Promise<unknown> => {
        if (kind === "PLATFORM") {
            const me = await api.get<{ id: string }>("/publishers/me");
            return api.post<unknown>("/supply/agreements/accept-platform", { publisherId: me.id });
        }
        const me = await api.get<{ id: string }>("/advertisers/me");
        return api.post<unknown>(`/advertisers/${enc(me.id)}/agreements/platform`, {});
    },

    /** 26 Sep 2026: the signed-in account's platform agreements — version, when, current or outdated. */
    minePlatform: () => api.get<MyPlatformAgreement[]>("/agreements/mine"),

    /** The advertiser's platform standing: the live version against their own acceptance (`/agreements/mine`); the eligibility read's AGREEMENT gate says whether the click is owed now. */
    advertiserStanding: async (): Promise<PlatformStanding> => {
        const me = await api.get<{ id: string }>("/advertisers/me");
        const [current, mine, eligibility] = await Promise.all([agreements.current("ADVERTISER_PLATFORM"), agreements.minePlatform(), api.get<{ blockedBy?: string[] }>(`/advertisers/${enc(me.id)}/eligibility`)]);
        const standing = platformStandingOf("ADVERTISER_PLATFORM", current, mine.find((row) => row.kind === "ADVERTISER_PLATFORM") ?? null);
        return { ...standing, pending: Boolean(current) && (eligibility.blockedBy ?? []).includes("AGREEMENT") };
    },

    /** The publisher's platform standing: the live version against their own acceptance (`/agreements/mine`). */
    publisherStanding: async (): Promise<PlatformStanding & { licence: SigningSlice | null }> => {
        const [current, mine, me] = await Promise.all([agreements.current("PLATFORM"), agreements.minePlatform(), api.get<{ licence?: SigningSlice | null }>("/publishers/me")]);
        return { ...platformStandingOf("PLATFORM", current, mine.find((row) => row.kind === "PLATFORM") ?? null), licence: me.licence ?? null };
    },

    /** The print partner's service agreement slice on their own row (DS-2). */
    partnerSlice: () => api.get<{ agreement?: SigningSlice | null }>("/print-partners/me").then((me) => me.agreement ?? null),

    signing: (id: string) => api.get<SigningRequest>(`/agreements/signing/${enc(id)}`),
    /** Ask ADX to ask Digio now — what the page polls while the request is open. */
    refresh: (id: string) => api.post<SigningRequest>(`/agreements/signing/${enc(id)}/refresh`, {}),
    /** The development door: signs a mocked request (the server has no Digio credentials). */
    mockSign: (id: string) => api.post<SigningRequest>(`/agreements/signing/${enc(id)}/mock-sign`, {}),
    /** Every request on the person's parties, newest first. */
    mine: () => api.get<SigningRequest[]>("/agreements/signing/mine"),
    /** A private file (the document, the signed copy) with the session's bearer. */
    file: (fileId: string) => apiBlob(`/files/${enc(fileId)}`),
};

/* ------------------------------------------------------------------ */
/* Pure helpers                                                        */
/* ------------------------------------------------------------------ */

/** The platform kind of a side; a print partner has none of its own (their service agreement is e-signed). */
export function platformKindOf(party: "PUBLISHER" | "ADVERTISER" | "PRINT_PARTNER"): PlatformKind | null {
    if (party === "PUBLISHER") return "PLATFORM";
    if (party === "ADVERTISER") return "ADVERTISER_PLATFORM";
    return null;
}

export const signingOpen = (status: string | null | undefined): boolean => status === "REQUESTED" || status === "PARTIALLY_SIGNED";

/** A slice that wants the party's attention: required, not satisfied. */
export const signingPending = (slice: SigningSlice | null | undefined): slice is SigningSlice => Boolean(slice && slice.required && !slice.satisfied);

/** The request a 403 SIGNATURE_REQUIRED refusal carries, or null for any other error. */
export function signingFromError(caught: unknown): { requestId: string | null; kind: string | null } | null {
    if (!(caught instanceof ApiError) || caught.code !== "SIGNATURE_REQUIRED") return null;
    const details = (caught.details ?? {}) as { signing?: { id?: string } | null; kind?: string };
    return { requestId: details.signing?.id ?? null, kind: details.kind ?? null };
}

export const SIGNING_STATUS: Record<string, { label: string; tone: "success" | "warning" | "danger" | "info" | "neutral" }> = {
    REQUESTED: { label: "Awaiting your signature", tone: "warning" },
    PARTIALLY_SIGNED: { label: "Signed — awaiting ADX", tone: "info" },
    COMPLETED: { label: "Signed", tone: "success" },
    EXPIRED: { label: "Link expired", tone: "neutral" },
    CANCELLED: { label: "Withdrawn", tone: "neutral" },
    FAILED: { label: "Declined", tone: "danger" },
};

export const signingStatusOf = (status: string): { label: string; tone: "success" | "warning" | "danger" | "info" | "neutral" } => SIGNING_STATUS[status] ?? { label: status.toLowerCase().replace(/_/g, " "), tone: "neutral" };

/** The open requests first (waiting on the person), then everything else, each newest first. */
export function splitSigning(rows: SigningRequest[]): { open: SigningRequest[]; rest: SigningRequest[] } {
    const newest = (a: SigningRequest, b: SigningRequest) => b.requestedAt.localeCompare(a.requestedAt);
    return { open: rows.filter((row) => signingOpen(row.status)).sort(newest), rest: rows.filter((row) => !signingOpen(row.status)).sort(newest) };
}

/** How the gateway page will ask for the signature. */
export function signMethodLine(method: string): string {
    if (method === "AADHAAR") return "Digio’s signing page opens in a new tab. Read the document, then sign with an OTP to the mobile linked to your Aadhaar — about a minute.";
    if (method === "DSC") return "Digio’s signing page opens in a new tab. Sign with your DSC token.";
    return "Digio’s signing page opens in a new tab. Read the document and draw your signature.";
}

/** What a request that can no longer be signed says, and where a fresh one comes from. */
export function closedWords(request: Pick<SigningRequest, "status" | "cancelReason" | "failureReason">): { title: string; text: string } {
    if (request.status === "EXPIRED") return { title: "The signing link has expired", text: "A fresh link comes with the next step that needs it, or from ADX. Nothing you signed is lost." };
    if (request.status === "CANCELLED") return { title: "This request was withdrawn", text: request.cancelReason ? `${request.cancelReason}. ADX sends a fresh document when it is ready.` : "ADX sends a fresh document when it is ready." };
    return { title: "This request could not be completed", text: `${request.failureReason ? `${request.failureReason}. ` : ""}A fresh link comes with the next step that needs it, or from ADX.` };
}

export const SIGNER_WORD: Record<string, string> = { requested: "awaiting", signed: "signed", expired: "expired", declined: "declined", cancelled: "voided" };

/** "You: signed · ADX: awaiting" — for a countersigned request. */
export const signersLine = (signers: SignerState[]): string => signers.map((signer) => `${signer.role === "ADX" ? "ADX" : signer.name}: ${SIGNER_WORD[signer.status] ?? signer.status}`).join(" · ");

/** A file name for the downloaded copy. */
export const pdfName = (title: string, signed: boolean): string => `${title.trim().replace(/[^\w.-]+/g, "_").replace(/^_+|_+$/g, "") || "agreement"}${signed ? "_signed" : ""}.pdf`;

/**
 * Where "continue" goes after a signature: the `?next=` a page sent, only
 * when it is a path on this site — never another origin (`//evil`,
 * `https://…`, `/\evil`), so the page cannot be used to bounce someone away.
 */
export function safeNext(next: string | null | undefined, fallback: string): string {
    if (!next) return fallback;
    const value = next.trim();
    if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\") || /[\u0000-\u001f]/.test(value)) return fallback;
    return value;
}

/** The link another page uses to send someone here — `/sign/<id>?next=<path>`. */
export const signingHref = (requestId: string, next?: string | null): string => `/sign/${enc(requestId)}${next ? `?next=${enc(next)}` : ""}`;

/** "12 Sep 2026", in India's time. */
export function dayMonthYear(iso: string | null | undefined): string {
    if (!iso) return "—";
    const at = new Date(iso);
    if (Number.isNaN(at.getTime())) return "—";
    return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" }).format(at);
}

/* ------------------------------------------------------------------ */
/* The agreement text                                                  */
/* ------------------------------------------------------------------ */

export type TextBlock = { type: "heading"; level: 1 | 2 | 3; text: string } | { type: "paragraph"; text: string } | { type: "list"; ordered: boolean; items: string[] } | { type: "rule" };

/**
 * The published Markdown as blocks the page draws with its own type — the
 * headings, paragraphs, lists and rules a terms document uses. No HTML is
 * ever taken from the text, so nothing in it can run.
 */
export function textBlocks(body: string): TextBlock[] {
    const blocks: TextBlock[] = [];
    let paragraph: string[] = [];
    let list: { ordered: boolean; items: string[] } | null = null;
    const flush = () => {
        if (paragraph.length) blocks.push({ type: "paragraph", text: paragraph.join(" ") });
        paragraph = [];
        if (list) blocks.push({ type: "list", ordered: list.ordered, items: list.items });
        list = null;
    };
    for (const raw of body.replace(/\r\n?/g, "\n").split("\n")) {
        const line = raw.trim();
        if (!line) {
            flush();
            continue;
        }
        const heading = /^(#{1,6})\s+(.*)$/.exec(line);
        if (heading) {
            flush();
            blocks.push({ type: "heading", level: Math.min(heading[1]!.length, 3) as 1 | 2 | 3, text: heading[2]!.replace(/#+$/, "").trim() });
            continue;
        }
        if (/^(-{3,}|\*{3,}|_{3,})$/.test(line)) {
            flush();
            blocks.push({ type: "rule" });
            continue;
        }
        const bullet = /^[-*+]\s+(.*)$/.exec(line);
        const numbered = /^\d+[.)]\s+(.*)$/.exec(line);
        if (bullet || numbered) {
            const ordered = Boolean(numbered);
            if (paragraph.length) {
                blocks.push({ type: "paragraph", text: paragraph.join(" ") });
                paragraph = [];
            }
            if (!list || list.ordered !== ordered) {
                if (list) blocks.push({ type: "list", ordered: list.ordered, items: list.items });
                list = { ordered, items: [] };
            }
            list.items.push((bullet ?? numbered)![1]!);
            continue;
        }
        if (list) {
            // A continuation line belongs to the last item.
            list.items[list.items.length - 1] = `${list.items[list.items.length - 1]} ${line}`;
            continue;
        }
        paragraph.push(line);
    }
    flush();
    return blocks;
}

export type InlinePart = { text: string; strong?: boolean; em?: boolean };

/** `**bold**` and `*italic*` inside a line; everything else is text. */
export function inlineParts(text: string): InlinePart[] {
    const parts: InlinePart[] = [];
    const pattern = /\*\*([^*]+)\*\*|__([^_]+)__|\*([^*]+)\*/g;
    let last = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text))) {
        if (match.index > last) parts.push({ text: text.slice(last, match.index) });
        if (match[1] ?? match[2]) parts.push({ text: (match[1] ?? match[2])!, strong: true });
        else parts.push({ text: match[3]!, em: true });
        last = match.index + match[0].length;
    }
    if (last < text.length) parts.push({ text: text.slice(last) });
    return parts;
}

/** The body with a schedule where the template asks for it (`{{spots}}`), else appended — the way the server renders an insertion order. */
export function withSchedule(body: string, schedule: string | null | undefined): string {
    if (!schedule) return body;
    return body.includes("{{spots}}") ? body.replace("{{spots}}", schedule) : `${body}\n\n## Sites covered by this insertion order\n\n${schedule}`;
}
