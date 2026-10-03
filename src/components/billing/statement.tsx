"use client";

import * as React from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { Cell, StatusChip, TablePanel, Td, Th } from "@/components/advertiser/bits";
import { byMonth, entryDate, entryDetail, entryHeading, entrySource, entryStatus, inr, isDebit, signedInr, topUpFor, type TopUp, type WalletEntry } from "@/services/wallet";

/**
 * The wallet's statement as the app's Transactions screen draws it (Figma
 * 4209:101) — month headings over one row per movement: what it was, where
 * it came from, the day, the signed amount, the balance after, and a word for
 * where it stands. A charge is signed so the column reads down, but never in
 * danger red: paying for a campaign is not a failure.
 */
export function StatementTable({ entries, topUps, names, showBalance = true, empty }: { entries: WalletEntry[]; topUps: TopUp[]; names: Record<string, string>; showBalance?: boolean; empty: string }) {
    const groups = byMonth(entries);
    return (
        <TablePanel>
            <thead>
                <tr>
                    <Th className="w-[120px]">Date</Th>
                    <Th>Entry</Th>
                    <Th align="right">Amount</Th>
                    {showBalance && <Th align="right">Balance after</Th>}
                    <Th>Status</Th>
                </tr>
            </thead>
            <tbody>
                {groups.map((group) => (
                    <React.Fragment key={group.month}>
                        <tr className="border-t border-line">
                            <td colSpan={showBalance ? 5 : 4} className="bg-white px-5 pb-1 pt-4 text-[11px] font-semibold uppercase tracking-wide text-dim">
                                {group.month}
                            </td>
                        </tr>
                        {group.rows.map((entry) => (
                            <EntryLine key={entry.id} entry={entry} topUp={topUpFor(entry, topUps)} campaignName={entry.campaignId ? names[entry.campaignId] : undefined} showBalance={showBalance} />
                        ))}
                    </React.Fragment>
                ))}
                {entries.length === 0 && (
                    <tr className="border-t border-line">
                        <td colSpan={showBalance ? 5 : 4} className="px-5 py-10 text-center text-sm text-dim">
                            {empty}
                        </td>
                    </tr>
                )}
            </tbody>
        </TablePanel>
    );
}

function EntryLine({ entry, topUp, campaignName, showBalance }: { entry: WalletEntry; topUp: TopUp | null; campaignName?: string; showBalance: boolean }) {
    const debit = isDebit(entry.amount);
    const source = entrySource(entry, campaignName);
    const detail = entryDetail(entry, topUp);
    const status = entryStatus(entry);
    const heading = entryHeading(entry);
    return (
        <tr className="border-t border-line">
            <Td className="whitespace-nowrap text-dim">{entryDate(entry.createdAt)}</Td>
            <Td>
                <Cell
                    title={
                        entry.campaignId ? (
                            <Link href={`/advertiser/campaigns/${encodeURIComponent(entry.campaignId)}`} className="hover:text-brand">
                                {heading}
                            </Link>
                        ) : (
                            heading
                        )
                    }
                    line={[source, detail].filter(Boolean).join(" · ") || undefined}
                />
            </Td>
            <Td align="right" className={cn("whitespace-nowrap tabular-nums font-medium", debit ? "text-ink" : "text-success")}>
                {signedInr(entry.amount)}
            </Td>
            {showBalance && (
                <Td align="right" className="whitespace-nowrap tabular-nums text-dim">
                    <span title={entry.isGoodwill ? "ADX credit after this line" : "Balance after this line"}>{inr(entry.balanceAfter)}</span>
                    {entry.isGoodwill && <span className="ml-1 text-[11px]">credit</span>}
                </Td>
            )}
            <Td>{status ? <StatusChip label={status.label} tone={status.tone} pill={false} /> : <span className="text-sm text-dim">—</span>}</Td>
        </tr>
    );
}
