import type { Metadata } from "next";
import { cache } from "react";
import { OPERATOR } from "@/components/site/site-footer";
import { metadataFrom, readLayoutServer } from "@/services/layouts";
import { contactOf, faqItemsOf, isPlaceholder, legalServer } from "@/services/legal";
import { HelpView, type HelpContact } from "./help-view";

const FALLBACK = {
    title: "Help centre",
    description: "Help with your campaign, booking or ad space — booking, billing and payments, artwork requirements, delivery proofs, cancellations and publisher help.",
};

type Search = Promise<Record<string, string | string[] | undefined>>;
const first = (value: string | string[] | undefined) => ((Array.isArray(value) ? value[0] : value) ?? "").trim();

/** PB-3: one read of the page's layout per render; a preview token asks for the draft. */
const layoutForRender = cache((preview: string) => readLayoutServer("WEB_HELP", preview ? { preview } : {}));

export async function generateMetadata({ searchParams }: { searchParams: Search }): Promise<Metadata> {
    const preview = first((await searchParams).preview);
    return metadataFrom((await layoutForRender(preview))?.meta, FALLBACK, { noindex: !!preview });
}

/**
 * DR 07 wave 4 on the web (`support-home-screen.tsx`): the questions are the
 * FAQ document's items and the number is the contact document's support
 * line — published from the console (kept five minutes), so they change
 * without a deploy. A contact document that is still ADX Legal's
 * placeholder does not get to put a stand-in number in front of a caller:
 * the operator's own line, the one the footer prints, answers instead.
 * PB-3: the page's sections are the `WEB_HELP` layout's.
 */
export default async function HelpPage({ searchParams }: { searchParams: Search }) {
    const preview = first((await searchParams).preview);
    const [faq, contactDocument, layout] = await Promise.all([legalServer.document("FAQ"), legalServer.document("CONTACT_INFO"), layoutForRender(preview)]);
    const contact = contactOf(contactDocument);
    const line = !isPlaceholder(contactDocument) ? contact.supportLine : undefined;
    const help: HelpContact = line?.phone
        ? { phone: line.phone, hours: [line.days, line.hours].filter(Boolean).join(", ") || null }
        : { phone: OPERATOR.phone, hours: null };
    const items = faqItemsOf(faq).map((item) => ({ question: item.q, answer: item.a }));
    return <HelpView faqs={items.length > 0 ? items : null} faqPlaceholder={items.length > 0 && isPlaceholder(faq)} contact={help} initialLayout={layout} preview={preview || null} />;
}
