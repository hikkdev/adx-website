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

/** The site's own build-time id — the fallback when `GET /auth/providers` names none. */
export const GOOGLE_CLIENT_ID_FALLBACK = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? null;

/**
 * "Continue with Google" — Google Identity Services rendering its own
 * button, whose credential is the id token `POST /auth/google` verifies.
 * The web client id comes from `GET /auth/providers` (the env id as the
 * fallback); the sign-in card draws this only when there is one.
 */
export function GoogleButton({ clientId, onCredential }: { clientId: string; onCredential: (idToken: string) => void }) {
    const slot = React.useRef<HTMLDivElement>(null);
    const [ready, setReady] = React.useState(() => typeof window !== "undefined" && !!window.google);

    React.useEffect(() => {
        if (!ready || !clientId || !slot.current || !window.google) return;
        window.google.accounts.id.initialize({ client_id: clientId, callback: (response) => onCredential(response.credential) });
        window.google.accounts.id.renderButton(slot.current, { theme: "outline", size: "large", width: 449, text: "continue_with", shape: "rectangular" });
    }, [ready, clientId, onCredential]);

    return (
        <>
            <Script src="https://accounts.google.com/gsi/client" strategy="afterInteractive" onReady={() => setReady(true)} />
            <div ref={slot} className="flex min-h-[44px] justify-center" />
        </>
    );
}
