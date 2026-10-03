"use client";

import * as React from "react";
import Link from "next/link";
import { Check, CheckCheck, Paperclip, Send } from "lucide-react";
import { isFeatureOff, messageOf } from "@/lib/api-client";
import { FLAG_LIVE_CHAT, FLAG_PUBLISHER_PLANS, useSwitchedOff } from "@/lib/flags";
import { cn } from "@/lib/utils";
import { btnOutline, btnPrimary } from "@/components/advertiser/bits";
import type { Party } from "@/services/party";
import { reportHref } from "@/components/account/routes";
import { PrivateFileImage, PrivateFileLink } from "./private-file";
import {
    attachmentProblem,
    chatMessageOf,
    chatMessageOfEvent,
    dayBadge,
    ENDED_NOTE,
    fallbackLine,
    isImageAttachment,
    lastEventId,
    LINK_LINE,
    liveEnded,
    notEntitled,
    openStream,
    presenceLine,
    reconnectDelay,
    seenTick,
    shortTime,
    showsUpsell,
    STREAM_UNAUTHORISED_LIMIT,
    supportService,
    systemLine,
    ticketReference,
    TYPING_CLEAR_DEBOUNCE_MS,
    TYPING_IDLE_MS,
    TYPING_THROTTLE_MS,
    upsellHref,
    upsellLine,
    withMessage,
    type ChatMessage,
    type LiveStatus,
    type StreamEvent,
    type TicketThread,
} from "@/services/support";

/**
 * Live chat on the web — Lot I, the same ticket wearing `LIVE_CHAT`, as the
 * app's live chat screen draws it: a presence line ("Typically replies in
 * under 2 minutes" / "Offline until 9:00 am"), the thread streaming over
 * `GET /support/tickets/:id/events`, one tick for sent and two once the
 * desk has read it, the desk's typing line, attachments (an image drawn in
 * place, a PDF saved), and the two endings — ops turning the chat into a
 * ticket, or the desk closing it. The stream is closed while the tab is in
 * the background and reopened, after a catch-up read, when it comes back.
 *
 * With no chat open, the first message opens one (`POST /support/live/start`);
 * when the door is shut the message still lands, as a ticket, and the page
 * prints the next opening. Live chat is for paid plans: somebody without one
 * is told where it lives, and the request form is always the fallback.
 */
export function LiveChat({ party, ticketId: openOn, initialTicket }: { party: Party; ticketId?: string | null; initialTicket?: TicketThread | null }) {
    const [ticketId, setTicketId] = React.useState<string | null>(openOn ?? initialTicket?.id ?? null);
    const [ticket, setTicket] = React.useState<TicketThread | null>(initialTicket ?? null);
    const plansOff = useSwitchedOff(FLAG_PUBLISHER_PLANS);
    const [messages, setMessages] = React.useState<ChatMessage[]>(() => (initialTicket ? initialTicket.messages.filter((m) => !m.internal).map((m) => chatMessageOf(m, initialTicket)) : []));
    const [status, setStatus] = React.useState<LiveStatus | null>(null);
    const [statusRead, setStatusRead] = React.useState(false);
    const [agentSeenAt, setAgentSeenAt] = React.useState<string | null>(initialTicket?.agentSeenAt ?? null);
    const [agentTyping, setAgentTyping] = React.useState(false);
    const [draft, setDraft] = React.useState("");
    const [sending, setSending] = React.useState(false);
    const [attaching, setAttaching] = React.useState(false);
    const [loading, setLoading] = React.useState(Boolean(openOn) && !initialTicket);
    const [error, setError] = React.useState<string | null>(null);
    const [fallback, setFallback] = React.useState<string | null>(null);
    const [refused, setRefused] = React.useState(false);
    const [active, setActive] = React.useState(true);
    const [link, setLink] = React.useState<"live" | "reconnecting" | "failed">("live");
    const [attempt, setAttempt] = React.useState(0);

    const since = React.useRef<string | null>(lastEventId(initialTicket ?? null));
    const lastTypingAt = React.useRef(0);
    const seenUpTo = React.useRef<string | null>(null);
    const typingIdle = React.useRef<number | null>(null);
    const typingClear = React.useRef<number | null>(null);
    const failures = React.useRef(0);
    const unauthorised = React.useRef(0);
    const gaveUp = React.useRef(false);
    const bottom = React.useRef<HTMLDivElement>(null);
    const fileRef = React.useRef<HTMLInputElement>(null);

    const ended = liveEnded(ticket);

    /** Folds a fresh read of the thread into what the page holds. */
    const adopt = React.useCallback((thread: TicketThread) => {
        setTicket(thread);
        setAgentSeenAt(thread.agentSeenAt ?? null);
        setMessages((current) => thread.messages.filter((m) => !m.internal).reduce((all, message) => withMessage(all, chatMessageOf(message, thread)), current));
        since.current = lastEventId(thread) ?? since.current;
        setError(null);
        setLoading(false);
    }, []);

    const load = React.useCallback(
        async (id: string): Promise<TicketThread | null> => {
            try {
                const thread = await supportService.ticket(id);
                adopt(thread);
                return thread;
            } catch (caught) {
                setError(messageOf(caught, "Could not reach ADX."));
                setLoading(false);
                return null;
            }
        },
        [adopt]
    );

    /* The status read draws the header; it answers FEATURE_OFF rather than failing when the switch is off. */
    React.useEffect(() => {
        let alive = true;
        supportService
            .liveStatus()
            .then((next) => alive && setStatus(next))
            .catch(() => alive && setStatus(null))
            .finally(() => alive && setStatusRead(true));
        return () => {
            alive = false;
        };
    }, []);

    /* Only on the id the page opened with; every later read is explicit. */
    React.useEffect(() => {
        if (!openOn || initialTicket) return;
        let cancelled = false;
        supportService
            .ticket(openOn)
            .then((thread) => {
                if (!cancelled) adopt(thread);
            })
            .catch((caught: unknown) => {
                if (cancelled) return;
                setError(messageOf(caught, "Could not reach ADX."));
                setLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [openOn, initialTicket, adopt]);

    /* The tab in the background closes the stream; coming back re-reads the thread first. */
    React.useEffect(() => {
        const onVisible = () => {
            const now = document.visibilityState === "visible";
            setActive(now);
            if (now) {
                failures.current = 0;
                unauthorised.current = 0;
                gaveUp.current = false;
                setLink("live");
                if (ticketId) void load(ticketId);
            }
        };
        document.addEventListener("visibilitychange", onVisible);
        return () => document.removeEventListener("visibilitychange", onVisible);
    }, [load, ticketId]);

    const apply = React.useCallback((event: StreamEvent) => {
        switch (event.type) {
            case "message":
                if (event.internal) return;
                setMessages((current) => withMessage(current, chatMessageOfEvent(event)));
                since.current = String(new Date(event.createdAt).getTime());
                if (!event.mine && event.kind !== "SYSTEM") setAgentTyping(false);
                break;
            case "typing":
                if (event.who !== "agent") return;
                setAgentTyping(event.typing);
                if (typingIdle.current) window.clearTimeout(typingIdle.current);
                if (event.typing) typingIdle.current = window.setTimeout(() => setAgentTyping(false), TYPING_IDLE_MS);
                break;
            case "seen":
                if (event.who === "agent") setAgentSeenAt(event.at);
                break;
            case "status":
                setTicket((current) => (current ? { ...current, status: event.status as TicketThread["status"], channel: event.channel as TicketThread["channel"] } : current));
                break;
            case "assigned":
                setTicket((current) => (current ? { ...current, assignedAdmin: event.adminUserId ? { id: event.adminUserId, name: event.name } : null } : current));
                break;
        }
    }, []);

    /* The stream: opened with the bearer, reopened with backoff; two 401s in a row stop it until a refresh. */
    React.useEffect(() => {
        if (!ticketId || !active || ended || gaveUp.current) return;
        const controller = new AbortController();
        let retry: number | null = null;
        void (async () => {
            const outcome = await openStream(
                supportService.streamUrl(ticketId, since.current),
                since.current,
                {
                    onOpen: () => {
                        failures.current = 0;
                        unauthorised.current = 0;
                        setLink("live");
                    },
                    onEvent: apply,
                },
                controller.signal
            );
            if (controller.signal.aborted || outcome.kind === "closed") return;
            unauthorised.current = outcome.status === 401 ? unauthorised.current + 1 : 0;
            failures.current += 1;
            if (unauthorised.current >= STREAM_UNAUTHORISED_LIMIT) {
                gaveUp.current = true;
                setLink("failed");
                return;
            }
            setLink("reconnecting");
            /* A 401 may only be a stale bearer: any ordinary read refreshes the session before the next open. */
            if (outcome.status === 401) await supportService.liveStatus().catch(() => undefined);
            retry = window.setTimeout(() => setAttempt((n) => n + 1), reconnectDelay(failures.current));
        })();
        return () => {
            controller.abort();
            if (retry) window.clearTimeout(retry);
        };
    }, [ticketId, active, ended, apply, attempt]);

    /* Seen: once for what was unread on the way in, and each time the desk says something new. */
    React.useEffect(() => {
        if (!ticketId || !active) return;
        const theirs = [...messages].reverse().find((message) => !message.mine && message.kind !== "SYSTEM");
        if (!theirs || seenUpTo.current === theirs.id) return;
        seenUpTo.current = theirs.id;
        void supportService.seen(ticketId).catch(() => undefined);
    }, [ticketId, active, messages]);

    React.useEffect(() => {
        bottom.current?.scrollIntoView({ block: "nearest" });
    }, [messages.length, agentTyping]);

    React.useEffect(
        () => () => {
            if (typingIdle.current) window.clearTimeout(typingIdle.current);
            if (typingClear.current) window.clearTimeout(typingClear.current);
        },
        []
    );

    const signalTyping = React.useCallback(
        (typing: boolean) => {
            if (!ticketId || ended) return;
            const now = Date.now();
            if (typing) {
                if (now - lastTypingAt.current < TYPING_THROTTLE_MS) return;
                lastTypingAt.current = now;
            } else {
                lastTypingAt.current = 0;
            }
            void supportService.typing(ticketId, typing).catch(() => undefined);
        },
        [ticketId, ended]
    );

    const onDraft = (next: string) => {
        setDraft(next);
        if (next.trim()) {
            if (typingClear.current) window.clearTimeout(typingClear.current);
            typingClear.current = null;
            signalTyping(true);
            return;
        }
        if (lastTypingAt.current === 0 || typingClear.current) return;
        typingClear.current = window.setTimeout(() => {
            typingClear.current = null;
            signalTyping(false);
        }, TYPING_CLEAR_DEBOUNCE_MS);
    };

    const onBlur = () => {
        if (typingClear.current) window.clearTimeout(typingClear.current);
        typingClear.current = null;
        if (lastTypingAt.current > 0) signalTyping(false);
    };

    /** With no chat open the message opens one; with one open it is a reply on the same thread. */
    const post = async (message: string, attachmentFileId?: string) => {
        if (ticketId) {
            const written = await supportService.reply(ticketId, message, attachmentFileId);
            const owner = ticket ?? (await load(ticketId));
            if (owner) setMessages((current) => withMessage(current, chatMessageOf(written, owner)));
            signalTyping(false);
            return;
        }
        const started = await supportService.liveStart({ message, ...(attachmentFileId ? { attachmentFileId } : {}) });
        setTicketId(started.ticketId);
        setFallback(started.fallback ? fallbackLine(started.nextOpening) : null);
        await load(started.ticketId);
    };

    const send = async (event?: React.FormEvent) => {
        event?.preventDefault();
        const message = draft.trim();
        if (!message || sending) return;
        setSending(true);
        setError(null);
        try {
            await post(message);
            setDraft("");
        } catch (caught) {
            /* Switched off mid-session: the 503 reaches the flags, and the gate around the chat takes it down — no raw error here. */
            if (isFeatureOff(caught, FLAG_LIVE_CHAT)) return;
            if (notEntitled(caught)) setRefused(true);
            else setError(messageOf(caught, "Could not send that."));
        } finally {
            setSending(false);
        }
    };

    const attach = async (file: File | undefined) => {
        if (!file || attaching || sending) return;
        const tooBig = attachmentProblem(file);
        if (tooBig) return setError(tooBig);
        setAttaching(true);
        setError(null);
        try {
            const stored = await supportService.upload(file);
            await post(draft.trim(), stored.id);
            setDraft("");
        } catch (caught) {
            if (isFeatureOff(caught, FLAG_LIVE_CHAT)) return;
            if (notEntitled(caught)) setRefused(true);
            else setError(messageOf(caught, "Could not attach that."));
        } finally {
            setAttaching(false);
            if (fileRef.current) fileRef.current.value = "";
        }
    };

    const startNew = () => {
        setTicketId(null);
        setTicket(null);
        setMessages([]);
        setFallback(null);
        setAgentSeenAt(null);
        since.current = null;
        seenUpTo.current = null;
        failures.current = 0;
        unauthorised.current = 0;
        gaveUp.current = false;
        setLink("live");
    };

    /* Not a subscriber, and no chat already open to continue: the request form is the door. */
    const locked = !ticketId && ((statusRead && status !== null && !status.entitled) || refused);
    if (locked) {
        // A publisher's plans are behind `revenue.publisher-plans`: switched off, there is nowhere to send them.
        const upsell = status && showsUpsell(status) && !(party === "PUBLISHER" && plansOff) ? upsellHref(party) : null;
        return (
            <section className="rounded-lg border border-line bg-white p-6">
                <p className="text-base font-semibold text-ink">{status && showsUpsell(status) ? upsellLine(status) : "Live chat is not available on your account"}</p>
                <p className="mt-2 text-sm text-dim">
                    {status?.reason === "FEATURE_OFF" ? "ADX has switched live chat off for now." : "Live chat comes with a paid ADX plan."} Send a request instead — ADX Support replies on its thread, usually within a working day.
                </p>
                <div className="mt-5 flex flex-wrap gap-2">
                    <Link href={reportHref(party)} className={btnPrimary}>
                        Send a request
                    </Link>
                    {upsell && (
                        <Link href={upsell} className={btnOutline}>
                            See plans
                        </Link>
                    )}
                </div>
            </section>
        );
    }

    const online = !ended && status?.online === true;
    const days = messages.map((message) => dayBadge(message.createdAt));

    return (
        <section className="flex h-[min(720px,calc(100vh-220px))] min-h-[480px] flex-col rounded-lg border border-line bg-white">
            <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3.5">
                <div className="min-w-0">
                    <p className="text-sm font-semibold text-ink">
                        {ticket ? `Live chat · ${ticketReference(ticket)}` : "Live chat with ADX Support"}
                        {ticket?.assignedAdmin?.name ? <span className="font-normal text-dim"> · {ticket.assignedAdmin.name}</span> : null}
                    </p>
                    <p className="mt-0.5 flex items-center gap-1.5 text-xs text-dim">
                        <span className={cn("size-2 rounded-full", online ? "bg-success" : "bg-line")} aria-hidden />
                        {presenceLine(status, ended)}
                        {link !== "live" && !ended && <span className={link === "failed" ? "text-danger" : "text-warning"}> · {LINK_LINE[link]}</span>}
                    </p>
                </div>
                {link === "failed" && ticketId && (
                    <button
                        type="button"
                        onClick={() => {
                            failures.current = 0;
                            unauthorised.current = 0;
                            gaveUp.current = false;
                            setLink("live");
                            void load(ticketId).then(() => setAttempt((n) => n + 1));
                        }}
                        className="text-sm font-medium text-ink underline underline-offset-4"
                    >
                        Retry
                    </button>
                )}
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4" aria-live="polite">
                {loading && <p className="text-sm text-dim">Loading the conversation…</p>}
                {!loading && messages.length === 0 && (
                    <div className="mx-auto max-w-sm py-10 text-center">
                        <p className="text-sm font-semibold text-ink">How can we help?</p>
                        <p className="mt-1 text-sm text-dim">Write your question below. If nobody is at the desk, your message becomes a ticket and ADX replies there.</p>
                    </div>
                )}
                {fallback && <p className="mb-3 rounded-md bg-warning-soft px-3 py-2 text-sm text-ink">{fallback}</p>}
                <ol className="space-y-3">
                    {messages.map((message, index) => {
                        const day = days[index]!;
                        const showDay = index === 0 || day !== days[index - 1];
                        const tick = seenTick(message, agentSeenAt);
                        return (
                            <React.Fragment key={message.id}>
                                {showDay && (
                                    <li className="flex justify-center">
                                        <span className="rounded-full bg-ground px-3 py-0.5 text-[11px] font-medium text-dim">{day}</span>
                                    </li>
                                )}
                                {message.kind === "SYSTEM" ? (
                                    <li className="text-center text-xs text-dim">{systemLine(message.message)}</li>
                                ) : (
                                    <li className={cn("flex flex-col", message.mine ? "items-end" : "items-start")}>
                                        {!message.mine && <p className="mb-0.5 text-xs font-medium text-dim">{message.authorName || "ADX Support"}</p>}
                                        <div className={cn("max-w-[78%] rounded-lg px-3.5 py-2.5", message.mine ? "bg-brand-soft" : "bg-ground")}>
                                            {message.attachment &&
                                                (isImageAttachment(message.attachment.name) ? (
                                                    <PrivateFileImage fileId={message.attachment.fileId} alt={message.attachment.name} className="mb-1 max-h-[220px] w-auto max-w-full rounded-md object-contain" />
                                                ) : (
                                                    <PrivateFileLink fileId={message.attachment.fileId} name={message.attachment.name} className="mb-1 text-ink" onError={setError} />
                                                ))}
                                            {message.message && <p className="whitespace-pre-line text-sm text-ink">{message.message}</p>}
                                        </div>
                                        <p className="mt-0.5 flex items-center gap-1 text-[11px] text-dim">
                                            {shortTime(message.createdAt)}
                                            {tick === "seen" && <CheckCheck className="size-3.5 text-brand-bright" aria-label="Read" />}
                                            {tick === "sent" && <Check className="size-3.5" aria-label="Sent" />}
                                        </p>
                                    </li>
                                )}
                            </React.Fragment>
                        );
                    })}
                </ol>
                {agentTyping && !ended && <p className="mt-3 text-xs text-dim">ADX Support is typing…</p>}
                <div ref={bottom} />
            </div>

            {ended && (
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line bg-ground px-5 py-3">
                    <p className="text-sm text-ink">{ENDED_NOTE[ended]}</p>
                    <button type="button" onClick={startNew} className={btnOutline}>
                        Start a new chat
                    </button>
                </div>
            )}

            <form onSubmit={(event) => void send(event)} className="flex items-end gap-2 border-t border-line px-4 py-3">
                <button type="button" onClick={() => fileRef.current?.click()} disabled={attaching || sending} aria-label="Attach an image or a PDF" className="flex size-10 shrink-0 items-center justify-center rounded-md border border-line text-ink hover:border-ink disabled:opacity-50">
                    <Paperclip className="size-4" aria-hidden />
                </button>
                <textarea
                    value={draft}
                    onChange={(event) => onDraft(event.target.value)}
                    onBlur={onBlur}
                    onKeyDown={(event) => {
                        if (event.key === "Enter" && !event.shiftKey) {
                            event.preventDefault();
                            void send();
                        }
                    }}
                    rows={1}
                    maxLength={4000}
                    placeholder={attaching ? "Attaching…" : "Write a message"}
                    aria-label="Message"
                    className="max-h-32 min-h-10 flex-1 resize-y rounded-md border border-line bg-white px-3 py-2 text-sm text-ink placeholder:text-dim focus:border-ink focus:outline-none"
                />
                <button type="submit" disabled={sending || attaching || !draft.trim()} aria-label="Send" className="flex size-10 shrink-0 items-center justify-center rounded-full bg-brand text-white hover:bg-[#a51b1b] disabled:opacity-50">
                    <Send className="size-4" aria-hidden />
                </button>
                <input ref={fileRef} type="file" accept="image/*,application/pdf" className="sr-only" aria-label="Attachment" onChange={(event) => void attach(event.target.files?.[0])} />
            </form>
            {error && (
                <p role="alert" className="px-5 pb-3 text-sm text-danger">
                    {error}
                </p>
            )}
        </section>
    );
}
