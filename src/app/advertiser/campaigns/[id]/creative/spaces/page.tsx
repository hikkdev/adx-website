import type { Metadata } from "next";
import { CreativeScreen } from "@/components/creative/creative-screen";

export const metadata: Metadata = { title: "Selected ad spaces" };

/** DR 12 · 05 · 05 · Campaign · Selected locations (5204:69172) — the booking's spaces, editable. */
export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ return?: string }> }) {
    const { id } = await params;
    const { return: returnTo } = await searchParams;
    return <CreativeScreen campaignId={decodeURIComponent(id)} screen="spaces" returnTo={returnTo ?? null} />;
}
