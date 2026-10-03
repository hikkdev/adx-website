"use client";

import * as React from "react";

/**
 * ST-1: the real page in an iframe — `<path>?preview=<token>` answers the
 * draft — at the chosen width, reloaded after every save (`stamp`).
 */
export function PreviewFrame({ src, width, stamp, title, note }: { src: string | null; width: number; stamp: number | string; title: string; note?: string | null }) {
    if (!src) {
        return (
            <div className="flex h-full items-center justify-center p-8 text-center text-sm text-dim" data-testid="preview-unavailable">
                {note ?? "No page to preview yet."}
            </div>
        );
    }
    return (
        <div className="mx-auto h-full" style={{ width, maxWidth: "100%" }}>
            <iframe key={stamp} src={src} title={title} className="h-full w-full border border-line bg-white" data-testid="preview-frame" />
        </div>
    );
}
