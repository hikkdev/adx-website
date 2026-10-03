"use client";

import * as React from "react";
import Link from "next/link";
import { Markdown } from "@/components/platform/markdown";
import { Rail } from "@/components/site/rail";
import { SpaceCard } from "@/components/site/space-card";
import { cn } from "@/lib/utils";
import { browseService, type BrowseCard } from "@/services/browse";
import { mediaOf, railPlan, railSeeAllHref, targetHref, targetOf, type ResolvedMedia, type Target } from "@/services/layouts";
import { TargetLink } from "./blocks/target-link";

/**
 * The content blocks a layout can place on any website page: ADX's own
 * banners and tiles (house promotion — not sold, so not labelled "Ad"), a
 * rail of live spaces, a piece of text. Each one draws nothing when it has
 * nothing to draw — a missing picture, an empty rail — so a half-filled
 * block never reaches a visitor. PB-4: the link a target makes lives in
 * `blocks/target-link.tsx`, shared with the thirteen Studio blocks.
 */

const text = (value: unknown): string | null => (typeof value === "string" && value.trim() ? value.trim() : null);

function Picture({ media, className }: { media: ResolvedMedia; className?: string }) {
    return <img src={media.url} alt={media.altText ?? ""} className={cn("size-full object-cover", className)} loading="lazy" />;
}

export function PromoBanner({ props }: { props: Record<string, unknown> }) {
    const media = mediaOf(props.media);
    if (!media) return null;
    const headline = text(props.headline);
    const body = text(props.body);
    const cta = text(props.ctaLabel);
    const target = targetOf(props.target);
    const square = props.aspect === "SQUARE";
    return (
        <TargetLink target={target} label={headline ?? undefined} className={cn("group relative block overflow-hidden rounded-2xl bg-ground", square ? "mx-auto aspect-square max-w-[540px]" : "aspect-[10/3] min-h-[180px] w-full")}>
            <Picture media={media} className="absolute inset-0 transition-transform group-hover:scale-[1.01]" />
            {(headline || body || cta) && (
                <>
                    <div aria-hidden className="absolute inset-0 bg-gradient-to-r from-black/60 via-black/25 to-transparent" />
                    <div className="relative flex h-full max-w-[560px] flex-col justify-end gap-2 p-6 sm:p-10">
                        {headline && <p className="text-2xl font-bold leading-tight tracking-tight text-white sm:text-[32px] sm:leading-10">{headline}</p>}
                        {body && <p className="text-sm text-white/90 sm:text-base">{body}</p>}
                        {cta && targetHref(target) && <span className="mt-2 inline-flex h-10 w-fit items-center rounded-md bg-white px-5 text-sm font-semibold text-ink">{cta}</span>}
                    </div>
                </>
            )}
        </TargetLink>
    );
}

const COLUMNS: Record<number, string> = { 2: "sm:grid-cols-2", 3: "sm:grid-cols-2 lg:grid-cols-3", 4: "sm:grid-cols-2 lg:grid-cols-4" };

export function TileGrid({ props }: { props: Record<string, unknown> }) {
    const tiles = (Array.isArray(props.tiles) ? props.tiles : [])
        .slice(0, 12)
        .map((tile) => (tile && typeof tile === "object" ? (tile as Record<string, unknown>) : null))
        .map((tile) => (tile ? { media: mediaOf(tile.media), label: text(tile.label), target: targetOf(tile.target) } : null))
        .filter((tile): tile is { media: ResolvedMedia; label: string; target: Target | null } => !!tile && !!tile.media && !!tile.label);
    if (tiles.length === 0) return null;
    const title = text(props.title);
    const columns = props.columns === 2 || props.columns === 4 ? props.columns : 3;
    return (
        <section>
            {title && <h2 className="text-2xl font-bold tracking-tight text-ink">{title}</h2>}
            <div className={cn("grid gap-4", COLUMNS[columns], title && "mt-6")}>
                {tiles.map((tile, index) => (
                    <TargetLink key={index} target={tile.target} className="group relative flex aspect-square flex-col justify-end overflow-hidden rounded-[10px] bg-ground p-4 hover:shadow-card">
                        <Picture media={tile.media} className="absolute inset-0 transition-transform group-hover:scale-[1.03]" />
                        <div aria-hidden className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/60 to-transparent" />
                        <p className="relative text-base font-semibold text-white">{tile.label}</p>
                    </TargetLink>
                ))}
            </div>
        </section>
    );
}

/** A rail of live spaces off the resolved browse query — or the named listings, read one by one. */
export function ListingRailBlock({ props, place }: { props: Record<string, unknown>; place?: { city?: string | null } }) {
    const plan = React.useMemo(() => railPlan(props, place), [props, place]);
    const key = JSON.stringify(plan);
    const [answer, setAnswer] = React.useState<{ key: string; items: BrowseCard[] } | null>(null);

    React.useEffect(() => {
        let cancelled = false;
        const read: Promise<BrowseCard[]> = plan.query
            ? browseService.browse(plan.query).then((page) => page.items)
            : Promise.allSettled(plan.ids.map((id) => browseService.listing(id))).then((rows) => rows.flatMap((row) => (row.status === "fulfilled" ? [row.value] : [])));
        read.then((items) => !cancelled && setAnswer({ key, items })).catch(() => !cancelled && setAnswer({ key, items: [] }));
        return () => {
            cancelled = true;
        };
    }, [key, plan]);

    const items = answer?.key === key ? answer.items : null;
    if (items !== null && items.length === 0) return null;
    const title = text(props.title) ?? "Spaces on ADX";
    const seeAll = text(props.seeAllLabel);
    return (
        <div data-testid="listing-rail">
            <Rail title={title} titleClassName="text-2xl font-bold tracking-tight">
                {items === null
                    ? Array.from({ length: 4 }).map((_, index) => <div key={index} className="h-[356px] w-[300px] shrink-0 animate-pulse rounded-[14px] border border-line bg-white" />)
                    : items.map((card) => (
                          <div key={card.id} className="w-[300px] shrink-0 snap-start">
                              <SpaceCard card={card} />
                          </div>
                      ))}
            </Rail>
            {seeAll && plan.query && (
                <Link href={railSeeAllHref(plan)} className="mt-4 inline-block text-sm font-medium text-ink underline underline-offset-2 hover:text-brand">
                    {seeAll}
                </Link>
            )}
        </div>
    );
}

export function RichTextBlock({ props }: { props: Record<string, unknown> }) {
    const source = text(props.markdown);
    if (!source) return null;
    return <Markdown source={source} className="mx-auto max-w-[880px]" />;
}
