"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ApiError, onSessionEnded, tokens } from "./api-client";
import { useCart } from "./cart";
import { authService, isChallenge, isSignupHandoff, normaliseEmail, normaliseMobile, pendingChallenge, workspaceOwes, type DoorResult, type SendOtpResult, type SessionTokens, type SessionUser, type SignupHandoff, type TwoFactorChallenge } from "@/services/auth";
import { partyService, ROLE_OF, type AccountType, type Party } from "@/services/party";

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
export type Status = "restoring" | "signed-out" | "signed-in";

/**
 * What a sign-in door came to: a session; ED-1's hand-off to the phone
 * step (a new address); or 2FA-A's challenge, remembered in this tab for
 * `/verify-2fa` to finish.
 */
export type DoorOutcome = { kind: "signed-in"; user: SessionUser } | { kind: "signup"; signup: SignupHandoff } | { kind: "challenge"; challenge: TwoFactorChallenge };

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
    /** ED-1: `signupToken` ends an email sign-up — the proven address is written onto this number's account. 2FA-A: may come to a challenge. */
    verifyOtp: (mobile: string, otp: string, signupToken?: string | null) => Promise<DoorOutcome>;
    sendEmailOtp: (email: string) => Promise<SendOtpResult>;
    /** ED-1: a known address signs in; a new one hands off to the phone step. */
    verifyEmailOtp: (email: string, otp: string) => Promise<DoorOutcome>;
    /** G-2: Google's id token through `POST /auth/google`. */
    google: (idToken: string) => Promise<DoorOutcome>;
    /** FB-1: Facebook's access token through `POST /auth/facebook`. */
    facebook: (accessToken: string) => Promise<DoorOutcome>;
    /** 2FA-A: the app's code (or a recovery code) against the remembered challenge. */
    completeChallenge: (challengeToken: string, code: string) => Promise<{ user: SessionUser; recoveryCodesLeft?: number; warning?: string | null }>;
    signInWithTokens: (result: SessionTokens) => Promise<SessionUser>;
    chooseParty: (input: { party: Party; accountType: AccountType; name?: string }) => Promise<void>;
    setPreferredParty: (party: Party) => void;
    signOut: () => Promise<void>;
    refresh: () => Promise<SessionUser | null>;
}

const AuthContext = React.createContext<AuthValue | null>(null);

function partiesOf(user: SessionUser | null): Party[] {
    if (!user) return [];
    // PP-W: a print partner's role is PARTNER.
    return (["ADVERTISER", "PUBLISHER", "PRINT_PARTNER"] as Party[]).filter((party) => user.roles.includes(ROLE_OF[party]));
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

    /** One rule for every door: a hand-off and a challenge are handed back; tokens become the session. */
    const settleDoor = React.useCallback(
        async (result: DoorResult): Promise<DoorOutcome> => {
            if (isSignupHandoff(result)) return { kind: "signup", signup: result.signup };
            if (isChallenge(result)) {
                pendingChallenge.remember(result.challenge);
                return { kind: "challenge", challenge: result.challenge };
            }
            return { kind: "signed-in", user: await signInWithTokens(result) };
        },
        [signInWithTokens]
    );

    const verifyOtp = React.useCallback(
        async (mobile: string, otp: string, signupToken?: string | null) => settleDoor(await authService.verifyOtp(normaliseMobile(mobile), otp, signupToken)),
        [settleDoor]
    );

    const sendEmailOtp = React.useCallback((email: string) => authService.sendEmailOtp(normaliseEmail(email)), []);

    const verifyEmailOtp = React.useCallback(async (email: string, otp: string) => settleDoor(await authService.verifyEmailOtp(normaliseEmail(email), otp)), [settleDoor]);

    const google = React.useCallback(async (idToken: string) => settleDoor(await authService.google(idToken)), [settleDoor]);

    const facebook = React.useCallback(async (accessToken: string) => settleDoor(await authService.facebook(accessToken)), [settleDoor]);

    const completeChallenge = React.useCallback(
        async (challengeToken: string, code: string) => {
            const result = await authService.verifyTwoFactor(challengeToken, code);
            pendingChallenge.clear();
            const user = await signInWithTokens(result);
            return { user, recoveryCodesLeft: result.recoveryCodesLeft, warning: result.warning };
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
        () => ({ status, user, party, parties, cartCount: lines.length, needsEmail, sendOtp, verifyOtp, sendEmailOtp, verifyEmailOtp, google, facebook, completeChallenge, signInWithTokens, chooseParty, setPreferredParty, signOut, refresh: read }),
        [status, user, party, parties, lines.length, needsEmail, sendOtp, verifyOtp, sendEmailOtp, verifyEmailOtp, google, facebook, completeChallenge, signInWithTokens, chooseParty, setPreferredParty, signOut, read]
    );

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
    const value = React.useContext(AuthContext);
    if (!value) throw new Error("useAuth must be used inside AuthProvider");
    return value;
}

/**
 * The session where there is one; null outside an AuthProvider (a screen
 * drawn on its own, as in a test). For parts that read the signed-in person
 * when they can — the order age gate — and still work without one.
 */
export function useOptionalAuth(): AuthValue | null {
    return React.useContext(AuthContext);
}

/** What a workspace does with this visitor: draws, waits for the session to be read, or sends them on. */
export type WorkspaceGate = { kind: "draw" } | { kind: "wait" } | { kind: "go"; href: string };

/**
 * The workspace's door, in order: no session, to sign-in; ED-1, an email
 * still to prove, to the email step; a session without the side the
 * workspace needs, to the workspace chooser (a print partner's, to its
 * application). Then (29 Sep 2026) what the chooser asks once and never
 * again: QR-6's consent — a legal step, so no workspace opens without it —
 * and QR-22's basics, the two names, which the basics step opens
 * prefilled. The date of birth is not among them (29 Sep 2026): it is asked
 * only when an order is placed. `here` is where to come back to afterwards.
 */
export function workspaceGate(session: { status: Status; user: SessionUser | null; parties: Party[]; needsEmail: boolean }, needed: Party, here: string): WorkspaceGate {
    if (session.status === "restoring") return { kind: "wait" };
    const back = encodeURIComponent(here);
    if (session.status === "signed-out" || !session.user) return { kind: "go", href: `/sign-in?next=${back}` };
    if (session.needsEmail) return { kind: "go", href: `/verify-email?next=${back}` };
    if (!session.parties.includes(needed)) return { kind: "go", href: needed === "PRINT_PARTNER" ? "/partner/apply" : `/choose-workspace?party=${needed}` };
    if (workspaceOwes(session.user, needed)) return { kind: "go", href: `/choose-workspace?next=${back}` };
    return { kind: "draw" };
}

/** Wraps a workspace: draws it only once `workspaceGate` says so, and sends the visitor on when it says where. */
export function RequireParty({ party: needed, children }: { party: Party; children: React.ReactNode }) {
    const { status, user, parties, needsEmail } = useAuth();
    const router = useRouter();

    React.useEffect(() => {
        const gate = workspaceGate({ status, user, parties, needsEmail }, needed, window.location.pathname + window.location.search);
        if (gate.kind === "go") router.replace(gate.href);
    }, [status, user, parties, needed, needsEmail, router]);

    if (workspaceGate({ status, user, parties, needsEmail }, needed, "").kind !== "draw") {
        return (
            <div className="flex min-h-[60vh] items-center justify-center">
                <p className="text-sm text-dim">Checking your session…</p>
            </div>
        );
    }
    return <>{children}</>;
}
