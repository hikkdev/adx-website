"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AtSign, Phone } from "lucide-react";
import { toast } from "sonner";
import { AuthCard, AuthTitle, primaryButton } from "@/components/auth/auth-card";
import { GoogleButton, hasGoogleSignIn } from "@/components/auth/google-button";
import { useAuth } from "@/lib/auth";
import { messageOf } from "@/lib/api-client";
import { authService, destinationFor, looksLikeEmail, normaliseEmail, normaliseMobile, otpFailure, safeNext } from "@/services/auth";

/** Where to go once signed in: the page that sent us here, else the workspace chooser decides. */
export function afterSignIn(next: string | null): string {
    return safeNext(next) ?? "/choose-workspace";
}

type Door = "email" | "mobile";

/**
 * DR 12 · 03 · 01 · Log in or sign up (5204:61723). The frame asks the
 * email; ED-1 keeps it first on the web and adds the number as the other
 * way in — every account proves both, so whichever comes first, the other
 * is asked next. Google stays for linked accounts; Facebook is drawn as the
 * frame draws it and says it is not ready.
 */
export function SignInForm() {
    const router = useRouter();
    const params = useSearchParams();
    const next = params.get("next");
    const { status, sendOtp, sendEmailOtp, signInWithTokens } = useAuth();
    const [door, setDoor] = React.useState<Door>(params.get("door") === "mobile" ? "mobile" : "email");
    const [email, setEmail] = React.useState(params.get("email") ?? "");
    const [mobile, setMobile] = React.useState("");
    const [busy, setBusy] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);

    /* Already signed in: there is nothing to do here. */
    React.useEffect(() => {
        if (status === "signed-in") router.replace(afterSignIn(next));
    }, [status, next, router]);

    const digits = mobile.replace(/\D/g, "");
    const valid = door === "email" ? looksLikeEmail(email) : digits.length === 10 || (digits.length === 12 && digits.startsWith("91"));

    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!valid || busy) return;
        setBusy(true);
        setError(null);
        try {
            const query = new URLSearchParams();
            if (next) query.set("next", next);
            if (door === "email") {
                const address = normaliseEmail(email);
                const sent = await sendEmailOtp(address);
                query.set("channel", "email");
                query.set("email", address);
                query.set("resend", String(sent.resendAfterSeconds));
                if (sent.devOtp) query.set("dev", sent.devOtp);
            } else {
                const number = normaliseMobile(mobile);
                const sent = await sendOtp(number);
                query.set("channel", "mobile");
                query.set("mobile", number);
                query.set("resend", String(sent.resendAfterSeconds));
                if (sent.devOtp) query.set("dev", sent.devOtp);
            }
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
                const me = await signInWithTokens(await authService.google(idToken));
                router.replace(destinationFor(me, next));
            } catch (caught) {
                toast.error(messageOf(caught, "Google sign-in did not go through."));
            }
        },
        [signInWithTokens, router, next]
    );

    return (
        <AuthCard>
            <AuthTitle title="Log in or sign up" subtitle={door === "email" ? "Enter your email to continue to ADX." : "Enter your mobile number to continue to ADX."} />
            <form onSubmit={submit} className="mt-8">
                {door === "email" ? (
                    <label className="flex h-[58px] items-center gap-4 rounded-md border border-line bg-white px-6 focus-within:border-ink">
                        <AtSign className="size-5 shrink-0 text-dim" aria-hidden />
                        <input
                            type="email"
                            inputMode="email"
                            autoComplete="email"
                            value={email}
                            onChange={(event) => setEmail(event.target.value)}
                            placeholder="marketing@asterhome.example"
                            aria-label="Email"
                            className="min-w-0 flex-1 bg-transparent text-sm text-ink placeholder:text-dim focus:outline-none"
                            autoFocus
                        />
                    </label>
                ) : (
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
                )}
                {error && <p className="mt-2 text-sm text-danger" role="alert">{error}</p>}
                <button type="submit" disabled={!valid || busy} className={`${primaryButton} mt-4`}>
                    {busy ? "Sending the code…" : "Continue"}
                </button>
                <button
                    type="button"
                    onClick={() => {
                        setDoor(door === "email" ? "mobile" : "email");
                        setError(null);
                    }}
                    className="mt-3 text-sm text-dim underline-offset-2 hover:text-ink hover:underline"
                >
                    {door === "email" ? "Use your mobile number instead" : "Use your email instead"}
                </button>
            </form>

            <div className="my-7 flex items-center gap-4 text-xs text-dim">
                <span className="h-px flex-1 bg-line" />
                Or continue with
                <span className="h-px flex-1 bg-line" />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
                {hasGoogleSignIn ? (
                    <GoogleButton onCredential={google} />
                ) : (
                    <button type="button" disabled title="Google sign-in is not set up on this site yet" className="flex h-12 items-center justify-center gap-2 rounded-md border border-line bg-white text-sm font-medium text-ink opacity-60">
                        <GoogleMark />
                        Google
                    </button>
                )}
                <button type="button" disabled title="Facebook sign-in is not available yet" className="flex h-12 items-center justify-center gap-2 rounded-md border border-line bg-white text-sm font-medium text-ink opacity-60">
                    <FacebookMark />
                    Facebook
                </button>
            </div>
            <p className="mt-2 text-xs text-dim">Every ADX account proves an email and a mobile number. Whichever you start with, the other comes next.</p>

            <p className="mt-6 text-xs text-dim">
                By continuing, you agree to ADX&apos;s{" "}
                <Link href="/terms.html" className="text-ink underline underline-offset-2">Terms</Link> &amp;{" "}
                <Link href="/privacy.html" className="text-ink underline underline-offset-2">Privacy Policy</Link>.
            </p>
        </AuthCard>
    );
}

function GoogleMark() {
    return (
        <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
            <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.5 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.3l7.9 6.1C12.4 13.4 17.7 9.5 24 9.5z" />
            <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4.1 7.1-10.1 7.1-17.5z" />
            <path fill="#FBBC05" d="M10.5 28.6A14.5 14.5 0 0 1 9.7 24c0-1.6.3-3.1.8-4.6l-7.9-6.1A24 24 0 0 0 0 24c0 3.9.9 7.5 2.6 10.7l7.9-6.1z" />
            <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.5-5.8c-2.1 1.4-4.9 2.3-8.4 2.3-6.3 0-11.6-3.9-13.5-9.4l-7.9 6.1C6.5 42.6 14.6 48 24 48z" />
        </svg>
    );
}

function FacebookMark() {
    return (
        <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
            <circle cx="12" cy="12" r="12" fill="#1877F2" />
            <path fill="#fff" d="M15.5 12.8h-2.3V20h-3v-7.2H8.8v-2.6h1.4V8.6c0-2 .9-3.3 3.4-3.3h2v2.6h-1.3c-.9 0-1.1.4-1.1 1v1.3h2.5l-.2 2.6z" />
        </svg>
    );
}
