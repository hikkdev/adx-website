import { VerifyBusinessSubmitted } from "@/components/listing-form/verify-business";

/** DR 12 · 08 · 30 · Business details submitted (5204:82822). */
export default async function VerifyBusinessSubmittedPage({ searchParams }: { searchParams: Promise<{ doc?: string }> }) {
    const params = await searchParams;
    return <VerifyBusinessSubmitted documentName={params.doc ?? null} />;
}
