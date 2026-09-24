import { ListingOverview } from "@/components/listing-form/listing-overview";

/** DR 12 · 09 · 01 · Listing overview (5204:82990). */
export default async function ListingPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    return <ListingOverview listingId={id} />;
}
