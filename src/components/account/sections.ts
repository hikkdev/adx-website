import type { Party } from "@/services/party";

/**
 * 29 Sep 2026 (the owner: "Sure, go ahead with further cleanup"): one
 * settings page per side, where there were two — the side's designed page
 * (the advertiser's Account settings, the publisher's Business profile, the
 * print partner's Shop profile) and Settings & privacy. The page has three
 * sections: the profile first, then Notifications, then Privacy & security.
 * `?section=` names the one open; the anchors the two old pages had still
 * land, each in the section its card now lives in.
 */
export type SettingsSection = "profile" | "notifications" | "privacy";

export const SETTINGS_SECTIONS: { id: SettingsSection; label: string }[] = [
    { id: "profile", label: "Profile" },
    { id: "notifications", label: "Notifications" },
    { id: "privacy", label: "Privacy & security" },
];

/** Each side's one settings page, named as the side's design names it. */
export const SETTINGS_HOME: Record<Party, string> = { ADVERTISER: "/advertiser/account", PUBLISHER: "/publisher/profile", PRINT_PARTNER: "/partner/profile" };
export const SETTINGS_TITLE: Record<Party, string> = { ADVERTISER: "Account settings", PUBLISHER: "Business profile", PRINT_PARTNER: "Shop profile" };

/** The old Settings & privacy route each side's links and bookmarks still carry. */
export const OLD_SETTINGS_ROUTE: Record<Party, string> = { ADVERTISER: "/advertiser/settings", PUBLISHER: "/publisher/settings", PRINT_PARTNER: "/partner/settings" };

/**
 * Every anchor the two old pages had, and the section its card lives in
 * now: Settings & privacy's (profile, contacts, phone, language,
 * notifications, privacy, agent-access, security) and the account pages'
 * own (billing, security).
 */
const SECTION_OF_ANCHOR: Record<string, SettingsSection> = {
    profile: "profile",
    contacts: "profile",
    phone: "profile",
    language: "profile",
    billing: "profile",
    notifications: "notifications",
    privacy: "privacy",
    security: "privacy",
    sessions: "privacy",
    "agent-access": "privacy",
};

export const isSettingsSection = (value: string | null | undefined): value is SettingsSection => value === "profile" || value === "notifications" || value === "privacy";

/** `#privacy` or `privacy` → `privacy`; empty for none. */
export function anchorOf(hash: string | null | undefined): string {
    const raw = (hash ?? "").replace(/^#/, "");
    try {
        return decodeURIComponent(raw).trim();
    } catch {
        return raw.trim();
    }
}

/** The section an anchor lives in, or null for one the page never had. */
export const sectionOfAnchor = (hash: string | null | undefined): SettingsSection | null => SECTION_OF_ANCHOR[anchorOf(hash)] ?? null;

/** The section to open: `?section=` when it names one, else the one the anchor's card lives in, else the profile. */
export function sectionFrom(param: string | null | undefined, hash: string | null | undefined): SettingsSection {
    if (isSettingsSection(param)) return param;
    return sectionOfAnchor(hash) ?? "profile";
}

/** `/advertiser/account?section=privacy#security` — the side's page, a section of it, a card in it. */
export function settingsHref(party: Party, section?: SettingsSection, anchor?: string): string {
    const base = SETTINGS_HOME[party];
    const query = section ? `?section=${section}` : "";
    return `${base}${query}${anchor ? `#${anchor}` : ""}`;
}

/**
 * Where an old `/…/settings` link lands: the section its anchor's card now
 * lives in, with the anchor kept so the card scrolls into view; a
 * `?section=` passed through; and the bare route — the page that was called
 * Settings & privacy — on Privacy & security.
 */
export function settingsRedirectTarget(party: Party, search: string, hash: string): string {
    const param = new URLSearchParams(search).get("section");
    const anchor = anchorOf(hash);
    const section = isSettingsSection(param) ? param : (sectionOfAnchor(anchor) ?? "privacy");
    return settingsHref(party, section, anchor && SECTION_OF_ANCHOR[anchor] ? anchor : undefined);
}
