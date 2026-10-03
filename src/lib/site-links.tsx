"use client";

import * as React from "react";
import { currentSiteRoutes, pageHref, rememberSiteRoutes, type SiteRoutesTable } from "./site-routes";

export { pageHref } from "./site-routes";

/**
 * PB-1 (27 Sep 2026): the address table in the browser. The root layout
 * reads it on the server (cached a minute) and hands it in, so no client
 * component ever fetches it; `usePageHref` then turns a page key into its
 * current address — the header, the footer, the category strip and every
 * link to a system page go through it, and a page ADX has moved is linked
 * at its new address on the next render. With no table (ADX did not
 * answer) the seeded addresses stand.
 */
const SiteRoutesContext = React.createContext<SiteRoutesTable | null>(null);

export function SiteRoutesProvider({ table, children }: { table: SiteRoutesTable | null; children: React.ReactNode }) {
    /* The pure `pageHref` (used outside React — a target's href, say) reads the same table. */
    rememberSiteRoutes(table);
    return <SiteRoutesContext.Provider value={table}>{children}</SiteRoutesContext.Provider>;
}

/** The table, or the seeded one. */
export function useSiteRoutes(): SiteRoutesTable {
    return React.useContext(SiteRoutesContext) ?? currentSiteRoutes();
}

/** `href(key, params?, { hash, search })` — a page's current address. */
export function usePageHref(): (key: string, params?: Record<string, string>, options?: { hash?: string; search?: string }) => string {
    const table = useSiteRoutes();
    return React.useCallback((key: string, params: Record<string, string> = {}, options: { hash?: string; search?: string } = {}) => pageHref(key, params, { ...options, table }), [table]);
}
