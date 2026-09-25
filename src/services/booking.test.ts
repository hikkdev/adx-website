import { describe, expect, it } from "vitest";
import {
    artworkRequirements,
    briefMissing,
    chargesOf,
    cityOf,
    creativeFor,
    discountLabel,
    estimateCart,
    flightDays,
    formatFlight,
    fulfilmentOfLine,
    isDigital,
    joinBillingAddress,
    normalisePromo,
    orientationOf,
    rupees,
    splitBillingAddress,
    spotItemsOf,
    stepOf,
    type CampaignReview,
} from "./booking";

const review = (overrides: Partial<CampaignReview> = {}): CampaignReview => ({
    campaignId: "c1",
    reference: "CMP-2026-000042",
    status: "DRAFT",
    lines: [
        { spotId: "s1", listingId: "l1", title: "Whitefield roadside billboard", city: "Bengaluru", photoUrl: null, mediaTypeName: "Hoarding", size: "40×20 ft", ratePerDay: "428.57", days: 14, quantity: 1, lineTotal: "6000.00", fees: [{ label: "Printing", amount: "2400.00" }, { label: "Installation", amount: "1200.00" }, { label: "Platform fee", amount: "200.00" }], gst: "1764.00", gross: "11564.00" },
        { spotId: "s2", listingId: "l2", title: "Phoenix Mall Atrium", city: "Bengaluru", photoUrl: null, mediaTypeName: "Digital screen", size: "1080×1920 px", ratePerDay: "857.14", days: 14, quantity: 1, lineTotal: "12000.00", fees: [{ label: "Platform fee", amount: "200.00" }], gst: "2196.00", gross: "14396.00" },
    ],
    spotsSubtotal: "18000.00",
    feesTotal: "4000.00",
    gstAmount: "3960.00",
    discount: "0.00",
    total: "25960.00",
    budget: null,
    budgetRemaining: null,
    days: 14,
    creativesUploaded: 2,
    creativesExpected: 2,
    missing: [],
    clashes: [],
    ...overrides,
});

describe("the flight", () => {
    it("counts inclusive days and prints the frames' range", () => {
        expect(flightDays("2026-10-12", "2026-10-25")).toBe(14);
        expect(flightDays("2026-10-25", "2026-10-12")).toBe(0);
        expect(formatFlight("2026-10-12", "2026-10-25")).toBe("12–25 Oct 2026");
        expect(formatFlight("2026-10-12T00:00:00.000Z", "2026-10-25T00:00:00.000Z", { long: true })).toBe("12–25 October 2026");
        expect(formatFlight("2026-10-12", "2026-10-25", { year: false })).toBe("12–25 Oct");
        expect(formatFlight("2026-10-28", "2026-11-03")).toBe("28 Oct – 3 Nov 2026");
        expect(formatFlight("2026-12-28", "2027-01-03")).toBe("28 Dec 2026 – 3 Jan 2027");
        expect(formatFlight(null, null)).toBe("Dates not set");
    });
});

describe("the charges", () => {
    it("folds the review's fee lines into the frames' rows without re-adding the total", () => {
        const charges = chargesOf(review());
        expect(charges.mediaRent).toBe(18000);
        expect(charges.printing).toBe(2400);
        expect(charges.installation).toBe(1200);
        expect(charges.production).toBe(3600);
        expect(charges.platformFee).toBe(400);
        expect(charges.otherFees).toEqual([]);
        expect(charges.gst).toBe(3960);
        expect(charges.total).toBe(25960);
        expect(charges.fees).toEqual([
            { label: "Printing", amount: 2400 },
            { label: "Installation", amount: 1200 },
            { label: "Platform fee", amount: 400 },
        ]);
    });

    it("keeps a fee it cannot name as its own row rather than calling it the platform fee", () => {
        const r = review();
        r.lines[0]!.fees.push({ label: "Creative design", amount: "1500.00" });
        const charges = chargesOf(r);
        expect(charges.platformFee).toBe(400);
        expect(charges.otherFees).toEqual([{ label: "Creative design", amount: 1500 }]);
    });

    it("estimates the cart the way the listing page does", () => {
        const estimate = estimateCart([{ ratePerDay: "428.57", print: true }, { ratePerDay: "857.14", print: false }], 14);
        expect(Math.round(estimate.mediaRent)).toBe(18000);
        expect(estimate.printing).toBe(2400);
        expect(estimate.installation).toBe(1200);
        expect(estimate.platformFee).toBe(200);
        expect(estimate.total).toBe(Math.round(estimate.mediaRent + 3600 + 200 + estimate.gst));
    });

    it("prints rupees in Indian grouping", () => {
        expect(rupees("25960.00")).toBe("₹25,960");
        expect(rupees(1234567)).toBe("₹12,34,567");
        expect(rupees(null)).toBe("—");
    });
});

describe("the promo answer", () => {
    it("keeps the discount a string and names the code behind it", () => {
        const { review: priced, promo } = normalisePromo({ ...review(), discount: "2000.00", promo: { code: "FESTIVE20", amount: "2000.00" } });
        expect(promo).toEqual({ code: "FESTIVE20", amount: "2000.00" });
        expect(priced.discount).toBe("2000.00");
        expect(normalisePromo({ ...review(), promo: null }).promo).toBeNull();
        expect(normalisePromo(review()).promo).toBeNull();
    });
});

describe("the brief", () => {
    it("keeps the agreement lines out of what the brief lacks", () => {
        const r = review({ missing: [{ step: "BRAND", field: "brandName", label: "Brand name" }, { step: "AUTHORIZE", field: "AGREEMENT_REQUIRED", label: "Accept the insertion order" }] });
        expect(briefMissing(r).map((m) => m.field)).toEqual(["brandName"]);
    });

    it("knows which step a draft has reached", () => {
        const base = { status: "DRAFT" as const, name: "Festive launch", spots: [{}] as never[], creativePath: "STATIC_IMAGES" as const, fulfilment: "ADX_PRINTS" as const, creatives: [] };
        expect(stepOf({ ...base, name: "Untitled campaign" })).toBe(1);
        expect(stepOf({ ...base, spots: [] })).toBe(2);
        expect(stepOf({ ...base, creativePath: null })).toBe(3);
        expect(stepOf(base)).toBe(4);
        expect(stepOf({ ...base, status: "SCHEDULED" })).toBe(4);
    });

    it("reads the city off the cart's area lines", () => {
        expect(cityOf({ lines: [{ area: "Whitefield, Bengaluru" }, { area: "Koramangala, Bengaluru" }] as never })).toBe("Bengaluru");
        expect(cityOf({ lines: [] })).toBeNull();
    });
});

describe("the artwork", () => {
    it("picks the newest row that nothing superseded", () => {
        const creatives = [
            { id: "a", spotId: "s1", path: "STATIC_IMAGES", status: "REJECTED", fileUrl: "u", fileName: "v1.pdf", submittedAt: "2026-09-01" },
            { id: "b", spotId: "s1", path: "STATIC_IMAGES", status: "IN_REVIEW", fileUrl: "u2", fileName: "v2.pdf", submittedAt: "2026-09-02", resubmissionOfId: "a" },
            { id: "c", spotId: "s2", path: "STATIC_IMAGES", status: "IN_REVIEW", fileUrl: "u3", fileName: "mall.mp4", submittedAt: "2026-09-02" },
        ] as const;
        expect(creativeFor([...creatives], "s1")?.id).toBe("b");
        expect(creativeFor([...creatives], "s3")).toBeNull();
    });

    it("tells print from digital and reads an orientation", () => {
        expect(isDigital({ display: "DIGITAL" })).toBe(true);
        expect(isDigital({ mediaTypeName: "Hoarding" })).toBe(false);
        expect(isDigital({ mediaTypeName: "LED screen" })).toBe(true);
        expect(orientationOf("1080 × 1920 px")).toBe("Portrait");
        expect(orientationOf("40×20 ft")).toBe("Landscape");
        expect(orientationOf(null)).toBeNull();
        expect(artworkRequirements("print", null)[0]).toEqual({ label: "File type", value: "PDF" });
        expect(artworkRequirements("digital", "1080×1920 px")[0].value).toBe("1080 × 1920 px · Portrait");
    });
});

describe("the billing address", () => {
    it("keeps the pincode at the end of the one line the backend holds", () => {
        expect(joinBillingAddress("24, Whitefield Main Road", "560066")).toBe("24, Whitefield Main Road, 560066");
        expect(splitBillingAddress("24, Whitefield Main Road, 560066")).toEqual({ street: "24, Whitefield Main Road", postalCode: "560066" });
        expect(splitBillingAddress("14, Residency Road, Bengaluru")).toEqual({ street: "14, Residency Road, Bengaluru", postalCode: "" });
    });
});

describe("GST-D, DQ-1 and PS-1 on the review", () => {
    it("carries the discount's GST and the design fee into the charges, and the arithmetic adds up", () => {
        const charges = chargesOf(review({ discount: "1000.00", discountGst: "153.00", gstAmount: "3807.00", designFee: { amount: "5000.00", gst: "900.00", note: "Two print faces" }, feesTotal: "9000.00", total: "29807.00" }));
        expect(charges.discount).toBe(1000);
        expect(charges.discountGst).toBe(153);
        expect(charges.design).toBe(5000);
        expect(charges.otherFees).toContainEqual({ label: "Design by ADX", amount: 5000 });
        expect(charges.fees.find((fee) => fee.label === "Design by ADX")?.amount).toBe(5000);
        expect(discountLabel(charges)).toBe("− ₹1,000 (incl. GST −₹153)");
        expect(discountLabel({ discount: 500, discountGst: 0 })).toBe("− ₹500");
        expect(estimateCart([], 0).discountGst).toBe(0);
    });

    it("reads a line's own print choice before the campaign's", () => {
        const campaign = { fulfilment: "ADX_PRINTS" as const };
        expect(fulfilmentOfLine({ fulfilment: "ADVERTISER_SHIPS" }, campaign)).toBe("ADVERTISER_SHIPS");
        expect(fulfilmentOfLine({ fulfilment: null }, campaign)).toBe("ADX_PRINTS");
        expect(fulfilmentOfLine(null, { fulfilment: null })).toBeNull();
    });

    it("sends the cart's lines with their own print choice, and nothing for the ones that follow the campaign", () => {
        const line = { title: "x", photo: null, chip: "", area: null, ratePerDay: "100", addedAt: "" };
        expect(spotItemsOf({ lines: [{ ...line, listingId: "l1", fulfilment: "ADVERTISER_SHIPS" }, { ...line, listingId: "l2" }, { ...line, listingId: "l3", fulfilment: null }] })).toEqual([{ listingId: "l1", fulfilment: "ADVERTISER_SHIPS" }, { listingId: "l2" }, { listingId: "l3" }]);
    });
});
