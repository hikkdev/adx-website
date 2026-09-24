import type { Metadata } from "next";
import { ListingView } from "./listing-view";

export const metadata: Metadata = { title: "Ad space" };

/**
 * DR 12 · 02 · one ad space (5228:3468 "Whitefield roadside billboard"):
 * the gallery, the overview with its map, what is included, the reviews,
 * the FAQs and similar spaces down the left; the price, the publisher, the
 * booking calculator and the two CTAs down the right. `id` is the spot's
 * display id (`LST-…`) as the browse links it, or its record id.
 */
export default async function ListingPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    return <ListingView id={decodeURIComponent(id)} />;
}
