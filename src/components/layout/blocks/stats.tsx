"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { statsOf } from "@/services/layouts";

const GRID: Record<number, string> = { 1: "sm:grid-cols-1", 2: "sm:grid-cols-2", 3: "sm:grid-cols-3", 4: "sm:grid-cols-2 lg:grid-cols-4" };

/** PB-4 · `stats`: two to four numbers worth saying, each with its label. */
export function StatsBlock({ props }: { props: Record<string, unknown> }) {
    const stats = statsOf(props);
    if (!stats) return null;
    return (
        <dl data-testid="stats" className={cn("grid grid-cols-2 gap-6 rounded-2xl border border-line bg-white p-6 sm:p-10", GRID[stats.items.length])}>
            {stats.items.map((item, index) => (
                <div key={index} className="min-w-0">
                    <dd className="text-[36px] font-extrabold leading-none tracking-[-1px] text-ink sm:text-[44px]">{item.value}</dd>
                    <dt className="mt-2 text-sm leading-5 text-dim">{item.label}</dt>
                </div>
            ))}
        </dl>
    );
}
