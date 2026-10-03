"use client";

import * as React from "react";
import { appStatusService, parseAppStatus, type AppStatus } from "@/services/app-status";

/**
 * The platform's status for every page — `GET /app/status`, read once when
 * the site opens and again whenever the tab comes back to the front, the
 * apps' rhythm (`app-banners.tsx`): no timer, because a poll from every open
 * tab costs ADX something and tells the reader nothing they would see
 * before they next look. A read that fails is "nothing to say", never
 * "down" — a network blip must not wall off a site that works.
 */
interface AppStatusValue {
    status: AppStatus | null;
    /** True once the first read has settled either way. */
    checked: boolean;
    recheck: () => Promise<void>;
}

const AppStatusContext = React.createContext<AppStatusValue>({ status: null, checked: false, recheck: async () => undefined });

export function AppStatusProvider({ children }: { children: React.ReactNode }) {
    const [status, setStatus] = React.useState<AppStatus | null>(null);
    const [checked, setChecked] = React.useState(false);

    const recheck = React.useCallback(async () => {
        try {
            setStatus(parseAppStatus(await appStatusService.read()));
        } catch {
            setStatus(null);
        } finally {
            setChecked(true);
        }
    }, []);

    React.useEffect(() => {
        let cancelled = false;
        appStatusService
            .read()
            .then((raw) => {
                if (!cancelled) setStatus(parseAppStatus(raw));
            })
            .catch(() => {
                if (!cancelled) setStatus(null);
            })
            .finally(() => {
                if (!cancelled) setChecked(true);
            });
        const onVisible = () => {
            if (document.visibilityState === "visible") void recheck();
        };
        document.addEventListener("visibilitychange", onVisible);
        return () => {
            cancelled = true;
            document.removeEventListener("visibilitychange", onVisible);
        };
    }, [recheck]);

    const value = React.useMemo(() => ({ status, checked, recheck }), [status, checked, recheck]);
    return <AppStatusContext.Provider value={value}>{children}</AppStatusContext.Provider>;
}

export function useAppStatus(): AppStatusValue {
    return React.useContext(AppStatusContext);
}
