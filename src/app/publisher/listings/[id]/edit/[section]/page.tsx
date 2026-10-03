import { notFound } from "next/navigation";
import { EditSection } from "@/components/listing-form/edit-section";
import { isEditSection } from "@/components/listing-form/form-model";

/** DR 12 · 09 · 02–12 · one section of a listing, edited; `?rate=` puts a daily rate in the price (the below-the-floor card's "Raise the rate"). */
export default async function EditListingSectionPage({ params, searchParams }: { params: Promise<{ id: string; section: string }>; searchParams: Promise<{ rate?: string }> }) {
    const { id, section } = await params;
    const { rate } = await searchParams;
    if (!isEditSection(section)) notFound();
    return <EditSection listingId={id} section={section} prefillRate={rate ?? null} />;
}
