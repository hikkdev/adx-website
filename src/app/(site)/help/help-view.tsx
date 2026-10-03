"use client";

import * as React from "react";
import Link from "next/link";
import { CalendarHeart, Laptop, MessageCircle, Phone, Search, Wallet, type LucideIcon } from "lucide-react";
import { LayoutBlocks } from "@/components/layout/layout-blocks";
import { useLayout } from "@/components/layout/use-layout";
import { FaqAccordion, type FaqItem } from "@/components/site/faq-accordion";
import { useAuth } from "@/lib/auth";
import { usePageHref } from "@/lib/site-links";
import type { Layout } from "@/services/layouts";
import { liveChatLine, supportLiveService, telHref, type LiveStatus } from "@/services/legal";
import type { Party } from "@/services/party";

/**
 * "Explore help topics" (5204:58452): the six topic cards, each opening the
 * page that answers it. The ids are the footer's anchors (`/help#booking`,
 * `#payment`, `#artwork`, `#publisher`); the keywords feed the search box.
 * PB-1: a card that opens a Studio page names it by key.
 */
const TOPICS: { id: string; title: string; icon: LucideIcon; href: string | { page: string; hash?: string }; keywords: string }[] = [
    { id: "booking", title: "Booking a space", icon: CalendarHeart, href: { page: "how-it-works", hash: "book-a-campaign" }, keywords: "book dates availability campaign cart checkout" },
    { id: "payment", title: "Billing & payments", icon: Wallet, href: "/advertiser/billing", keywords: "invoice gst pay card upi receipt" },
    { id: "artwork", title: "Artwork requirements", icon: Laptop, href: { page: "how-it-works", hash: "prepare-your-artwork" }, keywords: "creative file size format specifications design" },
    { id: "delivery", title: "Delivery proofs", icon: CalendarHeart, href: { page: "how-it-works", hash: "delivery" }, keywords: "installation live photo proof verification" },
    { id: "cancellations", title: "Cancellations", icon: Wallet, href: "/refund", keywords: "cancel change dates refund policy" },
    { id: "publisher", title: "Publisher help", icon: Laptop, href: { page: "publishers" }, keywords: "list space rates payouts earnings inventory" },
];

/** What the help centre is told on the server: the support line and when it answers. */
export interface HelpContact {
    phone: string;
    hours: string | null;
}

/** Each side's own help desk — its requests, and live chat where the plan includes it. */
const DESK_OF: Record<Party, string> = { ADVERTISER: "/advertiser/help", PUBLISHER: "/publisher/help", PRINT_PARTNER: "/partner/help" };
const REQUESTS_OF: Record<Party, string> = { ADVERTISER: "/advertiser/requests", PUBLISHER: "/publisher/help", PRINT_PARTNER: "/partner/help" };

/**
 * "Common questions" (5204:58507), all three open as the frame draws them —
 * the site's own words, shown only when ADX's published FAQ could not be
 * read or has no questions in it.
 */
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

/**
 * DR 12 · 06 · Help centre (5204:58251). The search box narrows the topics
 * and the questions as you type. The questions are ADX's published FAQ and
 * the number its published support line (the page reads both on the
 * server); signed in, "Chat with ADX" says whether live chat is open —
 * `GET /support/live/status`, the read the app's support hub makes.
 *
 * PB-3: the hero with its search (`help_hero`), the topics (`help_topics`),
 * "Need a hand?" (`help_contact`) and the questions (`help_faq`) are the
 * `WEB_HELP` layout's sections. The frame sets the topics and the contact
 * list side by side: the blocks sit on a full-bleed grid — the hero across
 * it, every other block in the content columns, the topics in the wide
 * one and the contact list in the narrow one beside it — so the design
 * holds in the default order and degrades to a stack when ADX reorders.
 */
export function HelpView({ faqs = null, faqPlaceholder = false, contact, initialLayout, preview = null }: { faqs?: FaqItem[] | null; faqPlaceholder?: boolean; contact: HelpContact; initialLayout?: Layout | null; preview?: string | null }) {
    const { status, party } = useAuth();
    const href = usePageHref();
    const layout = useLayout("WEB_HELP", { initial: initialLayout, preview });
    const [live, setLive] = React.useState<LiveStatus | null>(null);
    const [query, setQuery] = React.useState("");
    const source = faqs ?? QUESTIONS;
    const needle = query.trim().toLowerCase();
    const topics = needle ? TOPICS.filter((topic) => matches(`${topic.title} ${topic.keywords}`, needle)) : TOPICS;
    const questions = needle ? source.filter((item) => matches(`${item.question} ${item.answer}`, needle)) : source;

    React.useEffect(() => {
        if (status !== "signed-in") return;
        let cancelled = false;
        supportLiveService
            .status()
            .then((next) => {
                if (!cancelled) setLive(next);
            })
            .catch(() => {
                /* Never fatal: the desk's doors stay as they are. */
            });
        return () => {
            cancelled = true;
        };
    }, [status]);

    const signedIn = status === "signed-in";
    const signIn = `/sign-in?next=${encodeURIComponent(href("help"))}`;
    const desk = party ? DESK_OF[party] : signIn;
    const requests = party ? REQUESTS_OF[party] : signIn;
    const nothing = needle && topics.length === 0 && questions.length === 0;
    const topicHref = (to: (typeof TOPICS)[number]["href"]) => (typeof to === "string" ? to : href(to.page, {}, to.hash ? { hash: to.hash } : {}));

    const hero = (
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
    );

    const topicsSection = (title: string | null) => (
        <div className="pt-[79px]">
            <h2 className="text-[32px] font-medium leading-10 text-ink">{title ?? "Explore help topics"}</h2>
            <div className="mt-[34px]">
                {topics.length > 0 ? (
                    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                        {topics.map((topic) => (
                            <Link
                                key={topic.id}
                                id={topic.id}
                                href={topicHref(topic.href)}
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
                <p className="mt-6 text-sm text-dim" data-testid="live-chat-line">
                    Call ADX on{" "}
                    <a href={telHref(contact.phone)} className="font-medium tabular-nums text-ink hover:text-brand">
                        {contact.phone}
                    </a>
                    {contact.hours ? ` (${contact.hours})` : ""}. {signedIn ? liveChatLine(live) : "Sign in to chat with ADX or raise a request."}
                </p>
            </div>
        </div>
    );

    const contactSection = (title: string | null) => (
        <aside className="pt-10 lg:pl-[34px] lg:pt-[159px]">
            <h2 className="text-2xl font-semibold leading-8 text-ink">{title ?? "Need a hand?"}</h2>
            <ul className="mt-[14px] space-y-3 text-sm font-medium leading-5 text-ink">
                <li>
                    <Link href={desk} className="inline-flex items-center gap-1.5 hover:text-brand">
                        <MessageCircle className="size-4 fill-ink text-ink" aria-hidden />
                        Chat with ADX
                    </Link>
                </li>
                <li>
                    <Link href="/contact" className="inline-flex items-center gap-1.5 hover:text-brand">
                        <Phone className="size-4 fill-ink" aria-hidden />
                        Create a support request
                    </Link>
                </li>
                <li>
                    <Link href={requests} className="inline-flex items-center gap-1.5 hover:text-brand">
                        <MessageCircle className="size-4 fill-ink text-ink" aria-hidden />
                        View your requests
                    </Link>
                </li>
                <li>
                    <a href={telHref(contact.phone)} className="inline-flex items-center gap-1.5 hover:text-brand">
                        <Phone className="size-4 fill-ink" aria-hidden />
                        Call ADX
                    </a>
                </li>
            </ul>
        </aside>
    );

    const faqSection = (title: string | null) => (
        <div className="pt-[76px]">
            <h2 className="text-[32px] font-medium leading-10 text-ink">{title ?? "Common questions"}</h2>
            {faqPlaceholder && <p className="mt-2 text-sm text-dim">These answers are placeholders until ADX publishes the final text.</p>}
            {questions.length > 0 ? (
                <FaqAccordion key={needle} items={questions} defaultOpen={questions.length <= 3 ? "all" : [0]} size="sm" className="mt-6" />
            ) : (
                <p className="mt-6 rounded-[12px] border border-line bg-white px-[34px] py-6 text-sm text-dim">No question matches “{query.trim()}”.</p>
            )}

            {nothing && (
                <p className="mt-6 text-sm text-dim">
                    Try another word, or{" "}
                    <Link href="/contact" className="font-medium text-ink underline underline-offset-2 hover:text-brand">
                        create a support request
                    </Link>{" "}
                    or call ADX on {contact.phone}.
                </p>
            )}
        </div>
    );

    return (
        <div
            /* The full-bleed grid (gutter · wide content · narrow content · gutter; one content column on a phone) is
               `.help-grid` in globals.css — plain CSS, because a Tailwind arbitrary selector reads the underscore in
               `data-block=help_contact` as a space and the stylesheet fails to parse (28 Sep 2026). */
            className="help-grid bg-white pb-20"
        >
            <LayoutBlocks
                surface="WEB_HELP"
                layout={layout}
                gapClassName=""
                contentClassName="py-12"
                system={{
                    help_hero: hero,
                    help_topics: topicsSection,
                    help_contact: contactSection,
                    help_faq: faqSection,
                }}
            />
        </div>
    );
}
