"use client";

import { Gift } from "lucide-react";
import { inr, isZero, type WalletSnapshot } from "@/services/wallet";

/**
 * The app's billing hero (DR 04 · 4209:99) on the web: AVAILABLE BALANCE
 * on the brand ground, then the split it actually has — settled credit,
 * ADX credits (goodwill) and what is held against confirmed campaigns —
 * because "available to spend" is the difference between them, and an
 * advertiser who does not see that reads a held campaign as missing money.
 */
export function BalanceCard({ wallet, onStatement, onInvoices }: { wallet: WalletSnapshot; onStatement: () => void; onInvoices: () => void }) {
    return (
        <section className="rounded-lg bg-brand p-6 text-white shadow-card" aria-labelledby="balance-label">
            <p id="balance-label" className="text-[11px] font-semibold uppercase tracking-[0.08em] text-white/75">
                Available balance
            </p>
            <p className="mt-1 text-[34px] font-semibold leading-tight tabular-nums">{inr(wallet.spendable)}</p>
            <dl className="mt-4 grid gap-3 border-t border-white/20 pt-4 sm:grid-cols-3">
                <Split label="Credit balance" value={inr(wallet.balance)} />
                <Split label="ADX credits" value={inr(wallet.goodwill)} />
                <Split label="Held for campaigns" value={inr(wallet.held)} />
            </dl>
            <div className="mt-5 flex flex-wrap gap-2">
                <button type="button" onClick={onInvoices} className="inline-flex h-10 items-center rounded-md bg-white px-5 text-sm font-semibold text-brand hover:bg-white/90">
                    Invoices
                </button>
                <button type="button" onClick={onStatement} className="inline-flex h-10 items-center rounded-md border border-white/60 px-5 text-sm font-semibold text-white hover:border-white">
                    Transactions
                </button>
            </div>
        </section>
    );
}

function Split({ label, value }: { label: string; value: string }) {
    return (
        <div>
            <dt className="text-xs text-white/75">{label}</dt>
            <dd className="mt-0.5 text-base font-semibold tabular-nums">{value}</dd>
        </div>
    );
}

/** "Auto-applied at your next checkout" — drawn only while there is goodwill credit. */
export function CreditsNote({ wallet }: { wallet: WalletSnapshot }) {
    if (isZero(wallet.goodwill)) return null;
    return (
        <section className="flex items-start gap-3 rounded-lg border border-line bg-white p-4">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand">
                <Gift className="size-[18px]" aria-hidden />
            </span>
            <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-ink">
                    ADX credits
                    <span className="rounded bg-brand-soft px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-brand">{inr(wallet.goodwill)}</span>
                </p>
                <p className="mt-0.5 text-xs text-dim">Auto-applied at your next checkout · spent before your credit balance. Credit comes back as ADX credits when a booked site lets you down.</p>
            </div>
        </section>
    );
}

/** The hold, said as what it is: still yours until the campaign goes live. */
export function HeldNote({ wallet }: { wallet: WalletSnapshot }) {
    if (isZero(wallet.held)) return null;
    return (
        <p className="rounded-md bg-info-soft px-4 py-3 text-sm text-info">
            {inr(wallet.held)} is held for campaigns you have confirmed, until the day each goes live. It is still yours until then — cancel first and the hold is released in full.
        </p>
    );
}
