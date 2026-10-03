"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { LayoutBlocks } from "@/components/layout/layout-blocks";
import { useLayout } from "@/components/layout/use-layout";
import type { Layout } from "@/services/layouts";
import { PLACEMENT_MEANING, perDayLabel, specFor, specSize, type AdSlotInfo, type BoostPlacementInfo, type MediaSpec } from "@/services/promotions";

/** Signed in, sign-in passes straight on to `next`; signed out, it asks first. */
export const BOOK_AD_HREF = "/sign-in?next=%2Fadvertiser%2Fpromotions%2Fnew";
export const SPONSOR_HREF = "/sign-in?next=%2Fpublisher%2Fpromotions%2Fnew";

/** Where a slot's ads show, in a buyer's words. */
const SURFACE_WORDS: Record<string, string> = {
    WEB_HOME: "the adx.in home page",
    WEB_EXPLORE: "Explore on adx.in",
    WEB_FORMATS: "the formats page on adx.in",
    WEB_LISTING: "every listing page on adx.in",
    APP_ADVERTISER_HOME: "the ADX app's home, for advertisers",
    APP_PUBLISHER_HOME: "the ADX app's home, for publishers",
    APP_PARTNER_HOME: "the ADX partner app's home",
    AGENT_HOME: "the ADX agent app's home",
};

export function whereLabel(surfaces: string[] | null | undefined): string {
    const words = (surfaces ?? []).map((surface) => SURFACE_WORDS[surface] ?? surface.toLowerCase().replace(/_/g, " "));
    if (words.length === 0) return "Across ADX";
    const text = words.length === 1 ? words[0] : `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`;
    return text.charAt(0).toUpperCase() + text.slice(1);
}

const AD_STEPS = [
    { title: "Book the slot and the dates", line: "Pick a slot, the days it runs and, if you like, the cities it shows in. Each day has a fixed number of places." },
    { title: "Upload your artwork", line: "One image at the slot's size, with a headline and where a tap goes." },
    { title: "Pay", line: "From your ADX wallet, or by card or UPI. The price is the day rate times the days, plus 18% GST." },
    { title: "ADX reviews the artwork", line: "Before it runs. If ADX turns it down, the whole amount comes back to your ADX wallet." },
    { title: "It runs, labelled “Ad”", line: "It rotates with the other ads in the slot, and you see its impressions and clicks day by day." },
];

const BOOST_STEPS = [
    { title: "Pick a live listing", line: "Any of your listings that is live on the marketplace." },
    { title: "Pick where and when", line: "Top of search, top of similar listings, or both — and the days it runs." },
    { title: "Pay", line: "From your earnings, or by card or UPI. No artwork review: the listing is already approved." },
    { title: "It runs, labelled “Sponsored”", line: "From its first day to its last, with impressions and clicks to show for it." },
];

/**
 * LM-1 · Advertise with ADX — the two paid placements ADX sells, from the
 * public reads: display ads in ad slots (review, then run; a rejection
 * refunds in full) and sponsored listings (no review). Every paid
 * placement carries its label — "Ad" or "Sponsored". A read that could not
 * be made says the prices are shown at booking. PB-3: the hero, the display
 * ads and the sponsored listings are the `WEB_ADVERTISE` layout's sections
 * (the two titled ones take Studio's title override), in the order ADX
 * publishes, with anything ADX adds around them.
 */
export function AdvertiseBody({ slots, placements, initialLayout, preview = null }: { slots: AdSlotInfo[] | null; placements: BoostPlacementInfo[] | null; initialLayout?: Layout | null; preview?: string | null }) {
    const layout = useLayout("WEB_ADVERTISE", { initial: initialLayout, preview });
    return (
        <div className="bg-white">
            <LayoutBlocks
                surface="WEB_ADVERTISE"
                layout={layout}
                gapClassName=""
                contentClassName="mx-auto w-full max-w-[1480px] px-4 py-12 sm:px-6 lg:px-16"
                system={{
                    advertise_hero: <AdvertiseHero />,
                    display_ads_section: (title) => <DisplayAdsSection slots={slots} title={title} />,
                    sponsored_listings_section: (title) => <SponsoredListingsSection placements={placements} title={title} />,
                }}
            />
        </div>
    );
}

function AdvertiseHero() {
    return (
        <section className="relative overflow-hidden">
            <div aria-hidden className="pointer-events-none absolute left-[21.8%] top-[240px] h-[420px] w-[1100px] rounded-full bg-brand-soft opacity-50 blur-[200px]" />
            <div className="relative mx-auto max-w-[1920px] px-4 sm:px-6 lg:px-16">
                <div className="mx-auto max-w-[1480px] pb-12 pt-[96px] sm:pt-[132px]">
                    <h1 className="max-w-[640px] text-[40px] font-extrabold leading-[48px] tracking-[-1.6px] text-ink sm:text-[48px] sm:leading-[56px]">Advertise with ADX</h1>
                    <p className="mt-3 max-w-[560px] text-lg leading-6 text-dim">Put your brand in front of the people planning outdoor, indoor and transit campaigns — or put your own space first when they search.</p>
                    <nav className="mt-10 flex flex-wrap gap-[21px]" aria-label="On this page">
                        <a href="#display-ads" className="rounded-full bg-brand-soft px-[15px] py-2 text-sm font-medium leading-5 text-brand hover:bg-[#f9d6d4]">
                            Display ads
                        </a>
                        <a href="#sponsored-listings" className="rounded-full bg-brand-soft px-[15px] py-2 text-sm font-medium leading-5 text-brand hover:bg-[#f9d6d4]">
                            Sponsored listings
                        </a>
                    </nav>
                </div>
            </div>
        </section>
    );
}

function DisplayAdsSection({ slots, title }: { slots: AdSlotInfo[] | null; title?: string | null }) {
    return (
        <section id="display-ads" className="scroll-mt-20 border-y border-line bg-[#f5f5f3]">
            <div className="mx-auto max-w-[1920px] px-4 sm:px-6 lg:px-16">
                <div className="mx-auto max-w-[1480px] py-16">
                    <SectionHead title={title ?? "Display ads"} line="Your artwork in an ad slot on ADX, for the days you book. For brands, events and anyone with something to show the people buying advertising." cta={{ label: "Book an ad", href: BOOK_AD_HREF }} />
                    <Disclosure label="Ad">Every display ad is marked “Ad” where it shows.</Disclosure>
                    {slots && slots.length > 0 ? (
                        <ul className="mt-8 grid gap-6 md:grid-cols-2 xl:grid-cols-3" data-testid="advertise-slots">
                            {slots.map((slot) => {
                                // The slot read carries its spec's detail (`specDetail`); the contract's five sizes answer otherwise.
                                const detail = (slot as AdSlotInfo & { specDetail?: MediaSpec | null }).specDetail;
                                const spec = specFor(slot.spec, detail ? [detail] : null);
                                return (
                                    <li key={slot.key} className="flex h-full flex-col rounded-[8px] border border-line bg-white p-6">
                                        <p className="text-lg font-semibold leading-6 text-ink">{slot.label}</p>
                                        {slot.description && <p className="mt-2 text-sm leading-5 text-dim">{slot.description}</p>}
                                        <dl className="mt-5 grid gap-2 text-sm">
                                            <Fact label="Where" value={whereLabel(slot.surfaces)} />
                                            <Fact label="Artwork" value={spec ? `${specSize(spec)} (${spec.label.toLowerCase()})` : slot.spec} />
                                            <Fact label="Shortest run" value={`${slot.minDays} day${slot.minDays === 1 ? "" : "s"}`} />
                                            <Fact label="Rotates with" value={slot.maxConcurrent > 1 ? `Up to ${slot.maxConcurrent - 1} other ad${slot.maxConcurrent - 1 === 1 ? "" : "s"} a day` : "No other ad — one a day"} />
                                        </dl>
                                        <p className="mt-auto pt-5 text-xl font-semibold tabular-nums text-ink">
                                            {perDayLabel(slot.ratePerDay)} <span className="text-sm font-normal text-dim">+ 18% GST</span>
                                        </p>
                                    </li>
                                );
                            })}
                        </ul>
                    ) : (
                        <Unread />
                    )}
                    <Steps steps={AD_STEPS} />
                    <p className="mt-6 max-w-[760px] text-sm leading-5 text-ink">If ADX does not approve your artwork, the whole amount — GST included — is refunded to your ADX wallet. Cancel before the first day and it is refunded in full; once it has started it stops and nothing is refunded.</p>
                </div>
            </div>
        </section>
    );
}

function SponsoredListingsSection({ placements, title }: { placements: BoostPlacementInfo[] | null; title?: string | null }) {
    return (
        <section id="sponsored-listings" className="scroll-mt-20">
            <div className="mx-auto max-w-[1920px] px-4 sm:px-6 lg:px-16">
                <div className="mx-auto max-w-[1480px] py-16">
                    <SectionHead title={title ?? "Sponsored listings"} line="For publishers: show one of your live listings first, where advertisers are already looking." cta={{ label: "Sponsor a listing", href: SPONSOR_HREF }} />
                    <Disclosure label="Sponsored">A sponsored listing is marked “Sponsored” wherever it is shown first.</Disclosure>
                    {placements && placements.length > 0 ? (
                        <ul className="mt-8 grid gap-6 md:grid-cols-2" data-testid="advertise-placements">
                            {placements.map((row) => {
                                const meaning = PLACEMENT_MEANING[row.placement] ?? { title: row.label, line: "" };
                                return (
                                    <li key={row.placement} className="flex h-full flex-col rounded-[8px] border border-line bg-white p-6">
                                        <p className="text-lg font-semibold leading-6 text-ink">{meaning.title}</p>
                                        <p className="mt-2 text-sm leading-5 text-dim">{meaning.line}</p>
                                        <dl className="mt-5 grid gap-2 text-sm">
                                            <Fact label="Shortest run" value={`${row.minDays} day${row.minDays === 1 ? "" : "s"}`} />
                                            <Fact label="Places a day" value={`${row.maxConcurrent} per city and category`} />
                                        </dl>
                                        <p className="mt-auto pt-5 text-xl font-semibold tabular-nums text-ink">
                                            {perDayLabel(row.ratePerDay)} <span className="text-sm font-normal text-dim">+ 18% GST</span>
                                        </p>
                                    </li>
                                );
                            })}
                        </ul>
                    ) : (
                        <Unread />
                    )}
                    <Steps steps={BOOST_STEPS} />
                </div>
            </div>
        </section>
    );
}

function SectionHead({ title, line, cta }: { title: string; line: string; cta: { label: string; href: string } }) {
    return (
        <div className="flex flex-wrap items-end justify-between gap-6">
            <div className="max-w-[760px]">
                <h2 className="text-[32px] font-semibold leading-10 text-ink">{title}</h2>
                <p className="mt-2 text-lg leading-6 text-dim">{line}</p>
            </div>
            <Link href={cta.href} className="inline-flex h-[54px] min-w-[220px] items-center justify-center rounded-[8px] bg-brand px-6 text-sm font-semibold text-white hover:bg-[#a51b1b]">
                {cta.label}
            </Link>
        </div>
    );
}

function Disclosure({ label, children }: { label: string; children: ReactNode }) {
    return (
        <p className="mt-6 flex items-center gap-3 text-sm text-ink">
            <span className="inline-flex h-6 items-center rounded-[4px] border border-line bg-white px-2 text-[11px] font-semibold uppercase tracking-wide text-dim">{label}</span>
            {children}
        </p>
    );
}

function Fact({ label, value }: { label: string; value: string }) {
    return (
        <div className="flex items-baseline justify-between gap-4">
            <dt className="text-dim">{label}</dt>
            <dd className="text-right text-ink">{value}</dd>
        </div>
    );
}

function Unread() {
    return <p className="mt-8 rounded-[8px] border border-dashed border-line bg-white px-6 py-8 text-center text-sm text-dim">Prices are shown at booking.</p>;
}

function Steps({ steps }: { steps: { title: string; line: string }[] }) {
    return (
        <ol className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-5">
            {steps.map((step, index) => (
                <li key={step.title}>
                    <p className="text-xs font-medium uppercase leading-4 tracking-[1.2px] text-dim">{String(index + 1).padStart(2, "0")}</p>
                    <p className="mt-2 text-base font-semibold leading-6 text-ink">{step.title}</p>
                    <p className="mt-1 text-sm leading-5 text-dim">{step.line}</p>
                </li>
            ))}
        </ol>
    );
}
