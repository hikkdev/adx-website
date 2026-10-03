"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { planBlocks, type ContentBlockType, type Layout, type LayoutSurface, type PlannedBlock } from "@/services/layouts";
import { AdSlotBlock } from "./ad-slot";
import { ButtonRowBlock } from "./blocks/button-row";
import { CategoryTilesBlock } from "./blocks/category-tiles";
import { ColumnsBlock } from "./blocks/columns";
import { CtaStripBlock } from "./blocks/cta-strip";
import { DividerBlock } from "./blocks/divider";
import { FaqBlock } from "./blocks/faq";
import { FormBlock } from "./blocks/form";
import { HeroBlock } from "./blocks/hero";
import { ImageBlock } from "./blocks/image";
import { ListingGridBlock } from "./blocks/listing-grid";
import { StatsBlock } from "./blocks/stats";
import { StepsBlock } from "./blocks/steps";
import { VideoBlock } from "./blocks/video";
import { ListingRailBlock, PromoBanner, RichTextBlock, TileGrid } from "./content-blocks";

/**
 * One page's blocks, in the layout's order. A system block is one of the
 * page's own sections, handed in by the page (`system`, by type; a function
 * gets the console's title override); a content block is drawn here. A type
 * the page does not hand in, or the site does not know, is skipped, and a
 * block that draws nothing leaves no gap (`gapClassName` sits on a wrapper
 * that hides itself when empty).
 */
export type SystemSection = React.ReactNode | ((title: string | null) => React.ReactNode);

export function LayoutBlocks({
    surface,
    layout,
    system,
    place,
    gapClassName = "mt-10",
    contentClassName,
}: {
    surface: LayoutSurface;
    layout: Layout | null;
    system: Partial<Record<string, SystemSection>>;
    place?: { city?: string | null };
    gapClassName?: string;
    /** Wraps content blocks — the page's container, where its sections carry their own. */
    contentClassName?: string;
}) {
    const rows = planBlocks(surface, layout).flatMap((block): { block: PlannedBlock; node: React.ReactNode }[] => {
        if (block.kind === "content") return [{ block, node: <ContentBlock type={block.type} props={block.props} surface={surface} place={place} /> }];
        const section = system[block.type];
        if (section === undefined || section === null) return [];
        return [{ block, node: typeof section === "function" ? section(block.title) : section }];
    });
    return (
        <>
            {rows.map(({ block, node }, index) => (
                <div key={block.id} data-block={block.type} className={cn(index > 0 && gapClassName, "empty:hidden", block.kind === "content" && contentClassName)}>
                    {node}
                </div>
            ))}
        </>
    );
}

/**
 * One content block by type, from its resolved props. PB-4 (27 Sep 2026):
 * the thirteen Studio blocks beside LM-1's five. Studio (C1) renders
 * through this too, with the preview's resolved props — the signature
 * `{ type, props, surface, place? }` is the contract.
 */
export function ContentBlock({ type, props, surface, place }: { type: ContentBlockType; props: Record<string, unknown>; surface: string; place?: { city?: string | null } }) {
    switch (type) {
        case "promo_banner":
            return <PromoBanner props={props} />;
        case "tile_grid":
            return <TileGrid props={props} />;
        case "listing_rail":
            return <ListingRailBlock props={props} place={place} />;
        case "rich_text":
            return <RichTextBlock props={props} />;
        case "ad_slot":
            return <AdSlotBlock props={props} surface={surface} />;
        case "hero":
            return <HeroBlock props={props} surface={surface} />;
        case "cta_strip":
            return <CtaStripBlock props={props} />;
        case "columns":
            return <ColumnsBlock props={props} />;
        case "image":
            return <ImageBlock props={props} />;
        case "video":
            return <VideoBlock props={props} />;
        case "faq":
            return <FaqBlock props={props} />;
        case "steps":
            return <StepsBlock props={props} />;
        case "stats":
            return <StatsBlock props={props} />;
        case "divider":
            return <DividerBlock props={props} />;
        case "button_row":
            return <ButtonRowBlock props={props} />;
        case "category_tiles":
            return <CategoryTilesBlock props={props} place={place} />;
        case "listing_grid":
            return <ListingGridBlock props={props} place={place} />;
        case "form":
            return <FormBlock props={props} surface={surface} />;
        default:
            return null;
    }
}
