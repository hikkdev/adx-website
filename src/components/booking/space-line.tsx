"use client";

import * as React from "react";
import { Calendar, Monitor, User } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * One chosen space, as the cart (5204:62238) and the summary rails draw it:
 * the title, a line for what it is ("Outdoor · 40 × 20 ft", "Digital ·
 * 1080 × 1920 px") and a line for when and how much ("12–25 Oct · 14 days ·
 * ₹6,000"), with an action on the right when the page allows one.
 */
export function SpaceLineCard({ title, kindLine, datesLine, digital, action, photo, className, compact }: { title: string; kindLine: string; datesLine: string; digital: boolean; action?: React.ReactNode; photo?: string | null; className?: string; compact?: boolean }) {
    const Icon = digital ? Monitor : User;
    return (
        <div className={cn("flex items-start justify-between gap-4 rounded-lg border border-line bg-white shadow-card", compact ? "p-4" : "p-5", className)}>
            <div className="flex min-w-0 gap-4">
                {photo && <img src={photo} alt="" className="size-14 shrink-0 rounded-md object-cover" />}
                <div className="min-w-0">
                    <p className={cn("font-semibold text-ink", compact ? "text-sm" : "text-base")}>{title}</p>
                    <p className="mt-2 flex items-center gap-2 text-sm text-dim">
                        <Icon className="size-4 shrink-0" aria-hidden />
                        <span className="truncate">{kindLine}</span>
                    </p>
                    <p className="mt-1.5 flex items-center gap-2 text-sm text-dim">
                        <Calendar className="size-4 shrink-0" aria-hidden />
                        <span className="truncate">{datesLine}</span>
                    </p>
                </div>
            </div>
            {action && <div className="shrink-0">{action}</div>}
        </div>
    );
}
