import type { Metadata } from "next";
import { CreativeScreen } from "@/components/creative/creative-screen";

export const metadata: Metadata = { title: "Audience" };

/** DR 12 · 05 · 02 · Audience (5204:68330). */
export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ return?: string }> }) {
    const { id } = await params;
    const { return: returnTo } = await searchParams;
    return <CreativeScreen campaignId={decodeURIComponent(id)} screen="audience" returnTo={returnTo ?? null} />;
}
