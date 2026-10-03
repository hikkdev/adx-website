"use client";

import * as React from "react";
import Link from "next/link";
import { Markdown } from "@/components/platform/markdown";
import { messageOf } from "@/lib/api-client";
import { useAuth } from "@/lib/auth";
import { cleanTitle, effectiveLine, isPublicAgreement, legalService, withoutLeadingTitle, type AgreementKind, type AgreementText } from "@/services/legal";

/**
 * A platform agreement's live text. The party-facing platform terms are
 * public (26 Sep 2026, `GET /legal/agreements/:kind`) and read signed out
 * too; the rest (`GET /agreements/current/:kind`) need a session, and
 * signed out the page says so and offers the sign-in that comes straight
 * back here.
 */
export function AgreementReader({ kind, label }: { kind: AgreementKind; label: string }) {
    const { status } = useAuth();
    const open = isPublicAgreement(kind);
    const [state, setState] = React.useState<{ kind: "loading" } | { kind: "ready"; text: AgreementText } | { kind: "none" } | { kind: "error"; message: string }>({ kind: "loading" });

    React.useEffect(() => {
        if (!open && status !== "signed-in") return;
        let cancelled = false;
        legalService
            .agreement(kind)
            .then((text) => {
                if (!cancelled) setState(text ? { kind: "ready", text } : { kind: "none" });
            })
            .catch((caught: unknown) => {
                if (!cancelled) setState({ kind: "error", message: messageOf(caught, "Could not read this agreement. Try again in a moment.") });
            });
        return () => {
            cancelled = true;
        };
    }, [status, kind, open]);

    if (!open && status === "restoring") return <p className="text-sm text-dim">Checking your session…</p>;

    if (!open && status === "signed-out") {
        return (
            <>
                <h1 className="text-[34px] font-bold leading-tight tracking-tight text-ink">{label}</h1>
                <div className="mt-6 rounded-lg border border-line bg-white px-6 py-5">
                    <p className="text-[15px] text-ink">Sign in to read the version in force.</p>
                    <p className="mt-1 text-sm text-dim">ADX shows its platform agreements to signed-in accounts. You read the text again, in full, before you accept it.</p>
                    <Link href={`/sign-in?next=${encodeURIComponent(`/legal/${kind}`)}`} className="mt-4 inline-flex h-10 items-center rounded-md bg-brand px-5 text-sm font-semibold text-white hover:bg-[#a51b1b]">
                        Sign in to read
                    </Link>
                </div>
            </>
        );
    }

    if (state.kind === "loading") return <p className="text-sm text-dim">Reading the agreement…</p>;

    if (state.kind === "none" || state.kind === "error") {
        return (
            <>
                <h1 className="text-[34px] font-bold leading-tight tracking-tight text-ink">{label}</h1>
                <p className="mt-3 text-[16px] text-dim">{state.kind === "none" ? "ADX has not published this agreement yet. It will appear here as soon as it is." : state.message}</p>
            </>
        );
    }

    const meta = effectiveLine(state.text.activatedAt ?? null, state.text.version);
    const placeholder = /placeholder/i.test(state.text.title);
    return (
        <>
            <article className="site-doc">
                <h1>{cleanTitle(state.text.title) || label}</h1>
                {meta && <p className="meta">{meta}.</p>}
                {placeholder && (
                    <div className="box">
                        <p className="!m-0 text-[15px]">ADX Legal has not published the final text of this agreement yet; what follows is a placeholder.</p>
                    </div>
                )}
            </article>
            <Markdown source={withoutLeadingTitle(state.text.body, state.text.title || label)} />
        </>
    );
}
