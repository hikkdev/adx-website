"use client";

import * as React from "react";
import Link from "next/link";
import { ChevronDown, ChevronUp } from "lucide-react";
import { PageHeading } from "@/components/workspace/page-heading";
import { useAdvertiser } from "@/app/advertiser/layout";
import { btnPrimary } from "@/components/advertiser/bits";

interface Topic {
    id: string;
    title: string;
    body: string;
    link: { label: string; href: string };
}

/** The four help topics as the frame writes them, each opening on the page that answers it. */
const TOPICS: Topic[] = [
    {
        id: "artwork",
        title: "Artwork and approval",
        body: "Check the file requirements and review status in your campaign. Payment reserves spaces; it does not approve the artwork.",
        link: { label: "Choose a campaign", href: "/advertiser" },
    },
    {
        id: "payments",
        title: "Payments and invoices",
        body: "Every payment gets a tax invoice with the GST shown separately. Download the PDF from Billing & payments, and quote the invoice number in a request if something looks wrong.",
        link: { label: "Open Billing & payments", href: "/advertiser/billing" },
    },
    {
        id: "proofs",
        title: "Delivery proofs",
        body: "When a publisher or an ADX agent installs your artwork, the photographs and the site check-in land under Delivery proofs. Nothing is due before the campaign starts.",
        link: { label: "Open Delivery proofs", href: "/advertiser/proofs" },
    },
    {
        id: "changes",
        title: "Changes and cancellations",
        body: "Dates, placements and artwork can change until the publisher has started work. Send a request and ADX reviews the booking terms with the publisher; any refund follows the same terms.",
        link: { label: "Request a change", href: "/advertiser/requests/new?topic=CHANGE" },
    },
];

/**
 * DR 12 · 07 · 13 · Help & support (5204:75203): the request door and the
 * four help topics as an accordion, the first one open.
 */
export default function HelpPage() {
    const advertiser = useAdvertiser();
    const [open, setOpen] = React.useState<string | null>(TOPICS[0]!.id);

    return (
        <>
            <PageHeading title="Help & support" subtitle={`${advertiser?.name ? `${advertiser.name} · ` : ""}Help with campaigns, delivery and payments`} />

            <section className="mt-6 rounded-lg border border-line bg-white p-6">
                <h2 className="text-base font-semibold text-ink">Requests</h2>
                <p className="mt-2 text-sm text-dim">Your conversations with ADX stay in My requests.</p>
                <div className="mt-5 flex flex-wrap items-center gap-4">
                    <Link href="/advertiser/requests/new" className={`${btnPrimary} px-9`}>
                        New request
                    </Link>
                    <Link href="/advertiser/requests" className="text-sm font-medium text-ink underline underline-offset-4 hover:text-brand">
                        My requests
                    </Link>
                </div>
            </section>

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
                                        <Link href={topic.link.href} className="mt-3 inline-block text-sm font-medium text-ink underline underline-offset-4 hover:text-brand">
                                            {topic.link.label}
                                        </Link>
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
