"use client";

import * as React from "react";
import { useAuth } from "@/lib/auth";
import { sideOf } from "@/services/layouts";
import { pagesService, type SitePageView } from "@/services/pages";

/**
 * PB-4: a Studio page for whoever is looking — the server's read (as a
 * visitor) until a signed-in account's own answers, like `useLayout`. A
 * page that is not there for this side answers null; the server's copy
 * stands while the read is out or fails.
 */
export function usePage(key: string, options: { initial: SitePageView; city?: string | null; preview?: string | null }): SitePageView {
    const { status, party } = useAuth();
    const { initial, city = null, preview = null } = options;
    const side = sideOf(status === "signed-in", party);
    const wanted = status !== "restoring" && side !== "VISITOR";
    const askKey = `${key}|${side}|${city ?? ""}|${preview ?? ""}`;
    const [answer, setAnswer] = React.useState<{ key: string; page: SitePageView | null } | null>(null);

    React.useEffect(() => {
        if (!wanted) return;
        let cancelled = false;
        pagesService
            .read(key, { side, city, preview })
            .then((page) => !cancelled && setAnswer({ key: askKey, page }))
            .catch(() => !cancelled && setAnswer({ key: askKey, page: null }));
        return () => {
            cancelled = true;
        };
    }, [wanted, askKey, key, side, city, preview]);

    if (wanted && answer?.key === askKey && answer.page) return answer.page;
    return initial;
}
