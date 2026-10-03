"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { heroOf } from "@/services/layouts";
import { CtaButton } from "./target-link";

/**
 * PB-4 · `hero`: the page's opening — a headline in the site's display
 * type, a line under it, up to two buttons, and a wide picture beside
 * (LEFT) or under (CENTER) the words. On a custom page it is the page's
 * h1; on a system page, which has one already, it is an h2 drawn the same.
 */
export function HeroBlock({ props, surface }: { props: Record<string, unknown>; surface: string }) {
    const hero = heroOf(props);
    if (!hero) return null;
    const center = hero.align === "CENTER";
    const Heading = surface.startsWith("WEB_") ? "h2" : "h1";
    const beside = hero.media && !center;
    return (
        <section data-testid="hero" className={cn("grid items-center gap-8", beside && "lg:grid-cols-2 lg:gap-12")}>
            <div className={cn(center && "mx-auto max-w-[720px] text-center")}>
                <Heading className="text-[40px] font-extrabold leading-[48px] tracking-[-1.6px] text-ink sm:text-[48px] sm:leading-[56px]">{hero.headline}</Heading>
                {hero.subheadline && <p className={cn("mt-3 max-w-[560px] text-lg leading-6 text-dim", center && "mx-auto")}>{hero.subheadline}</p>}
                {(hero.primaryCta || hero.secondaryCta) && (
                    <div className={cn("mt-8 flex flex-wrap gap-3", center && "justify-center")}>
                        {hero.primaryCta && <CtaButton label={hero.primaryCta.label} target={hero.primaryCta.target} style="PRIMARY" />}
                        {hero.secondaryCta && <CtaButton label={hero.secondaryCta.label} target={hero.secondaryCta.target} style="SECONDARY" />}
                    </div>
                )}
            </div>
            {hero.media && (
                <div className={cn("overflow-hidden rounded-2xl bg-ground", center ? "aspect-[10/3] min-h-[180px] w-full" : "aspect-[4/3] w-full lg:aspect-auto lg:h-[420px]")}>
                    <img src={hero.media.url} alt={hero.media.altText ?? ""} className="size-full object-cover" loading="eager" />
                </div>
            )}
        </section>
    );
}
