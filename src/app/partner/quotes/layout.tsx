"use client";

import * as React from "react";
import { FeatureGate } from "@/components/platform/feature-off";
import { FLAG_PRINT_QUOTES } from "@/lib/flags";

/**
 * Quote requests are `partners.quotes` (`/print-partners/me/quote-requests…`,
 * 503 FEATURE_OFF while switched off). While the platform has them off, the
 * list and a request's page say so and ask for nothing; the nav item and the
 * home's panel hide on the same reading.
 */
export default function QuotesLayout({ children }: Readonly<{ children: React.ReactNode }>) {
    return <FeatureGate flag={FLAG_PRINT_QUOTES}>{children}</FeatureGate>;
}
