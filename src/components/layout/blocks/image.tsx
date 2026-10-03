"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { imageOf, targetHref } from "@/services/layouts";
import { TargetLink } from "./target-link";

/** PB-4 · `image`: one picture, the page's width or contained, with a caption under it and, if it has one, a link. */
export function ImageBlock({ props }: { props: Record<string, unknown> }) {
    const image = imageOf(props);
    if (!image) return null;
    const ratio = image.media.width && image.media.height ? `${image.media.width} / ${image.media.height}` : undefined;
    const picture = (
        <div className="overflow-hidden rounded-2xl bg-ground" style={ratio ? { aspectRatio: ratio } : undefined}>
            <img src={image.media.url} alt={image.media.altText ?? image.caption ?? ""} className="size-full object-cover" loading="lazy" />
        </div>
    );
    return (
        <figure data-testid="image" className={cn(image.width === "CONTAINED" && "mx-auto max-w-[880px]")}>
            {targetHref(image.target) ? (
                <TargetLink target={image.target} className="block" label={image.caption ?? image.media.altText ?? undefined}>
                    {picture}
                </TargetLink>
            ) : (
                picture
            )}
            {image.caption && <figcaption className="mt-3 text-center text-sm text-dim">{image.caption}</figcaption>}
        </figure>
    );
}
