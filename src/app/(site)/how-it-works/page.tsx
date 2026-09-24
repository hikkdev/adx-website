import type { Metadata } from "next";
import Link from "next/link";
import { Check, X } from "lucide-react";
import { GuidesStrip } from "@/components/site/guides-strip";
import { OnThisPage } from "./on-this-page";

export const metadata: Metadata = {
    title: "How it works",
    description: "A practical guide to finding advertising spaces, booking a campaign and getting your ads live with ADX — from your first idea to your next audience.",
};

const ANCHORS = [
    { id: "find-your-spaces", label: "Find your spaces" },
    { id: "book-a-campaign", label: "Book a campaign" },
    { id: "prepare-your-artwork", label: "Prepare your artwork" },
];

const START = [
    "Start with your audience, location and campaign goal.",
    "Compare spaces, specifications, dates and prices.",
    "Add your shortlist and review the full campaign cost.",
    "Complete your brief, billing details and payment.",
];

const PLAN = {
    does: ["Check the location, dimensions and format.", "Choose dates and review availability.", "Review media, services, fees and GST."],
    donts: ["Printing is not included unless selected.", "Installation may be a separate service.", "Check each space’s cancellation terms."],
};

const PREPARE = {
    does: ["Upload artwork using the space specifications.", "Respond to any changes requested in review.", "Track installation and delivery proofs."],
    donts: ["Payment does not mean artwork is approved.", "A booking is not live until fulfilment begins.", "Raise an issue from your campaign if needed."],
};

/** DR 12 · 04 · From brief to live (5204:54855). */
export default function HowItWorksPage() {
    return (
        <div className="bg-white">
            <section className="relative overflow-hidden bg-white">
                <div aria-hidden className="pointer-events-none absolute left-[21.8%] top-[277px] h-[543px] w-[1289px] rounded-full bg-brand-soft opacity-50 blur-[200px]" />
                <div className="relative mx-auto max-w-[1920px] px-6 lg:px-16">
                    <div className="mx-auto max-w-[1480px] pb-[41px] pt-[132px]">
                        <h1 className="max-w-[590px] text-[48px] font-extrabold leading-[56px] tracking-[-1.6px] text-ink">From your first idea to your next audience.</h1>
                        <p className="mt-3 max-w-[469px] text-lg leading-6 text-dim">A practical guide to finding spaces, booking a campaign and getting your ads live with ADX.</p>
                        <div className="mt-[68px] flex flex-wrap gap-[21px]">
                            <Link href="/advertiser/campaigns/new" className="rounded-full bg-brand-soft px-[15px] py-2 text-sm font-medium leading-5 text-brand hover:bg-[#f9d6d4]">
                                For advertisers
                            </Link>
                            <Link href="/sign-in" className="rounded-full bg-brand-soft px-[15px] py-2 text-sm font-medium leading-5 text-brand hover:bg-[#f9d6d4]">
                                Getting started
                            </Link>
                        </div>
                    </div>
                </div>
            </section>

            <section className="relative overflow-hidden border-b border-line bg-[#f5f5f3]">
                <div className="mx-auto max-w-[1920px] px-6 lg:px-16">
                    <div className="mx-auto grid max-w-[1480px] lg:grid-cols-[minmax(0,1024px)_minmax(0,1fr)]">
                        <div id="find-your-spaces" className="max-w-[971px] scroll-mt-20 pb-16 pt-[60px] lg:pl-[9px]">
                            <p className="text-lg leading-6 text-ink">
                                ADX brings advertising spaces and the people who own them into one booking flow. Browse locations and formats, compare the full cost, then bring your selected spaces into a campaign. Your advertiser account keeps the booking, artwork, invoices and delivery proofs together.
                            </p>
                            <ol className="mt-[13px] space-y-[13px] pl-[29px] text-lg leading-6 text-ink">
                                {START.map((line) => (
                                    <li key={line}>{line}</li>
                                ))}
                            </ol>

                            <section id="book-a-campaign" className="mt-[26px] scroll-mt-20 border-t border-[#d9d9d9] pt-6">
                                <span id="dates" />
                                <h2 className="text-[32px] font-semibold leading-10 text-ink">Plan and book your spaces</h2>
                                <Checklist does={PLAN.does} donts={PLAN.donts} />
                                <Link href="/spaces" className="mt-[15px] inline-block text-sm leading-5 text-ink underline underline-offset-2 hover:text-brand">
                                    Explore available spaces
                                </Link>
                            </section>

                            <section id="prepare-your-artwork" className="mt-[26px] scroll-mt-20 border-t border-[#d9d9d9] pt-6">
                                <span id="artwork" />
                                <span id="delivery" />
                                <h2 className="text-[32px] font-semibold leading-10 text-ink">Prepare, launch and follow delivery</h2>
                                <Checklist does={PREPARE.does} donts={PREPARE.donts} />
                            </section>
                        </div>

                        <div className="relative pb-16 pt-[39px] before:absolute before:inset-y-0 before:-left-6 before:-right-[100vw] before:bg-white lg:pl-[95px] lg:before:left-0">
                            <div className="relative">
                                <OnThisPage anchors={ANCHORS} />
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            <div className="mx-auto max-w-[1920px] px-6 lg:px-16">
                <div className="mx-auto max-w-[1480px]">
                    <GuidesStrip className="pb-14 pt-[85px]" />
                </div>
            </div>
        </div>
    );
}

/** The two-column do / don't list under each heading (5204:54953). */
function Checklist({ does, donts }: { does: string[]; donts: string[] }) {
    return (
        <div className="mt-[14px] grid gap-x-[37px] md:grid-cols-2">
            <ul>
                {does.map((line) => (
                    <li key={line} className="flex h-[70px] items-start gap-2.5 pt-[7px] text-lg leading-6 text-ink">
                        <Check className="mt-0.5 size-5 shrink-0" aria-hidden />
                        <span>{line}</span>
                    </li>
                ))}
            </ul>
            <ul>
                {donts.map((line) => (
                    <li key={line} className="flex h-[70px] items-start gap-2.5 pt-[7px] text-lg leading-6 text-[#4d4d4d]">
                        <X className="mt-0.5 size-5 shrink-0" aria-hidden />
                        <span>{line}</span>
                    </li>
                ))}
            </ul>
        </div>
    );
}
