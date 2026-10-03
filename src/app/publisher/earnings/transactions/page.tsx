"use client";

import * as React from "react";
import Link from "next/link";
import { Panel } from "@/components/workspace/page-heading";
import { Chip, Crumbs, ErrorNote, Loading, outlineButton, Segmented } from "@/components/publisher/parts";
import { messageOf } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { chipTypes, ENTRY_LABEL, hasMore, isCredit, monthOf, publisherMoney, signedAmount, TRANSACTION_CHIPS } from "@/services/publisher-money";
import { formatMoney, longDate, type WalletEntry } from "@/services/publisher-workspace";

const PAGE = 50;

/**
 * Transactions — the app's wallet ledger (DR 04 4199:2344) on the web:
 * every entry newest first under its month, what it was, the note, the
 * amount with its sign and the balance the ledger recorded after it. The
 * chips are the server's `?type=` unions; paging is by cursor, and a page
 * shorter than asked for is the beginning of the wallet.
 */
export default function TransactionsPage() {
    const [chip, setChip] = React.useState("ALL");
    const [state, setState] = React.useState<{ chip: string; rows: WalletEntry[]; more: boolean } | null>(null);
    const [error, setError] = React.useState<string | null>(null);
    const [busy, setBusy] = React.useState(false);
    const [round, setRound] = React.useState(0);

    React.useEffect(() => {
        let active = true;
        publisherMoney
            .entries({ limit: PAGE, type: chipTypes(chip) })
            .then((rows) => {
                if (!active) return;
                setState({ chip, rows, more: hasMore(rows, PAGE) });
                setError(null);
            })
            .catch((caught: unknown) => {
                if (active) setError(messageOf(caught, "Could not read your transactions."));
            });
        return () => {
            active = false;
        };
    }, [chip, round]);

    const shown = state?.chip === chip ? state : null;

    const loadMore = async () => {
        const last = shown?.rows[shown.rows.length - 1];
        if (!shown || !last) return;
        setBusy(true);
        setError(null);
        try {
            const page = await publisherMoney.entries({ limit: PAGE, cursor: last.id, type: chipTypes(chip) });
            setState({ chip, rows: [...shown.rows, ...page], more: hasMore(page, PAGE) });
        } catch (caught) {
            setError(messageOf(caught, "Could not load any more."));
        } finally {
            setBusy(false);
        }
    };

    return (
        <>
            <Crumbs items={[{ label: "Earnings", href: "/publisher/earnings" }, { label: "Transactions" }]} />
            <h1 className="mt-6 text-2xl font-semibold tracking-tight text-ink">Transactions</h1>
            <p className="mt-1 text-sm text-dim">Every movement on your wallet, newest first, with the balance after each one.</p>

            <div className="mt-6">
                <Segmented label="Kinds of movement" value={chip} onChange={setChip} options={TRANSACTION_CHIPS.map((row) => ({ value: row.value, label: row.label }))} />
            </div>
            <p className="mt-2 text-xs text-dim">There is no commission line: your wallet is credited net of ADX&apos;s commission, and Statements shows it per campaign-day.</p>

            {error && (
                <div className="mt-4">
                    <ErrorNote message={error} onRetry={() => setRound((r) => r + 1)} />
                </div>
            )}

            <div className="mt-4">
                {!shown && !error && <Loading label="Loading your transactions…" />}
                {shown && shown.rows.length === 0 && (
                    <Panel>
                        <p className="text-sm text-dim">{chip === "ALL" ? "Nothing yet. Earnings appear here a day at a time as a campaign runs, and a withdrawal appears the day ADX approves it." : "Nothing of that kind has moved through your wallet yet."}</p>
                    </Panel>
                )}
                {shown && shown.rows.length > 0 && (
                    <div className="overflow-hidden rounded-lg border border-line bg-white">
                        {shown.rows.map((entry, index) => {
                            const month = monthOf(entry.createdAt);
                            const newMonth = index === 0 || month !== monthOf(shown.rows[index - 1]!.createdAt);
                            return (
                                <React.Fragment key={entry.id}>
                                    {newMonth && <p className="border-b border-line bg-[#f5f5f3] px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-dim">{month}</p>}
                                    <div className="flex items-center gap-4 border-b border-line px-4 py-3 last:border-b-0">
                                        <div className="min-w-0 flex-1">
                                            <p className="truncate text-sm font-medium text-ink">{ENTRY_LABEL[entry.type] ?? entry.type}</p>
                                            <p className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-dim">
                                                <span className="rounded bg-ground px-1.5 py-0.5">{longDate(entry.createdAt)}</span>
                                                {(entry.note ?? entry.reference) && <span className="truncate">{entry.note ?? entry.reference}</span>}
                                                {entry.isGoodwill && <Chip tone="info">Not withdrawable</Chip>}
                                            </p>
                                        </div>
                                        <div className="text-right">
                                            <p className={cn("whitespace-nowrap text-sm font-semibold tabular-nums", isCredit(entry) ? "text-success" : "text-ink")}>{signedAmount(entry)}</p>
                                            <p className="whitespace-nowrap text-xs text-dim">Balance {formatMoney(entry.balanceAfter, { paise: "always" })}</p>
                                        </div>
                                    </div>
                                </React.Fragment>
                            );
                        })}
                    </div>
                )}
                {shown && shown.more && (
                    <div className="mt-4 text-center">
                        <button type="button" onClick={() => void loadMore()} disabled={busy} className={outlineButton}>
                            {busy ? "Loading…" : "Load more"}
                        </button>
                    </div>
                )}
                {shown && !shown.more && shown.rows.length > 0 && <p className="mt-4 text-center text-xs text-dim">That is the whole wallet, back to {longDate(shown.rows[shown.rows.length - 1]!.createdAt)}.</p>}
            </div>

            <div className="mt-6">
                <Link href="/publisher/earnings" className={outlineButton}>
                    Back to earnings
                </Link>
            </div>
        </>
    );
}
