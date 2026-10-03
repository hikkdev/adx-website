import { api } from "@/lib/api-client";
import type { SessionParty, SessionUser } from "@/services/auth";

/**
 * The side an account works on, as the apps choose it after the first
 * sign-in (`POST /users/me/party`, the onboarding ladder's first question).
 * Choosing opens that side — or claims the row an agent opened for this
 * number — grants the role, and answers a re-signed token carrying it.
 */
/**
 * PP-W (26 Sep 2026): the print partner — a print shop that prints and
 * installs. Chosen as `PRINT_PARTNER`; the account then carries the role
 * `PARTNER` (the app checks the role the same way).
 */
export type Party = "PUBLISHER" | "ADVERTISER" | "PRINT_PARTNER";

/** The role a side grants: a print partner's is `PARTNER`. */
export const ROLE_OF: Record<Party, string> = { ADVERTISER: "ADVERTISER", PUBLISHER: "PUBLISHER", PRINT_PARTNER: "PARTNER" };

/** Where each side's workspace starts. */
export const HOME_OF: Record<Party, string> = { ADVERTISER: "/advertiser", PUBLISHER: "/publisher", PRINT_PARTNER: "/partner" };

/** How each side is named on screen. */
export const LABEL_OF: Record<Party, string> = { ADVERTISER: "Advertiser", PUBLISHER: "Publisher", PRINT_PARTNER: "Print partner" };
export type AccountType = "INDIVIDUAL" | "BUSINESS" | "ORGANISATION";

/**
 * 28 Sep 2026 (the owner: "multiple profile ID assignments to a single
 * profile"): a person has one id of their own — the ADX-… one, shown as
 * "Your ADX ID". Each side has an id too, but it names the account, so it
 * is only ever shown with its label, never beside the person as theirs.
 */
export const ADX_ID_LABEL = "Your ADX ID";
export const ACCOUNT_ID_LABEL: Record<Party, string> = { ADVERTISER: "Advertiser account ID", PUBLISHER: "Publisher account ID", PRINT_PARTNER: "Print partner ID" };

/** "Advertiser account ID ADV-2509-2603"; `null` for no id. */
export const accountIdLine = (party: Party, displayId: string | null | undefined): string | null => (displayId ? `${ACCOUNT_ID_LABEL[party]} ${displayId}` : null);

export interface PartyChoice {
    party: Party;
    accountType: AccountType;
    profileId: string;
    displayId: string | null;
    created: boolean;
    accessToken?: string;
}

export interface AdvertiserMe {
    id: string;
    displayId: string | null;
    name: string;
    type: AccountType | string;
    kycStatus: string;
    email?: string | null;
    mobile?: string | null;
    city?: string | null;
}

export interface PublisherMe {
    id: string;
    displayId: string | null;
    name: string;
    type: AccountType | string;
    kycStatus: string;
    onboardingStatus?: string;
    email?: string | null;
    mobile?: string | null;
    city?: string | null;
}

export const partyService = {
    choose: (input: { party: Party; accountType: AccountType; name?: string }) => api.post<PartyChoice>("/users/me/party", input),
    advertiser: () => api.get<AdvertiserMe>("/advertisers/me"),
    publisher: () => api.get<PublisherMe>("/publishers/me"),
};

/* ------------------------------------------------------------------ */
/* Sign-up — the two steps the apps ask around the side                */
/* ------------------------------------------------------------------ */

/**
 * QR-6: the terms of use and the privacy policy, agreed before any detail
 * is asked — `POST /users/me/consent`, which stamps the versions live at
 * that moment. QR-22: the basics after the side — the two names and, if
 * they like, the date of birth and the gender (`PATCH /users/me`; the
 * backend composes the display name and mirrors it onto the side just
 * opened). 29 Sep 2026 (the owner): "You don't need to be over 18 to use
 * ADX, but you do need to be over 18 to place orders" — so the date of
 * birth is optional here, and asked again at the first order.
 */
export type Gender = "MALE" | "FEMALE" | "OTHER" | "PREFER_NOT_TO_SAY";

export const GENDER_OPTIONS: { id: Gender; label: string }[] = [
    { id: "MALE", label: "Male" },
    { id: "FEMALE", label: "Female" },
    { id: "OTHER", label: "Other" },
    { id: "PREFER_NOT_TO_SAY", label: "Prefer not to say" },
];

export interface Basics {
    firstName: string;
    lastName: string;
    /** YYYY-MM-DD, or empty — optional since 29 Sep 2026. */
    dateOfBirth: string;
    gender?: Gender | "";
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const pad2 = (n: number) => String(n).padStart(2, "0");

/**
 * The same calendar day `years` before today (the person's own day), as
 * YYYY-MM-DD — the date input's `max` and `min`. A 29 February with no twin
 * that year becomes the 28th, so a 29 February birthday falls on 1 March in
 * a common year — the rule `PATCH /users/me` applies too.
 */
export function isoYearsAgo(years: number, now: Date = new Date()): string {
    const year = now.getFullYear() - years;
    const month = now.getMonth();
    const lastDay = new Date(year, month + 1, 0).getDate();
    return `${String(year).padStart(4, "0")}-${pad2(month + 1)}-${pad2(Math.min(now.getDate(), lastDay))}`;
}

/** Today (the person's own day) as YYYY-MM-DD — a date of birth input's `max`. */
export const isoToday = (now: Date = new Date()): string => isoYearsAgo(0, now);

/** The age an order needs (29 Sep 2026) — and nothing else on ADX. */
export const ORDER_AGE = 18;

/** The one line every form says beside a date of birth: the age is asked only to order. */
export const ORDER_AGE_HINT = "You need to be 18 or over to place orders.";

/** Why a date of birth fails the rule, as a reason each form words its own way. */
export type BirthDateFault = "format" | "not-a-day" | "future" | "too-old";

/**
 * 29 Sep 2026: the one calendar rule for a date of birth, on every form here
 * and on the server (`PATCH /users/me`) — a real day, not after today, and no
 * more than 120 years back to the day. Any age passes: being 18 or over is a
 * separate question (`isAdult`), asked only when an order is placed. Null
 * when it passes.
 */
export function birthDateFault(iso: string, now: Date = new Date()): BirthDateFault | null {
    if (!ISO_DATE.test(iso)) return "format";
    const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
    const date = new Date(Date.UTC(y, m - 1, d));
    if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return "not-a-day";
    if (iso > isoToday(now)) return "future";
    if (iso < isoYearsAgo(120, now)) return "too-old";
    return null;
}

/**
 * 18 or over, by the same calendar: a valid date of birth whose 18th
 * birthday is on or before today (a 29 February birthday turns 18 on
 * 1 March in a common year). What an order needs — `AGE_REQUIRED` on the
 * server otherwise.
 */
export function isAdult(iso: string, now: Date = new Date()): boolean {
    return birthDateFault(iso, now) === null && iso <= isoYearsAgo(ORDER_AGE, now);
}

const BIRTH_DATE_WORDS: Record<BirthDateFault, string> = {
    format: "Pick your date of birth.",
    "not-a-day": "That is not a real date.",
    future: "That date is in the future.",
    "too-old": "That date is too long ago.",
};

/** The app's rule and the server's: a real day, not in the future, at most 120 years ago. Null when fine, else the sentence to print. */
export function dateOfBirthProblem(iso: string, now: Date = new Date()): string | null {
    const fault = birthDateFault(iso, now);
    return fault ? BIRTH_DATE_WORDS[fault] : null;
}

/** Whether the basics can be sent: both names, and a date of birth that passes when one is given. The date and the gender are optional. */
export const basicsReady = (basics: Basics): boolean =>
    basics.firstName.trim().length > 0 && basics.lastName.trim().length > 0 && (basics.dateOfBirth === "" || dateOfBirthProblem(basics.dateOfBirth) === null);

/** A stored date of birth as the date input holds it (YYYY-MM-DD) — an older read may carry an ISO instant. Empty when none. */
export const birthDateOf = (value: string | null | undefined): string => /^(\d{4}-\d{2}-\d{2})/.exec(value ?? "")?.[1] ?? "";

const GENDER_IDS = new Set<string>(GENDER_OPTIONS.map((option) => option.id));

/** A name that is really a name: not empty, not the number the row was opened under. */
const realName = (name: string | null | undefined, mobile: string | null | undefined): string | null => {
    const trimmed = name?.trim() ?? "";
    return trimmed && trimmed !== mobile?.trim() ? trimmed : null;
};

/** A display name split the way Settings splits it (`nameParts`): the last word is the last name. */
function splitName(name: string | null): { firstName: string; lastName: string } {
    const words = (name ?? "").split(/\s+/).filter(Boolean);
    if (words.length <= 1) return { firstName: words[0] ?? "", lastName: "" };
    return { firstName: words.slice(0, -1).join(" "), lastName: words[words.length - 1]! };
}

/** An individual's side row is named after the person; a business's is not. */
const individualName = (party: SessionParty | null | undefined, mobile: string | null | undefined): string | null =>
    party && (party.type ?? "INDIVIDUAL") === "INDIVIDUAL" ? realName(party.name, mobile) : null;

type BasicsSource = Pick<SessionUser, "mobile"> & Partial<Pick<SessionUser, "name" | "firstName" | "lastName" | "dateOfBirth" | "gender" | "advertiserProfile" | "publisherProfile">>;

/**
 * 28 Sep 2026 (the owner: "post login it keeps asking for same info over
 * and over again"): what the basics open with — everything the account
 * already holds. The two names as stored; else the display name; else the
 * name an individual gave on the side form, which lives on the side row.
 * The date of birth and the gender as stored. Only what is still missing is
 * left to type.
 */
export function basicsFrom(user: BasicsSource): Basics {
    const names =
        user.firstName || user.lastName
            ? { firstName: user.firstName ?? "", lastName: user.lastName ?? "" }
            : splitName(realName(user.name, user.mobile) ?? individualName(user.advertiserProfile, user.mobile) ?? individualName(user.publisherProfile, user.mobile));
    return {
        firstName: names.firstName,
        lastName: names.lastName,
        dateOfBirth: birthDateOf(user.dateOfBirth),
        gender: user.gender && GENDER_IDS.has(user.gender) ? (user.gender as Gender) : "",
    };
}

/**
 * The business name a second side opens with: the one the account already
 * gave the other side, when that side is a business (an advertiser's
 * registered company name first). Empty when there is none to reuse.
 */
export function businessNameFrom(user: BasicsSource): string {
    const advertiser = user.advertiserProfile;
    if (advertiser && (advertiser.type ?? "INDIVIDUAL") !== "INDIVIDUAL") {
        const held = realName(advertiser.companyName, user.mobile) ?? realName(advertiser.name, user.mobile);
        if (held) return held;
    }
    const publisher = user.publisherProfile;
    if (publisher && (publisher.type ?? "INDIVIDUAL") !== "INDIVIDUAL") return realName(publisher.name, user.mobile) ?? "";
    return "";
}

/** The body `PATCH /users/me` takes — trimmed, and no date of birth or gender key when none was given. */
export const basicsBody = (basics: Basics) => ({
    firstName: basics.firstName.trim(),
    lastName: basics.lastName.trim(),
    ...(basics.dateOfBirth ? { dateOfBirth: basics.dateOfBirth } : {}),
    ...(basics.gender ? { gender: basics.gender } : {}),
});

export const signupService = {
    consent: () => api.post<unknown>("/users/me/consent", {}),
    basics: (basics: Basics) => api.patch<unknown>("/users/me", basicsBody(basics)),
};

/* ------------------------------------------------------------------ */
/* A scanned identity code — QR-27                                     */
/* ------------------------------------------------------------------ */

/** What `GET /qr/public/:token` says to anyone: who the code belongs to, without their number. */
export interface PublicCode {
    type: "PUBLISHER" | "ADVERTISER" | string;
    name: string;
    displayId: string | null;
    city: string | null;
    verified: boolean;
}

/** What `POST /qr/resolve` answers a signed-in scanner — the action, and the account behind the code. */
export interface ScannedIdentity {
    qrId?: string;
    action: "VIEW_PUBLISHER" | "VIEW_ADVERTISER" | "REQUEST_ACCESS" | "ONBOARD_PUBLISHER" | "ONBOARD_ADVERTISER" | (string & {});
    type: "PUBLISHER" | "ADVERTISER" | (string & {});
    identity?: { id: string; displayId: string | null; name: string; type: string; city: string | null; verified: boolean; onboarded: boolean };
    needsAsk?: boolean;
}

/**
 * The role a scan is made as — the app's rule (`identity-screen.tsx`): an
 * advertiser who is not also a publisher scans as an advertiser; everyone
 * else as a publisher.
 */
export const scanRoleFor = (parties: Party[]): "ADVERTISER" | "PUBLISHER" => (parties.includes("ADVERTISER") && !parties.includes("PUBLISHER") ? "ADVERTISER" : "PUBLISHER");

export const qrService = {
    /** Signed in: resolved and logged on the owner's access log, like any scan. */
    resolve: (token: string, role: "ADVERTISER" | "PUBLISHER") => api.post<ScannedIdentity>("/qr/resolve", { token, role }),
};

/* ------------------------------------------------------------------ */
/* The invite link — LH7 (`/j/<code>`)                                 */
/* ------------------------------------------------------------------ */

export type InviteState = "LIVE" | "EXPIRED" | "REVOKED" | "CONVERTED";

export interface InviteProposal {
    id: string;
    kind: "RATE_ESTIMATE" | "CAMPAIGN_ESTIMATE" | "PACKAGE_QUOTE" | (string & {});
    payload: Record<string, unknown>;
    note: string | null;
    sentAt: string;
    openedAt: string | null;
    acceptedAt: string | null;
}

export type InviteHook =
    | { side: "PUBLISHER"; rateEstimate: { perDay: string; perMonth: string; comparables: number; radiusM: number } | null; nearbyCampaigns: number }
    | { side: "ADVERTISER"; nearbySpots: number; sampleEstimate: { spots: number; days: number; perSpotPerDay: string; amount: string } | null; packages: { tier: string; name: string; pricePerMonth: string; description: string | null; isPopular: boolean }[] };

/** `GET /j/:code` — the page an agent's invite opens, and the open it records. */
export interface InviteLanding {
    code: string;
    state: InviteState;
    expiresAt: string;
    side: "PUBLISHER" | "ADVERTISER";
    business: { name: string; contactName: string | null; city: string | null; locality: string | null; category: string | null };
    agent: { name: string | null } | null;
    copy: { headline: string; line: string | null; bullets: string[]; cta: string; blocks: { key: string; label: string }[] };
    hook: InviteHook | null;
    proposals: InviteProposal[];
    appLink: string;
    converted: boolean;
}

export interface InviteJoined {
    party: { party: "PUBLISHER" | "ADVERTISER"; profileId: string; displayId: string | null; created: boolean };
    lead: { id: string; displayId: string | null; converted: boolean };
    appLink: string;
    agentName?: string | null;
    /** `POST /j/:code/link` (26 Sep 2026): the session's token re-signed when the link put the account on a side it did not hold — adopt it, as after `POST /users/me/party`. */
    accessToken?: string;
}

/** An invite code as the backend mints it: six to twelve capitals and digits. */
export const isInviteCode = (value: string): boolean => /^[A-Za-z0-9]{6,12}$/.test(value);

const code = (value: string) => encodeURIComponent(value.toUpperCase());

export const inviteService = {
    open: (value: string) => api.get<InviteLanding>(`/j/${code(value)}`, { anonymous: true }),
    /** The landing's own door: a code to this number; an existing account signs in, a new number becomes one. */
    sendOtp: (value: string, mobile: string) => api.post<{ mobile: string; expiresInSeconds?: number; devOtp?: string }>(`/j/${code(value)}/otp`, { mobile }, { anonymous: true }),
    /** The code proves the number; the account opens on the lead's side and a session starts. */
    verify: (value: string, input: { mobile: string; otp: string; name?: string; accountType?: AccountType }) =>
        api.post<InviteJoined & { accessToken: string; refreshToken: string }>(`/j/${code(value)}/verify`, input, { anonymous: true }),
    /** Signed in already: the account takes the lead's side through the link (the app's `joinDoor`). */
    link: (value: string, input: { name?: string; accountType?: AccountType } = {}) => api.post<InviteJoined>(`/j/${code(value)}/link`, input),
    callback: (value: string, note?: string) => api.post<{ taskId: string }>(`/j/${code(value)}/callback`, note ? { note } : {}, { anonymous: true }),
    acceptProposal: (value: string, proposalId: string) => api.post<unknown>(`/j/${code(value)}/proposals/${encodeURIComponent(proposalId)}/accept`, {}, { anonymous: true }),
};

/** A proposal as one line: what the agent priced, in the words of the side it was sent to. */
export function proposalLine(proposal: Pick<InviteProposal, "kind" | "payload">): string {
    const p = proposal.payload as Record<string, unknown>;
    const money = (value: unknown) => (typeof value === "string" || typeof value === "number" ? `₹${Number(value).toLocaleString("en-IN", { maximumFractionDigits: 2 })}` : "—");
    if (proposal.kind === "RATE_ESTIMATE") return `Your space could earn about ${money(p.perDay)} a day (${money(p.perMonth)} a month).`;
    if (proposal.kind === "CAMPAIGN_ESTIMATE") return `${String(p.spots ?? "?")} spaces for ${String(p.days ?? "?")} days at ${money(p.perSpotPerDay)} a space a day: ${money(p.amount)} in all.`;
    if (proposal.kind === "PACKAGE_QUOTE") return `${String(p.name ?? p.tier ?? "A plan")} — ${money(p.perMonth)} a month, ${money(p.total)} for ${String(p.months ?? 1)} month${p.months === 1 ? "" : "s"}.`;
    return "A proposal from your ADX contact.";
}

/* ------------------------------------------------------------------ */
/* A referral link — LH3 (`/j/r/<code>`)                               */
/* ------------------------------------------------------------------ */

export interface ReferralInput {
    side: "PUBLISHER" | "ADVERTISER";
    businessName: string;
    contactName?: string;
    phone: string;
    city?: string;
    message?: string;
    /** The honeypot a person never fills. */
    website?: string;
}

/** The body the referral door takes — empty optionals dropped, the number trimmed. */
export function referralBody(input: ReferralInput): ReferralInput {
    const out: ReferralInput = { side: input.side, businessName: input.businessName.trim(), phone: input.phone.trim() };
    if (input.contactName?.trim()) out.contactName = input.contactName.trim();
    if (input.city?.trim()) out.city = input.city.trim();
    if (input.message?.trim()) out.message = input.message.trim();
    if (input.website) out.website = input.website;
    return out;
}

export const referralService = {
    /** Public: the lead lands attributed to whoever shared the link. */
    submit: (value: string, input: ReferralInput) => api.post<{ created?: boolean; thanks: true }>(`/leads/inbound/referral/${encodeURIComponent(value)}`, referralBody(input), { anonymous: true }),
};
