import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { listDocSlugs, readDoc } from "@/lib/site-docs";

/**
 * /contact, /privacy, /terms, /refund and every page the console presses
 * into `public/` — one route, the site's own header and footer around the
 * document's words. Only the pages that exist are served; anything else is
 * the site's 404.
 */
export const dynamicParams = false;

export function generateStaticParams(): { doc: string }[] {
    return listDocSlugs().map((doc) => ({ doc }));
}

export async function generateMetadata({ params }: { params: Promise<{ doc: string }> }): Promise<Metadata> {
    const doc = readDoc((await params).doc);
    if (!doc) return {};
    return { title: doc.title, ...(doc.description ? { description: doc.description } : {}) };
}

export default async function DocPage({ params }: { params: Promise<{ doc: string }> }) {
    const doc = readDoc((await params).doc);
    if (!doc) notFound();
    return (
        // The words are ours: hand-written files, or Markdown the press escaped before rendering.
        <article className="site-doc mx-auto max-w-[880px] px-6 pb-20 pt-14 lg:px-0" dangerouslySetInnerHTML={{ __html: doc.bodyHtml }} />
    );
}
