import type { Metadata } from "next";
import { SiteFooter } from "@/components/site/site-footer";
import { SiteHeader } from "@/components/site/site-header";
import { StatusView } from "./status-view";

export const metadata: Metadata = { title: "System status", description: "Whether ADX's bookings, payments, maps, notifications and verification are running, and any incident being worked on." };

/** DR 07's System status (4453:479) on the web — open even while ADX is in maintenance. */
export default function StatusPage() {
    return (
        <div className="flex min-h-screen flex-col bg-ground">
            <SiteHeader />
            <main className="flex-1">
                <StatusView />
            </main>
            <SiteFooter />
        </div>
    );
}
