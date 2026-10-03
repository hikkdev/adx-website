"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { apiConfig } from "@/lib/api-config";

/**
 * LM-1: the impressions and clicks of paid placements — the sold ads and the
 * sponsored cards — posted in batches to `POST /app/promotions/events`
 * (public, ≤ 50 a request). An impression is counted when at least half of
 * the ad or card is on screen for at least a second, once per page view; a
 * click on the tap. A failed post is dropped, never retried into a loop: a
 * count is a courtesy to the buyer, not a ledger.
 */

export type PromotionEventKind = "IMPRESSION" | "CLICK";

export interface PromotionEvent {
    kind: PromotionEventKind;
    adBookingId?: string;
    boostId?: string;
    surface: string;
}

export const EVENTS_MAX_BATCH = 50;
export const EVENTS_FLUSH_MS = 2000;
export const IMPRESSION_RATIO = 0.5;
export const IMPRESSION_DWELL_MS = 1000;

type Timer = ReturnType<typeof setTimeout>;

export interface BatcherOptions {
    send: (events: PromotionEvent[]) => void | Promise<unknown>;
    maxBatch?: number;
    delayMs?: number;
}

/**
 * Collects events and sends them together: when the batch is full, or a
 * short while after the first one waits, or when asked (`flush`, which the
 * page calls as it is hidden). Never more than `maxBatch` in one send.
 */
export function createEventBatcher({ send, maxBatch = EVENTS_MAX_BATCH, delayMs = EVENTS_FLUSH_MS }: BatcherOptions) {
    let queue: PromotionEvent[] = [];
    let timer: Timer | null = null;

    const flush = () => {
        if (timer) {
            clearTimeout(timer);
            timer = null;
        }
        while (queue.length > 0) {
            const batch = queue.slice(0, maxBatch);
            queue = queue.slice(maxBatch);
            try {
                void Promise.resolve(send(batch)).catch(() => undefined);
            } catch {
                /* Dropped: a count is not worth a broken page. */
            }
        }
    };

    const push = (event: PromotionEvent) => {
        if (!event.adBookingId && !event.boostId) return;
        queue.push(event);
        if (queue.length >= maxBatch) flush();
        else if (!timer) timer = setTimeout(flush, delayMs);
    };

    return { push, flush, pending: () => queue.length };
}

/**
 * The one-second rule: `update(ratio)` as the observer reports the share on
 * screen; `onSeen` fires once the share has stayed at or above half for the
 * dwell, and never again for this element. Falling under half restarts it.
 */
export function createDwellTimer({ onSeen, ratio = IMPRESSION_RATIO, dwellMs = IMPRESSION_DWELL_MS }: { onSeen: () => void; ratio?: number; dwellMs?: number }) {
    let timer: Timer | null = null;
    let done = false;
    const cancel = () => {
        if (timer) {
            clearTimeout(timer);
            timer = null;
        }
    };
    return {
        update(visible: number) {
            if (done) return;
            if (visible >= ratio) {
                if (!timer)
                    timer = setTimeout(() => {
                        timer = null;
                        done = true;
                        onSeen();
                    }, dwellMs);
            } else cancel();
        },
        dispose: cancel,
        get seen() {
            return done;
        },
    };
}

/* ------------------------------------------------------------------ */
/* Page views                                                          */
/* ------------------------------------------------------------------ */

const VIEW_KEY = "adx.web.pageViews";
let lastUrl: string | null = null;
let view = 0;
let seen = new Set<string>();

function storedViews(): number {
    try {
        return Number(window.sessionStorage.getItem(VIEW_KEY)) || 0;
    } catch {
        return 0;
    }
}

/**
 * The page view this URL is: a new URL (or a new load of the page) is the
 * next view, and forgets which items were seen. Idempotent per URL, so every
 * part of one page asks and gets the same number.
 */
export function markPageView(url: string): number {
    if (url === lastUrl) return view;
    lastUrl = url;
    view = storedViews() + 1;
    seen = new Set();
    try {
        window.sessionStorage.setItem(VIEW_KEY, String(view));
    } catch {
        /* A private window: the rotation still moves within the load. */
    }
    return view;
}

/** A page view is a path: a filter or a date written into the query is the same view, so an ad does not switch under the reader. */
export const currentUrl = (): string => (typeof window === "undefined" ? "" : window.location.pathname);

/** True the first time an item is seen on this page view. */
export function firstSightThisView(key: string): boolean {
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
}

/** For tests. */
export function resetPageViews() {
    lastUrl = null;
    view = 0;
    seen = new Set();
}

/* ------------------------------------------------------------------ */
/* The site's batcher                                                  */
/* ------------------------------------------------------------------ */

function post(events: PromotionEvent[]) {
    return fetch(`${apiConfig.baseUrl}/app/promotions/events`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ events }),
        /* Survives the page going away — a click that navigates still counts. */
        keepalive: true,
    });
}

let batcher: ReturnType<typeof createEventBatcher> | null = null;

export function promotionEvents() {
    if (!batcher) {
        batcher = createEventBatcher({ send: post });
        if (typeof window !== "undefined") {
            const flush = () => batcher?.flush();
            window.addEventListener("pagehide", flush);
            document.addEventListener("visibilitychange", () => {
                if (document.visibilityState === "hidden") flush();
            });
        }
    }
    return batcher;
}

export type PromotedItem = { adBookingId: string; boostId?: undefined } | { boostId: string; adBookingId?: undefined };

const keyOf = (item: PromotedItem) => (item.adBookingId ? `ad:${item.adBookingId}` : `boost:${item.boostId}`);

/** A click on a paid placement. */
export function recordClick(item: PromotedItem, surface: string) {
    promotionEvents().push({ kind: "CLICK", surface, ...item });
    /* A click usually leaves the page — send now rather than after the delay. */
    promotionEvents().flush();
}

/**
 * Watches an element and records one impression for the item once it has
 * been at least half on screen for a second — once per page view. `item`
 * null watches nothing (an unsponsored card).
 */
export function useImpression(ref: React.RefObject<Element | null>, item: PromotedItem | null, surface: string) {
    const key = item ? keyOf(item) : null;
    const itemRef = React.useRef(item);
    React.useEffect(() => {
        itemRef.current = item;
    });
    React.useEffect(() => {
        const element = ref.current;
        if (!key || !element || typeof IntersectionObserver === "undefined") return;
        markPageView(currentUrl());
        const dwell = createDwellTimer({
            onSeen: () => {
                const current = itemRef.current;
                if (!current || document.visibilityState === "hidden") return;
                if (firstSightThisView(keyOf(current))) promotionEvents().push({ kind: "IMPRESSION", surface, ...current });
            },
        });
        const observer = new IntersectionObserver((entries) => entries.forEach((entry) => dwell.update(entry.isIntersecting ? entry.intersectionRatio : 0)), { threshold: [0, IMPRESSION_RATIO, 1] });
        observer.observe(element);
        return () => {
            observer.disconnect();
            dwell.dispose();
        };
    }, [ref, key, surface]);
}

/** Counts page views as the route changes — mounted once, in the root layout. */
export function PageViewMarker() {
    const path = usePathname();
    React.useEffect(() => {
        markPageView(currentUrl());
    }, [path]);
    return null;
}
