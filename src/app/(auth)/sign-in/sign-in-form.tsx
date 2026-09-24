"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Phone } from "lucide-react";
import { toast } from "sonner";
import { AuthCard, AuthTitle, primaryButton } from "@/components/auth/auth-card";
import { GoogleButton, hasGoogleSignIn } from "@/components/auth/google-button";
import { useAuth } from "@/lib/auth";
import { messageOf } from "@/lib/api-client";
import { authService, normaliseMobile, otpFailure } from "@/services/auth";

/** Where to go once signed in: the page that sent us here, else the workspace chooser decides. */
export function afterSignIn(next: string | null): string {
    return next && next.startsWith("/") && !next.startsWith("//") ? next : "/choose-workspace";
}

export function SignInForm() {
    const router = useRouter();
    const params = useSearchParams();
    const next = params.get("next");
    const { status, sendOtp, signInWithTokens } = useAuth();
    const [mobile, setMobile] = React.useState("");
    const [busy, setBusy] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);

    /* Already signed in: there is nothing to do here. */
    React.useEffect(() => {
        if (status === "signed-in") router.replace(afterSignIn(next));
    }, [status, next, router]);

    const digits = mobile.replace(/\D/g, "");
    const valid = digits.length === 10 || (digits.length === 12 && digits.startsWith("91"));

    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!valid || busy) return;
        setBusy(true);
        setError(null);
        try {
            const sent = await sendOtp(mobile);
            const query = new URLSearchParams({ mobile: normaliseMobile(mobile), resend: String(sent.resendAfterSeconds) });
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

    const google = React.useCallback(
        async (idToken: string) => {
            try {
                await signInWithTokens(await authService.google(idToken));
                router.replace(afterSignIn(next));
            } catch (caught) {
                toast.error(messageOf(caught, "Google sign-in did not go through."));
            }
        },
        [signInWithTokens, router, next]
    );

    return (
        <AuthCard>
            <AuthTitle title="Log in or sign up" subtitle="Enter your mobile number to continue to ADX." />
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
                    {busy ? "Sending the code…" : "Continue"}
                </button>
            </form>

            {hasGoogleSignIn && (
                <>
                    <div className="my-7 flex items-center gap-4 text-xs text-dim">
                        <span className="h-px flex-1 bg-line" />
                        Or continue with
                        <span className="h-px flex-1 bg-line" />
                    </div>
                    <GoogleButton onCredential={google} />
                </>
            )}

            <p className="mt-6 text-xs text-dim">
                By continuing, you agree to ADX&apos;s{" "}
                <Link href="/terms.html" className="text-ink underline underline-offset-2">Terms</Link> &amp;{" "}
                <Link href="/privacy.html" className="text-ink underline underline-offset-2">Privacy Policy</Link>.
            </p>
        </AuthCard>
    );
}
