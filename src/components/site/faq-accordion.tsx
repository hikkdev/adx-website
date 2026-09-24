"use client";

import * as React from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export interface FaqItem {
    id?: string;
    question: string;
    answer: string;
}

/**
 * The DR 12 question list (5204:58154 on the publishers page, 5204:58508 on
 * the help centre): one bordered card per question, the chevron on the
 * right, the answer under the question when open. `size` is the card the
 * frame draws — the publishers page sets its questions at 18px in a 24px
 * pad, the help centre at 14px in a wider one.
 */
export function FaqAccordion({ items, defaultOpen = [0], size = "lg", className }: { items: FaqItem[]; defaultOpen?: number[] | "all"; size?: "lg" | "sm"; className?: string }) {
    const [open, setOpen] = React.useState<Set<number>>(() => new Set(defaultOpen === "all" ? items.map((_, i) => i) : defaultOpen));

    const toggle = (index: number) =>
        setOpen((current) => {
            const next = new Set(current);
            if (next.has(index)) next.delete(index);
            else next.add(index);
            return next;
        });

    return (
        <div className={cn("grid", size === "lg" ? "gap-3" : "gap-[18px]", className)}>
            {items.map((item, index) => {
                const expanded = open.has(index);
                const panelId = `faq-${item.id ?? index}-panel`;
                return (
                    <article
                        key={item.question}
                        id={item.id}
                        className={cn(
                            "scroll-mt-24 rounded-[12px] border border-[rgba(204,204,204,0.5)] bg-white shadow-[0px_0px_18px_rgba(0,0,0,0.04)]",
                            size === "lg" ? "p-6" : "px-[34px] py-6"
                        )}
                    >
                        <button type="button" onClick={() => toggle(index)} aria-expanded={expanded} aria-controls={panelId} className="flex w-full items-start justify-between gap-6 text-left">
                            <span className={cn("font-semibold text-ink", size === "lg" ? "text-lg leading-6" : "text-sm leading-5")}>{item.question}</span>
                            <ChevronDown className={cn("mt-0.5 size-[19px] shrink-0 text-ink transition-transform", expanded && "rotate-180")} aria-hidden />
                        </button>
                        {expanded && (
                            <p id={panelId} className={cn("max-w-[1320px] text-sm leading-5 text-ink", size === "lg" ? "mt-2" : "mt-3")}>
                                {item.answer}
                            </p>
                        )}
                    </article>
                );
            })}
        </div>
    );
}
