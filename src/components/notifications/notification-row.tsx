"use client";

import * as React from "react";
import { Bell, Megaphone } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { announcementOf, rowLine, timeAgo, type AnnouncementView, type AppNotification } from "@/services/notifications";

/**
 * One notification, as the app's DR 09 Notification Row draws it: the glyph
 * (the megaphone for a broadcast from ops, with the red stripe when it is
 * CRITICAL), the title, one line under it, the time, and the unread dot.
 * `compact` is the bell's dropdown; the feed page draws the full row with
 * the suggested action as a chip.
 */
export function NotificationRow({ item, onOpen, compact = false }: { item: AppNotification; onOpen: (item: AppNotification) => void; compact?: boolean }) {
    const announcement = announcementOf(item);
    const critical = announcement?.importance === "CRITICAL";
    const Glyph = announcement ? Megaphone : Bell;
    return (
        <button
            type="button"
            onClick={() => onOpen(item)}
            className={cn("relative flex w-full items-start gap-3 text-left hover:bg-ground", compact ? "rounded-md px-3 py-2.5" : "px-5 py-4", critical && "border-l-4 border-l-danger")}
            data-testid={`notification-${item.id}`}
        >
            <span className={cn("mt-0.5 flex shrink-0 items-center justify-center rounded-full bg-brand-soft", compact ? "size-8" : "size-9")}>
                <Glyph className="size-4 text-brand-bright" aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
                <span className={cn("block text-sm text-ink", !item.read && "font-semibold")}>{announcement?.title ?? item.title}</span>
                <span className={cn("mt-0.5 block text-sm text-dim", compact ? "line-clamp-1" : "line-clamp-2")}>{announcement ? announcement.body : rowLine(item)}</span>
                {!compact && item.suggestedAction && <span className="mt-2 inline-flex rounded-full bg-brand-soft px-2.5 py-0.5 text-xs font-medium text-brand-bright">{item.suggestedAction}</span>}
            </span>
            <span className="flex shrink-0 flex-col items-end gap-1.5">
                <span className="text-xs tabular-nums text-dim">{timeAgo(item.createdAt)}</span>
                {!item.read && <span className="size-2 rounded-full bg-brand-bright" aria-label="Unread" />}
            </span>
        </button>
    );
}

/** The whole of a broadcast — one line of a service notice is not the notice. */
export function AnnouncementDialog({ announcement, onClose }: { announcement: AnnouncementView | null; onClose: () => void }) {
    return (
        <Dialog open={!!announcement} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="max-w-[520px] border-line bg-white">
                {announcement && (
                    <div className={cn(announcement.importance === "CRITICAL" && "border-l-4 border-l-danger pl-4")}>
                        {announcement.importance === "CRITICAL" && <p className="text-xs font-semibold uppercase tracking-wide text-danger">Service notice</p>}
                        <DialogTitle className="mt-1 text-lg font-semibold text-ink">{announcement.title}</DialogTitle>
                        <DialogDescription className="mt-3 whitespace-pre-line text-sm leading-relaxed text-ink">{announcement.body}</DialogDescription>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}
