import { splitBillingAddress, type AdvertiserPatch, type AdvertiserProfile } from "@/services/booking";

/** The details a person chose not to save to their profile, kept for this campaign's invoice summary in this browser only. */
export interface BillingDraft {
    legalName: string;
    email: string;
    street: string;
    city: string;
    postalCode: string;
    state: string;
    gstin: string;
}

const key = (campaignId: string) => `adx.web.billing.${campaignId}`;

export const billingDraft = {
    read(campaignId: string): BillingDraft | null {
        try {
            const raw = window.sessionStorage.getItem(key(campaignId));
            return raw ? (JSON.parse(raw) as BillingDraft) : null;
        } catch {
            return null;
        }
    },
    write(campaignId: string, draft: BillingDraft | null) {
        try {
            if (draft) window.sessionStorage.setItem(key(campaignId), JSON.stringify(draft));
            else window.sessionStorage.removeItem(key(campaignId));
        } catch {
            /* ignore */
        }
    },
};

/**
 * What the checkout's billing form opens with (29 Sep 2026): a draft kept
 * in this browser first; else the advertiser row. The PIN is the row's own
 * `postalCode` column (AD-1) — on a row saved before it, the six digits the
 * one address line ended with. The email falls back to the account's own
 * proven address when the advertiser row has none, so it is never asked twice.
 */
export function billingSeed(input: { draft: BillingDraft | null; advertiser: AdvertiserProfile | null; accountEmail?: string | null; fallbackCity?: string | null }): BillingDraft {
    const { draft, advertiser } = input;
    const address = splitBillingAddress(advertiser?.billingAddress);
    return {
        legalName: draft?.legalName ?? advertiser?.companyName ?? advertiser?.name ?? "",
        email: draft?.email ?? (advertiser?.email?.trim() || input.accountEmail?.trim() || ""),
        street: draft?.street ?? address.street,
        city: draft?.city ?? (advertiser?.city || input.fallbackCity || ""),
        postalCode: draft?.postalCode ?? (advertiser?.postalCode?.trim() || address.postalCode),
        state: draft?.state ?? advertiser?.state ?? "",
        gstin: draft?.gstin ?? advertiser?.gstin ?? "",
    };
}

/**
 * "Save these details to my business profile" — the `PATCH
 * /advertisers/:id` body: the street in `billingAddress`, the PIN in its
 * own `postalCode` column (cleared when the box is emptied, as the account
 * page clears it), the legal name as the company's — or, for an
 * individual, as the account's name.
 */
export function billingPatchOf(values: BillingDraft, advertiser: Pick<AdvertiserProfile, "type" | "postalCode">): AdvertiserPatch {
    return {
        ...(advertiser.type === "INDIVIDUAL" ? { name: values.legalName } : { companyName: values.legalName }),
        ...(values.email ? { email: values.email } : {}),
        billingAddress: values.street,
        ...(values.postalCode ? { postalCode: values.postalCode } : advertiser.postalCode ? { postalCode: null } : {}),
        city: values.city,
        ...(values.state ? { state: values.state } : {}),
        ...(values.gstin ? { gstin: values.gstin } : {}),
    };
}
