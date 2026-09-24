import type { Metadata } from "next";
import { Suspense } from "react";
import { SignInForm } from "./sign-in-form";

export const metadata: Metadata = { title: "Log in or sign up" };

/** DR 12 · 03 · 01 · Log in or sign up (5204:61723), with a mobile number where the frame drew an email. */
export default function SignInPage() {
    return (
        <Suspense>
            <SignInForm />
        </Suspense>
    );
}
