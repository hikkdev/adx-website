"use client";

import { SettingsRedirect } from "@/components/account/settings-layout";

/**
 * Settings & privacy was folded into Business profile on 29 Sep 2026 — one settings
 * page per side. This route stays so bookmarks and old links still land: it
 * sends them to the section they meant (`#notifications` to Notifications,
 * the bare route and `#privacy` / `#security` to Privacy & security, a
 * profile anchor to the profile), anchor kept.
 */
export default function Page() {
    return <SettingsRedirect party="PUBLISHER" />;
}
