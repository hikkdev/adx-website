"use client";

import * as React from "react";
import Link from "next/link";
import { Bell } from "lucide-react";
import { outlineButton, Segmented } from "@/components/publisher/parts";
import { PageHeading } from "@/components/workspace/page-heading";
import { messageOf } from "@/lib/api-client";
import { useNotifications } from "@/lib/notifications";
import { FILTERS, groupByDay, matchesFilter, NOTIFICATIONS_PAGE, notificationsService, type AppNotification, type NotificationFilter } from "@/services/notifications";
import type { Party } from "@/services/party";
import { settingsHref } from "@/components/account/sections";
import { useOpenNotification } from "./notification-bell";
import { NotificationRow } from "./notification-row";

/** Where each side chooses which kinds reach it, and how: the Notifications section of its one settings page. */
const preferencesHref = (party: Party): string => settingsHref(party, "notifications");

/**
 * The whole feed (DR 07's Notifications, 4417:7978, on the web): newest
 * first, the four filter chips, TODAY and EARLIER, "Load more" at the foot
 * since the endpoint pages by `limit` and `offset`. Opening a row marks it
 * read and opens what it names; "Mark all as read" clears the lot. The same
 * list on all three sides — only where a record opens differs.
 */
export function NotificationsFeed({ party }: { party: Party }) {
    const bell = useNotifications();
    const { open, dialog } = useOpenNotification(party);
    const [items, setItems] = React.useState<AppNotification[] | null>(null);
    const [error, setError] = React.useState<string | null>(null);
    const [filter, setFilter] = React.useState<NotificationFilter>("ALL");
    const [exhausted, setExhausted] = React.useState(false);
    const [loadingMore, setLoadingMore] = React.useState(false);

    React.useEffect(() => {
        let cancelled = false;
        notificationsService
            .list({ limit: NOTIFICATIONS_PAGE })
            .then((page) => {
                if (cancelled) return;
                setItems(page.notifications);
                setExhausted(page.notifications.length < NOTIFICATIONS_PAGE);
            })
            .catch((caught: unknown) => {
                if (cancelled) return;
                setError(messageOf(caught, "Could not read your notifications. Check your connection and try again."));
                setItems([]);
                setExhausted(true);
            });
        return () => {
            cancelled = true;
        };
    }, []);

    const loadMore = async () => {
        if (!items || loadingMore) return;
        setLoadingMore(true);
        try {
            const page = await notificationsService.list({ limit: NOTIFICATIONS_PAGE, offset: items.length });
            setItems((current) => [...(current ?? []), ...page.notifications.filter((row) => !(current ?? []).some((have) => have.id === row.id))]);
            setExhausted(page.notifications.length < NOTIFICATIONS_PAGE);
        } catch (caught) {
            setError(messageOf(caught, "Could not read more notifications."));
        } finally {
            setLoadingMore(false);
        }
    };

    const openRow = (item: AppNotification) => {
        setItems((current) => current?.map((row) => (row.id === item.id ? { ...row, read: true } : row)) ?? null);
        open(item);
    };

    const clear = () => {
        setItems((current) => current?.map((row) => ({ ...row, read: true })) ?? null);
        void bell.markAllRead();
    };

    const unread = items ? Math.max(bell.loaded ? bell.unreadCount : 0, items.filter((row) => !row.read).length) : 0;
    const shown = (items ?? []).filter((row) => matchesFilter(row, filter));
    const groups = groupByDay(shown);

    return (
        <div className="mx-auto max-w-[880px]">
            <PageHeading
                title="Notifications"
                subtitle={items === null ? "Reading your notifications…" : unread > 0 ? `${unread} unread` : "You are all caught up."}
                actions={
                    <>
                        <Link href={preferencesHref(party)} className={outlineButton}>
                            Notification settings
                        </Link>
                        {unread > 0 && (
                            <button type="button" onClick={clear} className={outlineButton} data-testid="notifications-read-all">
                                Mark all as read
                            </button>
                        )}
                    </>
                }
            />

            <div className="mt-8">
                <Segmented value={filter} onChange={setFilter} label="Show" options={FILTERS.map((chip) => ({ value: chip.id, label: chip.label }))} />
            </div>

            {error && (
                <p className="mt-6 rounded-lg border border-danger/30 bg-danger-soft px-4 py-3 text-sm text-danger" role="alert">
                    {error}
                </p>
            )}

            {items === null ? (
                <p className="mt-8 text-sm text-dim">Loading…</p>
            ) : items.length === 0 && !error ? (
                <section className="mt-8 flex flex-col items-center rounded-lg border border-line bg-white px-6 py-14 text-center">
                    <span className="flex size-12 items-center justify-center rounded-full bg-brand-soft">
                        <Bell className="size-5 text-brand-bright" aria-hidden />
                    </span>
                    <p className="mt-4 text-base font-semibold text-ink">Nothing yet</p>
                    <p className="mt-1 text-sm text-dim">Bookings, payments and messages from ADX land here.</p>
                </section>
            ) : shown.length === 0 ? (
                <p className="mt-8 text-sm text-dim">Nothing under this filter yet.</p>
            ) : (
                groups.map((group) => (
                    <section key={group.label} className="mt-8">
                        <h2 className="text-xs font-medium uppercase tracking-[0.08em] text-dim">{group.label}</h2>
                        <div className="mt-3 divide-y divide-line overflow-hidden rounded-lg border border-line bg-white">
                            {group.items.map((item) => (
                                <NotificationRow key={item.id} item={item} onOpen={openRow} />
                            ))}
                        </div>
                    </section>
                ))
            )}

            {items !== null && items.length > 0 && !exhausted && (
                <div className="mt-6 flex justify-center">
                    <button type="button" onClick={() => void loadMore()} disabled={loadingMore} className={outlineButton}>
                        {loadingMore ? "Loading…" : "Load more"}
                    </button>
                </div>
            )}
            {dialog}
        </div>
    );
}
