"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { CheckCircle2, Loader2 } from "lucide-react";
import { AuthCard, AuthTitle, primaryButton } from "@/components/auth/auth-card";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { DIGILOCKER_RETURN_KEY, digilockerBackHref, SESSION_COPY, verification, type SessionCaseType } from "@/services/verification";

/** The note the session screen left before going to DigiLocker, read once and cleared. */
function takeReturnNote(): string | null {
    try {
        const note = window.sessionStorage.getItem(DIGILOCKER_RETURN_KEY);
        window.sessionStorage.removeItem(DIGILOCKER_RETURN_KEY);
        return note;
    } catch {
        return null;
    }
}

/**
 * Cashfree Phase 2 — where DigiLocker sends the person back
 * (`/verify/digilocker-return?session=<id>`). On the website it asks ADX
 * what DigiLocker said (`…/digilocker/refresh`) and sends the person back
 * to the verify page they came from — kept in sessionStorage before they
 * left, else the verify page of the session's own account — with the
 * session open. Whatever the refresh answered, the session screen there
 * shows it; a refresh that failed is read again there.
 *
 * With `&app=1` the person came from one of the apps' in-app browsers: the
 * page says so (C-DL-RETURN-APP) and calls nothing — the app reads the
 * answer itself when it comes back to the front.
 */
export function DigilockerReturn() {
    const search = useSearchParams();
    const router = useRouter();
    const { status } = useAuth();
    const sessionId = search.get("session");
    const fromApp = search.get("app") === "1";
    const [failed, setFailed] = React.useState(false);
    const started = React.useRef(false);

    React.useEffect(() => {
        if (fromApp || !sessionId || started.current) return;
        if (status === "restoring") return;
        started.current = true;
        if (status === "signed-out") {
            router.replace(`/sign-in?next=${encodeURIComponent(`/verify/digilocker-return?session=${sessionId}`)}`);
            return;
        }
        const note = takeReturnNote();
        let caseType: SessionCaseType | null = null;
        void (async () => {
            try {
                caseType = (await verification.refreshDigilocker(sessionId)).session.caseType;
            } catch {
                // Not decided here: the session screen reads it again. The account's page is still worth finding.
                caseType = await verification.session(sessionId).then(
                    (session) => session.caseType,
                    () => null
                );
            }
            const back = digilockerBackHref(note, sessionId, caseType);
            if (back) router.replace(back);
            else setFailed(true);
        })();
    }, [fromApp, sessionId, status, router]);

    if (fromApp) {
        return (
            <AuthCard>
                <div className="flex flex-col items-center text-center">
                    <CheckCircle2 className="size-10 text-success" aria-hidden />
                    <p className="mt-4 text-base font-semibold text-ink">{SESSION_COPY.digilockerReturnApp}</p>
                </div>
            </AuthCard>
        );
    }

    if (!sessionId || failed) {
        return (
            <AuthCard>
                <AuthTitle title={SESSION_COPY.title} subtitle="We couldn't find the identity check to go back to. Open your verification page to carry on." />
                <Link href="/choose-workspace" className={cn(primaryButton, "mt-6")}>
                    Go to my account
                </Link>
            </AuthCard>
        );
    }

    return (
        <AuthCard>
            <p role="status" className="flex items-center justify-center gap-2 text-sm text-dim">
                <Loader2 className="size-4 animate-spin" aria-hidden />
                {SESSION_COPY.digilockerWaiting}
            </p>
        </AuthCard>
    );
}
