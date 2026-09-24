"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ArrowUpDown, ChevronDown, Coins, Compass, House, Map as MapIcon, MessageSquareText, ReceiptText, Search, Tag, Tags, type LucideIcon } from "lucide-react";
import { RequireParty, useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import type { Party } from "@/services/party";

export interface NavItem {
    label: string;
    href: string;
    icon: LucideIcon;
    exact?: boolean;
}

/** DR 12's workspace navigation: the advertiser's four pages, the publisher's five, and the two account rows under each. */
export const ADVERTISER_NAV: NavItem[] = [
    { label: "Campaigns", href: "/advertiser", icon: ArrowUpDown, exact: true },
    { label: "Delivery proofs", href: "/advertiser/proofs", icon: ReceiptText },
    { label: "Billing & payments", href: "/advertiser/billing", icon: Coins },
    { label: "My requests", href: "/advertiser/requests", icon: MessageSquareText },
];
export const ADVERTISER_ACCOUNT: NavItem[] = [
    { label: "Account settings", href: "/advertiser/account", icon: Tags },
    { label: "Help & support", href: "/advertiser/help", icon: MessageSquareText },
];
export const PUBLISHER_NAV: NavItem[] = [
    { label: "Overview", href: "/publisher", icon: House, exact: true },
    { label: "My inventory", href: "/publisher/inventory", icon: MapIcon },
    { label: "Bookings", href: "/publisher/bookings", icon: Compass },
    { label: "Availability", href: "/publisher/availability", icon: ReceiptText },
    { label: "Earnings", href: "/publisher/earnings", icon: Coins },
];
export const PUBLISHER_ACCOUNT: NavItem[] = [
    { label: "Business profile", href: "/publisher/profile", icon: Tag },
    { label: "Help & support", href: "/publisher/help", icon: MessageSquareText },
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

function Shell({ party, accountName, accountLine, nav, account, children }: { party: Party; accountName: string; accountLine: string; nav: NavItem[]; account: NavItem[]; children: React.ReactNode }) {
    const pathname = usePathname();
    const router = useRouter();
    const { user, parties, signOut, setPreferredParty } = useAuth();
    const [menuOpen, setMenuOpen] = React.useState(false);
    const [pagesOpen, setPagesOpen] = React.useState(false);
    const [query, setQuery] = React.useState("");
    const initials = initialsOf(accountName || user?.name, party === "PUBLISHER" ? "PU" : "AD");
    const other: Party = party === "PUBLISHER" ? "ADVERTISER" : "PUBLISHER";
    const pages = [...nav, ...account];
    const matches = query.trim() ? pages.filter((p) => p.label.toLowerCase().includes(query.trim().toLowerCase())) : pages;

    const isActive = (item: NavItem) => (item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`));

    return (
        <div className="min-h-screen bg-ground">
            <header className="sticky top-0 z-40 flex h-[57px] items-center gap-4 border-b border-line bg-white px-4">
                <Link href={party === "PUBLISHER" ? "/publisher" : "/advertiser"} className="flex items-center gap-2 pl-2.5 pr-3">
                    <img src="/brand/adx-wordmark-red.svg" alt="ADX" className="h-6 w-auto" />
                    <span className="text-xs font-medium text-dim">{party === "PUBLISHER" ? "Publisher" : "Advertiser"}</span>
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
                        <div className="absolute left-0 top-full z-50 mt-1 w-full rounded-md border border-line bg-white p-2 shadow-card">
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
                    <div className="relative">
                        <button type="button" onClick={() => setMenuOpen((o) => !o)} aria-haspopup="menu" aria-expanded={menuOpen} className="flex h-[38px] items-center gap-1.5 rounded-full border border-line bg-white py-0.5 pl-0.5 pr-2.5">
                            <span className="flex size-8 items-center justify-center rounded-full bg-ground text-xs font-semibold text-ink">{initials}</span>
                            <ChevronDown className="size-4 text-dim" aria-hidden />
                        </button>
                        {menuOpen && (
                            <div role="menu" className="absolute right-0 top-full z-50 mt-1 w-[296px] rounded-md border border-line bg-white p-2 shadow-card" onMouseLeave={() => setMenuOpen(false)}>
                                <div className="flex items-start justify-between px-3 py-2">
                                    <div>
                                        <p className="text-sm font-semibold text-ink">{accountName || user?.name || user?.mobile}</p>
                                        <p className="text-xs text-dim">{accountLine}</p>
                                    </div>
                                    <button type="button" className="text-sm text-dim" onClick={() => setMenuOpen(false)}>
                                        Close
                                    </button>
                                </div>
                                {account.map((item) => (
                                    <Link key={item.href} href={item.href} role="menuitem" onClick={() => setMenuOpen(false)} className="flex h-11 items-center gap-3 rounded-md px-3 text-sm text-ink hover:bg-ground">
                                        <item.icon className="size-[18px] text-dim" aria-hidden />
                                        {item.label}
                                    </Link>
                                ))}
                                <div className="my-2 border-t border-line" />
                                <button
                                    type="button"
                                    role="menuitem"
                                    onClick={() => {
                                        setMenuOpen(false);
                                        if (parties.includes(other)) {
                                            setPreferredParty(other);
                                            router.push(other === "PUBLISHER" ? "/publisher" : "/advertiser");
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
                <aside className="sticky top-[57px] hidden h-[calc(100vh-57px)] w-[243px] shrink-0 flex-col border-r border-line bg-white px-3.5 pb-5 pt-5 lg:flex">
                    <div className="flex items-center gap-3 rounded-md px-2.5 py-4">
                        <span className="flex size-8 items-center justify-center rounded-full bg-ground text-xs font-semibold text-ink">{initials}</span>
                        <div className="min-w-0">
                            <p className="truncate text-xs font-semibold text-ink">{accountName || user?.name || user?.mobile}</p>
                            <p className="truncate text-xs text-dim">{accountLine}</p>
                        </div>
                    </div>
                    <nav className="mt-4 space-y-1" aria-label="Workspace">
                        {nav.map((item) => (
                            <NavLink key={item.href} item={item} active={isActive(item)} />
                        ))}
                    </nav>
                    <nav className="mt-auto space-y-1" aria-label="Account">
                        {account.map((item) => (
                            <NavLink key={item.href} item={item} active={isActive(item)} />
                        ))}
                    </nav>
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
