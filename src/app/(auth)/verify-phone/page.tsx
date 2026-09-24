import type { Metadata } from "next";
import { Suspense } from "react";
import { VerifyPhoneForm } from "./verify-phone-form";

export const metadata: Metadata = { title: "Your mobile number" };

/** ED-1: after the email code on a new address — the number the account also proves. */
export default function VerifyPhonePage() {
    return (
        <Suspense>
            <VerifyPhoneForm />
        </Suspense>
    );
}
