import type { Metadata } from "next";
import { CreativeScreen } from "@/components/creative/creative-screen";

export const metadata: Metadata = { title: "Design request sent" };

/** DR 12 · 05 · 04 · Design request sent (5204:68899). */
export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ return?: string }> }) {
    const { id } = await params;
    const { return: returnTo } = await searchParams;
    return <CreativeScreen campaignId={decodeURIComponent(id)} screen="sent" returnTo={returnTo ?? null} />;
}
