"use client";

import * as React from "react";
import { FileText, Upload } from "lucide-react";
import { toast } from "sonner";
import { PageHeading, Panel } from "@/components/workspace/page-heading";
import { brandButton, CardTitle, Cell, Chip, DataTable, ErrorNote, Loading, outlineButton, Segmented, TableRow, TitleCell } from "@/components/publisher/parts";
import { useLoad } from "@/components/publisher/use-load";
import { ApplicantGate, openFile } from "@/components/partner/parts";
import { cn } from "@/lib/utils";
import { formatWhen, monthLabel, partnerMessage, partnerService, readable, recentMonths } from "@/services/partner";

/**
 * Invoices — the month's GST invoice to ADX, from the shop. The PDF goes up
 * privately (purpose PARTNER_INVOICE) and `POST /print-partners/me/invoices
 * { fileId, month }` names the month it covers. The list is what ADX has on
 * file (`GET …/invoices`), re-read after a send — the shop's own and any
 * ADX recorded on its behalf. Uploading again for a month makes the new one
 * the latest; ADX keeps every copy.
 */
export default function PartnerInvoicesPage() {
    const { data, error, loading, reload } = useLoad("partner-invoices", () => readable(partnerService.invoices(), "Could not read the invoices on file."));
    const [months] = React.useState(() => recentMonths(new Date()));
    const [month, setMonth] = React.useState(months[1]?.value ?? months[0]!.value);
    const [file, setFile] = React.useState<File | null>(null);
    const [busy, setBusy] = React.useState(false);
    const [failure, setFailure] = React.useState<string | null>(null);
    const inputRef = React.useRef<HTMLInputElement>(null);

    const choose = (chosen: File | undefined) => {
        setFailure(null);
        if (!chosen) return;
        if (chosen.type && chosen.type !== "application/pdf") {
            setFailure("The invoice goes up as a PDF.");
            return;
        }
        setFile(chosen);
    };

    const send = async () => {
        if (!file || busy) return;
        setBusy(true);
        setFailure(null);
        try {
            const stored = await partnerService.upload(file, "PARTNER_INVOICE");
            await partnerService.uploadInvoice({ fileId: stored.id, month });
            toast.success(`Invoice for ${monthLabel(month)} sent to ADX.`);
            setFile(null);
            if (inputRef.current) inputRef.current.value = "";
            reload();
        } catch (caught) {
            setFailure(partnerMessage(caught, "The upload did not go through."));
        } finally {
            setBusy(false);
        }
    };

    return (
        <>
            <PageHeading title="Invoices" subtitle="Your GST invoice for the prints ADX paid you for in the month — a PDF, named with the month it covers." />
            <ApplicantGate what="Invoices">
                <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_340px]">
                    <section aria-labelledby="on-file-heading" className="min-w-0">
                        <h2 id="on-file-heading" className="text-base font-semibold text-ink">
                            On file with ADX
                        </h2>
                        <p className="mt-1 text-sm text-dim">ADX matches each invoice to the month's payouts; a query comes back through Help & support.</p>
                        <div className="mt-4">
                            {error && (
                                <div className="mb-4">
                                    <ErrorNote message={error} onRetry={reload} />
                                </div>
                            )}
                            {!data && loading ? (
                                <Loading label="Reading the invoices on file…" />
                            ) : !data || data.length === 0 ? (
                                <Panel>
                                    <p className="text-sm text-dim">{error ? "The list could not be read; sending an invoice still works." : "No invoice on file yet. The first one you send appears here, with the month it covers."}</p>
                                </Panel>
                            ) : (
                                <DataTable columns={[{ label: "Month" }, { label: "Uploaded" }, { label: "" }, { label: "", align: "right" }]}>
                                    {data.map((row) => (
                                        <TableRow key={row.id}>
                                            <Cell>
                                                <TitleCell title={row.month ? monthLabel(row.month) : "Month not recorded"} line={row.filename} />
                                            </Cell>
                                            <Cell>
                                                <span className="whitespace-nowrap text-dim">{formatWhen(row.createdAt)}</span>
                                            </Cell>
                                            <Cell>{row.recordedBy === "ADMIN" && <Chip tone="neutral">Recorded by ADX</Chip>}</Cell>
                                            <Cell align="right">
                                                <button type="button" onClick={() => void openFile(row.url, row.filename)} className="whitespace-nowrap text-sm font-semibold text-ink hover:underline">
                                                    Open
                                                </button>
                                            </Cell>
                                        </TableRow>
                                    ))}
                                </DataTable>
                            )}
                        </div>
                    </section>

                    <Panel className="self-start">
                        <CardTitle>Send an invoice</CardTitle>
                        <p className="mt-3 text-sm font-medium text-ink">Which month?</p>
                        <div className="mt-2 overflow-x-auto">
                            <Segmented label="Invoice month" value={month} onChange={setMonth} options={months.map((m) => ({ value: m.value, label: m.label.replace(/ \d{4}$/, "") }))} />
                        </div>
                        <p className="mt-3 text-sm text-dim">The invoice for {monthLabel(month)}. Sending again for the same month makes it the latest; ADX keeps every copy.</p>
                        {file ? (
                            <div className="mt-4 flex items-center gap-3 rounded-lg border border-line px-3 py-3">
                                <FileText className="size-5 shrink-0 text-dim" aria-hidden />
                                <p className="min-w-0 flex-1 truncate text-sm text-ink">{file.name}</p>
                                <button type="button" onClick={() => setFile(null)} disabled={busy} className="text-xs font-semibold text-dim hover:text-ink">
                                    Change
                                </button>
                            </div>
                        ) : (
                            <button type="button" onClick={() => inputRef.current?.click()} className={cn(outlineButton, "mt-4 w-full gap-2")}>
                                <Upload className="size-4" aria-hidden />
                                Choose the PDF
                            </button>
                        )}
                        <input ref={inputRef} type="file" accept="application/pdf" className="sr-only" aria-label="Choose the invoice PDF" onChange={(event) => choose(event.target.files?.[0])} />
                        {failure && (
                            <p role="alert" className="mt-3 text-sm text-danger">
                                {failure}
                            </p>
                        )}
                        <button type="button" onClick={() => void send()} disabled={!file || busy} className={cn(brandButton, "mt-4 w-full")}>
                            {busy ? "Sending…" : "Send it to ADX"}
                        </button>
                    </Panel>
                </div>
            </ApplicantGate>
        </>
    );
}
