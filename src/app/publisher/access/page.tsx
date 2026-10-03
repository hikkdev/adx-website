"use client";

import * as React from "react";
import { PageHeading } from "@/components/workspace/page-heading";
import { SettingsCard } from "@/components/account/parts";
import { MyQrPanel } from "@/components/access/my-qr";
import { AccessLogPanel } from "@/components/access/access-log";
import { AccessGrantsPanel } from "@/components/access/access-grants";
import { LoadingLine } from "@/components/advertiser/bits";
import { usePublisher } from "../layout";

/**
 * Agent access — the publisher's QR code (QR-27), the ticket-bound access
 * grants, and the record of who has had access (U9), as the ADX app keeps
 * them under the publisher's home. Nothing an agent does to the account
 * happens without the publisher's click on this page or in the app.
 */
export default function AgentAccessPage() {
    const publisher = usePublisher();
    const [logKey, setLogKey] = React.useState(0);

    return (
        <>
            <PageHeading title="Agent access" subtitle={`${publisher?.name ? `${publisher.name} · ` : ""}Let an ADX agent help, on your say-so`} />
            <div className="mt-6 grid max-w-[920px] gap-4">
                <SettingsCard id="my-code" title="My QR code" line="Show it to an ADX agent, print it on a window, or share the link">
                    <MyQrPanel party="PUBLISHER" onDecided={() => setLogKey((n) => n + 1)} />
                </SettingsCard>
                <SettingsCard id="grants" title="Get help from an ADX agent" line="Tell ADX what you need. Once they put someone on it, you can let that person in.">
                    {publisher?.id ? <AccessGrantsPanel publisherId={publisher.id} /> : <LoadingLine>Loading your publisher account…</LoadingLine>}
                </SettingsCard>
                <SettingsCard id="log" title="Who has had access">
                    <AccessLogPanel party="PUBLISHER" refreshKey={logKey} />
                </SettingsCard>
            </div>
        </>
    );
}
