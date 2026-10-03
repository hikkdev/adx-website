import type { Metadata } from "next";
import { cache } from "react";
import { metadataFrom, readLayoutServer } from "@/services/layouts";
import { FormatsBlocks } from "./formats-live";
import { FormatsSearch } from "./formats-search";

const FALLBACK = {
    title: "Advertising formats",
    description: "Outdoor, indoor, transit, digital screens and media — choose a format around your audience, your location and the story you want to tell, then open the spaces that carry it.",
};

type Search = Promise<Record<string, string | string[] | undefined>>;
const first = (value: string | string[] | undefined) => ((Array.isArray(value) ? value[0] : value) ?? "").trim();

/** LM-1: the layout a visitor sees, kept a minute; PB-2: a preview token asks for the draft, and the version's SEO settings are the page's. */
const layoutForRender = cache((preview: string) => readLayoutServer("WEB_FORMATS", preview ? { preview } : {}));

export async function generateMetadata({ searchParams }: { searchParams: Search }): Promise<Metadata> {
    const preview = first((await searchParams).preview);
    return metadataFrom((await layoutForRender(preview))?.meta, FALLBACK, { noindex: !!preview });
}

/**
 * DR 12 · 03 · Find your advertising format (5204:50175). LM-1: the hero,
 * the format cards, the venue tiles and the guides are layout blocks, in
 * the order ADX publishes (`WEB_FORMATS`), with anything ADX adds between
 * them; a layout that cannot be read leaves today's order.
 */
export default async function FormatsPage({ searchParams }: { searchParams: Search }) {
    const preview = first((await searchParams).preview);
    const layout = await layoutForRender(preview);
    return (
        <div className="bg-white">
            <div className="relative overflow-hidden">
                <div className="relative mx-auto max-w-[1920px]">
                    <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 hidden h-[760px] lg:block">
                        <div className="absolute left-[67.3%] top-[33px] h-[620px] w-[626px] rounded-bl-[24px] bg-gradient-to-b from-white to-[#f5f5f3]" />
                        <img src="/design/hero-globe.png" alt="" className="absolute right-0 top-[-50px] w-[627px] max-w-none opacity-70" />
                        <img src="/design/hero-arc.svg" alt="" className="absolute left-[67.8%] top-[89px] w-[1004px] max-w-none" />
                        <img src="/design/hero-arrow.svg" alt="" className="absolute left-[73.2%] top-[77px] w-[18px]" />
                    </div>

                    <div className="relative px-6 pb-16 pt-[115px] lg:px-16">
                        <div className="mx-auto max-w-[1480px]">
                            <FormatsBlocks
                                initial={layout}
                                preview={preview || null}
                                hero={
                                    <section className="mx-auto max-w-[680px] pb-[50px] pt-[30px] text-center">
                                        <h1 className="text-[48px] font-extrabold leading-[56px] tracking-[-1.6px] text-ink">Find your kind of space.</h1>
                                        <p className="mx-auto mt-2.5 max-w-[524px] text-lg leading-6 text-dim">Choose a format around your audience, your location and the story you want to tell.</p>
                                        <FormatsSearch className="mx-auto mt-[45px] max-w-[560px]" />
                                    </section>
                                }
                            />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
