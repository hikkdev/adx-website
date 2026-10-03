/* The jest-dom matchers are wired in vitest.setup.ts; this import is for their types, which tsc reads from here. */
import "@testing-library/jest-dom/vitest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { SigningRequest } from "@/services/agreements";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, replace: vi.fn() }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const service = vi.hoisted(() => ({ signing: vi.fn(), refresh: vi.fn(), mockSign: vi.fn(), file: vi.fn() }));
vi.mock("@/services/agreements", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/services/agreements")>();
    return { ...actual, agreements: { ...actual.agreements, ...service } };
});

import { SigningView } from "./signing-view";

const request = (over: Partial<SigningRequest> = {}): SigningRequest => ({
    id: "sr1",
    kind: "PUBLISHER_LICENCE",
    label: "Licence to display",
    title: "Licence to display — ADX Demo Spaces",
    templateVersion: 1,
    partyType: "publisher",
    partyId: "p1",
    campaignId: null,
    status: "REQUESTED",
    mock: false,
    signer: { name: "Asha Rao", identifier: "asha@example.com", userId: "u1" },
    signers: [],
    signMethod: "AADHAAR",
    signingUrl: "https://ext.digio.in/#/gateway/login/DID1",
    countersign: false,
    files: { document: "f-doc", signed: null, certificate: null },
    requestedAt: "2026-09-20T06:00:00.000Z",
    expiresAt: "2026-10-04T06:00:00.000Z",
    completedAt: null,
    cancelReason: null,
    failureReason: null,
    ...over,
});

beforeEach(() => {
    push.mockReset();
    for (const fn of Object.values(service)) fn.mockReset();
});

describe("DS-1: the signing page", () => {
    it("opens Digio's page in a new tab while the request is open, and offers the document", async () => {
        service.signing.mockResolvedValue(request());
        render(<SigningView requestId="sr1" next="/publisher" agreementsHref="/publisher/agreements" />);
        const open = await screen.findByRole("link", { name: /open and sign/i });
        expect(open).toHaveAttribute("href", "https://ext.digio.in/#/gateway/login/DID1");
        expect(open).toHaveAttribute("target", "_blank");
        expect(open).toHaveAttribute("rel", expect.stringContaining("noopener"));
        expect(screen.getByText("Awaiting your signature")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: /download the document/i })).toBeInTheDocument();
        expect(screen.queryByRole("button", { name: /sign \(mock\)/i })).not.toBeInTheDocument();
    });

    it("signs a mock request from the page and hands back to the page that sent it", async () => {
        service.signing.mockResolvedValue(request({ mock: true, signingUrl: null }));
        service.mockSign.mockResolvedValue(request({ mock: true, status: "COMPLETED", completedAt: "2026-09-26T06:00:00.000Z", files: { document: "f-doc", signed: "f-signed", certificate: null } }));
        render(<SigningView requestId="sr1" next="/publisher" agreementsHref="/publisher/agreements" />);
        fireEvent.click(await screen.findByRole("button", { name: /sign \(mock\)/i }));
        await waitFor(() => expect(push).toHaveBeenCalledWith("/publisher"));
        expect(service.mockSign).toHaveBeenCalledWith("sr1");
        expect(screen.getByText(/every party has signed/i)).toBeInTheDocument();
        expect(screen.getByRole("button", { name: /download my signed copy/i })).toBeInTheDocument();
    });

    it("says an expired link is over and where a fresh one comes from, without handing back", async () => {
        service.signing.mockResolvedValue(request({ status: "EXPIRED" }));
        render(<SigningView requestId="sr1" next="/publisher" agreementsHref="/publisher/agreements" />);
        expect(await screen.findByText("The signing link has expired")).toBeInTheDocument();
        expect(screen.queryByRole("link", { name: /open and sign/i })).not.toBeInTheDocument();
        expect(push).not.toHaveBeenCalled();
    });

    it("opens an already-signed request for its copy, and does not bounce away", async () => {
        service.signing.mockResolvedValue(request({ status: "COMPLETED", completedAt: "2026-09-21T06:00:00.000Z", files: { document: "f-doc", signed: "f-signed", certificate: null } }));
        render(<SigningView requestId="sr1" next="/publisher" agreementsHref="/publisher/agreements" />);
        expect(await screen.findByRole("link", { name: "Continue" })).toHaveAttribute("href", "/publisher");
        expect(push).not.toHaveBeenCalled();
    });

    it("says what went wrong reading the request, with a way to try again", async () => {
        const { ApiError } = await import("@/lib/api-client");
        service.signing.mockRejectedValueOnce(new ApiError(404, "NOT_FOUND", "Signing request not found")).mockResolvedValueOnce(request());
        render(<SigningView requestId="sr1" next={null} agreementsHref="/advertiser/agreements" />);
        expect(await screen.findByText("Signing request not found")).toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: "Try again" }));
        expect(await screen.findByRole("link", { name: /open and sign/i })).toBeInTheDocument();
    });
});
