import type { Metadata } from "next";
import { NotificationsFeed } from "@/components/notifications/notifications-feed";

export const metadata: Metadata = { title: "Notifications" };

/** The account's notifications, opened on the partner side — the app's Notifications screen. */
export default function Notifications() {
    return <NotificationsFeed party="PRINT_PARTNER" />;
}
