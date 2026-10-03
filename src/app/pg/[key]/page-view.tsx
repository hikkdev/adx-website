"use client";

import * as React from "react";
import { PageBlocks } from "@/components/layout/page-blocks";
import { usePage } from "@/components/layout/use-page";
import type { SitePageView } from "@/services/pages";

/**
 * PB-4: a Studio page's body — the server's read for a visitor, re-read
 * for a signed-in side; a preview says so at the top, since what it shows
 * is the draft and not what visitors see.
 */
export function PageView({ initial, pageKey, preview, city }: { initial: SitePageView; pageKey: string; preview: string | null; city: string | null }) {
    const page = usePage(pageKey, { initial, preview, city });
    return (
        <div className="bg-white">
            {page.preview && (
                <p data-testid="preview-banner" className="bg-warning-soft px-6 py-2 text-center text-xs font-semibold text-warning">
                    Preview of draft v{page.version} — not what visitors see
                </p>
            )}
            {page.blocks.length === 0 ? (
                <div className="mx-auto max-w-[720px] px-6 py-24 text-center">
                    <h1 className="text-[28px] font-semibold text-ink">{page.title}</h1>
                    <p className="mt-2 text-sm text-dim">This page has nothing on it yet.</p>
                </div>
            ) : (
                <PageBlocks blocks={page.blocks} surface={page.key} place={{ city }} />
            )}
        </div>
    );
}
