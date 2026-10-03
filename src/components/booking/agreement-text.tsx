"use client";

import * as React from "react";
import { ApiError, messageOf } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { boldParts, bookingService, templateText, textBlocks, withSchedule, type AgreementTemplate } from "@/services/booking";

type Kind = "INSERTION_ORDER" | "ADVERTISER_PLATFORM";

/**
 * The live text of an agreement, read before the click — `GET
 * /agreements/current/:kind`, the version ADX published — drawn inline in a
 * box that scrolls. An insertion order gets its schedule printed where the
 * template asks for it, so what is read is what is recorded. `onRead` fires
 * once the reader reaches the end (or at once, when the text is short).
 */
export function AgreementText({ kind, schedule = null, onRead, onLoaded, className, maxHeight = 320 }: { kind: Kind; schedule?: string | null; onRead?: () => void; onLoaded?: (template: AgreementTemplate | null) => void; className?: string; maxHeight?: number }) {
    const [state, setState] = React.useState<{ kind: Kind; template: AgreementTemplate | null; error: string | null } | null>(null);
    const box = React.useRef<HTMLDivElement | null>(null);
    const readRef = React.useRef(onRead);
    const loadedRef = React.useRef(onLoaded);
    React.useEffect(() => {
        readRef.current = onRead;
        loadedRef.current = onLoaded;
    });

    React.useEffect(() => {
        let cancelled = false;
        bookingService
            .agreement(kind)
            .then((template) => {
                if (cancelled) return;
                setState({ kind, template, error: template ? null : "ADX has not published this document yet." });
                loadedRef.current?.(template);
            })
            .catch((caught: unknown) => {
                if (cancelled) return;
                const missing = caught instanceof ApiError && (caught.status === 404 || caught.code === "NO_ACTIVE_TEMPLATE");
                setState({ kind, template: null, error: missing ? "ADX has not published this document yet, so nothing can be accepted today. Support can say when it lands." : messageOf(caught, "Could not read the document.") });
                loadedRef.current?.(null);
            });
        return () => {
            cancelled = true;
        };
    }, [kind]);

    const current = state?.kind === kind ? state : null;
    /* The schedule's heading lines are lines, not one paragraph: each stands alone; its numbered sites stay one list. */
    const scheduleText = schedule ? schedule.split("\n").reduce((text, line, index) => (index === 0 ? line : `${text}${/^\d+\.\s/.test(line) ? "\n" : "\n\n"}${line}`), "") : null;
    const body = current?.template ? withSchedule(templateText(current.template), scheduleText) : "";

    /* A document shorter than its box has no end to scroll to. */
    React.useEffect(() => {
        const el = box.current;
        if (!body || !el) return;
        if (el.scrollHeight <= el.clientHeight + 8) readRef.current?.();
    }, [body]);

    return (
        <div className={className}>
            {current?.template && <p className="text-xs text-dim">Version {current.template.version} · the text ADX has published</p>}
            <div
                ref={box}
                style={{ maxHeight }}
                onScroll={(event) => {
                    const el = event.currentTarget;
                    if (el.scrollHeight - el.scrollTop - el.clientHeight < 32) readRef.current?.();
                }}
                className="mt-2 overflow-y-auto rounded-md border border-line bg-white px-4 py-3 text-sm leading-6 text-ink"
                tabIndex={0}
                aria-label={current?.template?.title ?? "Agreement text"}
            >
                {!current && <p className="text-dim">Loading the document…</p>}
                {current?.error && <p className="text-dim">{current.error}</p>}
                {current?.template && <Blocks body={body} />}
            </div>
        </div>
    );
}

function Blocks({ body }: { body: string }) {
    return (
        <div className="space-y-3">
            {textBlocks(body).map((block, index) => {
                if (block.type === "heading") {
                    const size = block.level === 1 ? "text-base" : "text-sm";
                    return (
                        <p key={index} className={cn("font-semibold text-ink", size)} role="heading" aria-level={block.level + 2}>
                            <Inline text={block.text} />
                        </p>
                    );
                }
                if (block.type === "list") {
                    const List = block.ordered ? "ol" : "ul";
                    return (
                        <List key={index} className={cn("space-y-1 pl-5", block.ordered ? "list-decimal" : "list-disc")}>
                            {block.items.map((item, i) => (
                                <li key={i}>
                                    <Inline text={item} />
                                </li>
                            ))}
                        </List>
                    );
                }
                return (
                    <p key={index}>
                        <Inline text={block.text} />
                    </p>
                );
            })}
        </div>
    );
}

function Inline({ text }: { text: string }) {
    return (
        <>
            {boldParts(text).map((part, i) => (part.strong ? <strong key={i}>{part.text}</strong> : <React.Fragment key={i}>{part.text}</React.Fragment>))}
        </>
    );
}
