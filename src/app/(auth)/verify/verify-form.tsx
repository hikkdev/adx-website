"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AuthCard, AuthTitle, primaryButton } from "@/components/auth/auth-card";
import { useAuth } from "@/lib/auth";
import { messageOf } from "@/lib/api-client";
import { otpFailure } from "@/services/auth";
import { afterSignIn } from "../sign-in/sign-in-form";

const CODE_LENGTH = 6;

/** +91 98765 43210 → +91 •••••• 3210 */
function maskMobile(mobile: string): string {
    const digits = mobile.replace(/\D/g, "").slice(-10);
    return `+91 ${"•".repeat(6)} ${digits.slice(-4)}`;
}

export function VerifyForm() {
    const router = useRouter();
    const params = useSearchParams();
    const mobile = params.get("mobile") ?? "";
    const next = params.get("next");
    const { verifyOtp, sendOtp } = useAuth();
    const [code, setCode] = React.useState<string[]>(() => {
        const dev = params.get("dev") ?? "";
        return Array.from({ length: CODE_LENGTH }, (_, i) => dev[i] ?? "");
    });
    const [busy, setBusy] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);
    const [wait, setWait] = React.useState(() => Number(params.get("resend")) || 60);
    const inputs = React.useRef<(HTMLInputElement | null)[]>([]);

    React.useEffect(() => {
        if (!mobile) router.replace("/sign-in");
    }, [mobile, router]);

    React.useEffect(() => {
        if (wait <= 0) return;
        const timer = setTimeout(() => setWait((w) => w - 1), 1000);
        return () => clearTimeout(timer);
    }, [wait]);

    const value = code.join("");

    const submit = async (event?: React.FormEvent) => {
        event?.preventDefault();
        if (value.length < CODE_LENGTH || busy) return;
        setBusy(true);
        setError(null);
        try {
            const me = await verifyOtp(mobile, value);
            const hasSide = me.roles.includes("ADVERTISER") || me.roles.includes("PUBLISHER");
            router.replace(hasSide ? (next && next.startsWith("/") ? next : me.roles.includes("PUBLISHER") && !me.roles.includes("ADVERTISER") ? "/publisher" : "/advertiser") : afterSignIn(null) + (next ? `?next=${encodeURIComponent(next)}` : ""));
        } catch (caught) {
            const failure = otpFailure(caught);
            setError(failure ? failure.message : messageOf(caught, "That code did not work."));
            setCode(Array.from({ length: CODE_LENGTH }, () => ""));
            inputs.current[0]?.focus();
        } finally {
            setBusy(false);
        }
    };

    const resend = async () => {
        try {
            const sent = await sendOtp(mobile);
            setWait(sent.resendAfterSeconds);
            if (sent.devOtp) setCode(Array.from({ length: CODE_LENGTH }, (_, i) => sent.devOtp![i] ?? ""));
        } catch (caught) {
            const failure = otpFailure(caught);
            setError(failure ? failure.message : messageOf(caught, "Could not resend the code."));
        }
    };

    const put = (index: number, raw: string) => {
        const digits = raw.replace(/\D/g, "");
        if (!digits) {
            setCode((c) => c.map((d, i) => (i === index ? "" : d)));
            return;
        }
        /* A pasted code fills every box from here on. */
        setCode((c) => c.map((d, i) => (i < index ? d : (digits[i - index] ?? (i < index + digits.length ? "" : d)))));
        const last = Math.min(CODE_LENGTH - 1, index + digits.length);
        inputs.current[last]?.focus();
    };

    return (
        <AuthCard>
            <AuthTitle title="Check your phone" subtitle={<>Enter the {CODE_LENGTH}-digit code sent to {maskMobile(mobile)}.</>} />
            <form onSubmit={submit} className="mt-8">
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
                                if (event.key === "Enter") void submit();
                            }}
                            aria-label={`Digit ${index + 1}`}
                            className="h-[58px] rounded-md border border-line bg-white text-center text-xl font-semibold text-ink focus:border-ink focus:outline-none"
                            autoFocus={index === 0}
                        />
                    ))}
                </div>
                <div className="mt-3 flex items-center justify-between text-sm">
                    <Link href={`/sign-in${next ? `?next=${encodeURIComponent(next)}` : ""}`} className="text-dim hover:text-ink">
                        Change number
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
            <p className="mt-6 text-sm text-dim">Use the code from your latest ADX message.</p>
        </AuthCard>
    );
}
