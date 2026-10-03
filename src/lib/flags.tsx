"use client";

import * as React from "react";
import { api, onFeatureOff } from "@/lib/api-client";
import { useAuth } from "@/lib/auth";

/**
 * The platform's feature switches, as the console sets them — `GET
 * /app/flags`, the same read the apps make (`mobile/shared/features/flags`).
 * The answer is `{ key: { enabled, variant } }` per feature, with a few
 * legacy flat booleans; both shapes are read strictly, and anything that is
 * not exactly on is off. An unknown key is off, so a page behind a switch
 * the server has not created fails closed. Read once per signed-in person,
 * again when the tab comes back to the front; signed out, everything is off.
 *
 * Two readings, for two kinds of switch:
 *
 *   - `useFlag(key)` — a control that exists only while its feature is on
 *     (instant booking, a second market, the paid placements). Fails closed.
 *   - `useSwitchedOff(key)` — the kill switch on a section the backend
 *     guards with `requireFeature(key)` (503 FEATURE_OFF). True only when
 *     the platform has said so: the read named the key off, or a call just
 *     came back 503 FEATURE_OFF for it (lib/api-client reports every one,
 *     and the provider folds it in, so a switch flipped mid-session takes
 *     the section down wherever it is drawn). Signed out, before the read,
 *     when it failed or when it does not name the key, the section draws
 *     and the server decides — a flags read that failed must not put
 *     "switched off" across the workspace. `FeatureGate`
 *     (components/platform/feature-off) is the page-side half.
 *
 * Keys are the registry's (docs/feature-registry.json), not the legacy flat
 * aliases: the canonical answer carries the variant, and the kill switch's
 * 503 names the canonical key.
 */
export const FLAG_INSTANT_BOOKING = "marketplace.instant-booking";
export const FLAG_MULTI_MARKET = "campaigns.multi-market";
export const FLAG_SPOT_INSIGHTS = "publisher.spot-insights";
export const FLAG_PUBLISHER_PLANS = "revenue.publisher-plans";

/*
 * The kill switches the backend enforces on a route the website calls
 * (`requireFeature(key)` → 503 FEATURE_OFF), beside the four above. Three
 * more are enforced on routes the website never calls — `comms.push` (the
 * phones' device registry), `comms.announcements` (the console's send) and
 * `ops.live-map` (the agents' positions) — so nothing here gates them.
 */
export const FLAG_LIVE_CHAT = "support.live-chat";
export const FLAG_PRINT_FLOOR = "partners.print-floor";
export const FLAG_PRINT_QUOTES = "partners.quotes";
export const FLAG_PARTNER_KYC = "print.partner-kyc";
export const FLAG_LANDING_PAGES = "campaigns.landing-pages";
export const FLAG_REVIEWS = "marketplace.reviews";
export const FLAG_DATA_EXPORT = "users.data-export";
export const FLAG_PAYMENT_GATEWAYS = "payments.gateways";
/** LM-1's paid placements — the same values `services/promotions` exports, which its pages read. */
export const FLAG_PROMOTION_ADS = "promotions.ads";
export const FLAG_PROMOTION_BOOSTS = "promotions.boosts";

/** Every kill switch the website draws a section for, with the name its "switched off" line uses. */
export const KILL_SWITCHES: Readonly<Record<string, string>> = {
    [FLAG_LIVE_CHAT]: "Live chat",
    [FLAG_PRINT_FLOOR]: "The print partner workspace",
    [FLAG_PRINT_QUOTES]: "Quote requests",
    [FLAG_PARTNER_KYC]: "Verification for print partners",
    [FLAG_PUBLISHER_PLANS]: "Publisher plans",
    [FLAG_LANDING_PAGES]: "The ADX landing page builder",
    [FLAG_REVIEWS]: "Reviews",
    [FLAG_DATA_EXPORT]: "Downloading your data",
    // Card, UPI and a bank transfer all start as a payment intent (POST /payments/intents), the route the switch guards.
    [FLAG_PAYMENT_GATEWAYS]: "Paying by card, UPI or bank transfer",
    [FLAG_PROMOTION_ADS]: "Promote on ADX",
    [FLAG_PROMOTION_BOOSTS]: "Sponsored listings",
    [FLAG_SPOT_INSIGHTS]: "Spot insights",
    [FLAG_INSTANT_BOOKING]: "Instant booking",
    [FLAG_MULTI_MARKET]: "Campaigns in more than one market",
};

/** The names above that take "are": "Reviews are switched off for now." */
export const PLURAL_SWITCH_NAMES: ReadonlySet<string> = new Set([FLAG_PRINT_QUOTES, FLAG_PUBLISHER_PLANS, FLAG_REVIEWS, FLAG_PROMOTION_BOOSTS, FLAG_SPOT_INSIGHTS, FLAG_MULTI_MARKET]);

export interface FeatureAnswer {
    enabled: boolean;
    variant: string | null;
}

export type FeatureMap = Record<string, FeatureAnswer>;

const OFF: FeatureAnswer = Object.freeze({ enabled: false, variant: null });
const NONE: ReadonlyMap<string, number> = new Map();

export function parseFlags(answer: unknown): FeatureMap {
    const features: FeatureMap = {};
    if (!answer || typeof answer !== "object" || Array.isArray(answer)) return features;
    for (const [key, value] of Object.entries(answer as Record<string, unknown>)) {
        if (value && typeof value === "object" && !Array.isArray(value)) {
            const row = value as { enabled?: unknown; variant?: unknown };
            features[key] = { enabled: row.enabled === true, variant: typeof row.variant === "string" && row.variant.trim() !== "" ? row.variant : null };
        } else {
            features[key] = { enabled: value === true, variant: null };
        }
    }
    return features;
}

/** The answer with every key the server has since refused (503 FEATURE_OFF) read as off. */
export function withSwitchedOff(features: FeatureMap, refused: Iterable<string>): FeatureMap {
    const keys = [...refused];
    if (keys.length === 0) return features;
    const out: FeatureMap = { ...features };
    for (const key of keys) out[key] = OFF;
    return out;
}

/**
 * The refusals a flags read that started at `startedAt` does not answer for:
 * a 503 that arrived after the read went out is newer than anything the
 * read can say, so it stays; the older ones give way to the fresh answer.
 */
export function refusalsAfter(refused: ReadonlyMap<string, number>, startedAt: number): ReadonlyMap<string, number> {
    const kept = [...refused].filter(([, at]) => at > startedAt);
    return kept.length === refused.size ? refused : kept.length === 0 ? NONE : new Map(kept);
}

/** A sequence, not a clock: two things in the same millisecond still have an order. */
let tick = 0;
const nextTick = () => ++tick;

/** Whether the platform has said this feature is off: named in the answer, and not on. An absent key is not known to be off. */
export function switchedOffIn(features: FeatureMap, key: string): boolean {
    const answer = features[key];
    return answer !== undefined && !answer.enabled;
}

const FlagsContext = React.createContext<{ features: FeatureMap; loaded: boolean }>({ features: {}, loaded: false });

export function FlagsProvider({ children }: { children: React.ReactNode }) {
    const { status, user } = useAuth();
    const [answer, setAnswer] = React.useState<{ subject: string; features: FeatureMap } | null>(null);
    // The keys a call came back 503 FEATURE_OFF for, each with when it arrived — the server's word, folded over the answer.
    const [refused, setRefused] = React.useState<ReadonlyMap<string, number>>(NONE);
    const subject = status === "signed-in" ? (user?.id ?? null) : null;

    React.useEffect(
        () =>
            onFeatureOff((key) => {
                const at = nextTick();
                setRefused((current) => new Map(current).set(key, at));
            }),
        []
    );

    React.useEffect(() => {
        if (!subject) return;
        let cancelled = false;
        const read = () => {
            const startedAt = nextTick();
            return api
                .get<unknown>("/app/flags")
                .then((body) => {
                    if (cancelled) return;
                    setAnswer({ subject, features: parseFlags(body) });
                    // A fresh answer is the platform's word now — a switch turned back on reads on again — except for a refusal newer than the read.
                    setRefused((current) => refusalsAfter(current, startedAt));
                })
                .catch(() => {
                    if (!cancelled) setAnswer({ subject, features: {} });
                });
        };
        void read();
        const onVisible = () => {
            if (document.visibilityState === "visible") void read();
        };
        document.addEventListener("visibilitychange", onVisible);
        return () => {
            cancelled = true;
            document.removeEventListener("visibilitychange", onVisible);
        };
    }, [subject]);

    // A flag bucketed on one person is not the next person's: an answer for another subject reads as nothing yet.
    const value = React.useMemo(() => {
        const mine = subject !== null && answer !== null && answer.subject === subject ? answer.features : null;
        return { features: withSwitchedOff(mine ?? {}, refused.keys()), loaded: mine !== null || status === "signed-out" };
    }, [subject, answer, status, refused]);
    return <FlagsContext.Provider value={value}>{children}</FlagsContext.Provider>;
}

/** One feature's answer; off with no variant until the read lands, and when it fails. */
export function useFeature(key: string): FeatureAnswer {
    return React.useContext(FlagsContext).features[key] ?? OFF;
}

/** Every answer at once — for a list of controls each behind its own switch. */
export function useFlags(): FeatureMap {
    return React.useContext(FlagsContext).features;
}

/** Whether a switch is on. */
export function useFlag(key: string): boolean {
    return useFeature(key).enabled;
}

/** Whether the read has landed — a page that would otherwise flash a control can wait for it. */
export function useFlagsLoaded(): boolean {
    return React.useContext(FlagsContext).loaded;
}

/**
 * Whether the platform has switched this feature off — the kill-switch
 * reading (see the top of this file): true only when the answer names the
 * key off or a call came back 503 FEATURE_OFF for it. Unknown is not off.
 */
export function useSwitchedOff(key: string): boolean {
    return switchedOffIn(React.useContext(FlagsContext).features, key);
}

/** `useSwitchedOff` for a list — a navigation, a set of tiles — each behind its own switch. */
export function useSwitchedOffCheck(): (key: string) => boolean {
    const { features } = React.useContext(FlagsContext);
    return React.useCallback((key: string) => switchedOffIn(features, key), [features]);
}
