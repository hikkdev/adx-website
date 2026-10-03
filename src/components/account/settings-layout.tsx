"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { LoadingLine } from "@/components/advertiser/bits";
import { cn } from "@/lib/utils";
import type { Party } from "@/services/party";
import { anchorOf, SETTINGS_SECTIONS, sectionFrom, settingsRedirectTarget, type SettingsSection } from "./sections";

/**
 * The section open on a side's settings page and the way to switch it:
 * `?section=` in the address, so a link, a reload and the back button keep
 * it; else the section an old anchor's card lives in (`#security` opens
 * Privacy & security); else the profile.
 */
export function useSettingsSection(): [SettingsSection, (next: SettingsSection) => void] {
    const params = useSearchParams();
    const router = useRouter();
    const pathname = usePathname();
    /* The anchor the page was opened with; read once — the server never draws a workspace page. */
    const [hash] = React.useState(() => (typeof window === "undefined" ? "" : window.location.hash));
    const section = sectionFrom(params.get("section"), hash);
    const select = React.useCallback(
        (next: SettingsSection) => {
            const query = new URLSearchParams(params.toString());
            query.set("section", next);
            router.replace(`${pathname}?${query.toString()}`, { scroll: false });
        },
        [params, pathname, router]
    );
    return [section, select];
}

/**
 * Scrolls the card an old anchor named into view once it is drawn — the
 * cards read their own data, so it may appear a moment after the section.
 */
export function useScrollToAnchor(section: SettingsSection) {
    React.useEffect(() => {
        const anchor = anchorOf(window.location.hash);
        if (!anchor) return;
        const reach = () => {
            const target = document.getElementById(anchor);
            if (!target) return false;
            if (typeof target.scrollIntoView === "function") target.scrollIntoView({ behavior: "smooth", block: "start" });
            return true;
        };
        if (reach()) return;
        const observer = new MutationObserver(() => {
            if (reach()) observer.disconnect();
        });
        observer.observe(document.body, { childList: true, subtree: true });
        const giveUp = window.setTimeout(() => observer.disconnect(), 8000);
        return () => {
            observer.disconnect();
            window.clearTimeout(giveUp);
        };
    }, [section]);
}

/** The three sections as the workspace's dark segmented pill; arrow keys move between them. */
export function SettingsTabs({ value, onChange, className }: { value: SettingsSection; onChange: (next: SettingsSection) => void; className?: string }) {
    const refs = React.useRef<Record<string, HTMLButtonElement | null>>({});
    const move = (event: React.KeyboardEvent, index: number) => {
        const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
        if (!step) return;
        event.preventDefault();
        const next = SETTINGS_SECTIONS[(index + step + SETTINGS_SECTIONS.length) % SETTINGS_SECTIONS.length]!;
        onChange(next.id);
        refs.current[next.id]?.focus();
    };
    return (
        <div className={cn("max-w-full overflow-x-auto [scrollbar-width:none]", className)}>
            <div role="tablist" aria-label="Settings sections" className="inline-flex h-[38px] items-center rounded-full bg-[#3a3a3d] p-[3px]">
                {SETTINGS_SECTIONS.map((section, index) => {
                    const active = section.id === value;
                    return (
                        <button
                            key={section.id}
                            ref={(node) => {
                                refs.current[section.id] = node;
                            }}
                            type="button"
                            role="tab"
                            id={`settings-tab-${section.id}`}
                            aria-controls={`settings-panel-${section.id}`}
                            aria-selected={active}
                            tabIndex={active ? 0 : -1}
                            onClick={() => onChange(section.id)}
                            onKeyDown={(event) => move(event, index)}
                            className={cn("h-8 whitespace-nowrap rounded-full px-4 text-xs font-semibold transition-colors", active ? "bg-white text-ink" : "text-white/85 hover:text-white")}
                        >
                            {section.label}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}

/**
 * The page's sections: the tabs, and the open one's panel — only that one
 * is drawn, so each section reads what it shows when it is opened.
 */
export function SettingsSections({ panels, className }: { panels: Record<SettingsSection, React.ReactNode>; className?: string }) {
    const [section, select] = useSettingsSection();
    useScrollToAnchor(section);
    return (
        <>
            <SettingsTabs value={section} onChange={select} className={cn("mt-5", className)} />
            <div role="tabpanel" id={`settings-panel-${section}`} aria-labelledby={`settings-tab-${section}`} className="mt-6">
                {panels[section]}
            </div>
        </>
    );
}

/**
 * What an old `/…/settings` route draws: nothing but the way on — to the
 * side's one settings page, in the section the link meant (see
 * `settingsRedirectTarget`), so bookmarks and old links still land.
 */
export function SettingsRedirect({ party }: { party: Party }) {
    const router = useRouter();
    React.useEffect(() => {
        router.replace(settingsRedirectTarget(party, window.location.search, window.location.hash));
    }, [party, router]);
    return <LoadingLine>Opening your settings…</LoadingLine>;
}
