"use client";

import * as React from "react";
import { PUBLISHER_ACCOUNT, PUBLISHER_NAV, WorkspaceShell } from "@/components/workspace/workspace-shell";
import { useAuth } from "@/lib/auth";
import { partyService, type PublisherMe } from "@/services/party";

const PublisherContext = React.createContext<PublisherMe | null>(null);

/** The publisher behind the session, for every page of the workspace. */
export function usePublisher(): PublisherMe | null {
    return React.useContext(PublisherContext);
}

export default function PublisherLayout({ children }: Readonly<{ children: React.ReactNode }>) {
    return <WorkspaceShellWithPublisher>{children}</WorkspaceShellWithPublisher>;
}

function WorkspaceShellWithPublisher({ children }: { children: React.ReactNode }) {
    const { status, parties } = useAuth();
    const [me, setMe] = React.useState<PublisherMe | null>(null);

    React.useEffect(() => {
        if (status !== "signed-in" || !parties.includes("PUBLISHER")) return;
        let cancelled = false;
        partyService
            .publisher()
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
        <PublisherContext.Provider value={me}>
            <WorkspaceShell party="PUBLISHER" accountName={me?.name ?? ""} accountLine="Publisher account" nav={PUBLISHER_NAV} account={PUBLISHER_ACCOUNT}>
                {children}
            </WorkspaceShell>
        </PublisherContext.Provider>
    );
}
