"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ApiError, onSessionEnded, tokens } from "./api-client";
import { useCart } from "./cart";
import { authService, isSignupHandoff, normaliseEmail, normaliseMobile, type SendOtpResult, type SessionTokens, type SessionUser, type SignupHandoff } from "@/services/auth";
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
    /** ED-1: true while the signed-in account's email is still to prove (the stamp exists and is null). */
    needsEmail: boolean;
    sendOtp: (mobile: string) => Promise<SendOtpResult>;
    /** ED-1: `signupToken` ends an email sign-up — the proven address is written onto this number's account. */
    verifyOtp: (mobile: string, otp: string, signupToken?: string | null) => Promise<SessionUser>;
    sendEmailOtp: (email: string) => Promise<SendOtpResult>;
    /** ED-1: a known address signs in; a new one hands off to the phone step. */
    verifyEmailOtp: (email: string, otp: string) => Promise<{ kind: "signed-in"; user: SessionUser } | { kind: "signup"; signup: SignupHandoff }>;
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
        async (mobile: string, otp: string, signupToken?: string | null) => signInWithTokens(await authService.verifyOtp(normaliseMobile(mobile), otp, signupToken)),
        [signInWithTokens]
    );

    const sendEmailOtp = React.useCallback((email: string) => authService.sendEmailOtp(normaliseEmail(email)), []);

    const verifyEmailOtp = React.useCallback(
        async (email: string, otp: string) => {
            const result = await authService.verifyEmailOtp(normaliseEmail(email), otp);
            if (isSignupHandoff(result)) return { kind: "signup" as const, signup: result.signup };
            return { kind: "signed-in" as const, user: await signInWithTokens(result) };
        },
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
    const needsEmail = !!user && user.emailVerifiedAt === null;

    const value = React.useMemo<AuthValue>(
        () => ({ status, user, party, parties, cartCount: lines.length, needsEmail, sendOtp, verifyOtp, sendEmailOtp, verifyEmailOtp, signInWithTokens, chooseParty, setPreferredParty, signOut, refresh: read }),
        [status, user, party, parties, lines.length, needsEmail, sendOtp, verifyOtp, sendEmailOtp, verifyEmailOtp, signInWithTokens, chooseParty, setPreferredParty, signOut, read]
    );

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
    const value = React.useContext(AuthContext);
    if (!value) throw new Error("useAuth must be used inside AuthProvider");
    return value;
}

/**
 * Wraps a workspace: no session, to sign-in (and back here after); ED-1, an
 * email still to prove, to the email step (and back here after); a session
 * without the side the workspace needs, to the workspace chooser.
 */
export function RequireParty({ party: needed, children }: { party: Party; children: React.ReactNode }) {
    const { status, parties, needsEmail } = useAuth();
    const router = useRouter();

    React.useEffect(() => {
        if (status === "restoring") return;
        const next = window.location.pathname + window.location.search;
        if (status === "signed-out") {
            router.replace(`/sign-in?next=${encodeURIComponent(next)}`);
            return;
        }
        if (needsEmail) {
            router.replace(`/verify-email?next=${encodeURIComponent(next)}`);
            return;
        }
        if (!parties.includes(needed)) router.replace(`/choose-workspace?party=${needed}`);
    }, [status, parties, needed, needsEmail, router]);

    if (status !== "signed-in" || needsEmail || !parties.includes(needed)) {
        return (
            <div className="flex min-h-[60vh] items-center justify-center">
                <p className="text-sm text-dim">Checking your session…</p>
            </div>
        );
    }
    return <>{children}</>;
}
