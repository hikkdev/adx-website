import { notFound } from "next/navigation";
import { EditSection } from "@/components/listing-form/edit-section";
import { isEditSection } from "@/components/listing-form/form-model";

/** DR 12 · 09 · 02–12 · one section of a listing, edited. */
export default async function EditListingSectionPage({ params }: { params: Promise<{ id: string; section: string }> }) {
    const { id, section } = await params;
    if (!isEditSection(section)) notFound();
    return <EditSection listingId={id} section={section} />;
}
