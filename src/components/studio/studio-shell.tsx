"use client";

import * as React from "react";
import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { useStudioAuth } from "@/lib/studio-auth";
import { cn } from "@/lib/utils";

/**
 * ST-1: Studio's top bar — the wordmark, where you are, who you are, and
 * the way back to the console. Kept to one 48-px row so the editor below
 * gets the height.
 */
export function StudioShell({ crumb, actions, children, className }: { crumb?: React.ReactNode; actions?: React.ReactNode; children: React.ReactNode; className?: string }) {
    const { user, consoleUrl, signOut } = useStudioAuth();
    return (
        <div className={cn("flex min-h-screen flex-col", className)}>
            <header className="flex h-12 shrink-0 items-center gap-3 border-b border-line bg-white px-4" data-testid="studio-shell">
                <Link href="/studio" className="flex items-center gap-2 text-sm font-semibold text-ink">
                    <span className="inline-flex size-6 items-center justify-center rounded bg-brand text-[11px] font-bold text-white">S</span>
                    ADX Studio
                </Link>
                {crumb && (
                    <div className="flex min-w-0 items-center gap-2 text-sm text-dim">
                        <span aria-hidden>/</span>
                        <div className="min-w-0 truncate">{crumb}</div>
                    </div>
                )}
                <div className="ml-auto flex items-center gap-2">
                    {actions}
                    <a href={`${consoleUrl}/content`} target="_blank" rel="noopener" className="hidden items-center gap-1 text-xs text-dim hover:text-ink sm:inline-flex">
                        Console <ExternalLink className="size-3" aria-hidden />
                    </a>
                    {user && (
                        <button type="button" onClick={signOut} title="Forget this Studio session" className="max-w-[160px] truncate text-xs text-dim hover:text-ink">
                            {user.name || user.email || "Admin"}
                        </button>
                    )}
                </div>
            </header>
            <div className="flex min-h-0 flex-1 flex-col">{children}</div>
        </div>
    );
}
