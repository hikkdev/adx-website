"use client";

import * as React from "react";
import { Markdown } from "@/components/platform/markdown";
import { cn } from "@/lib/utils";
import { columnsOf, targetHref } from "@/services/layouts";
import { TargetLink } from "./target-link";

const GRID: Record<number, string> = { 1: "", 2: "sm:grid-cols-2", 3: "sm:grid-cols-2 lg:grid-cols-3", 4: "sm:grid-cols-2 lg:grid-cols-4" };

/**
 * PB-4 · `columns`: two to four columns of a picture, a title and some
 * text side by side; one under the other on a phone. A column with a
 * target links its picture and title, never the text (a link inside a
 * link is no link).
 */
export function ColumnsBlock({ props }: { props: Record<string, unknown> }) {
    const block = columnsOf(props);
    if (!block) return null;
    return (
        <section data-testid="columns" className={cn("grid gap-8", GRID[Math.min(4, block.columns.length)])}>
            {block.columns.map((column, index) => {
                const linked = !!targetHref(column.target);
                const head = (
                    <>
                        {column.media && (
                            <div className="aspect-[4/3] overflow-hidden rounded-xl bg-ground">
                                <img src={column.media.url} alt={column.media.altText ?? ""} className="size-full object-cover transition-transform group-hover:scale-[1.02]" loading="lazy" />
                            </div>
                        )}
                        {column.title && <h3 className={cn("text-xl font-semibold leading-7 text-ink", column.media && "mt-4", linked && "group-hover:text-brand")}>{column.title}</h3>}
                    </>
                );
                return (
                    <div key={index} className="min-w-0">
                        {linked ? (
                            <TargetLink target={column.target} className="group block">
                                {head}
                            </TargetLink>
                        ) : (
                            head
                        )}
                        {column.markdown && <Markdown source={column.markdown} topLevel={4} className={cn("text-[15px]", (column.title || column.media) && "mt-2")} />}
                    </div>
                );
            })}
        </section>
    );
}
