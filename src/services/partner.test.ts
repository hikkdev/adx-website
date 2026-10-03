import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api-client", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-client")>();
    return {
        ...actual,
        api: { get: vi.fn(async () => ({})), post: vi.fn(async () => ({})), put: vi.fn(async () => ({})), patch: vi.fn(async () => ({})), delete: vi.fn(async () => ({})) },
        apiBlob: vi.fn(async () => new Blob(["x"])),
    };
});

import { api, apiBlob, ApiError } from "@/lib/api-client";
import {
    applicationBody,
    applicationFormOf,
    applicationSent,
    appliedOn,
    bookingRefOf,
    countdown,
    creditedThisMonth,
    creditFor,
    deadlinePassed,
    declineProblem,
    entryLabel,
    filePath,
    formatDay,
    formatWhen,
    isApplicant,
    isPrivatePath,
    jobMoves,
    jobRef,
    kycBanner,
    kycStanding,
    kycStandingWords,
    kycSummaryOf,
    ladderSteps,
    listQuery,
    monthKey,
    monthLabel,
    partnerMessage,
    partnerService,
    profilePatch,
    quoteBody,
    quoteEditable,
    rateCardBody,
    rateRowOf,
    readable,
    recentMonths,
    requestOutcome,
    requestRef,
    shopNameOf,
    signHref,
    signingFromError,
    signingPending,
    sortJobs,
    sortRequests,
    specRows,
    specSummary,
    standingQuote,
    withdrawBlocker,
    withdrawProblem,
    emptyRateDraft,
    type LedgerEntry,
    type PartnerAllowance,
    type PartnerProfile,
    type PrintJob,
    type QuoteRequest,
} from "./partner";
import type { PayoutMethod } from "./publisher-workspace";

const mocked = api as unknown as Record<"get" | "post" | "put" | "patch" | "delete", ReturnType<typeof vi.fn>>;

beforeEach(() => {
    for (const fn of Object.values(mocked)) fn.mockClear();
    vi.mocked(apiBlob).mockClear();
});

const partner = (over: Partial<PartnerProfile> = {}): PartnerProfile => ({
    id: "pp1",
    displayId: "PRT-2209-2601",
    userId: "u1",
    name: "Rapid Prints",
    legalName: null,
    gstin: null,
    panNumber: null,
    contactName: null,
    mobile: "+919654321780",
    email: null,
    address: "12, 5th Cross",
    city: "Bengaluru",
    latitude: null,
    longitude: null,
    capabilities: ["Flex banners"],
    maxWidthFt: null,
    turnaroundDays: 2,
    isActive: true,
    activatedAt: "2026-09-22T00:00:00.000Z",
    acceptsQuoteRequests: true,
    rateCard: { hasRateCard: false, fileId: null, fileUrl: null, updatedAt: null, rows: [] },
    invoiceUploadFileId: null,
    createdAt: "2026-09-21T00:00:00.000Z",
    updatedAt: "2026-09-22T00:00:00.000Z",
    ...over,
});

const job = (over: Partial<PrintJob> = {}): PrintJob => ({
    id: "j1",
    orderId: "cmu9j958y00fwlwvv8skpeoj0",
    printPartnerId: "pp1",
    status: "REQUESTED",
    quotedCost: "4200.00",
    actualCost: null,
    specs: { material: "Flex", widthFt: 20 },
    requestedAt: "2026-09-25T04:30:00.000Z",
    readyAt: null,
    collectedAt: null,
    costApprovedAt: null,
    notes: null,
    partnerAcceptedAt: null,
    partnerDeclinedAt: null,
    declineReason: null,
    awardedQuoteId: null,
    handoverConfirmedAt: null,
    handoverQrId: null,
    createdAt: "2026-09-25T04:30:00.000Z",
    updatedAt: "2026-09-25T04:30:00.000Z",
    order: null,
    ...over,
});

const request = (over: Partial<QuoteRequest> = {}): QuoteRequest => ({
    id: "r1",
    orderId: "cmu5tqg1l002mrsvvlky8fl3l",
    specs: { material: "Vinyl", size: "10x20 ft" },
    city: "Bengaluru",
    deadlineAt: "2026-09-27T12:00:00.000Z",
    status: "OPEN",
    awarded: false,
    reinvitedAt: null,
    myQuote: null,
    createdAt: "2026-09-25T12:00:00.000Z",
    ...over,
});

const NOW = new Date("2026-09-26T12:00:00.000Z").getTime();

describe("the partner's routes", () => {
    it("reads and writes the partner's own row", async () => {
        await partnerService.me();
        expect(mocked.get).toHaveBeenCalledWith("/print-partners/me");
        await partnerService.updateMe({ acceptsQuoteRequests: false });
        expect(mocked.patch).toHaveBeenCalledWith("/print-partners/me", { acceptsQuoteRequests: false });
        await partnerService.completeApplication({ name: "Rapid Prints", city: "Bengaluru" });
        expect(mocked.post).toHaveBeenCalledWith("/print-partners/me/application", { name: "Rapid Prints", city: "Bengaluru" });
        await partnerService.setRateCard({ fileId: null, rows: [{ material: "Flex", unit: "sq ft", ratePerUnit: "12.00" }] });
        expect(mocked.put).toHaveBeenCalledWith("/print-partners/me/rate-card", { fileId: null, rows: [{ material: "Flex", unit: "sq ft", ratePerUnit: "12.00" }] });
    });

    it("finds the job behind an ORDER notice by its order (26 Sep 2026)", async () => {
        mocked.get.mockResolvedValueOnce({ items: [{ id: "job_9", orderId: "ord 1" }], total: 1, page: 1, pageSize: 1, counts: {} });
        await expect(partnerService.jobForOrder("ord 1")).resolves.toMatchObject({ id: "job_9" });
        expect(mocked.get).toHaveBeenCalledWith("/print-partners/me/jobs?orderId=ord%201&pageSize=1");
        mocked.get.mockResolvedValueOnce({ items: [], total: 0, page: 1, pageSize: 1, counts: {} });
        await expect(partnerService.jobForOrder("ord_2")).resolves.toBeNull();
    });

    it("prints the day the shop applied, and nothing for a desk-created shop", () => {
        expect(appliedOn({ appliedAt: "2026-09-26T06:00:00.000Z" })).toBe("26 Sept 2026");
        expect(appliedOn({ appliedAt: null })).toBeNull();
        expect(appliedOn({})).toBeNull();
    });

    it("walks a job through the floor's moves", async () => {
        await partnerService.jobs({ status: ["READY", "PRINTING"], pageSize: 100 });
        expect(mocked.get).toHaveBeenCalledWith("/print-partners/me/jobs?status=READY,PRINTING&pageSize=100");
        await partnerService.job("j 1");
        expect(mocked.get).toHaveBeenCalledWith("/print-partners/me/jobs/j%201");
        await partnerService.acceptJob("j1");
        expect(mocked.post).toHaveBeenCalledWith("/print-partners/me/jobs/j1/accept");
        await partnerService.declineJob("j1", "No capacity");
        expect(mocked.post).toHaveBeenCalledWith("/print-partners/me/jobs/j1/decline", { reason: "No capacity" });
        await partnerService.markPrinting("j1");
        expect(mocked.post).toHaveBeenCalledWith("/print-partners/me/jobs/j1/printing");
        await partnerService.markReady("j1");
        expect(mocked.post).toHaveBeenCalledWith("/print-partners/me/jobs/j1/ready");
        await partnerService.handover("j1", "  token.abc  ");
        expect(mocked.post).toHaveBeenCalledWith("/print-partners/me/jobs/j1/handover", { qrToken: "token.abc" });
    });

    it("quotes, withdraws and reads one request", async () => {
        await partnerService.quoteRequests({ status: ["OPEN"], pageSize: 50 });
        expect(mocked.get).toHaveBeenCalledWith("/print-partners/me/quote-requests?status=OPEN&pageSize=50");
        await partnerService.quoteRequest("r1");
        expect(mocked.get).toHaveBeenCalledWith("/print-partners/me/quote-requests/r1");
        await partnerService.submitQuote("r1", { amount: "4200.00", turnaroundDays: 3, note: null });
        expect(mocked.post).toHaveBeenCalledWith("/print-partners/me/quote-requests/r1/quotes", { amount: "4200.00", turnaroundDays: 3, note: null });
        await partnerService.withdrawQuote("r1");
        expect(mocked.delete).toHaveBeenCalledWith("/print-partners/me/quote-requests/r1/quotes");
    });

    it("reads the wallet and asks for money the way the app does", async () => {
        await partnerService.earnings();
        expect(mocked.get).toHaveBeenCalledWith("/print-partners/me/earnings?limit=50");
        await partnerService.earnings({ limit: 20, cursor: "a b" });
        expect(mocked.get).toHaveBeenCalledWith("/print-partners/me/earnings?limit=20&cursor=a%20b");
        await partnerService.earningsSummary();
        expect(mocked.get).toHaveBeenCalledWith("/print-partners/me/earnings/summary");
        await partnerService.requestWithdrawal({ amount: "500.00", payoutMethodId: "m1" });
        expect(mocked.post).toHaveBeenCalledWith("/print-partners/me/withdrawals", { amount: "500.00", payoutMethodId: "m1" });
        await partnerService.payoutMethods();
        expect(mocked.get).toHaveBeenCalledWith("/print-partners/me/payout-methods");
        await partnerService.addPayoutMethod({ type: "UPI", upiVpa: "shop@okhdfc" });
        expect(mocked.post).toHaveBeenCalledWith("/print-partners/me/payout-methods", { type: "UPI", upiVpa: "shop@okhdfc" });
        await partnerService.ifsc(" hdfc0001234 ");
        expect(mocked.get).toHaveBeenCalledWith("/payouts/ifsc/HDFC0001234");
    });

    it("uploads a private file under the partner's purpose, then records the invoice", async () => {
        const file = new File(["%PDF"], "sep.pdf", { type: "application/pdf" });
        await partnerService.upload(file, "PARTNER_INVOICE");
        const [path, form] = mocked.post.mock.calls.at(-1)!;
        expect(path).toBe("/upload");
        expect((form as FormData).get("purpose")).toBe("PARTNER_INVOICE");
        expect(((form as FormData).get("file") as File).name).toBe("sep.pdf");
        await partnerService.uploadInvoice({ fileId: "f1", month: "2026-08" });
        expect(mocked.post).toHaveBeenCalledWith("/print-partners/me/invoices", { fileId: "f1", month: "2026-08" });
        await partnerService.invoices();
        expect(mocked.get).toHaveBeenCalledWith("/print-partners/me/invoices");
        await partnerService.file("/api/v1/files/f1");
        expect(apiBlob).toHaveBeenCalledWith("/files/f1");
    });

    it("builds the list query by hand", () => {
        expect(listQuery()).toBe("");
        expect(listQuery({ status: [], page: 2 })).toBe("?page=2");
    });
});

describe("files", () => {
    it("turns any file address into the client's path", () => {
        expect(filePath("/api/v1/files/f1")).toBe("/files/f1");
        expect(filePath("http://localhost:3000/api/v1/files/f1")).toBe("/files/f1");
        expect(filePath("/files/f1")).toBe("/files/f1");
        expect(filePath("f1")).toBe("/files/f1");
    });

    it("tells a private path from a public picture", () => {
        expect(isPrivatePath("/api/v1/files/f1")).toBe(true);
        expect(isPrivatePath("https://api.adx.in/api/v1/files/f1")).toBe(true);
        expect(isPrivatePath("https://cdn.adx.in/creatives/a.jpg")).toBe(false);
        expect(isPrivatePath(null)).toBe(false);
    });
});

describe("errors", () => {
    it("rewrites the codes that have a clearer sentence on this side of the counter", () => {
        expect(partnerMessage(new ApiError(503, "FEATURE_OFF", "This feature is switched off"), "x")).toMatch(/switched this part of the print floor off/);
        expect(partnerMessage(new ApiError(409, "PICKUP_CODE_MISMATCH", "That pickup code is not for this order."), "x")).toMatch(/different order/);
        expect(partnerMessage(new ApiError(409, "CONFLICT", "This job is already accepted."), "x")).toBe("This job is already accepted.");
        expect(partnerMessage(new Error("boom"), "Could not reach ADX.")).toBe("Could not reach ADX.");
    });

    it("carries the rewritten sentence through a loader", async () => {
        await expect(readable(Promise.reject(new ApiError(503, "FEATURE_OFF", "off")), "fallback")).rejects.toMatchObject({ code: "FEATURE_OFF", message: expect.stringMatching(/print floor off/) });
        await expect(readable(Promise.reject(new Error("x")), "fallback")).rejects.toMatchObject({ message: "fallback" });
        await expect(readable(Promise.resolve(3), "fallback")).resolves.toBe(3);
    });

    it("reads the signing request off a SIGNATURE_REQUIRED refusal", () => {
        expect(signingFromError(new ApiError(403, "SIGNATURE_REQUIRED", "Sign first", { signing: { id: "sr1" }, kind: "PRINT_PARTNER_SERVICE" }))).toEqual({ requestId: "sr1" });
        expect(signingFromError(new ApiError(403, "SIGNATURE_REQUIRED", "Sign first", { signing: null }))).toEqual({ requestId: null });
        expect(signingFromError(new ApiError(409, "CONFLICT", "No"))).toBeNull();
        expect(signHref("sr 1", "/partner/jobs/j1")).toBe("/sign/sr%201?next=%2Fpartner%2Fjobs%2Fj1");
    });

    it("asks for a signature only when one is required and missing", () => {
        const slice = { required: true, satisfied: false, status: "REQUESTED", requestId: "sr1", signingUrl: null, mock: false, expiresAt: null, completedAt: null, signedFileId: null };
        expect(signingPending(slice)).toBe(true);
        expect(signingPending({ ...slice, satisfied: true })).toBe(false);
        expect(signingPending({ ...slice, required: false })).toBe(false);
        expect(signingPending(undefined)).toBe(false);
    });
});

describe("the application", () => {
    it("reads an activated partner as on the floor and an unactivated one as an application", () => {
        expect(isApplicant(partner())).toBe(false);
        expect(isApplicant(partner({ activatedAt: null }))).toBe(true);
        expect(applicationSent(partner())).toBe(true);
        expect(applicationSent(partner({ address: " ", city: "Bengaluru" }))).toBe(false);
    });

    it("does not offer the mobile the party choice wrote as the shop's name", () => {
        expect(shopNameOf(partner({ name: "+919654321780" }))).toBe("");
        expect(shopNameOf(partner())).toBe("Rapid Prints");
        expect(applicationFormOf(partner({ name: "+919654321780", acceptsQuoteRequests: false })).pricing).toBe("RATE_CARD");
    });

    it("sends the details the app sends, upper-casing the tax ids", () => {
        const form = { ...applicationFormOf(partner()), gstin: "29abcde1234f1z5", pan: "abcde1234f", legalName: " ", turnaround: "3", pricing: "QUOTES" as const };
        expect(applicationBody(form)).toEqual({
            body: { name: "Rapid Prints", legalName: null, gstin: "29ABCDE1234F1Z5", panNumber: "ABCDE1234F", contactName: null, address: "12, 5th Cross", city: "Bengaluru", state: null, postalCode: null, capabilities: ["Flex banners"], turnaroundDays: 3, acceptsQuoteRequests: true },
        });
    });

    it("sends the shop's state and PIN, and the coordinates only as a pair", () => {
        const base = applicationFormOf(partner());
        expect(applicationBody({ ...base, state: " Karnataka ", postalCode: "560034", latitude: 12.93, longitude: 77.62 })).toMatchObject({ body: { state: "Karnataka", postalCode: "560034", latitude: 12.93, longitude: 77.62 } });
        const half = applicationBody({ ...base, latitude: 12.93, longitude: null });
        expect("body" in half && half.body).not.toHaveProperty("latitude");
        expect(applicationBody({ ...base, postalCode: "060034" })).toEqual({ problem: "A PIN code is six digits, like 560001." });
    });

    it("says what is wrong before the server does", () => {
        const base = applicationFormOf(partner());
        expect(applicationBody({ ...base, city: "" })).toEqual({ problem: "The shop name, address and city are needed." });
        expect(applicationBody({ ...base, gstin: "29ABC" })).toMatchObject({ problem: expect.stringMatching(/GSTIN/) });
        expect(applicationBody({ ...base, pan: "12345" })).toMatchObject({ problem: expect.stringMatching(/PAN/) });
        expect(applicationBody({ ...base, turnaround: "400" })).toMatchObject({ problem: expect.stringMatching(/turnaround/) });
    });

    it("patches only what the partner may change", () => {
        const result = profilePatch({ contactName: "Ravi", email: "", address: "12, 5th Cross", city: "Bengaluru", state: "Karnataka", postalCode: "560034", capabilities: ["Flex banners", " "], maxWidth: "12.5", turnaround: "" });
        expect(result).toEqual({ body: { contactName: "Ravi", email: null, address: "12, 5th Cross", city: "Bengaluru", state: "Karnataka", postalCode: "560034", capabilities: ["Flex banners"], maxWidthFt: "12.50", turnaroundDays: null } });
        expect(profilePatch({ contactName: "", email: "not-an-email", address: "", city: "", state: "", postalCode: "", capabilities: [], maxWidth: "", turnaround: "" })).toMatchObject({ problem: expect.stringMatching(/email/) });
        expect(profilePatch({ contactName: "", email: "", address: "", city: "", state: "", postalCode: "", capabilities: [], maxWidth: "0", turnaround: "" })).toMatchObject({ problem: expect.stringMatching(/widest/i) });
        expect(profilePatch({ contactName: "", email: "", address: "", city: "", state: "", postalCode: "5600", capabilities: [], maxWidth: "", turnaround: "" })).toMatchObject({ problem: expect.stringMatching(/PIN/) });
    });
});

describe("KYC standing", () => {
    it("tells nothing-yet, asked-for and with-the-desk apart", () => {
        expect(kycStanding(null)).toBe("NONE");
        expect(kycStanding({ status: "PENDING", submittedAt: null, requestedAt: null })).toBe("NONE");
        expect(kycStanding({ status: "PENDING", submittedAt: null, requestedAt: "2026-09-20" })).toBe("REQUESTED");
        expect(kycStanding({ status: "PENDING", submittedAt: "2026-09-20", requestedAt: null })).toBe("PENDING");
        expect(kycStandingWords("REQUESTED").label).toBe("Requested by ADX");
        expect(kycSummaryOf({ kycStatus: "PENDING", kyc: null })).toBeNull();
        expect(kycSummaryOf({ kycStatus: "NEEDS_INFO", kyc: null })).toEqual({ status: "NEEDS_INFO", submittedAt: null, requestedAt: null });
    });

    it("reads the desk's party state when the row carries it (N3-B), and a missing record as nothing yet", () => {
        const awaiting = { state: "AWAITING_DOCUMENTS", status: null, submittedAt: null, requestedAt: null, method: null, requestedChannel: null };
        expect(kycStanding(awaiting)).toBe("NONE");
        expect(kycStandingWords(kycStanding(awaiting))).toEqual({ label: "Not started", tone: "warning" });
        expect(kycStanding({ ...awaiting, state: "REQUESTED", requestedAt: "2026-09-20" })).toBe("REQUESTED");
        expect(kycStanding({ ...awaiting, state: "NEEDS_INFO", status: "NEEDS_INFO" })).toBe("NEEDS_INFO");
        expect(kycStanding({ status: null, submittedAt: null, requestedAt: null })).toBe("NONE");
        expect(kycBanner({ kycStatus: "PENDING", kyc: awaiting })?.body).toMatch(/Verify the shop once/);
    });

    it("draws the banner until the shop is verified", () => {
        expect(kycBanner({ kycStatus: "VERIFIED", kyc: null })).toBeNull();
        expect(kycBanner({ kycStatus: undefined, kyc: undefined })).toBeNull();
        expect(kycBanner({ kycStatus: "NEEDS_INFO", kyc: null })?.body).toMatch(/flagged/);
        expect(kycBanner({ kycStatus: "PENDING", kyc: { status: "PENDING", submittedAt: "2026-09-20", requestedAt: null, method: "MANUAL" } })?.body).toMatch(/with ADX/);
    });
});

describe("jobs", () => {
    it("names the booking by its BKG id, or the six characters the notices use", () => {
        expect(bookingRefOf("cmu9j958y00fwlwvv8skpeoj0", "BKG-2609-2601")).toBe("BKG-2609-2601");
        expect(bookingRefOf("cmu9j958y00fwlwvv8skpeoj0")).toBe("BKG-KPEOJ0");
        expect(jobRef(job())).toBe("BKG-KPEOJ0");
        expect(jobRef(job({ order: { id: "o", displayId: "BKG-2609-2601", status: "PENDING_PRINT", campaignName: null, startDate: null, endDate: null, artwork: null, site: { id: "s", title: "t", address: "a", city: null, latitude: null, longitude: null, size: null }, agent: null } }))).toBe("BKG-2609-2601");
        expect(requestRef(request({ orderDisplayId: "BKG-1709-2611" }))).toBe("BKG-1709-2611");
    });

    it("offers only the moves the rung allows", () => {
        expect(jobMoves("REQUESTED")).toEqual({ accept: true, decline: true, printing: false, ready: false, handover: false });
        expect(jobMoves("ACCEPTED")).toEqual({ accept: false, decline: true, printing: true, ready: false, handover: false });
        expect(jobMoves("PRINTING")).toEqual({ accept: false, decline: false, printing: false, ready: true, handover: false });
        expect(jobMoves("READY").handover).toBe(true);
        expect(Object.values(jobMoves("COLLECTED")).some(Boolean)).toBe(false);
    });

    it("draws the ladder from the status", () => {
        expect(ladderSteps(job({ status: "PRINTING" })).map((s) => s.state)).toEqual(["done", "done", "current", "todo", "todo"]);
        expect(ladderSteps(job({ status: "COLLECTED", collectedAt: "2026-09-26T05:00:00.000Z" })).every((s) => s.state === "done")).toBe(true);
        expect(ladderSteps(job({ status: "CANCELLED" })).map((s) => s.state)).toEqual(["done", "todo", "todo", "todo", "todo"]);
        expect(ladderSteps(job({ status: "COLLECTED", collectedAt: "2026-09-26T05:00:00.000Z" }))[4]!.detail).toMatch(/recorded by the agent/);
    });

    it("sorts the shop's own moves first", () => {
        const sorted = sortJobs([job({ id: "ready", status: "READY", updatedAt: "2026-09-26T00:00:00Z" }), job({ id: "new", status: "REQUESTED", updatedAt: "2026-09-20T00:00:00Z" })]);
        expect(sorted.map((j) => j.id)).toEqual(["new", "ready"]);
    });

    it("wants a reason to decline", () => {
        expect(declineProblem("no")).toMatch(/Say why/);
        expect(declineProblem("No capacity this week")).toBeNull();
    });

    it("finds the wallet's credit for the order", () => {
        const entries: LedgerEntry[] = [
            { id: "e1", type: "PAYOUT", amount: "-100.00", balanceAfter: "0.00", orderId: "cmu9j958y00fwlwvv8skpeoj0", reference: null, note: null, createdAt: "2026-09-25" },
            { id: "e2", type: "EARNING", amount: "3780.00", balanceAfter: "3780.00", orderId: "cmu9j958y00fwlwvv8skpeoj0", reference: null, note: null, createdAt: "2026-09-26" },
        ];
        expect(creditFor(job(), entries)?.id).toBe("e2");
        expect(creditFor(job(), null)).toBeNull();
    });

    it("prints the specs as rows", () => {
        expect(specRows({ widthFt: 20, finish_type: "matte", empty: "", nested: { a: 1 } })).toEqual([
            { key: "Width ft", value: "20" },
            { key: "Finish type", value: "matte" },
            { key: "Nested", value: '{"a":1}' },
        ]);
        expect(specSummary({})).toBe("Print specs attached");
        expect(specSummary({ material: "Vinyl", qty: 2 })).toBe("material Vinyl · qty 2");
    });
});

describe("quote requests", () => {
    it("counts down to the deadline", () => {
        expect(countdown("2026-09-26T12:30:00.000Z", NOW)).toBe("30 min left");
        expect(countdown("2026-09-26T15:10:00.000Z", NOW)).toBe("3 h 10 min left");
        expect(countdown("2026-09-28T13:00:00.000Z", NOW)).toBe("2 days 1 h left");
        expect(countdown("2026-09-26T11:00:00.000Z", NOW)).toBe("Closed");
        expect(deadlinePassed("nonsense", NOW)).toBe(true);
    });

    it("says where a request stands for this shop", () => {
        expect(requestOutcome(request(), NOW)).toEqual({ label: "Quote wanted", tone: "warning" });
        const quote = { id: "q1", requestId: "r1", printPartnerId: "pp1", amount: "4200.00", turnaroundDays: 3, note: null, status: "SUBMITTED" as const, submittedAt: "2026-09-26" };
        expect(requestOutcome(request({ myQuote: quote }), NOW).label).toBe("Quoted");
        expect(requestOutcome(request({ deadlineAt: "2026-09-26T00:00:00.000Z" }), NOW).label).toBe("Closed");
        expect(requestOutcome(request({ status: "AWARDED", awarded: true }), NOW).label).toBe("Awarded to you");
        expect(requestOutcome(request({ status: "AWARDED" }), NOW).label).toBe("Not awarded");
        expect(requestOutcome(request({ status: "EXPIRED" }), NOW).label).toBe("Expired");
    });

    it("keeps the form open only while a quote can still be sent", () => {
        const quote = { id: "q1", requestId: "r1", printPartnerId: "pp1", amount: "4200.00", turnaroundDays: 3, note: null, status: "SUBMITTED" as const, submittedAt: "2026-09-26" };
        expect(quoteEditable(request(), NOW)).toBe(true);
        expect(quoteEditable(request({ myQuote: quote }), NOW)).toBe(true);
        expect(quoteEditable(request({ myQuote: { ...quote, status: "ACCEPTED" } }), NOW)).toBe(false);
        expect(quoteEditable(request({ deadlineAt: "2026-09-26T00:00:00.000Z" }), NOW)).toBe(false);
        expect(standingQuote(request({ myQuote: { ...quote, status: "WITHDRAWN" } }))).toBeNull();
    });

    it("sorts open requests by the nearest deadline, the rest newest first", () => {
        const sorted = sortRequests(
            [
                request({ id: "late", deadlineAt: "2026-09-30T00:00:00Z" }),
                request({ id: "done", status: "AWARDED", createdAt: "2026-09-01T00:00:00Z" }),
                request({ id: "soon", deadlineAt: "2026-09-27T00:00:00Z" }),
            ],
            NOW
        );
        expect(sorted.map((r) => r.id)).toEqual(["soon", "late", "done"]);
    });

    it("builds the quote from what was typed", () => {
        expect(quoteBody({ amount: "4,200", turnaround: "3", note: "  " })).toEqual({ body: { amount: "4200.00", turnaroundDays: 3, note: null } });
        expect(quoteBody({ amount: "0", turnaround: "3", note: "" })).toMatchObject({ problem: expect.stringMatching(/price/) });
        expect(quoteBody({ amount: "100", turnaround: "", note: "" })).toMatchObject({ problem: expect.stringMatching(/turnaround/) });
    });
});

describe("money", () => {
    const allowance = (over: Partial<PartnerAllowance> = {}): PartnerAllowance => ({
        walletId: "w1",
        balance: "5000.00",
        pendingClearance: "0.00",
        openWithdrawals: "0.00",
        withdrawable: "5000.00",
        dailyCap: "10000.00",
        usedToday: "0.00",
        remainingToday: "10000.00",
        maximum: "5000.00",
        minimum: "100.00",
        monthsOnPlatform: 1,
        nextRung: null,
        frozenAt: null,
        ...over,
    });
    const verified = { id: "m1", status: "VERIFIED" } as PayoutMethod;
    const pending = { id: "m2", status: "PENDING_VERIFICATION" } as PayoutMethod;

    it("names the rule that stops a withdrawal, in the server's order", () => {
        expect(withdrawBlocker(allowance(), [verified], false)).toBeNull();
        expect(withdrawBlocker(allowance(), [verified], true)).toMatch(/frozen/);
        expect(withdrawBlocker(allowance(), [pending], false)).toMatch(/bank account or UPI ID first/);
        expect(withdrawBlocker(allowance({ withdrawable: "0.00" }), [verified], false)).toMatch(/Nothing has cleared/);
        expect(withdrawBlocker(allowance({ remainingToday: "0.00" }), [verified], false)).toMatch(/today's/);
        expect(withdrawBlocker(null, [verified], false)).toMatch(/could not be read/);
    });

    it("checks the typed amount against the minimum, the cleared money and today's limit", () => {
        expect(withdrawProblem("", allowance())).toBeNull();
        expect(withdrawProblem("50", allowance())).toMatch(/smallest/);
        expect(withdrawProblem("6000", allowance())).toMatch(/has cleared/);
        expect(withdrawProblem("4000", allowance({ remainingToday: "3000.00" }))).toMatch(/limit is left/);
        expect(withdrawProblem("1000", allowance())).toBeNull();
    });

    it("folds this month's credits only when the summary did not answer", () => {
        const entries: LedgerEntry[] = [
            { id: "a", type: "EARNING", amount: "100.00", balanceAfter: "100.00", orderId: null, reference: null, note: null, createdAt: "2026-09-02T10:00:00" },
            { id: "b", type: "EARNING", amount: "50.50", balanceAfter: "150.50", orderId: null, reference: null, note: null, createdAt: "2026-09-10T10:00:00" },
            { id: "c", type: "EARNING", amount: "70.00", balanceAfter: "70.00", orderId: null, reference: null, note: null, createdAt: "2026-08-30T10:00:00" },
            { id: "d", type: "PAYOUT", amount: "-20.00", balanceAfter: "130.50", orderId: null, reference: null, note: null, createdAt: "2026-09-11T10:00:00" },
        ];
        expect(creditedThisMonth(entries, new Date("2026-09-20T10:00:00"))).toBe("150.50");
        expect(creditedThisMonth([], new Date("2026-09-20T10:00:00"))).toBe("0.00");
    });

    it("words the ledger", () => {
        expect(entryLabel("PRINT_COST")).toBe("Print job paid");
        expect(entryLabel("SOMETHING_NEW")).toBe("Something new");
    });
});

describe("the rate card", () => {
    it("reads a line, or says what is missing", () => {
        expect(rateRowOf({ material: "Flex", sizeClass: "", unit: "sq ft", ratePerUnit: "12", minQty: "50", notes: "" })).toEqual({ row: { material: "Flex", sizeClass: null, unit: "sq ft", ratePerUnit: "12.00", minQty: 50, notes: null } });
        expect(rateRowOf({ ...emptyRateDraft(), ratePerUnit: "12" })).toEqual({ problem: "Name the material." });
        expect(rateRowOf({ ...emptyRateDraft(), material: "Flex", unit: "" })).toMatchObject({ problem: expect.stringMatching(/per/) });
        expect(rateRowOf({ ...emptyRateDraft(), material: "Flex", ratePerUnit: "" })).toEqual({ problem: "Enter the rate." });
    });

    it("leaves untouched lines out and wants a file or a rate", () => {
        expect(rateCardBody([emptyRateDraft()], null)).toEqual({ body: null, problems: {}, problem: "A rate card needs a file or at least one rate." });
        expect(rateCardBody([emptyRateDraft()], "f1")).toEqual({ body: { fileId: "f1", rows: [] }, problems: {}, problem: null });
        const result = rateCardBody([{ ...emptyRateDraft(), material: "Flex" }, emptyRateDraft()], null);
        expect(result.body).toBeNull();
        expect(result.problems).toEqual({ 0: "Enter the rate." });
    });
});

describe("dates", () => {
    it("prints moments and days with the website's month words", () => {
        expect(formatWhen(new Date(2026, 8, 24, 19, 16).toISOString())).toBe("24 Sep, 7:16 pm");
        expect(formatWhen(new Date(2026, 8, 24, 0, 5).toISOString())).toBe("24 Sep, 12:05 am");
        expect(formatWhen(null)).toBe("—");
        expect(formatDay(new Date(2026, 8, 29, 10).toISOString())).toBe("29 Sep 2026");
        expect(formatDay("nonsense")).toBe("—");
    });
});

describe("months", () => {
    it("names the invoice months", () => {
        expect(monthKey(new Date(2026, 0, 5))).toBe("2026-01");
        expect(monthLabel("2026-09")).toBe("September 2026");
        expect(monthLabel("bad")).toBe("bad");
        expect(recentMonths(new Date(2026, 0, 15))).toEqual([
            { value: "2026-01", label: "January 2026" },
            { value: "2025-12", label: "December 2025" },
            { value: "2025-11", label: "November 2025" },
        ]);
    });
});
