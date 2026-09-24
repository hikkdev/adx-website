import { api } from "@/lib/api-client";
import type { PublisherMe } from "./party";

/**
 * The publisher's own side — `/publishers/me/*`, the routes the ADX app's
 * publisher home reads. The dashboard read carries the counts the overview
 * draws; the listings read is the inventory.
 */
export interface PublisherListing {
    id: string;
    displayId: string | null;
    title: string;
    status: string;
    category: string;
    city: string | null;
    ratePerDay: string | null;
    photos?: { url: string }[] | string[];
    createdAt: string;
}

export interface PublisherDashboard {
    listings?: { total: number; active: number; pendingReview?: number; draft?: number };
    bookings?: { upcoming?: number; active?: number; pending?: number };
    earnings?: { available?: string; pending?: string; lifetime?: string };
    [key: string]: unknown;
}

export const publisherService = {
    me: () => api.get<PublisherMe>("/publishers/me"),
    dashboard: () => api.get<PublisherDashboard>("/publishers/me/dashboard"),
    listings: async (): Promise<PublisherListing[]> => {
        const answer = await api.get<{ items: PublisherListing[] } | PublisherListing[]>("/publishers/me/listings?pageSize=100");
        return Array.isArray(answer) ? answer : answer.items;
    },
};
