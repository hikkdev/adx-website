"use client";

import * as React from "react";
import { KeyValue } from "@/components/advertiser/bits";
import { cn } from "@/lib/utils";
import { money, perDayLabel, type Quote } from "@/services/promotions";

/**
 * LM-1: the price of an ad — the rate, the days, the subtotal, GST at 18%
 * and the total. `fromServer` false means the browser worked it out before
 * a draft exists; the server's figure is the one charged.
 */
export function QuoteBlock({ quote, fromServer, children, className }: { quote: Quote | null; fromServer?: boolean; children?: React.ReactNode; className?: string }) {
    return (
        <div className={cn("rounded-lg border border-line bg-white p-4", className)} data-testid="ad-quote">
            <p className="text-sm font-semibold text-ink">Price</p>
            {quote ? (
                <div className="mt-2 divide-y divide-line">
                    <div>
                        <KeyValue label="Rate" value={perDayLabel(quote.ratePerDay)} />
                        <KeyValue label="Days" value={String(quote.days)} />
                        <KeyValue label="Subtotal" value={money(quote.subtotal)} />
                        <KeyValue label="GST (18%)" value={money(quote.gstAmount)} />
                    </div>
                    <KeyValue label={<span className="font-semibold text-ink">Total</span>} value={money(quote.total)} strong className="pt-2" />
                    {children}
                </div>
            ) : (
                <p className="mt-2 text-sm text-dim">Choose a slot and your days to see the price.</p>
            )}
            {quote && fromServer === false && <p className="mt-2 text-xs text-dim">Worked out here; ADX confirms the figure when the draft is saved.</p>}
        </div>
    );
}
