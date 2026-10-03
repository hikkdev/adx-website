"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { PARTNER_ACCOUNT, PARTNER_NAV, WorkspaceShell } from "@/components/workspace/workspace-shell";
import { onPrintFloor, PartnerAccountProvider, usePartnerAccount } from "@/components/partner/partner-context";
import { FeatureOff } from "@/components/platform/feature-off";
import { SiteHeader } from "@/components/site/site-header";
import { FLAG_PRINT_FLOOR, useSwitchedOff } from "@/lib/flags";

/**
 * PP-W: the print partner's workspace — the same shell as the other two
 * sides. `/partner/apply` is the application a signed-in person fills in
 * before they are a partner, so it draws without the shell's side check.
 *
 * The partner row is read once here (`GET /print-partners/me`) and shared:
 * `usePartner()` for any page that only needs the name and the standing,
 * `usePartnerAccount()` (components/partner/partner-context) for the typed
 * row with `reload` and `replace`.
 *
 * The floor itself — the home, the application, jobs, earnings, invoices
 * and the rate card — is `partners.print-floor`: while the platform has it
 * switched off nothing reads `/print-partners/me`, the floor's pages say
 * so, their nav items hide (workspace-shell), and the pages other features
 * own (quote requests, verification, agreements, help, notifications) draw
 * as usual. The shop profile — the partner's one settings page — draws too,
 * with its shop cards saying the floor is off.
 */
export interface PartnerMe {
    id: string;
    displayId?: string | null;
    name?: string | null;
    businessName?: string | null;
    status?: string | null;
    kycStatus?: string | null;
    [key: string]: unknown;
}

/** The print partner behind the session, for every page of the workspace. */
export function usePartner(): PartnerMe | null {
    const { partner } = usePartnerAccount();
    return partner as unknown as PartnerMe | null;
}

export default function PartnerLayout({ children }: Readonly<{ children: React.ReactNode }>) {
    const pathname = usePathname();
    const floorOff = useSwitchedOff(FLAG_PRINT_FLOOR);
    if (pathname === "/partner/apply" || pathname.startsWith("/partner/apply/")) {
        if (!floorOff) return <>{children}</>;
        return (
            <div className="flex min-h-screen flex-col bg-ground">
                <SiteHeader />
                <main className="mx-auto w-full max-w-[760px] flex-1 px-4 pb-16 pt-12">
                    <FeatureOff flag={FLAG_PRINT_FLOOR} name="Applying as a print partner">
                        ADX is not taking print partner applications on the web right now — come back later.
                    </FeatureOff>
                </main>
            </div>
        );
    }
    return (
        <PartnerAccountProvider enabled={!floorOff}>
            <PartnerShell>{floorOff && onPrintFloor(pathname) ? <FeatureOff flag={FLAG_PRINT_FLOOR} /> : children}</PartnerShell>
        </PartnerAccountProvider>
    );
}

function PartnerShell({ children }: { children: React.ReactNode }) {
    const { partner } = usePartnerAccount();
    const line = !partner ? "Print partner" : partner.activatedAt ? "Print partner" : "Print partner · application";
    return (
        <WorkspaceShell party="PRINT_PARTNER" accountName={partner?.name ?? ""} accountLine={line} nav={PARTNER_NAV} account={PARTNER_ACCOUNT}>
            {children}
        </WorkspaceShell>
    );
}
