import type { Metadata } from "next";
import { SignPage } from "./sign-page";

export const metadata: Metadata = { title: "Sign a document", robots: { index: false } };

/**
 * DS-1: `/sign/<request id>?next=<path>` — where the website sends someone
 * to e-sign a document ADX asked for: the insertion order from the pay
 * step, the licence to display from the publisher's home, the print
 * partner's service agreement. `next` is where to go back to once signed.
 */
export default async function SignRoute({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
    const { id } = await params;
    const query = await searchParams;
    const next = typeof query.next === "string" ? query.next : null;
    return <SignPage requestId={decodeURIComponent(id)} next={next} />;
}
