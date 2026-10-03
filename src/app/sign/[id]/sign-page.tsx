"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { SigningView } from "@/components/agreements/signing-view";
import { useAuth } from "@/lib/auth";
import { safeNext } from "@/services/agreements";
import { HOME_OF } from "@/services/party";

/**
 * The signing page behind a session: signed out, to sign-in and back here;
 * an email still to prove, to that step first (ED-1) — the rule every
 * workspace page keeps. The `next` path is taken only when it is a path on
 * this site.
 */
export function SignPage({ requestId, next }: { requestId: string; next: string | null }) {
    const { status, party, needsEmail } = useAuth();
    const router = useRouter();

    React.useEffect(() => {
        if (status === "restoring") return;
        const here = window.location.pathname + window.location.search;
        if (status === "signed-out") router.replace(`/sign-in?next=${encodeURIComponent(here)}`);
        else if (needsEmail) router.replace(`/verify-email?next=${encodeURIComponent(here)}`);
    }, [status, needsEmail, router]);

    if (status !== "signed-in" || needsEmail) {
        return <p className="pt-10 text-sm text-dim">Checking your session…</p>;
    }

    const agreementsHref = party ? `${HOME_OF[party]}/agreements` : "/";
    const back = next ? safeNext(next, agreementsHref) : null;
    return <SigningView requestId={requestId} next={back} agreementsHref={agreementsHref} />;
}
