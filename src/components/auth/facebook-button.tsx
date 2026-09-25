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

const APP_ID = process.env.NEXT_PUBLIC_FACEBOOK_APP_ID;
const SDK_VERSION = "v21.0";

/** Whether Facebook sign-in is set up on this site — the button is drawn disabled otherwise. */
export const hasFacebookSignIn = !!APP_ID;

/**
 * FB-1: "Continue with Facebook". The JS SDK loads only when the app id is
 * set; `FB.login` asks for `email,public_profile`, and the access token it
 * answers is what `POST /auth/facebook` verifies. A person who closes
 * Facebook's dialog gets nothing — no error, no toast.
 */
export function FacebookButton({ onToken, disabled, children }: { onToken: (accessToken: string) => void | Promise<void>; disabled?: boolean; children: React.ReactNode }) {
    /* The SDK may already be on the page (a second visit to sign-in); otherwise `fbAsyncInit` says when it is. */
    const [ready, setReady] = React.useState(() => typeof window !== "undefined" && !!window.FB);
    const [busy, setBusy] = React.useState(false);

    React.useEffect(() => {
        if (!APP_ID) return;
        const init = () => window.FB?.init({ appId: APP_ID, version: SDK_VERSION, cookie: false, xfbml: false });
        /* The SDK calls `fbAsyncInit` once it has loaded — set before the script, in case it beats the effect. */
        window.fbAsyncInit = () => {
            init();
            setReady(true);
        };
        if (window.FB) init();
    }, []);

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
            {APP_ID && <Script src="https://connect.facebook.net/en_US/sdk.js" strategy="afterInteractive" crossOrigin="anonymous" />}
            <button
                type="button"
                onClick={login}
                disabled={!hasFacebookSignIn || !ready || disabled || busy}
                title={hasFacebookSignIn ? undefined : "Facebook sign-in is not available yet"}
                className="flex h-12 items-center justify-center gap-2 rounded-md border border-line bg-white text-sm font-medium text-ink hover:border-ink disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:border-line"
            >
                {children}
            </button>
        </>
    );
}
