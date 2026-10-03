"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, ExternalLink, FileText, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { brandButton, Chip, outlineButton, quietLink } from "@/components/publisher/parts";
import { saveFile } from "@/components/agreements/download";
import { messageOf } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { agreements, closedWords, dayMonthYear, pdfName, SIGNING_POLL_MS, signersLine, signingOpen, signingStatusOf, signMethodLine, type SigningRequest } from "@/services/agreements";

/**
 * DS-1 (Digio eSign) on the web — the app's `SigningScreen`: the one page
 * every signed document is signed from (the licence to display, the
 * insertion order, the print partner's service agreement).
 *
 * The page never signs. It opens Digio's gateway in a new tab and, while
 * the request is open, asks ADX every few seconds — and again the moment
 * this tab is looked at — where it stands (`POST …/refresh`, which asks
 * Digio when its webhook has not spoken). Signed, it hands back to the
 * `next` path the sending page gave; expired, withdrawn or declined, it
 * says what happened and where a fresh one comes from. A request the
 * server opened on the mock rail (no Digio credentials, development) has a
 * "Sign (mock)" door so the flow walks end to end.
 */
export function SigningView({ requestId, next, agreementsHref }: { requestId: string; next: string | null; agreementsHref: string }) {
    const router = useRouter();
    const [request, setRequest] = React.useState<SigningRequest | null>(null);
    const [loadError, setLoadError] = React.useState<string | null>(null);
    const [problem, setProblem] = React.useState<string | null>(null);
    const [busy, setBusy] = React.useState<null | "check" | "mock" | "copy" | "document">(null);
    const [opened, setOpened] = React.useState(false);
    const [tick, setTick] = React.useState(0);
    /** Whether the request was open when this page first read it — only then does a signature hand straight back. */
    const wasOpen = React.useRef(false);
    const handedBack = React.useRef(false);

    React.useEffect(() => {
        let cancelled = false;
        agreements
            .signing(requestId)
            .then((row) => {
                if (cancelled) return;
                wasOpen.current = signingOpen(row.status);
                setRequest(row);
                setLoadError(null);
            })
            .catch((caught: unknown) => {
                if (!cancelled) setLoadError(messageOf(caught, "Could not read the document."));
            });
        return () => {
            cancelled = true;
        };
    }, [requestId, tick]);

    const landed = React.useCallback(
        (row: SigningRequest) => {
            setRequest(row);
            if (row.status !== "COMPLETED" || handedBack.current || !wasOpen.current) return;
            handedBack.current = true;
            toast.success(`${row.label} signed. Your copy is under Agreements.`);
            if (next) router.push(next);
        },
        [next, router]
    );

    const open = Boolean(request && signingOpen(request.status));

    // While the request is open, ask ADX every few seconds, and at once when the tab comes back into view.
    React.useEffect(() => {
        if (!open) return undefined;
        let stopped = false;
        const ask = async () => {
            try {
                const row = await agreements.refresh(requestId);
                if (!stopped) landed(row);
            } catch {
                /* a missed poll is not news; the next one asks again */
            }
        };
        const timer = window.setInterval(() => void ask(), SIGNING_POLL_MS);
        const onVisible = () => {
            if (document.visibilityState === "visible") void ask();
        };
        document.addEventListener("visibilitychange", onVisible);
        return () => {
            stopped = true;
            window.clearInterval(timer);
            document.removeEventListener("visibilitychange", onVisible);
        };
    }, [open, requestId, landed]);

    const act = async (kind: "check" | "mock", run: () => Promise<SigningRequest>) => {
        setBusy(kind);
        setProblem(null);
        try {
            landed(await run());
        } catch (caught) {
            setProblem(messageOf(caught, kind === "mock" ? "The mock signature did not go through." : "Could not check with ADX."));
        } finally {
            setBusy(null);
        }
    };

    const download = async (kind: "copy" | "document") => {
        if (!request) return;
        const fileId = kind === "copy" ? request.files.signed : request.files.document;
        if (!fileId) return;
        setBusy(kind);
        setProblem(null);
        try {
            await saveFile(fileId, pdfName(request.title, kind === "copy"));
        } catch (caught) {
            setProblem(messageOf(caught, "Could not download the file."));
        } finally {
            setBusy(null);
        }
    };

    if (!request) {
        return (
            <Card>
                {loadError ? (
                    <>
                        <p className="text-base font-semibold text-ink">Could not open this document</p>
                        <p role="alert" className="mt-1 text-sm text-dim">
                            {loadError}
                        </p>
                        <div className="mt-5 flex flex-wrap gap-3">
                            <button type="button" onClick={() => setTick((t) => t + 1)} className={brandButton}>
                                Try again
                            </button>
                            <Link href={agreementsHref} className={outlineButton}>
                                My agreements
                            </Link>
                        </div>
                    </>
                ) : (
                    <p role="status" className="flex items-center gap-2 text-sm text-dim">
                        <Loader2 className="size-4 animate-spin" aria-hidden />
                        Reading the document…
                    </p>
                )}
            </Card>
        );
    }

    const signed = request.status === "COMPLETED";
    const status = signingStatusOf(request.status);

    return (
        <Card>
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-wide text-dim">{request.label}</p>
                    <h1 className="mt-1 text-xl font-semibold tracking-tight text-ink">{request.title}</h1>
                    <p className="mt-1 text-sm text-dim">
                        Version {request.templateVersion} · for {request.signer.name}
                        {open ? ` · link good until ${dayMonthYear(request.expiresAt)}` : ""}
                    </p>
                </div>
                <Chip tone={status.tone}>{status.label}</Chip>
            </div>

            {signed ? (
                <div className="mt-6 flex items-start gap-3 rounded-lg bg-success-soft px-4 py-4">
                    <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-success" aria-hidden />
                    <div>
                        <p className="text-sm font-semibold text-success">Signed{request.completedAt ? ` on ${dayMonthYear(request.completedAt)}` : ""}</p>
                        <p className="mt-0.5 text-sm text-ink">Every party has signed. Your copy stays under Agreements.</p>
                    </div>
                </div>
            ) : open ? (
                <>
                    <p className="mt-6 text-sm text-ink">{signMethodLine(request.signMethod)}</p>
                    <div className="mt-5 flex flex-wrap items-center gap-3">
                        {request.signingUrl ? (
                            <a href={request.signingUrl} target="_blank" rel="noopener noreferrer" onClick={() => setOpened(true)} className={cn(brandButton, "gap-2")}>
                                {opened ? "Open the signing page again" : "Open and sign"}
                                <ExternalLink className="size-4" aria-hidden />
                            </a>
                        ) : (
                            <span className="text-sm text-dim">{request.mock ? "This server has no Digio connection — use the mock signature below." : "The signing page is not ready yet. Check again in a moment."}</span>
                        )}
                        <button type="button" onClick={() => void act("check", () => agreements.refresh(requestId))} disabled={busy !== null} className={outlineButton}>
                            {busy === "check" ? "Checking…" : "I have signed — check now"}
                        </button>
                    </div>
                    <p role="status" className="mt-4 flex items-center gap-2 text-sm text-dim">
                        <Loader2 className="size-4 animate-spin" aria-hidden />
                        {opened ? "Waiting for Digio… finish the signature in the tab that opened, then come back here." : "ADX hears from Digio the moment you sign; this page updates by itself."}
                    </p>
                    {request.signers.length > 1 && <p className="mt-2 text-xs text-dim">{signersLine(request.signers)}</p>}
                    {request.mock && (
                        <div className="mt-5 rounded-md border border-dashed border-line bg-ground px-4 py-3">
                            <p className="text-xs text-dim">Development server: no Digio credentials, so this request signs from here.</p>
                            <button type="button" onClick={() => void act("mock", () => agreements.mockSign(requestId))} disabled={busy !== null} className={cn(outlineButton, "mt-2 h-9 px-4")}>
                                {busy === "mock" ? "Signing…" : "Sign (mock)"}
                            </button>
                        </div>
                    )}
                </>
            ) : (
                <div className="mt-6 rounded-lg bg-ground px-4 py-4">
                    <p className="text-sm font-semibold text-ink">{closedWords(request).title}</p>
                    <p className="mt-1 text-sm text-dim">{closedWords(request).text}</p>
                </div>
            )}

            {problem && (
                <p role="alert" className="mt-4 text-sm text-danger">
                    {problem}
                </p>
            )}

            <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-line pt-5">
                {signed && next && (
                    <Link href={next} className={brandButton}>
                        Continue
                    </Link>
                )}
                {signed && request.files.signed && (
                    <button type="button" onClick={() => void download("copy")} disabled={busy !== null} className={cn(signed && next ? outlineButton : brandButton, "gap-2")}>
                        <FileText className="size-4" aria-hidden />
                        {busy === "copy" ? "Downloading…" : "Download my signed copy"}
                    </button>
                )}
                {!signed && request.files.document && (
                    <button type="button" onClick={() => void download("document")} disabled={busy !== null} className={cn(outlineButton, "gap-2")}>
                        <FileText className="size-4" aria-hidden />
                        {busy === "document" ? "Downloading…" : "Download the document"}
                    </button>
                )}
                {!signed && next && (
                    <Link href={next} className={quietLink}>
                        Back
                    </Link>
                )}
                <Link href={agreementsHref} className={cn(quietLink, "ml-auto")}>
                    My agreements
                </Link>
            </div>
        </Card>
    );
}

function Card({ children }: { children: React.ReactNode }) {
    return <section className="w-full max-w-[640px] rounded-xl border border-line bg-white p-6 shadow-card sm:p-8">{children}</section>;
}
