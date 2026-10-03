import { api } from "@/lib/api-client";
import type { PublisherMe } from "./party";
import type { MyListing, MyListingsPage, PublisherDashboard } from "./publisher-workspace";

/**
 * The publisher's own side — `/publishers/me/*`, the routes the ADX app's
 * publisher home reads. The shapes live in `publisher-workspace.ts`, which
 * the workspace pages use; this is the thin read a page outside the
 * workspace can take without the rest of it.
 */
export type { PublisherDashboard };
export type PublisherListing = MyListing;

export const publisherService = {
    me: () => api.get<PublisherMe>("/publishers/me"),
    dashboard: () => api.get<PublisherDashboard>("/publishers/me/dashboard"),
    listings: async (): Promise<PublisherListing[]> => (await api.get<MyListingsPage>("/publishers/me/listings?pageSize=100")).items,
};
