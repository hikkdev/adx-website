import type { Metadata } from "next";
import { Suspense } from "react";
import { VerifyTwoFactorForm } from "./verify-2fa-form";

export const metadata: Metadata = { title: "Your authenticator code" };

/** 2FA-A: the second factor an account with an authenticator app answers after any door. */
export default function VerifyTwoFactorPage() {
    return (
        <Suspense>
            <VerifyTwoFactorForm />
        </Suspense>
    );
}
