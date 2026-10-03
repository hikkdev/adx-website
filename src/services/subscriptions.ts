import { api, ApiError } from "@/lib/api-client";
import { configuredGateways, GATEWAY_LABEL, type GatewayStatus, type PaymentGateway, type PaymentIntent } from "@/services/payments";
import { compareMoney, formatMoney, type Money, type WalletSnapshot } from "@/services/publisher-workspace";

/**
 * A publisher's plan, as `/revenue` serves it — the ADX app's Subscription
 * area (`mobile/user-app/src/features/publisher/subscription/*`) on the web.
 * A catalogue ops reprice from the console, an order that snapshots the
 * price and the commission, and a payment that turns the order into the
 * subscription the commission ladder reads.
 *
 * The rules are the server's and are printed, never worked out here: the
 * term (starts now, queues after the current term, or replaces it), the
 * cycles offered and the annual discount, the free trial, which payment
 * doors are open, auto-renew and the grace after a term. The order routes
 * sit behind `revenue.publisher-plans` — off, they answer 503 FEATURE_OFF
 * (404 on an older build) while the catalogue still reads.
 *
 * Every rupee is a decimal string; `ratePct` is a fraction ("0.1250").
 */

export type PlanTier = "STANDARD" | "PLUS" | "PRO";
export type SubscriptionCycle = "MONTHLY" | "ANNUAL";
export type SubscriptionOrderStatus = "PENDING_PAYMENT" | "PAID" | "CANCELLED" | "EXPIRED";
export type TermRule = "STARTS_NOW" | "QUEUED_AFTER_CURRENT" | "REPLACES_CURRENT";
export type ChangePolicy = "REPLACE_NOW" | "QUEUE_AFTER_TERM";

export interface SubscriptionPolicy {
    cyclesOffered: SubscriptionCycle[];
    annualDiscountPct: number;
    changePolicy: ChangePolicy;
    prorateOnChange: boolean;
    graceDays: number;
    trialDays: number;
    payment: { walletAllowed: boolean; gatewaysAllowed: string[] };
    autoRenewAllowed: boolean;
    /** How a renewal is priced — today's catalogue (the sweep's way) or what the term was bought for. Absent reads as the catalogue. */
    renewalPricing?: "CATALOGUE" | "BOUGHT_PRICE";
}

export interface ProrationCredit {
    subscriptionId: string;
    planName: string;
    amount: Money;
    remainingDays: number;
    termDays?: number;
    paidTotal?: Money;
}

export interface Plan {
    id: string;
    tier: PlanTier;
    name: string;
    pricePerMonth: Money;
    ratePct: string;
    description: string | null;
    isPopular: boolean;
    entitlements: unknown;
    enforced: boolean;
    enforcedKeys: string[];
    isActive: boolean;
    sortOrder: number;
}

export interface Term {
    rule: TermRule;
    startsAt: string;
    endsAt: string;
    replaces: { id: string; tier: PlanTier; endsAt: string | null } | null;
    credit?: ProrationCredit | null;
}

export type TermHint = { rule: TermRule; startsAt: string | null; credit?: ProrationCredit | null };

export interface SubscriptionQuote {
    cycle: SubscriptionCycle;
    months: number;
    pricePerMonth: Money;
    subtotal: Money;
    discountPct: Money;
    discountAmount: Money;
    gstPct: Money;
    gstAmount: Money;
    total: Money;
    plan: Plan;
    term: Term;
    policy: SubscriptionPolicy;
}

export interface SubscriptionOrder {
    id: string;
    reference: string;
    publisherId: string;
    publisherName: string;
    tier: PlanTier;
    planName: string;
    cycle: SubscriptionCycle;
    months: number;
    pricePerMonth: Money;
    ratePct: string;
    subtotal: Money;
    discountPct: Money;
    discountAmount: Money;
    gstPct: Money;
    gstAmount: Money;
    total: Money;
    status: SubscriptionOrderStatus;
    startsAt: string | null;
    paidAt: string | null;
    paidMethod: string | null;
    paidReference: string | null;
    cancelledAt: string | null;
    subscriptionId: string | null;
    createdAt: string;
}

export interface Subscription {
    id: string;
    tier: PlanTier;
    planName: string;
    ratePct: string;
    pricePerMonth: Money;
    startsAt: string;
    /** Null on an admin's open-ended grant. */
    endsAt: string | null;
    source: "ADMIN_GRANT" | "SELF_SERVICE";
    autoRenew: boolean;
}

export interface SubscriptionGrace {
    tier: PlanTier;
    planName: string;
    endsAt: string;
    until: string;
}

export interface PurchaseOption {
    tier: PlanTier;
    allowed: boolean;
    reason: "ALREADY_ON_PLAN" | null;
    rule: TermRule | null;
    startsAt: string | null;
}

/** `GET /revenue/subscriptions/me` — everything the subscription page draws. */
export interface MySubscription {
    running: Subscription | null;
    upcoming: Subscription[];
    plan: Plan | null;
    orders: SubscriptionOrder[];
    catalogue: Plan[];
    options: PurchaseOption[];
    canBuy: boolean;
    reason: "ALREADY_ON_PLAN" | "NO_PLANS_ON_SALE" | null;
    trialAvailable: Record<string, number>;
    policy: SubscriptionPolicy;
    grace: SubscriptionGrace | null;
}

/* ------------------------------------------------------------------ */
/* The service                                                         */
/* ------------------------------------------------------------------ */

const orderPath = (id: string) => `/revenue/subscription-orders/${encodeURIComponent(id)}`;

export const subscriptionsService = {
    /** The plans on sale; not behind the switch. */
    plans: () => api.get<Plan[]>("/revenue/plans"),
    /** What a tier costs for a cycle, and when its term would start. 409 ALREADY_ON_PLAN; 400 CYCLE_NOT_OFFERED names the cycles that are. */
    quote: (body: { tier: PlanTier; cycle: SubscriptionCycle }) => api.post<SubscriptionQuote>("/revenue/subscription-orders/quote", body),
    order: (body: { tier: PlanTier; cycle: SubscriptionCycle }) => api.post<{ order: SubscriptionOrder; term: Term }>("/revenue/subscription-orders", body),
    get: (id: string) => api.get<SubscriptionOrder>(orderPath(id)),
    /** From the wallet's withdrawable money only. 402 INSUFFICIENT_FUNDS. */
    pay: (id: string) => api.post<SubscriptionOrder>(`${orderPath(id)}/pay`, {}),
    /** PENDING_PAYMENT only. */
    cancel: (id: string) => api.post<SubscriptionOrder>(`${orderPath(id)}/cancel`, {}),
    /** A first-ever subscriber's free trial — PAID at once with a zero total. 409 TRIAL_NOT_OFFERED / TRIAL_ALREADY_USED. */
    trial: (body: { tier: PlanTier }) => api.post<{ order: SubscriptionOrder; subscription: Subscription }>("/revenue/subscription-orders/trial", body),
    me: () => api.get<MySubscription>("/revenue/subscriptions/me"),
    /** 409 AUTO_RENEW_NOT_OFFERED when the policy does not offer it; off is always allowed. */
    setAutoRenew: (autoRenew: boolean) => api.patch<Subscription>("/revenue/subscriptions/me", { autoRenew }),
    /** The gateway door (J-B2): the capture tops the wallet up and pays the order server-side. */
    createIntent: (subscriptionOrderId: string, gateway: PaymentGateway) => api.post<PaymentIntent>("/payments/intents", { subscriptionOrderId, gateway }),
};

/* ------------------------------------------------------------------ */
/* Words                                                               */
/* ------------------------------------------------------------------ */

export const cycleLabel = (cycle: SubscriptionCycle): string => (cycle === "ANNUAL" ? "Annual" : "Monthly");

/** "0.1250" → "12.5% commission"; anything unreadable → null. */
export function commissionLine(ratePct: string | null | undefined): string | null {
    if (typeof ratePct !== "string" || ratePct.trim() === "") return null;
    const value = Number(ratePct);
    if (!Number.isFinite(value)) return null;
    return `${Math.round(value * 10000) / 100}% commission`;
}

/** "18.00" → "18%" — a percentage the server sent as a decimal string. */
export const pctLabel = (value: string | number | null | undefined): string => {
    const n = Number(value);
    return Number.isFinite(n) ? `${Math.round(n * 100) / 100}%` : "—";
};

export interface EntitlementLine {
    key: string;
    label: string;
    /** False is drawn struck through — a plan naming a thing it does not include. */
    granted: boolean;
}

const humanise = (key: string): string => {
    const spaced = key.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ").trim();
    return spaced.charAt(0).toUpperCase() + spaced.slice(1).toLowerCase();
};
const sentenceCase = (value: string): string => {
    const lower = value.replace(/[_-]+/g, " ").toLowerCase();
    return lower.charAt(0).toUpperCase() + lower.slice(1);
};

const KNOWN: Record<string, (value: unknown) => Omit<EntitlementLine, "key"> | null> = {
    liveChat: (value) => ({ label: "Live chat with ADX support", granted: value === true }),
    prioritySupport: (value) => ({ label: "Priority support", granted: value === true }),
    featuredListings: (value) => {
        const n = typeof value === "number" ? value : 0;
        return { label: n > 0 ? `${n} featured listing${n === 1 ? "" : "s"}` : "Featured listings", granted: n > 0 };
    },
    analytics: (value) => ({ label: `${sentenceCase(typeof value === "string" ? value : "basic")} analytics`, granted: true }),
    bookingReportPdf: (value) => ({ label: "Booking reports as PDF", granted: value === true }),
    campaignsPerMonth: (value) =>
        value === null ? { label: "Unlimited campaigns a month", granted: true } : typeof value === "number" ? { label: `${value} campaign${value === 1 ? "" : "s"} a month`, granted: value > 0 } : null,
    creativeRefreshes: (value) => (typeof value === "number" ? { label: `${value} creative refresh${value === 1 ? "" : "es"}`, granted: value > 0 } : null),
    support: (value) => (typeof value === "string" ? { label: `${sentenceCase(value)} support`, granted: true } : null),
};

/** The entitlements JSON as ticks — copy, not a gate; the keys the platform seeds are worded, any other is printed humanised. */
export function entitlementLines(entitlements: unknown): EntitlementLine[] {
    if (!entitlements || typeof entitlements !== "object" || Array.isArray(entitlements)) return [];
    const lines: EntitlementLine[] = [];
    for (const [key, value] of Object.entries(entitlements as Record<string, unknown>)) {
        const known = KNOWN[key]?.(value);
        if (known) {
            lines.push({ key, ...known });
            continue;
        }
        const label = humanise(key);
        if (typeof value === "boolean") lines.push({ key, label, granted: value });
        else if (value === null) lines.push({ key, label: `Unlimited ${label.toLowerCase()}`, granted: true });
        else if (typeof value === "number") lines.push({ key, label: `${value} ${label.toLowerCase()}`, granted: value > 0 });
        else if (typeof value === "string") lines.push({ key, label: `${label}: ${sentenceCase(value)}`, granted: true });
    }
    return lines;
}

/** "25 Oct 2026". */
export function shortDate(iso: string | null | undefined): string {
    if (!iso) return "—";
    const at = new Date(iso);
    if (Number.isNaN(at.getTime())) return "—";
    return at.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

/**
 * The term rule as a sentence — under the quote, on the pay page, on the
 * receipt. A replacement says whether the unused days come back: from the
 * policy's `prorateOnChange` when given, else from the credit the term carries.
 */
export function termLine(term: { rule: TermRule | null; startsAt: string | null; credit?: ProrationCredit | null } | null | undefined, planName?: string, options: { prorate?: boolean } = {}): string {
    if (!term?.rule) return "";
    const plan = planName ?? "The plan";
    switch (term.rule) {
        case "STARTS_NOW":
            return `${plan} starts today.`;
        case "QUEUED_AFTER_CURRENT":
            return `${plan} starts on ${shortDate(term.startsAt)}, when your current term ends.`;
        case "REPLACES_CURRENT":
            return (options.prorate ?? Boolean(term.credit))
                ? `${plan} replaces your current plan today. The current term ends now, and its unused days are credited to your wallet.`
                : `${plan} replaces your current plan today. The current term ends now, with no refund for its remaining days.`;
        default:
            return "";
    }
}

/** The switch being off — 503 FEATURE_OFF today, 404 on an older build. */
export const isSwitchedOff = (caught: unknown): boolean => caught instanceof ApiError && (caught.code === "FEATURE_OFF" || caught.status === 503 || caught.status === 404);

export const orderStatusLabel = (status: SubscriptionOrderStatus): string =>
    status === "PENDING_PAYMENT" ? "Awaiting payment" : status === "PAID" ? "Paid" : status === "CANCELLED" ? "Cancelled" : "Expired";

export const orderStatusTone = (status: SubscriptionOrderStatus): "success" | "warning" | "neutral" => (status === "PAID" ? "success" : status === "PENDING_PAYMENT" ? "warning" : "neutral");

export const paidMethodLabel = (method: string | null | undefined): string =>
    !method ? "" : method === "WALLET" ? "from your wallet" : method === "GATEWAY" ? "by card or UPI" : method === "OFFLINE" ? "recorded by ADX" : method === "TRIAL" ? "free trial" : method.toLowerCase();

/** The renewal line's amount is the bought price only when the policy says renewals are priced at it. */
export const renewsAtBoughtPrice = (policy: Pick<SubscriptionPolicy, "renewalPricing"> | null | undefined): boolean => policy?.renewalPricing === "BOUGHT_PRICE";

/** The zero snapshot a publisher who has never earned is answered — the pay page says "empty", not "short". */
export const isEmptyWallet = (wallet: Pick<WalletSnapshot, "balance" | "withdrawable" | "pendingClearance" | "held"> | null | undefined): boolean =>
    !!wallet && [wallet.balance, wallet.withdrawable, wallet.pendingClearance, wallet.held].every((value) => compareMoney(value, "0.00") === 0);

/** A cycle the policy does not offer is never asked for — the first offered one is. */
export const offeredCycle = (current: SubscriptionCycle, policy: Pick<SubscriptionPolicy, "cyclesOffered"> | null | undefined): SubscriptionCycle =>
    policy && policy.cyclesOffered.length > 0 && !policy.cyclesOffered.includes(current) ? policy.cyclesOffered[0]! : current;

/** The plan the page opens on: the running tier, else the popular one, else the first on sale. */
export function initialTier(plans: Plan[], running: Subscription | null | undefined): PlanTier | null {
    return running?.tier ?? plans.find((plan) => plan.isPopular)?.tier ?? plans[0]?.tier ?? null;
}

/** The plans on sale, in the catalogue's order. */
export const onSale = (plans: Plan[]): Plan[] => plans.filter((plan) => plan.isActive).sort((a, b) => a.sortOrder - b.sortOrder);

/* ------------------------------------------------------------------ */
/* The pay page's doors                                                */
/* ------------------------------------------------------------------ */

export type PayWith = "WALLET" | PaymentGateway;

export interface PayDoors {
    rails: { id: PayWith; title: string; description: string }[];
    walletAllowed: boolean;
    /** The withdrawable balance covers the total. */
    covered: boolean;
    frozen: boolean;
    empty: boolean;
    /** The policy is known and opens no door at all. */
    noDoor: boolean;
    /** The policy is unknown — no door is offered until it is read. */
    unknown: boolean;
    /** The platform has `payments.gateways` switched off — no gateway door, and the page's own line says why. */
    gatewaysOff: boolean;
}

/**
 * The doors a pending order may be paid through, from the policy (never
 * guessed — unknown shuts every door), the wallet and the gateways ADX has
 * keys for. The wallet is offered only while the policy allows it, the
 * wallet is not frozen and its withdrawable money covers the total — the
 * server's own rule, so the button is never one it would refuse 402.
 * `gatewaysOff` is the payments kill switch (the intent is what it guards):
 * while it is off no gateway is a door, and the wallet is the only one left.
 */
export function payDoors(total: Money, policy: SubscriptionPolicy | null, wallet: Pick<WalletSnapshot, "withdrawable" | "frozenAt" | "balance" | "pendingClearance" | "held"> | null, gateways: GatewayStatus[], options: { gatewaysOff?: boolean } = {}): PayDoors {
    const withdrawable = wallet?.withdrawable ?? null;
    const covered = withdrawable !== null && compareMoney(withdrawable, total) >= 0;
    const frozen = !!wallet?.frozenAt;
    const empty = isEmptyWallet(wallet);
    const walletAllowed = policy ? policy.payment.walletAllowed : false;
    const gatewaysOff = options.gatewaysOff === true;
    const allowed = policy && !gatewaysOff ? configuredGateways(gateways).filter((row) => policy.payment.gatewaysAllowed.includes(row.gateway)) : [];
    const rails: PayDoors["rails"] = [
        ...(walletAllowed && covered && !frozen ? [{ id: "WALLET" as const, title: "Pay from your ADX wallet", description: `${formatMoney(withdrawable)} withdrawable now. Paid at once, nothing else to do.` }] : []),
        ...allowed.map((row) => ({
            id: row.gateway as PayWith,
            title: `${GATEWAY_LABEL[row.gateway]}${row.testMode ? " · test mode" : ""}`,
            description: "Card, UPI or net banking on the gateway's page. The amount tops up your wallet and pays the plan in one go.",
        })),
    ];
    return { rails, walletAllowed, covered, frozen, empty, noDoor: policy !== null && !walletAllowed && allowed.length === 0, unknown: policy === null, gatewaysOff };
}

/**
 * The sentence under the doors, in the app's order: the policy unread, no
 * door at all, the wallet not offered, a frozen wallet, an empty wallet, a
 * short one. Null when the wallet simply pays. With the gateways switched
 * off the page's plain line says why no gateway is offered, so the note
 * never blames an unconnected gateway and says nothing when no door is open.
 */
export function payNote(total: Money, doors: PayDoors, withdrawable: Money | null): { tone: "warning" | "danger" | "info"; text: string } | null {
    const gateway = doors.rails.some((rail) => rail.id !== "WALLET");
    const noGateway = (then: string): string => (doors.gatewaysOff ? `${then.charAt(0).toUpperCase()}${then.slice(1)}` : `Card and UPI are not connected yet, so ${then}`);
    if (doors.unknown) return { tone: "warning", text: "Could not read how this order may be paid. Try again in a moment — nothing is offered until ADX says which doors are open." };
    if (doors.noDoor) return doors.gatewaysOff ? null : { tone: "danger", text: "No way to pay is open right now. The order is held for a week; ADX will open one before then, or contact support." };
    if (!doors.walletAllowed) return { tone: "info", text: "Paying from your wallet is not offered right now; a plan is paid through a gateway." };
    if (doors.frozen) return { tone: "warning", text: `Your wallet is frozen while ADX reviews it, so it cannot pay for a plan.${doors.gatewaysOff ? "" : " A gateway still can."}` };
    if (doors.empty)
        return {
            tone: gateway ? "info" : "warning",
            text: `Your wallet is empty — nothing has been earned into it yet. ${gateway ? "Pay through a gateway; it tops up the wallet and activates the plan in one go." : noGateway("come back once a booking has paid you — the order is held for a week.")}`,
        };
    if (!doors.covered && withdrawable !== null)
        return {
            tone: gateway ? "warning" : "danger",
            text: `Your withdrawable balance is short of ${formatMoney(total)} — money still clearing, held, or set aside for a withdrawal cannot buy a plan. ${gateway ? "Pay the whole amount through a gateway instead." : noGateway("wait for your earnings to clear and come back — the order is held for a week.")}`,
        };
    return null;
}

/* ------------------------------------------------------------------ */
/* What rides from the plans to the pay page and the receipt           */
/* ------------------------------------------------------------------ */

const HANDOFF_KEY = "adx.web.subscription";

export interface OrderHandoff {
    term?: TermHint | null;
    policy?: SubscriptionPolicy | null;
    /** A free trial's running row, so the receipt can say when it ends. */
    trial?: Subscription | null;
    /** The gateway payment this browser opened for the order. */
    paymentId?: string | null;
    checkoutUrl?: string | null;
}

/** The quote's term and policy, kept for the order's own pages in this tab — the pay page reads `me` again when there is none. */
export const orderHandoff = {
    save(orderId: string, value: OrderHandoff) {
        try {
            const current = orderHandoff.read(orderId) ?? {};
            window.sessionStorage.setItem(`${HANDOFF_KEY}.${orderId}`, JSON.stringify({ ...current, ...value }));
        } catch {
            /* Private mode or no storage: the pages read the server instead. */
        }
    },
    read(orderId: string): OrderHandoff | null {
        try {
            const raw = window.sessionStorage.getItem(`${HANDOFF_KEY}.${orderId}`);
            return raw ? (JSON.parse(raw) as OrderHandoff) : null;
        } catch {
            return null;
        }
    },
};

/** Where one order's page is. */
export const orderHref = (id: string): string => `/publisher/subscription/orders/${encodeURIComponent(id)}`;
