/* The jest-dom matchers are wired in vitest.setup.ts; this import is for their types, which tsc reads from here. */
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { tokens } from "@/lib/api-client";
import { apiConfig } from "@/lib/api-config";
import type { Listing, ListingDocument } from "@/services/listing-editor";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { toast } from "sonner";
import { formFromListing, PRIVATE_DOCUMENT_NAME } from "./form-model";
import { DocumentsStep } from "./steps-review";
import { EvidenceRow, FileRow } from "./uploads";

/**
 * ST-2 (28 Sep 2026) on the edit pages: a listing's venue papers come back
 * from `GET /supply/listings/:id/documents` as private files
 * (`/api/v1/files/:id`). The documents page names them readably, opens them
 * with the bearer (never a bare link, which is a 401), still opens a paper
 * filed before the move by its public URL, and says a refusal.
 */

const PRIVATE_AGREEMENT = "https://api.adx.in/api/v1/files/cm_agree1";
const PUBLIC_RC = "https://cdn.adx.in/uploads/verification/rc-front.pdf";

const doc = (id: string, kind: ListingDocument["kind"], url: string): ListingDocument =>
    ({ id, listingId: "lst_1", kind, url, status: "PENDING", rejectionReason: null, submittedAt: "2026-09-27T10:00:00Z", reviewedAt: null }) as ListingDocument;

const listing = (category: Listing["category"]): Listing =>
    ({ id: "lst_1", category, title: "Mall atrium", latitude: null, longitude: null, photos: [], status: "ACTIVE" }) as unknown as Listing;

function stubFetch(status = 200) {
    const calls: { url: string; init: RequestInit }[] = [];
    vi.stubGlobal(
        "fetch",
        vi.fn(async (url: string, init: RequestInit) => {
            calls.push({ url, init });
            if (status !== 200) return new Response(JSON.stringify({ success: false, error: { code: "FORBIDDEN", message: "Not yours" } }), { status, headers: { "Content-Type": "application/json" } });
            return new Response("%PDF-1.7", { status: 200, headers: { "Content-Type": "application/pdf" } });
        })
    );
    return calls;
}

beforeEach(() => {
    tokens.set({ accessToken: "acc-publisher" });
    URL.createObjectURL = vi.fn(() => "blob:https://adx.in/paper");
    URL.revokeObjectURL = vi.fn();
    vi.mocked(toast.error).mockClear();
});

afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    tokens.clear();
});

describe("the venue documents page", () => {
    it("names a private paper readably and opens it with the publisher's bearer", async () => {
        const calls = stubFetch();
        const open = vi.spyOn(window, "open").mockReturnValue({ opener: null } as unknown as Window);
        const form = formFromListing(listing("INDOOR"), [], [doc("d1", "DISPLAY_AGREEMENT", PRIVATE_AGREEMENT)]);
        expect(form.documents.displayAgreement).toEqual({ url: PRIVATE_AGREEMENT, name: PRIVATE_DOCUMENT_NAME });

        render(<DocumentsStep form={form} set={vi.fn()} catalogue={null} />);
        expect(screen.getByText(PRIVATE_DOCUMENT_NAME)).toBeInTheDocument();
        expect(screen.queryByRole("link", { name: /view/i })).not.toBeInTheDocument();

        fireEvent.click(screen.getByRole("button", { name: "View" }));
        await vi.waitFor(() => expect(open).toHaveBeenCalledWith("blob:https://adx.in/paper", "_blank"));
        expect(calls).toHaveLength(1);
        expect(calls[0]!.url).toBe(`${apiConfig.baseUrl}/files/cm_agree1`);
        expect(new Headers(calls[0]!.init.headers).get("Authorization")).toBe("Bearer acc-publisher");
    });

    it("still links a paper filed before the move by its public URL, with no request", () => {
        const calls = stubFetch();
        const form = formFromListing(listing("TRANSIT"), [], [doc("d2", "VEHICLE_RC", PUBLIC_RC)]);
        render(<DocumentsStep form={form} set={vi.fn()} catalogue={null} />);
        const link = screen.getByRole("link", { name: "rc-front.pdf" });
        expect(link).toHaveAttribute("href", PUBLIC_RC);
        expect(calls).toHaveLength(0);
    });

    it("says \"You can't open this file.\" when ADX refuses", async () => {
        stubFetch(403);
        const form = formFromListing(listing("TRANSIT"), [], [doc("d3", "VEHICLE_RC", "https://api.adx.in/api/v1/files/cm_rc2")]);
        render(<DocumentsStep form={form} set={vi.fn()} catalogue={null} />);
        fireEvent.click(screen.getByRole("button", { name: PRIVATE_DOCUMENT_NAME }));
        await vi.waitFor(() => expect(toast.error).toHaveBeenCalledWith("You can't open this file."));
    });
});

describe("the other rows a paper sits in", () => {
    it("the file row and the audience report's row open a private file through the bearer too", async () => {
        const calls = stubFetch();
        vi.spyOn(window, "open").mockReturnValue({ opener: null } as unknown as Window);
        const { container } = render(
            <div>
                <FileRow file={{ url: "https://api.adx.in/api/v1/files/cm_fix1", name: "corrected-noc.pdf" }} />
                <EvidenceRow title="Footfall audit report" meta="PDF or image" file={{ url: "https://api.adx.in/api/v1/files/cm_foot1", name: PRIVATE_DOCUMENT_NAME }} onChange={vi.fn()} />
            </div>
        );
        expect(container.querySelector('a[href*="/files/"]')).toBeNull();
        fireEvent.click(screen.getByRole("button", { name: "corrected-noc.pdf" }));
        await vi.waitFor(() => expect(calls).toHaveLength(1));
        const row = screen.getByText("Footfall audit report").closest("div")!.parentElement!;
        fireEvent.click(within(row).getByRole("button", { name: "View" }));
        await vi.waitFor(() => expect(calls).toHaveLength(2));
        expect(calls.map((call) => call.url)).toEqual([`${apiConfig.baseUrl}/files/cm_fix1`, `${apiConfig.baseUrl}/files/cm_foot1`]);
    });
});
