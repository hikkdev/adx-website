"use client";

import * as React from "react";
import Script from "next/script";

declare global {
    interface Window {
        FB?: {
            init: (config: { appId: string; version: string; cookie?: boolean; xfbml?: boolean }) => void;
            login: (callback: (response: FacebookLoginResponse) => void, options?: { scope: string }) => void;
        };
        fbAsyncInit?: () => void;
    }
}

interface FacebookLoginResponse {
    status: "connected" | "not_authorized" | "unknown";
    authResponse?: { accessToken: string; userID: string; expiresIn: number };
}

/** The site's own build-time id — the fallback when `GET /auth/providers` names none. */
export const FACEBOOK_APP_ID_FALLBACK = process.env.NEXT_PUBLIC_FACEBOOK_APP_ID ?? null;
const SDK_VERSION = "v21.0";

/**
 * FB-1: "Continue with Facebook". The app id comes from `GET /auth/providers`
 * (the env id as the fallback); the sign-in card draws this only when there
 * is one. `FB.login` asks for `email,public_profile`, and the access token it
 * answers is what `POST /auth/facebook` verifies. A person who closes
 * Facebook's dialog gets nothing — no error, no toast.
 */
export function FacebookButton({ appId, onToken, disabled, children }: { appId: string; onToken: (accessToken: string) => void | Promise<void>; disabled?: boolean; children: React.ReactNode }) {
    /* The SDK may already be on the page (a second visit to sign-in); otherwise `fbAsyncInit` says when it is. */
    const [ready, setReady] = React.useState(() => typeof window !== "undefined" && !!window.FB);
    const [busy, setBusy] = React.useState(false);

    React.useEffect(() => {
        if (!appId) return;
        const init = () => window.FB?.init({ appId, version: SDK_VERSION, cookie: false, xfbml: false });
        /* The SDK calls `fbAsyncInit` once it has loaded — set before the script, in case it beats the effect. */
        window.fbAsyncInit = () => {
            init();
            setReady(true);
        };
        if (window.FB) init();
    }, [appId]);

    const login = () => {
        if (!window.FB || busy) return;
        setBusy(true);
        window.FB.login(
            (response) => {
                if (response.status !== "connected" || !response.authResponse?.accessToken) {
                    setBusy(false);
                    return;
                }
                void Promise.resolve(onToken(response.authResponse.accessToken)).finally(() => setBusy(false));
            },
            { scope: "email,public_profile" }
        );
    };

    return (
        <>
            <Script src="https://connect.facebook.net/en_US/sdk.js" strategy="afterInteractive" crossOrigin="anonymous" />
            <button
                type="button"
                onClick={login}
                disabled={!ready || disabled || busy}
                className="flex h-12 items-center justify-center gap-2 rounded-md border border-line bg-white text-sm font-medium text-ink hover:border-ink disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:border-line"
            >
                {children}
            </button>
        </>
    );
}
