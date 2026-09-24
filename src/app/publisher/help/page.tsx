"use client";

import * as React from "react";
import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { Panel } from "@/components/workspace/page-heading";
import { brandButton, CardTitle, ErrorNote, Loading, StatusText } from "@/components/publisher/parts";
import { useLoad } from "@/components/publisher/use-load";
import { cn } from "@/lib/utils";
import { usePublisher } from "../layout";
import { publisherWorkspace, relativeTime, ticketStatus } from "@/services/publisher-workspace";

const TOPICS: { title: string; text: string; link: { label: string; href: string } }[] = [
    { title: "Listings and review", text: "Open a listing from My inventory to check its review status, update details or review requested changes.", link: { label: "Open my inventory", href: "/publisher/inventory" } },
    { title: "Bookings and artwork", text: "Every request waits for your answer for 30 minutes before ADX steps in. Once accepted, choose who installs and follow the artwork review and installation proof from the booking.", link: { label: "View bookings", href: "/publisher/bookings" } },
    { title: "Availability and dates", text: "Bookings and holds appear on the calendar by space. Use Manage dates to block a space for dates it cannot be booked, so advertisers never request them.", link: { label: "Open availability", href: "/publisher/availability" } },
    { title: "Payouts and bank details", text: "Each campaign day is credited the next morning and clears seven days later. Withdraw cleared earnings to your verified bank account; ADX reviews every payout before release.", link: { label: "Manage bank account", href: "/publisher/earnings/bank" } },
];

/**
 * DR 12 · 10 · 18 · Help & support (5204:90937): a new request (which
 * opens Report an issue), the requests already raised, and the four help
 * topics with the page each one points at.
 */
export default function HelpPage() {
    const me = usePublisher();
    const { data, error, loading, reload } = useLoad("tickets", () => publisherWorkspace.tickets());
    const [open, setOpen] = React.useState(0);
    const tickets = [...(data ?? [])].sort((a, b) => (a.status === "CLOSED" ? 1 : 0) - (b.status === "CLOSED" ? 1 : 0) || b.updatedAt.localeCompare(a.updatedAt));

    return (
        <>
            <h1 className="text-2xl font-semibold tracking-tight text-ink">Help &amp; support</h1>
            <p className="mt-1 text-sm text-dim">{me?.name ?? "Your account"} · Help with listings, bookings and payouts</p>

            <Panel className="mt-6">
                <CardTitle>Requests</CardTitle>
                <p className="mt-2 text-sm text-dim">Include the relevant booking, listing or payout so support has the right context.</p>
                <div className="mt-4 flex flex-wrap items-center gap-4">
                    <Link href="/publisher/help/new" className={brandButton}>
                        New request
                    </Link>
                    <Link href="/publisher/bookings" className="text-sm font-medium text-ink underline underline-offset-4">
                        View bookings
                    </Link>
                </div>
                {!data && loading && <Loading label="Loading your requests…" />}
                {error && (
                    <div className="mt-4">
                        <ErrorNote message={error} onRetry={reload} />
                    </div>
                )}
                {data && tickets.length > 0 && (
                    <ul className="mt-5 divide-y divide-line border-t border-line">
                        {tickets.slice(0, 8).map((ticket) => {
                            const status = ticketStatus(ticket.status);
                            return (
                                <li key={ticket.id}>
                                    <Link href={`/publisher/help/${ticket.id}`} className="flex items-center justify-between gap-4 py-3 hover:bg-ground">
                                        <div className="min-w-0">
                                            <p className="truncate text-sm font-medium text-ink">{ticket.title}</p>
                                            <p className="text-xs text-dim">
                                                {ticket.displayId ?? `#${ticket.id.slice(-4).toUpperCase()}`} · {relativeTime(ticket.updatedAt)}
                                            </p>
                                        </div>
                                        <StatusText tone={status.tone} className="shrink-0 text-xs">
                                            {status.label}
                                        </StatusText>
                                    </Link>
                                </li>
                            );
                        })}
                    </ul>
                )}
            </Panel>

            <Panel className="mt-6">
                <CardTitle>Help topics</CardTitle>
                <div className="mt-2 divide-y divide-line px-3">
                    {TOPICS.map((topic, index) => {
                        const expanded = open === index;
                        return (
                            <div key={topic.title} className="py-4">
                                <button type="button" aria-expanded={expanded} onClick={() => setOpen(expanded ? -1 : index)} className="flex w-full items-center justify-between gap-4 text-left">
                                    <span className="text-sm font-semibold text-ink">{topic.title}</span>
                                    <ChevronDown className={cn("size-4 shrink-0 text-dim transition-transform", expanded && "rotate-180")} aria-hidden />
                                </button>
                                {expanded && (
                                    <div className="mt-3">
                                        <p className="text-sm text-dim">{topic.text}</p>
                                        <Link href={topic.link.href} className="mt-3 inline-block text-sm font-medium text-ink underline underline-offset-4">
                                            {topic.link.label}
                                        </Link>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </Panel>
        </>
    );
}
