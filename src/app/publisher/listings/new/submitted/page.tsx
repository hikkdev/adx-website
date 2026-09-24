import { ListingSubmitted } from "@/components/listing-form/listing-submitted";

/** DR 12 · 08 · 24 · Listing in review (5204:81334). */
export default async function ListingSubmittedPage({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
    const params = await searchParams;
    return <ListingSubmitted listingId={params.id ?? null} />;
}
