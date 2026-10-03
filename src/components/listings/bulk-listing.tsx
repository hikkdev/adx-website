"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Download, FileSpreadsheet, Upload } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { brandButton, Chip, Crumbs, ErrorNote, Loading, outlineButton, Segmented } from "@/components/publisher/parts";
import { useLoad } from "@/components/publisher/use-load";
import { usePublisher } from "@/app/publisher/layout";
import { messageOf } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import {
    actionableCount,
    bulkListingsService,
    canCommit,
    commitTally,
    filterRows,
    importStatusLabel,
    importSummary,
    isNearbyDuplicate,
    outcomeLabel,
    resultLabel,
    rowTitle,
    SHEET_ACCEPT,
    sheetProblem,
    type ImportRow,
    type ListingImport,
    type RowFilter,
} from "@/services/bulk-listings";
import { longDate, openBlob } from "@/services/publisher-workspace";
import { FormatGuide } from "./format-guide";

/**
 * BL-1 · Add many spaces at once — the page the ADX app sends a publisher
 * with more than three spaces to. Four steps on one page: take the template
 * (and the format guide the server publishes), upload the filled sheet,
 * read the check — a line per row: will be added, fills a space already on
 * ADX, skipped, a note (a price under ADX's floor, a spot another publisher
 * has within 25 m, no map position), or needs fixing — then add them. The
 * added spaces are never live: each goes to ADX for review under one listing
 * agreement for the whole sheet. `?import=` names the upload on screen, so a
 * reload or the history list lands on it.
 */
export function BulkListing() {
    return (
        <React.Suspense fallback={<Loading label="Loading…" />}>
            <BulkListingView />
        </React.Suspense>
    );
}

function BulkListingView() {
    const router = useRouter();
    const params = useSearchParams();
    const importId = params.get("import");
    const me = usePublisher();
    const publisherId = me?.id ?? null;

    const format = useLoad("bulk:format", () => bulkListingsService.format());
    const history = useLoad(`bulk:history:${publisherId ?? ""}`, () => (publisherId ? bulkListingsService.history(publisherId).then((page) => page.items) : Promise.resolve([] as ListingImport[])));
    const current = useLoad(`bulk:import:${importId ?? ""}`, () => (importId ? bulkListingsService.get(importId) : Promise.resolve(null)));

    const open = (id: string | null) => router.replace(id ? `/publisher/listings/bulk?import=${encodeURIComponent(id)}` : "/publisher/listings/bulk");

    const downloadTemplate = async () => {
        try {
            openBlob(await bulkListingsService.template(), "adx-listings-template.csv");
        } catch (caught) {
            toast.error(messageOf(caught, "Could not download the template."));
        }
    };

    const shown = importId ? current.data : null;

    return (
        <div className="mx-auto w-full max-w-[1184px]">
            <Crumbs items={[{ label: "My inventory", href: "/publisher/inventory" }, { label: "Add many at once" }]} />
            <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-semibold tracking-tight text-ink">Add many spaces at once</h1>
                    <p className="mt-2 max-w-[680px] text-sm text-dim">One sheet, one space per row. ADX checks every row before anything is added and tells you what it will do with each. Added spaces are not live: ADX reviews each one, and you finish them — photographs, papers — from your inventory.</p>
                </div>
                <Link href="/publisher/listings/new" className={outlineButton}>
                    Add one space instead
                </Link>
            </div>

            {importId ? (
                current.loading && !current.data ? (
                    <Loading label="Reading that upload…" />
                ) : current.error && !current.data ? (
                    <div className="mt-6">
                        <ErrorNote message={current.error} onRetry={current.reload} />
                        <button type="button" onClick={() => open(null)} className={cn(outlineButton, "mt-4")}>
                            Start a new upload
                        </button>
                    </div>
                ) : shown ? (
                    <ImportReport
                        imp={shown}
                        onChanged={(next) => {
                            current.reload();
                            history.reload();
                            if (!next) open(null);
                        }}
                        onStartOver={() => open(null)}
                    />
                ) : null
            ) : (
                <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_340px]">
                    <div className="grid content-start gap-6">
                        <StepCard n={1} title="Download the template">
                            <p className="text-sm text-dim">The template has every column the sheet can carry and two sample rows. Keep the header row; replace the samples with your spaces.</p>
                            <div className="mt-4 flex flex-wrap items-center gap-3">
                                <button type="button" onClick={() => void downloadTemplate()} className={brandButton}>
                                    <Download className="mr-2 size-4" aria-hidden />
                                    Download the template (CSV)
                                </button>
                                <span className="text-xs text-dim">Opens in Excel, Google Sheets or Numbers.</span>
                            </div>
                            <div className="mt-5">
                                {format.data ? <FormatGuide format={format.data} /> : format.error ? <ErrorNote message={format.error} onRetry={format.reload} /> : <Loading label="Loading the format guide…" />}
                            </div>
                        </StepCard>

                        <StepCard n={2} title="Upload the filled sheet">
                            {publisherId ? <UploadForm publisherId={publisherId} onChecked={(imp) => {
                                history.reload();
                                open(imp.id);
                            }} /> : <Loading label="Reading your account…" />}
                        </StepCard>
                    </div>

                    <aside className="grid content-start gap-6">
                        <section className="rounded-lg border border-line bg-white p-5">
                            <h2 className="text-sm font-semibold text-ink">What happens next</h2>
                            <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-dim">
                                <li>ADX checks every row and shows you the result. Nothing is added yet.</li>
                                <li>You add the rows that passed; a row that needs fixing is left out — fix it in the sheet and upload again.</li>
                                <li>The added spaces go to ADX for review under one listing agreement. None is live until ADX approves it.</li>
                            </ol>
                        </section>
                        <History items={history.data ?? []} loading={history.loading && !history.data} onOpen={open} />
                    </aside>
                </div>
            )}
        </div>
    );
}

function StepCard({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
    return (
        <section className="rounded-xl border border-line bg-white px-7 py-6">
            <h2 className="flex items-center gap-3 text-lg font-semibold text-ink">
                <span className="flex size-7 items-center justify-center rounded-full bg-brand-soft text-sm font-semibold text-brand">{n}</span>
                {title}
            </h2>
            <div className="mt-4">{children}</div>
        </section>
    );
}

/** The sheet, chosen or dropped, checked here for the shape the server reads, then sent. */
function UploadForm({ publisherId, onChecked }: { publisherId: string; onChecked: (imp: ListingImport) => void }) {
    const input = React.useRef<HTMLInputElement>(null);
    const [file, setFile] = React.useState<File | null>(null);
    const [note, setNote] = React.useState("");
    const [problem, setProblem] = React.useState<string | null>(null);
    const [busy, setBusy] = React.useState(false);
    const [dragging, setDragging] = React.useState(false);

    const choose = (picked: File | null | undefined) => {
        if (!picked) return;
        const issue = sheetProblem(picked);
        setProblem(issue);
        setFile(issue ? null : picked);
    };

    const send = async () => {
        if (!file) return;
        setBusy(true);
        setProblem(null);
        try {
            const imp = await bulkListingsService.upload(publisherId, file, note);
            toast.success("Sheet checked", { description: importSummary(imp) });
            onChecked(imp);
        } catch (caught) {
            setProblem(messageOf(caught, "Could not check that sheet."));
        } finally {
            setBusy(false);
        }
    };

    return (
        <div>
            <div
                onDragOver={(event) => {
                    event.preventDefault();
                    setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(event) => {
                    event.preventDefault();
                    setDragging(false);
                    choose(event.dataTransfer.files?.[0]);
                }}
                className={cn("flex flex-col items-center justify-center rounded-lg border-2 border-dashed px-6 py-8 text-center", dragging ? "border-brand bg-brand-soft/40" : "border-line bg-ground")}
            >
                <span className="flex size-11 items-center justify-center rounded-full border-2 border-brand-bright/40 text-brand-bright">
                    <Upload className="size-5" aria-hidden />
                </span>
                <p className="mt-3 text-sm font-semibold text-ink">{file ? file.name : "Drop the sheet here or browse"}</p>
                <p className="mt-1 text-xs text-dim">{file ? `${(file.size / 1024).toFixed(1)} KB · ready to check` : "Excel (.xlsx) or CSV · up to 5 MB · one file"}</p>
                <button type="button" onClick={() => input.current?.click()} className="mt-3 text-sm font-semibold text-brand-bright hover:underline">
                    {file ? "Choose another file" : "Browse files"}
                </button>
                <input ref={input} type="file" accept={SHEET_ACCEPT} className="sr-only" onChange={(event) => choose(event.target.files?.[0])} />
            </div>
            <label className="mt-4 block">
                <span className="block text-sm font-medium text-ink">A note for this upload · optional</span>
                <input value={note} onChange={(event) => setNote(event.target.value)} maxLength={500} placeholder="Bengaluru hoardings, October batch" className="mt-2 h-10 w-full rounded-md border border-line bg-white px-3 text-sm text-ink placeholder:text-dim focus:border-ink focus:outline-none" />
            </label>
            {problem && (
                <p role="alert" className="mt-4 rounded-md border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger">
                    {problem}
                </p>
            )}
            <div className="mt-5 flex justify-end">
                <button type="button" onClick={() => void send()} disabled={!file || busy} className={brandButton}>
                    {busy ? "Checking the sheet…" : "Check the sheet"}
                </button>
            </div>
        </div>
    );
}

/** An upload, checked or added: the counts, the rows, and what can be done with it. */
function ImportReport({ imp, onChanged, onStartOver }: { imp: ListingImport; onChanged: (still: boolean) => void; onStartOver: () => void }) {
    const [filter, setFilter] = React.useState<RowFilter>(imp.invalidCount + imp.warningCount + imp.skippedCount > 0 ? "ATTENTION" : "ALL");
    const [busy, setBusy] = React.useState<"commit" | "revoke" | null>(null);
    const [confirm, setConfirm] = React.useState<"commit" | "revoke" | null>(null);
    const [problem, setProblem] = React.useState<string | null>(null);
    const rows = [...(imp.rows ?? [])].sort((a, b) => a.rowNumber - b.rowNumber);
    const shown = filterRows(rows, filter);
    const status = importStatusLabel(imp.status);
    const committed = imp.status === "COMMITTED";
    const tally = committed ? commitTally(rows) : null;
    const actionable = actionableCount(imp);

    const report = async () => {
        try {
            openBlob(await bulkListingsService.report(imp.id), `adx-listings-check-${imp.id}.csv`);
        } catch (caught) {
            toast.error(messageOf(caught, "Could not download the report."));
        }
    };

    const act = async (which: "commit" | "revoke") => {
        setBusy(which);
        setProblem(null);
        try {
            if (which === "commit") {
                const done = await bulkListingsService.commit(imp.id);
                const t = commitTally(done.rows ?? []);
                toast.success(`${t.added} space${t.added === 1 ? "" : "s"} added`, { description: "They are in your inventory, waiting for ADX's review." });
                onChanged(true);
            } else {
                await bulkListingsService.revoke(imp.id);
                toast.success("Upload thrown away", { description: "Nothing from it was added." });
                onChanged(false);
            }
            setConfirm(null);
        } catch (caught) {
            setProblem(messageOf(caught, which === "commit" ? "Could not add the spaces." : "Could not throw the upload away."));
            setConfirm(null);
        } finally {
            setBusy(null);
        }
    };

    return (
        <div className="mt-6 grid gap-6">
            <section className="rounded-xl border border-line bg-white px-7 py-6">
                <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="flex items-start gap-3">
                        <FileSpreadsheet className="mt-0.5 size-5 text-dim" aria-hidden />
                        <div>
                            <p className="text-base font-semibold text-ink">{imp.fileName}</p>
                            <p className="mt-0.5 text-xs text-dim">
                                Uploaded {longDate(imp.createdAt)}
                                {imp.committedAt ? ` · added ${longDate(imp.committedAt)}` : ""}
                                {imp.note ? ` · ${imp.note}` : ""}
                            </p>
                        </div>
                    </div>
                    <Chip tone={status.tone === "success" ? "success" : status.tone === "warning" ? "warning" : "neutral"}>{status.label}</Chip>
                </div>

                {committed && tally ? (
                    <div className="mt-5 grid gap-3 sm:grid-cols-4">
                        <Count label="Added" value={tally.added} tone="success" />
                        <Count label="Filled in" value={tally.filled} tone="info" />
                        <Count label="Skipped" value={tally.skipped + imp.skippedCount} tone="neutral" />
                        <Count label="Not added" value={tally.failed + imp.invalidCount} tone={tally.failed + imp.invalidCount ? "danger" : "neutral"} />
                    </div>
                ) : (
                    <div className="mt-5 grid gap-3 sm:grid-cols-4">
                        <Count label="Will be added" value={imp.createdCount} tone="success" hint={imp.warningCount ? `${imp.warningCount} with a note` : undefined} />
                        <Count label="Fill a space on ADX" value={imp.mergedCount} tone="info" />
                        <Count label="Skipped" value={imp.skippedCount} tone="neutral" />
                        <Count label="Need fixing" value={imp.invalidCount} tone={imp.invalidCount ? "danger" : "neutral"} />
                    </div>
                )}

                <p className="mt-4 text-sm text-dim">
                    {committed
                        ? "The added spaces are in your inventory, not live. ADX reviews each one under a single listing agreement for this sheet; open each to add photographs and papers."
                        : imp.status === "REVOKED"
                          ? "This upload was thrown away. Nothing from it was added."
                          : actionable > 0
                            ? `${importSummary(imp)}. Adding them files ${actionable === 1 ? "it" : "them"} for ADX's review — none goes live until ADX approves it.${imp.invalidCount ? " Rows that need fixing are left out; fix them in the sheet and upload them again." : ""}`
                            : "Nothing in this sheet can be added yet. Fix the rows below in the sheet and upload it again."}
                </p>

                {problem && (
                    <p role="alert" className="mt-4 rounded-md border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger">
                        {problem}
                    </p>
                )}

                <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-3">
                        <button type="button" onClick={onStartOver} className={outlineButton}>
                            {committed || imp.status === "REVOKED" ? "Upload another sheet" : "Upload a corrected sheet"}
                        </button>
                        <button type="button" onClick={() => void report()} className={outlineButton}>
                            <Download className="mr-2 size-4" aria-hidden />
                            Download the check (CSV)
                        </button>
                    </div>
                    {imp.status === "VALIDATED" && (
                        <div className="flex flex-wrap items-center gap-3">
                            <button type="button" onClick={() => setConfirm("revoke")} disabled={busy !== null} className="text-sm font-medium text-dim hover:text-ink disabled:opacity-50">
                                Throw this upload away
                            </button>
                            <button type="button" onClick={() => setConfirm("commit")} disabled={!canCommit(imp) || busy !== null} className={brandButton}>
                                {busy === "commit" ? "Adding…" : actionable > 0 ? `Add ${actionable} space${actionable === 1 ? "" : "s"}` : "Nothing to add"}
                            </button>
                        </div>
                    )}
                    {committed && (
                        <Link href="/publisher/inventory?shelf=inactive" className={brandButton}>
                            Open my inventory
                        </Link>
                    )}
                </div>
            </section>

            <section>
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <h2 className="text-base font-semibold text-ink">Row by row</h2>
                    <Segmented
                        label="Rows"
                        value={filter}
                        onChange={setFilter}
                        options={[
                            { value: "ALL", label: "All", count: rows.length },
                            { value: "ATTENTION", label: "Needs a look", count: filterRows(rows, "ATTENTION").length },
                            { value: "READY", label: "Ready", count: filterRows(rows, "READY").length },
                        ]}
                    />
                </div>
                <div className="mt-3 overflow-x-auto rounded-lg border border-line bg-white">
                    <table className="w-full min-w-[720px] text-sm">
                        <thead>
                            <tr className="bg-[#f5f5f3] text-left text-xs font-medium text-dim">
                                <th scope="col" className="h-9 w-[70px] px-3">
                                    Line
                                </th>
                                <th scope="col" className="h-9 px-3">
                                    Space
                                </th>
                                <th scope="col" className="h-9 w-[190px] px-3">
                                    {committed ? "Result" : "What ADX will do"}
                                </th>
                                <th scope="col" className="h-9 px-3">
                                    Why
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {shown.length === 0 && (
                                <tr>
                                    <td colSpan={4} className="px-3 py-6 text-center text-sm text-dim">
                                        Nothing on this filter.
                                    </td>
                                </tr>
                            )}
                            {shown.map((row) => (
                                <ReportRow key={row.id} row={row} committed={committed} />
                            ))}
                        </tbody>
                    </table>
                </div>
            </section>

            <Dialog open={confirm !== null} onOpenChange={(next) => !next && setConfirm(null)}>
                <DialogContent className="max-w-[460px] rounded-lg border-line p-6">
                    <DialogHeader>
                        <DialogTitle className="text-lg font-semibold text-ink">{confirm === "commit" ? `Add ${actionable} space${actionable === 1 ? "" : "s"}?` : "Throw this upload away?"}</DialogTitle>
                        <DialogDescription className="text-sm text-dim">
                            {confirm === "commit"
                                ? `${importSummary(imp)}. The spaces go to ADX for review under one listing agreement for this sheet; none is live until ADX approves it. Rows that need fixing are left out.`
                                : "Nothing from this sheet is added. You can upload it again at any time."}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="mt-2 flex justify-end gap-3">
                        <button type="button" onClick={() => setConfirm(null)} className={outlineButton}>
                            Cancel
                        </button>
                        <button type="button" onClick={() => confirm && void act(confirm)} disabled={busy !== null} className={confirm === "revoke" ? "inline-flex h-10 items-center rounded-md bg-danger px-5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50" : brandButton}>
                            {busy ? "Working…" : confirm === "commit" ? "Add them" : "Throw it away"}
                        </button>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}

const COUNT_TONE = { success: "text-success", info: "text-info", neutral: "text-ink", danger: "text-danger", warning: "text-warning" } as const;

function Count({ label, value, tone, hint }: { label: string; value: number; tone: keyof typeof COUNT_TONE; hint?: string }) {
    return (
        <div className="rounded-lg bg-ground px-4 py-3">
            <p className={cn("text-2xl font-semibold tabular-nums", value ? COUNT_TONE[tone] : "text-dim")}>{value}</p>
            <p className="mt-0.5 text-xs text-dim">
                {label}
                {hint ? ` · ${hint}` : ""}
            </p>
        </div>
    );
}

const PILL = { success: "bg-success-soft text-success", info: "bg-info-soft text-info", neutral: "bg-ground text-dim", danger: "bg-danger-soft text-danger", warning: "bg-warning-soft text-warning" } as const;

function ReportRow({ row, committed }: { row: ImportRow; committed: boolean }) {
    const label = committed ? resultLabel(row) : outcomeLabel(row.outcome);
    const duplicate = isNearbyDuplicate(row);
    const target = row.targetId ?? row.data?.result?.targetId ?? null;
    return (
        <tr className="border-t border-line align-top">
            <td className="px-3 py-3 tabular-nums text-dim">{row.rowNumber}</td>
            <td className="px-3 py-3">
                <p className="font-medium text-ink">{rowTitle(row)}</p>
                {typeof row.data?.address === "string" && row.data.address && row.data.title ? <p className="mt-0.5 text-xs text-dim">{row.data.address}</p> : null}
                {target && (committed || row.outcome === "MERGED" || row.outcome === "SKIPPED") && (
                    <Link href={`/publisher/listings/${encodeURIComponent(target)}`} className="mt-1 inline-block text-xs font-semibold text-ink underline underline-offset-4 decoration-line hover:decoration-ink">
                        Open the space
                    </Link>
                )}
            </td>
            <td className="px-3 py-3">
                <span className={cn("inline-flex h-6 items-center rounded-md px-2 text-xs font-semibold", PILL[label.tone])}>{label.label}</span>
                {duplicate && <span className="mt-1 block text-[11px] font-medium text-warning">Possible duplicate nearby</span>}
            </td>
            <td className="px-3 py-3 text-xs text-dim">{row.message ?? "—"}</td>
        </tr>
    );
}

/** The earlier uploads, newest first — each opens its own check. */
function History({ items, loading, onOpen }: { items: ListingImport[]; loading: boolean; onOpen: (id: string) => void }) {
    return (
        <section className="rounded-lg border border-line bg-white p-5">
            <h2 className="text-sm font-semibold text-ink">Earlier uploads</h2>
            {loading && <p className="mt-3 text-sm text-dim">Loading…</p>}
            {!loading && items.length === 0 && <p className="mt-3 text-sm text-dim">None yet. Your uploads are listed here, with what each one added.</p>}
            <ul className="mt-2 divide-y divide-line">
                {items.map((item) => {
                    const status = importStatusLabel(item.status);
                    return (
                        <li key={item.id}>
                            <button type="button" onClick={() => onOpen(item.id)} className="w-full py-3 text-left hover:bg-ground">
                                <p className="truncate text-sm font-medium text-ink">{item.fileName}</p>
                                <p className="mt-0.5 text-xs text-dim">
                                    {longDate(item.createdAt)} · <span className={cn(status.tone === "success" ? "text-success" : status.tone === "warning" ? "text-warning" : "text-dim")}>{status.label}</span>
                                </p>
                                <p className="mt-0.5 text-xs text-dim">{importSummary(item)}</p>
                            </button>
                        </li>
                    );
                })}
            </ul>
        </section>
    );
}
