"use client";

import * as React from "react";
import Link from "next/link";
import { Gavel, Lightbulb, MessageCircle, Star } from "lucide-react";
import { FLAG_LIVE_CHAT, FLAG_PUBLISHER_PLANS, useSwitchedOff } from "@/lib/flags";
import { cn } from "@/lib/utils";
import type { Party } from "@/services/party";
import { disputesHref, helpHref, reportHref } from "@/components/account/routes";
import { presenceLine, showsUpsell, supportService, upsellHref, upsellLine, type LiveStatus } from "@/services/support";

/**
 * The rest of the app's Support and help hub, for each side's help page:
 * Chat with us (live chat for a paid plan, with the desk's presence; the
 * request form for everyone else, and — for somebody who could pay — where
 * live chat lives), Suggest a feature, Rate your experience, and Disputes.
 * The status read is never fatal: unread, the card simply offers the chat.
 * With live chat switched off (`support.live-chat`) the card never offers the
 * chat and asks nothing of the desk: the request form is the door.
 */
export function HelpExtras({ party }: { party: Party }) {
    const [status, setStatus] = React.useState<LiveStatus | null>(null);
    const [read, setRead] = React.useState(false);
    const chatOff = useSwitchedOff(FLAG_LIVE_CHAT);
    /* A publisher's upsell is the plans page, which has its own switch: while it is off the plans are not offered. */
    const plansOff = useSwitchedOff(FLAG_PUBLISHER_PLANS) && party === "PUBLISHER";

    React.useEffect(() => {
        /* Live chat switched off: there is no desk to ask after. */
        if (chatOff) return;
        let alive = true;
        supportService
            .liveStatus()
            .then((next) => alive && setStatus(next))
            .catch(() => undefined)
            .finally(() => alive && setRead(true));
        return () => {
            alive = false;
        };
    }, [chatOff]);

    const base = helpHref(party);
    const entitled = status?.entitled === true;
    const upsell = status && showsUpsell(status) && !plansOff ? { line: upsellLine(status), href: upsellHref(party) } : null;
    const disputes = disputesHref(party);

    return (
        <section className="mt-4 rounded-lg border border-line bg-white p-6">
            <h2 className="text-base font-semibold text-ink">More ways to reach ADX</h2>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
                {/* Live chat's kill switch: the tile never links to the chat while it is off — the request form stands in. */}
                {chatOff ? (
                    <Tile icon={MessageCircle} title="Chat with us" body="Live chat is switched off for now. Send a request and ADX Support replies on its thread." href={reportHref(party)} action="Send a request" />
                ) : (
                    <Tile
                        icon={MessageCircle}
                        title="Chat with us"
                        body={!read ? "Checking the desk…" : entitled ? presenceLine(status) : upsell ? `${upsell.line}. Until then, send a request and ADX replies on its thread.` : "Send a request and ADX Support replies on its thread."}
                        href={entitled || !read || !status ? `${base}/chat` : reportHref(party)}
                        action={entitled ? "Open live chat" : "Send a request"}
                        dot={entitled ? (status?.online ? "on" : "off") : null}
                        extra={upsell?.href ? { label: "See plans", href: upsell.href } : null}
                    />
                )}
                <Tile icon={Lightbulb} title="Suggest a feature" body="An idea, a problem, or something wrong in what ADX shows. It gets an FB- number and stays in your tickets." href={`${base}/feedback`} action="Send feedback" />
                <Tile icon={Star} title="Rate your experience" body="How was your week with ADX? Five stars and what stood out — the part ADX reads." href={`${base}/rate`} action="Rate ADX" />
                {disputes && <Tile icon={Gavel} title="Disputes" body="A case about an order — a rejected proof, damage, the wrong location, a payout — reviewed by ADX with both sides." href={disputes} action="Open disputes" />}
            </div>
        </section>
    );
}

function Tile({
    icon: Icon,
    title,
    body,
    href,
    action,
    dot,
    extra,
}: {
    icon: typeof MessageCircle;
    title: string;
    body: string;
    href: string;
    action: string;
    dot?: "on" | "off" | null;
    extra?: { label: string; href: string } | null;
}) {
    return (
        <div className="flex gap-3 rounded-md border border-line p-4">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-brand-soft text-brand-bright">
                <Icon className="size-4" aria-hidden />
            </span>
            <div className="min-w-0">
                <p className="flex items-center gap-2 text-sm font-semibold text-ink">
                    {title}
                    {dot && <span className={cn("size-2 rounded-full", dot === "on" ? "bg-success" : "bg-line")} aria-label={dot === "on" ? "Online" : "Offline"} />}
                </p>
                <p className="mt-0.5 text-xs text-dim">{body}</p>
                <div className="mt-2 flex flex-wrap gap-4">
                    <Link href={href} className="text-sm font-medium text-ink underline underline-offset-4 hover:text-brand">
                        {action}
                    </Link>
                    {extra && (
                        <Link href={extra.href} className="text-sm font-medium text-dim underline underline-offset-4 hover:text-brand">
                            {extra.label}
                        </Link>
                    )}
                </div>
            </div>
        </div>
    );
}
