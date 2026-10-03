import type { Metadata } from "next";
import { cache } from "react";
import { ExploreView } from "./explore-view";
import { metadataFrom, readLayoutServer } from "@/services/layouts";
import { isLanding, parseExploreParams } from "./explore-params";

const FALLBACK = {
    title: "Ad spaces",
    description: "Billboards, digital screens, transit and indoor advertising spaces across India — filter by place, dates, format and budget, then add them to a campaign.",
};

type Search = Promise<Record<string, string | string[] | undefined>>;
const first = (value: string | string[] | undefined) => ((Array.isArray(value) ? value[0] : value) ?? "").trim();

/** LM-1: the landing's layout, as a visitor sees it, read once per render; PB-2: a preview token asks for the draft. */
const layoutForRender = cache((city: string | null, preview: string) => readLayoutServer("WEB_EXPLORE", { city, ...(preview ? { preview } : {}) }));

export async function generateMetadata({ searchParams }: { searchParams: Search }): Promise<Metadata> {
    const raw = await searchParams;
    const params = parseExploreParams(raw);
    const preview = first(raw.preview);
    const layout = isLanding(params) ? await layoutForRender(params.city || null, preview) : null;
    return metadataFrom(layout?.meta, FALLBACK, { noindex: !!preview });
}

/**
 * DR 12 · 02 · Explore ad spaces (5204:49925). The URL is the state, so a
 * search is a link: `/spaces?city=Bengaluru&from=…&to=…&category=OUTDOOR`,
 * one publisher's spaces are `/spaces?publisherId=…`, and a search around
 * the browser's position is `/spaces?lat=…&lng=…&radius=15`.
 */
export default async function SpacesPage({ searchParams }: { searchParams: Search }) {
    const raw = await searchParams;
    const params = parseExploreParams(raw);
    const preview = first(raw.preview);
    /* LM-1: the landing's layout, as a visitor sees it, read here so a visitor's first paint is already in order. */
    const initialLayout = isLanding(params) ? await layoutForRender(params.city || null, preview) : undefined;
    return <ExploreView params={params} initialLayout={initialLayout} preview={preview || null} />;
}
