"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Phone } from "lucide-react";
import { AuthCard, AuthTitle, primaryButton } from "@/components/auth/auth-card";
import { useAuth } from "@/lib/auth";
import { messageOf } from "@/lib/api-client";
import { normaliseMobile, otpFailure } from "@/services/auth";

/**
 * ED-1: the second half of an email sign-up. The address was just read; the
 * number is asked now, and the code that proves it also opens the account —
 * the signup token rides to `/verify` and on to `verify-otp`, which writes
 * the proven email onto the new account.
 */
export function VerifyPhoneForm() {
    const router = useRouter();
    const params = useSearchParams();
    const signupToken = params.get("signup");
    const email = params.get("email") ?? "";
    const next = params.get("next");
    const { sendOtp } = useAuth();
    const [mobile, setMobile] = React.useState("");
    const [busy, setBusy] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);

    React.useEffect(() => {
        if (!signupToken) router.replace("/sign-in");
    }, [signupToken, router]);

    const digits = mobile.replace(/\D/g, "");
    const valid = digits.length === 10 || (digits.length === 12 && digits.startsWith("91"));

    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!valid || busy || !signupToken) return;
        setBusy(true);
        setError(null);
        try {
            const number = normaliseMobile(mobile);
            const sent = await sendOtp(number);
            const query = new URLSearchParams({ channel: "mobile", mobile: number, signup: signupToken, email, resend: String(sent.resendAfterSeconds) });
            if (next) query.set("next", next);
            if (sent.devOtp) query.set("dev", sent.devOtp);
            router.push(`/verify?${query.toString()}`);
        } catch (caught) {
            const failure = otpFailure(caught);
            setError(failure ? failure.message : messageOf(caught, "Could not send the code. Try again."));
        } finally {
            setBusy(false);
        }
    };

    return (
        <AuthCard>
            <AuthTitle title="Now your mobile number" subtitle={<>{email ? `${email} is verified. ` : ""}Every ADX account also proves a mobile number — we will send it a code.</>} />
            <form onSubmit={submit} className="mt-8">
                <label className="flex h-[58px] items-center gap-4 rounded-md border border-line bg-white px-6 focus-within:border-ink">
                    <Phone className="size-5 shrink-0 text-dim" aria-hidden />
                    <span className="text-sm text-dim">+91</span>
                    <input
                        type="tel"
                        inputMode="numeric"
                        autoComplete="tel-national"
                        value={mobile}
                        onChange={(event) => setMobile(event.target.value.replace(/[^\d\s]/g, ""))}
                        placeholder="98765 43210"
                        aria-label="Mobile number"
                        className="min-w-0 flex-1 bg-transparent text-sm text-ink placeholder:text-dim focus:outline-none"
                        autoFocus
                    />
                </label>
                {error && <p className="mt-2 text-sm text-danger" role="alert">{error}</p>}
                <button type="submit" disabled={!valid || busy} className={`${primaryButton} mt-4`}>
                    {busy ? "Sending the code…" : "Send the code"}
                </button>
            </form>
            <p className="mt-6 text-sm text-dim">
                Already have an ADX account on this number? The email you just verified will be added to it.{" "}
                <Link href="/sign-in?door=mobile" className="text-ink underline underline-offset-2">Start over</Link>
            </p>
        </AuthCard>
    );
}
