"use client";

import * as React from "react";
import { ChevronDown } from "lucide-react";
import { Markdown } from "@/components/platform/markdown";
import { cn } from "@/lib/utils";
import { faqOf } from "@/services/layouts";

/**
 * PB-4 · `faq`: the DR 12 question list (the publishers page's 5204:58154
 * card) with Markdown answers — one bordered card per question, the first
 * open, the chevron on the right.
 */
export function FaqBlock({ props }: { props: Record<string, unknown> }) {
    const faq = faqOf(props);
    const [open, setOpen] = React.useState<Set<number>>(() => new Set([0]));
    if (!faq) return null;
    const toggle = (index: number) =>
        setOpen((current) => {
            const next = new Set(current);
            if (next.has(index)) next.delete(index);
            else next.add(index);
            return next;
        });
    return (
        <section data-testid="faq">
            {faq.title && <h2 className="text-2xl font-semibold leading-8 text-ink">{faq.title}</h2>}
            <div className={cn("grid gap-3", faq.title && "mt-5")}>
                {faq.items.map((item, index) => {
                    const expanded = open.has(index);
                    const panelId = `faq-block-${index}`;
                    return (
                        <article key={index} className="rounded-[12px] border border-[rgba(204,204,204,0.5)] bg-white p-6 shadow-[0px_0px_18px_rgba(0,0,0,0.04)]">
                            <button type="button" onClick={() => toggle(index)} aria-expanded={expanded} aria-controls={panelId} className="flex w-full items-start justify-between gap-6 text-left">
                                <span className="text-lg font-semibold leading-6 text-ink">{item.question}</span>
                                <ChevronDown className={cn("mt-0.5 size-[19px] shrink-0 text-ink transition-transform", expanded && "rotate-180")} aria-hidden />
                            </button>
                            {expanded && <Markdown source={item.answer} topLevel={4} className="mt-2 max-w-[1320px] text-[15px]" />}
                        </article>
                    );
                })}
            </div>
        </section>
    );
}
