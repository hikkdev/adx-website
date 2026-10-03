import { api, ApiError } from "@/lib/api-client";
import { apiConfig } from "@/lib/api-config";

/**
 * The published documents — `GET /legal` (the index) and `GET /legal/:kind`
 * (one document's live text, Markdown), both public, the reads the apps'
 * About & Policies make (`mobile/shared/features/legal/legal-api.ts`). And
 * the platform agreements, which are not legal documents but agreement
 * templates: the party-facing platform terms (the advertiser's and the
 * publisher's, the licence to display) are public since 26 Sep 2026
 * (`GET /legal/agreements/:kind`, no session); the rest — the print
 * partner's service agreement, the per-deal terms — stay behind a session
 * (`GET /agreements/current/:kind`). `/legal/[kind]` reads either.
 *
 * Contact info and the FAQs carry a structured `meta` beside the Markdown —
 * the support line and the questions the help centre draws.
 */

export const LEGAL_KINDS = [
    "PRIVACY_POLICY",
    "TERMS_OF_SERVICE",
    "REFUND_POLICY",
    "CONTENT_POLICY",
    "COMMUNITY_GUIDELINES",
    "COMMISSION_STRUCTURE",
    "CODE_OF_CONDUCT",
    "LEGAL_DISCLAIMER",
    "CONTACT_INFO",
    "ABOUT",
    "FAQ",
    "SAFETY_GUIDELINES",
    "OPEN_SOURCE_LICENSES",
] as const;

export type LegalKind = (typeof LEGAL_KINDS)[number];

/** The agreement templates a reader may open here — the platform-scope kinds and the documents a party is asked to sign. */
export const AGREEMENT_KINDS = ["ADVERTISER_PLATFORM", "PLATFORM", "PUBLISHER_LICENCE", "PRINT_PARTNER_SERVICE", "INSERTION_ORDER", "PACKAGE_SALE", "LISTING"] as const;

export type AgreementKind = (typeof AGREEMENT_KINDS)[number];

/** How each agreement is named on the page (`agreements.service.ts` KIND_META). */
export const AGREEMENT_LABEL: Record<AgreementKind, { label: string; blurb: string }> = {
    ADVERTISER_PLATFORM: { label: "Advertiser platform terms", blurb: "What every advertiser agrees to before booking" },
    PLATFORM: { label: "Publisher platform terms", blurb: "What every publisher agrees to before listing" },
    PUBLISHER_LICENCE: { label: "Publisher licence to display", blurb: "The master licence a publisher signs, listings as its schedule" },
    PRINT_PARTNER_SERVICE: { label: "Print partner service agreement", blurb: "What a print partner signs before taking jobs" },
    INSERTION_ORDER: { label: "Insertion order", blurb: "The terms of one campaign, accepted at payment" },
    PACKAGE_SALE: { label: "Package order terms", blurb: "The terms of an advertiser plan, accepted at payment" },
    LISTING: { label: "Listing agreement", blurb: "The terms a publisher accepts with each listing" },
};

/** 26 Sep 2026: the kinds `GET /legal/agreements/:kind` answers to a visitor — the party-facing platform terms. */
export const PUBLIC_AGREEMENT_KINDS: readonly AgreementKind[] = ["ADVERTISER_PLATFORM", "PLATFORM", "PUBLISHER_LICENCE"];

export const isPublicAgreement = (kind: AgreementKind): boolean => PUBLIC_AGREEMENT_KINDS.includes(kind);

/** The ones the `/legal` index lists under "Platform agreements". */
export const LISTED_AGREEMENTS: AgreementKind[] = ["ADVERTISER_PLATFORM", "PLATFORM", "PUBLISHER_LICENCE", "PRINT_PARTNER_SERVICE"];

/** The index order — the app's About & Policies (`POLICY_ORDER`), then the rest. */
export const POLICY_ORDER: LegalKind[] = [
    "PRIVACY_POLICY",
    "TERMS_OF_SERVICE",
    "COMMISSION_STRUCTURE",
    "COMMUNITY_GUIDELINES",
    "CODE_OF_CONDUCT",
    "REFUND_POLICY",
    "CONTENT_POLICY",
    "LEGAL_DISCLAIMER",
    "SAFETY_GUIDELINES",
    "OPEN_SOURCE_LICENSES",
    "ABOUT",
    "CONTACT_INFO",
    "FAQ",
];

/** The pages `build-pages.mjs` presses from a legal kind (its `LEGAL_PAGES`), where the site serves them. */
export const PRESSED_SLUG: Partial<Record<LegalKind, string>> = {
    PRIVACY_POLICY: "privacy",
    TERMS_OF_SERVICE: "terms",
    REFUND_POLICY: "refund",
    CONTENT_POLICY: "content-policy",
    COMMUNITY_GUIDELINES: "community-guidelines",
    CODE_OF_CONDUCT: "code-of-conduct",
    LEGAL_DISCLAIMER: "disclaimer",
    CONTACT_INFO: "contact",
};

export interface LegalIndexEntry {
    kind: LegalKind;
    label: string;
    blurb: string;
    title: string;
    summary: string | null;
    version: number;
    effectiveFrom: string;
}

export interface LegalDocument extends LegalIndexEntry {
    body: string;
    meta: unknown;
}

export interface AgreementText {
    id: string;
    kind: string;
    version: number;
    title: string;
    body: string;
    activatedAt?: string | null;
    createdAt?: string;
}

export type LegalRoute = { source: "legal"; kind: LegalKind } | { source: "agreement"; kind: AgreementKind };

const isLegalKind = (value: string): value is LegalKind => (LEGAL_KINDS as readonly string[]).includes(value);
const isAgreementKind = (value: string): value is AgreementKind => (AGREEMENT_KINDS as readonly string[]).includes(value);

/** Other spellings a link may use for a kind — the page is forgiving, the canonical address is the kind. */
const ALIASES: Record<string, LegalRoute> = {
    PRIVACY: { source: "legal", kind: "PRIVACY_POLICY" },
    TERMS: { source: "legal", kind: "TERMS_OF_SERVICE" },
    TERMS_OF_USE: { source: "legal", kind: "TERMS_OF_SERVICE" },
    REFUND: { source: "legal", kind: "REFUND_POLICY" },
    REFUNDS: { source: "legal", kind: "REFUND_POLICY" },
    CANCELLATION_POLICY: { source: "legal", kind: "REFUND_POLICY" },
    DISCLAIMER: { source: "legal", kind: "LEGAL_DISCLAIMER" },
    CONTACT: { source: "legal", kind: "CONTACT_INFO" },
    FAQS: { source: "legal", kind: "FAQ" },
    ADVERTISER_AGREEMENT: { source: "agreement", kind: "ADVERTISER_PLATFORM" },
    ADVERTISER_TERMS: { source: "agreement", kind: "ADVERTISER_PLATFORM" },
    PUBLISHER_PLATFORM: { source: "agreement", kind: "PLATFORM" },
    PUBLISHER_AGREEMENT: { source: "agreement", kind: "PLATFORM" },
    PUBLISHER_TERMS: { source: "agreement", kind: "PLATFORM" },
    PLATFORM_AGREEMENT: { source: "agreement", kind: "PLATFORM" },
    PRINT_PARTNER_AGREEMENT: { source: "agreement", kind: "PRINT_PARTNER_SERVICE" },
    PRINT_PARTNER: { source: "agreement", kind: "PRINT_PARTNER_SERVICE" },
    LICENCE: { source: "agreement", kind: "PUBLISHER_LICENCE" },
    PUBLISHER_LICENSE: { source: "agreement", kind: "PUBLISHER_LICENCE" },
};

/**
 * Which document an address names: a legal kind (`PRIVACY_POLICY`), an
 * agreement kind (`ADVERTISER_PLATFORM`), either with `_AGREEMENT` after it
 * (`ADVERTISER_PLATFORM_AGREEMENT`), in any case, with dashes or
 * underscores, or one of the plain names (`privacy`, `publisher-agreement`).
 */
export function resolveLegalRoute(raw: string): LegalRoute | null {
    let key: string;
    try {
        key = decodeURIComponent(raw);
    } catch {
        return null;
    }
    key = key.trim().toUpperCase().replace(/[-\s]+/g, "_");
    if (!/^[A-Z_]{2,64}$/.test(key)) return null;
    if (isLegalKind(key)) return { source: "legal", kind: key };
    if (isAgreementKind(key)) return { source: "agreement", kind: key };
    if (ALIASES[key]) return ALIASES[key]!;
    const bare = key.replace(/_AGREEMENT$/, "");
    if (bare !== key) {
        if (isAgreementKind(bare)) return { source: "agreement", kind: bare };
        if (ALIASES[bare]) return ALIASES[bare]!;
    }
    return null;
}

/** The canonical address of a document on the website. */
export const legalHref = (kind: LegalKind | AgreementKind): string => `/legal/${kind}`;

/* ------------------------------------------------------------------ */
/* Reads                                                               */
/* ------------------------------------------------------------------ */

export const legalService = {
    index: () => api.get<LegalIndexEntry[]>("/legal", { anonymous: true }),
    document: (kind: LegalKind) => api.get<LegalDocument>(`/legal/${kind}`, { anonymous: true }),
    /**
     * The live agreement text; 404 (`NO_ACTIVE_TEMPLATE`, or not a public
     * kind) is answered as null. A party-facing platform kind is read
     * signed out (`/legal/agreements/:kind`); any other needs a session.
     */
    agreement: (kind: AgreementKind) =>
        (isPublicAgreement(kind) ? api.get<AgreementText>(`/legal/agreements/${kind}`, { anonymous: true }) : api.get<AgreementText>(`/agreements/current/${kind}`)).catch((caught: unknown) => {
            if (caught instanceof ApiError && caught.status === 404) return null;
            throw caught;
        }),
};

/** How long a server keeps a published document before reading it again. */
export const LEGAL_REVALIDATE_SECONDS = 300;

/** A public read on the server: cached, time-boxed, and null (never a throw) when ADX does not answer. */
async function serverRead<T>(path: string, baseUrl: string): Promise<T | null> {
    try {
        const response = await fetch(`${baseUrl}${path}`, { next: { revalidate: LEGAL_REVALIDATE_SECONDS }, signal: AbortSignal.timeout(5000) });
        if (!response.ok) return null;
        const payload = (await response.json()) as { success?: boolean; data?: T };
        return payload?.data ?? null;
    } catch {
        return null;
    }
}

export const legalServer = {
    index: (baseUrl: string = apiConfig.baseUrl) => serverRead<LegalIndexEntry[]>("/legal", baseUrl),
    document: (kind: LegalKind, baseUrl: string = apiConfig.baseUrl) => serverRead<LegalDocument>(`/legal/${kind}`, baseUrl),
};

/** The index in the app's order, anything unknown after. */
export function orderedIndex(entries: LegalIndexEntry[]): LegalIndexEntry[] {
    const rank = (kind: string) => {
        const at = POLICY_ORDER.indexOf(kind as LegalKind);
        return at === -1 ? POLICY_ORDER.length : at;
    };
    return [...entries].sort((a, b) => rank(a.kind) - rank(b.kind));
}

/* ------------------------------------------------------------------ */
/* Structured documents                                                */
/* ------------------------------------------------------------------ */

export interface ContactMeta {
    placeholder?: boolean;
    office?: { name: string; address: string };
    supportLine?: { phone: string; hours?: string; days?: string };
    safetyLine?: { phone: string; hours?: string };
    email?: { support?: string; legal?: string; privacy?: string; partners?: string; replyNote?: string };
    registration?: { cin?: string; gstin?: string; pan?: string };
}

export interface FaqEntry {
    q: string;
    a: string;
    tags?: string[];
}

export const contactOf = (document: Pick<LegalDocument, "meta"> | null | undefined): ContactMeta => ((document?.meta as ContactMeta | null) ?? {}) as ContactMeta;

export function faqItemsOf(document: Pick<LegalDocument, "meta"> | null | undefined): FaqEntry[] {
    const items = (document?.meta as { items?: unknown } | null)?.items;
    return Array.isArray(items) ? (items as FaqEntry[]).filter((item) => typeof item?.q === "string" && typeof item?.a === "string") : [];
}

/** Whether a document is still the placeholder ADX Legal has to replace. */
export function isPlaceholder(document: Pick<LegalDocument, "title" | "meta"> | null | undefined): boolean {
    if (!document) return false;
    if ((document.meta as { placeholder?: boolean } | null)?.placeholder) return true;
    return document.title.toLowerCase().includes("placeholder");
}

/** A title without the "(placeholder)" ADX Legal's stand-in carries. */
export const cleanTitle = (title: string): string => title.replace(/\s*\(placeholder\)\s*$/i, "").trim();

/** `+91 80 4666 0000` → `+918046660000`, for a `tel:` link. */
export const telHref = (phone: string): string => `tel:${phone.replace(/[^\d+]/g, "")}`;

const DATE = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kolkata" });

/** "Effective 16 September 2026 · version 1". */
export function effectiveLine(effectiveFrom: string | null | undefined, version: number | null | undefined): string | null {
    const when = effectiveFrom ? new Date(effectiveFrom) : null;
    const date = when && !Number.isNaN(when.getTime()) ? DATE.format(when) : null;
    if (!date && !version) return null;
    return [date ? `Effective ${date}` : null, version ? `version ${version}` : null].filter(Boolean).join(" · ");
}

/* ------------------------------------------------------------------ */
/* Markdown — the little of it a policy uses                           */
/* ------------------------------------------------------------------ */

const escapeHtml = (text: string): string => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Only links a reader can follow safely: the web, mail, phone, or a path on this site. */
const safeHref = (href: string): string | null => (/^(https?:\/\/|mailto:|tel:|\/(?!\/)|#)/i.test(href) ? href : null);

/** Inline: code, links, bold, italic. Escaped first, so the source cannot inject HTML. */
function inline(text: string): string {
    return escapeHtml(text)
        .replace(/`([^`]+)`/g, "<code>$1</code>")
        .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_all, label: string, href: string) => {
            const target = safeHref(href.replace(/&amp;/g, "&"));
            return target ? `<a href="${escapeHtml(target)}">${label}</a>` : label;
        })
        .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
        .replace(/(^|[^*])\*([^*]+)\*/g, "$1<em>$2</em>")
        .replace(/(^|[^\w])_([^_]+)_(?=[^\w]|$)/g, "$1<em>$2</em>");
}

/**
 * Block-level Markdown — headings, lists, quotes, paragraphs — as
 * `website/build-pages.mjs` renders a policy, so a document reads the same
 * pressed or live. `topLevel` is the heading level a `#` becomes: 2 when the
 * page draws its own h1 above the body.
 */
export function renderMarkdown(markdown: string, topLevel = 2): string {
    const lines = markdown.replace(/\r\n/g, "\n").split("\n");
    const out: string[] = [];
    let list: "ul" | "ol" | null = null;
    let paragraph: string[] = [];

    const closeParagraph = () => {
        if (paragraph.length) {
            out.push(`<p>${inline(paragraph.join(" "))}</p>`);
            paragraph = [];
        }
    };
    const closeList = () => {
        if (list) {
            out.push(`</${list}>`);
            list = null;
        }
    };

    for (const raw of lines) {
        const line = raw.trim();
        if (!line) {
            closeParagraph();
            closeList();
            continue;
        }
        const heading = /^(#{1,4})\s+(.*)$/.exec(line);
        if (heading) {
            closeParagraph();
            closeList();
            const level = Math.min(heading[1]!.length + topLevel - 1, 5);
            out.push(`<h${level}>${inline(heading[2]!)}</h${level}>`);
            continue;
        }
        const bullet = /^[-*]\s+(.*)$/.exec(line);
        if (bullet) {
            closeParagraph();
            if (list !== "ul") {
                closeList();
                out.push("<ul>");
                list = "ul";
            }
            out.push(`<li>${inline(bullet[1]!)}</li>`);
            continue;
        }
        const numbered = /^\d+[.)]\s+(.*)$/.exec(line);
        if (numbered) {
            closeParagraph();
            if (list !== "ol") {
                closeList();
                out.push("<ol>");
                list = "ol";
            }
            out.push(`<li>${inline(numbered[1]!)}</li>`);
            continue;
        }
        const quote = /^>\s?(.*)$/.exec(line);
        if (quote) {
            closeParagraph();
            closeList();
            out.push(`<blockquote>${inline(quote[1]!)}</blockquote>`);
            continue;
        }
        closeList();
        paragraph.push(line);
    }
    closeParagraph();
    closeList();
    return out.join("\n");
}

/** The body without a leading `# Title` that repeats the page's own heading. */
export function withoutLeadingTitle(markdown: string, title: string): string {
    const match = /^\s*#\s+(.+)\n/.exec(markdown);
    if (!match) return markdown;
    const heading = match[1]!.trim().toLowerCase();
    const wanted = cleanTitle(title).toLowerCase();
    return heading === wanted || wanted.startsWith(heading) || heading.startsWith(wanted) ? markdown.slice(match[0].length) : markdown;
}

/* ------------------------------------------------------------------ */
/* Live chat — the help centre's availability line                     */
/* ------------------------------------------------------------------ */

export interface LiveStatus {
    entitled: boolean;
    reason: string;
    plan: { name: string; tier: string } | null;
    upsell: { title: string; href: string };
    online: boolean;
    expectedWaitSec: number | null;
    withinHours: boolean;
    nextOpening: string | null;
    nextOpeningLabel: string | null;
    firstResponseTargetSec: number;
}

export const supportLiveService = {
    /** `GET /support/live/status` — a session; never fatal to the page that asks. */
    status: () => api.get<LiveStatus>("/support/live/status"),
};

/** The line under "Chat with ADX" — the app's `presenceLine`, in the words a website visitor reads. */
export function liveChatLine(status: LiveStatus | null): string {
    if (!status) return "Checking the desk…";
    if (status.entitled && status.online) {
        const minutes = Math.max(1, Math.round(status.firstResponseTargetSec / 60));
        return `Live chat is open — ADX typically replies in under ${minutes} ${minutes === 1 ? "minute" : "minutes"}.`;
    }
    if (status.entitled && !status.online) {
        return status.nextOpeningLabel ? `Live chat is closed until ${status.nextOpeningLabel}. A message now becomes a request ADX answers.` : "Nobody is on live chat right now. A message becomes a request ADX answers.";
    }
    if (status.reason === "NOT_SUBSCRIBED" || status.reason === "PLAN_EXCLUDED") {
        return status.plan ? `Live chat is part of the ${status.plan.name} plan. Requests are answered for everyone.` : `${status.upsell.title}. Requests are answered for everyone.`;
    }
    if (status.reason === "FEATURE_OFF") return "Live chat is not running at the moment. Requests are answered as usual.";
    return "Raise a request and ADX answers it on the thread.";
}
