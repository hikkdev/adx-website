import type { Metadata } from "next";
import { ExploreView, type ExploreParams } from "./explore-view";

export const metadata: Metadata = {
    title: "Ad spaces",
    description: "Billboards, digital screens, transit and indoor advertising spaces across India — filter by place, dates, format and budget, then add them to a campaign.",
};

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) ?? "";

/**
 * DR 12 · 02 · Explore ad spaces (5204:49925). The URL is the state, so a
 * search is a link: `/spaces?city=Bengaluru&from=…&to=…&format=billboard`.
 */
export default async function SpacesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
    const p = await searchParams;
    const params: ExploreParams = {
        q: first(p.q),
        city: first(p.city),
        from: first(p.from),
        to: first(p.to),
        format: first(p.format),
        display: first(p.display),
        category: first(p.category),
        budgetMin: first(p.budgetMin),
        budgetMax: first(p.budgetMax),
        lit: first(p.lit),
        sort: first(p.sort),
        page: Number(first(p.page)) || 1,
        map: first(p.map) === "1",
    };
    return <ExploreView params={params} />;
}
