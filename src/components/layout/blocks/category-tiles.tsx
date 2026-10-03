"use client";

import * as React from "react";
import { CategoryStrip } from "@/components/site/category-strip";
import { pageHref } from "@/lib/site-routes";
import { browseService, categoryTiles, spacesHref, type CategoryTile, type VenueTile } from "@/services/browse";
import { categoryTilesOf } from "@/services/layouts";

/**
 * PB-4 · `category_tiles`: the site's own category mosaic (the explore
 * home's double-stacked strip) on any page — the four categories and their
 * venue types counted in the page's city, each tile opening Explore cut to
 * it. The server resolves nothing extra; the client draws its own mosaic.
 */
export function CategoryTilesBlock({ props, place }: { props: Record<string, unknown>; place?: { city?: string | null } }) {
    const block = categoryTilesOf(props);
    const city = place?.city ?? null;
    const [answer, setAnswer] = React.useState<{ city: string | null; categories: CategoryTile[]; venues: VenueTile[] } | null>(null);

    React.useEffect(() => {
        let cancelled = false;
        const where = city ? { city } : {};
        Promise.all([browseService.categories(where).then(categoryTiles), browseService.venues(where).then((read) => read.items).catch(() => [] as VenueTile[])])
            .then(([categories, venues]) => !cancelled && setAnswer({ city, categories, venues }))
            .catch(() => !cancelled && setAnswer({ city, categories: [], venues: [] }));
        return () => {
            cancelled = true;
        };
    }, [city]);

    const ready = answer?.city === city ? answer : null;
    if (ready && ready.categories.length === 0) return null;
    const where = city ? { city } : {};
    return (
        <section data-testid="category-tiles">
            {block.title && <h2 className="mb-6 text-2xl font-bold tracking-tight text-ink">{block.title}</h2>}
            <CategoryStrip
                categories={ready ? ready.categories : null}
                venues={ready ? ready.venues : []}
                selectedCategory={null}
                selectedVenue={null}
                categoryHref={(category) => spacesHref({ category }, where)}
                venueHref={(venue) => spacesHref({ category: venue.category, venueTypeId: venue.venueTypeId }, where)}
                allHref={pageHref("categories", {}, city ? { search: `city=${encodeURIComponent(city)}` } : {})}
            />
        </section>
    );
}
