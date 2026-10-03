"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ChevronDown, Search } from "lucide-react";
import * as React from "react";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useAuth } from "@/lib/auth";
import { useSiteBrand } from "@/lib/brand";
import { usePageHref } from "@/lib/site-links";
import { cn } from "@/lib/utils";
import type { SessionUser } from "@/services/auth";
import { FEED_HREF } from "@/services/notifications";
import { SETTINGS_HOME } from "@/components/account/sections";
import { HOME_OF, type Party } from "@/services/party";

/**
 * The DR 12 website navigation (frame "ADX website navigation", 5228:1800):
 * the wordmark, the search field that opens Explore with the query, the five
 * links, and the red Explore button. Signed out, the account link is "Sign
 * in"; signed in (the owner, 26 Sep 2026: "My account", not "My workspace")
 * it is the bell and "My account" — a menu with the account's name, one
 * link per side it holds, Notifications, Settings and Sign out.
 * PB-1: the links name Studio pages by key, so they follow an address ADX changes.
 */
const LINKS = [
    { label: "How it works", page: "how-it-works" },
    { label: "Advertising formats", page: "formats" },
    { label: "For publishers", page: "publishers" },
];

const WORKSPACE_LABEL: Record<Party, string> = { ADVERTISER: "Advertiser workspace", PUBLISHER: "Publisher workspace", PRINT_PARTNER: "Print partner workspace" };
/* 29 Sep 2026: each side's one settings page — Account settings, Business profile, Shop profile. */
const SETTINGS_OF: Record<Party, string> = SETTINGS_HOME;

/** The name the menu shows: the account's own, else its names, else how it signs in. */
export function accountNameOf(user: Pick<SessionUser, "name" | "firstName" | "lastName" | "email" | "mobile">): string {
    const composed = [user.firstName, user.lastName].filter((part) => part && part.trim()).join(" ");
    return (user.name && user.name.trim()) || composed || user.email || user.mobile;
}

const initialsOf = (name: string): string =>
    name
        .replace(/[^\p{L}\s]/gu, " ")
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((word) => word[0]!.toUpperCase())
        .join("") || "ME";

export function SiteHeader({ className }: { className?: string }) {
    const pathname = usePathname();
    const router = useRouter();
    const { status, user, party, cartCount } = useAuth();
    const brand = useSiteBrand();
    const href = usePageHref();
    const [query, setQuery] = React.useState("");
    const explore = href("explore");

    return (
        <header className={cn("sticky top-0 z-40 border-b border-line bg-white", className)}>
            <div className="mx-auto flex h-16 max-w-[1920px] items-center gap-6 px-6 lg:px-14">
                <Link href={href("home")} aria-label={`${brand.platformName} home`} className="shrink-0">
                    <img src={brand.wordmarkUrl} alt={brand.platformName} className="h-[30px] w-auto" />
                </Link>

                <form
                    role="search"
                    className="hidden min-w-0 flex-1 md:block"
                    onSubmit={(event) => {
                        event.preventDefault();
                        router.push(query.trim() ? `${explore}?q=${encodeURIComponent(query.trim())}` : explore);
                    }}
                >
                    <label className="flex h-10 items-center gap-2.5 rounded-md border border-[#e4e4e7] bg-white px-3">
                        <Search className="size-4 shrink-0 text-dim" aria-hidden />
                        <input
                            value={query}
                            onChange={(event) => setQuery(event.target.value)}
                            placeholder="Search ad spaces"
                            aria-label="Search ad spaces"
                            className="min-w-0 flex-1 bg-transparent text-sm text-ink placeholder:text-[#71717a] focus:outline-none"
                        />
                    </label>
                </form>

                <nav className="ml-auto hidden items-center gap-4 lg:flex" aria-label="Website">
                    {LINKS.map((link) => {
                        const to = href(link.page);
                        return (
                            <Link
                                key={link.page}
                                href={to}
                                className={cn(
                                    "rounded-md px-1 py-2.5 text-sm font-medium text-ink hover:text-brand",
                                    pathname === to && "text-brand"
                                )}
                            >
                                {link.label}
                            </Link>
                        );
                    })}
                    <Link href="/cart" className="rounded-md px-1 py-2.5 text-sm font-medium text-ink hover:text-brand">
                        Campaign cart{cartCount > 0 && <span className="ml-1 tabular-nums text-brand">({cartCount})</span>}
                    </Link>
                </nav>

                <div className="ml-auto flex shrink-0 items-center gap-3 lg:ml-0">
                    {status === "restoring" ? (
                        <span className="block h-[38px] w-[92px]" aria-hidden />
                    ) : user ? (
                        <>
                            {party && <NotificationBell party={party} />}
                            <AccountMenu user={user} />
                        </>
                    ) : (
                        <Link href={`/sign-in${pathname && pathname !== "/" && !pathname.startsWith("/sign-in") ? `?next=${encodeURIComponent(pathname)}` : ""}`} className="rounded-md px-1 py-2.5 text-sm font-medium text-ink hover:text-brand">
                            Sign in
                        </Link>
                    )}
                    <Link href={explore} className="shrink-0 rounded bg-brand px-6 py-2.5 text-sm font-medium text-white hover:bg-[#a51b1b]">
                        Explore spaces
                    </Link>
                </div>
            </div>
        </header>
    );
}

/** "My account": who is signed in, their sides, and the account's doors. */
function AccountMenu({ user }: { user: SessionUser }) {
    const router = useRouter();
    const { parties, party, setPreferredParty, signOut } = useAuth();
    const name = accountNameOf(user);
    const line = user.email && user.email !== name ? user.email : user.mobile !== name ? user.mobile : null;

    const item = "flex h-10 cursor-pointer items-center rounded-md px-3 text-sm text-ink outline-none focus:bg-ground data-[highlighted]:bg-ground";

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <button type="button" className="flex h-[38px] items-center gap-1.5 rounded-full border border-line bg-white py-0.5 pl-0.5 pr-2.5 text-sm font-medium text-ink hover:border-ink lg:rounded-md lg:border-0 lg:px-1 lg:hover:text-brand" data-testid="account-menu">
                    <span className="flex size-8 items-center justify-center rounded-full bg-ground text-xs font-semibold lg:hidden">{initialsOf(name)}</span>
                    <span className="hidden lg:inline">My account</span>
                    <ChevronDown className="size-4 text-dim" aria-hidden />
                </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" sideOffset={6} className="w-[296px] rounded-md border-line bg-white p-2 shadow-card">
                <div className="px-3 py-2">
                    <p className="truncate text-sm font-semibold text-ink">{name}</p>
                    {line && <p className="truncate text-xs text-dim">{line}</p>}
                </div>
                <DropdownMenuSeparator className="my-1 bg-line" />
                {parties.length === 0 ? (
                    <DropdownMenuItem className={item} onSelect={() => router.push("/choose-workspace")}>
                        Choose your workspace
                    </DropdownMenuItem>
                ) : (
                    parties.map((side) => (
                        <DropdownMenuItem
                            key={side}
                            className={item}
                            onSelect={() => {
                                if (side !== "PRINT_PARTNER") setPreferredParty(side);
                                router.push(HOME_OF[side]);
                            }}
                        >
                            {WORKSPACE_LABEL[side]}
                        </DropdownMenuItem>
                    ))
                )}
                {party && (
                    <>
                        <DropdownMenuSeparator className="my-1 bg-line" />
                        <DropdownMenuItem className={item} onSelect={() => router.push(FEED_HREF[party])}>
                            Notifications
                        </DropdownMenuItem>
                        <DropdownMenuItem className={item} onSelect={() => router.push(SETTINGS_OF[party])}>
                            Settings
                        </DropdownMenuItem>
                    </>
                )}
                <DropdownMenuSeparator className="my-1 bg-line" />
                <DropdownMenuItem className={item} onSelect={() => void signOut()}>
                    Sign out
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
