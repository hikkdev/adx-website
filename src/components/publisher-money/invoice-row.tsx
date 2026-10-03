"use client";

import * as React from "react";
import { FileText, Upload } from "lucide-react";
import { toast } from "sonner";
import { Chip, Field, inputClass, outlineButton } from "@/components/publisher/parts";
import { messageOf } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { canRaiseInvoice, INVOICE_STATUS, invoiceAmountFor, publisherMoney, type MonthStatement, type PublisherInvoice } from "@/services/publisher-money";
import { formatMoney, longDate, toApiAmount } from "@/services/publisher-workspace";

/**
 * The GST-registered publisher's own invoice to ADX for a month (Q13):
 * ADX's payment advice is not a tax invoice, so the publisher raises theirs
 * — a PDF up through `POST /upload` (purpose INVOICE), then
 * `POST /publishers/me/invoices` with the period, the GSTIN and the amount
 * (prefilled with what was credited plus the TDS withheld). The month then
 * wears ADX's verdict: with ADX, matched, or rejected with the note — and a
 * rejected one may be raised again.
 */
export function InvoiceRow({ month, gstin, invoice, onRaised }: { month: MonthStatement; gstin: string; invoice: PublisherInvoice | null; onRaised: (invoice: PublisherInvoice) => void }) {
    const [amount, setAmount] = React.useState(() => invoiceAmountFor(month) ?? "");
    const [file, setFile] = React.useState<File | null>(null);
    const [busy, setBusy] = React.useState(false);
    const [failure, setFailure] = React.useState<string | null>(null);
    const inputRef = React.useRef<HTMLInputElement>(null);
    const sendable = toApiAmount(amount);
    const id = `invoice-${month.key}`;

    const raise = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!file) return setFailure("Choose the invoice PDF first.");
        if (!sendable) return setFailure("Enter the invoice amount in rupees, with up to two places.");
        if (file.size > 10 * 1024 * 1024) return setFailure("That file is over 10MB. Save the invoice as a smaller PDF and try again.");
        setBusy(true);
        setFailure(null);
        try {
            const stored = await publisherMoney.uploadInvoiceFile(file);
            const raised = await publisherMoney.uploadInvoice({ period: month.key, fileId: stored.id, gstin, amount: sendable });
            toast.success(`Invoice for ${month.label} sent to ADX`);
            setFile(null);
            onRaised(raised);
        } catch (caught) {
            setFailure(messageOf(caught, "The invoice did not go through. Try again."));
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="rounded-lg border border-line p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold text-ink">Your invoice to ADX</p>
                {invoice && <Chip tone={INVOICE_STATUS[invoice.status].tone}>{INVOICE_STATUS[invoice.status].label}</Chip>}
            </div>
            <p className="mt-1 text-sm text-dim">
                {!invoice
                    ? "ADX's payment advice is not a tax invoice. As a GST-registered publisher you raise yours for the month, and ADX matches it against what it paid."
                    : invoice.status === "UPLOADED"
                      ? `Raised for ${formatMoney(invoice.amount, { paise: "always" })} on ${longDate(invoice.createdAt)}. ADX matches it against what it paid.`
                      : invoice.status === "MATCHED"
                        ? `Matched by ADX${invoice.reviewedAt ? ` on ${longDate(invoice.reviewedAt)}` : ""} for ${formatMoney(invoice.amount, { paise: "always" })}.`
                        : `Not accepted${invoice.note ? `: ${invoice.note}` : ""}. Raise it again with the corrected invoice.`}
            </p>
            {canRaiseInvoice(invoice) && (
                <form onSubmit={raise} className="mt-3">
                    <div className="grid gap-3 sm:grid-cols-2">
                        <Field label="Invoice amount (before tax)" htmlFor={`${id}-amount`}>
                            <div className="relative">
                                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-dim">₹</span>
                                <input id={`${id}-amount`} inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value.replace(/[^\d.]/g, ""))} className={cn(inputClass, "pl-7")} />
                            </div>
                        </Field>
                        <Field label="Invoice PDF" htmlFor={`${id}-file`}>
                            <button type="button" onClick={() => inputRef.current?.click()} className={cn(outlineButton, "w-full justify-start gap-2 px-3 font-normal")}>
                                {file ? <FileText className="size-4 text-dim" aria-hidden /> : <Upload className="size-4 text-dim" aria-hidden />}
                                <span className="truncate">{file ? file.name : "Choose a PDF, up to 10MB"}</span>
                            </button>
                            <input ref={inputRef} id={`${id}-file`} type="file" accept="application/pdf" className="sr-only" onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
                        </Field>
                    </div>
                    <p className="mt-2 text-xs text-dim">Prefilled with what was credited plus the TDS withheld; change it to match your invoice. GSTIN {gstin}.</p>
                    {failure && (
                        <p role="alert" className="mt-2 text-sm text-danger">
                            {failure}
                        </p>
                    )}
                    <button type="submit" disabled={busy} className={cn(outlineButton, "mt-3")}>
                        {busy ? "Sending…" : invoice ? "Upload the corrected invoice" : "Upload your invoice to ADX"}
                    </button>
                </form>
            )}
        </div>
    );
}
