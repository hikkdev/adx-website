import { api, ApiError } from "@/lib/api-client";
import { shortDate } from "@/services/advertiser-workspace";
import { configuredGateways, GATEWAY_LABEL, type GatewayStatus, type PaymentGateway, type PaymentIntent } from "@/services/payments";

/**
 * The advertiser's plans on the web — every route under
 * `ADX-backendv1/src/modules/packages` the advertiser may call, matched to
 * the app's `packages-api.ts`, `packages-catalogue-screen.tsx` and
 * `package-payment-screen.tsx`.
 *
 *   GET   /packages/catalogue               the three plans and the add-ons
 *   POST  /packages/quote                   prices a choice (the server's arithmetic, with the policy and the term)
 *   GET   /packages/active                  the running plan, grace, trials on offer, the policy
 *   PATCH /packages/active                  the advertiser's own auto-renew switch
 *   GET   /packages/sales                   the sales (the page asks for PENDING_PAYMENT)
 *   POST  /packages/sales                   buys a plan for yourself — a sale waiting for payment
 *   POST  /packages/sales/trial             a free trial: ACTIVE at once, nothing charged
 *   GET   /packages/sales/:id               one sale, with where it stands on its terms
 *   POST  /packages/sales/:id/accept-terms  the click on the live PACKAGE_SALE terms
 *   POST  /packages/sales/:id/pay           pays from the wallet (refused until the terms are accepted)
 *   POST  /payments/intents                 { packageSaleId, gateway } — card/UPI or a bank transfer
 *
 * The sale's terms gate both payment doors on the server
 * (`assertSaleTermsAccepted`, 403 AGREEMENT_REQUIRED); the page shows the
 * gate before the button so it is never refused.
 */

export type PackageTier = "STARTER" | "GROWTH" | "PRO";
export type BillingCycle = "MONTHLY" | "ANNUAL";
export type SaleStatus = "DRAFT" | "PENDING_PAYMENT" | "ACTIVE" | "EXPIRED" | "CANCELLED";
export type PaidMethod = "WALLET" | "OFFLINE" | "GATEWAY" | "TRIAL";

export interface PackagePolicy {
    cyclesOffered: BillingCycle[];
    annualDiscountPct: number;
    changePolicy: "REPLACE_NOW" | "QUEUE_AFTER_TERM";
    prorateOnChange: boolean;
    graceDays: number;
    trialDays: number;
    payment: { walletAllowed: boolean; gatewaysAllowed: string[] };
    autoRenewAllowed: boolean;
    /** How a renewal is priced; absent on today's reads, when the sweep's behaviour (catalogue) holds. */
    renewalPricing?: "CATALOGUE" | "BOUGHT_PRICE";
}

export interface PackageQuotedTerm {
    rule: "STARTS_NOW" | "QUEUED_AFTER_CURRENT" | "REPLACES_CURRENT";
    startsAt: string;
    endsAt: string;
    replaces: { id: string; tier: PackageTier; endsAt: string | null } | null;
    prorationAmount: string | null;
}

export interface CataloguePackage {
    id: string;
    tier: PackageTier;
    name: string;
    pricePerMonth: string;
    description: string | null;
    isPopular: boolean;
    entitlements: Record<string, unknown>;
}

export interface CatalogueAddOn {
    id: string;
    code: string;
    name: string;
    pricePerMonth: string;
    description: string | null;
}

export interface PricedLine {
    kind: "PLAN" | "ADDON" | string;
    code: string;
    label: string;
    pricePerMonth: string;
    months: number;
    amount: string;
}

export interface PricedSale {
    cycle: BillingCycle;
    months: number;
    pricePerMonth: string;
    addOnsPerMonth: string;
    perMonth: string;
    subtotal: string;
    discountPct: string;
    discountAmount: string;
    gstPct: string;
    gstAmount: string;
    total: string;
    lines: PricedLine[];
    policy?: PackagePolicy;
    term?: PackageQuotedTerm | null;
}

export interface AgreementStanding {
    kind: string;
    accepted: boolean;
    templateVersion: number | null;
    currentVersion: number | null;
    /** Accepted on the version live now — what the gate asks. */
    current: boolean;
}

export interface AgreementText {
    id: string;
    kind: string;
    version: number;
    title: string;
    /** Markdown, as ADX published it. */
    body: string;
}

export interface PackageSale {
    id: string;
    reference: string;
    advertiserId: string;
    advertiserName: string;
    agentId: string | null;
    tier: PackageTier;
    packageName: string;
    cycle: BillingCycle;
    months: number;
    pricePerMonth: string;
    addOnsPerMonth: string;
    subtotal: string;
    discountPct: string;
    discountAmount: string;
    gstPct: string;
    gstAmount: string;
    total: string;
    status: SaleStatus;
    paymentUrl: string;
    paidAt: string | null;
    paidMethod: PaidMethod | null;
    startsAt: string | null;
    endsAt: string | null;
    nextBillingAt: string | null;
    autoRenew?: boolean;
    createdAt: string;
    /** On `GET /sales/:id` only. */
    agreements?: AgreementStanding[];
    lines: PricedLine[];
}

export interface ActivePackage {
    saleId: string;
    reference: string;
    tier: PackageTier;
    packageName: string;
    cycle: BillingCycle;
    startsAt: string | null;
    endsAt: string | null;
    nextBillingAt: string | null;
    addOns: string[];
    entitlements: Record<string, unknown>;
    enforced: boolean;
    paidMethod?: PaidMethod | null;
    autoRenew?: boolean;
}

export interface PackageGrace {
    tier: PackageTier;
    packageName: string;
    endsAt: string;
    until: string;
}

export type ActivePackageRead = (ActivePackage | { saleId: null }) & {
    trialAvailable: Record<string, number>;
    policy: PackagePolicy;
    grace: PackageGrace | null;
};

export interface PackageSalePage {
    items: PackageSale[];
    total: number;
    page: number;
    pageSize: number;
    counts: Record<string, number>;
}

export const packagesService = {
    catalogue: () => api.get<{ packages: CataloguePackage[]; addOns: CatalogueAddOn[] }>("/packages/catalogue"),
    quote: (body: { tier: PackageTier; addOnCodes: string[]; cycle: BillingCycle }) => api.post<PricedSale>("/packages/quote", body),
    active: () => api.get<ActivePackageRead>("/packages/active"),
    setAutoRenew: (autoRenew: boolean) => api.patch<PackageSale>("/packages/active", { autoRenew }),
    /** Buys for yourself: the advertiser's own id, as the app sends it. */
    sell: (body: { advertiserId: string; tier: PackageTier; addOnCodes: string[]; cycle: BillingCycle }) => api.post<PackageSale>("/packages/sales", body),
    trial: (tier: PackageTier) => api.post<PackageSale>("/packages/sales/trial", { tier }),
    get: (id: string) => api.get<PackageSale>(`/packages/sales/${encodeURIComponent(id)}`),
    page: (query: { status?: SaleStatus[]; page?: number; pageSize?: number } = {}) => {
        const params = new URLSearchParams();
        if (query.status?.length) params.set("status", query.status.join(","));
        if (query.page) params.set("page", String(query.page));
        if (query.pageSize) params.set("pageSize", String(query.pageSize));
        const qs = params.toString();
        return api.get<PackageSalePage>(`/packages/sales${qs ? `?${qs}` : ""}`);
    },
    /** The sale already waiting for payment, if there is one — named at the top rather than joined by a second. */
    pending: async (): Promise<PackageSale | null> => {
        const page = await packagesService.page({ status: ["PENDING_PAYMENT"], pageSize: 5 });
        return page.items[0] ?? null;
    },
    termsText: () => api.get<AgreementText>("/agreements/current/PACKAGE_SALE"),
    acceptTerms: (saleId: string) => api.post<{ accepted: true; templateVersion: number; acceptanceId: string }>(`/packages/sales/${encodeURIComponent(saleId)}/accept-terms`, {}),
    /** From the advertiser's own wallet. Refused for anybody else, and until the terms are accepted. */
    pay: (saleId: string) => api.post<PackageSale>(`/packages/sales/${encodeURIComponent(saleId)}/pay`, {}),
    /** A gateway (or bank-transfer) payment for the sale; the capture tops up the wallet and pays the plan. */
    createIntent: (body: { packageSaleId: string; gateway: PaymentGateway; upiId?: string }) => api.post<PaymentIntent>("/payments/intents", body),
};

/* ------------------------------------------------------------------ */
/* Pure helpers                                                        */
/* ------------------------------------------------------------------ */

/** The live plan off the active read; `saleId: null` is the server's "nothing runs". */
export const activePlanOf = (read: ActivePackageRead | null | undefined): ActivePackage | null => (read && read.saleId !== null ? (read as ActivePackage) : null);

export const renewsAtBoughtPrice = (policy: { renewalPricing?: "CATALOGUE" | "BOUGHT_PRICE" } | null | undefined): boolean => policy?.renewalPricing === "BOUGHT_PRICE";

/** The PACKAGE_SALE standing off a sale read, or null when the read predates it. */
export function termsStanding(sale: Pick<PackageSale, "agreements"> | null | undefined): AgreementStanding | null {
    if (!sale || !Array.isArray(sale.agreements)) return null;
    return sale.agreements.find((row) => row.kind === "PACKAGE_SALE") ?? null;
}

/** Open when accepted on the version live now; a read with no standing is from before the gate, and reads as open (the server still refuses if not). */
export const termsAccepted = (standing: AgreementStanding | null): boolean => standing === null || standing.current;

export function termsLine(standing: AgreementStanding | null): string {
    if (standing === null) return "Read the terms of this plan.";
    if (standing.current) return `Plan terms accepted (version ${standing.templateVersion ?? "—"}).`;
    if (standing.accepted) return "The plan terms have a new version. Read and accept them before paying.";
    return "Read and accept the plan terms before paying.";
}

/** "3 Mar 2027" — the workspace's one date format. */
const longDate = (iso: string | null | undefined): string => shortDate(iso);
export { longDate as planDate };

/** "₹2,499" — a plan's price, grouped the Indian way, paise only when there are some. */
export function planMoney(value: string | null | undefined): string {
    if (typeof value !== "string") return "—";
    const match = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(value.trim());
    if (!match) return "—";
    const [, sign, whole, fraction = ""] = match;
    const digits = whole!.replace(/^0+(?=\d)/, "");
    const grouped = digits.length <= 3 ? digits : `${digits.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ",")},${digits.slice(-3)}`;
    const paise = fraction.padEnd(2, "0");
    return `${sign ? "−" : ""}₹${grouped}${paise === "00" ? "" : `.${paise}`}`;
}

/** "18" from "18.00" — a percentage the server sent as a decimal string, for a label. */
export function pctLabel(value: string | number | null | undefined): string {
    const n = typeof value === "number" ? value : Number(value ?? 0);
    if (!Number.isFinite(n)) return "0";
    return String(Math.round(n * 100) / 100);
}

/** True when the string is money above zero — for "show the discount row", never for arithmetic. */
export function isPositive(value: string | null | undefined): boolean {
    if (typeof value !== "string") return false;
    const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(value.trim());
    if (!match) return false;
    return /[1-9]/.test(`${match[1]}${match[2] ?? ""}`);
}

export const CYCLE_LABEL: Record<BillingCycle, string> = { MONTHLY: "Monthly", ANNUAL: "Annual" };

/** The summary bar's two lines. */
export function cycleSummary(cycle: BillingCycle): { title: string; line: string } {
    return cycle === "MONTHLY" ? { title: "Billed monthly", line: "1 month, paid once" } : { title: "Billed annually", line: "12 months, one payment" };
}

/** The term rule the quote answered, as a sentence; empty when the quote carries none. */
export function packageTermLine(term: PackageQuotedTerm | null | undefined, planName: string): string {
    if (!term) return "";
    switch (term.rule) {
        case "STARTS_NOW":
            return `${planName} starts today.`;
        case "QUEUED_AFTER_CURRENT":
            return `${planName} starts on ${longDate(term.startsAt)}, when your current term ends.`;
        case "REPLACES_CURRENT":
            return isPositive(term.prorationAmount)
                ? `${planName} replaces your current plan today. The current term ends now, and ${planMoney(term.prorationAmount)} for its unused days is credited to your wallet.`
                : `${planName} replaces your current plan today. The current term ends now, with no refund for its remaining days.`;
        default:
            return "";
    }
}

/** The plan card's one line: "Annual · runs to 3 Mar 2027 · PKG-2026-482913". */
export function planMetaLine(plan: Pick<ActivePackage, "cycle" | "endsAt" | "reference" | "paidMethod">): string {
    const trial = plan.paidMethod === "TRIAL";
    return [trial ? "Free trial" : CYCLE_LABEL[plan.cycle] ?? plan.cycle, plan.endsAt ? `${trial ? "ends" : "runs to"} ${longDate(plan.endsAt)}` : null, plan.reference].filter(Boolean).join(" · ");
}

/** Whether the switch is drawn: the policy offers auto-renew, the term ends, and it is not a trial. */
export function autoRenewOffered(plan: Pick<ActivePackage, "paidMethod" | "endsAt"> | null, policy: Pick<PackagePolicy, "autoRenewAllowed"> | null | undefined): boolean {
    return !!plan && !!policy?.autoRenewAllowed && plan.paidMethod !== "TRIAL" && !!plan.endsAt;
}

/** "Renews from your wallet on 3 Mar 2027 at the plan's current price." / "Ends on 3 Mar 2027." */
export function renewalLine(plan: Pick<ActivePackage, "endsAt" | "autoRenew">, policy: PackagePolicy | null | undefined, boughtFor: string | null): string {
    if (!plan.autoRenew) return `Ends on ${longDate(plan.endsAt)}.`;
    const price = renewsAtBoughtPrice(policy) && boughtFor ? `for ${planMoney(boughtFor)}` : "at the plan's current price";
    return `Renews from your wallet on ${longDate(plan.endsAt)} ${price}.`;
}

/** The note under the choice when a plan already runs. */
export function currentPlanNote(plan: Pick<ActivePackage, "packageName" | "endsAt">, policy: Pick<PackagePolicy, "changePolicy"> | null | undefined): string {
    const runs = `Your ${plan.packageName} plan runs${plan.endsAt ? ` to ${longDate(plan.endsAt)}` : ""}.`;
    return `${runs} ${policy?.changePolicy === "REPLACE_NOW" ? "The same plan again queues after it; a different one replaces it today." : "A new plan queues after it; the terms of the current one stand until it ends."}`;
}

export function saleStatusLabel(sale: Pick<PackageSale, "status" | "paidMethod">): { label: string; tone: "success" | "neutral" | "warning" } {
    if (sale.status === "ACTIVE") return { label: sale.paidMethod === "TRIAL" ? "Free trial" : "Active", tone: "success" };
    if (sale.status === "CANCELLED") return { label: "Cancelled", tone: "neutral" };
    if (sale.status === "EXPIRED") return { label: "Ended", tone: "neutral" };
    return { label: "Awaiting payment", tone: "warning" };
}

/* ------------------------------------------------------------------ */
/* The entitlements, as ticks                                          */
/* ------------------------------------------------------------------ */

export interface EntitlementLine {
    key: string;
    label: string;
    /** False draws the line struck through — a plan that names a thing it does not include. */
    granted: boolean;
}

const humanise = (key: string): string => {
    const spaced = key.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ").trim();
    return spaced.charAt(0).toUpperCase() + spaced.slice(1).toLowerCase();
};

const titleCase = (value: string): string => {
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
    analytics: (value) => ({ label: `${titleCase(typeof value === "string" ? value : "basic")} analytics`, granted: true }),
    bookingReportPdf: (value) => ({ label: "Booking reports as PDF", granted: value === true }),
    campaignsPerMonth: (value) =>
        value === null ? { label: "Unlimited campaigns a month", granted: true } : typeof value === "number" ? { label: `${value} campaign${value === 1 ? "" : "s"} a month`, granted: value > 0 } : null,
    creativeRefreshes: (value) => (typeof value === "number" ? { label: `${value} creative refresh${value === 1 ? "" : "es"}`, granted: value > 0 } : null),
    support: (value) => (typeof value === "string" ? { label: `${titleCase(value)} support`, granted: true } : null),
};

/** The entitlements JSON as lines a card can tick — the app's `entitlementLines`. Copy, not a gate. */
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
        else if (typeof value === "string") lines.push({ key, label: `${label}: ${titleCase(value)}`, granted: true });
    }
    return lines;
}

/* ------------------------------------------------------------------ */
/* The payment doors                                                   */
/* ------------------------------------------------------------------ */

export type PayWith = "WALLET" | PaymentGateway;

export interface PayRail {
    id: PayWith;
    title: string;
    description: string;
}

function paise(value: string | null | undefined): number | null {
    if (typeof value !== "string") return null;
    const match = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(value.trim());
    if (!match) return null;
    const n = Number(`${match[2]}${(match[3] ?? "").padEnd(2, "0")}`);
    if (!Number.isSafeInteger(n)) return null;
    return match[1] ? -n : n;
}

/** What the wallet is short of the total by, as money; null when it covers it (or either figure is unreadable). */
export function walletShortfall(spendable: string | null | undefined, total: string): string | null {
    const have = paise(spendable);
    const need = paise(total);
    if (have === null || need === null || have >= need) return null;
    const gap = need - have;
    const digits = String(gap).padStart(3, "0");
    return `${digits.slice(0, -2)}.${digits.slice(-2)}`;
}

/**
 * The doors the policy opens for this sale, in the app's order: the wallet
 * (while `walletAllowed` and it covers the total), each configured card/UPI
 * gateway the policy allows, then the bank transfer when ADX has an account
 * to name and the policy allows it. With no policy read, no door at all —
 * the page says the options could not be read rather than falling open.
 * `gatewaysOff` is the platform's `payments.gateways` kill switch: card, UPI
 * and the bank transfer all start as a payment intent, so none is offered
 * while it is off, and the wallet is the only door left.
 */
export function payRails(input: { policy: PackagePolicy | null; gateways: GatewayStatus[]; bankConfigured: boolean; spendable: string | null; total: string; gatewaysOff?: boolean }): PayRail[] {
    const { policy } = input;
    if (!policy) return [];
    const rails: PayRail[] = [];
    /* An unread balance is not a short one — the server refuses the payment if the wallet does not cover it. */
    const short = input.spendable === null ? false : walletShortfall(input.spendable, input.total) !== null;
    if (policy.payment.walletAllowed && !short) rails.push({ id: "WALLET", title: "Your ADX wallet", description: "Paid now from the balance you hold." });
    if (input.gatewaysOff) return rails;
    for (const gateway of configuredGateways(input.gateways)) {
        if (!policy.payment.gatewaysAllowed.includes(gateway.gateway)) continue;
        rails.push({ id: gateway.gateway, title: `Card or UPI · ${GATEWAY_LABEL[gateway.gateway]}`, description: `Card, UPI or net banking${gateway.testMode ? " — test mode" : ""}. Opens ${GATEWAY_LABEL[gateway.gateway]}'s page in a new tab; the amount tops up your wallet and pays the plan.` });
    }
    if (input.bankConfigured && policy.payment.gatewaysAllowed.includes("BANK_TRANSFER")) {
        rails.push({ id: "BANK_TRANSFER", title: "Direct banking (NEFT / RTGS / IMPS)", description: "Transfer the exact amount to ADX's account with the reference we give you. The plan starts once ADX confirms the transfer." });
    }
    return rails;
}

/** The rail in force: the one chosen while it is still offered, else the first. */
export function chosenRail(chosen: PayWith | null, rails: PayRail[]): PayWith | null {
    if (chosen && rails.some((rail) => rail.id === chosen)) return chosen;
    return rails[0]?.id ?? null;
}

/** A refusal the payment doors make, in the page's words. */
export function payRefusal(code: string | undefined, message: string): string {
    switch (code) {
        case "AGREEMENT_REQUIRED":
            return "Accept the plan terms before paying — the version you accepted may have changed.";
        case "PAYMENT_METHOD_NOT_OFFERED":
            return message || "That way of paying is not offered for plans right now. Choose another.";
        case "INSUFFICIENT_FUNDS":
            return "Your wallet does not cover this plan. Pay through a gateway, or ask ADX to record a transfer first.";
        case "FEATURE_OFF":
            return "Online payments are switched off right now. Pay from your wallet, or try again later.";
        case "GATEWAY_NOT_CONFIGURED":
            return message || "That payment option is not set up yet. Choose another.";
        default:
            return message;
    }
}

/**
 * Why the catalogue could not be read. `GET /packages/catalogue` carries a
 * strict `marketplace.view` permission with no role guard in front, so an
 * advertiser account the role table grants nothing is refused with 403 —
 * said as what it is, never as an empty catalogue.
 */
export function catalogueRefusal(caught: unknown): string {
    if (caught instanceof ApiError && caught.status === 403) return "ADX has not opened the plan catalogue to your account yet — the server refused the read. Your plan and any plan waiting for payment are still shown; ADX support can set a plan up for you meanwhile.";
    if (caught instanceof ApiError) return caught.message;
    return "Could not reach ADX. Try again in a moment.";
}

const LAST_PLAN_PAYMENT = "adx.web.plan-payment";

/** The gateway payment this browser last opened for a sale, so a reload keeps waiting on it. */
export const lastPlanPayment = {
    remember(saleId: string, payment: { id: string; url: string | null }) {
        try {
            window.sessionStorage.setItem(`${LAST_PLAN_PAYMENT}.${saleId}`, JSON.stringify(payment));
        } catch {
            /* ignore */
        }
    },
    read(saleId: string): { id: string; url: string | null } | null {
        try {
            const raw = window.sessionStorage.getItem(`${LAST_PLAN_PAYMENT}.${saleId}`);
            return raw ? (JSON.parse(raw) as { id: string; url: string | null }) : null;
        } catch {
            return null;
        }
    },
    forget(saleId: string) {
        try {
            window.sessionStorage.removeItem(`${LAST_PLAN_PAYMENT}.${saleId}`);
        } catch {
            /* ignore */
        }
    },
};
