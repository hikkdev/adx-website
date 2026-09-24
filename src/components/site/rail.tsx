"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * A DR 12 card rail: the heading on the left, the two chevron buttons on the
 * right (5204:53188), and a track of cards under them. At the design's width
 * every card fits; narrower, the track scrolls and the chevrons page it one
 * card at a time.
 */
export function Rail({ title, children, className, titleClassName, gap = 22 }: { title: string; children: React.ReactNode; className?: string; titleClassName?: string; gap?: number }) {
    const track = React.useRef<HTMLDivElement>(null);

    const page = (direction: -1 | 1) => {
        const el = track.current;
        if (!el) return;
        const card = el.querySelector<HTMLElement>(":scope > *");
        const step = card ? card.offsetWidth + gap : el.clientWidth * 0.8;
        el.scrollBy({ left: direction * step, behavior: "smooth" });
    };

    return (
        <section className={className}>
            <div className="flex items-start justify-between gap-6">
                <h2 className={cn("text-[32px] font-medium leading-10 text-ink", titleClassName)}>{title}</h2>
                <div className="flex shrink-0 items-center gap-6 pt-0.5">
                    <RailButton label="Previous" onClick={() => page(-1)}>
                        <ChevronLeft className="size-4" aria-hidden />
                    </RailButton>
                    <RailButton label="Next" onClick={() => page(1)}>
                        <ChevronRight className="size-4" aria-hidden />
                    </RailButton>
                </div>
            </div>
            <div
                ref={track}
                className="mt-8 flex snap-x overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                style={{ gap }}
            >
                {children}
            </div>
        </section>
    );
}

function RailButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
    return (
        <button
            type="button"
            onClick={onClick}
            aria-label={label}
            className="flex size-[37px] items-center justify-center rounded-[8px] border border-line bg-white text-ink shadow-[0px_1px_1px_rgba(0,0,0,0.12),0px_2px_5px_rgba(60,66,87,0.08)] hover:border-ink"
        >
            {children}
        </button>
    );
}
