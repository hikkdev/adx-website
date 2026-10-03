"use client";

import * as React from "react";
import { ShieldCheck } from "lucide-react";
import { brandButton, CardTitle } from "@/components/publisher/parts";
import { Panel } from "@/components/workspace/page-heading";
import { cn } from "@/lib/utils";
import { resumableSession, SESSION_COPY, verification, type DigioSide, type SessionView } from "@/services/verification";

/**
 * Cashfree Phase 2 — "Coming back later". Every page that offers the Digio
 * start first reads the person's open sessions; one of this party's KYC is
 * offered back (C-RESUME) instead of the start. A read that fails is not
 * news: the page offers its start, as it did before.
 */
export function useResumableSession(side: DigioSide): { session: SessionView | null; recheck: () => void } {
    const [session, setSession] = React.useState<SessionView | null>(null);
    const [tick, setTick] = React.useState(0);
    React.useEffect(() => {
        let cancelled = false;
        verification.mySessions().then(
            (answer) => !cancelled && setSession(resumableSession(answer?.sessions, side)),
            () => !cancelled && setSession(null)
        );
        return () => {
            cancelled = true;
        };
    }, [side, tick]);
    const recheck = React.useCallback(() => setTick((n) => n + 1), []);
    return { session, recheck };
}

/** C-RESUME's words and its one button — drawn whole, or inside another card (`bare`). */
export function SessionResumeCard({ onContinue, bare = false, className }: { onContinue: () => void; bare?: boolean; className?: string }) {
    const body = (
        <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-start gap-3">
                {!bare && (
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-brand-soft text-brand">
                        <ShieldCheck className="size-5" aria-hidden />
                    </span>
                )}
                <div>
                    {bare ? <p className="text-sm font-semibold text-ink">{SESSION_COPY.resumeTitle}</p> : <CardTitle>{SESSION_COPY.resumeTitle}</CardTitle>}
                    <p className={cn("mt-1 text-dim", bare ? "text-xs" : "text-sm")}>{SESSION_COPY.resumeText}</p>
                </div>
            </div>
            <button type="button" onClick={onContinue} className={cn(brandButton, bare && "w-full")}>
                {SESSION_COPY.resumeButton}
            </button>
        </div>
    );
    if (bare) return <div className={className}>{body}</div>;
    return <Panel className={className ?? "mt-6"}>{body}</Panel>;
}
