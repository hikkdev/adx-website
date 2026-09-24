"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AtSign } from "lucide-react";
import { AuthCard, AuthTitle, primaryButton } from "@/components/auth/auth-card";
import { useAuth } from "@/lib/auth";
import { messageOf } from "@/lib/api-client";
import { authService, destinationFor, looksLikeEmail, maskEmail, normaliseEmail, otpFailure } from "@/services/auth";
import { CODE_LENGTH, CodeBoxes, emptyCode } from "../verify/verify-form";

/**
 * ED-1: an account that came in by its number proves its email here — the
 * step `destinationFor` sends every signed-in account to while
 * `emailVerifiedAt` is null. The address on file (if any) is offered; the
 * code goes to `POST /users/me/email/send-code` and back to `/verify`, and
 * the answer makes it the account's verified email.
 */
export function VerifyEmailForm() {
    const router = useRouter();
    const params = useSearchParams();
    const next = params.get("next");
    const { status, user, refresh } = useAuth();
    const [email, setEmail] = React.useState("");
    const [sent, setSent] = React.useState<{ email: string; wait: number } | null>(null);
    const [code, setCode] = React.useState<string[]>(() => emptyCode());
    const [busy, setBusy] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);
    const address = email || user?.email || "";

    React.useEffect(() => {
        if (status === "signed-out") router.replace(`/sign-in?next=${encodeURIComponent(`/verify-email${next ? `?next=${encodeURIComponent(next)}` : ""}`)}`);
        /* Already proved (an older token, a second tab): nothing to do here. */
        if (status === "signed-in" && user && user.emailVerifiedAt) router.replace(destinationFor(user, next));
    }, [status, user, next, router]);

    React.useEffect(() => {
        if (!sent || sent.wait <= 0) return;
        const timer = setTimeout(() => setSent((s) => (s ? { ...s, wait: s.wait - 1 } : s)), 1000);
        return () => clearTimeout(timer);
    }, [sent]);

    const send = async (event?: React.FormEvent) => {
        event?.preventDefault();
        if (!looksLikeEmail(address) || busy) return;
        setBusy(true);
        setError(null);
        try {
            const result = await authService.sendMyEmailCode(normaliseEmail(address));
            setSent({ email: result.email, wait: result.resendAfterSeconds });
            setCode(emptyCode(result.devOtp ?? ""));
        } catch (caught) {
            const failure = otpFailure(caught);
            setError(failure ? failure.message : messageOf(caught, "Could not send the code. Try again."));
        } finally {
            setBusy(false);
        }
    };

    const value = code.join("");
    const verify = async () => {
        if (!sent || value.length < CODE_LENGTH || busy) return;
        setBusy(true);
        setError(null);
        try {
            await authService.verifyMyEmail(sent.email, value);
            const me = await refresh();
            router.replace(me ? destinationFor(me, next) : "/choose-workspace");
        } catch (caught) {
            const failure = otpFailure(caught);
            setError(failure ? failure.message : messageOf(caught, "That code did not work."));
            setCode(emptyCode());
        } finally {
            setBusy(false);
        }
    };

    if (status !== "signed-in") {
        return (
            <AuthCard>
                <p className="text-sm text-dim">Checking your session…</p>
            </AuthCard>
        );
    }

    if (sent) {
        return (
            <AuthCard>
                <AuthTitle title="Check your email" subtitle={<>Enter the {CODE_LENGTH}-digit code sent to {maskEmail(sent.email)}.</>} />
                <form
                    onSubmit={(event) => {
                        event.preventDefault();
                        void verify();
                    }}
                    className="mt-8"
                >
                    <CodeBoxes code={code} onChange={setCode} onSubmit={() => void verify()} />
                    <div className="mt-3 flex items-center justify-between text-sm">
                        <button type="button" onClick={() => setSent(null)} className="text-dim hover:text-ink">
                            Change email
                        </button>
                        <button type="button" onClick={() => void send()} disabled={sent.wait > 0} className="text-dim hover:text-ink disabled:cursor-default disabled:opacity-60">
                            {sent.wait > 0 ? `Resend in ${sent.wait}s` : "Resend code"}
                        </button>
                    </div>
                    {error && <p className="mt-2 text-sm text-danger" role="alert">{error}</p>}
                    <button type="submit" disabled={value.length < CODE_LENGTH || busy} className={`${primaryButton} mt-6`}>
                        {busy ? "Checking…" : "Verify & continue"}
                    </button>
                </form>
                <p className="mt-6 text-sm text-dim">Use the code from your latest ADX email.</p>
            </AuthCard>
        );
    }

    return (
        <AuthCard>
            <AuthTitle title="Verify your email" subtitle="Every ADX account proves an email address. Invoices, receipts and sign-in codes go here." />
            <form onSubmit={send} className="mt-8">
                <label className="flex h-[58px] items-center gap-4 rounded-md border border-line bg-white px-6 focus-within:border-ink">
                    <AtSign className="size-5 shrink-0 text-dim" aria-hidden />
                    <input
                        type="email"
                        inputMode="email"
                        autoComplete="email"
                        value={address}
                        onChange={(event) => setEmail(event.target.value)}
                        placeholder="you@company.example"
                        aria-label="Email"
                        className="min-w-0 flex-1 bg-transparent text-sm text-ink placeholder:text-dim focus:outline-none"
                        autoFocus
                    />
                </label>
                {error && <p className="mt-2 text-sm text-danger" role="alert">{error}</p>}
                <button type="submit" disabled={!looksLikeEmail(address) || busy} className={`${primaryButton} mt-4`}>
                    {busy ? "Sending the code…" : "Send the code"}
                </button>
            </form>
            <p className="mt-6 text-xs text-dim">Signed in as {user?.mobile}. The address you verify becomes the email on your account.</p>
        </AuthCard>
    );
}
