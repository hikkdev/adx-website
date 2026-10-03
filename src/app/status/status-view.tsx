"use client";

import * as React from "react";
import { CheckCircle2, Settings } from "lucide-react";
import { useAppStatus } from "@/lib/app-status";
import { cn } from "@/lib/utils";
import { incidentLine, maintenanceLine, SERVICE_TONE, updatedAgo } from "@/services/app-status";

const TONE_TEXT = { success: "text-success", warning: "text-warning", danger: "text-danger" } as const;

/**
 * The incident card, the SERVICES rows with each one's state, and the
 * "Updated N minutes ago" stamp — every word from `GET /app/status`, which
 * ops edit in the console beside System health, so an incident raised once
 * shows here, in the banner and in both apps. Read afresh on arrival.
 */
export function StatusView() {
    const { status, checked, recheck } = useAppStatus();
    const [fresh, setFresh] = React.useState(false);

    React.useEffect(() => {
        let cancelled = false;
        void recheck().finally(() => {
            if (!cancelled) setFresh(true);
        });
        return () => {
            cancelled = true;
        };
    }, [recheck]);

    const incident = status?.incident ?? null;

    return (
        <div className="mx-auto max-w-[880px] px-6 pb-20 pt-14 lg:px-0">
            <h1 className="text-[34px] font-bold leading-tight tracking-tight text-ink">System status</h1>
            <p className="mt-2 text-[16px] text-dim">Whether each part of ADX is running right now.</p>

            {!checked && !fresh ? (
                <p className="mt-10 text-sm text-dim">Checking…</p>
            ) : !status ? (
                <p className="mt-10 rounded-lg border border-danger/30 bg-danger-soft px-5 py-4 text-sm text-danger" role="alert">
                    ADX is not answering at the moment, so its status could not be read. If this lasts more than a few minutes, the service may be down — try again shortly.
                </p>
            ) : (
                <>
                    {status.maintenance.active && (
                        <section className="mt-10 flex items-start gap-3 rounded-lg border border-warning/30 bg-warning-soft px-5 py-4" data-testid="status-maintenance">
                            <Settings className="mt-0.5 size-5 shrink-0 text-warning" aria-hidden />
                            <div>
                                <p className="text-sm font-semibold text-warning">Scheduled maintenance</p>
                                <p className="mt-1 text-sm text-ink">{maintenanceLine(status.maintenance)}</p>
                            </div>
                        </section>
                    )}
                    {incident ? (
                        <section className={cn("mt-6 rounded-lg border px-5 py-4", incident.severity === "CRITICAL" ? "border-danger/30 bg-danger-soft" : "border-warning/30 bg-warning-soft")} data-testid="status-incident">
                            <p className={cn("text-sm font-semibold", incident.severity === "CRITICAL" ? "text-danger" : "text-warning")}>{incident.title}</p>
                            <p className="mt-1 text-sm text-ink">{incidentLine(incident)}</p>
                        </section>
                    ) : (
                        !status.maintenance.active && (
                            <section className="mt-10 flex items-center gap-3 rounded-lg border border-success/40 bg-success-soft px-5 py-4" data-testid="status-all-good">
                                <CheckCircle2 className="size-5 text-success" aria-hidden />
                                <p className="text-sm font-medium text-ink">Everything is running normally.</p>
                            </section>
                        )
                    )}

                    <h2 className="mt-10 text-xs font-medium uppercase tracking-[0.08em] text-dim">Services</h2>
                    <ul className="mt-3 divide-y divide-line overflow-hidden rounded-lg border border-line bg-white">
                        {status.services.map((service) => {
                            const tone = SERVICE_TONE[service.state];
                            return (
                                <li key={service.key} className="flex items-center gap-4 px-5 py-4" data-testid={`status-service-${service.key}`}>
                                    <span className="min-w-0 flex-1">
                                        <span className="block text-[15px] font-medium text-ink">{service.label}</span>
                                        {service.note && <span className="mt-0.5 block text-sm text-dim">{service.note}</span>}
                                    </span>
                                    <span className={cn("text-sm font-medium", TONE_TEXT[tone.tone])}>{tone.label}</span>
                                </li>
                            );
                        })}
                    </ul>
                    <p className="mt-3 text-xs text-dim">{updatedAgo(status.updatedAt)}</p>
                </>
            )}
        </div>
    );
}
