"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { btnOutline, btnPrimary } from "@/components/advertiser/bits";

/**
 * The pieces each side's settings page and its neighbours draw — composed
 * from the workspace's own card, row and dialog so the page reads as if it
 * had always been there: a titled card (frame 09's HeaderCard), a setting
 * row (label and hint on the left, the control on the right), the brand
 * switch, a note line, and a confirm dialog.
 */

export type Note = { tone: "ok" | "bad" | "info"; text: string } | null;

export function NoteLine({ note, className }: { note: Note; className?: string }) {
    if (!note) return null;
    return (
        <p role={note.tone === "bad" ? "alert" : "status"} className={cn("text-xs", note.tone === "ok" ? "text-success" : note.tone === "bad" ? "text-danger" : "text-dim", className)}>
            {note.text}
        </p>
    );
}

/** A titled card with an anchor, so the page's section links land on it. */
export function SettingsCard({ id, title, line, actions, children, className }: { id?: string; title: string; line?: React.ReactNode; actions?: React.ReactNode; children: React.ReactNode; className?: string }) {
    return (
        <section id={id} className={cn("scroll-mt-24 rounded-lg border border-line bg-white", className)}>
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

/** A row: the label and its hint on the left, whatever controls it on the right. */
export function SettingRow({ label, hint, children, className, tone }: { label: React.ReactNode; hint?: React.ReactNode; children?: React.ReactNode; className?: string; tone?: "danger" }) {
    return (
        <div className={cn("flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0", className)}>
            <div className="min-w-0">
                <p className={cn("text-sm font-medium", tone === "danger" ? "text-danger" : "text-ink")}>{label}</p>
                {hint && <p className="mt-0.5 text-xs text-dim">{hint}</p>}
            </div>
            {children && <div className="flex shrink-0 items-center gap-2">{children}</div>}
        </div>
    );
}

/** The brand switch the workspace draws everywhere a preference flips. */
export function Toggle({ checked, onChange, disabled, label }: { checked: boolean; onChange: (value: boolean) => void; disabled?: boolean; label: string }) {
    return <Switch checked={checked} onCheckedChange={onChange} disabled={disabled} aria-label={label} className="data-[state=checked]:bg-brand" />;
}

/** A label over its control; the label carries any guidance, so paired cells stay the same height. */
export function FieldBlock({ label, htmlFor, children, className, trailing }: { label: string; htmlFor?: string; children: React.ReactNode; className?: string; trailing?: React.ReactNode }) {
    return (
        <div className={className}>
            <div className="flex items-center justify-between gap-2">
                <label htmlFor={htmlFor} className="text-sm font-medium text-ink">
                    {label}
                </label>
                {trailing}
            </div>
            <div className="mt-2">{children}</div>
        </div>
    );
}

/** A yes/no question over a consequential step: the body says what happens, the button says it again. */
export function ConfirmDialog({
    open,
    title,
    body,
    confirmLabel,
    cancelLabel = "Cancel",
    tone,
    busy,
    onConfirm,
    onClose,
    children,
    error,
}: {
    open: boolean;
    title: string;
    body?: React.ReactNode;
    confirmLabel: string;
    cancelLabel?: string;
    tone?: "danger";
    busy?: boolean;
    onConfirm: () => void;
    onClose: () => void;
    children?: React.ReactNode;
    error?: string | null;
}) {
    return (
        <Dialog open={open} onOpenChange={(next) => !next && !busy && onClose()}>
            <DialogContent className="max-w-[480px] rounded-lg border-line p-6">
                <DialogHeader>
                    <DialogTitle className="text-lg font-semibold text-ink">{title}</DialogTitle>
                    {body && <DialogDescription className="text-sm text-dim">{body}</DialogDescription>}
                </DialogHeader>
                {children}
                {error && (
                    <p role="alert" className="text-sm text-danger">
                        {error}
                    </p>
                )}
                <div className="flex flex-wrap justify-end gap-3">
                    <button type="button" onClick={onClose} className={btnOutline} disabled={busy}>
                        {cancelLabel}
                    </button>
                    <button type="button" onClick={onConfirm} className={cn(btnPrimary, tone === "danger" && "bg-danger hover:bg-danger/90")} disabled={busy}>
                        {busy ? "Working…" : confirmLabel}
                    </button>
                </div>
            </DialogContent>
        </Dialog>
    );
}

/** The code box: one line, wide letter-spacing, the characters the channel's code can hold. */
export const codeInputClass = "h-10 w-full rounded-md border border-line bg-white px-3 text-center text-base font-semibold uppercase tracking-[0.3em] text-ink placeholder:font-normal placeholder:normal-case placeholder:tracking-normal placeholder:text-dim focus:border-ink focus:outline-none";
