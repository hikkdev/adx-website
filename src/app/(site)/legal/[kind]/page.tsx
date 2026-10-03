import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { Markdown } from "@/components/platform/markdown";
import { FaqAccordion } from "@/components/site/faq-accordion";
import { listDocSlugs } from "@/lib/site-docs";
import { AGREEMENT_LABEL, cleanTitle, contactOf, effectiveLine, faqItemsOf, isPlaceholder, legalServer, PRESSED_SLUG, resolveLegalRoute, telHref, withoutLeadingTitle, type LegalDocument } from "@/services/legal";
import { AgreementReader } from "./agreement-reader";

/** Read again at most every five minutes: a policy published in the console reaches the page without a deploy. */
export const revalidate = 300;

export async function generateMetadata({ params }: { params: Promise<{ kind: string }> }): Promise<Metadata> {
    const route = resolveLegalRoute((await params).kind);
    if (!route) return {};
    if (route.source === "agreement") return { title: AGREEMENT_LABEL[route.kind].label };
    const document = await legalServer.document(route.kind);
    return document ? { title: cleanTitle(document.title) || document.label, description: document.summary ?? document.blurb } : { title: "Policy" };
}

/**
 * One published document at `/legal/<KIND>` (the app's
 * `legal-document-screen.tsx`): the live text from `GET /legal/:kind`,
 * rendered from its Markdown with the site's escaping renderer, when it took
 * effect and in which version; Contact info and the FAQs draw their
 * structured parts too. The platform agreements are read at the same kind
 * of address — `ADVERTISER_PLATFORM`, `PLATFORM`… — from the agreement
 * templates, which need a session. Any other spelling of a kind redirects
 * to the canonical one.
 */
export default async function LegalDocumentPage({ params }: { params: Promise<{ kind: string }> }) {
    const raw = (await params).kind;
    const route = resolveLegalRoute(raw);
    if (!route) notFound();
    if (decodeURIComponent(raw) !== route.kind) permanentRedirect(`/legal/${route.kind}`);

    if (route.source === "agreement") {
        return (
            <Frame>
                <AgreementReader kind={route.kind} label={AGREEMENT_LABEL[route.kind].label} />
            </Frame>
        );
    }

    const [document, slugs] = await Promise.all([legalServer.document(route.kind), Promise.resolve(new Set(listDocSlugs()))]);
    const slug = PRESSED_SLUG[route.kind];
    const pressed = slug && slugs.has(slug) ? `/${slug}` : null;

    if (!document) {
        return (
            <Frame>
                <h1 className="text-[34px] font-bold leading-tight tracking-tight text-ink">This document is not available</h1>
                <p className="mt-3 text-[16px] text-dim">
                    ADX did not answer just now, or nothing has been published under this name yet. Try again in a few minutes
                    {pressed ? (
                        <>
                            , or read the copy on the site at{" "}
                            <Link href={pressed} className="font-medium text-brand underline underline-offset-2">
                                {pressed}
                            </Link>
                        </>
                    ) : null}
                    .
                </p>
            </Frame>
        );
    }

    const placeholder = isPlaceholder(document);
    const meta = effectiveLine(document.effectiveFrom, document.version);

    return (
        <Frame>
            <article className="site-doc">
                <h1>{cleanTitle(document.title) || document.label}</h1>
                {meta && <p className="meta">{meta}.</p>}
                {placeholder && (
                    <div className="box">
                        <p className="!m-0 text-[15px]">
                            ADX Legal has not published the final text of this document yet; what follows is a placeholder.
                            {pressed && (
                                <>
                                    {" "}
                                    The version in force is at <Link href={pressed}>{pressed}</Link>.
                                </>
                            )}
                        </p>
                    </div>
                )}
            </article>
            <Markdown source={withoutLeadingTitle(document.body, document.title)} />
            {document.kind === "CONTACT_INFO" && <ContactBlock document={document} />}
            {document.kind === "FAQ" && <FaqBlock document={document} />}
            {pressed && !placeholder && (
                <p className="mt-10 text-sm text-dim">
                    Also published at{" "}
                    <Link href={pressed} className="font-medium text-ink underline underline-offset-2">
                        {pressed}
                    </Link>
                    .
                </p>
            )}
        </Frame>
    );
}

function Frame({ children }: { children: React.ReactNode }) {
    return (
        <div className="mx-auto max-w-[880px] px-6 pb-20 pt-10 lg:px-0">
            <nav aria-label="Breadcrumb" className="mb-6 text-sm text-dim">
                <Link href="/legal" className="hover:text-ink">
                    Policies and agreements
                </Link>
            </nav>
            {children}
        </div>
    );
}

function ContactBlock({ document }: { document: LegalDocument }) {
    const contact = contactOf(document);
    const rows: { label: string; value: React.ReactNode }[] = [];
    if (contact.office) rows.push({ label: "Office", value: `${contact.office.name}, ${contact.office.address}` });
    if (contact.supportLine?.phone)
        rows.push({
            label: "Support line",
            value: (
                <>
                    <a href={telHref(contact.supportLine.phone)}>{contact.supportLine.phone}</a>
                    {[contact.supportLine.days, contact.supportLine.hours].filter(Boolean).length > 0 && ` · ${[contact.supportLine.days, contact.supportLine.hours].filter(Boolean).join(", ")}`}
                </>
            ),
        });
    if (contact.safetyLine?.phone)
        rows.push({
            label: "Safety line",
            value: (
                <>
                    <a href={telHref(contact.safetyLine.phone)}>{contact.safetyLine.phone}</a>
                    {contact.safetyLine.hours ? ` · ${contact.safetyLine.hours}` : ""}
                </>
            ),
        });
    for (const [key, label] of [
        ["support", "Support email"],
        ["legal", "Legal"],
        ["privacy", "Privacy"],
        ["partners", "Partners"],
    ] as const) {
        const address = contact.email?.[key];
        if (address) rows.push({ label, value: <a href={`mailto:${address}`}>{address}</a> });
    }
    if (contact.registration) {
        const reg = contact.registration;
        const line = [reg.cin && `CIN ${reg.cin}`, reg.gstin && `GSTIN ${reg.gstin}`, reg.pan && `PAN ${reg.pan}`].filter(Boolean).join(" · ");
        if (line) rows.push({ label: "Registration", value: line });
    }
    if (rows.length === 0) return null;
    return (
        <div className="site-doc">
            <table>
                <tbody>
                    {rows.map((row) => (
                        <tr key={row.label}>
                            <th scope="row" className="w-[180px]">
                                {row.label}
                            </th>
                            <td>{row.value}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
            {contact.email?.replyNote && <p className="text-dim">{contact.email.replyNote}.</p>}
        </div>
    );
}

function FaqBlock({ document }: { document: LegalDocument }) {
    const items = faqItemsOf(document);
    if (items.length === 0) return null;
    return <FaqAccordion items={items.map((item) => ({ question: item.q, answer: item.a }))} defaultOpen={[]} size="sm" className="mt-8" />;
}
