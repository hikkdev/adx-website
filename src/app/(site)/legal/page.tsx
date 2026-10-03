import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { listDocSlugs } from "@/lib/site-docs";
import { AGREEMENT_LABEL, cleanTitle, effectiveLine, legalHref, legalServer, LISTED_AGREEMENTS, orderedIndex, PRESSED_SLUG } from "@/services/legal";

export const metadata: Metadata = {
    title: "Policies and agreements",
    description: "Every policy ADX has published — privacy, terms, refunds, content, conduct — and the platform agreements advertisers, publishers and print partners accept.",
};

/** Read again at most every five minutes, like the documents themselves. */
export const revalidate = 300;

/**
 * About & Policies on the web (the app's `legal-index-screen.tsx`): every
 * document `GET /legal` lists, in the app's order, each opening its live
 * text at `/legal/<KIND>`; and the platform agreements, which are agreement
 * templates rather than policies and are read at the same kind of address.
 */
export default async function LegalIndexPage() {
    const [index, pressed] = await Promise.all([legalServer.index(), Promise.resolve(new Set(listDocSlugs()))]);
    const entries = index ? orderedIndex(index) : [];

    return (
        <div className="mx-auto max-w-[880px] px-6 pb-20 pt-14 lg:px-0">
            <h1 className="text-[34px] font-bold leading-tight tracking-tight text-ink">Policies and agreements</h1>
            <p className="mt-2 text-[16px] text-dim">What ADX has published, in the version in force today. Each page shows when it took effect.</p>

            <h2 className="mt-12 text-xs font-medium uppercase tracking-[0.08em] text-dim">Policies</h2>
            {index === null ? (
                <p className="mt-3 rounded-lg border border-line bg-white px-5 py-4 text-sm text-dim">
                    ADX did not answer just now, so the list could not be read. The{" "}
                    <Link href="/privacy" className="font-medium text-ink underline underline-offset-2">privacy policy</Link>,{" "}
                    <Link href="/terms" className="font-medium text-ink underline underline-offset-2">booking terms</Link> and{" "}
                    <Link href="/refund" className="font-medium text-ink underline underline-offset-2">cancellation policy</Link> are always on the site.
                </p>
            ) : (
                <ul className="mt-3 divide-y divide-line overflow-hidden rounded-lg border border-line bg-white">
                    {entries.map((entry) => {
                        const slug = PRESSED_SLUG[entry.kind];
                        return (
                            <li key={entry.kind}>
                                <Link href={legalHref(entry.kind)} className="flex items-center gap-4 px-5 py-4 hover:bg-ground">
                                    <span className="min-w-0 flex-1">
                                        <span className="block text-[15px] font-semibold text-ink">{cleanTitle(entry.title) || entry.label}</span>
                                        <span className="mt-0.5 block text-sm text-dim">{entry.summary ?? entry.blurb}</span>
                                        <span className="mt-1 block text-xs text-dim">
                                            {effectiveLine(entry.effectiveFrom, entry.version)}
                                            {slug && pressed.has(slug) && <> · also at /{slug}</>}
                                        </span>
                                    </span>
                                    <ChevronRight className="size-4 shrink-0 text-dim" aria-hidden />
                                </Link>
                            </li>
                        );
                    })}
                </ul>
            )}

            <h2 className="mt-12 text-xs font-medium uppercase tracking-[0.08em] text-dim">Platform agreements</h2>
            <p className="mt-2 text-sm text-dim">The terms each side accepts on ADX. Sign in to read the version in force.</p>
            <ul className="mt-3 divide-y divide-line overflow-hidden rounded-lg border border-line bg-white">
                {LISTED_AGREEMENTS.map((kind) => (
                    <li key={kind}>
                        <Link href={legalHref(kind)} className="flex items-center gap-4 px-5 py-4 hover:bg-ground">
                            <span className="min-w-0 flex-1">
                                <span className="block text-[15px] font-semibold text-ink">{AGREEMENT_LABEL[kind].label}</span>
                                <span className="mt-0.5 block text-sm text-dim">{AGREEMENT_LABEL[kind].blurb}</span>
                            </span>
                            <ChevronRight className="size-4 shrink-0 text-dim" aria-hidden />
                        </Link>
                    </li>
                ))}
            </ul>
        </div>
    );
}
