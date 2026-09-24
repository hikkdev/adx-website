import type { Metadata } from "next";
import Link from "next/link";
import { Rail } from "@/components/site/rail";
import { FaqAccordion, type FaqItem } from "@/components/site/faq-accordion";

export const metadata: Metadata = {
    title: "For publishers",
    description: "List your advertising spaces on ADX. Manage availability, bookings and delivery from your publisher account — from your first listing to your first booking.",
};

/** The publisher door: sign in, then the publisher workspace. */
const LIST_HREF = "/sign-in?next=%2Fchoose-workspace%3Fparty%3DPUBLISHER";

const STEPS: { id?: string; step: string; title: string; photo: string }[] = [
    { step: "01 · Add your space", title: "Show advertisers what makes your space useful", photo: "/design/format-outdoor.jpg" },
    { id: "rates", step: "02 · Manage availability", title: "Set your rates and available dates", photo: "/design/format-indoor.jpg" },
    { id: "bookings", step: "03 · Review bookings", title: "Keep every booking in one place", photo: "/design/format-digital.jpg" },
    { id: "delivery", step: "04 · Track delivery", title: "Share proof when the campaign goes live", photo: "/design/format-transit.jpg" },
];

const FORMS: { title: string; href: string; photo: string }[] = [
    { title: "Billboards", href: "/spaces?category=OUTDOOR", photo: "/design/format-outdoor.jpg" },
    { title: "Mall displays", href: "/spaces?category=INDOOR&q=mall", photo: "/design/format-indoor.jpg" },
    { title: "Bus advertising", href: "/spaces?category=TRANSIT", photo: "/design/format-transit.jpg" },
    { title: "Digital screens", href: "/spaces?display=DIGITAL", photo: "/design/format-digital.jpg" },
    { title: "Venue spaces", href: "/spaces?category=INDOOR", photo: "/design/format-indoor.jpg" },
];

/**
 * "Questions before you list" (5204:58151). The frame opens only the first
 * answer; the other six are written here from what the publisher account
 * does, so that every question opens to something.
 */
const QUESTIONS: FaqItem[] = [
    {
        question: "What information do I need to list a space?",
        answer: "Add the location, clear photos, dimensions and media specifications. Set your rates and availability, then submit the listing for review. Your publisher profile keeps the business and payout details together.",
    },
    {
        question: "Can I list more than one advertising space?",
        answer: "Yes. Add every space you manage; each one is its own listing with its own photos, rates and availability, and your inventory shows them together. Larger portfolios can be imported in one go.",
    },
    {
        question: "How do I set prices and available dates?",
        answer: "Every listing carries a rate card and a calendar. Set the base rate and the booking unit, then block the dates that are already taken; advertisers only see the dates you leave open.",
    },
    {
        question: "What happens after an advertiser books?",
        answer: "The booking lands in your publisher account with the campaign dates, the artwork and the amount due. Review and accept it, and the campaign moves into fulfilment on its start date.",
    },
    {
        question: "How do I share installation or delivery proof?",
        answer: "Open the booking and add proof photos when the campaign goes up. The advertiser sees them against their campaign, and the proof is what releases your payout.",
    },
    {
        id: "payouts",
        question: "Where can I track earnings and payouts?",
        answer: "Earnings & payouts in your publisher account lists every booking's amount, the platform fee and the payout status, with statements to download.",
    },
    {
        question: "Can I update a published listing?",
        answer: "Yes. Edit the photos, specifications, rates or availability at any time; the change is reviewed and goes live without interrupting the bookings already made.",
    },
];

/** DR 12 · 05 · List your advertising spaces (5204:58050). */
export default function PublishersPage() {
    return (
        <div className="bg-white">
            <section className="mx-auto max-w-[1920px] px-6 lg:px-16">
                <div className="mx-auto max-w-[700px] pt-[166px] text-center">
                    <h1 className="text-[48px] font-extrabold leading-[56px] tracking-[-1.6px] text-ink">Make room for advertising.</h1>
                    <p className="mx-auto mt-2 max-w-[548px] text-lg leading-6 text-dim">List your advertising spaces on ADX. Manage availability, bookings and delivery from your publisher account.</p>
                    <Link href={LIST_HREF} className="mt-16 inline-flex h-[54px] w-[279px] items-center justify-center rounded-[8px] bg-brand text-sm font-semibold text-white hover:bg-[#a51b1b]">
                        List your ad space
                    </Link>
                </div>
            </section>

            <div className="mx-auto max-w-[1920px] px-6 lg:px-16">
                <div className="mx-auto max-w-[1480px]">
                    <Rail title="From your first listing to your first booking" className="pt-[120px]" gap={38}>
                        {STEPS.map((step) => (
                            <article key={step.step} id={step.id} className="min-w-[280px] flex-1 basis-0 snap-start scroll-mt-24">
                                <div className="h-[229px] overflow-hidden rounded-[8px] bg-[#f1f1ee]">
                                    <img src={step.photo} alt="" className="size-full object-cover" loading="lazy" />
                                </div>
                                <div className="mt-[13px] flex h-12 items-center">
                                    <h3 className="text-lg font-semibold leading-6 text-ink">{step.title}</h3>
                                </div>
                                <p className="mt-4 max-w-[190px] text-xs font-medium uppercase leading-4 tracking-[1.2px] text-dim">{step.step}</p>
                            </article>
                        ))}
                    </Rail>

                    <Rail title="Advertising spaces come in many forms" className="pt-20">
                        {FORMS.map((form) => (
                            <Link
                                key={form.title}
                                href={form.href}
                                className="relative flex h-[360px] min-w-[240px] flex-1 basis-0 snap-start flex-col justify-end overflow-hidden rounded-[8px] bg-[#f1f1ee] p-6 hover:shadow-card"
                            >
                                <img src={form.photo} alt="" className="absolute inset-0 size-full object-cover" loading="lazy" />
                                <div aria-hidden className="absolute inset-x-0 bottom-0 h-[262px] bg-gradient-to-t from-[rgba(0,0,0,0.6)] to-transparent" />
                                <p className="relative text-2xl font-semibold leading-8 text-white">{form.title}</p>
                            </Link>
                        ))}
                    </Rail>

                    <section className="pb-[18px] pt-[93px]">
                        <h2 className="pt-[25px] text-2xl font-semibold leading-8 text-ink">Questions before you list</h2>
                        <FaqAccordion items={QUESTIONS} defaultOpen={[0]} size="lg" className="mt-[21px]" />
                    </section>
                </div>
            </div>
        </div>
    );
}
