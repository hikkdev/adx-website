"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ArrowUpDown, BookOpen, ChartLine, ChevronDown, ClipboardList, Coins, Compass, Crown, FileSignature, Gavel, Gift, House, KeyRound, Layers, Map as MapIcon, Megaphone, MessageSquareText, Printer, QrCode, ReceiptText, Rocket, Search, ShieldCheck, Tag, Tags, Wallet, type LucideIcon } from "lucide-react";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { RequireParty, useAuth } from "@/lib/auth";
import { FLAG_PARTNER_KYC, FLAG_PRINT_FLOOR, FLAG_PRINT_QUOTES, FLAG_PROMOTION_ADS, FLAG_PROMOTION_BOOSTS, FLAG_PUBLISHER_PLANS, useFlags, useSwitchedOffCheck } from "@/lib/flags";
import { useSiteBrand } from "@/lib/brand";
import { cn } from "@/lib/utils";
import { HOME_OF, LABEL_OF, type Party } from "@/services/party";

export interface NavItem {
    label: string;
    href: string;
    icon: LucideIcon;
    exact?: boolean;
    /** LM-1: drawn only while this feature switch is on. */
    flag?: string;
    /** Hidden while the platform has this kill switch off (lib/flags `useSwitchedOff`) — the page itself says so. */
    killSwitch?: string;
}

/**
 * DR 12's workspace navigation, and (26 Sep 2026, the owner: "build
 * everything") every page the website gained to match the user app. The
 * routes are fixed here once so each area's pages drop in without touching
 * this file.
 */
export const ADVERTISER_NAV: NavItem[] = [
    /* 28 Sep 2026, the owner: "Analytics should be above campaigns … will give dashboard type feeling" — the workspace lands on its
       Overview (the publisher side's name for its landing, DR 12 · 10 · 01), the book second, the full analytics third. */
    { label: "Overview", href: "/advertiser", icon: House, exact: true },
    { label: "Campaigns", href: "/advertiser/campaigns", icon: ArrowUpDown },
    { label: "Analytics", href: "/advertiser/analytics", icon: ChartLine },
    { label: "Delivery proofs", href: "/advertiser/proofs", icon: ReceiptText },
    { label: "Wallet & billing", href: "/advertiser/billing", icon: Coins },
    { label: "Brands", href: "/advertiser/brands", icon: Layers },
    { label: "Promote on ADX", href: "/advertiser/promotions", icon: Megaphone, flag: FLAG_PROMOTION_ADS },
    { label: "Plans", href: "/advertiser/plans", icon: Crown },
    { label: "Saved spaces", href: "/advertiser/saved", icon: Tag },
    { label: "My requests", href: "/advertiser/requests", icon: MessageSquareText },
    { label: "Disputes", href: "/advertiser/disputes", icon: Gavel },
];
/* 29 Sep 2026 (the owner: the sidebar and the account menu "have similar options"): Notifications is the bell in the top bar — its "See all notifications" opens the full list — so no side lists it here too.
   And one settings page per side (the owner: "Sure, go ahead with further cleanup"): Settings & privacy is a section of each side's
   own page — Account settings, Business profile, Shop profile — so it is no item of its own; its old route sends there. */
export const ADVERTISER_ACCOUNT: NavItem[] = [
    { label: "Account settings", href: "/advertiser/account", icon: Tags },
    { label: "Verification", href: "/advertiser/verify", icon: ShieldCheck },
    { label: "Agreements", href: "/advertiser/agreements", icon: FileSignature },
    { label: "Refer a business", href: "/advertiser/refer", icon: Gift },
    { label: "Help & support", href: "/advertiser/help", icon: MessageSquareText },
];
export const PUBLISHER_NAV: NavItem[] = [
    { label: "Overview", href: "/publisher", icon: House, exact: true },
    { label: "My inventory", href: "/publisher/inventory", icon: MapIcon },
    { label: "Bookings", href: "/publisher/bookings", icon: Compass },
    { label: "Availability", href: "/publisher/availability", icon: ReceiptText },
    { label: "Earnings", href: "/publisher/earnings", icon: Coins },
    { label: "Subscription", href: "/publisher/subscription", icon: Crown, killSwitch: FLAG_PUBLISHER_PLANS },
    { label: "Sponsored listings", href: "/publisher/promotions", icon: Rocket, flag: FLAG_PROMOTION_BOOSTS },
    { label: "Agent access", href: "/publisher/access", icon: QrCode },
    { label: "Disputes", href: "/publisher/disputes", icon: Gavel },
];
export const PUBLISHER_ACCOUNT: NavItem[] = [
    { label: "Business profile", href: "/publisher/profile", icon: Tag },
    { label: "Agreements", href: "/publisher/agreements", icon: FileSignature },
    { label: "Training", href: "/publisher/training", icon: BookOpen },
    { label: "Refer a business", href: "/publisher/refer", icon: Gift },
    { label: "Help & support", href: "/publisher/help", icon: MessageSquareText },
];
export const PARTNER_NAV: NavItem[] = [
    { label: "Home", href: "/partner", icon: House, exact: true, killSwitch: FLAG_PRINT_FLOOR },
    { label: "Jobs", href: "/partner/jobs", icon: Printer, killSwitch: FLAG_PRINT_FLOOR },
    { label: "Quote requests", href: "/partner/quotes", icon: ClipboardList, killSwitch: FLAG_PRINT_QUOTES },
    { label: "Earnings", href: "/partner/earnings", icon: Wallet, killSwitch: FLAG_PRINT_FLOOR },
    { label: "Invoices", href: "/partner/invoices", icon: ReceiptText, killSwitch: FLAG_PRINT_FLOOR },
];
export const PARTNER_ACCOUNT: NavItem[] = [
    /* Not behind the print floor's switch: the page holds the person's settings too, and its shop cards say when the floor is off. */
    { label: "Shop profile", href: "/partner/profile", icon: Tag },
    { label: "Rate card", href: "/partner/rate-card", icon: Coins, killSwitch: FLAG_PRINT_FLOOR },
    { label: "Verification", href: "/partner/verify", icon: KeyRound, killSwitch: FLAG_PARTNER_KYC },
    { label: "Agreements", href: "/partner/agreements", icon: FileSignature },
    { label: "Help & support", href: "/partner/help", icon: MessageSquareText },
];

function initialsOf(name: string | null | undefined, fallback: string): string {
    const words = (name ?? "").trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) return fallback;
    return words.slice(0, 2).map((w) => w[0]!.toUpperCase()).join("");
}

/**
 * The workspace chrome (5204:61914 / 5204:62069): a 57px header with the
 * wordmark and the side's name, the "Go to a page…" box, "Explore spaces ↗"
 * and the account menu; a 243px sidebar with the current workspace, the
 * side's pages, and the account rows pinned to the bottom. Wrapped in
 * `RequireParty`, so nobody reaches it without the side it needs.
 */
export function WorkspaceShell({
    party,
    accountName,
    accountLine,
    nav,
    account,
    children,
}: {
    party: Party;
    accountName: string;
    accountLine: string;
    nav: NavItem[];
    account: NavItem[];
    children: React.ReactNode;
}) {
    return (
        <RequireParty party={party}>
            <Shell party={party} accountName={accountName} accountLine={accountLine} nav={nav} account={account}>
                {children}
            </Shell>
        </RequireParty>
    );
}

/** The items this person may open now: a `flag` item only while its switch is on, a `killSwitch` item unless it is switched off. */
export function visibleNav(items: NavItem[], isOn: (key: string) => boolean, isSwitchedOff: (key: string) => boolean): NavItem[] {
    return items.filter((item) => (!item.flag || isOn(item.flag)) && (!item.killSwitch || !isSwitchedOff(item.killSwitch)));
}

function Shell({ party, accountName, accountLine, nav: allNav, account: allAccount, children }: { party: Party; accountName: string; accountLine: string; nav: NavItem[]; account: NavItem[]; children: React.ReactNode }) {
    const pathname = usePathname();
    const features = useFlags();
    const switchedOff = useSwitchedOffCheck();
    const isOn = (key: string) => features[key]?.enabled === true;
    const nav = visibleNav(allNav, isOn, switchedOff);
    const account = visibleNav(allAccount, isOn, switchedOff);
    const router = useRouter();
    const { user, parties, signOut, setPreferredParty } = useAuth();
    const brand = useSiteBrand();
    const [menuOpen, setMenuOpen] = React.useState(false);
    const [pagesOpen, setPagesOpen] = React.useState(false);
    const [query, setQuery] = React.useState("");
    const initials = initialsOf(accountName || user?.name, party === "PUBLISHER" ? "PU" : party === "PRINT_PARTNER" ? "PP" : "AD");
    // A print partner switches to whichever of the other two it holds; the others switch between themselves.
    const other: Party = party === "PUBLISHER" ? "ADVERTISER" : party === "ADVERTISER" ? "PUBLISHER" : parties.includes("ADVERTISER") ? "ADVERTISER" : "PUBLISHER";
    const pages = [...nav, ...account];
    const matches = query.trim() ? pages.filter((p) => p.label.toLowerCase().includes(query.trim().toLowerCase())) : pages;

    const isActive = (item: NavItem) => (item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`));
    const sidebarScroll = React.useRef<HTMLDivElement>(null);

    /* A deep page (Help & support, Refer a business) is scrolled into the sidebar's view when it is the one open. */
    React.useEffect(() => {
        const current = sidebarScroll.current?.querySelector<HTMLElement>('[aria-current="page"]');
        if (current && typeof current.scrollIntoView === "function") current.scrollIntoView({ block: "nearest", inline: "nearest" });
    }, [pathname, nav.length, account.length]);

    return (
        <div className="min-h-screen bg-ground">
            <header className="sticky top-0 z-40 flex h-[57px] items-center gap-4 border-b border-line bg-white px-4">
                <Link href={HOME_OF[party]} className="flex items-center gap-2 pl-2.5 pr-3">
                    <img src={brand.wordmarkUrl} alt={brand.platformName} className="h-6 w-auto" />
                    <span className="text-xs font-medium text-dim">{LABEL_OF[party]}</span>
                </Link>

                <div className="relative ml-4 hidden w-[480px] md:block">
                    <label className="flex h-9 items-center gap-2.5 rounded-md border border-line bg-white px-3">
                        <Search className="size-4 text-dim" aria-hidden />
                        <input
                            value={query}
                            onChange={(event) => setQuery(event.target.value)}
                            onFocus={() => setPagesOpen(true)}
                            onBlur={() => setTimeout(() => setPagesOpen(false), 150)}
                            onKeyDown={(event) => {
                                if (event.key === "Enter" && matches[0]) {
                                    router.push(matches[0].href);
                                    setQuery("");
                                    setPagesOpen(false);
                                }
                            }}
                            placeholder="Go to a page…"
                            aria-label="Go to a page"
                            className="min-w-0 flex-1 bg-transparent text-sm text-ink placeholder:text-dim focus:outline-none"
                        />
                    </label>
                    {pagesOpen && (
                        <div className="absolute left-0 top-full z-50 mt-1 max-h-[calc(100vh-73px)] w-full overflow-y-auto overscroll-contain rounded-md border border-line bg-white p-2 shadow-card [scrollbar-width:thin] supports-[height:100dvh]:max-h-[calc(100dvh-73px)]">
                            <div className="flex items-center justify-between px-3 py-2">
                                <p className="text-xs font-semibold uppercase tracking-wide text-dim">Go to a page</p>
                                <button type="button" className="text-sm text-dim" onMouseDown={(e) => e.preventDefault()} onClick={() => setPagesOpen(false)}>
                                    Close
                                </button>
                            </div>
                            {matches.map((item) => (
                                <Link key={item.href} href={item.href} onClick={() => setPagesOpen(false)} className="flex h-11 items-center gap-3 rounded-md px-3 text-sm text-ink hover:bg-ground">
                                    <item.icon className="size-[18px] text-dim" aria-hidden />
                                    {item.label}
                                </Link>
                            ))}
                            {matches.length === 0 && <p className="px-3 py-2 text-sm text-dim">No page by that name.</p>}
                        </div>
                    )}
                </div>

                <div className="ml-auto flex items-center gap-4">
                    <Link href="/spaces" className="rounded-md px-3 py-2.5 text-sm font-medium text-ink hover:text-brand">
                        Explore spaces ↗
                    </Link>
                    <NotificationBell party={party} />
                    <div className="relative">
                        <button type="button" onClick={() => setMenuOpen((o) => !o)} aria-haspopup="menu" aria-expanded={menuOpen} className="flex h-[38px] items-center gap-1.5 rounded-full border border-line bg-white py-0.5 pl-0.5 pr-2.5">
                            <span className="flex size-8 items-center justify-center rounded-full bg-ground text-xs font-semibold text-ink">{initials}</span>
                            <ChevronDown className="size-4 text-dim" aria-hidden />
                        </button>
                        {menuOpen && (
                            <div role="menu" data-testid="workspace-account-menu" className="absolute right-0 top-full z-50 mt-1 max-h-[calc(100vh-73px)] w-[296px] max-w-[calc(100vw-32px)] overflow-y-auto overscroll-contain rounded-md border border-line bg-white p-2 shadow-card [scrollbar-width:thin] supports-[height:100dvh]:max-h-[calc(100dvh-73px)]" onMouseLeave={() => setMenuOpen(false)}>
                                <div className="flex items-start justify-between px-3 py-2">
                                    <div>
                                        <p className="text-sm font-semibold text-ink">{accountName || user?.name || user?.mobile}</p>
                                        <p className="text-xs text-dim">{accountLine}</p>
                                    </div>
                                    <button type="button" className="text-sm text-dim" onClick={() => setMenuOpen(false)}>
                                        Close
                                    </button>
                                </div>
                                {/*
                                  * Below the sidebar's breakpoint the menu carries every page of the workspace — there is no sidebar there.
                                  * Beside the sidebar it carries only what the sidebar does not: who you are, the other workspace and
                                  * signing out (29 Sep 2026, the owner: the sidebar and this menu "have similar options").
                                  */}
                                <div className="lg:hidden" data-testid="workspace-account-menu-pages">
                                    {nav.map((item) => (
                                        <Link key={item.href} href={item.href} role="menuitem" aria-current={isActive(item) ? "page" : undefined} onClick={() => setMenuOpen(false)} className={cn("flex h-11 items-center gap-3 rounded-md px-3 text-sm text-ink hover:bg-ground", isActive(item) && "bg-brand-soft font-medium text-brand-bright hover:bg-brand-soft")}>
                                            <item.icon className={cn("size-[18px]", isActive(item) ? "text-brand-bright" : "text-dim")} aria-hidden />
                                            {item.label}
                                        </Link>
                                    ))}
                                    <div className="my-2 border-t border-line" />
                                    {account.map((item) => (
                                        <Link key={item.href} href={item.href} role="menuitem" aria-current={isActive(item) ? "page" : undefined} onClick={() => setMenuOpen(false)} className={cn("flex h-11 items-center gap-3 rounded-md px-3 text-sm text-ink hover:bg-ground", isActive(item) && "bg-brand-soft font-medium text-brand-bright hover:bg-brand-soft")}>
                                            <item.icon className={cn("size-[18px]", isActive(item) ? "text-brand-bright" : "text-dim")} aria-hidden />
                                            {item.label}
                                        </Link>
                                    ))}
                                </div>
                                <div className="my-2 border-t border-line" />
                                <button
                                    type="button"
                                    role="menuitem"
                                    onClick={() => {
                                        setMenuOpen(false);
                                        if (parties.includes(other)) {
                                            setPreferredParty(other);
                                            router.push(HOME_OF[other]);
                                        } else {
                                            router.push(`/choose-workspace?party=${other}`);
                                        }
                                    }}
                                    className="flex h-10 w-full items-center rounded-md px-3 text-left text-sm text-ink hover:bg-ground"
                                >
                                    {parties.includes(other) ? `Switch to ${other.toLowerCase()}` : `Open a ${other.toLowerCase()} workspace`}
                                </button>
                                <button type="button" role="menuitem" onClick={() => void signOut()} className="flex h-10 w-full items-center rounded-md px-3 text-left text-sm text-ink hover:bg-ground">
                                    Log out
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </header>

            <div className="flex">
                {/* The sidebar is its own scroll area (28 Sep 2026, the owner: "looks like this is cut off") — the account block stays
                    put, the pages under it scroll on a short screen, and the page beside it scrolls on its own. */}
                <aside className="sticky top-[57px] hidden h-[calc(100vh-57px)] w-[243px] shrink-0 flex-col border-r border-line bg-white supports-[height:100dvh]:h-[calc(100dvh-57px)] lg:flex">
                    <div className="shrink-0 px-3.5 pt-5">
                        <div className="flex items-center gap-3 rounded-md px-2.5 py-4">
                            <span className="flex size-8 items-center justify-center rounded-full bg-ground text-xs font-semibold text-ink">{initials}</span>
                            <div className="min-w-0">
                                <p className="truncate text-xs font-semibold text-ink">{accountName || user?.name || user?.mobile}</p>
                                <p className="truncate text-xs text-dim">{accountLine}</p>
                            </div>
                        </div>
                    </div>
                    <div ref={sidebarScroll} data-testid="workspace-sidebar-scroll" className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain px-3.5 pb-5 [scrollbar-width:thin]">
                        <nav className="mt-4 space-y-1" aria-label="Workspace">
                            {nav.map((item) => (
                                <NavLink key={item.href} item={item} active={isActive(item)} />
                            ))}
                        </nav>
                        <nav className="mt-auto space-y-1 pt-6" aria-label="Account">
                            {account.map((item) => (
                                <NavLink key={item.href} item={item} active={isActive(item)} />
                            ))}
                        </nav>
                    </div>
                </aside>
                <main className="min-w-0 flex-1 px-6 py-12 lg:px-[146px]">{children}</main>
            </div>
        </div>
    );
}

function NavLink({ item, active }: { item: NavItem; active: boolean }) {
    return (
        <Link href={item.href} aria-current={active ? "page" : undefined} className={cn("flex h-11 items-center gap-3 rounded-md px-3 text-sm text-ink hover:bg-ground", active && "bg-brand-soft font-medium text-brand-bright hover:bg-brand-soft")}>
            <item.icon className={cn("size-[18px]", active ? "text-brand-bright" : "text-dim")} aria-hidden />
            {item.label}
        </Link>
    );
}
