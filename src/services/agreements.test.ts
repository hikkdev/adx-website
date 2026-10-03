import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api-client", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-client")>();
    return { ...actual, api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() }, apiBlob: vi.fn() };
});

import { api, apiBlob, ApiError } from "@/lib/api-client";
import {
    agreements,
    closedWords,
    inlineParts,
    pdfName,
    platformKindOf,
    platformStandingOf,
    safeNext,
    signersLine,
    signingFromError,
    signingHref,
    signingOpen,
    signingPending,
    signingStatusOf,
    splitSigning,
    textBlocks,
    withSchedule,
    type SigningRequest,
} from "./agreements";

const mocked = api as unknown as Record<"get" | "post", ReturnType<typeof vi.fn>>;

beforeEach(() => {
    mocked.get.mockReset();
    mocked.post.mockReset();
    vi.mocked(apiBlob).mockReset();
});

const request = (over: Partial<SigningRequest> = {}): SigningRequest => ({
    id: "sr1",
    kind: "INSERTION_ORDER",
    label: "Insertion order",
    title: "Insertion order — Aster Festive",
    templateVersion: 2,
    partyType: "advertiser",
    partyId: "a1",
    campaignId: "c1",
    status: "REQUESTED",
    mock: false,
    signer: { name: "Rohan Mehta", identifier: "rohan@example.com", userId: "u1" },
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

describe("the platform terms", () => {
    it("reads the live text, and answers null while nothing is published", async () => {
        mocked.get.mockResolvedValueOnce({ id: "t", kind: "PLATFORM", version: 3, title: "Terms", body: "x" });
        await expect(agreements.current("PLATFORM")).resolves.toMatchObject({ version: 3 });
        expect(mocked.get).toHaveBeenCalledWith("/agreements/current/PLATFORM");
        mocked.get.mockRejectedValueOnce(new ApiError(404, "NO_ACTIVE_TEMPLATE", "No platform agreement is published yet"));
        await expect(agreements.current("ADVERTISER_PLATFORM")).resolves.toBeNull();
        mocked.get.mockRejectedValueOnce(new ApiError(500, "BOOM", "no"));
        await expect(agreements.current("PLATFORM")).rejects.toBeInstanceOf(ApiError);
    });

    it("records a publisher's click through supply with their own id", async () => {
        mocked.get.mockResolvedValueOnce({ id: "pub_1" });
        mocked.post.mockResolvedValueOnce({ id: "acc" });
        await agreements.acceptPlatform("PLATFORM");
        expect(mocked.get).toHaveBeenCalledWith("/publishers/me");
        expect(mocked.post).toHaveBeenCalledWith("/supply/agreements/accept-platform", { publisherId: "pub_1" });
    });

    it("records an advertiser's click on their own route", async () => {
        mocked.get.mockResolvedValueOnce({ id: "adv 1" });
        mocked.post.mockResolvedValueOnce({});
        await agreements.acceptPlatform("ADVERTISER_PLATFORM");
        expect(mocked.get).toHaveBeenCalledWith("/advertisers/me");
        expect(mocked.post).toHaveBeenCalledWith("/advertisers/adv%201/agreements/platform", {});
    });

    it("reads the advertiser's standing off their own acceptance and the eligibility gate", async () => {
        mocked.get.mockImplementation(async (path: string) => {
            if (path === "/advertisers/me") return { id: "a1" };
            if (path === "/agreements/current/ADVERTISER_PLATFORM") return { id: "t", kind: "ADVERTISER_PLATFORM", version: 4, title: "T", body: "" };
            if (path === "/agreements/mine") return [];
            if (path === "/advertisers/a1/eligibility") return { blockedBy: ["PROFILE", "AGREEMENT"] };
            throw new Error(path);
        });
        await expect(agreements.advertiserStanding()).resolves.toMatchObject({ pending: true, accepted: false, acceptedVersion: null, outdated: false });
    });

    it("an advertiser behind the live version, not enforced, is outdated but not pending", async () => {
        mocked.get.mockImplementation(async (path: string) => {
            if (path === "/advertisers/me") return { id: "a1" };
            if (path === "/agreements/current/ADVERTISER_PLATFORM") return { id: "t", kind: "ADVERTISER_PLATFORM", version: 4, title: "T", body: "" };
            if (path === "/agreements/mine") return [{ kind: "ADVERTISER_PLATFORM", templateVersion: 3, acceptedAt: "2026-09-01T00:00:00.000Z", currentVersion: 4, current: false, requiresReacceptance: false }];
            if (path === "/advertisers/a1/eligibility") return { blockedBy: [] };
            throw new Error(path);
        });
        await expect(agreements.advertiserStanding()).resolves.toMatchObject({ pending: false, accepted: true, acceptedVersion: 3, acceptedAt: "2026-09-01T00:00:00.000Z", outdated: true });
    });

    it("reads the publisher's standing off /agreements/mine", async () => {
        mocked.get.mockImplementation(async (path: string) => {
            if (path === "/publishers/me") return { licence: null };
            if (path === "/agreements/mine") return [{ kind: "PLATFORM", templateVersion: 1, acceptedAt: "2026-09-01T00:00:00.000Z", currentVersion: 1, current: true }, { kind: "ADVERTISER_PLATFORM", templateVersion: 9, acceptedAt: "2026-09-02T00:00:00.000Z", current: true }];
            return { id: "t", kind: "PLATFORM", version: 1, title: "T", body: "" };
        });
        await expect(agreements.publisherStanding()).resolves.toMatchObject({ pending: false, accepted: true, acceptedAt: "2026-09-01T00:00:00.000Z", acceptedVersion: 1, outdated: false });
        expect(mocked.get).toHaveBeenCalledWith("/agreements/mine");
    });

    it("the standing rule: never accepted is pending; behind and enforced is pending; behind and not enforced is only outdated", () => {
        const live = { id: "t", kind: "PLATFORM", version: 3, title: "T", body: "" };
        expect(platformStandingOf("PLATFORM", live, null)).toMatchObject({ accepted: false, pending: true, outdated: false });
        expect(platformStandingOf("PLATFORM", live, { kind: "PLATFORM", templateVersion: 2, acceptedAt: "x", current: false, requiresReacceptance: true })).toMatchObject({ pending: true, outdated: true });
        expect(platformStandingOf("PLATFORM", live, { kind: "PLATFORM", templateVersion: 2, acceptedAt: "x", current: false, requiresReacceptance: false })).toMatchObject({ pending: false, outdated: true });
        expect(platformStandingOf("PLATFORM", null, null)).toMatchObject({ pending: false, outdated: false });
    });

    it("gives a print partner no platform kind", () => {
        expect(platformKindOf("PUBLISHER")).toBe("PLATFORM");
        expect(platformKindOf("ADVERTISER")).toBe("ADVERTISER_PLATFORM");
        expect(platformKindOf("PRINT_PARTNER")).toBeNull();
    });
});

describe("e-signing", () => {
    it("reads, refreshes and mock-signs a request by id, lists the person's own, and fetches a private file", async () => {
        mocked.get.mockResolvedValue(request());
        mocked.post.mockResolvedValue(request());
        vi.mocked(apiBlob).mockResolvedValue(new Blob(["%PDF"]));
        await agreements.signing("sr/1");
        await agreements.refresh("sr1");
        await agreements.mockSign("sr1");
        await agreements.mine();
        await agreements.file("f 1");
        expect(mocked.get.mock.calls.map((c) => c[0])).toEqual(["/agreements/signing/sr%2F1", "/agreements/signing/mine"]);
        expect(mocked.post.mock.calls).toEqual([
            ["/agreements/signing/sr1/refresh", {}],
            ["/agreements/signing/sr1/mock-sign", {}],
        ]);
        expect(apiBlob).toHaveBeenCalledWith("/files/f%201");
    });

    it("knows open from closed, and a slice that wants attention", () => {
        expect(signingOpen("REQUESTED")).toBe(true);
        expect(signingOpen("PARTIALLY_SIGNED")).toBe(true);
        expect(signingOpen("COMPLETED")).toBe(false);
        expect(signingPending({ required: true, satisfied: false, status: "REQUESTED", requestId: "r", signingUrl: null, mock: false, expiresAt: null, completedAt: null, signedFileId: null })).toBe(true);
        expect(signingPending({ required: false, satisfied: false, status: null, requestId: null, signingUrl: null, mock: false, expiresAt: null, completedAt: null, signedFileId: null })).toBe(false);
        expect(signingPending(null)).toBe(false);
    });

    it("reads the request off a SIGNATURE_REQUIRED refusal", () => {
        expect(signingFromError(new ApiError(403, "SIGNATURE_REQUIRED", "Sign first", { signing: { id: "sr9" }, kind: "PUBLISHER_LICENCE" }))).toEqual({ requestId: "sr9", kind: "PUBLISHER_LICENCE" });
        expect(signingFromError(new ApiError(403, "FORBIDDEN", "no"))).toBeNull();
    });

    it("splits waiting from past, newest first", () => {
        const rows = [request({ id: "a", status: "COMPLETED", requestedAt: "2026-09-01T00:00:00Z" }), request({ id: "b", requestedAt: "2026-09-02T00:00:00Z" }), request({ id: "c", requestedAt: "2026-09-10T00:00:00Z" }), request({ id: "d", status: "EXPIRED", requestedAt: "2026-09-05T00:00:00Z" })];
        const { open, rest } = splitSigning(rows);
        expect(open.map((r) => r.id)).toEqual(["c", "b"]);
        expect(rest.map((r) => r.id)).toEqual(["d", "a"]);
    });

    it("words each status and each closed ending", () => {
        expect(signingStatusOf("REQUESTED")).toEqual({ label: "Awaiting your signature", tone: "warning" });
        expect(signingStatusOf("FAILED").label).toBe("Declined");
        expect(signingStatusOf("SOMETHING_NEW").label).toBe("something new");
        expect(closedWords(request({ status: "EXPIRED" })).title).toBe("The signing link has expired");
        expect(closedWords(request({ status: "CANCELLED", cancelReason: "Campaign changed" })).text).toBe("Campaign changed. ADX sends a fresh document when it is ready.");
        expect(closedWords(request({ status: "FAILED", failureReason: "Declined on Digio" })).text).toMatch(/^Declined on Digio\. /);
        expect(signersLine([{ role: "PARTY", name: "Rohan", identifier: "x", status: "signed", signedAt: null }, { role: "ADX", name: "ADX", identifier: "y", status: "requested", signedAt: null }])).toBe("Rohan: signed · ADX: awaiting");
    });

    it("names the downloaded copy", () => {
        expect(pdfName("Insertion order — Aster Festive", true)).toBe("Insertion_order_Aster_Festive_signed.pdf");
        expect(pdfName("  ", false)).toBe("agreement.pdf");
    });
});

describe("the way back", () => {
    it("takes only a path on this site", () => {
        expect(safeNext("/advertiser/campaigns/c1/pay", "/x")).toBe("/advertiser/campaigns/c1/pay");
        expect(safeNext(null, "/x")).toBe("/x");
        expect(safeNext("https://evil.example", "/x")).toBe("/x");
        expect(safeNext("//evil.example", "/x")).toBe("/x");
        expect(safeNext("/\\evil.example", "/x")).toBe("/x");
        expect(safeNext("javascript:alert(1)", "/x")).toBe("/x");
    });

    it("builds the link other pages send people to", () => {
        expect(signingHref("sr1", "/publisher")).toBe("/sign/sr1?next=%2Fpublisher");
        expect(signingHref("sr 1")).toBe("/sign/sr%201");
    });
});

describe("the agreement text", () => {
    it("reads headings, paragraphs, lists and rules", () => {
        const body = "# ADX terms\n\nThis agreement covers\nwhat you book.\n\n## Sites\n- Verified by an agent\n- Replaced if they lapse\n  with credit\n1. One\n2. Two\n\n---\nEnd.";
        expect(textBlocks(body)).toEqual([
            { type: "heading", level: 1, text: "ADX terms" },
            { type: "paragraph", text: "This agreement covers what you book." },
            { type: "heading", level: 2, text: "Sites" },
            { type: "list", ordered: false, items: ["Verified by an agent", "Replaced if they lapse with credit"] },
            { type: "list", ordered: true, items: ["One", "Two"] },
            { type: "rule" },
            { type: "paragraph", text: "End." },
        ]);
        expect(textBlocks("#### Deep ###")).toEqual([{ type: "heading", level: 3, text: "Deep" }]);
        expect(textBlocks("")).toEqual([]);
    });

    it("keeps <tags> as text and marks bold and italic", () => {
        expect(inlineParts("Read **this** and *that* <b>here</b>")).toEqual([{ text: "Read " }, { text: "this", strong: true }, { text: " and " }, { text: "that", em: true }, { text: " <b>here</b>" }]);
    });

    it("prints the schedule where the template asks for it, else appends it", () => {
        expect(withSchedule("Sites: {{spots}}", "1. MG Road")).toBe("Sites: 1. MG Road");
        expect(withSchedule("Body", "1. MG Road")).toBe("Body\n\n## Sites covered by this insertion order\n\n1. MG Road");
        expect(withSchedule("Body", null)).toBe("Body");
    });
});
