"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { toast } from "sonner";
import { Panel } from "@/components/workspace/page-heading";
import { brandButton, ErrorNote, KeyRow, Loading, outlineButton } from "@/components/publisher/parts";
import { useLoad } from "@/components/publisher/use-load";
import { messageOf } from "@/lib/api-client";
import { formatMoney, longDate, methodLine, publisherWorkspace, withdrawalStatus } from "@/services/publisher-workspace";

/**
 * DR 12 · 10 · 14/15 · Payout · Pending / Paid (5204:92008, 5204:92177):
 * one withdrawal — waiting on ADX's release, or sent to the bank with the
 * date and the bank's reference. Read off the withdrawal list, which is
 * the only route the payouts module offers a party for its own rows.
 */
export default function PayoutPage() {
    const { id } = useParams<{ id: string }>();
    const { data, error, loading, reload } = useLoad(`payout:${id}`, async () => (await publisherWorkspace.withdrawals()).find((row) => row.id === id) ?? null);
    const [busy, setBusy] = React.useState(false);

    if (!data && loading) return <Loading label="Loading the payout…" />;
    if (error) return <ErrorNote message={error} onRetry={reload} />;
    if (!data) {
        return (
            <>
                <h1 className="text-2xl font-semibold tracking-tight text-ink">Payout not found</h1>
                <p className="mt-1 text-sm text-dim">There is no payout by that reference on your account.</p>
                <Link href="/publisher/earnings" className={`${outlineButton} mt-6`}>
                    Back to payouts
                </Link>
            </>
        );
    }

    const status = withdrawalStatus(data.status);
    const destination = methodLine(data.method);

    const cancel = async () => {
        if (!window.confirm("Cancel this payout request? The money stays in your wallet.")) return;
        setBusy(true);
        try {
            await publisherWorkspace.cancelWithdrawal(data.id);
            toast.success("Payout request cancelled");
            reload();
        } catch (caught) {
            toast.error(messageOf(caught, "Could not cancel the request."));
        } finally {
            setBusy(false);
        }
    };

    if (status.shelf === "PAID") {
        return (
            <>
                <h1 className="text-2xl font-semibold tracking-tight text-ink">Payout details</h1>
                <p className="mt-1 text-sm text-dim">{data.reference}</p>
                <Panel className="mt-6">
                    <p className="text-base font-semibold text-ink">
                        {formatMoney(data.netAmount)} · <span className="text-success">Paid</span>
                    </p>
                    <p className="mt-2 text-sm text-dim">This payout was sent to your bank account{data.paidAt ? ` on ${longDate(data.paidAt, { month: "long" })}` : ""}.</p>
                    <div className="mt-2">
                        <KeyRow label="Payout" value={data.reference} strong />
                        <KeyRow label="Requested on" value={longDate(data.requestedAt)} strong />
                        <KeyRow label="Space earnings paid" value={formatMoney(data.netAmount)} strong />
                        <KeyRow label="Destination" value={destination} strong />
                        <KeyRow label="Payout date" value={longDate(data.paidAt)} strong />
                        {data.railReference && <KeyRow label="Bank reference" value={data.railReference} strong />}
                    </div>
                    <h2 className="mt-4 text-base font-semibold text-ink">Cannot find this payment?</h2>
                    <p className="mt-2 text-sm text-dim">Check the destination account, then contact support with the payout reference above.</p>
                </Panel>
                <div className="mt-6 flex flex-wrap gap-3">
                    <Link href="/publisher/earnings" className={brandButton}>
                        Back to payouts
                    </Link>
                    <Link href="/publisher/earnings#statements" className={outlineButton}>
                        View statements
                    </Link>
                    <Link href={`/publisher/help/new?type=payout&ref=${data.id}`} className={outlineButton}>
                        Get payout help
                    </Link>
                </div>
            </>
        );
    }

    if (status.shelf === "CLOSED") {
        return (
            <>
                <h1 className="text-2xl font-semibold tracking-tight text-ink">Payout {status.label.toLowerCase()}</h1>
                <p className="mt-1 text-sm text-dim">{data.reference}</p>
                <Panel className="mt-6">
                    <p className="text-base font-semibold text-ink">
                        {formatMoney(data.netAmount)} · <span className="text-danger">{status.label}</span>
                    </p>
                    <p className="mt-2 text-sm text-dim">{data.failureReason ?? data.decisionNote ?? (data.status === "CANCELLED" ? "You cancelled this request. The money stayed in your wallet." : "This payout was not released. The money stays in your wallet.")}</p>
                    <div className="mt-2">
                        <KeyRow label="Requested on" value={longDate(data.requestedAt)} strong />
                        {data.decidedAt && <KeyRow label="Decided on" value={longDate(data.decidedAt)} strong />}
                        <KeyRow label="Destination account" value={destination} strong />
                    </div>
                </Panel>
                <div className="mt-6 flex flex-wrap gap-3">
                    <Link href="/publisher/earnings" className={brandButton}>
                        Back to payouts
                    </Link>
                    <Link href={`/publisher/help/new?type=payout&ref=${data.id}`} className={outlineButton}>
                        Get payout help
                    </Link>
                </div>
            </>
        );
    }

    return (
        <>
            <h1 className="text-2xl font-semibold tracking-tight text-ink">Payout pending release</h1>
            <p className="mt-1 text-sm text-dim">{data.reference}</p>
            <Panel className="mt-6">
                <p className="text-base font-semibold text-ink">
                    {formatMoney(data.netAmount)} · {status.label}
                </p>
                <p className="mt-2 text-sm text-dim">{data.status === "REQUESTED" ? "This payout is awaiting ADX's review. It is released to your bank once the request is approved." : data.status === "APPROVED" ? "ADX approved this payout. It is being sent to your bank." : "This payout is on its way to your bank."}</p>
                <div className="mt-2">
                    <KeyRow label="Requested on" value={longDate(data.requestedAt)} strong />
                    <KeyRow label="Amount" value={formatMoney(data.amount)} strong />
                    {data.decisionNote && <KeyRow label="Note from ADX" value={data.decisionNote} strong />}
                    <KeyRow label="Destination account" value={destination} strong />
                </div>
            </Panel>
            <div className="mt-6 flex flex-wrap gap-3">
                <Link href="/publisher/bookings" className={brandButton}>
                    View bookings
                </Link>
                <Link href="/publisher/earnings" className={outlineButton}>
                    Back to payouts
                </Link>
                <Link href={`/publisher/help/new?type=payout&ref=${data.id}`} className={outlineButton}>
                    Get payout help
                </Link>
                {data.status === "REQUESTED" && (
                    <button type="button" onClick={cancel} disabled={busy} className={`${outlineButton} text-danger`}>
                        {busy ? "Cancelling…" : "Cancel request"}
                    </button>
                )}
            </div>
        </>
    );
}
