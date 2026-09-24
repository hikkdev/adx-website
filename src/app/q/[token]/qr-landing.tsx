"use client";

import * as React from "react";
import Link from "next/link";
import { apiConfig } from "@/lib/api-config";

interface PublicCode {
    type: "PUBLISHER" | "ADVERTISER";
    name: string;
    displayId: string | null;
    city: string | null;
    verified: boolean;
}

const PLAY_STORE = "https://play.google.com/store/search?q=ADX%20Keysquare&c=apps";

/**
 * The card a scanned code opens. A phone with the app installed is sent
 * into it once (`adx://q/<token>`, the scheme both apps declare); everyone
 * else reads who the code belongs to and gets the store link. A retired or
 * unknown code is a plain not-found.
 */
export function QrLanding({ token }: { token: string }) {
    const [state, setState] = React.useState<{ kind: "loading" } | { kind: "found"; code: PublicCode } | { kind: "missing" }>({ kind: "loading" });
    const appLink = `adx://q/${encodeURIComponent(token)}`;

    React.useEffect(() => {
        let cancelled = false;
        fetch(`${apiConfig.baseUrl}/qr/public/${encodeURIComponent(token)}`)
            .then((r) => (r.ok ? r.json() : Promise.reject(r)))
            .then((json: { data: PublicCode }) => {
                if (cancelled) return;
                setState({ kind: "found", code: json.data });
                document.title = `${json.data.name} — ADX`;
                if (/Android|iPhone|iPad/i.test(navigator.userAgent)) {
                    setTimeout(() => {
                        window.location.href = appLink;
                    }, 400);
                }
            })
            .catch(() => {
                if (!cancelled) setState({ kind: "missing" });
            });
        return () => {
            cancelled = true;
        };
    }, [token, appLink]);

    return (
        <main className="mx-auto flex min-h-[70vh] max-w-[520px] flex-col items-center justify-center px-5 py-16 text-center">
            <div className="mb-4 inline-flex size-[72px] items-center justify-center rounded-full bg-[#f6f7f8]">
                <img src="/brand/adx-mark-red.svg" alt="" width={34} height={40} />
            </div>
            {state.kind === "loading" && (
                <>
                    <h1 className="text-[28px] font-semibold text-ink">One moment…</h1>
                    <p className="mt-1.5 text-dim">Reading this code.</p>
                </>
            )}
            {state.kind === "missing" && (
                <>
                    <h1 className="text-[28px] font-semibold text-ink">Nothing here</h1>
                    <p className="mt-1.5 text-dim">That page does not exist, or the code has been retired.</p>
                    <Link href="/" className="mt-6 inline-block rounded-[10px] bg-[#e40209] px-[22px] py-3 font-semibold text-white">
                        Go to adx.in
                    </Link>
                </>
            )}
            {state.kind === "found" && (
                <>
                    <h1 className="text-[28px] font-semibold text-ink">{state.code.name}</h1>
                    <p className="mt-1.5 text-dim">
                        {[state.code.displayId, state.code.city].filter(Boolean).join(" · ")}
                        {state.code.verified && <span className="font-semibold text-[#16a34a]"> · Verified by ADX</span>}
                    </p>
                    <p className="mt-3.5 text-dim">
                        {state.code.type === "PUBLISHER"
                            ? "A space owner on ADX. Their advertising spaces are listed and bookable in the ADX app — open the app to see them, or install it to start."
                            : "An advertiser on ADX."}
                    </p>
                    <div className="mt-6 flex flex-wrap justify-center gap-2">
                        <a href={appLink} className="rounded-[10px] bg-[#e40209] px-[22px] py-3 font-semibold text-white">
                            Open in the ADX app
                        </a>
                        <a href={PLAY_STORE} className="rounded-[10px] border border-line bg-white px-[22px] py-3 font-semibold text-ink">
                            Get the app
                        </a>
                    </div>
                </>
            )}
        </main>
    );
}
