import type { Metadata } from "next";
import { CreativeScreen } from "@/components/creative/creative-screen";

export const metadata: Metadata = { title: "Design brief" };

/** DR 12 · 05 · 01 · Design brief (5204:68087) — creative assistance on one campaign starts here. */
export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ return?: string }> }) {
    const { id } = await params;
    const { return: returnTo } = await searchParams;
    return <CreativeScreen campaignId={decodeURIComponent(id)} screen="brief" returnTo={returnTo ?? null} />;
}
