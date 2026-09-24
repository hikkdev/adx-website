import { ListingWizard } from "@/components/listing-form/listing-wizard";

/** DR 12 · 08 · Add a listing: `?step=` names the screen, `?draft=` the saved draft. */
export default async function NewListingPage({ searchParams }: { searchParams: Promise<{ step?: string; draft?: string }> }) {
    const params = await searchParams;
    return <ListingWizard step={params.step ?? null} draftId={params.draft ?? null} />;
}
