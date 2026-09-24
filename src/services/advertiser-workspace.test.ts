import { describe, expect, it } from "vitest";
import {
    artworkInReview,
    campaignActivity,
    campaignQuery,
    campaignStatusLabel,
    campaignsSummary,
    chipStatuses,
    dateRange,
    dayCount,
    dayMonthLong,
    describeSession,
    detailLines,
    evidenceLine,
    fileNameOf,
    groupEnabled,
    groupRows,
    gstLabel,
    invoiceLines,
    invoicesSummary,
    invoiceStatusLabel,
    maskPhone,
    paymentLine,
    PREFERENCE_GROUPS,
    proofStatus,
    relativeTime,
    requestsSummary,
    requestTags,
    rupees,
    spacesLine,
    ticketCampaignId,
    ticketStatusLabel,
    ticketTopic,
    type CampaignCreative,
    type NotificationPreference,
} from "./advertiser-workspace";

describe("dates", () => {
    it("prints the frames' ranges", () => {
        expect(dateRange("2026-10-12", "2026-10-25")).toBe("12–25 Oct 2026");
        expect(dateRange("2026-08-01T00:00:00.000Z", "2026-08-14T00:00:00.000Z")).toBe("1–14 Aug 2026");
        expect(dateRange("2026-08-28", "2026-09-03")).toBe("28 Aug – 3 Sep 2026");
        expect(dateRange("2026-12-28", "2027-01-03")).toBe("28 Dec 2026 – 3 Jan 2027");
        expect(dateRange("2026-08-01", "2026-08-14", "long")).toBe("1–14 August 2026");
        expect(dateRange(null, null)).toBe("Not scheduled");
    });
    it("counts days inclusively", () => {
        expect(dayCount("2026-10-12", "2026-10-25")).toBe(14);
        expect(dayCount("2026-08-01", "2026-08-14")).toBe(14);
        expect(dayCount(null, "2026-08-14")).toBeNull();
    });
    it("says when a session was last used", () => {
        const now = new Date("2026-09-25T10:00:00Z");
        expect(relativeTime("2026-09-25T09:58:00Z", now)).toBe("Active now");
        expect(relativeTime("2026-09-25T08:00:00Z", now)).toBe("2 hours ago");
        expect(relativeTime("2026-09-22T10:00:00Z", now)).toBe("3 days ago");
    });
});

describe("money", () => {
    it("groups rupees the Indian way", () => {
        expect(rupees("25960.00")).toBe("₹25,960");
        expect(rupees(1234567)).toBe("₹12,34,567");
        expect(rupees("-2500.5")).toBe("−₹2,501");
        expect(rupees(null)).toBe("—");
    });
    it("names the GST rate off the invoice's own totals", () => {
        expect(gstLabel("22000.00", "3960.00")).toBe("GST 18%");
        expect(gstLabel("5200", "936")).toBe("GST 18%");
        expect(gstLabel("100", "7.33")).toBe("GST");
    });
});

describe("campaign list", () => {
    it("builds the list query the backend reads", () => {
        expect(campaignQuery({})).toBe("?page=1&pageSize=50");
        expect(campaignQuery({ status: ["LIVE", "PAUSED"], q: " aster " })).toBe("?q=aster&status=LIVE,PAUSED&page=1&pageSize=50");
        expect(chipStatuses("COMPLETED")).toEqual(["COMPLETED", "CANCELLED"]);
        expect(chipStatuses("ALL")).toEqual([]);
    });
    it("sums the chips' counts into the subtitle", () => {
        expect(campaignsSummary({ DRAFT: 1, SCHEDULED: 1, COMPLETED: 1 }, 3)).toBe("3 campaigns · 1 draft");
        expect(campaignsSummary({ LIVE: 1 }, 1)).toBe("1 campaign");
        expect(spacesLine(2, "Bengaluru")).toBe("2 spaces in Bengaluru");
        expect(spacesLine(0, "Bengaluru")).toBe("No spaces yet");
    });
});

const creative = (over: Partial<CampaignCreative>): CampaignCreative => ({
    id: "c1",
    spotId: "s1",
    path: "STATIC_IMAGES",
    status: "IN_REVIEW",
    fileUrl: "https://files/a.png",
    fileName: "a.png",
    submittedAt: "2026-10-10T05:02:00Z",
    ...over,
});

describe("campaign status", () => {
    it("reads a paid campaign's artwork", () => {
        expect(artworkInReview([creative({})])).toBe(true);
        expect(artworkInReview([creative({ status: "APPROVED" })])).toBe(false);
        // A re-upload supersedes the refused row it points at.
        expect(artworkInReview([creative({ status: "REJECTED" }), creative({ id: "c2", status: "APPROVED", resubmissionOfId: "c1" })])).toBe(false);
        expect(campaignStatusLabel({ status: "SCHEDULED", creatives: [creative({})] }).label).toBe("Artwork in review");
        expect(campaignStatusLabel({ status: "SCHEDULED", creatives: [creative({ status: "APPROVED" })] }).label).toBe("Scheduled");
        expect(campaignStatusLabel({ status: "SCHEDULED", launchBlockedBy: ["KYC"] }).label).toBe("Verify to launch");
        expect(campaignStatusLabel({ status: "DRAFT" }).label).toBe("Draft");
        expect(campaignStatusLabel({ status: "COMPLETED" }).tone).toBe("success");
    });
    it("lists the activity oldest first with what is next", () => {
        const entries = campaignActivity({
            createdAt: "2026-10-01T04:00:00Z",
            submittedForPaymentAt: null,
            paidAt: "2026-10-10T04:54:00Z",
            creatives: [creative({})],
            startDate: "2026-10-12",
            endDate: "2026-10-25",
            launchedAt: null,
            status: "SCHEDULED",
        });
        expect(entries.map((e) => e.title)).toEqual(["Payment received", "Artwork submitted", "Publisher review", "Campaign starts"]);
        expect(entries[2]!.detail).toBe("In progress");
        expect(campaignActivity({ createdAt: "2026-10-05T04:00:00Z", submittedForPaymentAt: null, paidAt: null, creatives: [], startDate: null, endDate: null, launchedAt: null, status: "DRAFT" }).map((e) => e.title)).toEqual(["Brief saved"]);
    });
});

describe("delivery proofs", () => {
    it("reads the proof status off the booking", () => {
        expect(proofStatus({ status: "PENDING_PUBLISHER" }).label).toBe("Not due yet");
        expect(proofStatus({ status: "IN_PROGRESS" }).key).toBe("IN_PROGRESS");
        expect(proofStatus({ status: "PENDING_APPROVAL" }).key).toBe("SUBMITTED");
        expect(proofStatus({ status: "COMPLETED" }).label).toBe("Verified");
        expect(proofStatus({ status: "PUBLISHER_REJECTED" }).tone).toBe("danger");
        expect(evidenceLine(3)).toBe("3 files");
        expect(evidenceLine(0)).toBe("Not submitted");
        expect(fileNameOf("https://storage.adx.in/orders/abc/city-bus-installation.jpg?sig=1")).toBe("city-bus-installation.jpg");
        expect(fileNameOf("/files/ck123")).toBe("ck123");
        expect(fileNameOf("data:image/png;base64,AAAA")).toBe("");
        expect(dayMonthLong("2026-08-14")).toBe("14 August");
    });
});

describe("invoices", () => {
    it("summarises the list", () => {
        expect(invoicesSummary([{ status: "PAID", kind: "TAX_INVOICE", paymentId: "p" }, { status: "ISSUED", kind: "TAX_INVOICE", paymentId: "p2" }])).toBe("2 invoices · All paid");
        expect(invoicesSummary([{ status: "ISSUED", kind: "TAX_INVOICE", paymentId: null }])).toBe("1 invoice · 1 due");
        expect(invoiceStatusLabel({ status: "ISSUED", kind: "CREDIT_NOTE", paymentId: null }).label).toBe("Credit note");
    });
    it("rebuilds the lines at the invoice's own rate so they add up", () => {
        const lines = invoiceLines(
            { taxableValue: "22000.00", gstTotal: "3960.00" },
            {
                startDate: "2026-10-12",
                endDate: "2026-10-25",
                feesTotal: "4000.00",
                discount: null,
                spots: [
                    { id: "s1", listingId: "l1", status: "BOOKED", ratePerDay: "428.57", days: 14, quantity: 1, lineTotal: "6000.00", orderId: null, listing: { id: "l1", title: "Whitefield roadside billboard", city: "Bengaluru", address: "", widthFt: "40", heightFt: "20", estimatedDailyFootfall: null, mediaType: null, photos: [] } },
                    { id: "s2", listingId: "l2", status: "BOOKED", ratePerDay: "857.14", days: 14, quantity: 1, lineTotal: "12000.00", orderId: null, listing: { id: "l2", title: "Phoenix Mall Atrium", city: "Bengaluru", address: "", widthFt: null, heightFt: null, estimatedDailyFootfall: null, mediaType: null, photos: [] } },
                ],
            },
            { campaignId: "c", lines: [{ spotId: "s1", listingId: "l1", title: "", city: null, ratePerDay: "", days: 14, quantity: 1, lineTotal: "6000", fees: [{ label: "Printing", amount: "2400" }, { label: "Installation", amount: "1200" }, { label: "Service fee", amount: "400" }], gst: "", gross: "" }], spotsSubtotal: "18000", feesTotal: "4000", gstAmount: "3960", discount: "0", total: "25960", days: 14 }
        );
        expect(lines.map((l) => l.description)).toEqual(["Whitefield roadside billboard", "Phoenix Mall Atrium", "Printing", "Installation", "Service fee"]);
        expect(lines[0]!.period).toBe("12–25 Oct 2026");
        expect(Math.round(lines[0]!.gst)).toBe(1080);
        expect(Math.round(lines.reduce((sum, l) => sum + l.total, 0))).toBe(25960);
    });
    it("reads the document's own lines when the detail route answers", () => {
        const line = (over: Partial<Parameters<typeof detailLines>[0][number]>) => ({ id: "l", kind: "MEDIA", description: "", sacCode: null, quantity: "1", unitRate: "6000.00", taxableValue: "6000.00", gstPct: "0.18", gstAmount: "1080.00", campaignSpotId: null, sortOrder: 1, ...over });
        const lines = detailLines(
            [line({ id: "b", kind: "PRINTING", description: "Printing", taxableValue: "2400.00", gstAmount: "432.00", sortOrder: 3 }), line({ id: "a", description: "Whitefield billboard", sortOrder: 1 })],
            { startDate: "2026-10-12", endDate: "2026-10-25" }
        );
        expect(lines.map((l) => l.description)).toEqual(["Whitefield billboard", "Printing"]);
        expect(lines[0]).toMatchObject({ period: "12–25 Oct 2026", quantity: "1 booking", taxable: 6000, gst: 1080, total: 7080 });
        expect(lines[1]).toMatchObject({ period: "Campaign artwork", quantity: "1", total: 2832 });
    });
    it("prints the payment line from the settling payment", () => {
        expect(paymentLine({ total: "25960", paymentId: "p1", campaignId: "c1" }, [{ id: "p1", reference: "PAY-1", status: "CAPTURED", gateway: "RAZORPAY", amount: "25960.00", method: "UPI", createdAt: "" }])).toBe("₹25,960 paid · UPI");
        expect(paymentLine({ total: "25960", paymentId: null, campaignId: "c1" }, [])).toBe("₹25,960 · payment record not found");
    });
});

describe("requests", () => {
    it("tags a request with its topic and campaign, and reads them back", () => {
        const topic = ticketTopic({ tags: ["topic:CANCELLATION", "Cancellation request"], category: "ORDER" });
        expect(topic?.id).toBe("CANCELLATION");
        expect(requestTags(topic!, "cmp1")).toEqual(["topic:CANCELLATION", "Cancellation request", "campaign:cmp1"]);
        expect(ticketCampaignId({ tags: ["campaign:cmp1"] })).toBe("cmp1");
        expect(ticketCampaignId({ tags: ["campaign:cmp1"], relatedCampaignId: "cmp9" })).toBe("cmp9");
        expect(ticketTopic({ tags: [], category: "PAYMENT" })?.id).toBe("PAYMENT");
    });
    it("summarises and labels", () => {
        expect(requestsSummary([{ status: "OPEN" }, { status: "WAITING" }, { status: "OPEN" }, { status: "CLOSED" }])).toBe("4 requests · 3 open · 1 resolved");
        expect(ticketStatusLabel("CLOSED").label).toBe("Resolved");
        expect(ticketStatusLabel("WAITING").tone).toBe("warning");
    });
});

describe("account", () => {
    it("masks the phone the way the frame does", () => {
        expect(maskPhone("+919876543421")).toBe("+91 98••• ••421");
        expect(maskPhone("9876543421")).toBe("98••• ••421");
    });
    it("names a device off its user agent", () => {
        expect(describeSession("Mozilla/5.0 (Windows NT 10.0) Chrome/128")).toEqual({ name: "Chrome", badge: "Windows" });
        expect(describeSession("adx-user/1.0 (Android 14)")).toEqual({ name: "ADX app", badge: "Android" });
        expect(describeSession(null).name).toBe("Unknown device");
    });
    it("folds notification kinds into the four switches", () => {
        const prefs: NotificationPreference[] = [
            { type: "BOOKING", channel: "IN_APP", enabled: true },
            { type: "BOOKING", channel: "EMAIL", enabled: false },
            { type: "ORDER", channel: "IN_APP", enabled: false },
            { type: "MESSAGE", channel: "IN_APP", enabled: false },
            { type: "SYSTEM", channel: "IN_APP", enabled: true, mandatory: true },
        ];
        expect(groupEnabled(prefs, PREFERENCE_GROUPS[0]!)).toBe(true);
        expect(groupEnabled(prefs, PREFERENCE_GROUPS[1]!)).toBe(false);
        expect(groupRows(prefs, PREFERENCE_GROUPS[1]!, true)).toEqual([
            { type: "ORDER", channel: "IN_APP", enabled: true },
            { type: "MESSAGE", channel: "IN_APP", enabled: true },
        ]);
        expect(groupRows(prefs, PREFERENCE_GROUPS[3]!, true)).toEqual([]);
    });
});
