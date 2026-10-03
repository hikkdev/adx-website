"use client";

import * as React from "react";
import { Copy, Info } from "lucide-react";
import { ApiError, isFeatureOff, messageOf } from "@/lib/api-client";
import { FLAG_PAYMENT_GATEWAYS, useSwitchedOff } from "@/lib/flags";
import { btnPrimary, btnSmall, inputClass } from "@/components/advertiser/bits";
import type { AgeGate } from "@/components/checkout/age-gate";
import { FeatureOff } from "@/components/platform/feature-off";
import { notAvailableYet, paymentsService, UTR_PATTERN, type BankTransferDetails, type PaymentIntent, type PaymentSummary } from "@/services/payments";
import { packagesService, payRefusal, planMoney } from "@/services/packages";

/**
 * Direct banking for a plan (BT-1, the campaign pay page's rail with the
 * sale as its target): the account to pay into, the exact amount and the
 * reference a BANK_TRANSFER intent mints (`POST /payments/intents
 * { packageSaleId, gateway: 'BANK_TRANSFER' }`), then the UTR claim
 * (`POST /payments/:id/bank-transfer/submit`). Nothing moves on the claim;
 * ADX confirms the money against its statement and the plan starts then.
 * The intent is what the `payments.gateways` kill switch guards: while it is
 * off and no reference has been minted, the panel is one plain line. The
 * intent is an order too (29 Sep 2026): the page's age gate, drawn above
 * the panel, asks a missing date of birth before the reference is minted.
 */
export function BankTransferPanel({ saleId, details, total, disabled, age, onClaimed }: { saleId: string; details: BankTransferDetails; total: string; disabled: boolean; age: AgeGate; onClaimed: (payment: PaymentSummary) => void }) {
    const gatewaysOff = useSwitchedOff(FLAG_PAYMENT_GATEWAYS);
    const [intent, setIntent] = React.useState<PaymentIntent | null>(null);
    const [utr, setUtr] = React.useState("");
    const [paidOn, setPaidOn] = React.useState(() => new Date().toISOString().slice(0, 10));
    const [paid, setPaid] = React.useState(total);
    const [busy, setBusy] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);
    const [copied, setCopied] = React.useState<string | null>(null);

    const reference = async () => {
        if (busy || intent || gatewaysOff || !age.ready(() => void reference())) return;
        setBusy(true);
        setError(null);
        try {
            const answer = await packagesService.createIntent({ packageSaleId: saleId, gateway: "BANK_TRANSFER" });
            setIntent(answer);
            if (answer.bankTransfer?.amount) setPaid(answer.bankTransfer.amount);
        } catch (caught) {
            /* The kill switch says nothing here: the plain line replaces the panel once the 503 lands. */
            if (!age.caught(caught, () => void reference())) setError(isFeatureOff(caught, FLAG_PAYMENT_GATEWAYS) ? null : notAvailableYet(caught) ? "Bank transfer is not available yet. Choose another way to pay." : caught instanceof ApiError ? payRefusal(caught.code, caught.message) : messageOf(caught, "Could not prepare the transfer."));
        } finally {
            setBusy(false);
        }
    };

    const claim = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!intent || busy) return;
        if (!UTR_PATTERN.test(utr.trim())) return setError("Enter the UTR or transaction reference your bank gave you (12–22 letters and digits).");
        if (!/^\d{4}-\d{2}-\d{2}$/.test(paidOn)) return setError("Say which day you made the transfer.");
        if (!/^\d+(\.\d{1,2})?$/.test(paid.trim()) || !/[1-9]/.test(paid)) return setError("Enter the amount you transferred, in rupees.");
        setBusy(true);
        setError(null);
        try {
            const amount = paid.includes(".") ? paid.trim() : `${paid.trim()}.00`;
            const payment = await paymentsService.submitBankTransfer(intent.payment.id, { utr: utr.trim(), paidOn, amount });
            onClaimed(payment);
        } catch (caught) {
            setError(notAvailableYet(caught) ? "Recording a transfer is not available yet. Keep your UTR — ADX support can record it." : messageOf(caught, "Could not record the transfer."));
            setBusy(false);
        }
    };

    const copy = async (label: string, value: string) => {
        try {
            await navigator.clipboard.writeText(value);
            setCopied(label);
            setTimeout(() => setCopied(null), 1500);
        } catch {
            /* ignore */
        }
    };

    const account = intent?.bankTransfer ?? details;
    const referenceId = intent?.bankTransfer?.reference ?? intent?.payment.reference ?? null;
    const amount = intent?.bankTransfer?.amount ?? intent?.payment.amount ?? total;

    /* A reference already minted keeps its UTR claim — the switch guards the intent, not the claim. */
    if (gatewaysOff && !intent) return <FeatureOff flag={FLAG_PAYMENT_GATEWAYS} />;

    return (
        <div className="rounded-md bg-ground p-4">
            <p className="text-sm font-semibold text-ink">Transfer the exact amount to the bank account below:</p>
            <dl className="mt-2 divide-y divide-line text-sm">
                <Row label="Bank" value={`${account.bank}${account.branch ? ` · ${account.branch}` : ""}`} />
                <Row label="Account name" value={account.beneficiary} onCopy={() => void copy("name", account.beneficiary)} copied={copied === "name"} />
                <Row label="Account number" value={account.accountNumber} onCopy={() => void copy("number", account.accountNumber)} copied={copied === "number"} />
                <Row label="IFSC" value={account.ifsc} onCopy={() => void copy("ifsc", account.ifsc)} copied={copied === "ifsc"} />
                <Row label="Amount" value={planMoney(amount)} />
                <Row
                    label="Reference"
                    value={
                        referenceId ?? (
                            <button type="button" disabled={busy || disabled} onClick={() => void reference()} className={`${btnSmall} h-8`}>
                                {busy ? "Preparing…" : "Get a reference"}
                            </button>
                        )
                    }
                    onCopy={referenceId ? () => void copy("reference", referenceId) : undefined}
                    copied={copied === "reference"}
                />
            </dl>
            <p className="mt-3 flex items-start gap-1.5 text-xs text-dim">
                <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                {account.instructions || "Use NEFT, RTGS or IMPS and put the reference in the payment remark. ADX confirms transfers against its statement, usually within 24–48 hours."}
            </p>
            {!referenceId && disabled && <p className="mt-2 text-xs text-dim">Accept the plan terms above to get your reference.</p>}

            {intent && (
                <form onSubmit={claim} className="mt-4 border-t border-line pt-4">
                    <p className="text-sm font-semibold text-ink">Once you have transferred</p>
                    <label className="mt-2 grid gap-1.5 text-xs font-medium text-dim">
                        UTR / transaction reference
                        <input value={utr} onChange={(event) => setUtr(event.target.value.toUpperCase())} placeholder="e.g. HDFCN52026092512345" className={inputClass} />
                    </label>
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                        <label className="grid gap-1.5 text-xs font-medium text-dim">
                            Paid on
                            <input type="date" value={paidOn} onChange={(event) => setPaidOn(event.target.value)} className={inputClass} />
                        </label>
                        <label className="grid gap-1.5 text-xs font-medium text-dim">
                            Amount (₹)
                            <input inputMode="decimal" value={paid} onChange={(event) => setPaid(event.target.value)} className={inputClass} />
                        </label>
                    </div>
                    <button type="submit" disabled={busy} className={`${btnPrimary} mt-3`}>
                        {busy ? "Recording…" : "I have transferred — submit"}
                    </button>
                </form>
            )}
            {error && (
                <p role="alert" className="mt-3 text-sm text-danger">
                    {error}
                </p>
            )}
        </div>
    );
}

function Row({ label, value, onCopy, copied }: { label: string; value: React.ReactNode; onCopy?: () => void; copied?: boolean }) {
    return (
        <div className="flex items-center justify-between gap-4 py-2.5">
            <dt className="text-dim">{label}</dt>
            <dd className="flex items-center gap-2 font-semibold text-ink">
                {value}
                {onCopy && (
                    <button type="button" onClick={onCopy} aria-label={`Copy ${label}`} title={copied ? "Copied" : `Copy ${label}`} className="text-dim hover:text-ink">
                        <Copy className="size-3.5" aria-hidden />
                    </button>
                )}
            </dd>
        </div>
    );
}
