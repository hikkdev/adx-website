"use client";

import * as React from "react";
import Link from "next/link";
import { SpaceCard } from "@/components/site/space-card";
import { cn } from "@/lib/utils";
import { browseService, type BrowseCard } from "@/services/browse";
import { listingGridOf, railPlan, railSeeAllHref } from "@/services/layouts";

const GRID: Record<number, string> = { 2: "sm:grid-cols-2", 3: "sm:grid-cols-2 lg:grid-cols-3", 4: "sm:grid-cols-2 lg:grid-cols-4" };

/** PB-4 · `listing_grid`: a listing rail's spaces as a grid of two, three or four columns — the same resolved query, read the same way. */
export function ListingGridBlock({ props, place }: { props: Record<string, unknown>; place?: { city?: string | null } }) {
    const grid = listingGridOf(props);
    const plan = React.useMemo(() => railPlan(props, place), [props, place]);
    const key = JSON.stringify(plan);
    const [answer, setAnswer] = React.useState<{ key: string; items: BrowseCard[] } | null>(null);

    React.useEffect(() => {
        let cancelled = false;
        const read: Promise<BrowseCard[]> = plan.query
            ? browseService.browse(plan.query).then((page) => page.items)
            : Promise.allSettled(plan.ids.map((id) => browseService.listing(id))).then((rows) => rows.flatMap((row) => (row.status === "fulfilled" ? [row.value] : [])));
        read.then((items) => !cancelled && setAnswer({ key, items })).catch(() => !cancelled && setAnswer({ key, items: [] }));
        return () => {
            cancelled = true;
        };
    }, [key, plan]);

    const items = answer?.key === key ? answer.items : null;
    if (items !== null && items.length === 0) return null;
    return (
        <section data-testid="listing-grid">
            {grid.title && <h2 className="text-2xl font-bold tracking-tight text-ink">{grid.title}</h2>}
            <div className={cn("grid gap-5", GRID[grid.columns], grid.title && "mt-6")}>
                {items === null
                    ? Array.from({ length: grid.columns }).map((_, index) => <div key={index} className="h-[356px] animate-pulse rounded-[14px] border border-line bg-white" />)
                    : items.map((card) => <SpaceCard key={card.id} card={card} />)}
            </div>
            {grid.seeAllLabel && plan.query && (
                <Link href={railSeeAllHref(plan)} className="mt-5 inline-block text-sm font-medium text-ink underline underline-offset-2 hover:text-brand">
                    {grid.seeAllLabel}
                </Link>
            )}
        </section>
    );
}
