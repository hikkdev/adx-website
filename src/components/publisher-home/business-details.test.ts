import { describe, expect, it } from "vitest";
import { businessPatch, isBusiness, tenDigits, type BusinessForm } from "./business-details";

const profile = { address: "1, Demo Street", city: "Bengaluru", state: "Karnataka", postalCode: "560001", gstin: null, contactName: "Demo Desk", contactMobile: "9000000999", contactEmail: null, type: "BUSINESS" };
const form = (over: Partial<BusinessForm> = {}): BusinessForm => ({ address: "1, Demo Street", city: "Bengaluru", state: "Karnataka", postalCode: "560001", gstin: "", contactName: "Demo Desk", contactMobile: "9000000999", contactEmail: "", point: null, ...over });

describe("the business details card", () => {
    it("sends nothing when nothing changed", () => {
        expect(businessPatch(profile, form())).toEqual({ patch: {}, errors: {} });
    });

    it("sends only what moved, trimmed, the GSTIN upper-cased", () => {
        const { patch, errors } = businessPatch(profile, form({ address: " 12, MG Road ", state: "Karnataka", gstin: "29aabcu9603r1zm", contactEmail: "desk@demo.in" }));
        expect(errors).toEqual({});
        expect(patch).toEqual({ address: "12, MG Road", gstin: "29AABCU9603R1ZM", contactEmail: "desk@demo.in" });
    });

    it("sends the coordinates of a pick as a pair, and none when the address was only typed", () => {
        expect(businessPatch(profile, form({ point: { latitude: 12.97, longitude: 77.64 } })).patch).toEqual({ latitude: 12.97, longitude: 77.64 });
        expect(businessPatch(profile, form({ address: "2, Typed Street" })).patch).toEqual({ address: "2, Typed Street" });
    });

    it("sends a changed PIN, and names one that is not six digits", () => {
        expect(businessPatch(profile, form({ postalCode: "560034" })).patch).toEqual({ postalCode: "560034" });
        expect(businessPatch(profile, form({ postalCode: "56003" })).errors).toEqual({ postalCode: "A PIN code is six digits, like 560001." });
    });

    it("names what is wrong", () => {
        const { errors } = businessPatch(profile, form({ address: " ", gstin: "12345", contactMobile: "12345", contactEmail: "nope" }));
        expect(Object.keys(errors).sort()).toEqual(["address", "contactEmail", "contactMobile", "gstin"]);
    });

    it("reads a mobile with the country code as its ten digits", () => {
        expect(tenDigits("+91 98765 43210")).toBe("9876543210");
        expect(businessPatch(profile, form({ contactMobile: "+91 98765 43210" })).patch).toEqual({ contactMobile: "9876543210" });
    });

    it("keeps an individual's patch to where they are", () => {
        const person = { ...profile, type: "INDIVIDUAL" };
        expect(isBusiness(person)).toBe(false);
        expect(businessPatch(person, form({ gstin: "bad", contactName: "Someone else", city: "Pune" }))).toEqual({ patch: { city: "Pune" }, errors: {} });
    });
});
