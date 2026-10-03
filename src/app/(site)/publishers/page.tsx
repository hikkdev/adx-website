import type { Metadata } from "next";
import { cache } from "react";
import { metadataFrom, readLayoutServer } from "@/services/layouts";
import { PublishersBlocks } from "./publishers-live";

const FALLBACK = {
    title: "For publishers",
    description: "List your advertising spaces on ADX. Manage availability, bookings and delivery from your publisher account — from your first listing to your first booking.",
};

type Search = Promise<Record<string, string | string[] | undefined>>;
const first = (value: string | string[] | undefined) => ((Array.isArray(value) ? value[0] : value) ?? "").trim();

/** PB-3: one read of the page's layout per render; a preview token asks for the draft. */
const layoutForRender = cache((preview: string) => readLayoutServer("WEB_PUBLISHERS", preview ? { preview } : {}));

export async function generateMetadata({ searchParams }: { searchParams: Search }): Promise<Metadata> {
    const preview = first((await searchParams).preview);
    return metadataFrom((await layoutForRender(preview))?.meta, FALLBACK, { noindex: !!preview });
}

/** DR 12 · 05 · List your advertising spaces (5204:58050); PB-3: its sections in the `WEB_PUBLISHERS` layout's order. */
export default async function PublishersPage({ searchParams }: { searchParams: Search }) {
    const preview = first((await searchParams).preview);
    const layout = await layoutForRender(preview);
    return <PublishersBlocks initial={layout} preview={preview || null} />;
}
