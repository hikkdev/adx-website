import type { Metadata } from "next";
import { ListingView } from "./listing-view";

export const metadata: Metadata = { title: "Ad space" };

/**
 * DR 12 · 02 · one ad space (5228:3468 "Whitefield roadside billboard"):
 * the gallery, the overview with its map, what is included, the reviews,
 * the FAQs and similar spaces down the left; the price, the publisher, the
 * booking calculator and the two CTAs down the right. `id` is the spot's
 * display id (`LST-…`) as the browse links it, or its record id; `from`/`to`
 * (YYYY-MM-DD) are the visitor's dates when Explore had some.
 */
export default async function ListingPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
    const { id } = await params;
    const query = await searchParams;
    const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) ?? null;
    /* AV-1: the dates Explore was asked for ride along (`?from=…&to=…`), so the calendar can say whether they fit. */
    return <ListingView id={decodeURIComponent(id)} initialDates={{ from: first(query.from), to: first(query.to) }} />;
}
