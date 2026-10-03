"use client";

import * as React from "react";
import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { apiConfig } from "@/lib/api-config";
import { messageOf } from "@/lib/api-client";
import { useAuth } from "@/lib/auth";
import { useSiteBrand } from "@/lib/brand";
import { accountIdLine, qrService, scanRoleFor, type PublicCode, type ScannedIdentity } from "@/services/party";

const PLAY_STORE = "https://play.google.com/store/search?q=ADX%20Keysquare&c=apps";

/** The actions only a field agent's scan answers — onboarding a party, or asking an onboarded one for access. */
const AGENT_ACTIONS = new Set(["REQUEST_ACCESS", "ONBOARD_PUBLISHER", "ONBOARD_ADVERTISER"]);

/**
 * The card a scanned code opens (QR-27). Anyone reads who the code belongs
 * to (`GET /qr/public/:token`, no session, no number); a phone with the app
 * installed is sent into it once (`adx://q/<token>`). Signed in, the scan is
 * resolved the way the app's `identity-screen.tsx` does (`POST /qr/resolve`
 * with the account's side — logged on the owner's access log like any scan),
 * which also names the account, so a publisher's code leads to their spaces.
 * An agent's doors — claiming an onboarding, asking for access — are the
 * ADX Agent app's. A retired or unknown code is a plain not-found.
 */
export function QrLanding({ token }: { token: string }) {
    const { status, parties } = useAuth();
    const brand = useSiteBrand();
    const [state, setState] = React.useState<{ kind: "loading" } | { kind: "found"; code: PublicCode } | { kind: "missing" }>({ kind: "loading" });
    const [resolved, setResolved] = React.useState<{ kind: "idle" } | { kind: "ok"; scan: ScannedIdentity } | { kind: "error"; message: string }>({ kind: "idle" });
    const appLink = `adx://q/${encodeURIComponent(token)}`;
    const role = scanRoleFor(parties);

    React.useEffect(() => {
        let cancelled = false;
        fetch(`${apiConfig.baseUrl}/qr/public/${encodeURIComponent(token)}`)
            .then((r) => (r.ok ? r.json() : Promise.reject(r)))
            .then((json: { data: PublicCode }) => {
                if (cancelled) return;
                setState({ kind: "found", code: json.data });
                document.title = `${json.data.name} — ${brand.platformName}`;
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
    }, [token, appLink, brand.platformName]);

    /* Signed in: resolve it as the app would, once per token and side. */
    React.useEffect(() => {
        if (status !== "signed-in" || state.kind !== "found") return;
        let cancelled = false;
        qrService
            .resolve(token, role)
            .then((scan) => {
                if (!cancelled) setResolved({ kind: "ok", scan });
            })
            .catch((caught: unknown) => {
                if (!cancelled) setResolved({ kind: "error", message: messageOf(caught, "Could not read this code for your account.") });
            });
        return () => {
            cancelled = true;
        };
    }, [status, state.kind, token, role]);

    const scan = resolved.kind === "ok" ? resolved.scan : null;
    const identity = scan?.identity ?? null;
    const code = state.kind === "found" ? state.code : null;
    const isPublisher = (identity?.type ?? code?.type) === "PUBLISHER" || scan?.type === "PUBLISHER";
    const verified = identity?.verified ?? code?.verified ?? false;

    return (
        <main className="mx-auto flex min-h-[70vh] max-w-[520px] flex-col items-center justify-center px-5 py-16 text-center">
            <div className="mb-4 inline-flex size-[72px] items-center justify-center rounded-full bg-[#f6f7f8]">
                <img src={brand.markUrl} alt="" width={34} height={40} />
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
                    <Link href="/" className="mt-6 inline-block rounded bg-brand px-6 py-2.5 text-sm font-medium text-white">
                        Go to adx.in
                    </Link>
                </>
            )}
            {code && (
                <>
                    <p className="text-sm font-medium text-dim">{isPublisher ? "A space owner on ADX" : "An advertiser on ADX"}</p>
                    <h1 className="mt-1 flex items-center justify-center gap-2 text-[28px] font-semibold text-ink">
                        {identity?.name ?? code.name}
                        {verified && <CheckCircle2 className="size-5 text-success" aria-label="Verified by ADX" />}
                    </h1>
                    <p className="mt-1.5 text-dim">
                        {[accountIdLine(isPublisher ? "PUBLISHER" : "ADVERTISER", identity?.displayId ?? code.displayId), identity?.city ?? code.city].filter(Boolean).join(" · ")}
                        {verified && <span className="font-semibold text-success"> · Verified by ADX</span>}
                    </p>
                    <p className="mt-3.5 text-dim">
                        {isPublisher
                            ? verified
                                ? "Identity verified by ADX. Their advertising spaces are listed and bookable on ADX."
                                : "Their spaces are listed on ADX; the identity check is still pending, so they are shown as unverified."
                            : verified
                              ? "Identity verified by ADX."
                              : "On ADX; the identity check is still pending."}
                    </p>

                    {scan && AGENT_ACTIONS.has(scan.action) && <p className="mt-4 rounded-md bg-ground px-4 py-3 text-sm text-dim">Onboarding this account or asking it for access is done in the ADX Agent app, where the scan is placed on the map.</p>}
                    {resolved.kind === "error" && <p className="mt-4 text-sm text-dim">{resolved.message}</p>}

                    <div className="mt-6 flex flex-wrap justify-center gap-2">
                        {status === "signed-in" && isPublisher && identity?.id && (
                            <Link href={`/spaces?publisherId=${encodeURIComponent(identity.id)}`} className="rounded bg-brand px-[22px] py-3 text-sm font-semibold text-white hover:bg-[#a51b1b]" data-testid="qr-see-spaces">
                                See this publisher&apos;s spaces
                            </Link>
                        )}
                        {status !== "signed-in" && isPublisher && (
                            <Link href={`/sign-in?next=${encodeURIComponent(`/q/${token}`)}`} className="rounded bg-brand px-[22px] py-3 text-sm font-semibold text-white hover:bg-[#a51b1b]">
                                Sign in to see their spaces
                            </Link>
                        )}
                        <a href={appLink} className="rounded border border-line bg-white px-[22px] py-3 text-sm font-semibold text-ink hover:border-ink">
                            Open in the ADX app
                        </a>
                        {status !== "signed-in" && (
                            <a href={PLAY_STORE} className="rounded border border-line bg-white px-[22px] py-3 text-sm font-semibold text-ink hover:border-ink">
                                Get the app
                            </a>
                        )}
                    </div>
                </>
            )}
        </main>
    );
}
