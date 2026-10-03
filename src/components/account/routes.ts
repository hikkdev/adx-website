import type { Party } from "@/services/party";

/**
 * Where each side's account and support pages live, so one set of
 * components mounted three times links to its own side's pages.
 */
export const BASE_OF: Record<Party, string> = { ADVERTISER: "/advertiser", PUBLISHER: "/publisher", PRINT_PARTNER: "/partner" };

/** The side's help hub. */
export const helpHref = (party: Party): string => `${BASE_OF[party]}/help`;

/** One support ticket's own page: the advertiser's are "My requests", the others' live under Help. */
export function ticketHref(party: Party, ticketId: string): string {
    return party === "ADVERTISER" ? `/advertiser/requests/${encodeURIComponent(ticketId)}` : `${BASE_OF[party]}/help/${encodeURIComponent(ticketId)}`;
}

/** Where the side's list of tickets is. */
export function ticketsHref(party: Party): string {
    return party === "ADVERTISER" ? "/advertiser/requests" : `${BASE_OF[party]}/help`;
}

/** The side's "report an issue" form. */
export function reportHref(party: Party, category?: string): string {
    if (party === "ADVERTISER") return `/advertiser/requests/new${category ? `?category=${encodeURIComponent(category)}` : ""}`;
    return `${BASE_OF[party]}/help/new${category ? `?category=${encodeURIComponent(category)}` : ""}`;
}

/** The dispute pages exist for the two sides that hold orders. */
export function disputesHref(party: Party): string | null {
    return party === "PRINT_PARTNER" ? null : `${BASE_OF[party]}/disputes`;
}
