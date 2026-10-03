"use client";

import { DisputesList } from "@/components/disputes/disputes-list";

/** Disputes — every case this account is a party to, raised by it or against it. */
export default function DisputesPage() {
    return <DisputesList base="/publisher" />;
}
