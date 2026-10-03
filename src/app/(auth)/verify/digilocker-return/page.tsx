import type { Metadata } from "next";
import { Suspense } from "react";
import { DigilockerReturn } from "./digilocker-return";

export const metadata: Metadata = { title: "Back from DigiLocker", robots: { index: false, follow: false } };

/** Cashfree Phase 2: where DigiLocker sends the person back — the answer read, then back to their verify page. */
export default function DigilockerReturnPage() {
    return (
        <Suspense>
            <DigilockerReturn />
        </Suspense>
    );
}
