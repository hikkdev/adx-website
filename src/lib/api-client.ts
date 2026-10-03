import { apiConfig } from "./api-config";

/**
 * The website's client over the ADX backend — the console's client without
 * the admin-only parts (impersonation, authenticator enrolment). The API
 * answers `{ success, data }` on success and `{ success: false, error: {
 * code, message, details } }` on failure; the envelope is unwrapped here so
 * a caller only sees the payload. A 401 refreshes the session once and
 * replays; a second 401 ends the session and tells the shell.
 */
export class ApiError extends Error {
    readonly status: number;
    readonly code: string;
    readonly details?: unknown;

    constructor(status: number, code: string, message: string, details?: unknown) {
        super(message);
        this.name = "ApiError";
        this.status = status;
        this.code = code;
        this.details = details;
    }

    /** Field-level messages from a Zod flatten(), when the backend sent one. */
    get fieldErrors(): Record<string, string[]> {
        const flattened = this.details as { fieldErrors?: Record<string, string[]> } | undefined;
        return flattened?.fieldErrors ?? {};
    }

    /** The wait a 429 asks for, from the body or the header. */
    get retryAfterSeconds(): number | null {
        const fromDetails = (this.details as { retryAfterSeconds?: unknown } | undefined)?.retryAfterSeconds;
        if (typeof fromDetails === "number" && Number.isFinite(fromDetails)) return fromDetails;
        return this.retryAfterHeader;
    }

    retryAfterHeader: number | null = null;

    /** The feature a 503 FEATURE_OFF names (`details.key`), or null for any other failure. */
    get featureKey(): string | null {
        if (this.status !== 503 || this.code !== FEATURE_OFF) return null;
        const key = (this.details as { key?: unknown } | undefined)?.key;
        return typeof key === "string" && key.trim() !== "" ? key : null;
    }
}

/* ------------------------------------------------------------------ */
/* Kill switches                                                       */
/* ------------------------------------------------------------------ */

/**
 * The backend's kill switch on a route — `requireFeature(key)` answers 503
 * `FEATURE_OFF { key }` when the platform has switched that feature off for
 * this caller. Mapped here, once, so every screen reads it the same way:
 * `isFeatureOff(caught, key?)` in a catch, and every listener told the key
 * (lib/flags.tsx's FlagsProvider is the one that matters), so a switch
 * flipped mid-session turns the feature off wherever it is drawn — the
 * entry points hide and the section says it is switched off — not only on
 * the screen whose call failed.
 */
export const FEATURE_OFF = "FEATURE_OFF";

/** Whether a failure is the platform's kill switch — for one feature when `key` is given. */
export function isFeatureOff(caught: unknown, key?: string): boolean {
    if (!(caught instanceof ApiError) || caught.status !== 503 || caught.code !== FEATURE_OFF) return false;
    return key === undefined || caught.featureKey === key;
}

type FeatureOffListener = (key: string) => void;
const featureOffListeners = new Set<FeatureOffListener>();

/** Told the key of every 503 FEATURE_OFF any call receives. */
export function onFeatureOff(listener: FeatureOffListener): () => void {
    featureOffListeners.add(listener);
    return () => {
        featureOffListeners.delete(listener);
    };
}

function reportFeatureOff(error: ApiError): ApiError {
    const key = error.featureKey;
    if (key) featureOffListeners.forEach((listener) => listener(key));
    return error;
}

/* ------------------------------------------------------------------ */
/* The order age rule                                                  */
/* ------------------------------------------------------------------ */

/**
 * 29 Sep 2026 (the owner: "You don't need to be over 18 to use ADX, but you
 * do need to be over 18 to place orders"). Every order door — a campaign's
 * checkout, reservation and fee, a design quote accepted, any payment
 * intent (a bank transfer too), a display ad or a sponsored listing, a plan
 * bought, paid or set to auto-renew — answers 403 `AGE_REQUIRED { reason,
 * self }` when the person ordering has no date of birth on file (`MISSING`)
 * or is under 18 (`UNDER_18`). `self` is false when someone else — an
 * agent, ADX — acts for the account. Read here, once; the screens draw it
 * with `components/checkout/age-gate.tsx`.
 */
export const AGE_REQUIRED = "AGE_REQUIRED";

export type AgeReason = "MISSING" | "UNDER_18";

export interface AgeRefusal {
    reason: AgeReason;
    /** True when the signed-in person is the one ordering — the only case they can answer on the spot. */
    self: boolean;
    /** The server's own sentence. */
    message: string;
}

/** The refusal an order door gave, or null for any other failure. A reason the server did not name is read as MISSING. */
export function ageRefusalOf(caught: unknown): AgeRefusal | null {
    if (!(caught instanceof ApiError) || caught.code !== AGE_REQUIRED) return null;
    const details = (caught.details ?? {}) as { reason?: unknown; self?: unknown };
    return { reason: details.reason === "UNDER_18" ? "UNDER_18" : "MISSING", self: details.self !== false, message: caught.message };
}

/** Whether a failure is the order age rule (403 `AGE_REQUIRED`). */
export const isAgeRequired = (caught: unknown): boolean => ageRefusalOf(caught) !== null;

/* ------------------------------------------------------------------ */
/* Token storage                                                       */
/* ------------------------------------------------------------------ */

const ACCESS_KEY = "adx.web.accessToken";
const REFRESH_KEY = "adx.web.refreshToken";

let accessToken: string | null = null;

/** Who wants to know when the session appears or goes — the auth provider derives its status from this. */
const tokenListeners = new Set<() => void>();
const notifyTokens = () => tokenListeners.forEach((listener) => listener());

export const tokens = {
    subscribe(listener: () => void) {
        tokenListeners.add(listener);
        return () => {
            tokenListeners.delete(listener);
        };
    },
    get access() {
        if (accessToken) return accessToken;
        if (typeof window === "undefined") return null;
        accessToken = window.localStorage.getItem(ACCESS_KEY);
        return accessToken;
    },
    get refresh() {
        if (typeof window === "undefined") return null;
        return window.localStorage.getItem(REFRESH_KEY);
    },
    set(next: { accessToken: string; refreshToken?: string }) {
        accessToken = next.accessToken;
        if (typeof window === "undefined") return;
        window.localStorage.setItem(ACCESS_KEY, next.accessToken);
        if (next.refreshToken) window.localStorage.setItem(REFRESH_KEY, next.refreshToken);
        notifyTokens();
    },
    clear() {
        accessToken = null;
        if (typeof window !== "undefined") {
            window.localStorage.removeItem(ACCESS_KEY);
            window.localStorage.removeItem(REFRESH_KEY);
        }
        notifyTokens();
    },
};

/* ------------------------------------------------------------------ */
/* Request                                                             */
/* ------------------------------------------------------------------ */

/** A free-tier backend cold-starting can take ~30s on the first request; past this it is broken, not slow. */
const REQUEST_TIMEOUT_MS = 45_000;

export interface RequestOptions extends Omit<RequestInit, "body"> {
    body?: unknown;
    /** Skip the Authorization header (send-otp, verify-otp, public reads). */
    anonymous?: boolean;
    /** Internal: prevents a refresh loop. */
    _retried?: boolean;
}

let refreshInFlight: Promise<boolean> | null = null;

async function refreshAccessToken(): Promise<boolean> {
    const refreshToken = tokens.refresh;
    if (!refreshToken) return false;
    if (!refreshInFlight) {
        refreshInFlight = (async () => {
            try {
                const response = await fetch(`${apiConfig.baseUrl}/auth/refresh`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ refreshToken }),
                });
                if (!response.ok) return false;
                const payload = await response.json();
                const next = payload?.data;
                if (!next?.accessToken) return false;
                tokens.set(next);
                return true;
            } catch {
                return false;
            } finally {
                refreshInFlight = null;
            }
        })();
    }
    return refreshInFlight;
}

type SessionEndedListener = () => void;
const sessionEndedListeners = new Set<SessionEndedListener>();

/** Fired when a session cannot be recovered, so the shell can send you to sign in. */
export function onSessionEnded(listener: SessionEndedListener): () => void {
    sessionEndedListeners.add(listener);
    return () => {
        sessionEndedListeners.delete(listener);
    };
}

function endSession() {
    tokens.clear();
    sessionEndedListeners.forEach((listener) => listener());
}

async function send(path: string, options: RequestOptions): Promise<Response> {
    const { body, anonymous, _retried, headers, ...rest } = options;

    const requestHeaders = new Headers(headers);
    if (body !== undefined && !(body instanceof FormData)) requestHeaders.set("Content-Type", "application/json");
    if (!anonymous) {
        const token = tokens.access;
        if (token) requestHeaders.set("Authorization", `Bearer ${token}`);
    }

    let response: Response;
    try {
        response = await fetch(`${apiConfig.baseUrl}${path}`, {
            ...rest,
            signal: rest.signal ?? AbortSignal.timeout(REQUEST_TIMEOUT_MS),
            headers: requestHeaders,
            body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body),
        });
    } catch (error) {
        if (error instanceof DOMException && error.name === "TimeoutError") {
            throw new ApiError(0, "TIMEOUT", "The server took too long to respond. It may be starting up — try again in a moment.");
        }
        throw new ApiError(0, "NETWORK", "Could not reach ADX.");
    }

    if (response.status === 401 && !anonymous && !_retried) {
        const refreshed = await refreshAccessToken();
        if (refreshed) return send(path, { ...options, _retried: true });
        if (tokens.access || tokens.refresh) endSession();
        throw new ApiError(401, "UNAUTHENTICATED", "Your session has expired.");
    }

    return response;
}

export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const response = await send(path, options);
    if (response.status === 204) return undefined as T;

    let payload: unknown;
    try {
        payload = await response.json();
    } catch {
        if (response.ok) return undefined as T;
        throw new ApiError(response.status, "BAD_RESPONSE", "The server sent an unreadable response.");
    }

    const envelope = payload as { success?: boolean; data?: T; error?: { code?: string; message?: string; details?: unknown } };
    if (!response.ok || envelope.success === false) {
        const error = new ApiError(
            response.status,
            envelope.error?.code ?? "REQUEST_FAILED",
            envelope.error?.message ?? "Something went wrong.",
            envelope.error?.details
        );
        const retryAfter = Number(response.headers.get("Retry-After"));
        if (Number.isFinite(retryAfter) && retryAfter > 0) error.retryAfterHeader = retryAfter;
        throw reportFeatureOff(error);
    }
    return (envelope.data ?? (payload as T)) as T;
}

/** The whole envelope, for the reads that carry facts beside `data` (a page's total, say). */
export async function apiFetchEnvelope<T, M extends object = Record<string, never>>(
    path: string,
    options: RequestOptions = {}
): Promise<{ data: T } & M> {
    const response = await send(path, options);
    const payload = (await response.json()) as { success?: boolean; data?: T; error?: { code?: string; message?: string; details?: unknown } } & M;
    if (!response.ok || payload.success === false) {
        throw reportFeatureOff(new ApiError(response.status, payload.error?.code ?? "REQUEST_FAILED", payload.error?.message ?? "Something went wrong.", payload.error?.details));
    }
    return payload as { data: T } & M;
}

/** A file the backend serves, with the session's bearer (photos on private storage, statements). */
export async function apiBlob(path: string, options: RequestOptions = {}): Promise<Blob> {
    const response = await send(path, options);
    if (!response.ok) throw new ApiError(response.status, "REQUEST_FAILED", "Could not fetch the file.");
    return response.blob();
}

export const api = {
    get: <T>(path: string, options?: RequestOptions) => apiFetch<T>(path, { ...options, method: "GET" }),
    post: <T>(path: string, body?: unknown, options?: RequestOptions) => apiFetch<T>(path, { ...options, method: "POST", body }),
    put: <T>(path: string, body?: unknown, options?: RequestOptions) => apiFetch<T>(path, { ...options, method: "PUT", body }),
    patch: <T>(path: string, body?: unknown, options?: RequestOptions) => apiFetch<T>(path, { ...options, method: "PATCH", body }),
    delete: <T>(path: string, options?: RequestOptions) => apiFetch<T>(path, { ...options, method: "DELETE" }),
};

/** The message a screen shows for any failure: the API's own sentence when it sent one. */
export function messageOf(caught: unknown, fallback: string): string {
    return caught instanceof ApiError ? caught.message : fallback;
}
