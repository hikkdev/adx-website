import { PIN_PATTERN } from "@/components/listing-form/address-search";
import type { PublisherPatch, PublisherProfile } from "@/services/publisher-workspace";

/**
 * The Business profile's details card as a pure step: what changed becomes
 * the `PATCH /publishers/me` body, and what is wrong becomes a sentence per
 * field — the same rules the app's My profile keeps
 * (`mobile/user-app/src/features/publisher/profile/edit-profile-screen.tsx`).
 * A business or organisation also sends its GSTIN and contact person; an
 * individual does not see them.
 *
 * Onboarding addresses (the owner, 1 Oct 2026): no map. The "Find the
 * address" bar fills the address, city, state and PIN and keeps the
 * coordinates out of sight; they go up only after a pick this visit, as a
 * pair. Typed by hand, the words save and the coordinates keep what they were.
 */

const GSTIN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface BusinessForm {
    address: string;
    city: string;
    state: string;
    /** The six-digit PIN (`postalCode` on the wire). */
    postalCode: string;
    gstin: string;
    contactName: string;
    contactMobile: string;
    contactEmail: string;
    /** The coordinates of the place picked in the bar this visit — never shown; null until a pick. */
    point: { latitude: number; longitude: number } | null;
}

type ProfileSide = Pick<PublisherProfile, "address" | "city" | "state" | "postalCode" | "gstin" | "contactName" | "contactMobile" | "contactEmail" | "type">;

export const isBusiness = (profile: Pick<PublisherProfile, "type">): boolean => (profile.type ?? "INDIVIDUAL") !== "INDIVIDUAL";

/** "+91 98765 43210" → "9876543210"; anything that is not ten digits after the country code stays as typed, for the check to name. */
export function tenDigits(mobile: string): string {
    const digits = mobile.replace(/[^\d+]/g, "");
    return digits.replace(/^\+?91(?=\d{10}$)/, "");
}

export function businessPatch(profile: ProfileSide, form: BusinessForm): { patch: PublisherPatch; errors: Record<string, string> } {
    const errors: Record<string, string> = {};
    const business = isBusiness(profile);
    if (!form.address.trim()) errors.address = "Your address is needed — it is where ADX sends an agent for an accepted booking.";
    const postalCode = form.postalCode.trim();
    if (postalCode && !PIN_PATTERN.test(postalCode)) errors.postalCode = "A PIN code is six digits, like 560001.";
    const gstin = form.gstin.trim().toUpperCase();
    const mobile = tenDigits(form.contactMobile.trim());
    if (business) {
        if (gstin && !GSTIN.test(gstin)) errors.gstin = "A GSTIN is 15 characters, like 22AAAAA0000A1Z5.";
        if (mobile && !/^[6-9]\d{9}$/.test(mobile)) errors.contactMobile = "The contact's mobile number is ten digits, starting 6 to 9.";
        if (form.contactEmail.trim() && !EMAIL.test(form.contactEmail.trim())) errors.contactEmail = "The contact's email does not look like an email address.";
    }

    const patch: PublisherPatch = {};
    const put = (key: "address" | "city" | "state" | "postalCode" | "contactName" | "contactEmail", next: string, was: string | null | undefined) => {
        if (next.trim() !== "" && next.trim() !== (was ?? "")) patch[key] = next.trim();
    };
    put("address", form.address, profile.address);
    put("city", form.city, profile.city);
    put("state", form.state, profile.state);
    put("postalCode", form.postalCode, profile.postalCode);
    if (business) {
        if (gstin && gstin !== (profile.gstin ?? "")) patch.gstin = gstin;
        put("contactName", form.contactName, profile.contactName);
        if (mobile && mobile !== (profile.contactMobile ?? "")) patch.contactMobile = mobile;
        put("contactEmail", form.contactEmail, profile.contactEmail);
    }
    /* Both or neither — never a half pair, and never cleared from here. */
    if (form.point && Number.isFinite(form.point.latitude) && Number.isFinite(form.point.longitude)) {
        patch.latitude = form.point.latitude;
        patch.longitude = form.point.longitude;
    }
    return { patch, errors };
}
