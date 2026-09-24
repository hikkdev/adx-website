"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Search } from "lucide-react";
import * as React from "react";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";

/**
 * The DR 12 website navigation (frame "ADX website navigation", 5228:1800):
 * the wordmark, the search field that opens Explore with the query, the five
 * links, and the red Explore button. Signed in, "Sign in" becomes the
 * workspace link — the advertiser's campaigns or the publisher's overview —
 * and the cart shows its count.
 */
const LINKS = [
    { label: "How it works", href: "/how-it-works" },
    { label: "Advertising formats", href: "/formats" },
    { label: "For publishers", href: "/publishers" },
];

export function SiteHeader({ className }: { className?: string }) {
    const pathname = usePathname();
    const router = useRouter();
    const { user, party, cartCount } = useAuth();
    const [query, setQuery] = React.useState("");

    const workspaceHref = party === "PUBLISHER" ? "/publisher" : "/advertiser";

    return (
        <header className={cn("sticky top-0 z-40 border-b border-line bg-white", className)}>
            <div className="mx-auto flex h-16 max-w-[1920px] items-center gap-6 px-6 lg:px-14">
                <Link href="/" aria-label="ADX home" className="shrink-0">
                    <img src="/brand/adx-wordmark-red.svg" alt="ADX" className="h-[30px] w-auto" />
                </Link>

                <form
                    role="search"
                    className="hidden min-w-0 flex-1 md:block"
                    onSubmit={(event) => {
                        event.preventDefault();
                        router.push(query.trim() ? `/spaces?q=${encodeURIComponent(query.trim())}` : "/spaces");
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
                    {LINKS.map((link) => (
                        <Link
                            key={link.href}
                            href={link.href}
                            className={cn(
                                "rounded-md px-1 py-2.5 text-sm font-medium text-ink hover:text-brand",
                                pathname === link.href && "text-brand"
                            )}
                        >
                            {link.label}
                        </Link>
                    ))}
                    <Link href="/cart" className="rounded-md px-1 py-2.5 text-sm font-medium text-ink hover:text-brand">
                        Campaign cart{cartCount > 0 && <span className="ml-1 tabular-nums text-brand">({cartCount})</span>}
                    </Link>
                    {user ? (
                        <Link href={workspaceHref} className="rounded-md px-1 py-2.5 text-sm font-medium text-ink hover:text-brand">
                            My workspace
                        </Link>
                    ) : (
                        <Link href="/sign-in" className="rounded-md px-1 py-2.5 text-sm font-medium text-ink hover:text-brand">
                            Sign in
                        </Link>
                    )}
                </nav>

                <Link
                    href="/spaces"
                    className="ml-auto shrink-0 rounded bg-brand px-6 py-2.5 text-sm font-medium text-white hover:bg-[#a51b1b] lg:ml-0"
                >
                    Explore spaces
                </Link>
            </div>
        </header>
    );
}
