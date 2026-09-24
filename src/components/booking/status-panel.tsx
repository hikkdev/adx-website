"use client";

import * as React from "react";
import { Clock, ShieldAlert } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The centred verdict the payment pages open with (5204:65893, 5204:66161,
 * 5204:66435): a coloured disc with its icon, the headline, a line or two
 * under it — amber for "checking" and "received", red for "not completed".
 */
export function StatusPanel({ tone, headline, lines, children, className }: { tone: "amber" | "red"; headline: string; lines: string[]; children?: React.ReactNode; className?: string }) {
    const Icon = tone === "red" ? ShieldAlert : Clock;
    return (
        <div className={cn("text-center", className)}>
            <span className={cn("mx-auto flex size-10 items-center justify-center rounded-full text-white", tone === "red" ? "bg-brand" : "bg-[#f59e0b]")}>
                <Icon className="size-5" aria-hidden />
            </span>
            <h2 className="mt-4 text-lg font-semibold text-ink">{headline}</h2>
            <div className="mt-1.5 space-y-0.5">
                {lines.map((line) => (
                    <p key={line} className="text-sm text-dim">
                        {line}
                    </p>
                ))}
            </div>
            {children}
        </div>
    );
}
