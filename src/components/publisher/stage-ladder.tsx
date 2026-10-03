import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Stage } from "@/services/publisher-bookings";

/**
 * The five-stage progress ladder the ADX app draws on a booking and on
 * Track installation (DR 09's Status Ladder): Scheduled, Installer
 * assigned, Installation in progress, Verification pending, Completed —
 * a tick for what is behind, the brand ring on the stage in hand, and what
 * is known at each stage under its name.
 */
export function StageLadder({ stages, className }: { stages: Stage[]; className?: string }) {
    return (
        <ol className={cn("grid", className)} aria-label="Booking progress">
            {stages.map((stage, index) => {
                const last = index === stages.length - 1;
                return (
                    <li key={stage.key} className="relative flex gap-3 pb-4 last:pb-0" aria-current={stage.state === "current" ? "step" : undefined}>
                        {!last && <span aria-hidden className={cn("absolute left-[9px] top-5 h-[calc(100%-12px)] w-px", stage.state === "done" ? "bg-success" : "bg-line")} />}
                        <span
                            aria-hidden
                            className={cn(
                                "relative z-10 mt-0.5 flex size-[19px] shrink-0 items-center justify-center rounded-full border-2",
                                stage.state === "done" && "border-success bg-success text-white",
                                stage.state === "current" && "border-brand bg-white",
                                stage.state === "todo" && "border-line bg-white"
                            )}
                        >
                            {stage.state === "done" && <Check className="size-3" strokeWidth={3} />}
                            {stage.state === "current" && <span className="size-[7px] rounded-full bg-brand" />}
                        </span>
                        <div className="min-w-0">
                            <p className={cn("text-sm", stage.state === "todo" ? "text-dim" : "font-medium text-ink")}>
                                {stage.label}
                                <span className="sr-only">{stage.state === "done" ? " — done" : stage.state === "current" ? " — in hand" : " — to come"}</span>
                            </p>
                            {stage.detail && <p className="mt-0.5 text-xs text-dim">{stage.detail}</p>}
                        </div>
                    </li>
                );
            })}
        </ol>
    );
}
