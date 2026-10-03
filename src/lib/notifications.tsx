"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { BELL_PAGE, notificationsService, type AppNotification } from "@/services/notifications";

/**
 * The bell's side of the notifications feed, shared by the site header, the
 * workspace header and the feed pages, so marking a row read anywhere moves
 * the count everywhere. Read when the person signs in, when the tab comes
 * back to the front, and on navigation at most every half minute — the
 * apps poll nothing either, and a bell a page-turn old is fresh enough.
 * Signed out there is nothing to count.
 */
interface NotificationsValue {
    unreadCount: number;
    latest: AppNotification[];
    loaded: boolean;
    refresh: () => Promise<void>;
    /** Marks one read — the bell and whoever else is showing it. Never throws; the server catches up on the next read. */
    markRead: (id: string) => Promise<void>;
    markAllRead: () => Promise<void>;
}

const NotificationsContext = React.createContext<NotificationsValue | null>(null);

/** How long a read counts as fresh for a page-turn. */
const NAVIGATION_FRESH_MS = 30_000;

export function NotificationsProvider({ children }: { children: React.ReactNode }) {
    const { status, user } = useAuth();
    const pathname = usePathname();
    const subject = status === "signed-in" ? (user?.id ?? null) : null;
    const [state, setState] = React.useState<{ subject: string | null; unreadCount: number; latest: AppNotification[]; loaded: boolean }>({ subject: null, unreadCount: 0, latest: [], loaded: false });
    const lastRead = React.useRef(0);

    /** One read of the bell's page, applied when it lands; a failure keeps what is on screen. */
    const apply = React.useCallback(
        (who: string) =>
            notificationsService
                .list({ limit: BELL_PAGE })
                .then((page) => setState({ subject: who, unreadCount: page.unreadCount ?? page.notifications.filter((n) => !n.read).length, latest: page.notifications, loaded: true }))
                .catch(() => setState((current) => ({ ...current, subject: who, loaded: true }))),
        []
    );

    const refresh = React.useCallback(async () => {
        if (!subject) return;
        lastRead.current = Date.now();
        await apply(subject);
    }, [subject, apply]);

    React.useEffect(() => {
        if (!subject) return;
        lastRead.current = Date.now();
        void apply(subject);
        const onVisible = () => {
            if (document.visibilityState !== "visible") return;
            lastRead.current = Date.now();
            void apply(subject);
        };
        document.addEventListener("visibilitychange", onVisible);
        return () => document.removeEventListener("visibilitychange", onVisible);
    }, [subject, apply]);

    React.useEffect(() => {
        if (!subject) return;
        if (Date.now() - lastRead.current < NAVIGATION_FRESH_MS) return;
        lastRead.current = Date.now();
        void apply(subject);
    }, [pathname, subject, apply]);

    const markRead = React.useCallback(async (id: string) => {
        setState((current) => {
            const row = current.latest.find((n) => n.id === id);
            const wasUnread = row ? !row.read : true;
            return { ...current, unreadCount: Math.max(0, current.unreadCount - (wasUnread ? 1 : 0)), latest: current.latest.map((n) => (n.id === id ? { ...n, read: true } : n)) };
        });
        try {
            await notificationsService.markRead(id);
        } catch {
            /* The row stays read on screen; the next read says what the server holds. */
        }
    }, []);

    const markAllRead = React.useCallback(async () => {
        setState((current) => ({ ...current, unreadCount: 0, latest: current.latest.map((n) => ({ ...n, read: true })) }));
        try {
            await notificationsService.markAllRead();
        } catch {
            /* As above. */
        }
    }, []);

    const mine = subject !== null && state.subject === subject;
    const value = React.useMemo<NotificationsValue>(
        () => ({ unreadCount: mine ? state.unreadCount : 0, latest: mine ? state.latest : [], loaded: mine && state.loaded, refresh, markRead, markAllRead }),
        [mine, state, refresh, markRead, markAllRead]
    );
    return <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>;
}

const OUTSIDE: NotificationsValue = { unreadCount: 0, latest: [], loaded: false, refresh: async () => undefined, markRead: async () => undefined, markAllRead: async () => undefined };

/** The bell's state; outside the provider (a test, say) it is an empty bell. */
export function useNotifications(): NotificationsValue {
    return React.useContext(NotificationsContext) ?? OUTSIDE;
}
