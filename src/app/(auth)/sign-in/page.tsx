import type { Metadata } from "next";
import { Suspense } from "react";
import { SignInForm } from "./sign-in-form";

export const metadata: Metadata = { title: "Log in or sign up" };

/** DR 12 · 03 · 01 · Log in or sign up (5204:61723): the email the frame drew, and ED-1's mobile number as the other way in. */
export default function SignInPage() {
    return (
        <Suspense>
            <SignInForm />
        </Suspense>
    );
}
