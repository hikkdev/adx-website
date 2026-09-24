"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AuthCard, AuthTitle, primaryButton } from "@/components/auth/auth-card";
import { useAuth } from "@/lib/auth";
import { messageOf } from "@/lib/api-client";
import { destinationFor, maskEmail, maskMobile, otpFailure } from "@/services/auth";

export const CODE_LENGTH = 6;

/** The six boxes, one input each; a paste fills them all. Shared by every code screen. */
export function CodeBoxes({ code, onChange, onSubmit }: { code: string[]; onChange: (next: string[]) => void; onSubmit: () => void }) {
    const inputs = React.useRef<(HTMLInputElement | null)[]>([]);
    const put = (index: number, raw: string) => {
        const digits = raw.replace(/\D/g, "");
        if (!digits) {
            onChange(code.map((d, i) => (i === index ? "" : d)));
            return;
        }
        onChange(code.map((d, i) => (i < index ? d : (digits[i - index] ?? (i < index + digits.length ? "" : d)))));
        const last = Math.min(CODE_LENGTH - 1, index + digits.length);
        inputs.current[last]?.focus();
    };
    return (
        <div className="grid grid-cols-6 gap-3" role="group" aria-label="One-time code">
            {code.map((digit, index) => (
                <input
                    key={index}
                    ref={(el) => {
                        inputs.current[index] = el;
                    }}
                    inputMode="numeric"
                    autoComplete={index === 0 ? "one-time-code" : "off"}
                    maxLength={CODE_LENGTH}
                    value={digit}
                    onChange={(event) => put(index, event.target.value)}
                    onKeyDown={(event) => {
                        if (event.key === "Backspace" && !digit && index > 0) inputs.current[index - 1]?.focus();
                        if (event.key === "Enter") onSubmit();
                    }}
                    aria-label={`Digit ${index + 1}`}
                    className="h-[58px] rounded-md border border-line bg-white text-center text-xl font-semibold text-ink focus:border-ink focus:outline-none"
                    autoFocus={index === 0}
                />
            ))}
        </div>
    );
}

export const emptyCode = (prefill = "") => Array.from({ length: CODE_LENGTH }, (_, i) => prefill[i] ?? "");

/**
 * DR 12 · 03 · 02 · Verify (5204:61783): the code the email or the number
 * just received. ED-1: the email door answers either a session (a known
 * address) or a signup hand-off — then the number is asked on
 * `/verify-phone`, carrying the token. The mobile door signs in and, when
 * the account's email is still to prove, goes on to `/verify-email`.
 */
export function VerifyForm() {
    const router = useRouter();
    const params = useSearchParams();
    const channel = params.get("channel") === "mobile" ? "mobile" : "email";
    const email = params.get("email") ?? "";
    const mobile = params.get("mobile") ?? "";
    const signupToken = params.get("signup");
    const next = params.get("next");
    const { verifyOtp, sendOtp, verifyEmailOtp, sendEmailOtp } = useAuth();
    const [code, setCode] = React.useState<string[]>(() => emptyCode(params.get("dev") ?? ""));
    const [busy, setBusy] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);
    const [wait, setWait] = React.useState(() => Number(params.get("resend")) || 60);

    const recipient = channel === "mobile" ? mobile : email;

    React.useEffect(() => {
        if (!recipient) router.replace("/sign-in");
    }, [recipient, router]);

    React.useEffect(() => {
        if (wait <= 0) return;
        const timer = setTimeout(() => setWait((w) => w - 1), 1000);
        return () => clearTimeout(timer);
    }, [wait]);

    const value = code.join("");
    const query = (extra: Record<string, string>) => {
        const q = new URLSearchParams(extra);
        if (next) q.set("next", next);
        return q.toString();
    };

    const submit = async () => {
        if (value.length < CODE_LENGTH || busy) return;
        setBusy(true);
        setError(null);
        try {
            if (channel === "email") {
                const result = await verifyEmailOtp(email, value);
                if (result.kind === "signup") {
                    /* A new address: the number comes next, carrying the proof of the email. */
                    router.replace(`/verify-phone?${query({ signup: result.signup.signupToken, email: result.signup.email })}`);
                    return;
                }
                router.replace(destinationFor(result.user, next));
                return;
            }
            const me = await verifyOtp(mobile, value, signupToken);
            router.replace(destinationFor(me, next));
        } catch (caught) {
            const failure = otpFailure(caught);
            setError(failure ? failure.message : messageOf(caught, "That code did not work."));
            setCode(emptyCode());
        } finally {
            setBusy(false);
        }
    };

    const resend = async () => {
        try {
            const sent = channel === "email" ? await sendEmailOtp(email) : await sendOtp(mobile);
            setWait(sent.resendAfterSeconds);
            if (sent.devOtp) setCode(emptyCode(sent.devOtp));
        } catch (caught) {
            const failure = otpFailure(caught);
            setError(failure ? failure.message : messageOf(caught, "Could not resend the code."));
        }
    };

    const changeHref = channel === "email" ? `/sign-in?${query({ door: "email", email })}` : signupToken ? `/verify-phone?${query({ signup: signupToken, email })}` : `/sign-in?${query({ door: "mobile" })}`;

    return (
        <AuthCard>
            <AuthTitle
                title={channel === "email" ? "Check your email" : "Check your phone"}
                subtitle={
                    <>
                        Enter the {CODE_LENGTH}-digit code sent to {channel === "email" ? maskEmail(email) : maskMobile(mobile)}.
                    </>
                }
            />
            <form
                onSubmit={(event) => {
                    event.preventDefault();
                    void submit();
                }}
                className="mt-8"
            >
                <CodeBoxes code={code} onChange={setCode} onSubmit={() => void submit()} />
                <div className="mt-3 flex items-center justify-between text-sm">
                    <Link href={changeHref} className="text-dim hover:text-ink">
                        {channel === "email" ? "Change email" : "Change number"}
                    </Link>
                    <button type="button" onClick={resend} disabled={wait > 0} className="text-dim hover:text-ink disabled:cursor-default disabled:opacity-60">
                        {wait > 0 ? `Resend in ${wait}s` : "Resend code"}
                    </button>
                </div>
                {error && <p className="mt-2 text-sm text-danger" role="alert">{error}</p>}
                <button type="submit" disabled={value.length < CODE_LENGTH || busy} className={`${primaryButton} mt-6`}>
                    {busy ? "Checking…" : "Verify & continue"}
                </button>
            </form>
            <p className="mt-6 text-sm text-dim">{channel === "email" ? "Use the code from your latest ADX email." : "Use the code from your latest ADX message."}</p>
        </AuthCard>
    );
}
