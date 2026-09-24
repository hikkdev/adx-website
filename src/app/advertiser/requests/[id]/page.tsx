"use client";

import * as React from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { messageOf } from "@/lib/api-client";
import { PageHeading } from "@/components/workspace/page-heading";
import { useAdvertiser } from "@/app/advertiser/layout";
import { btnOutline, btnPrimary, btnSmall, DocRow, ErrorPanel, LoadingLine, StatusChip, useAsync } from "@/components/advertiser/bits";
import {
    advertiserWorkspace,
    dateRange,
    dateTime,
    invoiceFileName,
    rupees,
    saveBlob,
    shortDate,
    ticketCampaignId,
    ticketReference,
    ticketStatusLabel,
    ticketTopic,
    type CampaignDetail,
    type Invoice,
    type TicketMessage,
    type TicketThread,
} from "@/services/advertiser-workspace";

/**
 * DR 12 · 07 · 12 · Cancellation request received (5204:74921), and every
 * other request's own page: the request, the campaign it is about, what
 * happens next, the documents, and the conversation with ADX Support.
 * `GET /support/tickets/:id`, `POST …/reply`, `PATCH …/status`.
 */
export default function RequestPage() {
    return (
        <React.Suspense fallback={<LoadingLine>Loading the request…</LoadingLine>}>
            <Request />
        </React.Suspense>
    );
}

function Request() {
    const params = useParams<{ id: string }>();
    const ticketId = params.id;
    const search = useSearchParams();
    const justSent = search.get("sent") === "1";
    const advertiser = useAdvertiser();
    const advertiserId = advertiser?.id ?? null;

    const state = useAsync(
        `request:${ticketId}:${advertiserId ?? ""}`,
        async () => {
            const ticket = await advertiserWorkspace.ticket(ticketId);
            const campaignId = ticketCampaignId(ticket);
            const [campaign, invoices] = await Promise.all([
                campaignId ? advertiserWorkspace.campaign(campaignId).catch(() => null as CampaignDetail | null) : Promise.resolve(null),
                advertiserId && campaignId ? advertiserWorkspace.invoices(advertiserId).catch(() => [] as Invoice[]) : Promise.resolve([] as Invoice[]),
            ]);
            return { ticket, campaign, invoices: campaignId ? invoices.filter((i) => i.campaignId === campaignId) : [] };
        },
        "Could not read this request."
    );

    if (state.kind === "loading") return <LoadingLine>Loading the request…</LoadingLine>;
    if (state.kind === "error") {
        return (
            <>
                <PageHeading title="Request" />
                <ErrorPanel title="Could not read this request" message={state.message} />
            </>
        );
    }
    return <RequestView key={state.value.ticket.updatedAt} ticket={state.value.ticket} campaign={state.value.campaign} invoices={state.value.invoices} justSent={justSent} advertiserName={advertiser?.name ?? ""} advertiserId={advertiserId} reload={state.reload} />;
}

function RequestView({ ticket, campaign, invoices, justSent, advertiserName, advertiserId, reload }: { ticket: TicketThread; campaign: CampaignDetail | null; invoices: Invoice[]; justSent: boolean; advertiserName: string; advertiserId: string | null; reload: () => void }) {
    const topic = ticketTopic(ticket);
    const status = ticketStatusLabel(ticket.status);
    const cancellation = topic?.id === "CANCELLATION";
    const title = justSent ? (cancellation ? "Cancellation request sent" : "Request sent") : ticket.title;
    const chip = ticket.status === "OPEN" ? { label: justSent || !ticket.messages.some((m) => m.authorId !== ticket.userId) ? "Awaiting ADX review" : "Open", tone: "warning" as const } : status;
    const conversation = ticket.messages.filter((m) => !(m.authorId === ticket.userId && m.message.trim() === ticket.description.trim() && m.id === ticket.messages[0]?.id));
    const [reply, setReply] = React.useState("");
    const [busy, setBusy] = React.useState<null | "reply" | "status">(null);
    const [failure, setFailure] = React.useState<string | null>(null);

    const sendReply = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!reply.trim()) return;
        setBusy("reply");
        setFailure(null);
        try {
            await advertiserWorkspace.reply(ticket.id, reply.trim());
            setReply("");
            reload();
        } catch (caught) {
            setFailure(messageOf(caught, "Could not send the reply."));
        } finally {
            setBusy(null);
        }
    };

    const setStatus = async (next: "OPEN" | "CLOSED") => {
        setBusy("status");
        setFailure(null);
        try {
            await advertiserWorkspace.setTicketStatus(ticket.id, next);
            reload();
        } catch (caught) {
            setFailure(messageOf(caught, "Could not change the request."));
        } finally {
            setBusy(null);
        }
    };

    const downloadInvoice = async (invoice: Invoice) => {
        if (!advertiserId) return;
        try {
            saveBlob(await advertiserWorkspace.invoicePdf(advertiserId, invoice.id), invoiceFileName(invoice.number));
        } catch (caught) {
            setFailure(messageOf(caught, "The PDF is not ready yet."));
        }
    };

    const requestLabel = topic ? topic.label.replace(/ request$/i, "") : ticket.category.charAt(0) + ticket.category.slice(1).toLowerCase().replace(/_/g, " ");

    return (
        <>
            <PageHeading title={title} />
            <section className="mt-6 rounded-lg border border-line bg-white p-6">
                <div className="flex flex-wrap items-center gap-3">
                    <h2 className="text-base font-semibold text-ink">
                        {requestLabel} · {ticketReference(ticket)}
                    </h2>
                    <StatusChip label={chip.label} tone={chip.tone} />
                </div>
                <p className="mt-1 text-sm text-dim">
                    {campaign
                        ? [campaign.reference, advertiserName || campaign.brandName, campaign.city ?? campaign.targetLocation, dateRange(campaign.startDate, campaign.endDate, "long")].filter(Boolean).join(" · ")
                        : `Raised ${shortDate(ticket.createdAt)}`}
                </p>

                {campaign && campaign.paidAt && campaign.total && (
                    <div className="mt-5 flex items-center justify-between rounded-md bg-ground px-3 py-3">
                        <span className="text-[11px] font-semibold uppercase tracking-wide text-dim">Amount paid</span>
                        <span className="text-sm font-semibold text-ink">{rupees(campaign.total)}</span>
                    </div>
                )}

                <Block label="What happens next">
                    <p className="text-xs font-semibold text-ink">ADX Support has received your request</p>
                    <p className="mt-1.5 text-sm text-ink">{topic?.next ?? "ADX Support will reply here."}</p>
                </Block>

                {cancellation && campaign && (
                    <Block label="Cancellation scope">
                        <p className="text-sm font-semibold text-ink">{campaign.spots.length === 1 ? "The placement in this campaign" : "Selected placements in this campaign"}</p>
                        <p className="mt-1.5 text-sm text-dim">Your selected placements and any booked printing and installation services are included in the review.</p>
                    </Block>
                )}

                <Block label="Your request">
                    <p className="whitespace-pre-line text-sm text-dim">{ticket.description}</p>
                </Block>

                {(invoices.length > 0 || campaign) && (
                    <Block label="Related documents">
                        <div className="space-y-3">
                            {invoices.map((invoice) => (
                                <DocRow key={invoice.id} title={invoiceFileName(invoice.number)} line={`${invoice.status === "PAID" || invoice.paymentId ? "Payment received" : "Issued"} · ${shortDate(invoice.issuedAt ?? invoice.createdAt)}`} onClick={() => void downloadInvoice(invoice)} />
                            ))}
                            {campaign && <DocRow title={`${campaign.name} · brief`} line={`Campaign brief · ${shortDate(campaign.createdAt)}`} href={`/advertiser/campaigns/${campaign.id}`} />}
                        </div>
                    </Block>
                )}

                {conversation.length > 0 && (
                    <Block label="Conversation">
                        <ol className="space-y-4">
                            {conversation.map((message) => (
                                <Message key={message.id} message={message} mine={message.authorId === ticket.userId} />
                            ))}
                        </ol>
                    </Block>
                )}

                {ticket.status !== "CLOSED" ? (
                    <form onSubmit={(event) => void sendReply(event)} className="mt-6 border-t border-line pt-5">
                        <label htmlFor="reply" className="text-[11px] font-semibold uppercase tracking-wide text-dim">
                            Reply to ADX Support
                        </label>
                        <textarea id="reply" value={reply} onChange={(e) => setReply(e.target.value)} rows={3} maxLength={4000} placeholder="Add anything the team should know…" className="mt-2 w-full rounded-md border border-line px-3 py-2.5 text-sm text-ink placeholder:text-dim focus:border-ink focus:outline-none" />
                        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                            <button type="button" onClick={() => void setStatus("CLOSED")} className={btnSmall} disabled={busy !== null}>
                                Mark as resolved
                            </button>
                            <button type="submit" className={btnPrimary} disabled={busy !== null || !reply.trim()}>
                                {busy === "reply" ? "Sending…" : "Send reply"}
                            </button>
                        </div>
                    </form>
                ) : (
                    <div className="mt-6 flex items-center justify-between gap-3 border-t border-line pt-5">
                        <p className="text-sm text-dim">This request is resolved. Reopen it if something is still wrong.</p>
                        <button type="button" onClick={() => void setStatus("OPEN")} className={btnSmall} disabled={busy !== null}>
                            Reopen request
                        </button>
                    </div>
                )}
                {failure && <p className="mt-3 text-sm text-danger">{failure}</p>}

                <div className="mt-6 flex flex-wrap justify-end gap-2">
                    {campaign && (
                        <Link href={`/advertiser/campaigns/${campaign.id}`} className={btnOutline}>
                            View campaign
                        </Link>
                    )}
                    <Link href="/advertiser/requests" className={btnPrimary}>
                        View my requests
                    </Link>
                </div>
            </section>
        </>
    );
}

function Block({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div className="mt-5">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-dim">{label}</p>
            <div className="mt-2">{children}</div>
        </div>
    );
}

function Message({ message, mine }: { message: TicketMessage; mine: boolean }) {
    if (message.kind === "SYSTEM") return <li className="text-center text-xs text-dim">{message.message}</li>;
    return (
        <li className={`max-w-[80%] rounded-lg px-4 py-3 ${mine ? "ml-auto bg-brand-soft" : "bg-ground"}`}>
            <p className="text-xs font-semibold text-ink">
                {mine ? "You" : message.authorName || "ADX Support"} <span className="font-normal text-dim">· {dateTime(message.createdAt)}</span>
            </p>
            {message.message && <p className="mt-1 whitespace-pre-line text-sm text-ink">{message.message}</p>}
            {message.attachmentName && <p className="mt-1 text-xs text-dim">Attachment: {message.attachmentName}</p>}
        </li>
    );
}
