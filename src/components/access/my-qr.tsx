"use client";

import * as React from "react";
import { Camera, CheckCircle2, Search, UserCheck } from "lucide-react";
import { messageOf } from "@/lib/api-client";
import { btnOutline, btnPrimary, btnSmall } from "@/components/advertiser/bits";
import { accessService, askSentence, distanceLine, grantedSentence, POLL_MS, qrImageUrl, qrShareLink, shareText, type AccessParty, type OnboardingQr, type PendingScan, type QrStatus } from "@/services/access";
import { initialsOf, saveFile } from "@/services/account";
import { accountIdLine } from "@/services/party";

/** The page's fix, only when the person already let this site read it — the code is never held back for want of one. */
async function quietPosition(): Promise<{ latitude: number; longitude: number } | null> {
    if (typeof navigator === "undefined" || !navigator.geolocation || !navigator.permissions) return null;
    try {
        const state = await navigator.permissions.query({ name: "geolocation" as PermissionName });
        if (state.state !== "granted") return null;
        return await new Promise((resolve) => {
            navigator.geolocation.getCurrentPosition(
                (position) => resolve({ latitude: position.coords.latitude, longitude: position.coords.longitude }),
                () => resolve(null),
                { timeout: 5000, maximumAge: 60_000 }
            );
        });
    } catch {
        return null;
    }
}

const USES: Record<AccessParty, { icon: typeof UserCheck; title: string; body: string }[]> = {
    PUBLISHER: [
        { icon: UserCheck, title: "An ADX agent scans it", body: "You see their name here and approve them before they can help with your spaces or your details." },
        { icon: Search, title: "An advertiser scans it", body: "They open your profile and the spaces you have live." },
        { icon: Camera, title: "Anyone with a phone camera", body: "Lands on your page on adx.in — safe to print on a window or a card." },
    ],
    ADVERTISER: [
        { icon: UserCheck, title: "An ADX agent scans it", body: "You see their name here and approve them before they can help with your account." },
        { icon: Search, title: "A publisher scans it", body: "They see who you are on ADX." },
        { icon: Camera, title: "Anyone with a phone camera", body: "Lands on your page on adx.in." },
    ],
};

/**
 * QR-27 on the web: the account's own code. While this card is open the page
 * asks every three seconds whether somebody scanned it, and shows who —
 * name, ADX id, photo, distance and what they asked for — before anything
 * changes. Nothing changes without a click here.
 */
export function MyQrPanel({ party, onDecided }: { party: AccessParty; onDecided?: () => void }) {
    const [qr, setQr] = React.useState<OnboardingQr | null>(null);
    const [status, setStatus] = React.useState<QrStatus | null>(null);
    const [granted, setGranted] = React.useState<{ title: string; body: string } | null>(null);
    const [notice, setNotice] = React.useState<string | null>(null);
    const [busy, setBusy] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);
    const [copied, setCopied] = React.useState(false);
    const [attempt, setAttempt] = React.useState(0);

    React.useEffect(() => {
        let cancelled = false;
        void (async () => {
            try {
                const position = await quietPosition();
                const code = await accessService.qr(party, position);
                if (!cancelled) {
                    setQr(code);
                    setError(null);
                }
            } catch (caught) {
                if (!cancelled) setError(messageOf(caught, "Could not load your code."));
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [party, attempt]);

    /* Polls while the code is on screen and nobody has decided yet; a failed tick is the next tick's problem. */
    React.useEffect(() => {
        if (!qr || granted) return;
        let active = true;
        const tick = async () => {
            if (document.visibilityState !== "visible") return;
            try {
                const next = await accessService.status(party);
                if (active) setStatus(next);
            } catch {
                /* retried on the next tick */
            }
        };
        void tick();
        const id = window.setInterval(() => void tick(), POLL_MS);
        return () => {
            active = false;
            window.clearInterval(id);
        };
    }, [party, qr, granted]);

    const decide = async (pending: PendingScan, decision: "approve" | "decline") => {
        setBusy(true);
        setError(null);
        try {
            const result = await accessService.decide(party, pending.scanId, decision);
            if (result.outcome === "GRANTED") setGranted(grantedSentence(pending, party));
            else setNotice("You declined. Nothing was changed.");
            setStatus(null);
            onDecided?.();
        } catch (caught) {
            setError(messageOf(caught, "Could not record your answer."));
            setStatus(null);
        } finally {
            setBusy(false);
        }
    };

    const displayId = status?.displayId ?? null;
    const link = qr ? qrShareLink(qr.token) : null;

    const copy = async () => {
        if (!link) return;
        try {
            await navigator.clipboard.writeText(shareText(party, displayId, link));
            setCopied(true);
            window.setTimeout(() => setCopied(false), 2000);
        } catch {
            setError("Your browser would not copy. The link is shown under the code.");
        }
    };

    const share = async () => {
        if (!link || !navigator.share) return;
        try {
            await navigator.share({ text: shareText(party, displayId, link), url: link });
        } catch {
            /* The share sheet was dismissed. */
        }
    };

    const download = async () => {
        if (!qr) return;
        try {
            const response = await fetch(qrImageUrl(qr.qrId));
            if (!response.ok) throw new Error();
            saveFile(await response.blob(), `adx-code${displayId ? `-${displayId}` : ""}.png`);
        } catch {
            setError("Could not download the code. Try again in a moment.");
        }
    };

    if (granted) {
        return (
            <div className="flex flex-col items-center gap-3 rounded-lg border border-line bg-white px-6 py-8 text-center">
                <CheckCircle2 className="size-10 text-success" aria-hidden />
                <p className="text-base font-semibold text-ink">{granted.title}</p>
                <p className="max-w-md text-sm text-dim">{granted.body}</p>
                <button type="button" onClick={() => setGranted(null)} className={btnOutline}>
                    Back to my code
                </button>
            </div>
        );
    }

    const pending = status?.pending ?? null;
    if (pending) {
        const agent = pending.agent;
        const distance = distanceLine(pending.distanceM);
        return (
            <div className="rounded-lg border border-brand-bright bg-[#fff7f7] px-6 py-6" role="alertdialog" aria-labelledby="scan-title">
                <p id="scan-title" className="text-base font-semibold text-ink">
                    {pending.kind === "ACCESS" ? "Let this agent in?" : "Is this your agent?"}
                </p>
                <p className="mt-1 text-sm text-dim">Approve only the person you are dealing with.</p>
                <div className="mt-5 flex items-center gap-4">
                    {agent?.avatarUrl ? <img src={agent.avatarUrl} alt="" className="size-16 rounded-full object-cover" /> : <span className="flex size-16 items-center justify-center rounded-full bg-white text-lg font-semibold text-dim">{initialsOf(agent?.name, "?")}</span>}
                    <div className="min-w-0">
                        <p className="text-base font-semibold text-ink">{agent?.name ?? "An ADX agent"}</p>
                        <p className="text-sm text-dim">{[agent?.displayId, agent?.city].filter(Boolean).join(" · ") || "ADX field agent"}</p>
                        {distance && <p className="text-xs text-dim">{distance}</p>}
                    </div>
                </div>
                <p className="mt-4 text-sm text-ink">{askSentence(pending, party)}</p>
                {error && (
                    <p role="alert" className="mt-3 text-sm text-danger">
                        {error}
                    </p>
                )}
                <div className="mt-5 flex flex-wrap gap-3">
                    <button type="button" onClick={() => void decide(pending, "approve")} className={btnPrimary} disabled={busy}>
                        {busy ? "Saving…" : pending.kind === "ACCESS" ? "Allow" : "Approve this agent"}
                    </button>
                    <button type="button" onClick={() => void decide(pending, "decline")} className={btnOutline} disabled={busy}>
                        {pending.kind === "ACCESS" ? "Not now" : "Not them"}
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="grid gap-4 md:grid-cols-[240px_1fr]">
            <div className="flex flex-col items-center gap-3 rounded-lg border border-line bg-white p-5">
                {qr ? <img src={qrImageUrl(qr.qrId)} alt="Your ADX code" className="size-[200px]" /> : <div className="size-[200px] rounded-md bg-ground" aria-hidden />}
                <p className="text-center text-xs text-dim">{qr ? "Nothing changes when this is scanned until you approve it here." : error ? "Your code could not be loaded." : "Loading your code…"}</p>
            </div>
            <div className="min-w-0">
                {/* 28 Sep 2026: the code names the account, so its id is labelled as the account's — the person's own id is the ADX- one. */}
                <p className="text-sm font-semibold text-ink">{displayId ? `${accountIdLine(party, displayId)} · this code is yours to keep` : "This code is yours to keep"}</p>
                <ul className="mt-3 space-y-3">
                    {USES[party].map((use) => (
                        <li key={use.title} className="flex gap-3">
                            <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-brand-soft text-brand-bright">
                                <use.icon className="size-4" aria-hidden />
                            </span>
                            <span>
                                <span className="block text-sm font-medium text-ink">{use.title}</span>
                                <span className="block text-xs text-dim">{use.body}</span>
                            </span>
                        </li>
                    ))}
                </ul>
                {link && <p className="mt-4 break-all rounded-md bg-ground px-3 py-2 text-xs text-ink">{link}</p>}
                {notice && <p className="mt-3 text-sm text-dim">{notice}</p>}
                {error && (
                    <p role="alert" className="mt-3 text-sm text-danger">
                        {error}
                    </p>
                )}
                <div className="mt-4 flex flex-wrap gap-2">
                    {qr ? (
                        <>
                            <button type="button" onClick={() => void copy()} className={btnSmall}>
                                {copied ? "Copied" : "Copy my link"}
                            </button>
                            {typeof navigator !== "undefined" && typeof navigator.share === "function" && (
                                <button type="button" onClick={() => void share()} className={btnSmall}>
                                    Share
                                </button>
                            )}
                            <button type="button" onClick={() => void download()} className={btnSmall}>
                                Download the code
                            </button>
                        </>
                    ) : (
                        <button type="button" onClick={() => setAttempt((n) => n + 1)} className={btnSmall}>
                            Try again
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
