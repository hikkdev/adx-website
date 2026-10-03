"use client";

import * as React from "react";
import Link from "next/link";
import { messageOf } from "@/lib/api-client";
import { StatusChip } from "@/components/advertiser/bits";
import type { Party } from "@/services/party";
import { ticketHref } from "@/components/account/routes";
import { categoryLabel, dateTime, isLiveChat, orderTickets, statusLabel, supportService, ticketReference, type SupportTicket } from "@/services/support";

/** The person's tickets — issues, feedback (FB-…) and live chats — open first, then newest. */
export function TicketList({ party, limit }: { party: Party; limit?: number }) {
    const [tickets, setTickets] = React.useState<SupportTicket[] | null>(null);
    const [error, setError] = React.useState<string | null>(null);

    React.useEffect(() => {
        let cancelled = false;
        supportService
            .tickets()
            .then((rows) => {
                if (!cancelled) setTickets(orderTickets(rows));
            })
            .catch((caught: unknown) => {
                if (!cancelled) setError(messageOf(caught, "Could not read your tickets."));
            });
        return () => {
            cancelled = true;
        };
    }, []);

    if (error) return <p className="mt-4 text-sm text-danger">{error}</p>;
    if (!tickets) return <p className="mt-4 text-sm text-dim">Loading your tickets…</p>;
    if (tickets.length === 0) return <p className="mt-4 text-sm text-dim">No tickets yet. Anything you ask ADX stays here.</p>;

    const shown = limit ? tickets.slice(0, limit) : tickets;
    return (
        <ul className="mt-5 divide-y divide-line border-t border-line">
            {shown.map((ticket) => {
                const status = statusLabel(ticket.status);
                return (
                    <li key={ticket.id}>
                        <Link href={ticketHref(party, ticket.id)} className="flex items-center justify-between gap-4 py-3 hover:bg-ground">
                            <div className="min-w-0">
                                <p className="truncate text-sm font-medium text-ink">{ticket.title}</p>
                                <p className="text-xs text-dim">
                                    {ticketReference(ticket)} · {isLiveChat(ticket) ? "Live chat" : ticket.kind === "FEEDBACK" ? "Feedback" : categoryLabel(ticket.category)} · {dateTime(ticket.updatedAt)}
                                </p>
                            </div>
                            <StatusChip label={status.label} tone={status.tone} pill={false} className="shrink-0 text-xs" />
                        </Link>
                    </li>
                );
            })}
        </ul>
    );
}
