import { api, ApiError } from "@/lib/api-client";

/**
 * The gateway, as the web reaches it — `POST /payments/intents` opens the
 * order, the checkout happens on the gateway's own page, and ADX learns the
 * result from the gateway's webhook: the page polls `GET /payments/:id`
 * until the payment is CAPTURED or FAILED, exactly as the app does
 * (`mobile/shared/features/payments/payments-api.ts`). The bank-transfer
 * rail and its claim are the contract the backend is growing now; a 404 on
 * either is "not available yet", never a broken page.
 */
export type PaymentGateway = "RAZORPAY" | "CASHFREE" | "CCAVENUE" | "BANK_TRANSFER";
export type PaymentStatus = "CREATED" | "AUTHORIZED" | "CAPTURED" | "FAILED" | "REFUNDED" | "PARTIALLY_REFUNDED";

export interface GatewayStatus {
    gateway: PaymentGateway;
    configured: boolean;
    testMode: boolean;
}

/** The claim a person made on a bank transfer; `claimedAt` set means they have said "I have transferred". */
export interface BankTransferClaim {
    utr: string | null;
    paidOn: string | null;
    claimedAmount: string | null;
    proofFileId: string | null;
    claimedAt: string | null;
}

export interface PaymentSummary {
    id: string;
    reference: string;
    advertiserId: string | null;
    campaignId: string | null;
    gateway: PaymentGateway;
    /** Money, as a decimal string. */
    amount: string;
    currency: string;
    /** A bank transfer stays CREATED until ops confirm it (CAPTURED) or refuse it (FAILED). */
    status: PaymentStatus;
    gatewayOrderId: string | null;
    gatewayPaymentId: string | null;
    failureReason: string | null;
    capturedAt: string | null;
    createdAt: string;
    bankTransfer?: BankTransferClaim | null;
}

export interface BankTransferDetails {
    beneficiary: string;
    accountNumber: string;
    ifsc: string;
    bank: string;
    branch: string;
    instructions?: string | null;
}

/** `GET /payments/bank-transfer/details` — the account, or why the option is not offered. */
export type BankTransferAvailability = { configured: true; details: BankTransferDetails } | { configured: false; missing?: string[] };

/** UP-1: Cashfree's answer to a collect request on the payer's UPI id — the session still opens the ordinary way. */
export type UpiCollect = { requested: true; upiId: string; cfPaymentId: string | null } | { requested: false; upiId: string; error: string };

/** RF-1: what an intent pays for — the whole campaign, or the reservation fee on it. */
export type PaymentPurpose = "SETTLEMENT" | "RESERVATION_FEE";

export interface PaymentIntent {
    payment: PaymentSummary;
    /** What the gateway needs to open its checkout — shape per gateway; `upiCollect` on Cashfree when a UPI id was sent. */
    checkout?: Record<string, unknown> & { upiCollect?: UpiCollect };
    /** The backend's own checkout page under its one-time token (Razorpay); null for the redirect-flow gateways. */
    checkoutUrl?: string | null;
    /** A BANK_TRANSFER intent: the account to pay into, with the reference to quote and the exact amount. */
    bankTransfer?: (BankTransferDetails & { reference: string; amount: string }) | null;
}

export const GATEWAY_LABEL: Record<PaymentGateway, string> = {
    RAZORPAY: "Razorpay",
    CASHFREE: "Cashfree",
    CCAVENUE: "CCAvenue",
    BANK_TRANSFER: "Bank transfer",
};

export type PayMethod = "CARD" | "UPI" | "BANK_TRANSFER";

export const paymentsService = {
    /** The gateways ADX has keys for. A malformed answer is no gateway at all. */
    gateways: async (): Promise<GatewayStatus[]> => {
        const answer = await api.get<unknown>("/payments/gateways");
        if (!Array.isArray(answer)) return [];
        return answer.filter((row): row is GatewayStatus => !!row && typeof row === "object" && typeof (row as GatewayStatus).gateway === "string");
    },
    /** RF-1: `purpose: 'RESERVATION_FEE'` collects the fee instead of the total. UP-1: `upiId` asks Cashfree for a collect request, or prefills Razorpay's VPA. */
    createIntent: (body: { campaignId: string; gateway: PaymentGateway; purpose?: PaymentPurpose; upiId?: string }) => api.post<PaymentIntent>("/payments/intents", body),
    get: (id: string) => api.get<PaymentSummary>(`/payments/${encodeURIComponent(id)}`),
    confirm: (id: string, body: { gatewayPaymentId: string; signature: string; gatewayOrderId?: string }) => api.post<PaymentSummary>(`/payments/${encodeURIComponent(id)}/confirm`, body),
    /** `GET /payments/:id/return` — the backend's own status page; the web reads the row instead, but the URL is here for a link. */
    returnUrl: (apiBase: string, id: string) => `${apiBase}/payments/${encodeURIComponent(id)}/return`,

    bankTransferDetails: () => api.get<BankTransferAvailability>("/payments/bank-transfer/details"),
    /** The person's claim on a transfer they made — `paidOn` as YYYY-MM-DD; answers the payment with `bankTransfer.claimedAt` set. */
    submitBankTransfer: (id: string, body: { utr: string; paidOn: string; amount: string; proofFileId?: string }) =>
        api.post<PaymentSummary>(`/payments/${encodeURIComponent(id)}/bank-transfer/submit`, body),
};

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

/** Whether a failure is the backend saying a contract is not there yet. */
export const notAvailableYet = (caught: unknown): boolean => caught instanceof ApiError && caught.status === 404;

/** UP-1: the collect request Cashfree made on the payer's UPI id, when the intent carried one. */
export function upiCollectOf(intent: Pick<PaymentIntent, "checkout">): UpiCollect | null {
    const collect = intent.checkout?.upiCollect;
    if (!collect || typeof collect !== "object" || typeof (collect as UpiCollect).requested !== "boolean") return null;
    return collect as UpiCollect;
}

/** The card/UPI gateways the picker may offer: configured ones, in the server's order. */
export const configuredGateways = (rows: GatewayStatus[]): GatewayStatus[] => rows.filter((row) => row.configured && row.gateway !== "BANK_TRANSFER");

/** The gateway a card or UPI payment goes through — the first one configured. */
export const pickGateway = (rows: GatewayStatus[]): GatewayStatus | null => configuredGateways(rows)[0] ?? null;

/** Whether the bank-transfer rail is offered, as the gateway list says. */
export const bankTransferOffered = (rows: GatewayStatus[]): boolean => rows.some((row) => row.gateway === "BANK_TRANSFER" && row.configured);

/**
 * The page to open for this intent, or null when the gateway named nothing
 * a browser can reach. A page the intent names wins — it carries the
 * one-time token the backend's checkout page consumes.
 */
export function checkoutUrl(intent: PaymentIntent, apiBase: string): string | null {
    const { gateway } = intent.payment;
    const checkout = intent.checkout ?? {};
    const str = (key: string): string | null => {
        const value = checkout[key];
        return typeof value === "string" && value.length > 0 ? value : null;
    };
    const named = str("checkoutUrl") ?? (typeof intent.checkoutUrl === "string" && intent.checkoutUrl.length > 0 ? intent.checkoutUrl : null);
    if (named) return named;

    if (gateway === "CASHFREE") {
        const session = str("paymentSessionId");
        if (!session) return null;
        const host = checkout["environment"] === "production" ? "https://payments.cashfree.com" : "https://payments-test.cashfree.com";
        return `${host}/order/#${encodeURIComponent(session)}`;
    }
    if (gateway === "CCAVENUE") {
        const encRequest = str("encRequest");
        const accessCode = str("accessCode");
        const redirect = str("redirectUrl");
        if (!encRequest || !accessCode || !redirect) return null;
        const joiner = redirect.includes("?") ? "&" : "?";
        return `${redirect}${joiner}encRequest=${encodeURIComponent(encRequest)}&access_code=${encodeURIComponent(accessCode)}`;
    }
    if (gateway === "RAZORPAY") return `${apiBase}/payments/${encodeURIComponent(intent.payment.id)}/checkout`;
    return null;
}

export const isSettled = (status: PaymentStatus): boolean => status === "CAPTURED" || status === "FAILED" || status === "REFUNDED" || status === "PARTIALLY_REFUNDED";

export const isPaid = (status: PaymentStatus): boolean => status === "CAPTURED" || status === "REFUNDED" || status === "PARTIALLY_REFUNDED";

/** A bank transfer the person has claimed and ops have not yet confirmed or refused. */
export const isClaimed = (payment: Pick<PaymentSummary, "gateway" | "status" | "bankTransfer">): boolean =>
    payment.gateway === "BANK_TRANSFER" && !!payment.bankTransfer?.claimedAt && !isSettled(payment.status);

/**
 * Asks ADX every few seconds whether the payment has settled. Resolves with
 * the payment once it is CAPTURED or FAILED — or, for a bank transfer, once
 * it is claimed — and with the last state read when the time runs out or
 * `stop()` is called. A read that fails is retried on the next tick.
 */
export function pollPayment(
    id: string,
    options: { intervalMs?: number; timeoutMs?: number; onTick?: (payment: PaymentSummary) => void; read?: (id: string) => Promise<PaymentSummary> } = {}
): { done: Promise<{ payment: PaymentSummary | null; settled: boolean }>; stop: () => void } {
    const intervalMs = options.intervalMs ?? 3000;
    const timeoutMs = options.timeoutMs ?? 10 * 60 * 1000;
    const read = options.read ?? paymentsService.get;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let wake: (() => void) | null = null;

    const stop = () => {
        stopped = true;
        if (timer) clearTimeout(timer);
        wake?.();
    };

    const done = (async () => {
        const startedAt = Date.now();
        let last: PaymentSummary | null = null;
        while (!stopped && Date.now() - startedAt < timeoutMs) {
            try {
                last = await read(id);
                options.onTick?.(last);
                if (isSettled(last.status) || isClaimed(last)) return { payment: last, settled: true };
            } catch {
                /* Read again on the next tick. */
            }
            if (stopped) break;
            await new Promise<void>((resolve) => {
                wake = resolve;
                timer = setTimeout(resolve, intervalMs);
            });
        }
        return { payment: last, settled: last ? isSettled(last.status) || isClaimed(last) : false };
    })();

    return { done, stop };
}

const LAST_PAYMENT_KEY = "adx.web.payment";

/** The payment this browser last opened for a campaign, so the return page can find it and offer the gateway page again. */
export const lastPayment = {
    remember(campaignId: string, payment: { id: string; url: string | null; method: PayMethod; purpose?: PaymentPurpose }) {
        try {
            window.sessionStorage.setItem(`${LAST_PAYMENT_KEY}.${campaignId}`, JSON.stringify(payment));
        } catch {
            /* ignore */
        }
    },
    read(campaignId: string): { id: string; url: string | null; method: PayMethod; purpose?: PaymentPurpose } | null {
        try {
            const raw = window.sessionStorage.getItem(`${LAST_PAYMENT_KEY}.${campaignId}`);
            return raw ? (JSON.parse(raw) as { id: string; url: string | null; method: PayMethod; purpose?: PaymentPurpose }) : null;
        } catch {
            return null;
        }
    },
};

/** A UPI id, as the backend takes it: `name@bank` — a handle of letters, digits, dots, dashes or underscores, then a bank of letters and digits. */
export const UPI_ID_PATTERN = /^[\w.\-]{2,256}@[a-zA-Z][a-zA-Z0-9]{1,63}$/;
/** A UTR / transaction reference: 12–22 letters and digits. */
export const UTR_PATTERN = /^[A-Za-z0-9]{12,22}$/;
