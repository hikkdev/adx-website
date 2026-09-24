import { ListingFixes } from "@/components/listing-form/listing-fixes";

/** DR 12 · 08 · 26 · Requested updates (5204:82071). */
export default async function ListingFixesPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    return <ListingFixes listingId={id} />;
}
