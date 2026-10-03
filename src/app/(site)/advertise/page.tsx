import type { Metadata } from "next";
import { cache } from "react";
import { apiConfig } from "@/lib/api-config";
import { metadataFrom, readLayoutServer } from "@/services/layouts";
import { rowsOf, type AdSlotInfo, type BoostPlacementInfo } from "@/services/promotions";
import { AdvertiseBody } from "./advertise-body";

const FALLBACK = {
    title: "Advertise with ADX",
    description: "Display ads in ADX's ad slots and sponsored listings at the top of search — flat rates per day plus GST, every placement labelled.",
};

type Search = Promise<Record<string, string | string[] | undefined>>;
const first = (value: string | string[] | undefined) => ((Array.isArray(value) ? value[0] : value) ?? "").trim();

/** PB-3: one read of the page's layout per render; a preview token asks for the draft. */
const layoutForRender = cache((preview: string) => readLayoutServer("WEB_ADVERTISE", preview ? { preview } : {}));

export async function generateMetadata({ searchParams }: { searchParams: Search }): Promise<Metadata> {
    const preview = first((await searchParams).preview);
    return metadataFrom((await layoutForRender(preview))?.meta, FALLBACK, { noindex: !!preview });
}

/** A public read on the server: never throws; anything but a good answer is null (the page then says prices are shown at booking). The prices are the console's: read again at most every five minutes. */
async function serverRead<T>(path: string): Promise<T[] | null> {
    try {
        const response = await fetch(`${apiConfig.baseUrl}${path}`, { next: { revalidate: 300 }, signal: AbortSignal.timeout(3000) });
        if (!response.ok) return null;
        const payload = (await response.json()) as { success?: boolean; data?: unknown };
        return rowsOf<T>(payload?.data);
    } catch {
        return null;
    }
}

/** LM-1 · Advertise with ADX: the display-ad slots and the sponsored placements on sale, with their prices; PB-3: in the `WEB_ADVERTISE` layout's order. */
export default async function AdvertisePage({ searchParams }: { searchParams: Search }) {
    const preview = first((await searchParams).preview);
    const [slots, placements, layout] = await Promise.all([serverRead<AdSlotInfo>("/promotions/slots"), serverRead<BoostPlacementInfo>("/promotions/boost/placements"), layoutForRender(preview)]);
    return <AdvertiseBody slots={slots} placements={placements} initialLayout={layout} preview={preview || null} />;
}
