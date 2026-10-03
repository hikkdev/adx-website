import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SiteFooter } from "@/components/site/site-footer";
import { SiteHeader } from "@/components/site/site-header";
import { isInviteCode } from "@/services/party";
import { InviteLanding } from "./invite-landing";

export const metadata: Metadata = { title: "Your invitation to ADX", robots: { index: false } };

/**
 * LH7 (D6): the page an agent's invite link opens — `adx.in/j/<code>`. The
 * code is the key; the backend says who it was made for, what the agent
 * priced, and whether the door is still open. On a phone with the app the
 * same code opens `adx://join/<code>` instead.
 */
export default async function InvitePage({ params }: { params: Promise<{ code: string }> }) {
    const code = decodeURIComponent((await params).code).trim();
    if (!isInviteCode(code)) notFound();
    return (
        <div className="flex min-h-screen flex-col bg-ground">
            <SiteHeader />
            <main className="flex-1">
                <InviteLanding code={code.toUpperCase()} />
            </main>
            <SiteFooter />
        </div>
    );
}
