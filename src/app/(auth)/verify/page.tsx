import type { Metadata } from "next";
import { Suspense } from "react";
import { VerifyForm } from "./verify-form";

export const metadata: Metadata = { title: "Enter your code" };

/** DR 12 · 03 · 02 · Verify (5204:61783): the code the email or the number just received. */
export default function VerifyPage() {
    return (
        <Suspense>
            <VerifyForm />
        </Suspense>
    );
}
