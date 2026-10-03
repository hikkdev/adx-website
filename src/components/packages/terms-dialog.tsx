"use client";

import * as React from "react";
import { ApiError, messageOf } from "@/lib/api-client";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { btnOutline, btnPrimary, StatusChip } from "@/components/advertiser/bits";
import { packagesService, termsAccepted, type AgreementStanding, type AgreementText } from "@/services/packages";

/**
 * The package terms — Lot D (Q123) — read and accepted before any money
 * moves. The live text is `GET /agreements/current/PACKAGE_SALE`; Accept
 * records the click on the sale (`POST /packages/sales/:id/accept-terms`),
 * where the document is rendered server-side from the live template and the
 * sale. Accept waits until the text has been scrolled to its end, as in the
 * app; a short document has no end to reach.
 */
export function TermsDialog({ open, saleId, standing, onClose, onAccepted }: { open: boolean; saleId: string; standing: AgreementStanding | null; onClose: () => void; onAccepted: () => void }) {
    return (
        <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
            <DialogContent className="flex max-h-[85vh] max-w-[720px] flex-col gap-0 rounded-lg border-line bg-white p-0">{open && <TermsBody saleId={saleId} standing={standing} onClose={onClose} onAccepted={onAccepted} />}</DialogContent>
        </Dialog>
    );
}

function TermsBody({ saleId, standing, onClose, onAccepted }: { saleId: string; standing: AgreementStanding | null; onClose: () => void; onAccepted: () => void }) {
    const [text, setText] = React.useState<{ loaded: boolean; agreement: AgreementText | null; error: string | null }>({ loaded: false, agreement: null, error: null });
    const [read, setRead] = React.useState(false);
    const [busy, setBusy] = React.useState(false);
    const [problem, setProblem] = React.useState<string | null>(null);
    const current = standing !== null && termsAccepted(standing);

    React.useEffect(() => {
        let cancelled = false;
        packagesService
            .termsText()
            .then((agreement) => {
                if (!cancelled) setText({ loaded: true, agreement, error: null });
            })
            .catch((caught: unknown) => {
                if (cancelled) return;
                const error =
                    caught instanceof ApiError && (caught.code === "NO_ACTIVE_TEMPLATE" || caught.status === 404)
                        ? "ADX has not published the plan terms yet, so nothing can be accepted today. Support can say when they land."
                        : messageOf(caught, "Could not load the plan terms.");
                setText({ loaded: true, agreement: null, error });
            });
        return () => {
            cancelled = true;
        };
    }, []);

    /* A document shorter than the box has no bottom to reach. */
    const measure = React.useCallback((element: HTMLDivElement | null) => {
        if (element && element.scrollHeight <= element.clientHeight + 24) setRead(true);
    }, []);

    const accept = async () => {
        setBusy(true);
        setProblem(null);
        try {
            await packagesService.acceptTerms(saleId);
            onAccepted();
        } catch (caught) {
            setProblem(messageOf(caught, "Could not record your acceptance. Try again."));
        } finally {
            setBusy(false);
        }
    };

    return (
        <>
            <DialogHeader className="border-b border-line px-6 py-5 text-left">
                <div className="flex flex-wrap items-start justify-between gap-3 pr-6">
                    <div>
                        <DialogTitle className="text-lg font-semibold text-ink">{text.agreement?.title ?? "Package terms"}</DialogTitle>
                        <DialogDescription className="mt-1 text-sm text-dim">{text.agreement ? `Version ${text.agreement.version} · the text ADX has published` : "The terms this plan is sold on."}</DialogDescription>
                    </div>
                    <StatusChip label={current ? `Accepted v${standing?.templateVersion ?? text.agreement?.version ?? ""}` : standing?.accepted ? "New version" : "Not yet accepted"} tone={current ? "success" : "warning"} />
                </div>
            </DialogHeader>
            <div
                ref={text.agreement ? measure : undefined}
                className="min-h-[160px] flex-1 overflow-auto px-6 py-5 text-sm leading-6 text-ink"
                onScroll={(event) => {
                    const el = event.currentTarget;
                    if (el.scrollHeight - el.scrollTop - el.clientHeight < 40) setRead(true);
                }}
            >
                {!text.loaded && <p className="text-dim">Loading the terms…</p>}
                {text.error && <p className="rounded-md bg-warning-soft px-3 py-2 text-warning">{text.error}</p>}
                {text.agreement && <pre className="whitespace-pre-wrap font-sans">{text.agreement.body}</pre>}
            </div>
            {problem && (
                <p role="alert" className="px-6 pb-2 text-sm text-danger">
                    {problem}
                </p>
            )}
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-6 py-4">
                <button type="button" onClick={onClose} className={btnOutline}>
                    {current ? "Close" : "Not now"}
                </button>
                {!current && (
                    <div className="flex items-center gap-3">
                        {text.agreement && !read && <span className="text-xs text-dim">Scroll to the end to accept.</span>}
                        <button type="button" onClick={() => void accept()} disabled={!text.agreement || busy || !read} className={btnPrimary}>
                            {busy ? "Recording…" : standing?.accepted ? "Accept the current version" : "Accept the package terms"}
                        </button>
                    </div>
                )}
            </div>
        </>
    );
}
