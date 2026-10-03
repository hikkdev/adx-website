"use client";

import * as React from "react";
import { useAuth } from "@/lib/auth";
import { partnerMessage, partnerService, type PartnerProfile } from "@/services/partner";

/**
 * The print partner behind the session, read once for the whole workspace
 * (`GET /print-partners/me`) and handed to every page: the shell's name, the
 * applicant check, the home's banners. A page that changes the row (the
 * profile, the rate card) hands the server's answer back with `replace`, so
 * the shell and the next page agree with it without a second read.
 */
export interface PartnerAccount {
    partner: PartnerProfile | null;
    /** The first read has answered (or failed). */
    loaded: boolean;
    error: string | null;
    reload: () => void;
    replace: (next: PartnerProfile) => void;
}

const PartnerAccountContext = React.createContext<PartnerAccount>({ partner: null, loaded: false, error: null, reload: () => undefined, replace: () => undefined });

export function usePartnerAccount(): PartnerAccount {
    return React.useContext(PartnerAccountContext);
}

/**
 * The print partner's own pages — the home, the application, jobs, earnings,
 * invoices and the rate card — behind `partners.print-floor`
 * (`/print-partners/me…`). The rest of `/partner` belongs to other features:
 * quote requests, verification, agreements, help, notifications, settings.
 * The shop profile is the partner's one settings page since 29 Sep 2026, so
 * it draws with the floor off too; only its shop cards say the floor is off.
 */
const PRINT_FLOOR_PAGES = ["/partner/apply", "/partner/earnings", "/partner/invoices", "/partner/jobs", "/partner/rate-card"];

/** Whether this path draws the print floor itself, so the floor's kill switch takes it down. */
export function onPrintFloor(pathname: string): boolean {
    return pathname === "/partner" || PRINT_FLOOR_PAGES.some((page) => pathname === page || pathname.startsWith(`${page}/`));
}

/** `enabled: false` — the floor is switched off — reads nothing: `GET /print-partners/me` would only answer 503. */
export function PartnerAccountProvider({ children, enabled = true }: { children: React.ReactNode; enabled?: boolean }) {
    const { status, parties } = useAuth();
    const isPartner = enabled && status === "signed-in" && parties.includes("PRINT_PARTNER");
    const [state, setState] = React.useState<{ partner: PartnerProfile | null; loaded: boolean; error: string | null }>({ partner: null, loaded: false, error: null });
    const [tick, setTick] = React.useState(0);

    React.useEffect(() => {
        if (!isPartner) return;
        let cancelled = false;
        partnerService
            .me()
            .then((partner) => {
                if (!cancelled) setState({ partner, loaded: true, error: null });
            })
            .catch((caught: unknown) => {
                if (!cancelled) setState((current) => ({ ...current, loaded: true, error: partnerMessage(caught, "Could not read your shop's details.") }));
            });
        return () => {
            cancelled = true;
        };
    }, [isPartner, tick]);

    const reload = React.useCallback(() => setTick((n) => n + 1), []);
    /*
     * A write's answer is the bare row: no wallet, no agreement, and the KYC
     * summary null because the write did not look it up. What it leaves out
     * (or leaves null for that reason) is kept from the last read.
     */
    const replace = React.useCallback(
        (next: PartnerProfile) =>
            setState((current) => ({
                partner: current.partner ? { ...current.partner, ...next, kyc: next.kyc ?? current.partner.kyc, balances: next.balances ?? current.partner.balances, agreement: next.agreement ?? current.partner.agreement } : next,
                loaded: true,
                error: null,
            })),
        []
    );

    // Switched off, there is no row to wait for: the pages that do not need it draw, the floor's own pages say it is off.
    const value = React.useMemo<PartnerAccount>(() => ({ ...(enabled ? state : { partner: null, loaded: true, error: null }), reload, replace }), [enabled, state, reload, replace]);
    return <PartnerAccountContext.Provider value={value}>{children}</PartnerAccountContext.Provider>;
}
