"use client";

import * as React from "react";
import Link from "next/link";
import { Newspaper } from "lucide-react";
import { LayoutBlocks } from "@/components/layout/layout-blocks";
import { useLayout } from "@/components/layout/use-layout";
import { GuidesStrip } from "@/components/site/guides-strip";
import { Rail } from "@/components/site/rail";
import { usePageHref } from "@/lib/site-links";
import { browseService, categoryTiles, spacesCount, spacesHref, stripVenues, type BrowseCategory, type CategoryTile, type VenueTile } from "@/services/browse";
import type { Layout } from "@/services/layouts";

/**
 * "Ways to reach your audience" (5204:53182): the five format cards, each
 * opening Explore filtered to that format, now carrying how many live
 * spaces stand behind it — the category read's counts, and the browse's
 * total for the digital card (the DIGITAL display facet cuts across the
 * four categories). Under them, the sub-categories (venue types) the
 * app's home strip draws, counted ones first.
 */
const FORMATS: { title: string; blurb: string; category: BrowseCategory | null; display?: "DIGITAL"; photo: string | null }[] = [
    { title: "Outdoor", blurb: "Billboards & roadside displays", category: "OUTDOOR", photo: "/design/format-outdoor.jpg" },
    { title: "Indoor", blurb: "Malls, offices & venues", category: "INDOOR", photo: "/design/format-indoor.jpg" },
    { title: "Transit", blurb: "Buses & moving media", category: "TRANSIT", photo: "/design/format-transit.jpg" },
    { title: "Digital screens", blurb: "Scheduled video & display", category: null, display: "DIGITAL", photo: "/design/format-digital.jpg" },
    { title: "Media", blurb: "Radio, press & television", category: "MEDIA", photo: null },
];

/**
 * LM-1: the page's two live sections are separate layout blocks
 * (`format_cards`, `venue_tiles`), so each reads its own counts — the
 * layout may put anything between them, or leave one out.
 */
export function FormatCards({ title }: { title?: string | null }) {
    const [categories, setCategories] = React.useState<CategoryTile[] | null>(null);
    const [digital, setDigital] = React.useState<number | null>(null);

    React.useEffect(() => {
        let cancelled = false;
        browseService
            .categories()
            .then((read) => !cancelled && setCategories(categoryTiles(read)))
            .catch(() => !cancelled && setCategories([]));
        browseService
            .browse({ display: "DIGITAL", pageSize: 1 })
            .then((page) => !cancelled && setDigital(page.total))
            .catch(() => undefined);
        return () => {
            cancelled = true;
        };
    }, []);

    const countOf = (format: (typeof FORMATS)[number]): number | null => {
        if (format.display === "DIGITAL") return digital;
        const tile = categories?.find((c) => c.category === format.category);
        return tile ? tile.count : categories ? 0 : null;
    };
    const photoOf = (format: (typeof FORMATS)[number]) => format.photo ?? categories?.find((c) => c.category === format.category)?.photoUrl ?? null;

    return (
        <Rail title={title ?? "Ways to reach your audience"} titleClassName="max-w-[387px]">
            {FORMATS.map((format) => {
                const count = countOf(format);
                const photo = photoOf(format);
                return (
                    <Link
                        key={format.title}
                        href={spacesHref({ category: format.category, display: format.display })}
                        className="relative flex h-[360px] min-w-[240px] flex-1 basis-0 snap-start flex-col justify-end overflow-hidden rounded-[8px] bg-[#f1f1ee] p-6 hover:shadow-card"
                        style={photo ? undefined : { backgroundColor: "#6e0e14" }}
                    >
                        {photo ? (
                            <img src={photo} alt="" className="absolute inset-0 size-full object-cover" loading="lazy" />
                        ) : (
                            <Newspaper className="absolute left-1/2 top-[90px] size-[132px] -translate-x-1/2 text-white" strokeWidth={1.25} aria-hidden />
                        )}
                        <div aria-hidden className="absolute inset-x-0 bottom-0 h-[262px] bg-gradient-to-t from-[rgba(0,0,0,0.6)] to-transparent" />
                        {count !== null && <span className="absolute right-4 top-4 rounded-full bg-white/95 px-3 py-1 text-xs font-semibold text-[#17171a]">{spacesCount(count)}</span>}
                        <div className="relative">
                            <p className="text-2xl font-semibold leading-8 text-white">{format.title}</p>
                            <p className="mt-0.5 text-sm font-medium leading-5 text-white">{format.blurb}</p>
                        </div>
                    </Link>
                );
            })}
        </Rail>
    );
}

export function VenueTiles({ title }: { title?: string | null }) {
    const href = usePageHref();
    const [venues, setVenues] = React.useState<VenueTile[]>([]);

    React.useEffect(() => {
        let cancelled = false;
        browseService
            .venues()
            .then((read) => !cancelled && setVenues(stripVenues(read.items)))
            .catch(() => undefined);
        return () => {
            cancelled = true;
        };
    }, []);

    if (venues.length === 0) return null;
    return (
        <div>
            <Rail title={title ?? "Find a space by where it stands"} titleClassName="max-w-[420px]" gap={16}>
                {venues.map((venue) => (
                    <Link
                        key={venue.venueTypeId}
                        href={spacesHref({ category: venue.category, venueTypeId: venue.venueTypeId })}
                        title={venue.name}
                        className="group relative flex h-[220px] w-[200px] shrink-0 snap-start flex-col justify-end overflow-hidden rounded-[8px] bg-[#f1f1ee] p-4 hover:shadow-card"
                    >
                        {venue.photoUrl && <img src={venue.photoUrl} alt="" loading="lazy" className="absolute inset-0 size-full object-cover transition-transform group-hover:scale-[1.03]" />}
                        <div aria-hidden className="absolute inset-x-0 bottom-0 h-[150px] bg-gradient-to-t from-[rgba(0,0,0,0.6)] to-transparent" />
                        <div className="relative">
                            <p className="text-base font-semibold leading-6 text-white">{venue.label}</p>
                            <p className="text-xs font-medium text-white/85">{spacesCount(venue.count)}</p>
                        </div>
                    </Link>
                ))}
            </Rail>
            <Link href={href("categories")} className="mt-5 inline-block text-sm font-medium text-ink underline underline-offset-2 hover:text-brand">
                See every category and sub-category →
            </Link>
        </div>
    );
}

/** The page's blocks in the layout's order — the hero comes from the server as it was. PB-2: `preview` is a Studio token for the draft. */
export function FormatsBlocks({ initial, hero, preview = null }: { initial: Layout | null; hero: React.ReactNode; preview?: string | null }) {
    const layout = useLayout("WEB_FORMATS", { initial, preview });
    return (
        <LayoutBlocks
            surface="WEB_FORMATS"
            layout={layout}
            gapClassName="pt-16"
            system={{
                formats_hero: hero,
                format_cards: (title) => <FormatCards title={title} />,
                venue_tiles: (title) => <VenueTiles title={title} />,
                guides_strip: (title) => <GuidesStrip title={title} />,
            }}
        />
    );
}
