import { CustomFieldsSection } from "@/components/custom-fields/custom-fields-section";
import { ListingOverview } from "@/components/listing-form/listing-overview";

/**
 * DR 12 · 09 · 01 · Listing overview (5204:82990). CF-1: under it, "More
 * details" — the custom fields Settings › Custom fields shows on the
 * website for a listing, editable where the owner may.
 */
export default async function ListingPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    return (
        <>
            <ListingOverview listingId={id} />
            <div className="mx-auto mt-6 w-full max-w-[1384px]">
                <CustomFieldsSection entity="LISTING" entityId={id} />
            </div>
        </>
    );
}
