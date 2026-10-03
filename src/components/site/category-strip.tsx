"use client";

import * as React from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, LayoutGrid } from "lucide-react";
import { cn } from "@/lib/utils";
import { CATEGORY_LABEL, spacesCount, stripMosaic, type BrowseCategory, type CategoryTile, type MosaicPlacement, type VenueTile } from "@/services/browse";

/**
 * The explore home's tiles (the app's QR-20/21 strip), stacked two rows
 * deep and scrolling sideways (the owner, 27 Sep 2026: "double stack"): the
 * All door standing tall, each category a wide tile over two of its own
 * sub-categories, then the other sub-categories two to a column — the
 * layout is `stripMosaic` in services/browse. Each
 * tile is a link that cuts the browse to it (`category`, or `venueTypeId`
 * with its category), so the counts are the backend's and the tile never
 * searches for a word the listing does not carry.
 */
export function CategoryStrip({
    categories,
    venues,
    selectedCategory,
    selectedVenue,
    categoryHref,
    venueHref,
    allHref,
    className,
}: {
    /** Null while the read is out. */
    categories: CategoryTile[] | null;
    venues: VenueTile[];
    selectedCategory: BrowseCategory | null;
    selectedVenue: string | null;
    categoryHref: (category: BrowseCategory | null) => string;
    venueHref: (venue: VenueTile) => string;
    allHref: string;
    className?: string;
}) {
    const track = React.useRef<HTMLDivElement>(null);
    const page = (direction: -1 | 1) => track.current?.scrollBy({ left: direction * track.current.clientWidth * 0.8, behavior: "smooth" });
    const mosaic = categories ? stripMosaic(categories, venues) : null;
    const place = (placement: Pick<MosaicPlacement, "column" | "row" | "span">): React.CSSProperties => ({
        gridColumn: `${placement.column} / span ${placement.span}`,
        gridRow: placement.row === "both" ? "1 / span 2" : `${placement.row}`,
    });

    return (
        <div className={cn("relative", className)}>
            <div className="mb-3 flex items-center justify-between gap-4">
                <p className="text-xs font-bold uppercase tracking-[0.8px] text-dim">Browse by category</p>
                <div className="flex items-center gap-2">
                    <Link href={allHref} className="text-sm font-medium text-ink underline underline-offset-2 hover:text-brand">
                        All categories
                    </Link>
                    <button type="button" aria-label="Scroll categories back" onClick={() => page(-1)} className="hidden size-8 items-center justify-center rounded-[8px] border border-line bg-white text-ink hover:border-ink md:flex">
                        <ChevronLeft className="size-4" aria-hidden />
                    </button>
                    <button type="button" aria-label="Scroll categories on" onClick={() => page(1)} className="hidden size-8 items-center justify-center rounded-[8px] border border-line bg-white text-ink hover:border-ink md:flex">
                        <ChevronRight className="size-4" aria-hidden />
                    </button>
                </div>
            </div>
            <div
                ref={track}
                className="grid snap-x auto-cols-[148px] grid-rows-[repeat(2,128px)] gap-3 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                data-testid="category-strip"
            >
                {/* The owner (27 Sep 2026): "All" opens the full page of category and
                    sub-category tiles — the app's All Categories grid — not the unfiltered list. */}
                <Link
                    href={allHref}
                    style={place({ column: 1, row: "both", span: 1 })}
                    aria-label="All categories"
                    className="flex snap-start flex-col justify-between rounded-[12px] border border-ink bg-ink p-3 text-white hover:opacity-90"
                >
                    <LayoutGrid className="size-7" aria-hidden />
                    <span>
                        <span className="block text-base font-semibold">All categories</span>
                        <span className="block text-xs text-white/70">
                            {categories ? spacesCount(categories.reduce((sum, tile) => sum + tile.count, 0)) : "Counting…"}
                        </span>
                    </span>
                </Link>
                {mosaic === null
                    ? Array.from({ length: 5 }).map((_, index) => (
                          <div key={index} style={place({ column: 2 + index * 2, row: "both", span: 2 })} className="animate-pulse rounded-[12px] border border-line bg-white" />
                      ))
                    : mosaic.placements.map((placement) =>
                          placement.kind === "all" ? null : placement.kind === "category" ? (
                              <Tile
                                  key={placement.tile.category}
                                  style={place(placement)}
                                  href={categoryHref(placement.tile.category)}
                                  photo={placement.tile.photoUrl}
                                  label={CATEGORY_LABEL[placement.tile.category]}
                                  count={placement.tile.count}
                                  selected={selectedCategory === placement.tile.category && !selectedVenue}
                                  wide
                              />
                          ) : (
                              <Tile
                                  key={placement.tile.venueTypeId}
                                  style={place(placement)}
                                  href={venueHref(placement.tile)}
                                  photo={placement.tile.photoUrl}
                                  label={placement.tile.label}
                                  count={placement.tile.count}
                                  selected={selectedVenue === placement.tile.venueTypeId}
                                  title={placement.tile.name}
                              />
                          )
                      )}
            </div>
        </div>
    );
}

function Tile({ href, photo, label, count, selected, wide, title, style }: { href: string; photo: string | null; label: string; count: number; selected: boolean; wide?: boolean; title?: string; style?: React.CSSProperties }) {
    return (
        <Link
            href={href}
            title={title}
            style={style}
            aria-current={selected ? "true" : undefined}
            aria-label={`${label}, ${spacesCount(count)}`}
            className={cn(
                "group flex min-w-0 snap-start flex-col overflow-hidden rounded-[12px] border bg-white shadow-card",
                selected ? "border-ink ring-2 ring-brand ring-offset-2" : "border-line hover:border-ink"
            )}
        >
            <div className="min-h-0 flex-1 overflow-hidden bg-[#f1f1ee]">
                {photo ? <img src={photo} alt="" loading="lazy" className="size-full object-cover transition-transform group-hover:scale-[1.03]" /> : <div className="flex size-full items-center justify-center text-xs text-dim">No photo yet</div>}
            </div>
            <div className="px-3 pb-2.5 pt-2">
                <p className={cn("truncate text-sm text-ink", wide ? "font-semibold" : "font-medium")}>{label}</p>
                <p className={cn("text-xs", count > 0 ? "text-dim" : "text-[#a3a3a8]")}>{spacesCount(count)}</p>
            </div>
        </Link>
    );
}
