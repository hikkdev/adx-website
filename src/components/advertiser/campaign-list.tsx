"use client";

import * as React from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { Cell, StatusChip, TablePanel, Td, Th } from "@/components/advertiser/bits";
import { advertiserWorkspace, campaignContinueHref, campaignStatusLabel, dateRange, daysLabel, rupees, spacesLine, type CampaignDetail, type CampaignRow } from "@/services/advertiser-workspace";
import { campaignTabs, moneyRatio, spendLabel, type CampaignTab } from "@/services/campaigns";

/*
 * The campaign book's parts, shared by the Overview's "Recent campaigns"
 * and the Campaigns page (DR 12 · 07 · 01, 5204:75477): the row the frame
 * draws (campaign · schedule · money · status · the one action), the dark
 * segmented tabs with their counts, and the read that sharpens a scheduled
 * row's status ("Artwork in review", "Verify to launch").
 */

/** The detail of each scheduled row (at most twelve), so the status column can say what a paid campaign is waiting on. */
export async function campaignDetailsFor(rows: CampaignRow[]): Promise<Record<string, CampaignDetail>> {
    const details: Record<string, CampaignDetail> = {};
    await Promise.all(
        rows
            .filter((row) => row.status === "SCHEDULED")
            .slice(0, 12)
            .map(async (row) => {
                try {
                    details[row.id] = await advertiserWorkspace.campaign(row.id);
                } catch {
                    /* The row's own status stands. */
                }
            })
    );
    return details;
}

/** The frame's table: the header row, then whatever rows (or the empty line) the caller hands it. */
export function CampaignTable({ children, className, testId }: { children: React.ReactNode; className?: string; testId?: string }) {
    return (
        <TablePanel className={className}>
            <thead>
                <tr>
                    <Th>Campaign</Th>
                    <Th>Schedule</Th>
                    <Th align="right">Money</Th>
                    <Th>Status</Th>
                    <Th />
                </tr>
            </thead>
            <tbody data-testid={testId}>{children}</tbody>
        </TablePanel>
    );
}

/** One campaign row: a draft continues, an unpaid brief pays, anything paid opens its own page; a live one carries its spend bar. */
export function CampaignLine({ row, detail }: { row: CampaignRow; detail?: CampaignDetail }) {
    const status = campaignStatusLabel(detail ? { status: row.status, creatives: detail.creatives, launchBlockedBy: detail.launchBlockedBy } : { status: row.status });
    const isDraft = row.status === "DRAFT" || row.status === "PENDING_PAYMENT";
    const scheduled = row.startDate && row.endDate;
    const kycHeld = row.status === "SCHEDULED" && !!detail?.launchBlockedBy?.includes("KYC");
    const spend = row.status === "LIVE" ? spendLabel(row) : null;
    const money =
        row.status === "DRAFT"
            ? "—"
            : row.status === "SCHEDULED" || row.status === "PENDING_PAYMENT"
              ? row.budget || row.total
                  ? `${rupees(row.budget ?? row.total)} budget`
                  : "—"
              : row.spendToDate || row.total
                ? `${rupees(row.spendToDate ?? row.total)} spent`
                : "—";
    return (
        <tr className="border-t border-line" data-testid="campaign-row">
            <Td>
                <Cell title={<span className="font-medium">{row.name || "Untitled campaign"}</span>} line={row.status === "DRAFT" ? "Draft · Campaign brief saved" : `${row.reference} · ${spacesLine(row.spotCount, row.city)}`} />
                {spend && (
                    <div className="mt-2 flex max-w-[260px] items-center gap-2">
                        <div className="h-1.5 flex-1 rounded-full bg-ground">
                            <div className="h-1.5 rounded-full bg-brand" style={{ width: `${moneyRatio(row.spendToDate ?? null, row.budget ?? null) * 100}%` }} />
                        </div>
                        <span className="shrink-0 text-[11px] tabular-nums text-dim">{spend}</span>
                    </div>
                )}
            </Td>
            <Td>{scheduled ? <Cell title={dateRange(row.startDate, row.endDate)} line={daysLabel(row.startDate, row.endDate)} /> : <Cell title="Not scheduled" line="Choose dates in your brief" />}</Td>
            <Td align="right" className="tabular-nums">
                {money}
            </Td>
            <Td>
                {kycHeld ? (
                    <Link href="/advertiser/verify" className="text-sm text-warning underline underline-offset-2 hover:text-ink">
                        {status.label}
                    </Link>
                ) : (
                    <StatusChip label={status.label} tone={status.tone} pill={false} />
                )}
            </Td>
            <Td align="right">
                <Link href={isDraft ? campaignContinueHref(row) : `/advertiser/campaigns/${row.id}`} className="whitespace-nowrap text-sm font-semibold text-ink hover:text-brand">
                    {row.status === "DRAFT" ? "Continue draft" : row.status === "PENDING_PAYMENT" ? "Pay now" : "View campaign"}
                </Link>
            </Td>
        </tr>
    );
}

/**
 * The dark segmented pill the Campaigns frame draws, one segment a tab, each
 * with the server's count — drawn whole even when every count is zero. It
 * scrolls sideways on a phone rather than wrapping the pill.
 */
export function CampaignTabBar({ value, counts, onChange }: { value: CampaignTab; counts: Record<string, number> | undefined; onChange: (tab: CampaignTab) => void }) {
    return (
        <div className="max-w-full overflow-x-auto pb-1 [scrollbar-width:thin]">
            <div role="tablist" aria-label="Campaign history" className="inline-flex h-[34px] items-center rounded-full bg-[#3a3a3d] p-[3px]">
                {campaignTabs(counts).map((tab) => {
                    const active = tab.value === value;
                    return (
                        <button key={tab.value} type="button" role="tab" aria-selected={active} data-tab={tab.value} onClick={() => onChange(tab.value)} className={cn("h-7 whitespace-nowrap rounded-full px-4 text-xs font-semibold transition-colors", active ? "bg-white text-ink" : "text-white/85 hover:text-white")}>
                            {tab.label}
                            {tab.count !== null && <span className={cn("ml-1.5 tabular-nums", active ? "text-dim" : "text-white/60")}>{tab.count}</span>}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
