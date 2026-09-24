"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { PageHeading, Panel } from "@/components/workspace/page-heading";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { brandButton, CardTitle, Cell, DataTable, ErrorNote, Field, inputClass, KeyRow, Loading, outlineButton, Segmented, StatusText, TableRow, TitleCell } from "@/components/publisher/parts";
import { useLoad } from "@/components/publisher/use-load";
import { messageOf } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import {
    compareMoney,
    formatMoney,
    isPositiveMoney,
    longDate,
    methodLine,
    methodStatus,
    openBlob,
    publisherWorkspace,
    sumMoney,
    toApiAmount,
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
        publisherWorkspace.entries(10).catch(() => [] as WalletEntry[]),
    ]);
    return { wallet, earnings, withdrawals, methods, statements, entries };
}

const ENTRY_WORDS: Record<string, string> = {
    EARNING: "Campaign day earned",
    BONUS: "Bonus",
    REFERRAL: "Referral reward",
    PAYOUT: "Paid out to your bank",
    REFUND: "Refund",
    ADJUSTMENT: "Adjustment",
    GOODWILL_CREDIT: "Goodwill credit",
    PENALTY: "Penalty",
    EXPIRY: "Expired credit",
    TOPUP: "Top-up",
};

export default function EarningsPage() {
    return (
        <React.Suspense fallback={<Loading label="Loading your earnings…" />}>
            <EarningsView />
        </React.Suspense>
    );
}

/**
 * DR 12 · 10 · 13 · Earnings (5204:90526): the payout history (every
 * withdrawal, pending or paid), what is still clearing, the receiving
 * account — and the doors the platform needs beside them: withdrawing what
 * has cleared, the monthly statements with their PDFs, and the ledger.
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
    const pending = data.wallet?.pendingClearance ?? data.earnings?.summary.pendingClearance ?? "0.00";
    const withdrawable = data.wallet?.withdrawable ?? "0.00";
    const frozen = !!data.wallet?.frozenAt;

    return (
        <>
            <PageHeading
                title="Earnings"
                actions={
                    <Link href="/publisher/earnings/bank" className={outlineButton}>
                        Manage bank account
                    </Link>
                }
            />
            {error && (
                <div className="mt-4">
                    <ErrorNote message={error} onRetry={reload} />
                </div>
            )}

            <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_268px]">
                <div className="min-w-0">
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
                                    <p className="mt-1 text-sm text-dim">{data.withdrawals.length === 0 ? "Earnings clear into your wallet as campaigns run. Withdraw them to your bank account from here." : ""}</p>
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

                    <section className="mt-8">
                        <h2 className="text-base font-semibold text-ink">How payouts work</h2>
                        <p className="mt-1 text-sm text-dim">Each campaign day is credited to your wallet the next morning and clears seven days later. A payout is a request to move cleared money to your bank; ADX reviews every request before it is released.</p>
                    </section>

                    <section id="statements" className="mt-8 scroll-mt-24" aria-labelledby="statements-heading">
                        <h2 id="statements-heading" className="text-base font-semibold text-ink">
                            Statements
                        </h2>
                        <p className="mt-1 text-sm text-dim">A payment advice for every month, as a PDF.</p>
                        <div className="mt-4">
                            {data.statements.length === 0 ? (
                                <Panel>
                                    <p className="text-sm text-dim">Your first statement is written on the first of the month after your first earning.</p>
                                </Panel>
                            ) : (
                                <DataTable columns={[{ label: "Period" }, { label: "Credits", align: "right" }, { label: "Debits", align: "right" }, { label: "Closing balance", align: "right" }, { label: "", align: "right" }]}>
                                    {data.statements.map((statement) => (
                                        <StatementRow key={statement.id} statement={statement} />
                                    ))}
                                </DataTable>
                            )}
                        </div>
                    </section>

                    {data.entries.length > 0 && (
                        <section className="mt-8" aria-labelledby="activity-heading">
                            <h2 id="activity-heading" className="text-base font-semibold text-ink">
                                Recent activity
                            </h2>
                            <p className="mt-1 text-sm text-dim">The last {data.entries.length} entries on your wallet.</p>
                            <div className="mt-4">
                                <DataTable columns={[{ label: "Date" }, { label: "Entry" }, { label: "Amount", align: "right" }, { label: "Balance after", align: "right" }]}>
                                    {data.entries.map((entry) => (
                                        <TableRow key={entry.id}>
                                            <Cell>
                                                <span className="whitespace-nowrap text-dim">{longDate(entry.createdAt)}</span>
                                            </Cell>
                                            <Cell>
                                                <TitleCell title={ENTRY_WORDS[entry.type] ?? entry.type.toLowerCase().replace(/_/g, " ")} line={entry.note ?? entry.reference} />
                                            </Cell>
                                            <Cell align="right">
                                                <span className={cn("whitespace-nowrap", entry.amount.startsWith("-") ? "text-ink" : "text-success")}>{formatMoney(entry.amount)}</span>
                                            </Cell>
                                            <Cell align="right">
                                                <span className="whitespace-nowrap text-dim">{formatMoney(entry.balanceAfter)}</span>
                                            </Cell>
                                        </TableRow>
                                    ))}
                                </DataTable>
                            </div>
                        </section>
                    )}
                </div>

                <div className="grid content-start gap-6">
                    <Panel>
                        <CardTitle>Pending earnings</CardTitle>
                        <p className="mt-2 text-2xl font-semibold text-ink">{formatMoney(pending)}</p>
                        <p className="mt-2 text-sm text-dim">Eligible for payout after the campaign is completed and delivery is verified.</p>
                        <div className="mt-4 border-t border-line pt-3">
                            <KeyRow label="Available to withdraw" value={formatMoney(withdrawable)} strong className="py-1" />
                            {data.wallet && isPositiveMoney(data.wallet.openWithdrawals) && <KeyRow label="In open requests" value={formatMoney(data.wallet.openWithdrawals)} className="py-1" />}
                        </div>
                        {frozen ? (
                            <p className="mt-3 rounded-md bg-warning-soft px-3 py-2 text-xs text-warning">Withdrawals are paused on this wallet{data.wallet?.frozenReason ? `: ${data.wallet.frozenReason}` : ""}. Contact support.</p>
                        ) : (
                            <button type="button" onClick={() => setWithdrawOpen(true)} disabled={!data.wallet || !isPositiveMoney(withdrawable) || primary === null} className={cn(brandButton, "mt-4 w-full")}>
                                Withdraw
                            </button>
                        )}
                        {!frozen && primary === null && <p className="mt-2 text-xs text-dim">Add a bank account to withdraw.</p>}
                    </Panel>

                    <Panel>
                        <CardTitle>Receiving account</CardTitle>
                        <p className="mt-2 text-base font-medium text-ink">{methodLine(primary)}</p>
                        {primary && <StatusText tone={methodStatus(primary.status).tone} className="mt-1 block">{methodStatus(primary.status).label}</StatusText>}
                        <Link href="/publisher/earnings/bank" className={cn(outlineButton, "mt-4")}>
                            {primary ? "Manage account" : "Add bank details"}
                        </Link>
                    </Panel>
                </div>
            </div>

            {data.wallet && <WithdrawDialog open={withdrawOpen} onClose={() => setWithdrawOpen(false)} wallet={data.wallet} methods={data.methods} onDone={reload} />}
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

/** `POST /payouts/withdrawals` — the amount and the account; the server re-checks every rule shown here. */
function WithdrawDialog({ open, onClose, wallet, methods, onDone }: { open: boolean; onClose: () => void; wallet: WalletSnapshot; methods: PayoutMethod[]; onDone: () => void }) {
    const usable = methods.filter((m) => m.status === "VERIFIED");
    const fallback = usable.length > 0 ? usable : methods;
    const [amount, setAmount] = React.useState(wallet.allowance?.maximum ?? wallet.withdrawable);
    const [methodId, setMethodId] = React.useState(fallback.find((m) => m.isDefault)?.id ?? fallback[0]?.id ?? "");
    const [busy, setBusy] = React.useState(false);
    const [failure, setFailure] = React.useState<string | null>(null);
    const allowance = wallet.allowance;
    const maximum = allowance?.maximum ?? wallet.withdrawable;
    const minimum = allowance?.minimum ?? "0.00";

    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        const value = toApiAmount(amount);
        if (!value || !isPositiveMoney(value)) return setFailure("Enter an amount in rupees.");
        if (compareMoney(value, minimum) < 0) return setFailure(`The minimum withdrawal is ${formatMoney(minimum)}.`);
        if (compareMoney(value, maximum) > 0) return setFailure(`You can withdraw up to ${formatMoney(maximum)} right now.`);
        if (!methodId) return setFailure("Choose the account to send it to.");
        setBusy(true);
        setFailure(null);
        try {
            await publisherWorkspace.requestWithdrawal(value, methodId);
            toast.success(`Withdrawal of ${formatMoney(value)} requested`);
            onDone();
            onClose();
        } catch (caught) {
            setFailure(messageOf(caught, "Could not request the withdrawal."));
        } finally {
            setBusy(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
            <DialogContent className="max-w-[480px] rounded-lg border-line p-6">
                <DialogHeader>
                    <DialogTitle className="text-lg font-semibold text-ink">Withdraw to your bank</DialogTitle>
                    <DialogDescription className="text-sm text-dim">
                        {formatMoney(wallet.withdrawable)} has cleared. {allowance ? `Minimum ${formatMoney(minimum)} · up to ${formatMoney(maximum)} today.` : ""} ADX reviews every request before it is released.
                    </DialogDescription>
                </DialogHeader>
                <form onSubmit={submit} className="grid gap-4">
                    <Field label="Amount" htmlFor="withdraw-amount">
                        <div className="relative">
                            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-dim">₹</span>
                            <input id="withdraw-amount" inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} className={cn(inputClass, "pl-7")} />
                        </div>
                    </Field>
                    <Field label="Send to" htmlFor="withdraw-method">
                        <select id="withdraw-method" value={methodId} onChange={(event) => setMethodId(event.target.value)} className={inputClass}>
                            {fallback.map((method) => (
                                <option key={method.id} value={method.id}>
                                    {methodLine(method)}
                                    {method.status !== "VERIFIED" ? ` (${methodStatus(method.status).label.toLowerCase()})` : ""}
                                </option>
                            ))}
                        </select>
                    </Field>
                    {failure && (
                        <p role="alert" className="text-sm text-danger">
                            {failure}
                        </p>
                    )}
                    <div className="flex justify-end gap-3">
                        <button type="button" onClick={onClose} className={outlineButton}>
                            Cancel
                        </button>
                        <button type="submit" disabled={busy} className={brandButton}>
                            {busy ? "Requesting…" : "Request payout"}
                        </button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    );
}
