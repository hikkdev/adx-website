"use client";

import * as React from "react";
import Link from "next/link";
import { CalendarHeart, Laptop, MessageCircle, Phone, Search, Wallet, type LucideIcon } from "lucide-react";
import { FaqAccordion, type FaqItem } from "@/components/site/faq-accordion";

/**
 * "Explore help topics" (5204:58452): the six topic cards, each opening the
 * page that answers it. The ids are the footer's anchors (`/help#booking`,
 * `#payment`, `#artwork`, `#publisher`); the keywords feed the search box.
 */
const TOPICS: { id: string; title: string; icon: LucideIcon; href: string; keywords: string }[] = [
    { id: "booking", title: "Booking a space", icon: CalendarHeart, href: "/how-it-works#book-a-campaign", keywords: "book dates availability campaign cart checkout" },
    { id: "payment", title: "Billing & payments", icon: Wallet, href: "/advertiser/billing", keywords: "invoice gst pay card upi receipt" },
    { id: "artwork", title: "Artwork requirements", icon: Laptop, href: "/how-it-works#prepare-your-artwork", keywords: "creative file size format specifications design" },
    { id: "delivery", title: "Delivery proofs", icon: CalendarHeart, href: "/how-it-works#delivery", keywords: "installation live photo proof verification" },
    { id: "cancellations", title: "Cancellations", icon: Wallet, href: "/refund.html", keywords: "cancel change dates refund policy" },
    { id: "publisher", title: "Publisher help", icon: Laptop, href: "/publishers", keywords: "list space rates payouts earnings inventory" },
];

/** "Common questions" (5204:58507), all three open as the frame draws them. */
const QUESTIONS: FaqItem[] = [
    {
        question: "When does a booked campaign go live?",
        answer: "Payment confirms the booking. The creative must be approved and installation or playback confirmed before the campaign is marked live. You can follow each stage in your campaign.",
    },
    {
        question: "Where can I find my invoice?",
        answer: "Open Billing and payments from your account, choose the campaign and view its invoice. Booking totals, add-ons, fees and tax are itemised together.",
    },
    {
        question: "Can I change dates or cancel a booking?",
        answer: "Open the booking and choose the relevant request. Changes depend on availability and the terms shown for that space. Review any applicable charges before confirming.",
    },
];

const matches = (haystack: string, needle: string) => haystack.toLowerCase().includes(needle);

/** DR 12 · 06 · Help centre (5204:58251). The search box narrows the topics and the questions as you type. */
export function HelpView() {
    const [query, setQuery] = React.useState("");
    const needle = query.trim().toLowerCase();
    const topics = needle ? TOPICS.filter((topic) => matches(`${topic.title} ${topic.keywords}`, needle)) : TOPICS;
    const questions = needle ? QUESTIONS.filter((item) => matches(`${item.question} ${item.answer}`, needle)) : QUESTIONS;
    const nothing = needle && topics.length === 0 && questions.length === 0;

    return (
        <div className="bg-white">
            <section className="bg-[#f5f5f3] bg-cover bg-bottom" style={{ backgroundImage: "url(/design/help-hero.png)" }}>
                <div className="mx-auto max-w-[520px] px-6 pb-[110px] pt-[113px] text-center">
                    <h1 className="text-[48px] font-extrabold leading-[56px] tracking-[-1.6px] text-ink">ADX Help Centre</h1>
                    <p className="mt-2 text-lg leading-6 text-dim">Help with your campaign, booking or ad space</p>
                    <form role="search" className="mt-14" onSubmit={(event) => event.preventDefault()}>
                        <label className="flex h-14 items-center gap-3 rounded-[8px] bg-white px-6 text-left shadow-[0px_2px_10px_rgba(0,0,0,0.08)]">
                            <Search className="size-5 shrink-0 text-ink" aria-hidden />
                            <input
                                value={query}
                                onChange={(event) => setQuery(event.target.value)}
                                placeholder="Search help topics"
                                aria-label="Search help topics"
                                className="min-w-0 flex-1 bg-transparent text-sm font-medium leading-5 text-ink placeholder:text-dim focus:outline-none"
                            />
                        </label>
                    </form>
                </div>
            </section>

            <div className="mx-auto max-w-[1920px] px-6 lg:px-16">
                <div className="mx-auto max-w-[1488px] pb-20 pt-[79px]">
                    <h2 className="text-[32px] font-medium leading-10 text-ink">Explore help topics</h2>
                    <div className="mt-[34px] grid gap-8 lg:grid-cols-[minmax(0,1128px)_minmax(0,1fr)]">
                        <div>
                            {topics.length > 0 ? (
                                <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                                    {topics.map((topic) => (
                                        <Link
                                            key={topic.id}
                                            id={topic.id}
                                            href={topic.href}
                                            className="flex h-40 scroll-mt-24 flex-col justify-between rounded-[12px] border border-black/10 bg-white p-6 shadow-[0px_2px_3px_rgba(0,0,0,0.05)] hover:border-ink"
                                        >
                                            <topic.icon className="mt-2.5 size-7 text-ink" strokeWidth={1.75} aria-hidden />
                                            <span className="text-lg font-medium leading-6 text-ink">{topic.title}</span>
                                        </Link>
                                    ))}
                                </div>
                            ) : (
                                <p className="rounded-[12px] border border-line bg-white p-6 text-sm text-dim">No help topic matches “{query.trim()}”.</p>
                            )}
                        </div>

                        <aside className="pt-1.5 lg:pl-[34px]">
                            <h2 className="text-2xl font-semibold leading-8 text-ink">Need a hand?</h2>
                            <ul className="mt-[14px] space-y-3 text-sm font-medium leading-5 text-ink">
                                <li>
                                    <a href="/contact.html" className="inline-flex items-center gap-1.5 hover:text-brand">
                                        <Phone className="size-4 fill-ink" aria-hidden />
                                        Create a support request
                                    </a>
                                </li>
                                <li>
                                    <Link href="/advertiser/requests" className="inline-flex items-center gap-1.5 hover:text-brand">
                                        <MessageCircle className="size-4 fill-ink text-ink" aria-hidden />
                                        View your requests
                                    </Link>
                                </li>
                            </ul>
                        </aside>
                    </div>

                    <h2 className="mt-[76px] text-[32px] font-medium leading-10 text-ink">Common questions</h2>
                    {questions.length > 0 ? (
                        <FaqAccordion key={needle} items={questions} defaultOpen="all" size="sm" className="mt-6" />
                    ) : (
                        <p className="mt-6 rounded-[12px] border border-line bg-white px-[34px] py-6 text-sm text-dim">No question matches “{query.trim()}”.</p>
                    )}

                    {nothing && (
                        <p className="mt-6 text-sm text-dim">
                            Try another word, or{" "}
                            <a href="/contact.html" className="font-medium text-ink underline underline-offset-2 hover:text-brand">
                                create a support request
                            </a>{" "}
                            and we will call you back on +91 80008 00546.
                        </p>
                    )}
                </div>
            </div>
        </div>
    );
}
