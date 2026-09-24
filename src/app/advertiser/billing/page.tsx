"use client";

import * as React from "react";
import Link from "next/link";
import { PageHeading } from "@/components/workspace/page-heading";
import { useAdvertiser } from "@/app/advertiser/layout";
import { btnOutline, Cell, ErrorPanel, LoadingLine, StatusChip, TablePanel, Td, Th, useAsync } from "@/components/advertiser/bits";
import { advertiserWorkspace, gstLabel, invoiceStatusLabel, invoicesSummary, rupees, shortDate, type CampaignRow, type Invoice } from "@/services/advertiser-workspace";

/**
 * DR 12 · 07 · 06 · Billing & payments (5204:73520): every document ADX
 * issued to this account — `GET /advertisers/:id/invoices` — with the
 * campaign it bills, and the request door under it.
 */
export default function BillingPage() {
    const advertiser = useAdvertiser();
    const advertiserId = advertiser?.id ?? null;
    const state = useAsync(
        `billing:${advertiserId ?? ""}`,
        async () => {
            if (!advertiserId) return null;
            const [invoices, campaigns] = await Promise.all([advertiserWorkspace.invoices(advertiserId), advertiserWorkspace.campaigns({ pageSize: 100 }).catch(() => ({ items: [] as CampaignRow[] }))]);
            return { invoices, campaigns: campaigns.items };
        },
        "Could not read your invoices."
    );

    const heading = (
        <PageHeading
            title="Billing & payments"
            actions={
                <Link href="/advertiser/account#billing" className={btnOutline}>
                    Manage billing details
                </Link>
            }
        />
    );

    if (state.kind === "loading" || (state.kind === "ready" && !state.value)) {
        return (
            <>
                {heading}
                <div className="mt-6">
                    <LoadingLine>Loading your invoices…</LoadingLine>
                </div>
            </>
        );
    }
    if (state.kind === "error") {
        return (
            <>
                {heading}
                <ErrorPanel title="Could not read your invoices" message={state.message} />
            </>
        );
    }

    const { invoices, campaigns } = state.value!;
    const campaignById = new Map(campaigns.map((c) => [c.id, c] as const));

    return (
        <>
            {heading}
            <h2 className="mt-8 text-base font-semibold text-ink">Invoices</h2>
            <p className="mt-1 text-xs text-dim">{invoicesSummary(invoices)}</p>

            <TablePanel className="mt-4">
                <thead>
                    <tr>
                        <Th>Invoice</Th>
                        <Th>Campaign</Th>
                        <Th>Issued</Th>
                        <Th align="right">Total paid</Th>
                        <Th>Status</Th>
                        <Th />
                    </tr>
                </thead>
                <tbody>
                    {invoices.map((invoice) => (
                        <InvoiceLine key={invoice.id} invoice={invoice} campaign={invoice.campaignId ? campaignById.get(invoice.campaignId) : undefined} />
                    ))}
                    {invoices.length === 0 && (
                        <tr className="border-t border-line">
                            <td colSpan={6} className="px-5 py-10 text-center text-sm text-dim">
                                No invoices yet. ADX issues one the moment a campaign is paid.
                            </td>
                        </tr>
                    )}
                </tbody>
            </TablePanel>

            <section className="mt-8 flex flex-wrap items-center justify-between gap-4">
                <div>
                    <h2 className="text-base font-semibold text-ink">Need help with an invoice?</h2>
                    <p className="mt-1 text-sm text-dim">Create a request and include the invoice number so the team can find the right payment.</p>
                </div>
                <Link href="/advertiser/requests/new?topic=PAYMENT" className={btnOutline}>
                    Create a request
                </Link>
            </section>
        </>
    );
}

function InvoiceLine({ invoice, campaign }: { invoice: Invoice; campaign?: CampaignRow }) {
    const status = invoiceStatusLabel(invoice);
    const title = campaign?.name ?? (invoice.packageSaleId ? "ADX plan" : invoice.topUpId ? "Wallet top-up" : "—");
    return (
        <tr className="border-t border-line">
            <Td className="font-medium text-ink">{invoice.number}</Td>
            <Td>
                <Cell title={title} line={`Taxable ${rupees(invoice.taxableValue)} · ${gstLabel(invoice.taxableValue, invoice.gstTotal).replace(/ \d+%$/, "")} ${rupees(invoice.gstTotal)}`} />
            </Td>
            <Td className="text-ink">{shortDate(invoice.issuedAt ?? invoice.createdAt)}</Td>
            <Td align="right" className="tabular-nums text-ink">
                {rupees(invoice.total)}
            </Td>
            <Td>
                <StatusChip label={status.label} tone={status.tone} pill={false} />
            </Td>
            <Td align="right">
                <Link href={`/advertiser/billing/invoices/${invoice.id}`} className="whitespace-nowrap text-sm font-semibold text-ink hover:text-brand">
                    View invoice
                </Link>
            </Td>
        </tr>
    );
}
