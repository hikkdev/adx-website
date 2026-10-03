"use client";

import * as React from "react";
import { ApiError } from "./api-client";
import { permissionsOf } from "./jwt";
import { onStudioSessionEnded, parseHandoff, studioConfig, studioService, studioTokens, type StudioUser } from "@/services/studio";

/**
 * ST-1 (27 Sep 2026): Studio's session — separate from the party session.
 *
 * The console opens `${SITE}/studio/pages/<key>#token=…&refresh=…`. The
 * fragment is read once, cleared from the address bar at once, and the
 * pair is kept in sessionStorage under Studio's own keys (`services/studio`)
 * — never beside the advertiser's or publisher's tokens in `lib/auth.tsx`,
 * so an admin laying out the home page and a signed-in publisher in the
 * next tab never collide. The account is verified with the same `GET
 * /users/me` the console uses; role ADMIN is required; the permissions ride
 * on the token's `perms` claim exactly as the console reads them.
 */
export type StudioStatus = "restoring" | "signed-out" | "not-admin" | "signed-in";

export interface StudioAuthValue {
    status: StudioStatus;
    user: StudioUser | null;
    permissions: string[];
    /** Whether this session holds a permission id — `content.edit`, `content.approve`, `content.delete`, `content.addresses`. */
    can: (permissionId: string) => boolean;
    /** Lot K2: the token says an authenticator app must be set up first; the backend refuses every route until it is. */
    mustEnrolAuthenticator: boolean;
    signOut: () => void;
    consoleUrl: string;
}

const StudioAuthContext = React.createContext<StudioAuthValue | null>(null);

/** Drops the fragment from the address bar without a navigation — the tokens never sit in history. */
export function clearHandoffFragment(): void {
    if (typeof window === "undefined" || !window.location.hash) return;
    try {
        window.history.replaceState(window.history.state, "", window.location.pathname + window.location.search);
    } catch {
        /* A locked-down browser: the fragment stays, which only means it is re-read on reload. */
    }
}

/** Reads the console's hand-off off the current address, stores it, and clears it. True when there was one. */
export function takeHandoff(): boolean {
    if (typeof window === "undefined") return false;
    const handoff = parseHandoff(window.location.hash);
    if (!handoff) return false;
    studioTokens.set(handoff);
    clearHandoffFragment();
    return true;
}

/**
 * Whether the hand-off has been looked for on this load. An external store
 * rather than component state, so the provider marks it from its mount
 * effect (an external-system sync, not a render-time setState) and the
 * status reads "restoring" until then — the console card never flashes.
 */
const handoffStore = (() => {
    let checked = false;
    const listeners = new Set<() => void>();
    return {
        subscribe(listener: () => void) {
            listeners.add(listener);
            return () => {
                listeners.delete(listener);
            };
        },
        get checked() {
            return checked;
        },
        mark() {
            if (checked) return;
            checked = true;
            listeners.forEach((listener) => listener());
        },
        reset() {
            checked = false;
        },
    };
})();

/** For tests: forget that the hand-off was looked for. */
export const resetHandoffCheck = () => handoffStore.reset();

const hasStoredSession = () => !!(studioTokens.access || studioTokens.refresh);
const noStoredSession = () => false;
const readPermissions = () => studioTokens.access;

export function StudioAuthProvider({ children }: { children: React.ReactNode }) {
    /* The hand-off is read on mount, before the first "me": until then the status is "restoring". */
    const handoffChecked = React.useSyncExternalStore(handoffStore.subscribe, () => handoffStore.checked, () => false);
    const hasSession = React.useSyncExternalStore(studioTokens.subscribe, hasStoredSession, noStoredSession);
    const accessToken = React.useSyncExternalStore(studioTokens.subscribe, readPermissions, () => null);
    const [account, setAccount] = React.useState<{ user: StudioUser | null; checked: boolean; token: string | null }>({ user: null, checked: false, token: null });

    React.useEffect(() => {
        takeHandoff();
        handoffStore.mark();
    }, []);

    React.useEffect(() => {
        if (!handoffChecked || !hasSession) return;
        let cancelled = false;
        const token = studioTokens.access;
        studioService
            .me()
            .then((me) => {
                if (!cancelled) setAccount({ user: me, checked: true, token });
            })
            .catch((caught: unknown) => {
                if (cancelled) return;
                if (caught instanceof ApiError && caught.status === 401) studioTokens.clear();
                setAccount({ user: null, checked: true, token });
            });
        return () => {
            cancelled = true;
        };
    }, [handoffChecked, hasSession]);

    React.useEffect(() => onStudioSessionEnded(() => setAccount({ user: null, checked: true, token: null })), []);

    const signOut = React.useCallback(() => {
        studioTokens.clear();
        setAccount({ user: null, checked: true, token: null });
    }, []);

    const permissions = React.useMemo(() => permissionsOf(accessToken), [accessToken]);
    const can = React.useCallback((permissionId: string) => permissions.includes(permissionId), [permissions]);
    const mustEnrolAuthenticator = React.useMemo(() => {
        try {
            const payload = accessToken?.split(".")[1];
            if (!payload) return false;
            const json = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/"))) as { mustEnrolAuthenticator?: unknown };
            return json.mustEnrolAuthenticator === true;
        } catch {
            return false;
        }
    }, [accessToken]);

    const user = hasSession ? account.user : null;
    const isAdmin = !!user && Array.isArray(user.roles) && user.roles.includes("ADMIN");
    const status: StudioStatus = !handoffChecked ? "restoring" : !hasSession ? "signed-out" : !account.checked ? "restoring" : !user ? "signed-out" : isAdmin ? "signed-in" : "not-admin";

    const value = React.useMemo<StudioAuthValue>(
        () => ({ status, user, permissions, can, mustEnrolAuthenticator, signOut, consoleUrl: studioConfig.consoleUrl }),
        [status, user, permissions, can, mustEnrolAuthenticator, signOut]
    );

    return <StudioAuthContext.Provider value={value}>{children}</StudioAuthContext.Provider>;
}

export function useStudioAuth(): StudioAuthValue {
    const value = React.useContext(StudioAuthContext);
    if (!value) throw new Error("useStudioAuth must be used inside StudioAuthProvider");
    return value;
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <div className="flex min-h-[70vh] items-center justify-center px-5 py-16">
            <div className="w-full max-w-[440px] rounded-2xl border border-line bg-white p-8 text-center shadow-card">
                <p className="text-xs font-semibold uppercase tracking-wide text-brand">ADX Studio</p>
                <h1 className="mt-2 text-[22px] font-semibold tracking-tight text-ink">{title}</h1>
                <div className="mt-2 text-sm text-dim">{children}</div>
            </div>
        </div>
    );
}

/**
 * Wraps Studio: no session — a page saying where Studio is opened from;
 * a session without the ADMIN role — a page saying so; otherwise the tool.
 */
export function RequireStudio({ children }: { children: React.ReactNode }) {
    const { status, user, consoleUrl, mustEnrolAuthenticator, signOut } = useStudioAuth();
    const contentUrl = `${consoleUrl}/content`;

    if (status === "restoring") {
        return (
            <div className="flex min-h-[60vh] items-center justify-center">
                <p className="text-sm text-dim">Checking your session…</p>
            </div>
        );
    }
    if (status === "signed-out") {
        return (
            <Card title="Open Studio from the console">
                <p>Studio takes its session from the console — open a page from Content › Pages and it opens here, signed in.</p>
                <a href={contentUrl} className="mt-6 inline-flex h-10 items-center rounded-md bg-brand px-5 text-sm font-medium text-white hover:bg-brand/90" data-testid="studio-open-console">
                    Go to the console
                </a>
            </Card>
        );
    }
    if (status === "not-admin") {
        return (
            <Card title="This account is not an admin">
                <p>
                    Studio is for console admins. {user?.email ? `${user.email} ` : "This account "}does not hold the ADMIN role.
                </p>
                <button type="button" onClick={signOut} className="mt-6 inline-flex h-10 items-center rounded-md border border-line bg-white px-5 text-sm font-medium text-ink hover:bg-ground">
                    Forget this session
                </button>
            </Card>
        );
    }
    if (mustEnrolAuthenticator) {
        return (
            <Card title="Finish setting up your authenticator">
                <p>The platform requires an authenticator app of every admin; the console holds you at that step until it is done, and so does Studio.</p>
                <a href={consoleUrl} className="mt-6 inline-flex h-10 items-center rounded-md bg-brand px-5 text-sm font-medium text-white hover:bg-brand/90">
                    Open the console
                </a>
            </Card>
        );
    }
    return <>{children}</>;
}
