import type { Metadata } from "next";
import { Suspense } from "react";
import { VerifyEmailForm } from "./verify-email-form";

export const metadata: Metadata = { title: "Verify your email" };

/** ED-1: the email an account that came in by its number still has to prove. */
export default function VerifyEmailPage() {
    return (
        <Suspense>
            <VerifyEmailForm />
        </Suspense>
    );
}
