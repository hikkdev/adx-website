"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Bell } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useNotifications } from "@/lib/notifications";
import { cn } from "@/lib/utils";
import { announcementOf, badgeLabel, FEED_HREF, hrefForRelated, relatedOf, type AnnouncementView, type AppNotification } from "@/services/notifications";
import type { Party } from "@/services/party";
import { AnnouncementDialog, NotificationRow } from "./notification-row";

/**
 * What opening a row does, wherever it is drawn: it is marked read, an
 * announcement opens whole, a row naming a record opens that record's page
 * on this side, and anything else lands on the full feed where it is whole.
 */
export function useOpenNotification(party: Party) {
    const router = useRouter();
    const pathname = usePathname();
    const { markRead } = useNotifications();
    const [reading, setReading] = React.useState<AnnouncementView | null>(null);

    const open = React.useCallback(
        (item: AppNotification, after?: () => void) => {
            if (!item.read) void markRead(item.id);
            after?.();
            const announcement = announcementOf(item);
            if (announcement) {
                setReading(announcement);
                return;
            }
            const href = hrefForRelated(relatedOf(item), party);
            if (href) router.push(href);
            else if (pathname !== FEED_HREF[party]) router.push(FEED_HREF[party]);
        },
        [markRead, party, router, pathname]
    );

    const dialog = <AnnouncementDialog announcement={reading} onClose={() => setReading(null)} />;
    return { open, dialog };
}

/**
 * The bell in the site header and the workspace header: the unread count
 * as a badge, and the latest few in a menu with "Mark all read" and the
 * way to the whole feed of the side the reader is on.
 */
export function NotificationBell({ party, className }: { party: Party; className?: string }) {
    const { unreadCount, latest, loaded, refresh, markAllRead } = useNotifications();
    const [menuOpen, setMenuOpen] = React.useState(false);
    const { open, dialog } = useOpenNotification(party);
    const badge = badgeLabel(unreadCount);

    return (
        <>
            <DropdownMenu
                open={menuOpen}
                onOpenChange={(next) => {
                    setMenuOpen(next);
                    if (next) void refresh();
                }}
            >
                <DropdownMenuTrigger asChild>
                    <button
                        type="button"
                        aria-label={badge ? `Notifications, ${unreadCount} unread` : "Notifications"}
                        className={cn("relative flex size-[38px] items-center justify-center rounded-full border border-line bg-white text-ink hover:border-ink", className)}
                        data-testid="notification-bell"
                    >
                        <Bell className="size-[18px]" aria-hidden />
                        {badge && <span className="absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-brand-bright px-1 text-[11px] font-semibold tabular-nums leading-none text-white">{badge}</span>}
                    </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" sideOffset={6} className="w-[360px] max-w-[calc(100vw-2rem)] rounded-md border-line bg-white p-2 shadow-card">
                    <div className="flex items-center justify-between px-3 py-2">
                        <p className="text-sm font-semibold text-ink">Notifications</p>
                        {unreadCount > 0 && (
                            <button type="button" onClick={() => void markAllRead()} className="text-sm text-dim hover:text-ink">
                                Mark all read
                            </button>
                        )}
                    </div>
                    <div className="max-h-[420px] overflow-y-auto">
                        {!loaded ? (
                            <p className="px-3 py-6 text-center text-sm text-dim">Reading your notifications…</p>
                        ) : latest.length === 0 ? (
                            <p className="px-3 py-6 text-center text-sm text-dim">Nothing yet. Bookings, payments and messages from ADX land here.</p>
                        ) : (
                            latest.map((item) => <NotificationRow key={item.id} item={item} compact onOpen={(row) => open(row, () => setMenuOpen(false))} />)
                        )}
                    </div>
                    <div className="mt-1 border-t border-line pt-2">
                        <Link href={FEED_HREF[party]} onClick={() => setMenuOpen(false)} className="flex h-10 items-center justify-center rounded-md text-sm font-medium text-ink hover:bg-ground">
                            See all notifications
                        </Link>
                    </div>
                </DropdownMenuContent>
            </DropdownMenu>
            {dialog}
        </>
    );
}
