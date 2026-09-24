"use client";

import * as React from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import type { Tone } from "@/services/publisher-workspace";

/**
 * The pieces every page of the publisher workspace draws (board 10): the
 * dark segmented control, the table header, the status words in their
 * colour, the label-and-value rows of a summary card, the two button
 * styles, and the three page states.
 */

export const brandButton = "inline-flex h-10 shrink-0 items-center justify-center whitespace-nowrap rounded-md bg-brand px-5 text-sm font-semibold text-white transition-colors hover:bg-[#a51b1b] disabled:pointer-events-none disabled:opacity-50";
export const outlineButton = "inline-flex h-10 shrink-0 items-center justify-center whitespace-nowrap rounded-md border border-line bg-white px-5 text-sm font-semibold text-ink transition-colors hover:border-ink disabled:pointer-events-none disabled:opacity-50";
export const quietLink = "text-sm font-medium text-ink underline underline-offset-4 decoration-line hover:decoration-ink";

const TONE_TEXT: Record<Tone, string> = {
    success: "text-success",
    warning: "text-warning",
    danger: "text-danger",
    info: "text-info",
    neutral: "text-dim",
    ink: "text-ink",
};

const TONE_CHIP: Record<Tone, string> = {
    success: "bg-success-soft text-success",
    warning: "bg-warning-soft text-warning",
    danger: "bg-danger-soft text-danger",
    info: "bg-info-soft text-info",
    neutral: "bg-ground text-dim",
    ink: "bg-brand-soft text-brand",
};

export function StatusText({ tone, children, className }: { tone: Tone; children: React.ReactNode; className?: string }) {
    return <span className={cn("text-sm", TONE_TEXT[tone], className)}>{children}</span>;
}

/** The small upper-case chip: READY TO SUBMIT, IN REVIEW, PRIMARY. */
export function Chip({ tone, children, className }: { tone: Tone; children: React.ReactNode; className?: string }) {
    return <span className={cn("inline-flex h-[22px] items-center rounded-[4px] px-2 text-[11px] font-semibold uppercase tracking-wide", TONE_CHIP[tone], className)}>{children}</span>;
}

/** The dark pill control (All spaces · Published · In review). */
export function Segmented<T extends string>({ value, onChange, options, label }: { value: T; onChange: (value: T) => void; options: { value: T; label: string; count?: number }[]; label: string }) {
    return (
        <div role="tablist" aria-label={label} className="inline-flex items-center rounded-full bg-[#2f2f31] p-[3px]">
            {options.map((option) => {
                const active = option.value === value;
                return (
                    <button
                        key={option.value}
                        type="button"
                        role="tab"
                        aria-selected={active}
                        onClick={() => onChange(option.value)}
                        className={cn("h-8 whitespace-nowrap rounded-full px-5 text-xs font-semibold transition-colors", active ? "bg-white text-ink" : "text-white/90 hover:text-white")}
                    >
                        {option.label}
                        {option.count !== undefined && <span className={cn("ml-1.5", active ? "text-dim" : "text-white/60")}>{option.count}</span>}
                    </button>
                );
            })}
        </div>
    );
}

/** A table on the workspace ground: grey header row, one line per row, the action column right-aligned. */
export function DataTable({ columns, children, className }: { columns: { label: string; align?: "left" | "right"; width?: string }[]; children: React.ReactNode; className?: string }) {
    return (
        <div className={cn("overflow-x-auto rounded-lg border border-line bg-white", className)}>
            <table className="w-full min-w-[560px] text-sm">
                <thead>
                    <tr className="bg-[#f5f5f3] text-left text-xs font-medium text-dim">
                        {columns.map((column, index) => (
                            <th key={`${index}-${column.label}`} scope="col" style={column.width ? { width: column.width } : undefined} className={cn("h-9 px-3 font-medium first:pl-3", column.align === "right" && "text-right")}>
                                {column.label}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>{children}</tbody>
            </table>
        </div>
    );
}

export function TableRow({ children, className }: { children: React.ReactNode; className?: string }) {
    return <tr className={cn("border-t border-line", className)}>{children}</tr>;
}

export function Cell({ children, align, className }: { children: React.ReactNode; align?: "left" | "right"; className?: string }) {
    return <td className={cn("px-3 py-3.5 align-middle first:pl-3", align === "right" && "text-right", className)}>{children}</td>;
}

/** The two-line cell: a name, and a dim line under it. */
export function TitleCell({ title, line, href }: { title: string; line?: string | null; href?: string }) {
    return (
        <div className="min-w-0">
            {href ? (
                <Link href={href} className="block truncate text-sm font-medium text-ink hover:underline">
                    {title}
                </Link>
            ) : (
                <p className="truncate text-sm font-medium text-ink">{title}</p>
            )}
            {line && <p className="mt-0.5 truncate text-xs text-dim">{line}</p>}
        </div>
    );
}

/** A label on the left, the value on the right — the rows of Booking summary and Payout. */
export function KeyRow({ label, value, strong, className }: { label: React.ReactNode; value: React.ReactNode; strong?: boolean; className?: string }) {
    return (
        <div className={cn("flex items-start justify-between gap-6 py-2", className)}>
            <span className="text-sm text-dim">{label}</span>
            <span className={cn("text-right text-sm text-ink", strong && "font-semibold")}>{value}</span>
        </div>
    );
}

export function CardTitle({ children, className }: { children: React.ReactNode; className?: string }) {
    return <h2 className={cn("text-base font-semibold text-ink", className)}>{children}</h2>;
}

export function Loading({ label = "Loading…" }: { label?: string }) {
    return (
        <p role="status" className="py-6 text-sm text-dim">
            {label}
        </p>
    );
}

export function ErrorNote({ message, onRetry }: { message: string; onRetry?: () => void }) {
    return (
        <div role="alert" className="rounded-lg border border-danger/20 bg-danger-soft px-4 py-3 text-sm text-danger">
            {message}
            {onRetry && (
                <button type="button" onClick={onRetry} className="ml-3 font-semibold underline underline-offset-4">
                    Try again
                </button>
            )}
        </div>
    );
}

export function Empty({ title, text, action }: { title: string; text?: string; action?: { label: string; href: string } }) {
    return (
        <div className="rounded-lg border border-dashed border-line bg-white px-6 py-10 text-center">
            <p className="text-sm font-semibold text-ink">{title}</p>
            {text && <p className="mx-auto mt-1 max-w-md text-sm text-dim">{text}</p>}
            {action && (
                <Link href={action.href} className={cn(outlineButton, "mt-5")}>
                    {action.label}
                </Link>
            )}
        </div>
    );
}

/** "Bookings / New request" over a page title. */
export function Crumbs({ items }: { items: { label: string; href?: string }[] }) {
    return (
        <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-sm text-dim">
            {items.map((item, index) => (
                <React.Fragment key={`${item.label}-${index}`}>
                    {index > 0 && <span aria-hidden>/</span>}
                    {item.href ? (
                        <Link href={item.href} className="hover:text-ink">
                            {item.label}
                        </Link>
                    ) : (
                        <span className="text-ink">{item.label}</span>
                    )}
                </React.Fragment>
            ))}
        </nav>
    );
}

/** The frame's info circle on a choice card. */
export function InfoDot({ active, title }: { active?: boolean; title: string }) {
    return (
        <span title={title} aria-label={title} className={cn("flex size-[18px] shrink-0 items-center justify-center rounded-full border text-[11px] font-semibold leading-none", active ? "border-brand-bright text-brand-bright" : "border-line text-dim")}>
            i
        </span>
    );
}

/** A choice drawn as a card with a radio on the left — Install it yourself / Request ADX installation. */
export function ChoiceCard({ checked, title, hint, onSelect, disabled, name }: { checked: boolean; title: string; hint: string; onSelect: () => void; disabled?: boolean; name: string }) {
    return (
        <label className={cn("flex cursor-pointer items-center justify-between gap-4 rounded-lg border bg-white px-4 py-3.5 transition-colors", checked ? "border-brand-bright bg-[#fff7f7]" : "border-line hover:border-dim", disabled && "cursor-not-allowed opacity-60")}>
            <span className="flex items-center gap-3">
                <input type="radio" name={name} checked={checked} onChange={onSelect} disabled={disabled} className="peer sr-only" />
                <span aria-hidden className={cn("flex size-4 items-center justify-center rounded-full border-2", checked ? "border-brand-bright" : "border-line")}>
                    {checked && <span className="size-2 rounded-full bg-brand-bright" />}
                </span>
                <span>
                    <span className="block text-sm font-semibold text-ink">{title}</span>
                    <span className="block text-xs text-dim">{hint}</span>
                </span>
            </span>
            <InfoDot active={checked} title={hint} />
        </label>
    );
}

/** A labelled field on a white card: the label over the control, the same height on every cell of a row. */
export function Field({ label, children, hint, htmlFor }: { label: string; children: React.ReactNode; hint?: string; htmlFor?: string }) {
    return (
        <div>
            <label htmlFor={htmlFor} className="block text-sm font-medium text-ink">
                {label}
                {hint && <span className="ml-1 font-normal text-dim">· {hint}</span>}
            </label>
            <div className="mt-2">{children}</div>
        </div>
    );
}

export const inputClass = "h-10 w-full rounded-md border border-line bg-white px-3 text-sm text-ink placeholder:text-dim focus:border-ink focus:outline-none disabled:bg-ground disabled:text-dim";
export const textareaClass = "w-full rounded-md border border-line bg-white px-3 py-2.5 text-sm text-ink placeholder:text-dim focus:border-ink focus:outline-none";
