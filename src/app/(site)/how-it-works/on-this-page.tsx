"use client";

import * as React from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

export interface PageAnchor {
    id: string;
    label: string;
}

/**
 * "On this page" (5204:56507 + 5204:56508): the three anchors of the guide,
 * the current one in the red box, then the help line and the social marks.
 * The current section is whichever heading is nearest the top of the
 * viewport, so the rail follows the reader down the page.
 */
export function OnThisPage({ anchors }: { anchors: PageAnchor[] }) {
    const [active, setActive] = React.useState(anchors[0]?.id ?? "");

    React.useEffect(() => {
        const sections = anchors.map((anchor) => document.getElementById(anchor.id)).filter((el): el is HTMLElement => el !== null);
        if (sections.length === 0) return;
        const observer = new IntersectionObserver(
            (entries) => {
                const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
                if (visible[0]) setActive(visible[0].target.id);
            },
            { rootMargin: "-15% 0px -65% 0px" }
        );
        sections.forEach((section) => observer.observe(section));
        return () => observer.disconnect();
    }, [anchors]);

    return (
        <aside className="lg:sticky lg:top-24">
            <h2 className="text-[32px] font-semibold leading-10 text-ink">On this page</h2>
            <nav className="mt-[3px] grid w-[230px] gap-3 py-5" aria-label="On this page">
                {anchors.map((anchor) => (
                    <a
                        key={anchor.id}
                        href={`#${anchor.id}`}
                        onClick={() => setActive(anchor.id)}
                        aria-current={active === anchor.id ? "location" : undefined}
                        className={cn(
                            "block rounded-[6px] border px-[18px] py-[15px] text-sm font-medium leading-5",
                            active === anchor.id ? "border-brand bg-brand-soft text-brand" : "border-[rgba(204,204,204,0.5)] bg-white text-dim hover:text-ink"
                        )}
                    >
                        {anchor.label}
                    </a>
                ))}
            </nav>
            <div className="py-[18px]">
                <p className="text-sm font-medium leading-5 text-dim">
                    Need a hand?{" "}
                    <Link href="/help" className="underline underline-offset-2 hover:text-ink">
                        Visit the help centre
                    </Link>
                </p>
                <div className="mt-3 flex items-center gap-[22px]" aria-hidden>
                    <img src="/design/social-x.svg" alt="" className="size-[26px] p-[3px]" />
                    <img src="/design/social-youtube.svg" alt="" className="size-[26px] p-[3px]" />
                    <img src="/design/social-facebook.svg" alt="" className="size-[26px] p-[3px]" />
                </div>
            </div>
        </aside>
    );
}
