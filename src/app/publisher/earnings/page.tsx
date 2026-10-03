"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { PageHeading, Panel } from "@/components/workspace/page-heading";
import { brandButton, CardTitle, Cell, DataTable, ErrorNote, KeyRow, Loading, outlineButton, quietLink, Segmented, StatusText, TableRow, TitleCell } from "@/components/publisher/parts";
import { useLoad } from "@/components/publisher/use-load";
import { WithdrawDialog } from "@/components/publisher-money/withdraw-dialog";
import { messageOf } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { ENTRY_LABEL, isCredit, publisherMoney, signedAmount, verifiedMethods } from "@/services/publisher-money";
import {
    formatMoney,
    isPositiveMoney,
    longDate,
    methodLine,
    methodStatus,
    openBlob,
    pendingClearsBy,
    publisherWorkspace,
    sumMoney,
    withdrawalStatus,
    type Earnings,
    type PayoutMethod,
    type Statement,
    type WalletEntry,
    type WalletSnapshot,
    type Withdrawal,
} from "@/services/publisher-workspace";

type Tab = "ALL" | "PENDING" | "PAID";

interface Money {
    wallet: WalletSnapshot | null;
    earnings: Earnings | null;
    withdrawals: Withdrawal[];
    methods: PayoutMethod[];
    statements: Statement[];
    entries: WalletEntry[];
}

async function readMoney(): Promise<Money> {
    const [wallet, earnings, withdrawals, methods, statements, entries] = await Promise.all([
        publisherWorkspace.wallet().catch(() => null),
        publisherWorkspace.earnings().catch(() => null),
        publisherWorkspace.withdrawals().catch(() => [] as Withdrawal[]),
        publisherWorkspace.methods().catch(() => [] as PayoutMethod[]),
        publisherWorkspace.statements().catch(() => [] as Statement[]),
        publisherMoney.entries({ limit: 5 }).catch(() => [] as WalletEntry[]),
    ]);
    return { wallet, earnings, withdrawals, methods, statements, entries };
}

export default function EarningsPage() {
    return (
        <React.Suspense fallback={<Loading label="Loading your earnings…" />}>
            <EarningsView />
        </React.Suspense>
    );
}

/**
 * DR 12 · 10 · 13 · Earnings (5204:90526) with the app's wallet on it: the
 * payout history, what is still clearing, what is held and already asked
 * for, the daily cap and what is left of it today, withdrawing only to an
 * account ADX has checked, the latest wallet movements (all of them on
 * Transactions), and the monthly statements with their PDFs, the monthly
 * breakdown and the GST invoice (on Statements).
 */
function EarningsView() {
    const router = useRouter();
    const search = useSearchParams();
    const tab: Tab = search.get("tab") === "pending" ? "PENDING" : search.get("tab") === "paid" ? "PAID" : "ALL";
    const { data, error, loading, reload } = useLoad("money", readMoney);
    const [withdrawOpen, setWithdrawOpen] = React.useState(false);

    if (!data && loading) return <Loading label="Loading your earnings…" />;
    if (!data) return <ErrorNote message={error ?? "Could not read your earnings."} onRetry={reload} />;

    const setTab = (next: Tab) => router.replace(next === "ALL" ? "/publisher/earnings" : `/publisher/earnings?tab=${next.toLowerCase()}`);
    const rows = data.withdrawals.filter((w) => tab === "ALL" || withdrawalStatus(w.status).shelf === tab);
    const paidToDate = sumMoney(data.withdrawals.filter((w) => w.status === "PAID").map((w) => w.netAmount)) ?? "0.00";
    const primary = data.methods.find((m) => m.isDefault) ?? data.methods[0] ?? null;
    const checked = verifiedMethods(data.methods);
    const wallet = data.wallet;
    const allowance = wallet?.allowance ?? null;
    const pending = wallet?.pendingClearance ?? data.earnings?.summary.pendingClearance ?? "0.00";
    const clearsBy = pendingClearsBy(data.earnings);
    const frozen = !!wallet?.frozenAt;

    return (
        <>
            <PageHeading
                title="Earnings"
                actions={
                    <>
                        <Link href="/publisher/earnings/transactions" className={outlineButton}>
                            Transactions
                        </Link>
                        <Link href="/publisher/earnings/statements" className={outlineButton}>
                            Statements
                        </Link>
                    </>
                }
            />
            {error && (
                <div className="mt-4">
                    <ErrorNote message={error} onRetry={reload} />
                </div>
            )}

            <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_300px]">
                <div className="min-w-0">
                    {wallet && (
                        <Panel className="mb-8">
                            <p className="text-sm text-dim">Your balance</p>
                            <p className="mt-1 text-3xl font-semibold tracking-tight text-ink">{formatMoney(wallet.balance, { paise: "always" })}</p>
                            <div className="mt-4 grid gap-3 rounded-lg bg-ground p-4 sm:grid-cols-2">
                                <div>
                                    <p className="text-lg font-semibold text-ink">{formatMoney(wallet.withdrawable)}</p>
                                    <p className="text-xs text-dim">Cleared — you can withdraw this</p>
                                </div>
                                <div className="sm:border-l sm:border-line sm:pl-4">
                                    <p className="text-lg font-semibold text-ink">{formatMoney(wallet.pendingClearance)}</p>
                                    <p className="text-xs text-dim">Still clearing{clearsBy ? ` · all clear by ${longDate(clearsBy)}` : ""}</p>
                                </div>
                            </div>
                            {(isPositiveMoney(wallet.openWithdrawals) || isPositiveMoney(wallet.held) || isPositiveMoney(wallet.goodwill)) && (
                                <div className="mt-3">
                                    {isPositiveMoney(wallet.openWithdrawals) && <KeyRow label="Already asked for · with ADX, waiting to be approved" value={formatMoney(wallet.openWithdrawals)} className="py-1.5" />}
                                    {isPositiveMoney(wallet.held) && <KeyRow label="Held against a booking · reserved until it is settled" value={formatMoney(wallet.held)} className="py-1.5" />}
                                    {isPositiveMoney(wallet.goodwill) && <KeyRow label="ADX credit · spendable on ADX, never withdrawn" value={formatMoney(wallet.goodwill)} className="py-1.5" />}
                                </div>
                            )}
                            <p className="mt-3 text-xs text-dim">Each campaign-day is credited once the day is over, and can be withdrawn seven days later.{wallet.lastActivityAt ? ` Last movement ${longDate(wallet.lastActivityAt)}.` : ""}</p>
                        </Panel>
                    )}

                    <section aria-labelledby="payouts-heading">
                        <h2 id="payouts-heading" className="text-base font-semibold text-ink">
                            Payout history
                        </h2>
                        <p className="mt-1 text-sm text-dim">
                            {data.withdrawals.length} payout{data.withdrawals.length === 1 ? "" : "s"} · {formatMoney(paidToDate)} paid to date
                        </p>
                        <div className="mt-4">
                            <Segmented
                                label="Payout shelves"
                                value={tab}
                                onChange={setTab}
                                options={[
                                    { value: "ALL", label: "All payouts" },
                                    { value: "PENDING", label: "Pending" },
                                    { value: "PAID", label: "Paid" },
                                ]}
                            />
                        </div>
                        <div className="mt-4">
                            {rows.length === 0 ? (
                                <Panel>
                                    <p className="text-sm font-medium text-ink">{data.withdrawals.length === 0 ? "No payouts yet" : tab === "PENDING" ? "Nothing pending" : "Nothing paid yet"}</p>
                                    {data.withdrawals.length === 0 && <p className="mt-1 text-sm text-dim">Earnings clear into your wallet as campaigns run. Withdraw them to your bank account from here.</p>}
                                </Panel>
                            ) : (
                                <DataTable columns={[{ label: "Payout" }, { label: "Amount", align: "right" }, { label: "Status" }, { label: "", align: "right" }]}>
                                    {rows.map((withdrawal) => {
                                        const status = withdrawalStatus(withdrawal.status);
                                        const when = withdrawal.status === "PAID" && withdrawal.paidAt ? `Paid ${longDate(withdrawal.paidAt)}` : `Requested ${longDate(withdrawal.requestedAt)}`;
                                        return (
                                            <TableRow key={withdrawal.id}>
                                                <Cell>
                                                    <TitleCell title={methodLine(withdrawal.method)} line={`${withdrawal.reference} · ${when}`} href={`/publisher/earnings/${withdrawal.id}`} />
                                                </Cell>
                                                <Cell align="right">
                                                    <span className="whitespace-nowrap text-ink">{formatMoney(withdrawal.netAmount)}</span>
                                                </Cell>
                                                <Cell>
                                                    <StatusText tone={status.tone}>{status.label}</StatusText>
                                                </Cell>
                                                <Cell align="right">
                                                    <Link href={`/publisher/earnings/${withdrawal.id}`} className="whitespace-nowrap text-sm font-semibold text-ink hover:underline">
                                                        View payout
                                                    </Link>
                                                </Cell>
                                            </TableRow>
                                        );
                                    })}
                                </DataTable>
                            )}
                        </div>
                    </section>

                    <section className="mt-8" aria-labelledby="activity-heading">
                        <div className="flex flex-wrap items-baseline justify-between gap-2">
                            <h2 id="activity-heading" className="text-base font-semibold text-ink">
                                Recent activity
                            </h2>
                            <Link href="/publisher/earnings/transactions" className={quietLink}>
                                See all transactions
                            </Link>
                        </div>
                        <div className="mt-4">
                            {data.entries.length === 0 ? (
                                <Panel>
                                    <p className="text-sm text-dim">Nothing has moved through this wallet yet. Your first earnings appear the day after your first campaign day.</p>
                                </Panel>
                            ) : (
                                <DataTable columns={[{ label: "Date" }, { label: "Entry" }, { label: "Amount", align: "right" }, { label: "Balance after", align: "right" }]}>
                                    {data.entries.map((entry) => (
                                        <TableRow key={entry.id}>
                                            <Cell>
                                                <span className="whitespace-nowrap text-dim">{longDate(entry.createdAt)}</span>
                                            </Cell>
                                            <Cell className="max-w-[300px]">
                                                <TitleCell title={ENTRY_LABEL[entry.type] ?? entry.type.toLowerCase().replace(/_/g, " ")} line={entry.note ?? entry.reference} />
                                            </Cell>
                                            <Cell align="right">
                                                <span className={cn("whitespace-nowrap", isCredit(entry) ? "text-success" : "text-ink")}>{signedAmount(entry)}</span>
                                            </Cell>
                                            <Cell align="right">
                                                <span className="whitespace-nowrap text-dim">{formatMoney(entry.balanceAfter, { paise: "always" })}</span>
                                            </Cell>
                                        </TableRow>
                                    ))}
                                </DataTable>
                            )}
                        </div>
                    </section>

                    <section id="statements" className="mt-8 scroll-mt-24" aria-labelledby="statements-heading">
                        <div className="flex flex-wrap items-baseline justify-between gap-2">
                            <h2 id="statements-heading" className="text-base font-semibold text-ink">
                                Statements
                            </h2>
                            <Link href="/publisher/earnings/statements" className={quietLink}>
                                Monthly breakdown and GST invoices
                            </Link>
                        </div>
                        <p className="mt-1 text-sm text-dim">A payment advice for every month, as a PDF.</p>
                        <div className="mt-4">
                            {data.statements.length === 0 ? (
                                <Panel>
                                    <p className="text-sm text-dim">Your first statement is written on the first of the month after your first earning.</p>
                                </Panel>
                            ) : (
                                <DataTable columns={[{ label: "Period" }, { label: "Credits", align: "right" }, { label: "Debits", align: "right" }, { label: "Closing balance", align: "right" }, { label: "", align: "right" }]}>
                                    {data.statements.slice(0, 6).map((statement) => (
                                        <StatementRow key={statement.id} statement={statement} />
                                    ))}
                                </DataTable>
                            )}
                        </div>
                    </section>

                    <section className="mt-8">
                        <h2 className="text-base font-semibold text-ink">How payouts work</h2>
                        <p className="mt-1 text-sm text-dim">Each campaign day is credited to your wallet the next morning and clears seven days later. A payout is a request to move cleared money to your bank; ADX reviews every request by hand before it is released, and an approved one reaches your account within 24 hours.</p>
                    </section>
                </div>

                <div className="grid content-start gap-6">
                    <Panel>
                        <CardTitle>Pending earnings</CardTitle>
                        <p className="mt-2 text-2xl font-semibold text-ink">{formatMoney(pending)}</p>
                        <p className="mt-2 text-sm text-dim">Clears day by day, seven days after each campaign-day is credited.</p>
                        <div className="mt-4 border-t border-line pt-3">
                            <KeyRow label="Available to withdraw" value={formatMoney(wallet?.withdrawable ?? "0.00")} strong className="py-1" />
                            {wallet && isPositiveMoney(wallet.held) && <KeyRow label="Held" value={formatMoney(wallet.held)} className="py-1" />}
                            {wallet && isPositiveMoney(wallet.openWithdrawals) && <KeyRow label="In open requests" value={formatMoney(wallet.openWithdrawals)} className="py-1" />}
                            {allowance && (
                                <>
                                    <KeyRow label="Most you can ask for now" value={formatMoney(allowance.maximum)} className="py-1" />
                                    <KeyRow label="Daily cap" value={formatMoney(allowance.dailyCap)} className="py-1" />
                                    <KeyRow label="Left today" value={formatMoney(allowance.remainingToday)} className="py-1" />
                                </>
                            )}
                        </div>
                        {frozen ? (
                            <p className="mt-3 rounded-md bg-warning-soft px-3 py-2 text-xs text-warning">Withdrawals are paused on this wallet{wallet?.frozenReason ? `: ${wallet.frozenReason}` : ""}. Your earnings still land; contact support to lift it.</p>
                        ) : (
                            <button type="button" onClick={() => setWithdrawOpen(true)} disabled={!wallet} className={cn(brandButton, "mt-4 w-full")}>
                                Withdraw
                            </button>
                        )}
                        {!frozen && checked.length === 0 && <p className="mt-2 text-xs text-dim">{data.methods.length === 0 ? "Add a bank account or UPI id to withdraw." : "ADX is still checking your payout account; withdrawals open once it is done."}</p>}
                    </Panel>

                    <Panel>
                        <CardTitle>Receiving account</CardTitle>
                        <p className="mt-2 text-base font-medium text-ink">{methodLine(primary)}</p>
                        {primary && (
                            <StatusText tone={methodStatus(primary.status).tone} className="mt-1 block">
                                {methodStatus(primary.status).label}
                            </StatusText>
                        )}
                        <Link href="/publisher/earnings/bank" className={cn(outlineButton, "mt-4")}>
                            {primary ? "Manage accounts" : "Add bank details"}
                        </Link>
                    </Panel>
                </div>
            </div>

            {wallet && withdrawOpen && <WithdrawDialog open={withdrawOpen} onClose={() => setWithdrawOpen(false)} wallet={wallet} methods={data.methods} onDone={reload} />}
        </>
    );
}

function StatementRow({ statement }: { statement: Statement }) {
    const [busy, setBusy] = React.useState(false);
    const open = async () => {
        setBusy(true);
        try {
            openBlob(await publisherWorkspace.statementPdf(statement.id), `statement-${statement.period}.pdf`);
        } catch (caught) {
            toast.error(messageOf(caught, "Could not fetch the statement."));
        } finally {
            setBusy(false);
        }
    };
    const [year, month] = statement.period.split("-");
    const label = new Date(Number(year), Number(month) - 1, 1).toLocaleDateString("en-IN", { month: "long", year: "numeric" });
    return (
        <TableRow>
            <Cell>
                <TitleCell title={label} line={`${statement.reference} · ${statement.entryCount} entr${statement.entryCount === 1 ? "y" : "ies"}`} />
            </Cell>
            <Cell align="right">
                <span className="whitespace-nowrap text-ink">{formatMoney(statement.credits)}</span>
            </Cell>
            <Cell align="right">
                <span className="whitespace-nowrap text-ink">{formatMoney(statement.debits)}</span>
            </Cell>
            <Cell align="right">
                <span className="whitespace-nowrap text-ink">{formatMoney(statement.closingBalance)}</span>
            </Cell>
            <Cell align="right">
                <button type="button" onClick={open} disabled={busy} className="whitespace-nowrap text-sm font-semibold text-ink hover:underline disabled:opacity-50">
                    {busy ? "Opening…" : "PDF"}
                </button>
            </Cell>
        </TableRow>
    );
}
