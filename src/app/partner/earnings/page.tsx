"use client";

import * as React from "react";
import { Landmark, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { PageHeading, Panel } from "@/components/workspace/page-heading";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { brandButton, CardTitle, Cell, Chip, DataTable, ErrorNote, Field, inputClass, Loading, outlineButton, StatusText, TableRow, TitleCell } from "@/components/publisher/parts";
import { useLoad } from "@/components/publisher/use-load";
import { AddPayoutMethod } from "@/components/partner/add-method";
import { ApplicantGate, Note } from "@/components/partner/parts";
import { cn } from "@/lib/utils";
import { formatMoney, isPositiveMoney, longDate, methodLine, methodStatus, sumMoney, toApiAmount, withdrawalStatus, type PayoutMethod, type Withdrawal } from "@/services/publisher-workspace";
import {
    bookingRefOf,
    creditedThisMonth,
    entryLabel,
    formatWhen,
    partnerMessage,
    partnerService,
    readable,
    withdrawBlocker,
    withdrawProblem,
    type PartnerAllowance,
    type PartnerEarnings,
    type PartnerEarningsSummary,
} from "@/services/partner";

interface MoneyData {
    earnings: PartnerEarnings;
    summary: PartnerEarningsSummary | null;
    methods: PayoutMethod[];
}

async function readMoney(): Promise<MoneyData> {
    const [earnings, summary, methods] = await Promise.all([
        readable(partnerService.earnings(), "Could not read your earnings. Your money is safe — this is the connection."),
        partnerService.earningsSummary().catch(() => null),
        partnerService.payoutMethods().catch(() => [] as PayoutMethod[]),
    ]);
    return { earnings, summary, methods };
}

/**
 * Earnings — the print partner's wallet (`GET /print-partners/me/earnings`)
 * and the server's four sums (`…/earnings/summary`): the balance, what was
 * credited this month and last, what is still pending payout, what has been
 * paid; then the withdrawals, the payout methods and the ledger.
 *
 * The balance and the pending are never added. Nothing is approved
 * automatically: every rule the server applies to a withdrawal is said
 * before the button, in the server's order.
 */
export default function PartnerEarningsPage() {
    const { data, error, loading, reload } = useLoad("partner-money", readMoney);
    const [asking, setAsking] = React.useState(false);
    const [adding, setAdding] = React.useState(false);
    const [monthNow] = React.useState(() => new Date());

    return (
        <>
            <PageHeading title="Earnings" subtitle="Print charges ADX has approved, net of tax, and what you have withdrawn." />
            <ApplicantGate what="Earnings">
                {!data && loading && <Loading label="Loading your earnings…" />}
                {error && (
                    <div className="mt-4">
                        <ErrorNote message={error} onRetry={reload} />
                    </div>
                )}
                {data && <MoneyView data={data} monthNow={monthNow} onAsk={() => setAsking(true)} adding={adding} setAdding={setAdding} onChanged={reload} />}
                {data && <WithdrawDialog open={asking} onClose={() => setAsking(false)} allowance={data.earnings.allowance} methods={data.methods.filter((m) => m.status === "VERIFIED")} onPlaced={reload} />}
            </ApplicantGate>
        </>
    );
}

function MoneyView({ data, monthNow, onAsk, adding, setAdding, onChanged }: { data: MoneyData; monthNow: Date; onAsk: () => void; adding: boolean; setAdding: (next: boolean) => void; onChanged: () => void }) {
    const { earnings, summary, methods } = data;
    const balances = earnings.balances;
    const allowance = earnings.allowance;
    const frozen = !!balances?.frozenAt;
    const thisMonth = summary ? summary.thisMonth : creditedThisMonth(earnings.entries, monthNow);
    const pending = summary ? summary.pending : (sumMoney([balances.pendingClearance, balances.openWithdrawals]) ?? "0.00");
    const blocker = withdrawBlocker(allowance, methods, frozen);

    return (
        <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_300px]">
            <div className="grid min-w-0 content-start gap-8">
                <Panel>
                    <p className="text-xs font-semibold uppercase tracking-wide text-dim">Wallet balance</p>
                    <p className="mt-2 text-[34px] font-semibold leading-10 text-ink">{formatMoney(balances.balance, { paise: "always" })}</p>
                    <div className="mt-5 grid grid-cols-2 gap-x-6 gap-y-4 border-t border-line pt-4 md:grid-cols-3">
                        <Stat value={thisMonth} label="Credited this month" />
                        <Stat value={pending} label={summary ? "Pending payout" : "Pending"} />
                        <Stat value={balances.withdrawable} label="Ready to withdraw" />
                        {summary && <Stat value={summary.lastMonth} label="Last month" />}
                        {summary && <Stat value={summary.paidToDate} label="Paid out to date" />}
                    </div>
                    <p className="mt-4 text-xs text-dim">
                        {summary
                            ? "This month and last are the print charges ADX approved in the month, net of tax. Pending payout is what you have asked to withdraw and ADX has not paid yet."
                            : "Credited from the ledger since the first of the month. Pending is money still clearing, plus withdrawals ADX has not paid yet. Print charges are credited net of tax when ADX approves the cost."}
                    </p>
                    {frozen && (
                        <Note tone="warning" className="mt-4">
                            Your wallet is frozen{balances.frozenReason ? `: ${balances.frozenReason}` : ""}. Credits still land; nothing can be withdrawn until ADX lifts it.
                        </Note>
                    )}
                </Panel>

                <section aria-labelledby="withdrawals-heading">
                    <h2 id="withdrawals-heading" className="text-base font-semibold text-ink">
                        Withdrawals
                    </h2>
                    <p className="mt-1 text-sm text-dim">Every withdrawal you have asked for, and where ADX has it.</p>
                    <div className="mt-4">
                        {earnings.withdrawals.length === 0 ? (
                            <Panel>
                                <p className="text-sm text-dim">No withdrawals yet. Once a print charge clears, ask for it here and ADX sends it to your bank account or UPI ID.</p>
                            </Panel>
                        ) : (
                            <DataTable columns={[{ label: "Withdrawal" }, { label: "Amount", align: "right" }, { label: "Status" }]}>
                                {earnings.withdrawals.map((row: Withdrawal) => {
                                    const status = withdrawalStatus(row.status);
                                    return (
                                        <TableRow key={row.id}>
                                            <Cell>
                                                <TitleCell title={methodLine(row.method)} line={`${row.reference} · ${row.status === "PAID" && row.paidAt ? `Paid ${longDate(row.paidAt)}` : `Asked ${longDate(row.requestedAt)}`}`} />
                                                {(row.failureReason || row.decisionNote) && <p className="mt-1 text-xs text-danger">{row.failureReason ?? row.decisionNote}</p>}
                                            </Cell>
                                            <Cell align="right">
                                                <span className="whitespace-nowrap text-ink">{formatMoney(row.amount)}</span>
                                            </Cell>
                                            <Cell>
                                                <StatusText tone={status.tone}>{status.label}</StatusText>
                                            </Cell>
                                        </TableRow>
                                    );
                                })}
                            </DataTable>
                        )}
                    </div>
                </section>

                <section aria-labelledby="ledger-heading">
                    <h2 id="ledger-heading" className="text-base font-semibold text-ink">
                        Ledger
                    </h2>
                    <p className="mt-1 text-sm text-dim">The latest {earnings.entries.length || ""} entries on your wallet.</p>
                    <div className="mt-4">
                        {earnings.entries.length === 0 ? (
                            <Panel>
                                <p className="text-sm text-dim">Nothing yet. The first line is the first print charge ADX approves.</p>
                            </Panel>
                        ) : (
                            <DataTable columns={[{ label: "Date" }, { label: "Entry" }, { label: "Amount", align: "right" }, { label: "Balance after", align: "right" }]}>
                                {earnings.entries.map((entry) => (
                                    <TableRow key={entry.id}>
                                        <Cell>
                                            <span className="whitespace-nowrap text-dim">{formatWhen(entry.createdAt)}</span>
                                        </Cell>
                                        <Cell>
                                            <TitleCell title={`${entryLabel(entry.type)}${entry.orderId ? ` · ${bookingRefOf(entry.orderId, entry.orderDisplayId)}` : ""}`} line={entry.note ?? entry.reference} />
                                        </Cell>
                                        <Cell align="right">
                                            <span className={cn("whitespace-nowrap", isPositiveMoney(entry.amount) ? "text-success" : "text-ink")}>{formatMoney(entry.amount, { paise: "always" })}</span>
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
            </div>

            <div className="grid content-start gap-6">
                <Panel>
                    <CardTitle>Withdraw</CardTitle>
                    <p className="mt-2 text-sm text-dim">{blocker ?? `You can ask for up to ${formatMoney(allowance.maximum)} now; the smallest withdrawal is ${formatMoney(allowance.minimum)}. Someone at ADX checks every request.`}</p>
                    <button type="button" onClick={onAsk} disabled={blocker !== null} className={cn(brandButton, "mt-4 w-full")}>
                        Request a withdrawal
                    </button>
                </Panel>

                <div id="methods" className="scroll-mt-24">
                    <Panel>
                        <CardTitle>Payout methods</CardTitle>
                        <p className="mt-1 text-sm text-dim">A bank account or UPI ID in your shop's name, checked by ADX.</p>
                        {methods.length === 0 ? (
                            <p className="mt-3 text-sm text-dim">No payout method yet.</p>
                        ) : (
                            <ul className="mt-3 grid gap-3">
                                {methods.map((method) => {
                                    const status = methodStatus(method.status);
                                    return (
                                        <li key={method.id} className="flex items-start gap-3 rounded-lg border border-line px-3 py-3">
                                            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand">{method.type === "UPI" ? <Smartphone className="size-4" aria-hidden /> : <Landmark className="size-4" aria-hidden />}</span>
                                            <div className="min-w-0 flex-1">
                                                <p className="truncate text-sm font-semibold text-ink">{methodLine(method)}</p>
                                                <p className="text-xs text-dim">{[method.accountHolder, method.ifscCode].filter(Boolean).join(" · ") || (method.type === "UPI" ? "UPI" : "Bank account")}</p>
                                                <div className="mt-1 flex flex-wrap items-center gap-2">
                                                    <StatusText tone={status.tone} className="text-xs">
                                                        {status.label}
                                                    </StatusText>
                                                    {method.isDefault && <Chip tone="ink">Default</Chip>}
                                                </div>
                                                {method.status === "REJECTED" && method.rejectionReason && <p className="mt-1 text-xs text-danger">{method.rejectionReason}</p>}
                                            </div>
                                        </li>
                                    );
                                })}
                            </ul>
                        )}
                        <button type="button" onClick={() => setAdding(true)} className={cn(outlineButton, "mt-4 w-full")}>
                            Add a bank account or UPI ID
                        </button>
                        <Dialog open={adding} onOpenChange={(next) => !next && setAdding(false)}>
                            <DialogContent className="max-w-[620px] rounded-lg border-line p-6">
                                <DialogHeader>
                                    <DialogTitle className="text-lg font-semibold text-ink">Add a payout method</DialogTitle>
                                    <DialogDescription className="text-sm text-dim">A bank account or UPI ID in your shop's name. ADX checks it before any withdrawal can use it.</DialogDescription>
                                </DialogHeader>
                                <AddPayoutMethod
                                    onCancel={() => setAdding(false)}
                                    onAdded={() => {
                                        setAdding(false);
                                        onChanged();
                                    }}
                                />
                            </DialogContent>
                        </Dialog>
                    </Panel>
                </div>
            </div>
        </div>
    );
}

function Stat({ value, label }: { value: string | null | undefined; label: string }) {
    return (
        <div>
            <p className="text-lg font-semibold tabular-nums text-ink">{formatMoney(value ?? "0.00")}</p>
            <p className="mt-0.5 text-xs text-dim">{label}</p>
        </div>
    );
}

/** `POST /print-partners/me/withdrawals` — the amount and the VERIFIED method; the rules repeated before the button. */
function WithdrawDialog({ open, onClose, allowance, methods, onPlaced }: { open: boolean; onClose: () => void; allowance: PartnerAllowance; methods: PayoutMethod[]; onPlaced: () => void }) {
    const [raw, setRaw] = React.useState("");
    const [methodId, setMethodId] = React.useState(methods.find((m) => m.isDefault)?.id ?? methods[0]?.id ?? "");
    const [busy, setBusy] = React.useState(false);
    const [failure, setFailure] = React.useState<string | null>(null);
    const problem = withdrawProblem(raw, allowance);
    const chosen = methodId || methods[0]?.id || "";

    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        const amount = toApiAmount(raw);
        if (!amount || problem) return setFailure(problem ?? "Enter an amount to withdraw.");
        if (!chosen) return setFailure("Choose where the money goes.");
        setBusy(true);
        setFailure(null);
        try {
            const created = await partnerService.requestWithdrawal({ amount, payoutMethodId: chosen });
            toast.success(`Withdrawal ${created.reference} of ${formatMoney(created.amount)} is with ADX. Once approved, it reaches your account within 24 hours.`);
            setRaw("");
            onPlaced();
            onClose();
        } catch (caught) {
            setFailure(partnerMessage(caught, "Could not request the withdrawal."));
        } finally {
            setBusy(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={(next) => !next && !busy && onClose()}>
            <DialogContent className="max-w-[480px] rounded-lg border-line p-6">
                <DialogHeader>
                    <DialogTitle className="text-lg font-semibold text-ink">Request a withdrawal</DialogTitle>
                    <DialogDescription className="text-sm text-dim">
                        Up to {formatMoney(allowance.maximum)} now; the smallest is {formatMoney(allowance.minimum)}. Nothing is approved automatically — someone at ADX checks every request, and once approved the money reaches your account within 24 hours.
                    </DialogDescription>
                </DialogHeader>
                <form onSubmit={submit} className="grid gap-4">
                    <Field label="Amount (₹)" htmlFor="withdraw-amount">
                        <input id="withdraw-amount" inputMode="decimal" value={raw} onChange={(event) => setRaw(event.target.value.replace(/[^\d.]/g, ""))} placeholder="0.00" className={inputClass} />
                    </Field>
                    <Field label="Send to" htmlFor="withdraw-method">
                        <select id="withdraw-method" value={chosen} onChange={(event) => setMethodId(event.target.value)} className={inputClass}>
                            {methods.map((method) => (
                                <option key={method.id} value={method.id}>
                                    {methodLine(method)}
                                </option>
                            ))}
                        </select>
                    </Field>
                    {(failure ?? problem) && (
                        <p role="alert" className="text-sm text-danger">
                            {failure ?? problem}
                        </p>
                    )}
                    <div className="flex justify-end gap-3">
                        <button type="button" onClick={onClose} disabled={busy} className={outlineButton}>
                            Cancel
                        </button>
                        <button type="submit" disabled={busy || !raw.trim() || problem !== null} className={brandButton}>
                            {busy ? "Sending…" : "Send the request"}
                        </button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    );
}
