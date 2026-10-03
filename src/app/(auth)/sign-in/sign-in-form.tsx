"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AtSign, Phone } from "lucide-react";
import { toast } from "sonner";
import { AuthCard, AuthTitle, primaryButton } from "@/components/auth/auth-card";
import { FacebookButton } from "@/components/auth/facebook-button";
import { GoogleButton } from "@/components/auth/google-button";
import { useProviderIds } from "@/components/auth/use-providers";
import { useAuth, type DoorOutcome } from "@/lib/auth";
import { ApiError, messageOf } from "@/lib/api-client";
import { challengeHref, destinationFor, looksLikeEmail, normaliseEmail, normaliseMobile, otpFailure, safeNext, signupHref } from "@/services/auth";

/** Where to go once signed in: the page that sent us here, else the workspace chooser decides. */
export function afterSignIn(next: string | null): string {
    return safeNext(next) ?? "/choose-workspace";
}

type Door = "email" | "mobile";

/**
 * DR 12 · 03 · 01 · Log in or sign up (5204:61723). The frame asks the
 * email; ED-1 keeps it first on the web and adds the number as the other
 * way in — every account proves both, so whichever comes first, the other
 * is asked next. G-2 and FB-1: Google and Facebook are doors too — a known
 * address signs in, a new one goes to the phone step with the proof of the
 * email. 2FA-A: an account with an authenticator answers it on `/verify-2fa`.
 * A provider button is drawn only when `GET /auth/providers` (or the site's
 * own env id) names that provider — no id, no button, and no "Or continue
 * with" rule when there is neither. QR-6: nobody agrees to anything by
 * typing an address here; a new account reads and accepts the terms on the
 * next screen, where the acceptance is recorded.
 */
export function SignInForm() {
    const router = useRouter();
    const params = useSearchParams();
    const next = params.get("next");
    const { status, sendOtp, sendEmailOtp, google: googleDoor, facebook: facebookDoor } = useAuth();
    const providers = useProviderIds();
    const anyProvider = !!(providers.googleClientId || providers.facebookAppId);
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

    /** Where a provider door came to: the session's destination, the phone step, or the second factor. */
    const settle = React.useCallback(
        (outcome: DoorOutcome) => {
            if (outcome.kind === "signup") router.replace(signupHref(outcome.signup, next));
            else if (outcome.kind === "challenge") router.replace(challengeHref(next));
            else router.replace(destinationFor(outcome.user, next));
        },
        [router, next]
    );

    const google = React.useCallback(
        async (idToken: string) => {
            try {
                settle(await googleDoor(idToken));
            } catch (caught) {
                toast.error(messageOf(caught, "Google sign-in did not go through."));
            }
        },
        [googleDoor, settle]
    );

    const facebook = React.useCallback(
        async (accessToken: string) => {
            try {
                settle(await facebookDoor(accessToken));
            } catch (caught) {
                if (caught instanceof ApiError && caught.code === "FACEBOOK_EMAIL_REQUIRED") {
                    setError("Your Facebook account shares no email address with ADX. Continue with your email or mobile number instead.");
                    return;
                }
                if (caught instanceof ApiError && caught.status === 503) {
                    toast.error("Facebook sign-in is not set up on ADX yet. Use your email or mobile number.");
                    return;
                }
                toast.error(messageOf(caught, "Facebook sign-in did not go through."));
            }
        },
        [facebookDoor, settle]
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

            {anyProvider && (
                <>
                    <div className="my-7 flex items-center gap-4 text-xs text-dim">
                        <span className="h-px flex-1 bg-line" />
                        Or continue with
                        <span className="h-px flex-1 bg-line" />
                    </div>
                    <div className={providers.googleClientId && providers.facebookAppId ? "grid gap-3 sm:grid-cols-2" : "grid gap-3"}>
                        {providers.googleClientId && <GoogleButton clientId={providers.googleClientId} onCredential={google} />}
                        {providers.facebookAppId && (
                            <FacebookButton appId={providers.facebookAppId} onToken={facebook} disabled={busy}>
                                <FacebookMark />
                                {providers.googleClientId ? "Facebook" : "Continue with Facebook"}
                            </FacebookButton>
                        )}
                    </div>
                </>
            )}
            <p className="mt-6 text-xs text-dim">Every ADX account proves an email and a mobile number. Whichever you start with, the other comes next.</p>

            <p className="mt-3 text-xs text-dim">
                New to ADX? Before your account opens you will read and accept the{" "}
                <Link href="/legal/TERMS_OF_SERVICE" className="text-ink underline underline-offset-2">Terms of service</Link> and the{" "}
                <Link href="/legal/PRIVACY_POLICY" className="text-ink underline underline-offset-2">Privacy policy</Link>.
            </p>
        </AuthCard>
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
