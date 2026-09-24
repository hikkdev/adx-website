"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ApiError, onSessionEnded, tokens } from "./api-client";
import { useCart } from "./cart";
import { authService, normaliseMobile, type SendOtpResult, type SessionTokens, type SessionUser } from "@/services/auth";
import { partyService, type AccountType, type Party } from "@/services/party";

/**
 * The session on the web: the same account the apps and the console see.
 *
 * `status` is derived, never set: no stored token means signed out; a token
 * whose account has not been read yet means restoring; a read account means
 * signed in. So a page never bounces a signed-in visitor to sign-in on first
 * paint, and the server — which holds no token — renders every page as a
 * visitor. `party` is which side the account works on, read off the roles
 * the token carries; a new account has none until it chooses one on
 * `/choose-workspace`, the apps' first question after the first OTP.
 */
type Status = "restoring" | "signed-out" | "signed-in";

interface AuthValue {
    status: Status;
    user: SessionUser | null;
    party: Party | null;
    /** Both sides granted — an account that publishes and advertises. */
    parties: Party[];
    cartCount: number;
    sendOtp: (mobile: string) => Promise<SendOtpResult>;
    verifyOtp: (mobile: string, otp: string) => Promise<SessionUser>;
    signInWithTokens: (result: SessionTokens) => Promise<SessionUser>;
    chooseParty: (input: { party: Party; accountType: AccountType; name?: string }) => Promise<void>;
    setPreferredParty: (party: Party) => void;
    signOut: () => Promise<void>;
    refresh: () => Promise<SessionUser | null>;
}

const AuthContext = React.createContext<AuthValue | null>(null);

function partiesOf(user: SessionUser | null): Party[] {
    if (!user) return [];
    return (["ADVERTISER", "PUBLISHER"] as Party[]).filter((party) => user.roles.includes(party));
}

const PARTY_KEY = "adx.web.party";

const hasStoredSession = () => !!(tokens.access || tokens.refresh);
const noStoredSession = () => false;

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const router = useRouter();
    const hasSession = React.useSyncExternalStore(tokens.subscribe, hasStoredSession, noStoredSession);
    /** The account behind the stored token, once read; `checked` separates "not yet" from "none". */
    const [account, setAccount] = React.useState<{ user: SessionUser | null; checked: boolean }>({ user: null, checked: false });
    const [preferred, setPreferred] = React.useState<Party | null>(() => {
        if (typeof window === "undefined") return null;
        try {
            const saved = window.localStorage.getItem(PARTY_KEY);
            return saved === "ADVERTISER" || saved === "PUBLISHER" ? saved : null;
        } catch {
            return null;
        }
    });
    const { lines } = useCart();

    const read = React.useCallback(async (): Promise<SessionUser | null> => {
        try {
            const me = await authService.me();
            setAccount({ user: me, checked: true });
            return me;
        } catch (caught) {
            if (caught instanceof ApiError && caught.status === 401) {
                tokens.clear();
                setAccount({ user: null, checked: true });
                return null;
            }
            /* Unreachable backend: keep the token, say nothing yet; the next read tries again. */
            setAccount((current) => ({ ...current, checked: true }));
            return null;
        }
    }, []);

    React.useEffect(() => {
        if (!hasSession) return;
        let cancelled = false;
        void authService
            .me()
            .then((me) => {
                if (!cancelled) setAccount({ user: me, checked: true });
            })
            .catch((caught: unknown) => {
                if (cancelled) return;
                if (caught instanceof ApiError && caught.status === 401) tokens.clear();
                setAccount((current) => ({ ...current, checked: true }));
            });
        return () => {
            cancelled = true;
        };
    }, [hasSession]);

    React.useEffect(() => onSessionEnded(() => router.replace("/sign-in")), [router]);

    const signInWithTokens = React.useCallback(
        async (result: SessionTokens) => {
            tokens.set({ accessToken: result.accessToken, refreshToken: result.refreshToken });
            const me = (await read()) ?? result.user ?? null;
            if (!me) throw new ApiError(0, "NO_SESSION", "Signed in, but the account could not be read.");
            return me;
        },
        [read]
    );

    const sendOtp = React.useCallback((mobile: string) => authService.sendOtp(normaliseMobile(mobile)), []);

    const verifyOtp = React.useCallback(
        async (mobile: string, otp: string) => signInWithTokens(await authService.verifyOtp(normaliseMobile(mobile), otp)),
        [signInWithTokens]
    );

    const setPreferredParty = React.useCallback((party: Party) => {
        try {
            window.localStorage.setItem(PARTY_KEY, party);
        } catch {
            /* ignore */
        }
        setPreferred(party);
    }, []);

    const chooseParty = React.useCallback(
        async (input: { party: Party; accountType: AccountType; name?: string }) => {
            const choice = await partyService.choose(input);
            /* The role just granted rides on the re-signed token; adopt it so the next request carries it. */
            if (choice.accessToken) tokens.set({ accessToken: choice.accessToken });
            setPreferredParty(input.party);
            await read();
        },
        [read, setPreferredParty]
    );

    const signOut = React.useCallback(async () => {
        const refresh = tokens.refresh;
        try {
            if (refresh) await authService.logout(refresh);
        } catch {
            /* A dead refresh token is still a sign-out. */
        }
        tokens.clear();
        setAccount({ user: null, checked: false });
        router.push("/");
    }, [router]);

    const user = hasSession ? account.user : null;
    const status: Status = !hasSession ? "signed-out" : !account.checked ? "restoring" : user ? "signed-in" : "signed-out";
    const parties = partiesOf(user);
    const party = parties.length === 0 ? null : preferred && parties.includes(preferred) ? preferred : parties[0];

    const value = React.useMemo<AuthValue>(
        () => ({ status, user, party, parties, cartCount: lines.length, sendOtp, verifyOtp, signInWithTokens, chooseParty, setPreferredParty, signOut, refresh: read }),
        [status, user, party, parties, lines.length, sendOtp, verifyOtp, signInWithTokens, chooseParty, setPreferredParty, signOut, read]
    );

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
    const value = React.useContext(AuthContext);
    if (!value) throw new Error("useAuth must be used inside AuthProvider");
    return value;
}

/**
 * Wraps a workspace: no session, to sign-in (and back here after); a session
 * without the side the workspace needs, to the workspace chooser.
 */
export function RequireParty({ party: needed, children }: { party: Party; children: React.ReactNode }) {
    const { status, parties } = useAuth();
    const router = useRouter();

    React.useEffect(() => {
        if (status === "restoring") return;
        if (status === "signed-out") {
            const next = window.location.pathname + window.location.search;
            router.replace(`/sign-in?next=${encodeURIComponent(next)}`);
            return;
        }
        if (!parties.includes(needed)) router.replace(`/choose-workspace?party=${needed}`);
    }, [status, parties, needed, router]);

    if (status !== "signed-in" || !parties.includes(needed)) {
        return (
            <div className="flex min-h-[60vh] items-center justify-center">
                <p className="text-sm text-dim">Checking your session…</p>
            </div>
        );
    }
    return <>{children}</>;
}
