"use client";

import * as React from "react";
import type { LocateFailure } from "@/services/browse";

export type Fix = { latitude: number; longitude: number };

/**
 * The browser's own position — the web's `currentPosition()`. Asked only
 * when the person presses "Near me" (never on page load), with a coarse fix
 * allowed: a browse around a point needs the neighbourhood, not the doorstep.
 */
export function locate(timeoutMs = 12_000): Promise<Fix> {
    return new Promise((resolve, reject: (failure: LocateFailure) => void) => {
        if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
            reject("unsupported");
            return;
        }
        navigator.geolocation.getCurrentPosition(
            (position) => resolve({ latitude: position.coords.latitude, longitude: position.coords.longitude }),
            (error) => reject(error.code === error.PERMISSION_DENIED ? "denied" : error.code === error.TIMEOUT ? "timeout" : "unavailable"),
            { enableHighAccuracy: false, maximumAge: 5 * 60_000, timeout: timeoutMs }
        );
    });
}

/** "Near me" as a button's state: idle, asking, or the reason it failed. */
export function useNearMe(onFix: (fix: Fix) => void) {
    const [state, setState] = React.useState<{ kind: "idle" } | { kind: "asking" } | { kind: "failed"; failure: LocateFailure }>({ kind: "idle" });
    const ask = React.useCallback(() => {
        setState({ kind: "asking" });
        locate()
            .then((fix) => {
                setState({ kind: "idle" });
                onFix(fix);
            })
            .catch((failure: LocateFailure) => setState({ kind: "failed", failure }));
    }, [onFix]);
    const dismiss = React.useCallback(() => setState({ kind: "idle" }), []);
    return { state, ask, dismiss };
}
