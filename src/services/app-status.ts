import { api } from "@/lib/api-client";

/**
 * The platform's own status — `GET /app/status`, the read both apps make
 * before anything else (`mobile/shared/features/legal/app-gate.tsx`,
 * `system-status-screen.tsx`). Ops edit it from the console beside System
 * health. The website uses three parts of it: the maintenance window (the
 * whole site waits), an incident (a banner over every page), and the
 * services list (the `/status` page). The build numbers and store links are
 * the phones' business — a website has no build to force-update.
 */

export type ServiceState = "UP" | "DEGRADED" | "DOWN";
export type IncidentSeverity = "INFO" | "WARNING" | "CRITICAL";

export interface AppStatus {
    maintenance: { active: boolean; message?: string; until?: string };
    incident?: { title: string; message: string; since?: string; severity: IncidentSeverity } | null;
    services: { key: string; label: string; state: ServiceState; note?: string }[];
    updatedAt: string;
    minimumBuild?: { android: number; ios: number };
    latestBuild?: { android: number; ios: number };
    storeUrl?: { android: string; ios: string };
}

export const appStatusService = {
    read: () => api.get<AppStatus>("/app/status", { anonymous: true }),
};

/** A status read loosely: anything that is not the shape is "unknown", never "down". */
export function parseAppStatus(raw: unknown): AppStatus | null {
    if (!raw || typeof raw !== "object") return null;
    const row = raw as Partial<AppStatus>;
    const maintenance = row.maintenance && typeof row.maintenance === "object" ? row.maintenance : { active: false };
    const services = Array.isArray(row.services) ? row.services.filter((s) => s && typeof s.key === "string" && typeof s.label === "string") : [];
    const incident = row.incident && typeof row.incident === "object" && typeof row.incident.title === "string" ? row.incident : null;
    return {
        maintenance: { ...maintenance, active: maintenance.active === true },
        incident,
        services: services.map((s) => ({ ...s, state: s.state === "DOWN" || s.state === "DEGRADED" ? s.state : "UP" })),
        updatedAt: typeof row.updatedAt === "string" ? row.updatedAt : new Date(0).toISOString(),
    };
}

export const SERVICE_TONE: Record<ServiceState, { label: string; tone: "success" | "warning" | "danger" }> = {
    UP: { label: "Operational", tone: "success" },
    DEGRADED: { label: "Degraded", tone: "warning" },
    DOWN: { label: "Down", tone: "danger" },
};

/** "2:00 AM" — the maintenance line's clock, in the reader's own zone. */
export function clockOf(iso: string): string {
    const when = new Date(iso);
    if (Number.isNaN(when.getTime())) return iso;
    const hours = when.getHours();
    return `${hours % 12 === 0 ? 12 : hours % 12}:${String(when.getMinutes()).padStart(2, "0")} ${hours < 12 ? "AM" : "PM"}`;
}

/** What the maintenance page says: ops' own words, else the window's end. */
export function maintenanceLine(maintenance: AppStatus["maintenance"]): string {
    if (maintenance.message && maintenance.message.trim()) return maintenance.message;
    return `ADX is down for scheduled maintenance${maintenance.until ? ` until ${clockOf(maintenance.until)}` : ""}. Your bookings, listings and payments are safe; try again after.`;
}

/** The incident as one line: ops' message, and since when. */
export function incidentLine(incident: NonNullable<AppStatus["incident"]>): string {
    return `${incident.message}${incident.since ? ` Investigating since ${clockOf(incident.since)}.` : ""}`;
}

/** A key per incident, so a banner closed for one is not closed for the next. */
export const incidentKey = (incident: NonNullable<AppStatus["incident"]>): string => `${incident.severity}|${incident.title}|${incident.since ?? ""}`;

/** "Updated 2 minutes ago" under the services list. */
export function updatedAgo(iso: string, now: Date = new Date()): string {
    const minutes = Math.max(0, Math.floor((now.getTime() - new Date(iso).getTime()) / 60_000));
    if (minutes < 1) return "Updated just now";
    if (minutes < 60) return `Updated ${minutes} minute${minutes === 1 ? "" : "s"} ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `Updated ${hours} hour${hours === 1 ? "" : "s"} ago`;
    const days = Math.floor(hours / 24);
    return `Updated ${days} day${days === 1 ? "" : "s"} ago`;
}

/** The pages that stay reachable while ADX is in maintenance: the status page itself. */
export const OPEN_DURING_MAINTENANCE = ["/status"];

export const isOpenDuringMaintenance = (pathname: string): boolean => OPEN_DURING_MAINTENANCE.some((path) => pathname === path || pathname.startsWith(`${path}/`));
