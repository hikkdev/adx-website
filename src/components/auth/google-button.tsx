"use client";

import * as React from "react";
import Script from "next/script";

declare global {
    interface Window {
        google?: {
            accounts: {
                id: {
                    initialize: (config: { client_id: string; callback: (response: { credential: string }) => void }) => void;
                    renderButton: (parent: HTMLElement, options: Record<string, unknown>) => void;
                };
            };
        };
    }
}

const CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

/** Whether a Google button will be drawn at all — the sign-in card hides its "Or continue with" rule otherwise. */
export const hasGoogleSignIn = !!CLIENT_ID;

/**
 * "Continue with Google" — Google Identity Services rendering its own
 * button, whose credential is the id token `POST /auth/google` verifies. It
 * needs the web client id; without one the button is simply not drawn, so a
 * deployment that has not set it up shows nothing broken.
 */
export function GoogleButton({ onCredential }: { onCredential: (idToken: string) => void }) {
    const slot = React.useRef<HTMLDivElement>(null);
    const [ready, setReady] = React.useState(false);

    React.useEffect(() => {
        if (!ready || !CLIENT_ID || !slot.current || !window.google) return;
        window.google.accounts.id.initialize({ client_id: CLIENT_ID, callback: (response) => onCredential(response.credential) });
        window.google.accounts.id.renderButton(slot.current, { theme: "outline", size: "large", width: 449, text: "continue_with", shape: "rectangular" });
    }, [ready, onCredential]);

    if (!CLIENT_ID) return null;

    return (
        <>
            <Script src="https://accounts.google.com/gsi/client" strategy="afterInteractive" onReady={() => setReady(true)} />
            <div ref={slot} className="flex min-h-[44px] justify-center" />
        </>
    );
}
