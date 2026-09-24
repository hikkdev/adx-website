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
