import type { Metadata } from "next";
import { Suspense } from "react";
import { VerifyForm } from "./verify-form";

export const metadata: Metadata = { title: "Check your phone" };

/** DR 12 · 03 · 02 · Verify (5204:61783): the code the number just received. */
export default function VerifyPage() {
    return (
        <Suspense>
            <VerifyForm />
        </Suspense>
    );
}
