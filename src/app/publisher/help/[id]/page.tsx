"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { toast } from "sonner";
import { Panel } from "@/components/workspace/page-heading";
import { brandButton, Chip, ErrorNote, Loading, textareaClass } from "@/components/publisher/parts";
import { useLoad } from "@/components/publisher/use-load";
import { messageOf } from "@/lib/api-client";
import { FLAG_LIVE_CHAT, useSwitchedOff } from "@/lib/flags";
import { cn } from "@/lib/utils";
import { dateTime, publisherWorkspace, ticketStatus } from "@/services/publisher-workspace";
import { FeatureOff } from "@/components/platform/feature-off";
import { LiveChat } from "@/components/support/live-chat";
import { PrivateFileLink } from "@/components/support/private-file";
import { isLiveChat, type TicketThread } from "@/services/support";

/**
 * One support request: the thread between the publisher and ADX Support
 * (`GET /support/tickets/:id`), and a reply box while it is open. A live
 * chat is handed to the chat — unless live chat is switched off, when it is
 * read as a request like any other (the reply route is not behind the switch).
 */
export default function TicketPage() {
    const { id } = useParams<{ id: string }>();
    const { data, error, loading, reload } = useLoad(`ticket:${id}`, () => publisherWorkspace.ticket(id));
    const [reply, setReply] = React.useState("");
    const [busy, setBusy] = React.useState(false);
    const chatOff = useSwitchedOff(FLAG_LIVE_CHAT);

    if (!data && loading) return <Loading label="Loading the request…" />;
    if (!data) return <ErrorNote message={error ?? "Could not read this request."} onRetry={reload} />;

    /* A ticket that turns out to be a live chat hands over to the chat, as the app does — while live chat is on. */
    const liveChat = isLiveChat(data as { channel?: "TICKET" | "LIVE_CHAT" });
    if (liveChat && !chatOff) {
        return (
            <>
                <Link href="/publisher/help" className="inline-flex items-center gap-1 text-sm text-dim hover:text-ink">
                    <ChevronLeft className="size-4" aria-hidden />
                    Help &amp; support
                </Link>
                <div className="mt-4 max-w-[860px]">
                    <LiveChat party="PUBLISHER" initialTicket={data as unknown as TicketThread} />
                </div>
            </>
        );
    }

    const status = ticketStatus(data.status);
    const messages = (data.messages ?? []).filter((m) => !m.internal);

    const send = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!reply.trim()) return;
        setBusy(true);
        try {
            await publisherWorkspace.reply(data.id, reply.trim());
            setReply("");
            toast.success("Reply sent");
            reload();
        } catch (caught) {
            toast.error(messageOf(caught, "Could not send the reply."));
        } finally {
            setBusy(false);
        }
    };

    return (
        <>
            <Link href="/publisher/help" className="inline-flex items-center gap-1 text-sm text-dim hover:text-ink">
                <ChevronLeft className="size-4" aria-hidden />
                Help &amp; support
            </Link>
            <div className="mt-4 flex flex-wrap items-center gap-3">
                <h1 className="text-2xl font-semibold tracking-tight text-ink">{data.title}</h1>
                <Chip tone={status.tone}>{status.label}</Chip>
            </div>
            <p className="mt-1 text-sm text-dim">
                {data.displayId ?? `#${data.id.slice(-4).toUpperCase()}`} · {data.category.toLowerCase().replace(/_/g, " ")} · opened {dateTime(data.createdAt)}
            </p>
            {liveChat && chatOff && <FeatureOff flag={FLAG_LIVE_CHAT} className="mt-6" />}

            <Panel className="mt-6">
                <div className="grid gap-4">
                    <Message mine author="You" when={data.createdAt} text={data.description} />
                    {data.attachmentUrls.length > 0 && (
                        <div className="flex flex-col items-end gap-1">
                            {data.attachmentUrls.map((url, index) => (
                                <PrivateFileLink key={url} url={url} name={`Attachment ${index + 1}`} className="text-xs text-dim" onError={(message) => toast.error(message)} />
                            ))}
                        </div>
                    )}
                    {messages.map((message) => (
                        <Message key={message.id} mine={message.authorId === data.userId} author={message.authorId === data.userId ? "You" : message.authorName || "ADX Support"} when={message.createdAt} text={message.kind === "ATTACHMENT" && !message.message ? `Attachment: ${message.attachmentName ?? "file"}` : message.message} system={message.kind === "SYSTEM"} />
                    ))}
                </div>
                {data.status === "CLOSED" ? (
                    <p className="mt-6 border-t border-line pt-4 text-sm text-dim">This request is resolved. Open a new request if something else comes up.</p>
                ) : (
                    <form onSubmit={send} className="mt-6 border-t border-line pt-4">
                        <label htmlFor="reply" className="text-xs text-dim">
                            Reply to ADX Support
                        </label>
                        <textarea id="reply" value={reply} onChange={(event) => setReply(event.target.value)} rows={3} maxLength={4000} className={`${textareaClass} mt-2`} placeholder="Add what support needs to know" />
                        <div className="mt-3">
                            <button type="submit" disabled={busy || !reply.trim()} className={brandButton}>
                                {busy ? "Sending…" : "Send reply"}
                            </button>
                        </div>
                    </form>
                )}
            </Panel>
        </>
    );
}

function Message({ mine, author, when, text, system }: { mine: boolean; author: string; when: string; text: string; system?: boolean }) {
    if (system) return <p className="text-center text-xs text-dim">{text}</p>;
    return (
        <div className={cn("max-w-[80%] rounded-lg px-4 py-3", mine ? "self-end bg-brand-soft" : "self-start bg-ground")}>
            <p className="text-xs text-dim">
                {author} · {dateTime(when)}
            </p>
            <p className="mt-1 whitespace-pre-wrap text-sm text-ink">{text}</p>
        </div>
    );
}
