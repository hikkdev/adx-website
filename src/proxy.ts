import { NextResponse, type NextRequest } from "next/server";
import { readSiteRoutes, resolveRequest, shouldSkip } from "@/lib/site-routes";

/**
 * PB-1 (27 Sep 2026): the site's addresses, as Studio sets them. Next 16
 * names this file `proxy.ts` (the `middleware` convention is deprecated —
 * `node_modules/next/dist/docs/…/file-conventions/proxy.md`). On every page
 * request it reads the address table (`GET /app/site/routes`, kept a
 * minute) and, in the contract's order: sends a redirect's source on
 * (308, or 307 for a temporary one); rewrites a custom page's address to
 * its `/pg/<key>` route; rewrites a moved system page's address to the
 * route the code serves; sends a request at that route's old address to
 * the public one; and sends `/pg/<key>` hit directly to the page's
 * address. The query string rides along. When ADX does not answer, every
 * request passes through untouched — the site never waits on the table.
 */
export async function proxy(request: NextRequest) {
    const { pathname, search, searchParams } = request.nextUrl;
    if (shouldSkip(pathname)) return NextResponse.next();

    const table = await readSiteRoutes();
    if (!table) return NextResponse.next();

    const decision = resolveRequest(table, pathname, { preview: searchParams.has("preview") });
    switch (decision.kind) {
        case "redirect": {
            const to = /^https?:\/\//i.test(decision.to) ? new URL(decision.to) : new URL(`${decision.to}${search}`, request.url);
            return NextResponse.redirect(to, decision.permanent ? 308 : 307);
        }
        case "rewrite":
            return NextResponse.rewrite(new URL(`${decision.to}${search}`, request.url));
        default:
            return NextResponse.next();
    }
}

export const config = {
    /* Everything but the API, Next's files, Studio, the preview frames and anything with an extension. */
    matcher: ["/((?!api|_next|studio|preview|.*\\..*).*)"],
};
