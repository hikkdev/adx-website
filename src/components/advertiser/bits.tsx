"use client";

import * as React from "react";
import Link from "next/link";
import { FileText } from "lucide-react";
import { apiBlob, messageOf } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { Panel } from "@/components/workspace/page-heading";
import type { ActivityEntry, Tone } from "@/services/advertiser-workspace";

/* ------------------------------------------------------------------ */
/* Loading                                                             */
/* ------------------------------------------------------------------ */

export type AsyncState<T> = { kind: "loading" } | { kind: "error"; message: string } | { kind: "ready"; value: T };

/**
 * One read, keyed by its inputs: a new key is a new load, and a stale answer
 * is never shown against a newer key. The loader is kept on a ref (written
 * in an effect, never in render) so callers need not memoise it.
 */
export function useAsync<T>(key: string, load: () => Promise<T>, fallback = "Could not load this page."): AsyncState<T> & { reload: () => void } {
    const loadRef = React.useRef(load);
    const [version, setVersion] = React.useState(0);
    const [state, setState] = React.useState<{ key: string; version: number; result: AsyncState<T> } | null>(null);

    React.useEffect(() => {
        loadRef.current = load;
    });

    React.useEffect(() => {
        let cancelled = false;
        loadRef
            .current()
            .then((value) => {
                if (!cancelled) setState({ key, version, result: { kind: "ready", value } });
            })
            .catch((caught: unknown) => {
                if (!cancelled) setState({ key, version, result: { kind: "error", message: messageOf(caught, fallback) } });
            });
        return () => {
            cancelled = true;
        };
    }, [key, version, fallback]);

    const reload = React.useCallback(() => setVersion((v) => v + 1), []);
    const current = state && state.key === key && state.version === version ? state.result : { kind: "loading" as const };
    return { ...current, reload };
}

export function LoadingLine({ children = "Loading…" }: { children?: React.ReactNode }) {
    return <p className="text-sm text-dim">{children}</p>;
}

export function ErrorPanel({ title, message, className }: { title: string; message: string; className?: string }) {
    return (
        <Panel className={cn("mt-6", className)}>
            <p className="text-sm font-medium text-ink">{title}</p>
            <p className="mt-1 text-sm text-dim">{message}</p>
        </Panel>
    );
}

/* ------------------------------------------------------------------ */
/* Buttons and chips                                                   */
/* ------------------------------------------------------------------ */

export const btnPrimary = "inline-flex h-10 items-center justify-center rounded-md bg-brand px-5 text-sm font-semibold text-white hover:bg-[#a51b1b] disabled:cursor-not-allowed disabled:opacity-50";
export const btnOutline = "inline-flex h-10 items-center justify-center rounded-md border border-line bg-white px-5 text-sm font-semibold text-ink hover:border-ink disabled:cursor-not-allowed disabled:opacity-50";
export const btnSmall = "inline-flex h-9 items-center justify-center rounded-md border border-line bg-white px-4 text-sm font-medium text-ink hover:border-ink disabled:cursor-not-allowed disabled:opacity-50";
export const inputClass = "h-10 w-full rounded-md border border-line bg-white px-3 text-sm text-ink placeholder:text-dim focus:border-ink focus:outline-none disabled:bg-ground disabled:text-dim";

const TONE_CHIP: Record<Tone, string> = {
    neutral: "bg-ground text-ink",
    info: "bg-info-soft text-info",
    success: "bg-success-soft text-success",
    warning: "bg-warning-soft text-warning",
    danger: "bg-danger-soft text-danger",
};

const TONE_TEXT: Record<Tone, string> = {
    neutral: "text-dim",
    info: "text-info",
    success: "text-success",
    warning: "text-warning",
    danger: "text-danger",
};

/** A pill (frame 04's "Not due yet" / "Verified") or plain coloured text (frame 01's status column). */
export function StatusChip({ label, tone = "neutral", pill = true, className }: { label: string; tone?: Tone; pill?: boolean; className?: string }) {
    if (!pill) return <span className={cn("text-sm", TONE_TEXT[tone], className)}>{label}</span>;
    return <span className={cn("inline-flex h-6 items-center rounded-md px-2 text-xs font-medium", TONE_CHIP[tone], className)}>{label}</span>;
}

/** The dark segmented pill on Campaigns (frame 01): the active segment is white. */
export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string }[]; onChange: (value: T) => void }) {
    return (
        <div role="tablist" className="inline-flex h-[34px] items-center rounded-full bg-[#3a3a3d] p-[3px]">
            {options.map((option) => {
                const active = option.value === value;
                return (
                    <button
                        key={option.value}
                        type="button"
                        role="tab"
                        aria-selected={active}
                        onClick={() => onChange(option.value)}
                        className={cn("h-7 rounded-full px-4 text-xs font-semibold transition-colors", active ? "bg-white text-ink" : "text-white/85 hover:text-white")}
                    >
                        {option.label}
                    </button>
                );
            })}
        </div>
    );
}

/** The white select boxes on Delivery proofs ("All campaigns", "All statuses"). */
export function SelectBox({ value, onChange, options, label, className }: { value: string; onChange: (value: string) => void; options: { value: string; label: string }[]; label: string; className?: string }) {
    return (
        <label className={cn("relative inline-flex", className)}>
            <span className="sr-only">{label}</span>
            <select value={value} onChange={(e) => onChange(e.target.value)} className="h-10 w-full appearance-none rounded-full border border-line bg-white pl-4 pr-9 text-xs font-medium text-ink focus:border-ink focus:outline-none">
                {options.map((o) => (
                    <option key={o.value} value={o.value}>
                        {o.label}
                    </option>
                ))}
            </select>
            <svg aria-hidden viewBox="0 0 16 16" className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-dim">
                <path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
        </label>
    );
}

/* ------------------------------------------------------------------ */
/* Tables                                                              */
/* ------------------------------------------------------------------ */

export function TablePanel({ children, className }: { children: React.ReactNode; className?: string }) {
    return (
        <div className={cn("overflow-x-auto rounded-lg border border-line bg-white", className)}>
            <table className="w-full min-w-[720px] text-sm">{children}</table>
        </div>
    );
}

export function Th({ children, className, align = "left" }: { children?: React.ReactNode; className?: string; align?: "left" | "right" }) {
    return <th className={cn("bg-ground px-4 py-3 text-xs font-medium text-dim first:pl-5 last:pr-5", align === "right" ? "text-right" : "text-left", className)}>{children}</th>;
}

export function Td({ children, className, align = "left" }: { children?: React.ReactNode; className?: string; align?: "left" | "right" }) {
    return <td className={cn("px-4 py-4 align-middle first:pl-5 last:pr-5", align === "right" ? "text-right" : "text-left", className)}>{children}</td>;
}

/** The two-line cell every table draws: a title over a muted line. */
export function Cell({ title, line, className }: { title: React.ReactNode; line?: React.ReactNode; className?: string }) {
    return (
        <div className={className}>
            <p className="text-sm text-ink">{title}</p>
            {line && <p className="mt-0.5 text-xs text-dim">{line}</p>}
        </div>
    );
}

/* ------------------------------------------------------------------ */
/* Cards                                                               */
/* ------------------------------------------------------------------ */

export function SectionTitle({ title, line, className, children }: { title: string; line?: React.ReactNode; className?: string; children?: React.ReactNode }) {
    return (
        <div className={cn("flex flex-wrap items-end justify-between gap-3", className)}>
            <div>
                <h2 className="text-base font-semibold text-ink">{title}</h2>
                {line && <p className="mt-1 text-xs text-dim">{line}</p>}
            </div>
            {children}
        </div>
    );
}

/** A card with a titled header row and a body (frame 09's Profile / Password / Active sessions). */
export function HeaderCard({ title, line, actions, children, className, id }: { title: string; line?: React.ReactNode; actions?: React.ReactNode; children: React.ReactNode; className?: string; id?: string }) {
    return (
        <section id={id} className={cn("rounded-lg border border-line bg-white", className)}>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3.5">
                <div>
                    <h2 className="text-sm font-semibold text-ink">{title}</h2>
                    {line && <p className="mt-0.5 text-xs text-dim">{line}</p>}
                </div>
                {actions}
            </div>
            <div className="p-4">{children}</div>
        </section>
    );
}

/** A document row (frame 02's Campaign documents, frame 03's Verified documents). */
export function DocRow({ title, line, href, onClick, external }: { title: string; line: string; href?: string | null; onClick?: () => void; external?: boolean }) {
    const inner = (
        <>
            <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-brand-soft text-brand-bright">
                <FileText className="size-4" aria-hidden />
            </span>
            <span className="min-w-0">
                <span className="block truncate text-sm font-medium text-ink">{title}</span>
                <span className="block truncate text-xs text-dim">{line}</span>
            </span>
        </>
    );
    const className = "flex w-full items-center gap-3 rounded-lg border border-line bg-white px-4 py-3 text-left hover:border-ink";
    if (href) {
        return external ? (
            <a href={href} target="_blank" rel="noreferrer" className={className}>
                {inner}
            </a>
        ) : (
            <Link href={href} className={className}>
                {inner}
            </Link>
        );
    }
    if (onClick) {
        return (
            <button type="button" onClick={onClick} className={className}>
                {inner}
            </button>
        );
    }
    return <div className={className.replace(" hover:border-ink", "")}>{inner}</div>;
}

/** A stacked activity list (frame 02's Activity, frame 03's Delivery activity). */
export function ActivityList({ entries, empty = "Nothing yet." }: { entries: ActivityEntry[]; empty?: string }) {
    if (!entries.length) return <p className="text-sm text-dim">{empty}</p>;
    return (
        <ol className="space-y-3">
            {entries.map((entry, index) => (
                <li key={`${entry.title}-${index}`}>
                    <p className="text-sm font-medium text-ink">{entry.title}</p>
                    <p className="text-xs text-dim">{entry.detail}</p>
                </li>
            ))}
        </ol>
    );
}

/** A key/value row in a summary card. */
export function KeyValue({ label, value, strong, className }: { label: React.ReactNode; value: React.ReactNode; strong?: boolean; className?: string }) {
    return (
        <div className={cn("flex items-baseline justify-between gap-4 py-1.5", className)}>
            <span className="text-sm text-dim">{label}</span>
            <span className={cn("text-right text-sm text-ink", strong && "font-semibold")}>{value}</span>
        </div>
    );
}

/** "AH" on a soft disc — the avatar the frames draw in a list row. */
export function InitialsAvatar({ text, className }: { text: string; className?: string }) {
    return <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-full bg-ground text-[11px] font-semibold text-dim", className)}>{text}</span>;
}

/* ------------------------------------------------------------------ */
/* Images                                                              */
/* ------------------------------------------------------------------ */

/**
 * A photograph off the backend. A public URL is drawn as it is; a path on
 * private storage (`/files/:id`) is fetched with the session's bearer and
 * drawn from an object URL, the way the app's downloads work.
 */
export function PrivateImage({ src, alt, className }: { src: string | null | undefined; alt: string; className?: string }) {
    const isPath = !!src && src.startsWith("/");
    const [objectUrl, setObjectUrl] = React.useState<{ src: string; url: string } | null>(null);

    React.useEffect(() => {
        if (!src || !isPath) return;
        let cancelled = false;
        let made: string | null = null;
        apiBlob(src.replace(/^\/api\/v1/, ""))
            .then((blob) => {
                if (cancelled) return;
                made = URL.createObjectURL(blob);
                setObjectUrl({ src, url: made });
            })
            .catch(() => {
                /* The frame keeps its placeholder; nothing to say. */
            });
        return () => {
            cancelled = true;
            if (made) URL.revokeObjectURL(made);
        };
    }, [src, isPath]);

    const resolved = !src ? null : isPath ? (objectUrl?.src === src ? objectUrl.url : null) : src;
    if (!resolved) return <div className={cn("bg-ground", className)} role="img" aria-label={alt} />;
    return <img src={resolved} alt={alt} className={className} />;
}
