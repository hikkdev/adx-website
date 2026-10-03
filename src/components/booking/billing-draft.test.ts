import { describe, expect, it } from "vitest";
import { billingPatchOf, billingSeed, type BillingDraft } from "./billing-draft";
import type { AdvertiserProfile } from "@/services/booking";

/**
 * Checkout billing (29 Sep 2026): the PIN is the advertiser row's own
 * `postalCode` column — read from it and written to it, no longer folded
 * into the one address line — and the billing email falls back to the
 * account's proven address when the advertiser row has none.
 */

const advertiser = (over: Partial<AdvertiserProfile> = {}): AdvertiserProfile => ({
    id: "adv-1",
    displayId: "ADV-2909-2601",
    name: "Meera Sharma",
    mobile: "+919876543210",
    email: null,
    type: "COMMERCIAL",
    companyName: "Aster Home Pvt Ltd",
    gstin: null,
    billingAddress: "24, Whitefield Main Road",
    city: "Bengaluru",
    state: "Karnataka",
    postalCode: "560066",
    country: "India",
    kycStatus: "NOT_STARTED",
    ...over,
});

describe("billingSeed", () => {
    it("opens with the row's own PIN and street, and the account's email when the row has none", () => {
        expect(billingSeed({ draft: null, advertiser: advertiser(), accountEmail: "meera@aster.example", fallbackCity: "Mumbai" })).toEqual({
            legalName: "Aster Home Pvt Ltd",
            email: "meera@aster.example",
            street: "24, Whitefield Main Road",
            city: "Bengaluru",
            postalCode: "560066",
            state: "Karnataka",
            gstin: "",
        });
    });

    it("keeps the advertiser's own billing email over the account's", () => {
        expect(billingSeed({ draft: null, advertiser: advertiser({ email: "accounts@aster.example" }), accountEmail: "meera@aster.example" }).email).toBe("accounts@aster.example");
        expect(billingSeed({ draft: null, advertiser: advertiser({ email: "  " }), accountEmail: "meera@aster.example" }).email).toBe("meera@aster.example");
        expect(billingSeed({ draft: null, advertiser: advertiser(), accountEmail: null }).email).toBe("");
    });

    it("reads the PIN off an address line saved before the column, when the column is empty", () => {
        const seed = billingSeed({ draft: null, advertiser: advertiser({ billingAddress: "14, Residency Road, 560025", postalCode: null }) });
        expect(seed.street).toBe("14, Residency Road");
        expect(seed.postalCode).toBe("560025");
    });

    it("prefers a draft kept in this browser, and the campaign's city when the row has none", () => {
        const draft: BillingDraft = { legalName: "Aster", email: "d@aster.example", street: "1 MG Road", city: "Pune", postalCode: "411001", state: "Maharashtra", gstin: "" };
        expect(billingSeed({ draft, advertiser: advertiser(), accountEmail: "meera@aster.example" })).toEqual(draft);
        expect(billingSeed({ draft: null, advertiser: advertiser({ city: null }), fallbackCity: "Mumbai" }).city).toBe("Mumbai");
    });
});

describe("billingPatchOf", () => {
    const values: BillingDraft = { legalName: "Aster Home Pvt Ltd", email: "meera@aster.example", street: "24, Whitefield Main Road", city: "Bengaluru", postalCode: "560066", state: "Karnataka", gstin: "" };

    it("writes the street to billingAddress and the PIN to postalCode — not folded into the line", () => {
        expect(billingPatchOf(values, advertiser({ postalCode: null }))).toEqual({
            companyName: "Aster Home Pvt Ltd",
            email: "meera@aster.example",
            billingAddress: "24, Whitefield Main Road",
            postalCode: "560066",
            city: "Bengaluru",
            state: "Karnataka",
        });
    });

    it("clears a PIN the person emptied, and leaves an absent one alone", () => {
        expect(billingPatchOf({ ...values, postalCode: "" }, advertiser({ postalCode: "560066" })).postalCode).toBeNull();
        expect("postalCode" in billingPatchOf({ ...values, postalCode: "" }, advertiser({ postalCode: null }))).toBe(false);
    });

    it("names an individual's account, and a business's company", () => {
        expect(billingPatchOf(values, advertiser({ type: "INDIVIDUAL" }))).toMatchObject({ name: "Aster Home Pvt Ltd" });
        expect(billingPatchOf(values, advertiser({ type: "INDIVIDUAL" }))).not.toHaveProperty("companyName");
    });
});
