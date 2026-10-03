"use client";

import * as React from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { brandButton, Field, inputClass, KeyRow, outlineButton } from "@/components/publisher/parts";
import { ApiError, messageOf } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { belowMinimumLine, capReason, defaultMethodId, verifiedMethods, withdrawProblem, type FullAllowance } from "@/services/publisher-money";
import { formatMoney, isPositiveMoney, methodLine, publisherWorkspace, toApiAmount, type PayoutMethod, type WalletSnapshot } from "@/services/publisher-workspace";

/**
 * `POST /payouts/withdrawals`, as the app's Withdraw screen draws it: what
 * can be taken out and why (cleared, still clearing, already asked for, the
 * daily cap and what is left of it today, the minimum, the rung the cap is
 * on), the amount checked against the server's three refusals in the
 * server's order, and only the payout methods ADX has checked — with the
 * app's words when there is none yet.
 */
export function WithdrawDialog({ open, onClose, wallet, methods, onDone }: { open: boolean; onClose: () => void; wallet: WalletSnapshot; methods: PayoutMethod[]; onDone: () => void }) {
    const allowance = wallet.allowance as FullAllowance;
    const usable = verifiedMethods(methods);
    const unchecked = methods.length - usable.length;
    const [raw, setRaw] = React.useState("");
    const [methodId, setMethodId] = React.useState<string | null>(() => defaultMethodId(methods));
    const [busy, setBusy] = React.useState(false);
    const [failure, setFailure] = React.useState<string | null>(null);
    const problem = withdrawProblem(allowance, raw);
    const amount = toApiAmount(raw);
    const blocked = belowMinimumLine(allowance);
    const chosen = methodId && usable.some((method) => method.id === methodId) ? methodId : defaultMethodId(methods);
    const canSend = !!amount && problem === null && !!chosen && !busy;

    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!canSend || !amount || !chosen) return;
        setBusy(true);
        setFailure(null);
        try {
            const placed = await publisherWorkspace.requestWithdrawal(amount, chosen);
            toast.success(`Withdrawal ${placed.reference} of ${formatMoney(placed.amount)} is with ADX`);
            setRaw("");
            onDone();
            onClose();
        } catch (caught) {
            setFailure(caught instanceof ApiError && caught.code === "WALLET_FROZEN" ? "Withdrawals are paused on this wallet while ADX reviews it. Contact support." : messageOf(caught, "Could not request the withdrawal."));
        } finally {
            setBusy(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={(next) => !next && !busy && onClose()}>
            <DialogContent className="max-h-[90vh] max-w-[520px] overflow-y-auto rounded-lg border-line bg-white p-6">
                <DialogHeader>
                    <DialogTitle className="text-lg font-semibold text-ink">Withdraw to your bank</DialogTitle>
                    <DialogDescription className="text-sm text-dim">To your own bank account or UPI id. ADX checks every withdrawal by hand before it is sent.</DialogDescription>
                </DialogHeader>

                <div className="rounded-lg border border-line px-4 py-2">
                    <KeyRow label="Most you can ask for now" value={formatMoney(allowance.maximum, { paise: "always" })} strong className="py-1.5" />
                    <div className="border-t border-line" />
                    <KeyRow label="Cleared and ready" value={formatMoney(allowance.withdrawable, { paise: "always" })} className="py-1" />
                    <KeyRow label="Still clearing" value={formatMoney(allowance.pendingClearance, { paise: "always" })} className="py-1" />
                    {isPositiveMoney(allowance.openWithdrawals) && <KeyRow label="Already asked for" value={formatMoney(allowance.openWithdrawals, { paise: "always" })} className="py-1" />}
                    {isPositiveMoney(wallet.held) && <KeyRow label="Held against a booking" value={formatMoney(wallet.held, { paise: "always" })} className="py-1" />}
                    <div className="border-t border-line" />
                    <KeyRow label="Your daily cap" value={formatMoney(allowance.dailyCap)} className="py-1" />
                    <KeyRow label="Used today" value={formatMoney(allowance.usedToday)} className="py-1" />
                    <KeyRow label="Left today" value={formatMoney(allowance.remainingToday)} className="py-1" />
                    <KeyRow label="Smallest withdrawal" value={formatMoney(allowance.minimum)} className="py-1" />
                    <p className="pb-1.5 pt-1 text-xs text-dim">{capReason(allowance)}</p>
                </div>

                {usable.length === 0 ? (
                    <div className="rounded-lg bg-ground p-4">
                        <p className="text-sm font-semibold text-ink">{methods.length === 0 ? "Add somewhere to send it" : "Nothing checked yet"}</p>
                        <p className="mt-1 text-sm text-dim">
                            {methods.length === 0 ? "ADX needs a bank account or UPI id before it can pay you, and checks it before the first withdrawal can use it." : "ADX is still checking the payout account you added. Until that is done, no withdrawal can use it."}
                        </p>
                        <Link href="/publisher/earnings/bank" className={cn(brandButton, "mt-3")}>
                            Payout accounts
                        </Link>
                    </div>
                ) : blocked ? (
                    <div className="rounded-lg bg-ground p-4">
                        <p className="text-sm font-semibold text-ink">Not yet</p>
                        <p className="mt-1 text-sm text-dim">{blocked}</p>
                    </div>
                ) : (
                    <form onSubmit={submit} className="grid gap-4">
                        <Field label={`Amount · between ${formatMoney(allowance.minimum)} and ${formatMoney(allowance.maximum)}`} htmlFor="withdraw-amount">
                            <div className="flex gap-2">
                                <div className="relative flex-1">
                                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-dim">₹</span>
                                    <input id="withdraw-amount" inputMode="decimal" value={raw} placeholder={allowance.minimum} onChange={(event) => setRaw(event.target.value.replace(/[^\d.]/g, ""))} aria-invalid={problem !== null} aria-describedby="withdraw-problem" className={cn(inputClass, "pl-7", problem && "border-danger")} />
                                </div>
                                <button type="button" onClick={() => setRaw(allowance.maximum)} className={cn(outlineButton, "px-3")}>
                                    Ask for all
                                </button>
                            </div>
                        </Field>
                        <p id="withdraw-problem" role={problem ? "alert" : undefined} className={cn("-mt-2 text-xs", problem ? "text-danger" : "text-dim")}>
                            {problem ?? `Nothing is deducted here: tax was withheld when each day was credited, so what you ask for is what arrives.`}
                        </p>
                        <fieldset>
                            <legend className="text-sm font-medium text-ink">Where should it go?</legend>
                            <div className="mt-2 grid gap-2">
                                {usable.map((method) => (
                                    <label key={method.id} className={cn("flex cursor-pointer items-center justify-between gap-3 rounded-lg border px-4 py-3", chosen === method.id ? "border-brand-bright bg-[#fff7f7]" : "border-line hover:border-dim")}>
                                        <span className="flex items-center gap-3">
                                            <input type="radio" name="withdraw-method" checked={chosen === method.id} onChange={() => setMethodId(method.id)} className="accent-[#e32227]" />
                                            <span className="text-sm font-medium text-ink">{methodLine(method)}</span>
                                        </span>
                                        {method.isDefault && <span className="text-xs text-dim">Your default</span>}
                                    </label>
                                ))}
                            </div>
                            {unchecked > 0 && (
                                <p className="mt-2 text-xs text-dim">
                                    {unchecked} other {unchecked === 1 ? "account is" : "accounts are"} not listed — ADX has not finished checking {unchecked === 1 ? "it" : "them"}.
                                </p>
                            )}
                        </fieldset>
                        {failure && (
                            <p role="alert" className="text-sm text-danger">
                                {failure}
                            </p>
                        )}
                        <p className="rounded-md bg-info-soft px-3 py-2 text-xs text-info">ADX checks every withdrawal by hand — nothing is approved automatically, whatever the amount. Once it is approved the money reaches your account within 24 hours.</p>
                        <div className="flex justify-end gap-3">
                            <button type="button" onClick={onClose} className={outlineButton}>
                                Cancel
                            </button>
                            <button type="submit" disabled={!canSend} className={brandButton}>
                                {busy ? "Requesting…" : "Request withdrawal"}
                            </button>
                        </div>
                    </form>
                )}
            </DialogContent>
        </Dialog>
    );
}
