import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { metadataFrom } from "@/services/layouts";
import { readPageServer } from "@/services/pages";
import { PageView } from "./page-view";

type Params = Promise<{ key: string }>;
type Search = Promise<Record<string, string | string[] | undefined>>;

const first = (value: string | string[] | undefined): string => ((Array.isArray(value) ? value[0] : value) ?? "").trim();

/** One read per render, shared by the metadata and the page. */
const pageForRender = cache((key: string, preview: string | null, city: string | null) => readPageServer(key, { ...(preview ? { preview } : {}), ...(city ? { city } : {}) }));

async function ask(params: Params, searchParams: Search) {
    const { key } = await params;
    const query = await searchParams;
    return { key: decodeURIComponent(key), preview: first(query.preview) || null, city: first(query.city) || null };
}

/**
 * PB-4 (27 Sep 2026): a Studio page, served here and reached at its own
 * address (the proxy rewrites `/diwali` to `/pg/diwali`; `/pg/diwali` hit
 * directly is sent to `/diwali`). The version's SEO settings are the
 * page's metadata; a preview (`?preview=<token>`) shows the draft and
 * keeps search engines out. Nothing published, or archived, is the site's
 * 404; an ADX that does not answer says so rather than pretending the
 * page is gone.
 */
export async function generateMetadata({ params, searchParams }: { params: Params; searchParams: Search }): Promise<Metadata> {
    const { key, preview, city } = await ask(params, searchParams);
    const result = await pageForRender(key, preview, city);
    if (result.kind !== "page") return result.kind === "missing" ? { title: "Nothing here" } : { title: "ADX" };
    return metadataFrom(result.page.meta, { title: result.page.title }, { noindex: !!preview });
}

export default async function StudioPage({ params, searchParams }: { params: Params; searchParams: Search }) {
    const { key, preview, city } = await ask(params, searchParams);
    const result = await pageForRender(key, preview, city);
    if (result.kind === "missing") notFound();
    if (result.kind === "unreachable") {
        return (
            <div className="mx-auto max-w-[520px] px-6 py-24 text-center">
                <h1 className="text-[28px] font-semibold text-ink">ADX is not answering</h1>
                <p className="mt-2 text-sm text-dim">This page could not be read just now. Try again in a moment.</p>
            </div>
        );
    }
    return <PageView initial={result.page} pageKey={key} preview={preview} city={city} />;
}
