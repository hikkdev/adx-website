"use client";

import * as React from "react";
import Link from "next/link";
import { PageHeading } from "@/components/workspace/page-heading";
import { btnPrimary, Cell, ErrorPanel, LoadingLine, StatusChip, TablePanel, Td, Th, useAsync } from "@/components/advertiser/bits";
import { advertiserWorkspace, requestsSummary, shortDate, ticketCampaignId, ticketReference, ticketStatusLabel, ticketTopic, type CampaignRow, type SupportTicket } from "@/services/advertiser-workspace";

/**
 * DR 12 · 07 · 10 · My requests (5204:74323): the advertiser's support
 * tickets — `GET /support/tickets` — each with the campaign it was raised
 * about (a `campaign:<id>` tag the New request page writes).
 */
export default function RequestsPage() {
    const state = useAsync(
        "requests",
        async () => {
            const [tickets, campaigns] = await Promise.all([advertiserWorkspace.tickets(), advertiserWorkspace.campaigns({ pageSize: 100 }).catch(() => ({ items: [] as CampaignRow[] }))]);
            return { tickets, campaigns: campaigns.items };
        },
        "Could not read your requests."
    );

    const heading = (
        <PageHeading
            title="My requests"
            actions={
                <Link href="/advertiser/requests/new" className={btnPrimary}>
                    New request
                </Link>
            }
        />
    );

    if (state.kind === "loading") {
        return (
            <>
                {heading}
                <div className="mt-6">
                    <LoadingLine>Loading your requests…</LoadingLine>
                </div>
            </>
        );
    }
    if (state.kind === "error") {
        return (
            <>
                {heading}
                <ErrorPanel title="Could not read your requests" message={state.message} />
            </>
        );
    }

    const { tickets, campaigns } = state.value;
    const campaignById = new Map(campaigns.map((c) => [c.id, c] as const));

    return (
        <>
            {heading}
            <h2 className="mt-8 text-base font-semibold text-ink">All requests</h2>
            <p className="mt-1 text-xs text-dim">{requestsSummary(tickets)}</p>

            <TablePanel className="mt-4">
                <thead>
                    <tr>
                        <Th>Request</Th>
                        <Th>Campaign</Th>
                        <Th>Updated</Th>
                        <Th>Status</Th>
                        <Th />
                    </tr>
                </thead>
                <tbody>
                    {tickets.map((ticket) => (
                        <RequestLine key={ticket.id} ticket={ticket} campaign={campaignById.get(ticketCampaignId(ticket) ?? "")} />
                    ))}
                    {tickets.length === 0 && (
                        <tr className="border-t border-line">
                            <td colSpan={5} className="px-5 py-10 text-center text-sm text-dim">
                                No requests yet. Anything you ask ADX about a campaign, a delivery or an invoice stays here.
                            </td>
                        </tr>
                    )}
                </tbody>
            </TablePanel>
        </>
    );
}

function RequestLine({ ticket, campaign }: { ticket: SupportTicket; campaign?: CampaignRow }) {
    const status = ticketStatusLabel(ticket.status);
    const topic = ticketTopic(ticket);
    const hint = ticket.status === "CLOSED" ? "Resolved by ADX Support" : ticket.status === "WAITING" ? "ADX Support is waiting for your reply" : topic ? topic.label : "With ADX Support";
    return (
        <tr className="border-t border-line">
            <Td>
                <Cell
                    title={
                        <Link href={`/advertiser/requests/${ticket.id}`} className="font-medium text-ink hover:text-brand">
                            {ticket.title}
                        </Link>
                    }
                    line={`${ticketReference(ticket)} · ${hint}`}
                />
            </Td>
            <Td className="text-ink">
                {campaign ? (
                    <Link href={`/advertiser/campaigns/${campaign.id}`} className="hover:text-brand">
                        {campaign.name}
                    </Link>
                ) : (
                    <span className="text-dim">—</span>
                )}
            </Td>
            <Td className="text-ink">{shortDate(ticket.updatedAt)}</Td>
            <Td>
                <StatusChip label={status.label} tone={status.tone} pill={false} />
            </Td>
            <Td align="right">
                <Link href={campaign && ticket.status === "CLOSED" ? `/advertiser/campaigns/${campaign.id}` : `/advertiser/requests/${ticket.id}`} className="whitespace-nowrap text-sm font-semibold text-ink hover:text-brand">
                    {campaign && ticket.status === "CLOSED" ? "View campaign" : "View request"}
                </Link>
            </Td>
        </tr>
    );
}
