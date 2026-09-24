import type { Metadata } from "next";
import { CreativeScreen } from "@/components/creative/creative-screen";

export const metadata: Metadata = { title: "Dates and cost" };

/** DR 12 · 05 · 06 · Campaign · Dates and cost (5204:69454) — the booking's flight, repriced as it changes. */
export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ return?: string }> }) {
    const { id } = await params;
    const { return: returnTo } = await searchParams;
    return <CreativeScreen campaignId={decodeURIComponent(id)} screen="dates" returnTo={returnTo ?? null} />;
}
