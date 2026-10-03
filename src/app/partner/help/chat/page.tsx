"use client";

import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { LoadingLine } from "@/components/advertiser/bits";
import { reportHref } from "@/components/account/routes";
import { FeatureGate, FeatureOff } from "@/components/platform/feature-off";
import { SupportSubpage } from "@/components/support/support-subpage";
import { LiveChat } from "@/components/support/live-chat";
import { FLAG_LIVE_CHAT } from "@/lib/flags";

/**
 * Live chat with ADX Support. `?ticket=` continues a chat already open.
 * While live chat is switched off (`support.live-chat`) the chat is not
 * mounted — it would only call the routes the switch guards — and the
 * request form is offered in its place.
 */
export default function LiveChatPage() {
    return (
        <React.Suspense fallback={<LoadingLine>Loading…</LoadingLine>}>
            <Chat />
        </React.Suspense>
    );
}

function Chat() {
    const params = useSearchParams();
    const ticket = params.get("ticket");
    return (
        <SupportSubpage party="PRINT_PARTNER" title="Chat with us">
            <FeatureGate
                flag={FLAG_LIVE_CHAT}
                off={
                    <FeatureOff flag={FLAG_LIVE_CHAT}>
                        Send a request instead — ADX Support replies on its thread.{" "}
                        <Link href={reportHref("PRINT_PARTNER")} className="font-medium text-ink underline underline-offset-4 hover:text-brand">
                            Send a request
                        </Link>
                    </FeatureOff>
                }
            >
                <LiveChat key={ticket ?? "new"} party="PRINT_PARTNER" ticketId={ticket} />
            </FeatureGate>
        </SupportSubpage>
    );
}
