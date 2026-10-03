import type { Metadata } from "next";
import { cache } from "react";
import { metadataFrom, readLayoutServer } from "@/services/layouts";
import { CategoriesView } from "./categories-view";

const FALLBACK = {
    title: "All categories",
    description: "Every kind of advertising space on ADX — billboards, indoor venues, transit and media — with how many are live in your city.",
};

type Search = Promise<Record<string, string | string[] | undefined>>;
const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) ?? "";

/** PB-3: one read of the page's layout per render, shared by the metadata and the page; a preview token asks for the draft. */
const layoutForRender = cache((city: string, preview: string) => readLayoutServer("WEB_CATEGORIES", { ...(city ? { city } : {}), ...(preview ? { preview } : {}) }));

export async function generateMetadata({ searchParams }: { searchParams: Search }): Promise<Metadata> {
    const p = await searchParams;
    const preview = first(p.preview).trim();
    const layout = await layoutForRender(first(p.city).trim(), preview);
    return metadataFrom(layout?.meta, FALLBACK, { noindex: !!preview });
}

/**
 * The app's All Categories grid (4373:466, owner decision 107): category by
 * place, each tile counting the live spaces it holds there, and every
 * sub-category under the category it belongs to. `?city=` or
 * `?lat=&lng=&radius=` is the place; neither is all of India. PB-3: the
 * heading and the tiles are the `WEB_CATEGORIES` layout's sections.
 */
export default async function CategoriesPage({ searchParams }: { searchParams: Search }) {
    const p = await searchParams;
    const city = first(p.city).trim();
    const [lat, lng, radius] = [first(p.lat), first(p.lng), first(p.radius)];
    const preview = first(p.preview).trim();
    const layout = await layoutForRender(city, preview);
    return <CategoriesView key={`${city}|${lat}|${lng}|${radius}`} city={city} lat={lat} lng={lng} radius={radius} initialLayout={layout} preview={preview || null} />;
}
