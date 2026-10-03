"use client";

import * as React from "react";
import { videoOf } from "@/services/layouts";

/** PB-4 · `video`: a YouTube or Vimeo player (YouTube without cookies), or an mp4 in the page's own player, sixteen by nine. */
export function VideoBlock({ props }: { props: Record<string, unknown> }) {
    const video = videoOf(props);
    if (!video) return null;
    const title = video.caption ?? "Video";
    return (
        <figure data-testid="video" className="mx-auto max-w-[960px]">
            <div className="aspect-video overflow-hidden rounded-2xl bg-ink">
                {video.embed.kind === "file" ? (
                    <video src={video.embed.src} controls preload="metadata" className="size-full" title={title} />
                ) : (
                    <iframe
                        src={video.embed.src}
                        title={title}
                        className="size-full border-0"
                        loading="lazy"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                        referrerPolicy="strict-origin-when-cross-origin"
                        allowFullScreen
                    />
                )}
            </div>
            {video.caption && <figcaption className="mt-3 text-center text-sm text-dim">{video.caption}</figcaption>}
        </figure>
    );
}
