"use client";

import * as React from "react";
import type { Layout } from "@/services/layouts";
import { LayoutBlocks } from "./layout-blocks";
import { useLayout } from "./use-layout";

/**
 * LM-1: the home page's blocks. `legacy_home` is today's static body,
 * rendered on the server and handed in whole; whatever ADX places around it
 * (a banner, a rail of spaces, a sold ad) is drawn in the site's container.
 */
export function HomeBlocks({ initial, legacy }: { initial: Layout | null; legacy: React.ReactNode }) {
    const layout = useLayout("WEB_HOME", { initial });
    return (
        <LayoutBlocks
            surface="WEB_HOME"
            layout={layout}
            gapClassName=""
            contentClassName="mx-auto w-full max-w-[1200px] px-6 py-10"
            system={{ legacy_home: legacy }}
        />
    );
}
