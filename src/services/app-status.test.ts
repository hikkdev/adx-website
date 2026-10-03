import { describe, expect, it, vi } from "vitest";

const get = vi.fn(async (_path: string, _options?: unknown) => ({}));
vi.mock("@/lib/api-client", () => ({ api: { get: (path: string, options?: unknown) => get(path, options) } }));

import { appStatusService, incidentKey, incidentLine, isOpenDuringMaintenance, maintenanceLine, parseAppStatus, SERVICE_TONE, updatedAgo } from "./app-status";

describe("the read", () => {
    it("is public — no session is needed to know ADX is down", async () => {
        await appStatusService.read();
        expect(get).toHaveBeenCalledWith("/app/status", { anonymous: true });
    });
});

describe("parseAppStatus", () => {
    it("keeps what the website uses and reads anything odd as unknown, never as down", () => {
        const parsed = parseAppStatus({
            minimumBuild: { android: 0, ios: 0 },
            maintenance: { active: true, message: "Back at 3" },
            incident: { title: "Payments slow", message: "Cards are taking longer.", severity: "WARNING" },
            services: [{ key: "orders", label: "Orders", state: "UP" }, { key: "pay", label: "Payments", state: "SIDEWAYS" }, { nope: true }],
            updatedAt: "2026-09-26T10:00:00Z",
        });
        expect(parsed?.maintenance).toEqual({ active: true, message: "Back at 3" });
        expect(parsed?.incident?.title).toBe("Payments slow");
        expect(parsed?.services.map((s) => [s.key, s.state])).toEqual([
            ["orders", "UP"],
            ["pay", "UP"],
        ]);
        expect(parseAppStatus(null)).toBeNull();
        expect(parseAppStatus({})).toMatchObject({ maintenance: { active: false }, incident: null, services: [] });
        expect(parseAppStatus({ maintenance: { active: "yes" } })?.maintenance.active).toBe(false);
    });
});

describe("the words", () => {
    it("says ops' own maintenance message, else the window's end", () => {
        expect(maintenanceLine({ active: true, message: "Upgrading the database." })).toBe("Upgrading the database.");
        expect(maintenanceLine({ active: true })).toMatch(/^ADX is down for scheduled maintenance\. /);
        expect(maintenanceLine({ active: true, until: "2026-09-26T21:30:00" })).toContain("until 9:30 PM");
    });

    it("prints the incident with its start, and keys it so the next one is seen", () => {
        const incident = { title: "Maps", message: "Maps are slow.", severity: "WARNING" as const, since: "2026-09-26T11:20:00" };
        expect(incidentLine(incident)).toBe("Maps are slow. Investigating since 11:20 AM.");
        expect(incidentLine({ ...incident, since: undefined })).toBe("Maps are slow.");
        expect(incidentKey(incident)).not.toBe(incidentKey({ ...incident, title: "Payments" }));
    });

    it("stamps how long ago the list was updated", () => {
        const now = new Date("2026-09-26T12:00:00Z");
        expect(updatedAgo("2026-09-26T11:59:40Z", now)).toBe("Updated just now");
        expect(updatedAgo("2026-09-26T11:58:00Z", now)).toBe("Updated 2 minutes ago");
        expect(updatedAgo("2026-09-26T11:00:00Z", now)).toBe("Updated 1 hour ago");
        expect(updatedAgo("2026-09-24T12:00:00Z", now)).toBe("Updated 2 days ago");
        expect(SERVICE_TONE.DEGRADED).toEqual({ label: "Degraded", tone: "warning" });
    });

    it("leaves the status page open during maintenance", () => {
        expect(isOpenDuringMaintenance("/status")).toBe(true);
        expect(isOpenDuringMaintenance("/statuses")).toBe(false);
        expect(isOpenDuringMaintenance("/advertiser")).toBe(false);
    });
});
