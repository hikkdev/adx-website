"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AlertTriangle, Info, Settings, X } from "lucide-react";
import { useAppStatus } from "@/lib/app-status";
import { BrandWordmark } from "@/lib/brand";
import { cn } from "@/lib/utils";
import { incidentKey, incidentLine, isOpenDuringMaintenance, maintenanceLine, type AppStatus } from "@/services/app-status";

const DISMISSED_KEY = "adx.web.incident-dismissed";

/**
 * What `/app/status` puts over every page of the site and the workspaces:
 * a maintenance window is a page of its own (the apps' "Back soon", with a
 * way to try again and the status page left open), and an incident is a
 * banner across the top until the reader closes it — closed for this tab
 * and this incident only, so the next one is seen.
 */
export function AppStatusChrome() {
    const { status } = useAppStatus();
    const pathname = usePathname();
    if (!status) return null;
    if (status.maintenance.active && !isOpenDuringMaintenance(pathname)) return <MaintenancePage maintenance={status.maintenance} />;
    if (status.incident) return <IncidentBanner incident={status.incident} />;
    return null;
}

function IncidentBanner({ incident }: { incident: NonNullable<AppStatus["incident"]> }) {
    const key = incidentKey(incident);
    const [dismissed, setDismissed] = React.useState<string | null>(() => {
        if (typeof window === "undefined") return null;
        try {
            return window.sessionStorage.getItem(DISMISSED_KEY);
        } catch {
            return null;
        }
    });
    if (dismissed === key) return null;

    const tone = incident.severity === "CRITICAL" ? "border-danger/30 bg-danger-soft text-danger" : incident.severity === "WARNING" ? "border-warning/30 bg-warning-soft text-warning" : "border-info/30 bg-info-soft text-info";
    const Icon = incident.severity === "INFO" ? Info : AlertTriangle;

    return (
        <div role="status" className={cn("relative z-50 border-b", tone)} data-testid="incident-banner">
            <div className="mx-auto flex max-w-[1920px] items-start gap-3 px-6 py-3 lg:px-14">
                <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
                <p className="min-w-0 flex-1 text-sm">
                    <span className="font-semibold">{incident.title}.</span> <span className="text-ink">{incidentLine(incident)}</span>{" "}
                    <Link href="/status" className="font-medium underline underline-offset-2">
                        System status
                    </Link>
                </p>
                <button
                    type="button"
                    aria-label="Close this notice"
                    onClick={() => {
                        try {
                            window.sessionStorage.setItem(DISMISSED_KEY, key);
                        } catch {
                            /* ignore */
                        }
                        setDismissed(key);
                    }}
                    className="shrink-0 rounded p-0.5 hover:bg-black/5"
                >
                    <X className="size-4" aria-hidden />
                </button>
            </div>
        </div>
    );
}

function MaintenancePage({ maintenance }: { maintenance: AppStatus["maintenance"] }) {
    const { recheck } = useAppStatus();
    const [busy, setBusy] = React.useState(false);
    return (
        <div role="alertdialog" aria-modal="true" aria-labelledby="maintenance-title" className="fixed inset-0 z-[100] flex flex-col items-center justify-center overflow-y-auto bg-ground px-6 py-16 text-center" data-testid="maintenance-page">
            <BrandWordmark className="absolute left-6 top-6 h-[26px] w-auto lg:left-14" />
            <div className="flex size-[176px] items-center justify-center rounded-full border-[16px] border-brand-soft">
                <span className="flex size-[60px] items-center justify-center rounded-full bg-brand-soft">
                    <Settings className="size-[26px] text-brand-bright" aria-hidden />
                </span>
            </div>
            <h1 id="maintenance-title" className="mt-8 text-[28px] font-semibold tracking-tight text-ink">
                Back soon
            </h1>
            <p className="mt-2 max-w-[440px] text-sm leading-relaxed text-dim">{maintenanceLine(maintenance)}</p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
                <button
                    type="button"
                    disabled={busy}
                    onClick={async () => {
                        setBusy(true);
                        await recheck();
                        setBusy(false);
                    }}
                    className="h-11 rounded-md bg-brand px-6 text-sm font-semibold text-white hover:bg-[#a51b1b] disabled:opacity-60"
                >
                    {busy ? "Checking…" : "Try again"}
                </button>
                <Link href="/status" className="flex h-11 items-center rounded-md border border-line bg-white px-6 text-sm font-medium text-ink hover:border-ink">
                    System status
                </Link>
            </div>
        </div>
    );
}
