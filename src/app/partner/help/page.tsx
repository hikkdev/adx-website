"use client";

import * as React from "react";
import Link from "next/link";
import { ChevronDown, ChevronUp } from "lucide-react";
import { PageHeading } from "@/components/workspace/page-heading";
import { btnPrimary } from "@/components/advertiser/bits";
import { HelpExtras } from "@/components/support/help-extras";
import { TicketList } from "@/components/support/ticket-list";
import { FLAG_PRINT_FLOOR, FLAG_PRINT_QUOTES, useSwitchedOffCheck } from "@/lib/flags";
import { usePartner } from "../layout";

/** Each topic's link names the feature its page belongs to, so a switched-off page is not pointed at. */
const TOPICS: { id: string; title: string; body: string; link: { label: string; href: string; flag: string } }[] = [
    { id: "jobs", title: "Print jobs", body: "Every job ADX sends you waits for your answer. Accept it, print to the brief and mark each stage done so the advertiser and the installer know where it stands.", link: { label: "Open jobs", href: "/partner/jobs", flag: FLAG_PRINT_FLOOR } },
    { id: "quotes", title: "Quote requests", body: "A quote request asks your price for a print before the job exists. Answer it with your rate and the days you need; ADX shares it with the advertiser.", link: { label: "Open quote requests", href: "/partner/quotes", flag: FLAG_PRINT_QUOTES } },
    { id: "money", title: "Earnings and invoices", body: "Each finished job is credited to your earnings. Your monthly invoice to ADX lists them; quote the invoice number in a request if something looks wrong.", link: { label: "Open earnings", href: "/partner/earnings", flag: FLAG_PRINT_FLOOR } },
    { id: "rates", title: "Rate card and verification", body: "Your rate card is what ADX quotes from, and verification is what lets ADX send you work. Keep both current.", link: { label: "Open rate card", href: "/partner/rate-card", flag: FLAG_PRINT_FLOOR } },
];

/**
 * Help & support for a print partner — the app's Support and help hub:
 * a new request, the tickets already raised, chat, feedback and a rating,
 * and the topics with the page each one points at.
 */
export default function PartnerHelpPage() {
    const partner = usePartner();
    const switchedOff = useSwitchedOffCheck();
    const [open, setOpen] = React.useState<string | null>(TOPICS[0]!.id);
    const name = (partner?.businessName as string | undefined) ?? partner?.name ?? null;

    return (
        <>
            <PageHeading title="Help & support" subtitle={`${name ? `${name} · ` : ""}Help with jobs, quotes and payouts`} />

            <section className="mt-6 rounded-lg border border-line bg-white p-6">
                <h2 className="text-base font-semibold text-ink">Requests</h2>
                <p className="mt-2 text-sm text-dim">Include the job, quote or invoice so support has the right context. Replies stay on each request.</p>
                <div className="mt-5 flex flex-wrap items-center gap-4">
                    <Link href="/partner/help/new" className={`${btnPrimary} px-9`}>
                        New request
                    </Link>
                </div>
                <TicketList party="PRINT_PARTNER" />
            </section>

            <HelpExtras party="PRINT_PARTNER" />

            <section className="mt-4 rounded-lg border border-line bg-white p-6">
                <h2 className="text-base font-semibold text-ink">Help topics</h2>
                <div className="mt-2 divide-y divide-line px-3">
                    {TOPICS.map((topic) => {
                        const expanded = open === topic.id;
                        return (
                            <div key={topic.id} className="py-3">
                                <button type="button" onClick={() => setOpen(expanded ? null : topic.id)} aria-expanded={expanded} className="flex w-full items-center justify-between gap-4 py-1 text-left">
                                    <span className="text-sm font-semibold text-ink">{topic.title}</span>
                                    {expanded ? <ChevronUp className="size-4 text-dim" aria-hidden /> : <ChevronDown className="size-4 text-dim" aria-hidden />}
                                </button>
                                {expanded && (
                                    <div className="pb-2 pt-2">
                                        <p className="text-sm text-dim">{topic.body}</p>
                                        {!switchedOff(topic.link.flag) && (
                                            <Link href={topic.link.href} className="mt-3 inline-block text-sm font-medium text-ink underline underline-offset-4 hover:text-brand">
                                                {topic.link.label}
                                            </Link>
                                        )}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </section>
        </>
    );
}
