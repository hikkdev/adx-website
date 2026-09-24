"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { messageOf } from "@/lib/api-client";
import { PageHeading } from "@/components/workspace/page-heading";
import { useAdvertiser } from "@/app/advertiser/layout";
import { btnOutline, ErrorPanel, LoadingLine, TablePanel, Td, Th, useAsync } from "@/components/advertiser/bits";
import {
    advertiserWorkspace,
    dateRange,
    detailLines,
    gstLabel,
    invoiceFileName,
    invoiceLines,
    invoiceStatusLabel,
    longDate,
    paymentLine,
    rupees,
    saveBlob,
    type CampaignDetail,
    type CampaignReview,
    type Invoice,
    type InvoiceDetail,
    type InvoiceDetailLine,
    type PaymentRow,
} from "@/services/advertiser-workspace";

/**
 * DR 12 · 07 · 07/08 · Invoice (5204:73835, 5204:75777): one document —
 * the three totals, the lines, and the details block. The party's invoice
 * read carries the totals; the lines are rebuilt from the campaign's own
 * receipt (`GET /campaigns/:id/review`) at the invoice's GST rate. The PDF
 * is `GET /advertisers/:id/invoices/:invoiceId/pdf` through `apiBlob`.
 */
export default function InvoicePage() {
    const params = useParams<{ id: string }>();
    const invoiceId = params.id;
    const advertiser = useAdvertiser();
    const advertiserId = advertiser?.id ?? null;

    const state = useAsync(
        `invoice:${invoiceId}:${advertiserId ?? ""}`,
        async () => {
            if (!advertiserId) return null;
            /* WG-1: the document with its lines; a backend from before the route answers 404 and the list row stands in. */
            const detail = await advertiserWorkspace.invoice(advertiserId, invoiceId).catch(() => null as InvoiceDetail | null);
            const invoice: Invoice | null = detail ?? ((await advertiserWorkspace.invoices(advertiserId)).find((i) => i.id === invoiceId) ?? null);
            if (!invoice) return { invoice: null, lines: [] as InvoiceDetailLine[], campaign: null, review: null, payments: [] as PaymentRow[] };
            const lines = detail?.lines ?? [];
            const [campaign, review, payments] = await Promise.all([
                invoice.campaignId ? advertiserWorkspace.campaign(invoice.campaignId).catch(() => null as CampaignDetail | null) : Promise.resolve(null),
                invoice.campaignId && lines.length === 0 ? advertiserWorkspace.campaignReview(invoice.campaignId).catch(() => null as CampaignReview | null) : Promise.resolve(null),
                advertiserWorkspace.payments(advertiserId).then((page) => page.items).catch(() => [] as PaymentRow[]),
            ]);
            return { invoice, lines, campaign, review, payments };
        },
        "Could not read this invoice."
    );

    if (state.kind === "loading" || (state.kind === "ready" && !state.value)) return <LoadingLine>Loading the invoice…</LoadingLine>;
    if (state.kind === "error") {
        return (
            <>
                <PageHeading title="Invoice" />
                <ErrorPanel title="Could not read this invoice" message={state.message} />
            </>
        );
    }
    const { invoice, lines, campaign, review, payments } = state.value!;
    if (!invoice) {
        return (
            <>
                <PageHeading title="Invoice" />
                <ErrorPanel title="No such invoice" message="This invoice is not on your account." />
            </>
        );
    }
    return <InvoiceView invoice={invoice} documentLines={lines} campaign={campaign} review={review} payments={payments} advertiserId={advertiserId!} />;
}

function InvoiceView({ invoice, documentLines, campaign, review, payments, advertiserId }: { invoice: Invoice; documentLines: InvoiceDetailLine[]; campaign: CampaignDetail | null; review: CampaignReview | null; payments: PaymentRow[]; advertiserId: string }) {
    const [downloading, setDownloading] = React.useState<"idle" | "busy" | string>("idle");
    const status = invoiceStatusLabel(invoice);
    const gst = gstLabel(invoice.taxableValue, invoice.gstTotal);
    const rebuilt = documentLines.length === 0;
    const lines = !rebuilt
        ? detailLines(documentLines, campaign)
        : campaign
          ? invoiceLines(invoice, campaign, review)
          : [{ description: invoice.packageSaleId ? "ADX plan" : invoice.topUpId ? "Wallet top-up" : "Services", period: "", quantity: "1", taxable: Number(invoice.taxableValue), gst: Number(invoice.gstTotal), total: Number(invoice.total) }];
    const paid = status.label === "Paid";

    const download = async () => {
        setDownloading("busy");
        try {
            const blob = await advertiserWorkspace.invoicePdf(advertiserId, invoice.id);
            saveBlob(blob, invoiceFileName(invoice.number));
            setDownloading("idle");
        } catch (caught) {
            setDownloading(messageOf(caught, "The PDF is not ready yet. Try again in a moment."));
        }
    };

    return (
        <>
            <Link href="/advertiser/billing" className="text-sm text-ink hover:text-brand">
                Back to billing
            </Link>
            <div className="mt-3 border-t border-line pt-5">
                <PageHeading
                    title={`Invoice ${invoice.number}`}
                    subtitle={`${status.label} · Issued ${longDate(invoice.issuedAt ?? invoice.createdAt)}`}
                    actions={
                        <>
                            {campaign && (
                                <Link href={`/advertiser/campaigns/${campaign.id}`} className={btnOutline}>
                                    View campaign
                                </Link>
                            )}
                            <button type="button" onClick={() => void download()} className={btnOutline} disabled={downloading === "busy"}>
                                {downloading === "busy" ? "Preparing PDF…" : "Download PDF"}
                            </button>
                        </>
                    }
                />
                {downloading !== "idle" && downloading !== "busy" && <p className="mt-2 text-right text-xs text-danger">{downloading}</p>}
            </div>

            <div className="mt-5 grid gap-4 md:grid-cols-3">
                <Stat label="Taxable amount" value={rupees(invoice.taxableValue)} />
                <Stat label={gst} value={rupees(invoice.gstTotal)} />
                <Stat label={paid ? "Total paid" : "Total"} value={rupees(invoice.total)} />
            </div>

            <TablePanel className="mt-4">
                <thead>
                    <tr>
                        <Th>Description</Th>
                        <Th>Period</Th>
                        <Th>Quantity</Th>
                        <Th>{gst}</Th>
                        <Th>Taxable</Th>
                        <Th>Total</Th>
                    </tr>
                </thead>
                <tbody>
                    {lines.map((line, index) => (
                        <tr key={`${line.description}-${index}`} className="border-t border-line">
                            <Td className="font-medium text-ink">{line.description}</Td>
                            <Td className="text-dim">{line.period || "—"}</Td>
                            <Td className="text-ink">{line.quantity}</Td>
                            <Td className="font-medium tabular-nums text-ink">{rupees(line.gst)}</Td>
                            <Td className="tabular-nums text-dim">{rupees(line.taxable)}</Td>
                            <Td className="tabular-nums text-dim">{rupees(line.total)}</Td>
                        </tr>
                    ))}
                </tbody>
            </TablePanel>
            {rebuilt && campaign && <p className="mt-2 text-xs text-dim">Lines are shown from the campaign's booking; the PDF is the document of record.</p>}

            <section className="mt-4 rounded-lg border border-line bg-white">
                <div className="border-b border-line px-4 py-3">
                    <h2 className="text-sm font-semibold text-ink">Invoice details</h2>
                </div>
                <div className="grid gap-x-8 gap-y-5 p-4 md:grid-cols-2">
                    <Detail label="Billed to">
                        <Box>{[invoice.recipientName, invoice.recipientGstin ? `GSTIN ${invoice.recipientGstin}` : null].filter(Boolean).join(" · ")}</Box>
                        {invoice.recipientAddress && <p className="mt-1.5 text-xs text-dim">{invoice.recipientAddress}</p>}
                    </Detail>
                    <Detail label="Campaign">
                        <Box muted>{campaign ? `${campaign.name} · ${campaign.reference}` : invoice.packageSaleId ? "ADX plan" : invoice.topUpId ? "Wallet top-up" : "—"}</Box>
                    </Detail>
                    <Detail label="Campaign dates">
                        <Box>{campaign ? dateRange(campaign.startDate, campaign.endDate, "long") : "—"}</Box>
                    </Detail>
                    <Detail label="Payment">
                        <p className="text-sm text-dim">{paid ? paymentLine(invoice, payments) : invoice.dueAt ? `Due ${longDate(invoice.dueAt)}` : "Not paid yet"}</p>
                        {invoice.supplierName && (
                            <p className="mt-1.5 text-xs text-dim">
                                Issued by {invoice.supplierName}
                                {invoice.supplierGstin ? ` · GSTIN ${invoice.supplierGstin}` : ""}
                                {invoice.placeOfSupply ? ` · Place of supply ${invoice.placeOfSupply}` : ""}
                            </p>
                        )}
                    </Detail>
                </div>
            </section>
        </>
    );
}

function Stat({ label, value }: { label: string; value: string }) {
    return (
        <div className="rounded-lg border border-line bg-white px-4 py-4">
            <p className="text-xs text-dim">{label}</p>
            <p className="mt-2 text-2xl font-semibold tracking-tight text-ink">{value}</p>
        </div>
    );
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div>
            <p className="text-sm font-medium text-ink">{label}</p>
            <div className="mt-2">{children}</div>
        </div>
    );
}

function Box({ children, muted }: { children: React.ReactNode; muted?: boolean }) {
    return <div className={`inline-flex min-h-10 w-full max-w-[258px] items-center rounded-md border border-line bg-white px-3 py-2 text-sm ${muted ? "text-dim" : "text-ink"}`}>{children}</div>;
}
