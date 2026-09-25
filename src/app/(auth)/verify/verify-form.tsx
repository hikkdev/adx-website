"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AuthCard, AuthTitle, primaryButton } from "@/components/auth/auth-card";
import { useAuth } from "@/lib/auth";
import { messageOf } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { challengeHref, codeLengthFor, destinationFor, maskEmail, maskMobile, otpFailure, signupHref, spreadCode, type CodeChannel } from "@/services/auth";

/** The phone code's length; email codes are `codeLengthFor("email")` (EC-8: eight letters). */
export const CODE_LENGTH = codeLengthFor("mobile");

/**
 * The boxes, one input each; a paste fills them all. Shared by every code
 * screen. EC-8: `channel` decides the length and the keyboard — six digits
 * for a phone, eight capital letters (typed in any case) for an email.
 */
export function CodeBoxes({ code, onChange, onSubmit, channel = "mobile" }: { code: string[]; onChange: (next: string[]) => void; onSubmit: () => void; channel?: CodeChannel }) {
    const inputs = React.useRef<(HTMLInputElement | null)[]>([]);
    const length = code.length;
    const letters = channel === "email";
    const put = (index: number, raw: string) => {
        const spread = spreadCode(code, index, raw, channel);
        onChange(spread.code);
        if (spread.code[index] || raw === "") inputs.current[spread.focus]?.focus();
    };
    return (
        <div className={cn("grid", length > 6 ? "grid-cols-8 gap-2" : "grid-cols-6 gap-3")} role="group" aria-label="One-time code">
            {code.map((char, index) => (
                <input
                    key={index}
                    ref={(el) => {
                        inputs.current[index] = el;
                    }}
                    inputMode={letters ? "text" : "numeric"}
                    autoCapitalize={letters ? "characters" : "off"}
                    autoCorrect="off"
                    spellCheck={false}
                    autoComplete={index === 0 ? "one-time-code" : "off"}
                    maxLength={length}
                    value={char}
                    onChange={(event) => put(index, event.target.value)}
                    onKeyDown={(event) => {
                        if (event.key === "Backspace" && !char && index > 0) inputs.current[index - 1]?.focus();
                        if (event.key === "Enter") onSubmit();
                    }}
                    aria-label={`${letters ? "Letter" : "Digit"} ${index + 1}`}
                    className={cn("h-[58px] min-w-0 rounded-md border border-line bg-white text-center font-semibold text-ink focus:border-ink focus:outline-none", letters ? "text-lg uppercase" : "text-xl")}
                    autoFocus={index === 0}
                />
            ))}
        </div>
    );
}

/** `length` boxes, filled from `prefill` (the dev code the backend hands back outside production). */
export const emptyCode = (prefill = "", length = CODE_LENGTH) => Array.from({ length }, (_, i) => prefill[i] ?? "");

/**
 * DR 12 · 03 · 02 · Verify (5204:61783): the code the email or the number
 * just received. ED-1: the email door answers either a session (a known
 * address) or a signup hand-off — then the number is asked on
 * `/verify-phone`, carrying the token. The mobile door signs in and, when
 * the account's email is still to prove, goes on to `/verify-email`. 2FA-A:
 * either door may answer a challenge, finished on `/verify-2fa`.
 */
export function VerifyForm() {
    const router = useRouter();
    const params = useSearchParams();
    const channel: CodeChannel = params.get("channel") === "mobile" ? "mobile" : "email";
    const length = codeLengthFor(channel);
    const email = params.get("email") ?? "";
    const mobile = params.get("mobile") ?? "";
    const signupToken = params.get("signup");
    const next = params.get("next");
    const { verifyOtp, sendOtp, verifyEmailOtp, sendEmailOtp } = useAuth();
    const [code, setCode] = React.useState<string[]>(() => emptyCode(params.get("dev") ?? "", length));
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
        if (value.length < length || busy) return;
        setBusy(true);
        setError(null);
        try {
            const outcome = channel === "email" ? await verifyEmailOtp(email, value) : await verifyOtp(mobile, value, signupToken);
            if (outcome.kind === "signup") {
                /* A new address: the number comes next, carrying the proof of the email. */
                router.replace(signupHref(outcome.signup, next));
                return;
            }
            if (outcome.kind === "challenge") {
                router.replace(challengeHref(next));
                return;
            }
            router.replace(destinationFor(outcome.user, next));
        } catch (caught) {
            const failure = otpFailure(caught);
            setError(failure ? failure.message : messageOf(caught, "That code did not work."));
            setCode(emptyCode("", length));
        } finally {
            setBusy(false);
        }
    };

    const resend = async () => {
        try {
            const sent = channel === "email" ? await sendEmailOtp(email) : await sendOtp(mobile);
            setWait(sent.resendAfterSeconds);
            if (sent.devOtp) setCode(emptyCode(sent.devOtp, length));
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
                        Enter the {length}-{channel === "email" ? "letter" : "digit"} code sent to {channel === "email" ? maskEmail(email) : maskMobile(mobile)}.
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
                <CodeBoxes code={code} onChange={setCode} onSubmit={() => void submit()} channel={channel} />
                <div className="mt-3 flex items-center justify-between text-sm">
                    <Link href={changeHref} className="text-dim hover:text-ink">
                        {channel === "email" ? "Change email" : "Change number"}
                    </Link>
                    <button type="button" onClick={resend} disabled={wait > 0} className="text-dim hover:text-ink disabled:cursor-default disabled:opacity-60">
                        {wait > 0 ? `Resend in ${wait}s` : "Resend code"}
                    </button>
                </div>
                {error && <p className="mt-2 text-sm text-danger" role="alert">{error}</p>}
                <button type="submit" disabled={value.length < length || busy} className={`${primaryButton} mt-6`}>
                    {busy ? "Checking…" : "Verify & continue"}
                </button>
            </form>
            <p className="mt-6 text-sm text-dim">{channel === "email" ? "Use the code from your latest ADX email — eight letters, in any case." : "Use the code from your latest ADX message."}</p>
        </AuthCard>
    );
}
