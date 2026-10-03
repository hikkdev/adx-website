"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { planContentBlocks, type ResolvedBlock } from "@/services/layouts";
import { ContentBlock } from "./layout-blocks";

/**
 * PB-4: a Studio page's blocks, in its order, each in the site's container
 * — content blocks only (a custom page has no system sections). A block
 * that draws nothing leaves no gap.
 */
export function PageBlocks({ blocks, surface, place, className, blockClassName = "mx-auto w-full max-w-[1200px] px-6" }: { blocks: ResolvedBlock[]; surface: string; place?: { city?: string | null }; className?: string; blockClassName?: string }) {
    const planned = planContentBlocks(blocks);
    if (planned.length === 0) return null;
    return (
        <div className={cn("flex flex-col gap-12 py-12", className)} data-testid="page-blocks">
            {planned.map((block) => (
                <div key={block.id} data-block={block.type} data-block-id={block.id} className={cn(blockClassName, "empty:hidden")}>
                    {block.kind === "content" && <ContentBlock type={block.type} props={block.props} surface={surface} place={place} />}
                </div>
            ))}
        </div>
    );
}
