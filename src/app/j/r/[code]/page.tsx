import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SiteFooter } from "@/components/site/site-footer";
import { SiteHeader } from "@/components/site/site-header";
import { ReferralForm } from "./referral-form";

export const metadata: Metadata = { title: "You were referred to ADX", robots: { index: false } };

/**
 * LH3 (D9): a referral link — `adx.in/j/r/<code>`, the link every publisher,
 * advertiser and agent can share from "Refer a business". A stranger says
 * who they are; the lead lands attributed to whoever shared it, and ADX
 * calls. `POST /leads/inbound/referral/:code` is the door.
 */
export default async function ReferralPage({ params }: { params: Promise<{ code: string }> }) {
    const code = decodeURIComponent((await params).code).trim();
    if (!/^[A-Za-z0-9]{6,12}$/.test(code)) notFound();
    return (
        <div className="flex min-h-screen flex-col bg-ground">
            <SiteHeader />
            <main className="flex-1">
                <ReferralForm code={code.toUpperCase()} />
            </main>
            <SiteFooter />
        </div>
    );
}
