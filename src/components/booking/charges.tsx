"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { rupees, type Charges } from "@/services/booking";

/**
 * The grey totals block (5204:62238's "Campaign total", the rails on the
 * billing and pay pages): Media rent · Print & installation · Platform fee ·
 * GST (18%) over a rule, then "Total including GST".
 */
export function ChargesTable({ charges, promo, note, className, title }: { charges: Charges; promo?: { code: string; amount: string } | null; note?: React.ReactNode; className?: string; title?: string }) {
    const taxable = charges.mediaRent + charges.production + charges.platformFee + charges.otherFees.reduce((sum, fee) => sum + fee.amount, 0);
    const gstPct = taxable > 0 ? Math.round((charges.gst / taxable) * 100) : 18;
    return (
        <div className={cn("rounded-lg bg-ground p-3", className)}>
            {title && <p className="px-1 pb-2 text-sm font-semibold text-ink">{title}</p>}
            <dl className="space-y-2 px-1 text-sm">
                <Row label="Media rent" value={rupees(charges.mediaRent)} />
                <Row label="Print & installation" value={charges.production > 0 ? rupees(charges.production) : "₹0"} />
                <Row label="Platform fee" value={rupees(charges.platformFee)} />
                {charges.otherFees.map((fee) => (
                    <Row key={fee.label} label={fee.label} value={rupees(fee.amount)} />
                ))}
                <Row label={`GST (${gstPct || 18}%)`} value={rupees(charges.gst)} />
                {promo && <Row label={`Promo · ${promo.code}`} value={`− ${rupees(promo.amount)}`} tone="brand" />}
                {!promo && charges.discount > 0 && <Row label="Discount" value={`− ${rupees(charges.discount)}`} tone="brand" />}
            </dl>
            <div className="mt-3 flex items-center justify-between border-t border-line px-1 pt-3">
                <span className="text-sm font-medium text-ink">Total including GST</span>
                <span className="text-lg font-semibold text-ink">{rupees(charges.total)}</span>
            </div>
            {note && <p className="mt-2 px-1 text-xs text-dim">{note}</p>}
        </div>
    );
}

function Row({ label, value, tone }: { label: string; value: string; tone?: "brand" }) {
    return (
        <div className="flex items-center justify-between gap-4">
            <dt className="text-dim">{label}</dt>
            <dd className={cn("font-medium tabular-nums", tone === "brand" ? "text-brand" : "text-ink")}>{value}</dd>
        </div>
    );
}

/** The itemised block (5204:63726's "Campaign charges"): every fee by name, then the total. */
export function ItemisedCharges({ charges, days, className, promo }: { charges: Charges; days: number; className?: string; promo?: { code: string; amount: string } | null }) {
    return (
        <div className={cn("rounded-lg bg-ground p-5", className)}>
            <p className="text-base font-semibold text-ink">Campaign charges</p>
            <dl className="mt-4 space-y-3 text-sm">
                <div className="flex justify-between gap-4">
                    <dt className="text-dim">Advertising spaces · {days} day{days === 1 ? "" : "s"}</dt>
                    <dd className="font-medium text-ink">{rupees(charges.mediaRent)}</dd>
                </div>
                {charges.fees.map((fee) => (
                    <div key={fee.label} className="flex justify-between gap-4">
                        <dt className="text-dim">{fee.label}</dt>
                        <dd className="font-medium text-ink">{rupees(fee.amount)}</dd>
                    </div>
                ))}
                <div className="flex justify-between gap-4">
                    <dt className="text-dim">GST · 18%</dt>
                    <dd className="font-medium text-ink">{rupees(charges.gst)}</dd>
                </div>
                {promo && (
                    <div className="flex justify-between gap-4">
                        <dt className="text-dim">Promo · {promo.code}</dt>
                        <dd className="font-medium text-brand">− {rupees(promo.amount)}</dd>
                    </div>
                )}
            </dl>
            <div className="mt-4 flex items-center justify-between border-t border-line pt-4">
                <span className="text-sm font-semibold text-ink">Total payable</span>
                <span className="text-lg font-semibold text-ink">{rupees(charges.total)}</span>
            </div>
        </div>
    );
}
