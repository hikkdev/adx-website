"use client";

import * as React from "react";
import Link from "next/link";
import { messageOf } from "@/lib/api-client";
import { PageHeading, Panel } from "@/components/workspace/page-heading";
import { useAdvertiser } from "@/app/advertiser/layout";
import { btnOutline, ErrorPanel, LoadingLine, StatusChip, useAsync } from "@/components/advertiser/bits";
import { entryDate, inr, REFUND_DESTINATION, refundPaidLine, refundReasonLabel, refundRequestStatus, refundRequestsSummary, walletService, type RefundRequest } from "@/services/wallet";

const PAGE_SIZE = 20;

/**
 * Refund requests — the app's refund-requests screen (E6): every request
 * raised against this wallet, over `GET /advertisers/:id/wallet/refund-requests`
 * — the refund desk's own rows, scoped to this account. Each says where the
 * money goes, how much, where the desk stands on it, the consent recorded for
 * a cash-out, and for a paid bank transfer the UTR and the day it went.
 *
 * Raising one is not a button here, exactly as in the app: `POST
 * /advertisers/:id/wallet/refund-requests` is ADMIN-only — ADX support raises
 * it when you ask, and a refund to the bank carries your recorded consent.
 * The door is a support request.
 */
export default function RefundRequestsPage() {
    const advertiser = useAdvertiser();
    const advertiserId = advertiser?.id ?? null;
    const state = useAsync(`refunds:${advertiserId ?? ""}`, async () => (advertiserId ? walletService.refundRequests(advertiserId, { pageSize: PAGE_SIZE }) : null), "Could not load your refund requests.");

    const heading = (
        <>
            <Link href="/advertiser/billing" className="text-sm text-ink hover:text-brand">
                Back to wallet & billing
            </Link>
            <div className="mt-3 border-t border-line pt-5">
                <PageHeading
                    title="Refund requests"
                    subtitle="Every refund asked for on this account, and what happened to it."
                    actions={
                        <Link href="/advertiser/requests/new?topic=PAYMENT" className={btnOutline}>
                            Ask for a refund
                        </Link>
                    }
                />
            </div>
        </>
    );

    if (state.kind === "loading" || (state.kind === "ready" && !state.value)) {
        return (
            <>
                {heading}
                <div className="mt-6">
                    <LoadingLine>Loading your refund requests…</LoadingLine>
                </div>
            </>
        );
    }
    if (state.kind === "error") {
        return (
            <>
                {heading}
                <ErrorPanel title="Could not load your refund requests" message={state.message} />
                <button type="button" onClick={state.reload} className={`${btnOutline} mt-4`}>
                    Try again
                </button>
            </>
        );
    }

    return (
        <>
            {heading}
            <RefundList key={advertiserId} advertiserId={advertiserId!} first={state.value!.items} total={state.value!.total} />
        </>
    );
}

function RefundList({ advertiserId, first, total }: { advertiserId: string; first: RefundRequest[]; total: number }) {
    const [rows, setRows] = React.useState(first);
    const [page, setPage] = React.useState(1);
    const [busy, setBusy] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);

    const more = async () => {
        setBusy(true);
        setError(null);
        try {
            const next = await walletService.refundRequests(advertiserId, { page: page + 1, pageSize: PAGE_SIZE });
            setRows((current) => [...current, ...next.items.filter((row) => !current.some((c) => c.id === row.id))]);
            setPage((p) => p + 1);
        } catch (caught) {
            setError(messageOf(caught, "Could not load more requests."));
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
            <div className="min-w-0">
                <p className="text-xs text-dim">{refundRequestsSummary(rows, total)}</p>
                <div className="mt-3 space-y-3">
                    {rows.length === 0 ? (
                        <Panel>
                            <p className="text-sm font-medium text-ink">No refund has been requested on this account</p>
                            <p className="mt-1 text-sm text-dim">One is raised by ADX support when you ask for money back — a cancelled campaign's unused days, a site that let you down, or credit left over when you leave.</p>
                        </Panel>
                    ) : (
                        rows.map((row) => <RefundCard key={row.id} row={row} />)
                    )}
                </div>
                {error && (
                    <p role="alert" className="mt-3 text-sm text-danger">
                        {error}
                    </p>
                )}
                {rows.length < total && (
                    <div className="mt-4 flex justify-center">
                        <button type="button" onClick={() => void more()} disabled={busy} className={btnOutline}>
                            {busy ? "Loading…" : "Load more"}
                        </button>
                    </div>
                )}
            </div>

            <div className="grid grid-cols-1 content-start gap-4">
                <section className="rounded-lg border border-line bg-white p-5">
                    <h2 className="text-sm font-semibold text-ink">Asking for money back</h2>
                    <p className="mt-2 text-xs text-dim">Create a payment request and say how much, why, and where the money should go. ADX support raises the refund; an admin who did not raise it decides it — nothing about it is automatic.</p>
                    <ul className="mt-3 space-y-2 text-xs text-dim">
                        <li>
                            <span className="font-medium text-ink">To your wallet</span> — the amount is released back to spend.
                        </li>
                        <li>
                            <span className="font-medium text-ink">To your bank account</span> — it leaves your wallet on approval and ADX finance pays it to a verified account in your name. ADX records your consent to the cash-out on the request.
                        </li>
                    </ul>
                    <p className="mt-3 text-xs text-dim">A refund is capped at what was actually paid onto the account, less anything already refunded. ADX credits (goodwill) cannot come back as money. While a refund is decided its amount is held.</p>
                    <Link href="/advertiser/requests/new?topic=PAYMENT" className={`${btnOutline} mt-4 w-full`}>
                        Create a request
                    </Link>
                </section>
            </div>
        </div>
    );
}

function RefundCard({ row }: { row: RefundRequest }) {
    const status = refundRequestStatus(row.status);
    const paid = refundPaidLine(row);
    return (
        <article className="rounded-lg border border-line bg-white p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                    <p className="text-sm font-semibold text-ink">{REFUND_DESTINATION[row.destination] ?? row.destination}</p>
                    <p className="mt-0.5 text-xs text-dim">
                        Requested {entryDate(row.createdAt)} · {refundReasonLabel(row.reason)}
                    </p>
                </div>
                <div className="text-right">
                    <p className="text-lg font-semibold tabular-nums text-ink">{inr(row.amount)}</p>
                    <StatusChip label={status.label} tone={status.tone} className="mt-1" />
                </div>
            </div>
            {row.note && <p className="mt-3 text-sm text-ink">{row.note}</p>}
            {row.consentNote && <p className="mt-2 text-xs text-dim">Your agreement: {row.consentNote}</p>}
            {paid && <p className="mt-2 text-xs text-dim">{paid}</p>}
            {row.decisionNote && (row.status === "REJECTED" || row.status === "FAILED") && <p className="mt-2 text-xs text-dim">{row.decisionNote}</p>}
            {row.decidedAt && row.status !== "PENDING" && <p className="mt-2 text-xs text-dim">Decided {entryDate(row.decidedAt)}</p>}
        </article>
    );
}
