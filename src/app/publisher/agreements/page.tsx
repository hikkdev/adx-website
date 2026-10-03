"use client";

import { MyAgreements } from "@/components/agreements/my-agreements";

/** Agreements — the platform terms and every document sent for e-signature (DS-1), as the app's "My agreements". */
export default function AgreementsPage() {
    return <MyAgreements side="PUBLISHER" />;
}
