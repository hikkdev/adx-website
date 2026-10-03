import { notFound, redirect } from "next/navigation";

/**
 * E11-2's share link — `adx.in/s/<LST-…>`, what the apps' share sheet sends
 * (`shareUrlFor` in `listings/browse.service.ts`). The website's own page
 * for one space already takes a display id (`GET /listings/browse/:id`
 * answers either), so the link is that page; a missing or retired spot is
 * that page's "not found". Anything that is not a display id is this site's.
 */
export default async function ShareLink({ params }: { params: Promise<{ displayId: string }> }) {
    const raw = decodeURIComponent((await params).displayId).trim();
    if (!/^[A-Za-z0-9][A-Za-z0-9-]{2,63}$/.test(raw)) notFound();
    redirect(`/spaces/${encodeURIComponent(raw.toUpperCase().startsWith("LST-") ? raw.toUpperCase() : raw)}`);
}
