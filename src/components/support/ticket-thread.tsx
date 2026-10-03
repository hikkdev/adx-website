"use client";

import * as React from "react";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { messageOf } from "@/lib/api-client";
import { FLAG_LIVE_CHAT, useSwitchedOff } from "@/lib/flags";
import { cn } from "@/lib/utils";
import { btnPrimary, btnSmall, ErrorPanel, LoadingLine, StatusChip } from "@/components/advertiser/bits";
import type { Party } from "@/services/party";
import { helpHref } from "@/components/account/routes";
import { FeatureOff } from "@/components/platform/feature-off";
import { LiveChat } from "./live-chat";
import { PrivateFileLink } from "./private-file";
import { AttachmentPicker, type PickedAttachment } from "./attachment-picker";
import { categoryLabel, dateTime, isLiveChat, statusLabel, supportService, ticketReference, visibleMessages, type TicketThread } from "@/services/support";

/**
 * One support ticket's thread — the app's ticket chat: the request, the
 * conversation with ADX Support (never an internal note), a reply box with
 * an attachment while it is open, and resolve / reopen. A ticket that turns
 * out to be a live chat hands over to the chat, as the app does — unless live
 * chat is switched off, when it is read as a ticket like any other (the reply
 * route is not behind the switch) under the "switched off" line.
 */
export function TicketThreadView({ party, ticketId }: { party: Party; ticketId: string }) {
    const [ticket, setTicket] = React.useState<TicketThread | null>(null);
    const [loadError, setLoadError] = React.useState<string | null>(null);
    const [tick, setTick] = React.useState(0);
    const chatOff = useSwitchedOff(FLAG_LIVE_CHAT);

    React.useEffect(() => {
        let cancelled = false;
        supportService
            .ticket(ticketId)
            .then((next) => {
                if (!cancelled) {
                    setTicket(next);
                    setLoadError(null);
                }
            })
            .catch((caught: unknown) => {
                if (!cancelled) setLoadError(messageOf(caught, "Could not read this ticket."));
            });
        return () => {
            cancelled = true;
        };
    }, [ticketId, tick]);

    const back = (
        <Link href={helpHref(party)} className="inline-flex items-center gap-1 text-sm text-dim hover:text-ink">
            <ChevronLeft className="size-4" aria-hidden />
            Help &amp; support
        </Link>
    );

    if (!ticket) {
        return (
            <>
                {back}
                {loadError ? <ErrorPanel title="Could not read this ticket" message={loadError} /> : <div className="mt-6"><LoadingLine>Loading the ticket…</LoadingLine></div>}
            </>
        );
    }

    const liveChat = isLiveChat(ticket);
    if (liveChat && !chatOff) {
        return (
            <>
                {back}
                <div className="mt-4">
                    <LiveChat party={party} initialTicket={ticket} />
                </div>
            </>
        );
    }

    return (
        <>
            {back}
            {liveChat && chatOff && <FeatureOff flag={FLAG_LIVE_CHAT} className="mt-4 max-w-[860px]" />}
            <Thread key={ticket.updatedAt} ticket={ticket} reload={() => setTick((n) => n + 1)} />
        </>
    );
}

function Thread({ ticket, reload }: { ticket: TicketThread; reload: () => void }) {
    const [reply, setReply] = React.useState("");
    const [attachment, setAttachment] = React.useState<PickedAttachment | null>(null);
    const [busy, setBusy] = React.useState<null | "reply" | "status">(null);
    const [error, setError] = React.useState<string | null>(null);
    const status = statusLabel(ticket.status);
    const messages = visibleMessages(ticket.messages).filter((m, index) => !(index === 0 && m.authorId === ticket.userId && m.message.trim() === ticket.description.trim()));

    const send = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!reply.trim() && !attachment?.id) return;
        if (attachment?.busy) return setError("The file is still uploading.");
        setBusy("reply");
        setError(null);
        try {
            await supportService.reply(ticket.id, reply.trim(), attachment?.id ?? undefined);
            setReply("");
            setAttachment(null);
            reload();
        } catch (caught) {
            setError(messageOf(caught, "Could not send the reply."));
        } finally {
            setBusy(null);
        }
    };

    const setStatus = async (next: "OPEN" | "CLOSED") => {
        setBusy("status");
        setError(null);
        try {
            await supportService.setStatus(ticket.id, next);
            reload();
        } catch (caught) {
            setError(messageOf(caught, "Could not change the ticket."));
        } finally {
            setBusy(null);
        }
    };

    return (
        <>
            <div className="mt-4 flex flex-wrap items-center gap-3">
                <h1 className="text-2xl font-semibold tracking-tight text-ink">{ticket.title}</h1>
                <StatusChip label={status.label} tone={status.tone} />
            </div>
            <p className="mt-1 text-sm text-dim">
                {ticketReference(ticket)} · {categoryLabel(ticket.category)} · opened {dateTime(ticket.createdAt)}
            </p>
            <section className="mt-6 max-w-[860px] rounded-lg border border-line bg-white p-6">
                <ol className="flex flex-col gap-4">
                    <Bubble mine author="You" when={ticket.createdAt}>
                        <p className="whitespace-pre-line text-sm text-ink">{ticket.description}</p>
                        {ticket.attachmentUrls.map((url, index) => (
                            <PrivateFileLink key={url} url={url} name={`Attachment ${index + 1}`} className="mt-1 text-ink" onError={setError} />
                        ))}
                    </Bubble>
                    {messages.map((message) =>
                        message.kind === "SYSTEM" ? (
                            <li key={message.id} className="text-center text-xs text-dim">
                                {message.message}
                            </li>
                        ) : (
                            <Bubble key={message.id} mine={message.authorId === ticket.userId} author={message.authorId === ticket.userId ? "You" : message.authorName || "ADX Support"} when={message.createdAt}>
                                {message.message && <p className="whitespace-pre-line text-sm text-ink">{message.message}</p>}
                                {message.attachmentFileId && <PrivateFileLink fileId={message.attachmentFileId} name={message.attachmentName ?? "Attachment"} className="mt-1 text-ink" onError={setError} />}
                            </Bubble>
                        )
                    )}
                </ol>
                {ticket.status === "WAITING" && <p className="mt-5 rounded-md bg-warning-soft px-3 py-2 text-sm text-ink">ADX Support is waiting on you — reply to resume.</p>}
                {ticket.status !== "CLOSED" ? (
                    <form onSubmit={(event) => void send(event)} className="mt-6 border-t border-line pt-5">
                        <label htmlFor="ticket-reply" className="text-[11px] font-semibold uppercase tracking-wide text-dim">
                            Reply to ADX Support
                        </label>
                        <textarea id="ticket-reply" value={reply} onChange={(event) => setReply(event.target.value)} rows={3} maxLength={4000} placeholder="Add what support needs to know" className="mt-2 w-full rounded-md border border-line bg-white px-3 py-2.5 text-sm text-ink placeholder:text-dim focus:border-ink focus:outline-none" />
                        <AttachmentPicker className="mt-3" value={attachment} onChange={setAttachment} onError={setError} label="Attach a file" />
                        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                            <button type="button" onClick={() => void setStatus("CLOSED")} className={btnSmall} disabled={busy !== null}>
                                Mark as resolved
                            </button>
                            <button type="submit" className={btnPrimary} disabled={busy !== null || (!reply.trim() && !attachment?.id)}>
                                {busy === "reply" ? "Sending…" : "Send reply"}
                            </button>
                        </div>
                    </form>
                ) : (
                    <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-5">
                        <p className="text-sm text-dim">This ticket is resolved. Reopen it if something is still wrong.</p>
                        <button type="button" onClick={() => void setStatus("OPEN")} className={btnSmall} disabled={busy !== null}>
                            Reopen
                        </button>
                    </div>
                )}
                {error && (
                    <p role="alert" className="mt-3 text-sm text-danger">
                        {error}
                    </p>
                )}
            </section>
        </>
    );
}

function Bubble({ mine, author, when, children }: { mine: boolean; author: string; when: string; children: React.ReactNode }) {
    return (
        <li className={cn("max-w-[80%] rounded-lg px-4 py-3", mine ? "self-end bg-brand-soft" : "self-start bg-ground")}>
            <p className="text-xs text-dim">
                {author} · {dateTime(when)}
            </p>
            <div className="mt-1">{children}</div>
        </li>
    );
}
