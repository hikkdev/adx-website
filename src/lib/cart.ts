"use client";

import * as React from "react";

/**
 * The campaign cart before it is a campaign.
 *
 * DR 12's "Add" on a space card and "Campaign cart" in the navigation hold
 * spaces a visitor is considering — before they have signed in, before a
 * campaign exists. Kept in this browser until the cart is turned into a
 * campaign on the backend (`POST /campaigns` + `PUT /campaigns/:id/spots`,
 * see `bookingService.campaignFromCart`), which is the moment it becomes a
 * record the apps and the console see. The print choice (board 04's
 * "Printing and installation" card) rides along so the campaign's
 * `fulfilment` is set from what the person ticked here.
 */
export interface CartLine {
    listingId: string;
    title: string;
    photo: string | null;
    chip: string;
    area: string | null;
    ratePerDay: string | null;
    addedAt: string;
}

export interface CartDates {
    from: string | null;
    to: string | null;
}

export interface CartState {
    lines: CartLine[];
    dates: CartDates;
    /** "Print for me" (true) or "I will ship my own" — one choice for the campaign, as the backend takes it. */
    printing: boolean;
}

const KEY = "adx.web.cart";
const EMPTY: CartState = { lines: [], dates: { from: null, to: null }, printing: true };

let state: CartState | null = null;
const listeners = new Set<() => void>();

function read(): CartState {
    if (state) return state;
    if (typeof window === "undefined") return EMPTY;
    try {
        const raw = window.localStorage.getItem(KEY);
        state = raw ? { ...EMPTY, ...(JSON.parse(raw) as Partial<CartState>) } : EMPTY;
    } catch {
        state = EMPTY;
    }
    return state;
}

function write(next: CartState) {
    state = next;
    try {
        window.localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
        /* Private mode or a full store: the cart lives in memory for this page. */
    }
    listeners.forEach((listener) => listener());
}

export const cart = {
    get: read,
    add(line: Omit<CartLine, "addedAt">) {
        const current = read();
        if (current.lines.some((l) => l.listingId === line.listingId)) return false;
        write({ ...current, lines: [...current.lines, { ...line, addedAt: new Date().toISOString() }] });
        return true;
    },
    remove(listingId: string) {
        const current = read();
        write({ ...current, lines: current.lines.filter((l) => l.listingId !== listingId) });
    },
    setDates(dates: CartDates) {
        write({ ...read(), dates });
    },
    setPrinting(printing: boolean) {
        write({ ...read(), printing });
    },
    clear() {
        write(EMPTY);
    },
    subscribe(listener: () => void) {
        listeners.add(listener);
        return () => {
            listeners.delete(listener);
        };
    },
};

const serverSnapshot = EMPTY;

/** The cart as React state: re-renders on every change, empty on the server. */
export function useCart(): CartState {
    return React.useSyncExternalStore(cart.subscribe, read, () => serverSnapshot);
}
