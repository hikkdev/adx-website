import { api, apiBlob } from "@/lib/api-client";

/**
 * BL-1 · many spaces at once. The ADX app sends a publisher with more than
 * three spaces here: one sheet from a computer, checked row by row, then
 * added in one go. The routes are the party-import kit's listing kind
 * (`ADX-backendv1/src/modules/party-imports`), which a publisher may now use
 * for their own account (`?publisherId=` is their own id):
 *
 * - `GET  /party-imports/formats/listings` — the format guide (columns, rules, two sample rows)
 * - `GET  /party-imports/formats/listings/template.csv` — the template
 * - `POST /party-imports/listings?publisherId=` — a CSV or an .xlsx under `file`; answers the import, VALIDATED, with a plan per row
 * - `GET  /party-imports/listings?publisherId=` — earlier uploads, newest first
 * - `GET  /party-imports/listings/:id`, `…/report.csv`
 * - `POST /party-imports/listings/:id/commit` — creates the spaces (never live; ADX reviews each)
 * - `POST /party-imports/listings/:id/revoke` — throws an uncommitted upload away
 *
 * The server reads a CSV or an Excel workbook (.xlsx, its first sheet —
 * 26 Sep 2026), 5 MB; the older and other workbook formats (.xls, .xlsm,
 * .ods, .numbers) are refused here with the way to save the sheet.
 */

export type ColumnType = "text" | "mobile" | "email" | "enum" | "number" | "money" | "date" | "url" | "list";

export interface ImportColumn {
    name: string;
    required: boolean;
    type: ColumnType;
    description: string;
    example: string;
    enumValues?: readonly string[];
    maxLength?: number;
}

export interface ImportFormat {
    kind: string;
    title: string;
    purpose: string;
    route: string;
    columns: ImportColumn[];
    rules: string[];
    sampleRows: Record<string, string>[];
    templateCsvUrl: string;
}

export type ImportStatus = "VALIDATED" | "COMMITTED" | "REVOKED";
export type ImportOutcome = "CREATED" | "MERGED" | "SKIPPED" | "WARNING" | "INVALID";

/** What a commit writes on a row once it has acted on it. */
export interface RowResult {
    action: "CREATED" | "MERGED" | "SKIPPED" | "FAILED";
    targetId: string | null;
    at: string;
}

export interface ImportRow {
    id: string;
    importId: string;
    /** The line in the file — the header is line 1, so the first space is line 2. */
    rowNumber: number;
    data: Record<string, unknown> & { plan?: { action: "CREATE" | "MERGE"; warnings?: string[]; targetId?: string } | null; result?: RowResult | null };
    outcome: ImportOutcome;
    targetId: string | null;
    message: string | null;
}

export interface ListingImport {
    id: string;
    party: string;
    fileName: string;
    note: string | null;
    publisherId: string | null;
    attemptId: string | null;
    status: ImportStatus;
    rowCount: number;
    createdCount: number;
    mergedCount: number;
    skippedCount: number;
    /** The rows that create WITH a warning — a subset of `createdCount`. */
    warningCount: number;
    invalidCount: number;
    createdAt: string;
    committedAt: string | null;
    /** On the single read and the upload's answer; absent on the list. */
    rows?: ImportRow[];
}

export interface ImportPage {
    items: ListingImport[];
    total: number;
    page: number;
    pageSize: number;
}

const enc = encodeURIComponent;

/** The server's own limit on the sheet (`MAX_CSV_BYTES`). */
export const MAX_SHEET_BYTES = 5 * 1024 * 1024;

export const bulkListingsService = {
    format: () => api.get<ImportFormat>("/party-imports/formats/listings"),
    template: () => apiBlob("/party-imports/formats/listings/template.csv"),
    /** The multipart shape the kit's CSV reader takes: the file under `file`, an optional note beside it. */
    upload: (publisherId: string, file: File, note?: string) => {
        const form = new FormData();
        form.append("file", file, file.name);
        if (note?.trim()) form.append("note", note.trim().slice(0, 500));
        return api.post<ListingImport>(`/party-imports/listings?publisherId=${enc(publisherId)}`, form);
    },
    history: (publisherId: string, page = 1, pageSize = 10) => api.get<ImportPage>(`/party-imports/listings?publisherId=${enc(publisherId)}&page=${page}&pageSize=${pageSize}`),
    get: (id: string) => api.get<ListingImport>(`/party-imports/listings/${enc(id)}`),
    report: (id: string) => apiBlob(`/party-imports/listings/${enc(id)}/report.csv`),
    commit: (id: string) => api.post<ListingImport>(`/party-imports/listings/${enc(id)}/commit`, {}),
    revoke: (id: string) => api.post<ListingImport>(`/party-imports/listings/${enc(id)}/revoke`, {}),
};

/* ------------------------------------------------------------------ */
/* Pure helpers                                                        */
/* ------------------------------------------------------------------ */

/** An Excel workbook (.xlsx) — the server reads its first sheet. */
export const XLSX_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/** What the file picker offers. */
export const SHEET_ACCEPT = `.csv,text/csv,.xlsx,${XLSX_TYPE}`;

/** Why a chosen file cannot go up, in the words the page prints; null when it can. */
export function sheetProblem(file: Pick<File, "name" | "size" | "type">): string | null {
    const name = file.name.toLowerCase();
    const workbook = name.endsWith(".xlsx") || file.type === XLSX_TYPE;
    if (!workbook && /\.(xlsm|xls|ods|numbers)$/.test(name)) {
        return "ADX reads .xlsx and CSV sheets. In Excel or Google Sheets, choose File › Save as (or Download) › Excel Workbook (.xlsx) or CSV UTF-8, then upload that file.";
    }
    const csvType = ["text/csv", "application/csv", "text/plain", "application/vnd.ms-excel", ""].includes(file.type);
    if (!workbook && !name.endsWith(".csv") && !csvType) return "That is not a sheet ADX reads. Download the template, fill it in, and save it as .xlsx or CSV.";
    if (file.size === 0) return "That file is empty.";
    if (file.size > MAX_SHEET_BYTES) return `That file is ${(file.size / 1024 / 1024).toFixed(1)} MB. A sheet can be up to 5 MB — split it into two uploads.`;
    return null;
}

export type Tone = "success" | "warning" | "danger" | "neutral" | "info";

/** A row's outcome as the report prints it. */
export function outcomeLabel(outcome: ImportOutcome): { label: string; tone: Tone } {
    switch (outcome) {
        case "CREATED":
            return { label: "Will be added", tone: "success" };
        case "WARNING":
            return { label: "Added, with a note", tone: "warning" };
        case "MERGED":
            return { label: "Fills an existing space", tone: "info" };
        case "SKIPPED":
            return { label: "Skipped", tone: "neutral" };
        default:
            return { label: "Needs fixing", tone: "danger" };
    }
}

/** A committed row's outcome, from the result the commit wrote on it. */
export function resultLabel(row: Pick<ImportRow, "outcome" | "data">): { label: string; tone: Tone } {
    const result = row.data?.result;
    if (!result) return row.outcome === "INVALID" ? { label: "Not added", tone: "danger" } : row.outcome === "SKIPPED" ? { label: "Skipped", tone: "neutral" } : { label: "Not done yet", tone: "neutral" };
    switch (result.action) {
        case "CREATED":
            return { label: "Added", tone: "success" };
        case "MERGED":
            return { label: "Filled in", tone: "info" };
        case "SKIPPED":
            return { label: "Skipped", tone: "neutral" };
        default:
            return { label: "Failed", tone: "danger" };
    }
}

/** How many rows a commit would act on — the rows that add or fill a space. */
export const actionableCount = (imp: Pick<ListingImport, "createdCount" | "mergedCount">): number => imp.createdCount + imp.mergedCount;

export const canCommit = (imp: Pick<ListingImport, "status" | "createdCount" | "mergedCount">): boolean => imp.status === "VALIDATED" && actionableCount(imp) > 0;

/** "4 to add · 1 fills an existing space · 2 need fixing" — the checked sheet in one line. */
export function importSummary(imp: Pick<ListingImport, "rowCount" | "createdCount" | "mergedCount" | "skippedCount" | "warningCount" | "invalidCount">): string {
    const parts: string[] = [];
    if (imp.createdCount) parts.push(`${imp.createdCount} to add${imp.warningCount ? ` (${imp.warningCount} with a note)` : ""}`);
    if (imp.mergedCount) parts.push(`${imp.mergedCount} ${imp.mergedCount === 1 ? "fills an existing space" : "fill existing spaces"}`);
    if (imp.skippedCount) parts.push(`${imp.skippedCount} skipped`);
    if (imp.invalidCount) parts.push(`${imp.invalidCount} ${imp.invalidCount === 1 ? "needs" : "need"} fixing`);
    return parts.length ? parts.join(" · ") : `${imp.rowCount} row${imp.rowCount === 1 ? "" : "s"}, nothing to do`;
}

/** After a commit: what actually landed, counted from the rows' results. */
export function commitTally(rows: Pick<ImportRow, "data">[]): { added: number; filled: number; skipped: number; failed: number } {
    const tally = { added: 0, filled: 0, skipped: 0, failed: 0 };
    for (const row of rows) {
        const action = row.data?.result?.action;
        if (action === "CREATED") tally.added += 1;
        else if (action === "MERGED") tally.filled += 1;
        else if (action === "SKIPPED") tally.skipped += 1;
        else if (action === "FAILED") tally.failed += 1;
    }
    return tally;
}

/** The name the row gives its space, or where it is, for the report's first column. */
export function rowTitle(row: Pick<ImportRow, "data" | "rowNumber">): string {
    const title = typeof row.data?.title === "string" ? row.data.title.trim() : "";
    const address = typeof row.data?.address === "string" ? row.data.address.trim() : "";
    return title || address || `Row ${row.rowNumber}`;
}

/** The report's filter: every row, or the ones that need the publisher. */
export type RowFilter = "ALL" | "ATTENTION" | "READY";
export function filterRows<T extends Pick<ImportRow, "outcome">>(rows: T[], filter: RowFilter): T[] {
    if (filter === "ATTENTION") return rows.filter((row) => row.outcome === "INVALID" || row.outcome === "WARNING" || row.outcome === "SKIPPED");
    if (filter === "READY") return rows.filter((row) => row.outcome === "CREATED" || row.outcome === "MERGED" || row.outcome === "WARNING");
    return rows;
}

/** "Possible duplicate of LST-… — another publisher's spot 12 m away" — the rows the checker flagged as a spot already on ADX. */
export const isNearbyDuplicate = (row: Pick<ImportRow, "message">): boolean => /possible duplicate/i.test(row.message ?? "");

/** The import status as the history list prints it. */
export function importStatusLabel(status: ImportStatus): { label: string; tone: Tone } {
    if (status === "COMMITTED") return { label: "Added", tone: "success" };
    if (status === "REVOKED") return { label: "Thrown away", tone: "neutral" };
    return { label: "Checked · not added yet", tone: "warning" };
}
