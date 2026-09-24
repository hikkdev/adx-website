import type { Metadata } from "next";
import Link from "next/link";
import { Newspaper } from "lucide-react";
import { Rail } from "@/components/site/rail";
import { GuidesStrip } from "@/components/site/guides-strip";
import { FormatsSearch } from "./formats-search";

export const metadata: Metadata = {
    title: "Advertising formats",
    description: "Outdoor, indoor, transit, digital screens and media — choose a format around your audience, your location and the story you want to tell, then open the spaces that carry it.",
};

/**
 * "Ways to reach your audience" (5204:53182): the five format cards. Each
 * one opens Explore filtered to that format; the digital card is the
 * DIGITAL display facet, which cuts across the four categories.
 */
const FORMATS: { title: string; blurb: string; href: string; photo: string | null }[] = [
    { title: "Outdoor", blurb: "Billboards & roadside displays", href: "/spaces?category=OUTDOOR", photo: "/design/format-outdoor.jpg" },
    { title: "Indoor", blurb: "Malls, offices & venues", href: "/spaces?category=INDOOR", photo: "/design/format-indoor.jpg" },
    { title: "Transit", blurb: "Buses & moving media", href: "/spaces?category=TRANSIT", photo: "/design/format-transit.jpg" },
    { title: "Digital screens", blurb: "Scheduled video & display", href: "/spaces?display=DIGITAL", photo: "/design/format-digital.jpg" },
    { title: "Media", blurb: "Radio, press & television", href: "/spaces?category=MEDIA", photo: null },
];

/** DR 12 · 03 · Find your advertising format (5204:50175). */
export default function FormatsPage() {
    return (
        <div className="bg-white">
            <div className="relative overflow-hidden">
                <div className="relative mx-auto max-w-[1920px]">
                    <div aria-hidden className="pointer-events-none absolute inset-0 hidden lg:block">
                        <div className="absolute left-[67.3%] top-[33px] h-[620px] w-[626px] rounded-bl-[24px] bg-gradient-to-b from-white to-[#f5f5f3]" />
                        <img src="/design/hero-globe.png" alt="" className="absolute right-0 top-[-50px] w-[627px] max-w-none opacity-70" />
                        <img src="/design/hero-arc.svg" alt="" className="absolute left-[67.8%] top-[89px] w-[1004px] max-w-none" />
                        <img src="/design/hero-arrow.svg" alt="" className="absolute left-[73.2%] top-[77px] w-[18px]" />
                    </div>

                    <div className="relative px-6 lg:px-16">
                        <section className="mx-auto max-w-[680px] pt-[145px] text-center">
                            <h1 className="text-[48px] font-extrabold leading-[56px] tracking-[-1.6px] text-ink">Find your kind of space.</h1>
                            <p className="mx-auto mt-2.5 max-w-[524px] text-lg leading-6 text-dim">Choose a format around your audience, your location and the story you want to tell.</p>
                            <FormatsSearch className="mx-auto mt-[45px] max-w-[560px]" />
                        </section>

                        <div className="mx-auto max-w-[1480px]">
                            <Rail title="Ways to reach your audience" titleClassName="max-w-[387px]" className="pt-[115px]">
                                {FORMATS.map((format) => (
                                    <Link
                                        key={format.title}
                                        href={format.href}
                                        className="relative flex h-[360px] min-w-[240px] flex-1 basis-0 snap-start flex-col justify-end overflow-hidden rounded-[8px] bg-[#f1f1ee] p-6 hover:shadow-card"
                                        style={format.photo ? undefined : { backgroundColor: "#6e0e14" }}
                                    >
                                        {format.photo ? (
                                            <img src={format.photo} alt="" className="absolute inset-0 size-full object-cover" loading="lazy" />
                                        ) : (
                                            <Newspaper className="absolute left-1/2 top-[90px] size-[132px] -translate-x-1/2 text-white" strokeWidth={1.25} aria-hidden />
                                        )}
                                        <div aria-hidden className="absolute inset-x-0 bottom-0 h-[262px] bg-gradient-to-t from-[rgba(0,0,0,0.6)] to-transparent" />
                                        <div className="relative">
                                            <p className="text-2xl font-semibold leading-8 text-white">{format.title}</p>
                                            <p className="mt-0.5 text-sm font-medium leading-5 text-white">{format.blurb}</p>
                                        </div>
                                    </Link>
                                ))}
                            </Rail>
                        </div>
                    </div>
                </div>
            </div>

            <div className="mx-auto max-w-[1920px] px-6 lg:px-16">
                <div className="mx-auto max-w-[1480px]">
                    <GuidesStrip className="pb-16 pt-6" />
                </div>
            </div>
        </div>
    );
}
