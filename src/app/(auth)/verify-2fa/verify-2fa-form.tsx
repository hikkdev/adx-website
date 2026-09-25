"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { KeyRound } from "lucide-react";
import { toast } from "sonner";
import { AuthCard, AuthTitle, primaryButton } from "@/components/auth/auth-card";
import { useAuth } from "@/lib/auth";
import { messageOf } from "@/lib/api-client";
import { authService, destinationFor, looksLikeRecoveryCode, otpFailure, pendingChallenge, type TwoFactorChallenge, type TwoFactorMethod } from "@/services/auth";

const METHOD_LABEL: Record<TwoFactorMethod, string> = { AUTHENTICATOR: "your authenticator app", SMS: "your phone", EMAIL: "your email" };

/**
 * 2FA-A: the account has an authenticator app, so the door answered a
 * challenge instead of tokens. One field takes the app's six digits or a
 * recovery code (`XXXX-XXXX`); `POST /auth/2fa/verify` hands back the
 * session, and the person continues to `next`. An ADMIN's challenge may
 * also offer a code by SMS or email — `POST /auth/2fa/send` — drawn as
 * links under the field when the methods say so.
 */
export function VerifyTwoFactorForm() {
    const router = useRouter();
    const params = useSearchParams();
    const next = params.get("next");
    const { completeChallenge } = useAuth();
    const [challenge] = React.useState<TwoFactorChallenge | null>(() => (typeof window === "undefined" ? null : pendingChallenge.read()));
    const [code, setCode] = React.useState("");
    const [busy, setBusy] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);
    const [sent, setSent] = React.useState<TwoFactorMethod | null>(null);

    React.useEffect(() => {
        if (!challenge) router.replace(next ? `/sign-in?next=${encodeURIComponent(next)}` : "/sign-in");
    }, [challenge, next, router]);

    const trimmed = code.trim();
    const valid = /^\d{3}\s?\d{3}$/.test(trimmed) || looksLikeRecoveryCode(trimmed) || (sent === "EMAIL" && trimmed.length >= 6);
    const other = (challenge?.methods ?? []).filter((m): m is "SMS" | "EMAIL" => m === "SMS" || m === "EMAIL");
    const appOffered = challenge?.methods.includes("AUTHENTICATOR") ?? true;

    const submit = async () => {
        if (!challenge || !valid || busy) return;
        setBusy(true);
        setError(null);
        try {
            const result = await completeChallenge(challenge.challengeToken, trimmed);
            if (typeof result.recoveryCodesLeft === "number") {
                toast.warning(result.warning || `That recovery code is spent. ${result.recoveryCodesLeft} left — make new ones under your account's Security settings.`);
            }
            router.replace(destinationFor(result.user, next));
        } catch (caught) {
            const failure = otpFailure(caught);
            setError(failure ? failure.message : messageOf(caught, "That code did not match. Check the app and try again."));
            setCode("");
        } finally {
            setBusy(false);
        }
    };

    const send = async (method: "SMS" | "EMAIL") => {
        if (!challenge || busy) return;
        setError(null);
        try {
            await authService.sendTwoFactor(challenge.challengeToken, method);
            setSent(method);
            toast.success(`Code sent to ${METHOD_LABEL[method]}.`);
        } catch (caught) {
            const failure = otpFailure(caught);
            setError(failure ? failure.message : messageOf(caught, "Could not send the code."));
        }
    };

    if (!challenge) {
        return (
            <AuthCard>
                <p className="text-sm text-dim">Checking your sign-in…</p>
            </AuthCard>
        );
    }

    return (
        <AuthCard>
            <AuthTitle title="One more step" subtitle={sent ? `Enter the code sent to ${METHOD_LABEL[sent]}.` : appOffered ? "Enter the 6-digit code from your authenticator app, or one of your recovery codes." : `Choose where to receive your code.`} />
            <form
                onSubmit={(event) => {
                    event.preventDefault();
                    void submit();
                }}
                className="mt-8"
            >
                <label className="flex h-[58px] items-center gap-4 rounded-md border border-line bg-white px-6 focus-within:border-ink">
                    <KeyRound className="size-5 shrink-0 text-dim" aria-hidden />
                    <input
                        type="text"
                        inputMode="text"
                        autoComplete="one-time-code"
                        autoCapitalize="characters"
                        autoCorrect="off"
                        spellCheck={false}
                        value={code}
                        onChange={(event) => setCode(event.target.value)}
                        placeholder="123456 or ABCD-EFGH"
                        aria-label="Authenticator or recovery code"
                        className="min-w-0 flex-1 bg-transparent text-sm tracking-widest text-ink placeholder:tracking-normal placeholder:text-dim focus:outline-none"
                        autoFocus
                    />
                </label>
                {error && <p className="mt-2 text-sm text-danger" role="alert">{error}</p>}
                <button type="submit" disabled={!valid || busy} className={`${primaryButton} mt-4`}>
                    {busy ? "Checking…" : "Verify & continue"}
                </button>
                {other.length > 0 && (
                    <p className="mt-3 text-sm text-dim">
                        {appOffered ? "No app to hand? " : ""}
                        {other.map((method, index) => (
                            <React.Fragment key={method}>
                                {index > 0 && " · "}
                                <button type="button" onClick={() => void send(method)} className="underline-offset-2 hover:text-ink hover:underline">
                                    {sent === method ? "Resend" : "Send"} a code to {method === "SMS" ? (challenge.maskedMobile ?? "your phone") : (challenge.maskedEmail ?? "your email")}
                                </button>
                            </React.Fragment>
                        ))}
                    </p>
                )}
            </form>
            <p className="mt-6 text-xs text-dim">
                A recovery code works once. Lost the app and the codes?{" "}
                <Link href="/help" className="text-ink underline underline-offset-2">
                    Contact ADX support
                </Link>
                .{" "}
                <Link
                    href={next ? `/sign-in?next=${encodeURIComponent(next)}` : "/sign-in"}
                    onClick={() => pendingChallenge.clear()}
                    className="text-ink underline underline-offset-2"
                >
                    Start over
                </Link>
            </p>
        </AuthCard>
    );
}
