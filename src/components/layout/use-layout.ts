"use client";

import * as React from "react";
import { useAuth } from "@/lib/auth";
import { layoutsService, sideOf, type Layout, type LayoutSurface } from "@/services/layouts";

/**
 * The published layout of one surface for whoever is looking: a visitor,
 * or the side the signed-in account works in, in the page's city when it
 * has one. `initial` is the server's read (as a visitor) when the page was
 * rendered there — a visitor then needs no second read, and a signed-in
 * person sees it until their own answers. Null means "draw the baked order".
 * PB-2: `preview` is a Studio token — the draft is asked for instead.
 */
export function useLayout(surface: LayoutSurface, options: { city?: string | null; initial?: Layout | null; enabled?: boolean; preview?: string | null } = {}): Layout | null {
    const { status, party } = useAuth();
    const { city = null, initial, enabled = true, preview = null } = options;
    const side = sideOf(status === "signed-in", party);
    const serverCovers = initial !== undefined && side === "VISITOR";
    const wanted = enabled && status !== "restoring" && !serverCovers;
    const key = `${surface}|${side}|${city ?? ""}|${preview ?? ""}`;
    const [answer, setAnswer] = React.useState<{ key: string; layout: Layout | null } | null>(null);

    React.useEffect(() => {
        if (!wanted) return;
        let cancelled = false;
        layoutsService
            .read(surface, { side, city, preview })
            .then((layout) => !cancelled && setAnswer({ key, layout }))
            .catch(() => !cancelled && setAnswer({ key, layout: null }));
        return () => {
            cancelled = true;
        };
    }, [wanted, key, surface, side, city, preview]);

    if (wanted && answer?.key === key) return answer.layout;
    return initial ?? null;
}
