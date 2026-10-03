import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api-client", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-client")>();
    return { ...actual, api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() } };
});

import { api, ApiError } from "@/lib/api-client";
import {
    agreementStanding,
    boldParts,
    bookingService,
    refreshSecondsOf,
    renderSchedule,
    signatureWanted,
    signHref,
    signingFromError,
    signingOpen,
    templateText,
    textBlocks,
    withSchedule,
    type CampaignReview,
} from "./booking";
import { insertionOrderChip, insertionOrderSettled } from "@/components/booking/insertion-order";

const mocked = api as unknown as Record<"get" | "post", ReturnType<typeof vi.fn>>;

beforeEach(() => {
    mocked.get.mockReset();
    mocked.post.mockReset();
});

const review = (over: Partial<CampaignReview> = {}): CampaignReview =>
    ({
        campaignId: "c1",
        reference: "ADX-CMP-2026-100001",
        status: "PENDING_PAYMENT",
        lines: [],
        spotsSubtotal: "0",
        feesTotal: "0",
        gstAmount: "0",
        discount: "0",
        total: "25960.00",
        budget: null,
        budgetRemaining: null,
        days: 14,
        creativesUploaded: 0,
        creativesExpected: 0,
        missing: [],
        clashes: [],
        ...over,
    }) as CampaignReview;

describe("paying from the wallet", () => {
    it("authorises on the campaign's own route, and reads the wallet by advertiser", async () => {
        mocked.post.mockResolvedValue({ campaign: {}, review: {}, failedSpots: [], incentive: null, codes: [] });
        await bookingService.authorize("c1");
        expect(mocked.post).toHaveBeenCalledWith("/campaigns/c1/authorize", {});
        mocked.get.mockResolvedValue({ spendable: "1.00" });
        await bookingService.wallet("a1");
        expect(mocked.get).toHaveBeenCalledWith("/advertisers/a1/wallet");
    });

    it("asks ADX to ask Digio where a signature stands", async () => {
        mocked.post.mockResolvedValue({ id: "sr1", status: "COMPLETED" });
        await bookingService.refreshSigning("sr1");
        expect(mocked.post).toHaveBeenCalledWith("/agreements/signing/sr1/refresh", {});
    });
});

describe("the insertion order", () => {
    it("reads the standing and whether a signature is still wanted", () => {
        const r = review({ agreements: [{ kind: "INSERTION_ORDER", accepted: true, templateVersion: 2, currentVersion: 3, current: false }] });
        expect(agreementStanding(r, "INSERTION_ORDER")?.templateVersion).toBe(2);
        expect(agreementStanding(review(), "INSERTION_ORDER")).toBeNull();
        expect(signatureWanted(review({ signing: { required: true, satisfied: false, request: null } }))).toBe(true);
        expect(signatureWanted(review({ signing: { required: true, satisfied: true, request: null } }))).toBe(false);
        expect(signingOpen("PARTIALLY_SIGNED")).toBe(true);
        expect(signingOpen("EXPIRED")).toBe(false);
    });

    it("lets the payment through only on the live version, signed when the policy asks", () => {
        expect(insertionOrderSettled(review())).toBe(true);
        expect(insertionOrderSettled(null)).toBe(false);
        expect(insertionOrderSettled(review({ agreements: [{ kind: "INSERTION_ORDER", accepted: true, templateVersion: 2, currentVersion: 3, current: false }] }))).toBe(false);
        expect(insertionOrderSettled(review({ agreements: [{ kind: "INSERTION_ORDER", accepted: true, templateVersion: 3, currentVersion: 3, current: true }], signing: { required: true, satisfied: false, request: null } }))).toBe(false);
    });

    it("chips the standing in the app's words", () => {
        expect(insertionOrderChip(review({ agreements: [{ kind: "INSERTION_ORDER", accepted: true, templateVersion: 3, currentVersion: 3, current: true }] }))).toEqual({ label: "Accepted · version 3", tone: "success" });
        expect(insertionOrderChip(review({ agreements: [{ kind: "INSERTION_ORDER", accepted: false, templateVersion: null, currentVersion: 3, current: false }] }))!.label).toBe("Not yet accepted");
        expect(insertionOrderChip(review({ signing: { required: true, satisfied: false, request: { id: "sr1", status: "REQUESTED", signingUrl: null, mock: true } } }))!.label).toBe("Awaiting your signature");
        expect(insertionOrderChip(review({ signing: { required: true, satisfied: true, request: null } }))!.label).toBe("Signed");
        expect(insertionOrderChip(review())).toBeNull();
    });

    it("sends the signer to /sign with the way back, and reads the request off a refusal", () => {
        expect(signHref("sr 1", "/advertiser/campaigns/c1/pay")).toBe("/sign/sr%201?next=%2Fadvertiser%2Fcampaigns%2Fc1%2Fpay");
        expect(signingFromError(new ApiError(403, "SIGNATURE_REQUIRED", "Sign first", { signing: { id: "sr9" } }))).toBe("sr9");
        expect(signingFromError(new ApiError(409, "CONFLICT", "x"))).toBeNull();
        expect(signingFromError(new Error("x"))).toBeNull();
    });

    it("prints the schedule where the template asks for it, as the server does", () => {
        const schedule = renderSchedule({ reference: "ADX-CMP-1", name: "Festive", startDate: "2026-10-12T00:00:00Z", endDate: "2026-10-25T00:00:00Z" }, [
            { title: "Whitefield billboard", city: "Bengaluru", ratePerDay: "428.57", days: 14, quantity: 1, lineTotal: "6000.00" },
        ]);
        expect(schedule).toBe("Campaign ADX-CMP-1 — Festive\nFlight: 2026-10-12 to 2026-10-25\n\n1. Whitefield billboard, Bengaluru — ₹428.57/day × 14 days × 1 = ₹6000.00");
        expect(withSchedule("Terms\n\n{{spots}}\n\nEnd", "S")).toBe("Terms\n\nS\n\nEnd");
        expect(withSchedule("Terms", "S")).toBe("Terms\n\n## Sites covered by this insertion order\n\nS");
        expect(withSchedule("Terms", null)).toBe("Terms");
        expect(templateText({ body: null, content: "c" })).toBe("c");
    });

    it("reads the published Markdown into headings, paragraphs and lists", () => {
        expect(textBlocks("# Title\n\nFirst line\nsame paragraph\n\n- one\n- two\n1. first\n\n## Next")).toEqual([
            { type: "heading", level: 1, text: "Title" },
            { type: "paragraph", text: "First line same paragraph" },
            { type: "list", ordered: false, items: ["one", "two"] },
            { type: "list", ordered: true, items: ["first"] },
            { type: "heading", level: 2, text: "Next" },
        ]);
        expect(boldParts("a **b** c")).toEqual([
            { text: "a ", strong: false },
            { text: "b", strong: true },
            { text: " c", strong: false },
        ]);
    });
});

describe("the live feed", () => {
    it("keeps the refresh to whole seconds, five at the least", () => {
        expect(refreshSecondsOf("30")).toBe(30);
        expect(refreshSecondsOf("2")).toBe(5);
        expect(refreshSecondsOf("")).toBe(60);
        expect(refreshSecondsOf("1a0")).toBe(10);
    });
});
