"use client";

import Link from "next/link";
import { Cell, StatusChip, TablePanel, Td, Th } from "@/components/advertiser/bits";
import { gstLabel, invoiceStatusLabel, rupees, shortDate, type CampaignRow, type Invoice } from "@/services/advertiser-workspace";

/**
 * DR 12 · 07 · 06 · Billing & payments (5204:73520): every document ADX
 * issued to this account — `GET /advertisers/:id/invoices` — with the
 * campaign (or plan) it bills and the door to the document.
 */
export function InvoicesTable({ invoices, campaigns }: { invoices: Invoice[]; campaigns: CampaignRow[] }) {
    const campaignById = new Map(campaigns.map((c) => [c.id, c] as const));
    return (
        <TablePanel>
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
                            No invoices yet. ADX issues one the moment a campaign is authorised or a plan is paid for.
                        </td>
                    </tr>
                )}
            </tbody>
        </TablePanel>
    );
}

function InvoiceLine({ invoice, campaign }: { invoice: Invoice; campaign?: CampaignRow }) {
    const status = invoiceStatusLabel(invoice);
    const title = campaign?.name ?? (invoice.packageSaleId ? "ADX plan" : invoice.topUpId ? "Wallet top-up" : "—");
    const note = invoice.kind === "PROFORMA" ? "Proforma — the tax invoice follows once ADX's GSTIN is on file" : invoice.kind === "CREDIT_NOTE" && invoice.voidsInvoiceId ? "Credit note against an invoice ADX withdrew" : null;
    return (
        <tr className="border-t border-line">
            <Td className="font-medium text-ink">{invoice.number}</Td>
            <Td>
                <Cell title={title} line={note ?? `Taxable ${rupees(invoice.taxableValue)} · ${gstLabel(invoice.taxableValue, invoice.gstTotal).replace(/ \d+%$/, "")} ${rupees(invoice.gstTotal)}`} />
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
