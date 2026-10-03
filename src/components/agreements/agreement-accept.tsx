"use client";

import * as React from "react";
import { brandButton, outlineButton } from "@/components/publisher/parts";
import { AgreementBody } from "@/components/agreements/agreement-text";
import { ApiError, messageOf } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { agreements, withSchedule, type AgreementKind, type AgreementText, type PlatformKind } from "@/services/agreements";

const PLATFORM_KINDS: readonly string[] = ["PLATFORM", "ADVERTISER_PLATFORM"];

const DEFAULT_TITLE: Partial<Record<AgreementKind, string>> = {
    PLATFORM: "ADX publisher agreement",
    ADVERTISER_PLATFORM: "ADX advertiser agreement",
    INSERTION_ORDER: "Insertion order",
    PACKAGE_SALE: "Package terms",
};

/**
 * The live, versioned text of an agreement and the click that accepts it —
 * the app's `AgreementScreen` (U8) and `AgreementSheet` (Lot D, Q123) as one
 * web block, for any page to place.
 *
 * The text is `GET /agreements/current/:kind`, shown whole before the click.
 * For the two platform kinds the click is recorded with the party's own
 * endpoint, as the app records it — `POST /supply/agreements/accept-platform`
 * for a publisher, `POST /advertisers/:id/agreements/platform` for an
 * advertiser. Any other kind (an insertion order, a package's terms) is
 * recorded by the transaction's own module, so the caller hands `record`.
 * `onAccepted` gets what the server answered — an insertion order may answer
 * a signing request (`{ accepted: false, signing: { id } }`), which the
 * caller sends to `/sign/<id>`.
 *
 * While ADX has published nothing for the kind there is nothing to accept:
 * the block says so, and `onSkip` (when given) lets the person carry on.
 */
export function AgreementAccept({
    kind,
    onAccepted,
    record,
    schedule = null,
    onSkip,
    onCancel,
    acceptLabel = "I accept",
    intro,
    className,
}: {
    kind: AgreementKind;
    /** Called once the server has the acceptance, with its answer. */
    onAccepted: (answer: unknown) => void;
    /** Records the click for a non-platform kind (the transaction's own route). */
    record?: () => Promise<unknown>;
    /** Printed where an insertion order's template asks for `{{spots}}`. */
    schedule?: string | null;
    /** Offered as "Continue" while nothing is published. */
    onSkip?: () => void;
    /** A "Not now" beside the accept button. */
    onCancel?: () => void;
    acceptLabel?: string;
    /** One line over the text: why it is asked now. */
    intro?: string;
    className?: string;
}) {
    const [state, setState] = React.useState<{ kind: string; loaded: boolean; text: AgreementText | null; error: string | null }>({ kind, loaded: false, text: null, error: null });
    const [tick, setTick] = React.useState(0);
    const [busy, setBusy] = React.useState(false);
    const [problem, setProblem] = React.useState<string | null>(null);
    const [unpublished, setUnpublished] = React.useState(false);

    React.useEffect(() => {
        let cancelled = false;
        agreements
            .current(kind)
            .then((text) => {
                if (!cancelled) setState({ kind, loaded: true, text, error: null });
            })
            .catch((caught: unknown) => {
                if (!cancelled) setState({ kind, loaded: true, text: null, error: messageOf(caught, "Could not read the agreement.") });
            });
        return () => {
            cancelled = true;
        };
    }, [kind, tick]);

    const loaded = state.kind === kind && state.loaded;
    const text = loaded ? state.text : null;
    const nothingPublished = unpublished || (loaded && !state.error && !text);

    const accept = async () => {
        setBusy(true);
        setProblem(null);
        try {
            let answer: unknown;
            if (record) answer = await record();
            else if (PLATFORM_KINDS.includes(kind)) answer = await agreements.acceptPlatform(kind as PlatformKind);
            else throw new Error(`No way to record an acceptance of ${kind} was given.`);
            onAccepted(answer);
        } catch (caught) {
            // 409 (publisher) or 503 (advertiser) NO_ACTIVE_TEMPLATE: nothing is live to accept.
            if (caught instanceof ApiError && caught.code === "NO_ACTIVE_TEMPLATE") setUnpublished(true);
            else setProblem(messageOf(caught, "Could not record your acceptance."));
        } finally {
            setBusy(false);
        }
    };

    const title = text?.title ?? DEFAULT_TITLE[kind] ?? "Agreement";

    return (
        <div className={cn("rounded-lg border border-line bg-white", className)}>
            <div className="border-b border-line px-5 py-4">
                <p className="text-base font-semibold text-ink">{title}</p>
                <p className="mt-0.5 text-xs text-dim">{text ? `Version ${text.version} · the version in force today` : loaded ? "Not published yet" : "Reading the agreement…"}</p>
                {intro && <p className="mt-2 text-sm text-dim">{intro}</p>}
            </div>

            <div className="max-h-[360px] overflow-y-auto px-5 py-4 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-line" tabIndex={0} aria-label={`${title} text`}>
                {!loaded && <p className="text-sm text-dim">Reading the agreement…</p>}
                {loaded && state.error && (
                    <p role="alert" className="text-sm text-danger">
                        {state.error}{" "}
                        <button type="button" onClick={() => setTick((t) => t + 1)} className="font-semibold underline underline-offset-4">
                            Try again
                        </button>
                    </p>
                )}
                {nothingPublished && (
                    <div className="rounded-md bg-info-soft px-4 py-3 text-sm text-info">
                        <p className="font-semibold">Nothing to accept yet</p>
                        <p className="mt-1 text-ink">ADX has not published these terms for your account yet. You can carry on; you will be asked to accept them once they are live.</p>
                    </div>
                )}
                {text && !unpublished && <AgreementBody body={withSchedule(text.body, schedule)} />}
            </div>

            <div className="border-t border-line px-5 py-4">
                {problem && (
                    <p role="alert" className="mb-3 text-sm text-danger">
                        {problem}
                    </p>
                )}
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="max-w-md text-xs text-dim">{text && !nothingPublished ? `Accepting records your name, the time and this device against version ${text.version}.` : null}</p>
                    <div className="flex items-center gap-2">
                        {onCancel && (
                            <button type="button" onClick={onCancel} className={outlineButton}>
                                Not now
                            </button>
                        )}
                        {nothingPublished ? (
                            onSkip && (
                                <button type="button" onClick={onSkip} className={brandButton}>
                                    Continue
                                </button>
                            )
                        ) : (
                            <button type="button" onClick={() => void accept()} disabled={!text || busy} className={brandButton}>
                                {busy ? "Recording…" : acceptLabel}
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
