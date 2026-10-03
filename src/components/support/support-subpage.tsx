"use client";

import * as React from "react";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { PageHeading } from "@/components/workspace/page-heading";
import type { Party } from "@/services/party";
import { helpHref } from "@/components/account/routes";

/** A page under Help & support: the way back, the title, and the page's body. */
export function SupportSubpage({ party, title, subtitle, children }: { party: Party; title: string; subtitle?: string; children: React.ReactNode }) {
    return (
        <>
            <Link href={helpHref(party)} className="inline-flex items-center gap-1 text-sm text-dim hover:text-ink">
                <ChevronLeft className="size-4" aria-hidden />
                Help &amp; support
            </Link>
            <div className="mt-4">
                <PageHeading title={title} subtitle={subtitle} />
            </div>
            <div className="mt-6 max-w-[860px]">{children}</div>
        </>
    );
}
