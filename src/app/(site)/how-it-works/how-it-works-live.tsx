"use client";

import * as React from "react";
import { LayoutBlocks } from "@/components/layout/layout-blocks";
import { useLayout } from "@/components/layout/use-layout";
import type { Layout } from "@/services/layouts";

/**
 * PB-3: the how-it-works page's blocks in the layout's order — the hero
 * (`hiw_hero`) and the steps with "On this page" (`hiw_steps`) come from
 * the server as they were; whatever ADX places around them is drawn in
 * the page's container.
 */
export function HowItWorksBlocks({ initial, preview = null, hero, steps }: { initial: Layout | null; preview?: string | null; hero: React.ReactNode; steps: React.ReactNode }) {
    const layout = useLayout("WEB_HOW_IT_WORKS", { initial, preview });
    return <LayoutBlocks surface="WEB_HOW_IT_WORKS" layout={layout} gapClassName="" contentClassName="mx-auto w-full max-w-[1480px] px-6 py-12 lg:px-16" system={{ hiw_hero: hero, hiw_steps: steps }} />;
}
