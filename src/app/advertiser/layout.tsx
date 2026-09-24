"use client";

import * as React from "react";
import { ADVERTISER_ACCOUNT, ADVERTISER_NAV, WorkspaceShell } from "@/components/workspace/workspace-shell";
import { useAuth } from "@/lib/auth";
import { partyService, type AdvertiserMe } from "@/services/party";

const AdvertiserContext = React.createContext<AdvertiserMe | null>(null);

/** The advertiser behind the session, for every page of the workspace. */
export function useAdvertiser(): AdvertiserMe | null {
    return React.useContext(AdvertiserContext);
}

export default function AdvertiserLayout({ children }: Readonly<{ children: React.ReactNode }>) {
    return (
        <WorkspaceShellWithAdvertiser>{children}</WorkspaceShellWithAdvertiser>
    );
}

function WorkspaceShellWithAdvertiser({ children }: { children: React.ReactNode }) {
    const { status, parties } = useAuth();
    const [me, setMe] = React.useState<AdvertiserMe | null>(null);

    React.useEffect(() => {
        if (status !== "signed-in" || !parties.includes("ADVERTISER")) return;
        let cancelled = false;
        partyService
            .advertiser()
            .then((row) => {
                if (!cancelled) setMe(row);
            })
            .catch(() => {
                /* The shell still draws; the pages say what they could not read. */
            });
        return () => {
            cancelled = true;
        };
    }, [status, parties]);

    return (
        <AdvertiserContext.Provider value={me}>
            <WorkspaceShell party="ADVERTISER" accountName={me?.name ?? ""} accountLine="Advertiser account" nav={ADVERTISER_NAV} account={ADVERTISER_ACCOUNT}>
                {children}
            </WorkspaceShell>
        </AdvertiserContext.Provider>
    );
}
