import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api-client", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-client")>();
    return {
        ...actual,
        api: { get: vi.fn(async () => ({})), post: vi.fn(async () => ({})), put: vi.fn(), patch: vi.fn(), delete: vi.fn() },
        apiBlob: vi.fn(async () => new Blob(["x"])),
    };
});

import { api, apiBlob } from "@/lib/api-client";
import {
    actionableCount,
    bulkListingsService,
    canCommit,
    commitTally,
    filterRows,
    importStatusLabel,
    importSummary,
    isNearbyDuplicate,
    MAX_SHEET_BYTES,
    outcomeLabel,
    resultLabel,
    rowTitle,
    sheetProblem,
    XLSX_TYPE,
    type ImportRow,
} from "./bulk-listings";

const get = api.get as unknown as ReturnType<typeof vi.fn>;
const post = api.post as unknown as ReturnType<typeof vi.fn>;
const blob = apiBlob as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
    get.mockClear();
    post.mockClear();
    blob.mockClear();
});

describe("BL-1: the routes the bulk page calls", () => {
    it("reads the listing format guide and its template", async () => {
        await bulkListingsService.format();
        expect(get).toHaveBeenCalledWith("/party-imports/formats/listings");
        await bulkListingsService.template();
        expect(blob).toHaveBeenCalledWith("/party-imports/formats/listings/template.csv");
    });

    it("uploads the sheet as multipart under `file`, for the publisher's own id, with the note beside it", async () => {
        const file = new File(["title,category\n"], "spaces.csv", { type: "text/csv" });
        await bulkListingsService.upload("pub 1", file, "  October batch  ");
        const [path, body] = post.mock.calls[0]!;
        expect(path).toBe("/party-imports/listings?publisherId=pub%201");
        expect(body).toBeInstanceOf(FormData);
        const form = body as FormData;
        expect((form.get("file") as File).name).toBe("spaces.csv");
        expect(form.get("note")).toBe("October batch");
    });

    it("leaves the note out when there is none", async () => {
        await bulkListingsService.upload("p1", new File(["a"], "a.csv"), "   ");
        expect((post.mock.calls[0]![1] as FormData).has("note")).toBe(false);
    });

    it("lists, reads, reports, commits and revokes by id", async () => {
        await bulkListingsService.history("p1", 2, 5);
        expect(get).toHaveBeenLastCalledWith("/party-imports/listings?publisherId=p1&page=2&pageSize=5");
        await bulkListingsService.get("imp/1");
        expect(get).toHaveBeenLastCalledWith("/party-imports/listings/imp%2F1");
        await bulkListingsService.report("imp1");
        expect(blob).toHaveBeenLastCalledWith("/party-imports/listings/imp1/report.csv");
        await bulkListingsService.commit("imp1");
        expect(post).toHaveBeenLastCalledWith("/party-imports/listings/imp1/commit", {});
        await bulkListingsService.revoke("imp1");
        expect(post).toHaveBeenLastCalledWith("/party-imports/listings/imp1/revoke", {});
    });
});

describe("the sheet a publisher chooses", () => {
    const file = (name: string, size = 100, type = "") => ({ name, size, type });

    it("takes a CSV", () => {
        expect(sheetProblem(file("spaces.csv", 100, "text/csv"))).toBeNull();
        expect(sheetProblem(file("SPACES.CSV"))).toBeNull();
    });

    it("takes an .xlsx workbook (26 Sep 2026: the server reads its first sheet)", () => {
        expect(sheetProblem(file("spaces.xlsx", 100, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"))).toBeNull();
        expect(sheetProblem(file("SPACES.XLSX"))).toBeNull();
        expect(sheetProblem(file("spaces.xlsx", MAX_SHEET_BYTES + 1, XLSX_TYPE))).toMatch(/up to 5 MB/);
    });

    it("refuses the other workbook formats with the way to save the sheet", () => {
        expect(sheetProblem(file("spaces.xls"))).toMatch(/Save as/);
        expect(sheetProblem(file("spaces.ods"))).toMatch(/\.xlsx/);
        expect(sheetProblem(file("spaces.numbers"))).toMatch(/CSV UTF-8/);
    });

    it("refuses anything else, an empty file, and one over the server's 5 MB", () => {
        expect(sheetProblem(file("photo.png", 100, "image/png"))).toMatch(/not a sheet ADX reads/);
        expect(sheetProblem(file("a.csv", 0))).toMatch(/empty/);
        expect(sheetProblem(file("a.csv", MAX_SHEET_BYTES + 1))).toMatch(/up to 5 MB/);
    });
});

const row = (over: Partial<ImportRow> = {}): ImportRow => ({ id: "r", importId: "i", rowNumber: 2, data: { title: "FC Road Hoarding", address: "44, FC Road, Pune" }, outcome: "CREATED", targetId: null, message: null, ...over });

describe("reading the check", () => {
    const counts = { rowCount: 7, createdCount: 4, mergedCount: 1, skippedCount: 1, warningCount: 2, invalidCount: 1 };

    it("says the sheet in one line", () => {
        expect(importSummary(counts)).toBe("4 to add (2 with a note) · 1 fills an existing space · 1 skipped · 1 needs fixing");
        expect(importSummary({ rowCount: 1, createdCount: 0, mergedCount: 0, skippedCount: 0, warningCount: 0, invalidCount: 0 })).toBe("1 row, nothing to do");
    });

    it("commits only a checked upload with something to add", () => {
        expect(actionableCount(counts)).toBe(5);
        expect(canCommit({ status: "VALIDATED", createdCount: 0, mergedCount: 1 })).toBe(true);
        expect(canCommit({ status: "VALIDATED", createdCount: 0, mergedCount: 0 })).toBe(false);
        expect(canCommit({ status: "COMMITTED", createdCount: 3, mergedCount: 0 })).toBe(false);
    });

    it("names each outcome", () => {
        expect(outcomeLabel("CREATED").label).toBe("Will be added");
        expect(outcomeLabel("WARNING").tone).toBe("warning");
        expect(outcomeLabel("MERGED").label).toBe("Fills an existing space");
        expect(outcomeLabel("INVALID")).toEqual({ label: "Needs fixing", tone: "danger" });
    });

    it("filters the rows that need a look and the ones ready to add", () => {
        const rows = [row({ outcome: "CREATED" }), row({ outcome: "WARNING" }), row({ outcome: "INVALID" }), row({ outcome: "SKIPPED" }), row({ outcome: "MERGED" })];
        expect(filterRows(rows, "ALL")).toHaveLength(5);
        expect(filterRows(rows, "ATTENTION").map((r) => r.outcome)).toEqual(["WARNING", "INVALID", "SKIPPED"]);
        expect(filterRows(rows, "READY").map((r) => r.outcome)).toEqual(["CREATED", "WARNING", "MERGED"]);
    });

    it("spots the rows the checker flagged as a nearby duplicate", () => {
        expect(isNearbyDuplicate(row({ message: "Will create under the batch's agreement; Possible duplicate of LST-0101 — another publisher's spot 12 m away" }))).toBe(true);
        expect(isNearbyDuplicate(row({ message: "Will create under the batch's agreement" }))).toBe(false);
    });

    it("names a row by its title, else its address, else its line", () => {
        expect(rowTitle(row())).toBe("FC Road Hoarding");
        expect(rowTitle(row({ data: { title: " ", address: "1, Station Road" } }))).toBe("1, Station Road");
        expect(rowTitle(row({ data: {}, rowNumber: 9 }))).toBe("Row 9");
    });
});

describe("after the commit", () => {
    it("counts what landed from the results written on the rows", () => {
        const at = "2026-09-26T00:00:00Z";
        const rows = [
            row({ data: { result: { action: "CREATED", targetId: "l1", at } } }),
            row({ data: { result: { action: "CREATED", targetId: "l2", at } } }),
            row({ data: { result: { action: "MERGED", targetId: "l3", at } } }),
            row({ data: { result: { action: "FAILED", targetId: null, at } } }),
            row({ outcome: "INVALID", data: {} }),
        ];
        expect(commitTally(rows)).toEqual({ added: 2, filled: 1, skipped: 0, failed: 1 });
        expect(resultLabel(rows[0]!)).toEqual({ label: "Added", tone: "success" });
        expect(resultLabel(rows[3]!).label).toBe("Failed");
        expect(resultLabel(rows[4]!).label).toBe("Not added");
    });

    it("labels an upload in the history", () => {
        expect(importStatusLabel("COMMITTED").label).toBe("Added");
        expect(importStatusLabel("REVOKED").label).toBe("Thrown away");
        expect(importStatusLabel("VALIDATED").tone).toBe("warning");
    });
});
