"use client";

import * as React from "react";
import { Copy, ShieldCheck } from "lucide-react";
import { messageOf } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { groupSecret, looksLikeRecoveryCode, twoFactorService, type EnrolmentStart, type TwoFactorStatus } from "@/services/auth";

const BUTTON = "inline-flex h-9 items-center justify-center whitespace-nowrap rounded-md border border-line bg-white px-4 text-sm font-medium text-ink hover:border-ink disabled:cursor-not-allowed disabled:opacity-50";
const BRAND_BUTTON = "inline-flex h-9 items-center justify-center whitespace-nowrap rounded-md bg-brand px-4 text-sm font-semibold text-white hover:bg-[#a51b1b] disabled:cursor-not-allowed disabled:opacity-50";
const INPUT = "h-10 w-full rounded-md border border-line bg-white px-3 text-sm text-ink placeholder:text-dim focus:border-ink focus:outline-none disabled:bg-ground disabled:text-dim";

type Mode = { kind: "idle" } | { kind: "enrolling"; start: EnrolmentStart } | { kind: "codes"; codes: string[]; title: string } | { kind: "disabling" } | { kind: "regenerating" };

/** "2 of 10 recovery codes unused" / "Not set up · …" — the line under the authenticator row. */
export function authenticatorLine(status: TwoFactorStatus | null, fallback: string): string {
    const authenticator = status?.authenticator;
    if (!authenticator?.enrolled) return fallback;
    const left = authenticator.recoveryCodesLeft;
    return `${left} of 10 recovery code${left === 1 ? "" : "s"} unused${left <= 2 ? " · make new ones soon" : ""}`;
}

/**
 * 2FA-A: the authenticator app as any account's second factor — the body
 * every Security card shares. Set up: `POST /auth/2fa/totp/enrol` shows the
 * QR and the secret once; the first code from the app confirms it
 * (`/totp/confirm`) and the ten recovery codes come back once, with a copy
 * button. Remove: `/totp/disable` with the app's code or a recovery code.
 * Regenerate: `/recovery-codes/regenerate` with the app's code; the old ten
 * are gone. `onChanged` re-reads the page after every write.
 */
export function AuthenticatorSetup({ status, onChanged, className, sideLabel = "account" }: { status: TwoFactorStatus | null; onChanged: () => void; className?: string; sideLabel?: string }) {
    const enrolled = !!status?.authenticator?.enrolled;
    const [mode, setMode] = React.useState<Mode>({ kind: "idle" });
    const [code, setCode] = React.useState("");
    const [busy, setBusy] = React.useState(false);
    const [note, setNote] = React.useState<{ tone: "ok" | "bad"; text: string } | null>(null);

    const run = async (work: () => Promise<void>, fallback: string) => {
        if (busy) return;
        setBusy(true);
        setNote(null);
        try {
            await work();
        } catch (caught) {
            setNote({ tone: "bad", text: messageOf(caught, fallback) });
        } finally {
            setBusy(false);
        }
    };

    const begin = () =>
        run(async () => {
            const start = await twoFactorService.enrol();
            setCode("");
            setMode({ kind: "enrolling", start });
        }, "Could not start the set-up.");

    const confirm = () =>
        run(async () => {
            const done = await twoFactorService.confirm(code);
            setCode("");
            setMode({ kind: "codes", codes: done.recoveryCodes, title: "Authenticator app set up" });
            onChanged();
        }, "That code did not match. Check the app and try again.");

    const disable = () =>
        run(async () => {
            await twoFactorService.disable(code);
            setCode("");
            setMode({ kind: "idle" });
            setNote({ tone: "ok", text: `Authenticator app removed. Sign-in codes go to your phone or email again.` });
            onChanged();
        }, "Could not remove the authenticator app.");

    const regenerate = () =>
        run(async () => {
            const answer = await twoFactorService.regenerateRecoveryCodes(code);
            setCode("");
            setMode({ kind: "codes", codes: answer.recoveryCodes, title: "New recovery codes" });
            onChanged();
        }, "Could not make new recovery codes.");

    const cancel = () => {
        setMode({ kind: "idle" });
        setCode("");
        setNote(null);
    };

    return (
        <div className={className}>
            <div className="flex items-center gap-3">
                <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-md", enrolled ? "bg-success-soft text-success" : "bg-ground text-dim")}>
                    <ShieldCheck className="size-4" aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-ink">Authenticator app</p>
                    <p className="text-xs text-dim">{enrolled ? `On · every sign-in to this ${sideLabel} asks for the app's code` : "Not set up · sign-in is protected by the code sent to your phone or email"}</p>
                </div>
                <span className={cn("inline-flex h-6 items-center rounded-md px-2 text-xs font-medium", enrolled ? "bg-success-soft text-success" : "bg-ground text-ink")}>{enrolled ? "On" : "Off"}</span>
            </div>

            {mode.kind === "idle" && (
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
                    <p className="text-xs text-dim">{authenticatorLine(status, "Google Authenticator, Authy, 1Password and the like all work.")}</p>
                    <div className="flex flex-wrap gap-2">
                        {enrolled ? (
                            <>
                                <button type="button" onClick={() => setMode({ kind: "regenerating" })} className={BUTTON} disabled={busy}>
                                    New recovery codes
                                </button>
                                <button type="button" onClick={() => setMode({ kind: "disabling" })} className={cn(BUTTON, "text-brand-bright")} disabled={busy}>
                                    Remove
                                </button>
                            </>
                        ) : (
                            <button type="button" onClick={() => void begin()} className={BUTTON} disabled={busy}>
                                {busy ? "Starting…" : "Set up authenticator"}
                            </button>
                        )}
                    </div>
                </div>
            )}

            {mode.kind === "enrolling" && (
                <div className="mt-4 border-t border-line pt-4">
                    <p className="text-sm font-medium text-ink">1 · Scan this with your authenticator app</p>
                    <div className="mt-3 flex flex-wrap items-start gap-4">
                        <img src={mode.start.qrSvg} alt="QR code for your authenticator app" width={168} height={168} className="size-[168px] rounded-md border border-line bg-white p-2" />
                        <div className="min-w-0 flex-1">
                            <p className="text-xs text-dim">Or type the key by hand:</p>
                            <p className="mt-1 break-all font-mono text-sm tracking-wider text-ink">{groupSecret(mode.start.secret)}</p>
                            <CopyButton value={mode.start.secret} label="Copy key" className="mt-2" />
                            <p className="mt-3 text-xs text-dim">This key is shown once and expires in {Math.round(mode.start.expiresInSeconds / 60)} minutes.</p>
                        </div>
                    </div>
                    <p className="mt-4 text-sm font-medium text-ink">2 · Enter the first code the app shows</p>
                    <div className="mt-2 flex gap-2">
                        <input value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" placeholder="6-digit code" aria-label="Code from the app" className={INPUT} autoFocus />
                        <button type="button" onClick={() => void confirm()} className={BRAND_BUTTON} disabled={busy || code.length !== 6}>
                            {busy ? "Checking…" : "Turn on"}
                        </button>
                        <button type="button" onClick={cancel} className={BUTTON} disabled={busy}>
                            Cancel
                        </button>
                    </div>
                </div>
            )}

            {mode.kind === "codes" && (
                <div className="mt-4 border-t border-line pt-4">
                    <p className="text-sm font-medium text-ink">{mode.title} · save your recovery codes</p>
                    <p className="mt-1 text-xs text-dim">Each works once, in place of the app, if you lose your phone. They are shown now and never again.</p>
                    <ul className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 rounded-md bg-ground px-4 py-3 font-mono text-sm text-ink sm:grid-cols-5">
                        {mode.codes.map((recovery) => (
                            <li key={recovery}>{recovery}</li>
                        ))}
                    </ul>
                    <div className="mt-3 flex flex-wrap gap-2">
                        <CopyButton value={mode.codes.join("\n")} label="Copy all codes" />
                        <button type="button" onClick={cancel} className={BRAND_BUTTON}>
                            I have saved them
                        </button>
                    </div>
                </div>
            )}

            {(mode.kind === "disabling" || mode.kind === "regenerating") && (
                <div className="mt-4 border-t border-line pt-4">
                    <p className="text-sm font-medium text-ink">{mode.kind === "disabling" ? "Remove the authenticator app" : "Make ten new recovery codes"}</p>
                    <p className="mt-1 text-xs text-dim">{mode.kind === "disabling" ? "Enter the code from your app, or one of your recovery codes if the phone is gone." : "Enter the code from your app. The old codes stop working."}</p>
                    <div className="mt-2 flex gap-2">
                        <input value={code} onChange={(e) => setCode(mode.kind === "disabling" ? e.target.value.toUpperCase() : e.target.value.replace(/\D/g, "").slice(0, 6))} inputMode={mode.kind === "disabling" ? "text" : "numeric"} autoComplete="one-time-code" placeholder={mode.kind === "disabling" ? "123456 or ABCD-EFGH" : "6-digit code"} aria-label="Code" className={INPUT} autoFocus />
                        <button type="button" onClick={() => void (mode.kind === "disabling" ? disable() : regenerate())} className={mode.kind === "disabling" ? cn(BUTTON, "text-brand-bright") : BRAND_BUTTON} disabled={busy || !(code.replace(/\s/g, "").length === 6 || (mode.kind === "disabling" && looksLikeRecoveryCode(code)))}>
                            {busy ? "Working…" : mode.kind === "disabling" ? "Remove" : "Make new codes"}
                        </button>
                        <button type="button" onClick={cancel} className={BUTTON} disabled={busy}>
                            Cancel
                        </button>
                    </div>
                </div>
            )}

            {note && <p className={cn("mt-3 text-xs", note.tone === "ok" ? "text-success" : "text-danger")}>{note.text}</p>}
        </div>
    );
}

function CopyButton({ value, label, className }: { value: string; label: string; className?: string }) {
    const [copied, setCopied] = React.useState(false);
    const copy = async () => {
        try {
            await navigator.clipboard.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
        } catch {
            /* ignore */
        }
    };
    return (
        <button type="button" onClick={() => void copy()} className={cn(BUTTON, "gap-1.5", className)}>
            <Copy className="size-3.5" aria-hidden />
            {copied ? "Copied" : label}
        </button>
    );
}
