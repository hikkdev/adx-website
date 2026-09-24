import { ListingStatus } from "@/components/listing-form/listing-status";

/** DR 12 · 08 · 25/27/28 · Listing review status, updates needed, approved. */
export default async function ListingStatusPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    return <ListingStatus listingId={id} />;
}
