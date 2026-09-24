"use client";

import * as React from "react";
import { api, ApiError, messageOf } from "@/lib/api-client";

interface AgreementText {
    id: string;
    kind: string;
    version: number;
    title: string;
    /** Markdown, as ADX published it. */
    body: string;
}

/**
 * QR-6: the ADX publisher agreement, presented when a submit is refused
 * with AGREEMENT_REQUIRED. The text is the live version (`GET
 * /agreements/current/PLATFORM`); the click is recorded through
 * `POST /supply/agreements/accept-platform` with the publisher's own id,
 * exactly as the app records it, and the submit is tried again.
 */
export function AgreementGate({ onAccepted, onClose }: { onAccepted: () => void; onClose: () => void }) {
    const [text, setText] = React.useState<{ loaded: boolean; agreement: AgreementText | null; error: string | null }>({ loaded: false, agreement: null, error: null });
    const [busy, setBusy] = React.useState(false);
    const [problem, setProblem] = React.useState<string | null>(null);
    const [read, setRead] = React.useState(false);

    React.useEffect(() => {
        let cancelled = false;
        api.get<AgreementText>("/agreements/current/PLATFORM")
            .then((agreement) => {
                if (!cancelled) setText({ loaded: true, agreement, error: null });
            })
            .catch((caught: unknown) => {
                if (!cancelled) setText({ loaded: true, agreement: null, error: caught instanceof ApiError && caught.status === 404 ? "ADX has not published the publisher agreement yet, so there is nothing to accept. Try again in a moment." : messageOf(caught, "Could not read the agreement.") });
            });
        return () => {
            cancelled = true;
        };
    }, []);

    const accept = async () => {
        setBusy(true);
        setProblem(null);
        try {
            const me = await api.get<{ id: string }>("/publishers/me");
            await api.post("/supply/agreements/accept-platform", { publisherId: me.id });
            onAccepted();
        } catch (caught) {
            setProblem(messageOf(caught, "Could not record your acceptance."));
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4" role="dialog" aria-modal="true" aria-labelledby="agreement-title">
            <div className="flex max-h-[85vh] w-full max-w-[720px] flex-col rounded-xl border border-line bg-white shadow-card">
                <div className="border-b border-line px-6 py-5">
                    <h2 id="agreement-title" className="text-lg font-semibold text-ink">
                        {text.agreement?.title ?? "ADX publisher agreement"}
                    </h2>
                    <p className="mt-1 text-sm text-dim">Read and accept the ADX publisher agreement to send this listing for review. It is saved as a draft until then.</p>
                </div>
                <div className="min-h-0 flex-1 overflow-auto px-6 py-5 text-sm leading-6 text-ink" onScroll={(event) => {
                    const el = event.currentTarget;
                    if (el.scrollHeight - el.scrollTop - el.clientHeight < 40) setRead(true);
                }}>
                    {!text.loaded && <p className="text-dim">Loading the agreement…</p>}
                    {text.error && <p className="text-dim">{text.error}</p>}
                    {text.agreement && <pre className="whitespace-pre-wrap font-sans">{text.agreement.body}</pre>}
                </div>
                {problem && <p className="px-6 pb-2 text-sm text-danger">{problem}</p>}
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-6 py-4">
                    <button type="button" onClick={onClose} className="inline-flex h-10 items-center rounded-md border border-line bg-white px-5 text-sm font-semibold text-ink hover:border-ink">
                        Not now
                    </button>
                    <div className="flex items-center gap-3">
                        {text.agreement && <span className="text-xs text-dim">Version {text.agreement.version}{read ? "" : " · scroll to the end to accept"}</span>}
                        <button type="button" onClick={() => void accept()} disabled={!text.agreement || busy || !read} className="inline-flex h-10 items-center rounded-md bg-brand px-5 text-sm font-semibold text-white hover:bg-brand/90 disabled:opacity-50">
                            {busy ? "Recording…" : "I accept"}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
