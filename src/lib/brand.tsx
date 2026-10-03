"use client";

import * as React from "react";
import { SITE_BRAND, type SiteBrand } from "@/services/branding";

/**
 * The brand the root layout read on the server (`services/branding.ts`),
 * handed to the client chrome — the headers' wordmark, the auth card's, the
 * QR landing's mark. Outside the provider it is the site's own DR 12 brand.
 */
const BrandContext = React.createContext<SiteBrand>(SITE_BRAND);

export function BrandProvider({ brand, children }: { brand: SiteBrand; children: React.ReactNode }) {
    return <BrandContext.Provider value={brand}>{children}</BrandContext.Provider>;
}

export function useSiteBrand(): SiteBrand {
    return React.useContext(BrandContext);
}

/** The wordmark as the brand has it — for chrome that is otherwise a server component. */
export function BrandWordmark({ className, inverse = false }: { className?: string; inverse?: boolean }) {
    const brand = useSiteBrand();
    return <img src={inverse ? brand.wordmarkInverseUrl : brand.wordmarkUrl} alt={brand.platformName} className={className} />;
}
