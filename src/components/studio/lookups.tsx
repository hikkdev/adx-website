"use client";

import * as React from "react";
import type { BlockIssue, BlockTypeDef, CanvasProps, FormRow, MediaAsset, MediaSpec, SitePageRow, SlotRow } from "@/services/studio";

/**
 * ST-1: what the editor's fields and canvas draw with, handed down once.
 *
 * `StudioLookups` is the reference data the custom fields need (the media
 * library, the size specs, the ad slots, the forms, the pages a PAGE target
 * may name) with the "remember" doors a picker uses to keep a thing it just
 * chose. `CanvasState` is what the canvas draws each block with: the
 * resolved props by block id and the server's issues by block id.
 */
export interface StudioLookups {
    types: Map<string, BlockTypeDef>;
    surface: string | null;
    media: Map<string, MediaAsset>;
    rememberMedia: (asset: MediaAsset) => void;
    specs: MediaSpec[];
    slots: SlotRow[];
    forms: FormRow[] | null;
    pages: SitePageRow[];
    listingNames: Map<string, string>;
    rememberListing: (id: string, label: string) => void;
    cityNames: Map<string, string>;
    rememberCity: (id: string, name: string) => void;
    readOnly: boolean;
}

const LookupsContext = React.createContext<StudioLookups | null>(null);

export function StudioLookupsProvider({ value, children }: { value: StudioLookups; children: React.ReactNode }) {
    return <LookupsContext.Provider value={value}>{children}</LookupsContext.Provider>;
}

export function useStudioLookups(): StudioLookups {
    const value = React.useContext(LookupsContext);
    if (!value) throw new Error("useStudioLookups must be used inside StudioLookupsProvider");
    return value;
}

export interface CanvasState {
    canvas: Map<string, CanvasProps>;
    issues: Map<string, BlockIssue[]>;
    /** True once a resolution has answered — before that every block draws its raw props. */
    resolvedOnce: boolean;
    phone: boolean;
}

const CanvasContext = React.createContext<CanvasState>({ canvas: new Map(), issues: new Map(), resolvedOnce: false, phone: false });

export function CanvasStateProvider({ value, children }: { value: CanvasState; children: React.ReactNode }) {
    return <CanvasContext.Provider value={value}>{children}</CanvasContext.Provider>;
}

export const useCanvasState = (): CanvasState => React.useContext(CanvasContext);

/** A map that grows as pickers choose — `rememberX(id, value)` keeps a thing the initial read did not list. */
export function useRememberingMap<T>(initial: () => [string, T][]): [Map<string, T>, (id: string, value: T) => void] {
    const [map, setMap] = React.useState(() => new Map<string, T>(initial()));
    const remember = React.useCallback((id: string, value: T) => {
        setMap((current) => {
            if (current.get(id) === value) return current;
            const next = new Map(current);
            next.set(id, value);
            return next;
        });
    }, []);
    return [map, remember];
}
