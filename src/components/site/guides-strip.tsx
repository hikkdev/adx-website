import Link from "next/link";
import { Rail } from "@/components/site/rail";
import { pageHref } from "@/lib/site-routes";

/**
 * "A little help before you book" (5204:53421): the four guide cards the
 * formats page and the how-it-works page both end on. Each card opens the
 * page that answers it — PB-1: a Studio page by its key, at its current
 * address.
 */
const GUIDES: { label: string; title: string; page: string; hash?: string }[] = [
    { label: "PLANNING", title: "Choose the right format", page: "how-it-works", hash: "find-your-spaces" },
    { label: "CREATIVE", title: "Get your artwork ready", page: "help", hash: "artwork" },
    { label: "BOOKING", title: "Know what happens next", page: "how-it-works", hash: "book-a-campaign" },
    { label: "PUBLISHERS", title: "Make more of your space", page: "publishers" },
];

export function GuidesStrip({ className, title }: { className?: string; /** LM-1: the layout's title for the strip. */ title?: string | null }) {
    return (
        <Rail title={title ?? "A little help before you book"} titleClassName="max-w-[376px]" gap={28} className={className}>
            {GUIDES.map((guide) => (
                <Link
                    key={guide.label}
                    href={pageHref(guide.page, {}, guide.hash ? { hash: guide.hash } : {})}
                    className="flex min-w-[280px] flex-1 basis-0 snap-start flex-col overflow-hidden rounded-[12px] bg-white shadow-[0px_4px_8px_rgba(0,0,0,0.04)] hover:shadow-card"
                >
                    <div className="h-[299px] overflow-hidden bg-[#f1f1ee]">
                        <img src="/design/format-outdoor.jpg" alt="" className="size-full object-cover" loading="lazy" />
                    </div>
                    <div className="px-[26px] pb-[26px] pt-[26px]">
                        <p className="text-lg font-medium leading-6 text-dim">{guide.label}</p>
                        <p className="mt-2 text-lg font-medium leading-6 text-ink">{guide.title}</p>
                    </div>
                </Link>
            ))}
        </Rail>
    );
}
