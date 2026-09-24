import { api } from "@/lib/api-client";

/**
 * The side an account works on, as the apps choose it after the first
 * sign-in (`POST /users/me/party`, the onboarding ladder's first question).
 * Choosing opens that side — or claims the row an agent opened for this
 * number — grants the role, and answers a re-signed token carrying it.
 */
export type Party = "PUBLISHER" | "ADVERTISER";
export type AccountType = "INDIVIDUAL" | "BUSINESS" | "ORGANISATION";

export interface PartyChoice {
    party: Party;
    accountType: AccountType;
    profileId: string;
    displayId: string | null;
    created: boolean;
    accessToken?: string;
}

export interface AdvertiserMe {
    id: string;
    displayId: string | null;
    name: string;
    type: AccountType | string;
    kycStatus: string;
    email?: string | null;
    mobile?: string | null;
    city?: string | null;
}

export interface PublisherMe {
    id: string;
    displayId: string | null;
    name: string;
    type: AccountType | string;
    kycStatus: string;
    onboardingStatus?: string;
    email?: string | null;
    mobile?: string | null;
    city?: string | null;
}

export const partyService = {
    choose: (input: { party: Party; accountType: AccountType; name?: string }) => api.post<PartyChoice>("/users/me/party", input),
    advertiser: () => api.get<AdvertiserMe>("/advertisers/me"),
    publisher: () => api.get<PublisherMe>("/publishers/me"),
};
