import type { Metadata } from "next";
import { CreativeScreen } from "@/components/creative/creative-screen";

export const metadata: Metadata = { title: "Design request" };

/** DR 12 · 05 · 07 · Design request · Status and next steps (5204:69760). */
export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ return?: string }> }) {
    const { id } = await params;
    const { return: returnTo } = await searchParams;
    return <CreativeScreen campaignId={decodeURIComponent(id)} screen="request" returnTo={returnTo ?? null} />;
}
