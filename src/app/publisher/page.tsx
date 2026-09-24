"use client";

import * as React from "react";
import Link from "next/link";
import { PageHeading, Panel } from "@/components/workspace/page-heading";
import { usePublisher } from "./layout";
import { publisherService, type PublisherListing } from "@/services/publisher";

/**
 * DR 12 · 03 · 05 · Publisher · Workspace setup (5204:62068): the checklist
 * a new publisher lands on. Each step reads its state off the backend —
 * business verification off the publisher's KYC, the first listing off the
 * inventory — so a step already done says so. Board 10's Overview takes
 * this route over once the workspace is set up.
 */
export default function PublisherHome() {
    const me = usePublisher();
    const [listings, setListings] = React.useState<PublisherListing[] | null>(null);

    React.useEffect(() => {
        let cancelled = false;
        publisherService
            .listings()
            .then((rows) => {
                if (!cancelled) setListings(rows);
            })
            .catch(() => {
                if (!cancelled) setListings([]);
            });
        return () => {
            cancelled = true;
        };
    }, []);

    const verified = me?.kycStatus === "VERIFIED";
    const kycStarted = !!me && me.kycStatus !== "NOT_STARTED" && me.kycStatus !== "PENDING_UPLOAD";
    const hasListing = (listings?.length ?? 0) > 0;

    return (
        <>
            <PageHeading title="Set up your publisher workspace" subtitle="Complete your business details, add an ad space, and prepare to receive bookings." />
            <Panel className="mt-6">
                <h2 className="text-base font-semibold text-ink">Your setup checklist</h2>
                <p className="mt-2 text-sm text-dim">You can prepare a listing while your business information is reviewed.</p>
                <ol className="mt-6 space-y-4">
                    <Step
                        n={1}
                        title="Add and verify your business"
                        text="Provide business and contact details, then submit supporting information."
                        done={verified}
                        note={verified ? "Verified" : kycStarted ? "In review" : undefined}
                        action={{ label: verified ? "View business profile" : kycStarted ? "See verification status" : "Start business setup", href: "/publisher/profile" }}
                    />
                    <Step
                        n={2}
                        title="Create your first listing"
                        text="Add a space, set your price and availability, and submit it for review."
                        done={hasListing}
                        note={hasListing ? `${listings!.length} listing${listings!.length === 1 ? "" : "s"}` : undefined}
                        action={{ label: hasListing ? "Open my inventory" : "Add an ad space", href: hasListing ? "/publisher/inventory" : "/publisher/listings/new" }}
                    />
                    <Step n={3} title="Set up your payout account" text="Add the bank account where you want to receive your earnings." done={false} action={{ label: "Add bank details", href: "/publisher/bank" }} />
                </ol>
            </Panel>
            <Link href="/publisher/help" className="mt-6 inline-flex h-12 items-center rounded-md border border-line bg-white px-6 text-sm font-semibold text-ink hover:border-ink">
                Contact publisher support
            </Link>
        </>
    );
}

function Step({ n, title, text, done, note, action }: { n: number; title: string; text: string; done: boolean; note?: string; action: { label: string; href: string } }) {
    return (
        <li className="flex flex-wrap items-center justify-between gap-4 rounded-lg bg-ground p-6">
            <div>
                <p className="text-base font-semibold text-ink">
                    {n}. {title}
                    {note && <span className={`ml-3 rounded-md px-2 py-0.5 text-xs font-semibold ${done ? "bg-success-soft text-success" : "bg-warning-soft text-warning"}`}>{note}</span>}
                </p>
                <p className="mt-1.5 text-sm text-dim">{text}</p>
            </div>
            <Link href={action.href} className={`inline-flex h-12 items-center rounded-md px-6 text-sm font-semibold ${done ? "border border-line bg-white text-ink hover:border-ink" : "border border-line bg-white text-ink hover:border-ink"}`}>
                {action.label}
            </Link>
        </li>
    );
}
