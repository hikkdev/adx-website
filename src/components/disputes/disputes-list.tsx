"use client";

import * as React from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { messageOf } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { PageHeading } from "@/components/workspace/page-heading";
import { btnPrimary, Cell, ErrorPanel, LoadingLine, Segmented, StatusChip, TablePanel, Td, Th } from "@/components/advertiser/bits";
import { cardFoot, DISPUTE_FILTERS, disputesService, matchesFilter, matchesSearch, orderTag, reasonLabel, shortOrder, STATE_LABEL, stateOf, type DisputeFilter, type DisputeState, type MyDisputes } from "@/services/disputes";

const STATE_TONE: Record<DisputeState, "danger" | "warning" | "success"> = { OPEN: "danger", UNDER_REVIEW: "warning", RESOLVED: "success" };

/**
 * The app's Disputes list: the three counts, a search, the four chips, and
 * every case the person is a party to — raised by them or against them —
 * with where it stands and what they can do next.
 */
export function DisputesList({ base }: { base: "/advertiser" | "/publisher" }) {
    const [data, setData] = React.useState<MyDisputes | null>(null);
    const [error, setError] = React.useState<string | null>(null);
    const [filter, setFilter] = React.useState<DisputeFilter>("ALL");
    const [query, setQuery] = React.useState("");

    React.useEffect(() => {
        let cancelled = false;
        disputesService
            .mine()
            .then((next) => {
                if (!cancelled) setData(next);
            })
            .catch((caught: unknown) => {
                if (!cancelled) setError(messageOf(caught, "Could not read your disputes."));
            });
        return () => {
            cancelled = true;
        };
    }, []);

    const heading = (
        <PageHeading
            title="Disputes"
            subtitle="A case about an order — a rejected proof, damage, the wrong location, a payout. ADX reviews it with both sides."
            actions={
                <Link href={`${base}/disputes/new`} className={btnPrimary}>
                    Raise a dispute
                </Link>
            }
        />
    );

    if (error && !data) {
        return (
            <>
                {heading}
                <ErrorPanel title="Could not read your disputes" message={error} />
            </>
        );
    }
    if (!data) {
        return (
            <>
                {heading}
                <div className="mt-6">
                    <LoadingLine>Loading your disputes…</LoadingLine>
                </div>
            </>
        );
    }

    const shown = data.disputes.filter((d) => matchesFilter(d, filter) && matchesSearch(d, query));

    return (
        <>
            {heading}
            <div className="mt-6 grid gap-3 sm:grid-cols-3">
                <Count label="Open" value={data.counts.open} tone="text-brand-bright" />
                <Count label="Under review" value={data.counts.underReview} tone="text-warning" />
                <Count label="Resolved" value={data.counts.resolved} tone="text-success" />
            </div>

            <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
                <Segmented value={filter} onChange={setFilter} options={DISPUTE_FILTERS.map((f) => ({ value: f.id, label: f.label }))} />
                <label className="flex h-10 w-full max-w-[320px] items-center gap-2 rounded-full border border-line bg-white px-4">
                    <Search className="size-4 text-dim" aria-hidden />
                    <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by case, order or words" aria-label="Search disputes" className="min-w-0 flex-1 bg-transparent text-sm text-ink placeholder:text-dim focus:outline-none" />
                </label>
            </div>

            <TablePanel className="mt-4">
                <thead>
                    <tr>
                        <Th>Case</Th>
                        <Th>Order</Th>
                        <Th>Last</Th>
                        <Th>Status</Th>
                        <Th />
                    </tr>
                </thead>
                <tbody>
                    {shown.map((dispute) => {
                        const state = stateOf(dispute.status);
                        const foot = cardFoot(dispute);
                        return (
                            <tr key={dispute.id} className="border-t border-line">
                                <Td>
                                    <Cell
                                        title={
                                            <Link href={`${base}/disputes/${dispute.id}`} className="font-medium text-ink hover:text-brand">
                                                {dispute.displayId} · {reasonLabel(dispute.reason)}
                                            </Link>
                                        }
                                        line={<span className="line-clamp-1">{dispute.detail}</span>}
                                    />
                                </Td>
                                <Td>
                                    <Cell title={dispute.order?.listing?.title ?? dispute.order?.campaignName ?? "Order"} line={dispute.orderId ? `${shortOrder(dispute.orderId)} · ${orderTag(dispute.order?.status ?? "")}` : undefined} />
                                </Td>
                                <Td className="text-sm text-dim">{foot.left}</Td>
                                <Td>
                                    <StatusChip label={STATE_LABEL[state]} tone={STATE_TONE[state]} />
                                </Td>
                                <Td align="right">
                                    <Link href={`${base}/disputes/${dispute.id}`} className={cn("whitespace-nowrap text-sm font-semibold hover:text-brand", foot.tone === "money" ? "text-success" : foot.tone === "muted" ? "text-dim" : "text-ink")}>
                                        {foot.right}
                                    </Link>
                                </Td>
                            </tr>
                        );
                    })}
                    {shown.length === 0 && (
                        <tr className="border-t border-line">
                            <td colSpan={5} className="px-5 py-10 text-center text-sm text-dim">
                                {data.disputes.length === 0 ? "No disputes. If something goes wrong with an order, raise a case and ADX reviews it with both sides." : "No case matches that."}
                            </td>
                        </tr>
                    )}
                </tbody>
            </TablePanel>
        </>
    );
}

function Count({ label, value, tone }: { label: string; value: number; tone: string }) {
    return (
        <div className="rounded-lg border border-line bg-white px-4 py-3">
            <p className={cn("text-2xl font-semibold", tone)}>{value}</p>
            <p className="text-xs font-medium uppercase tracking-wide text-dim">{label}</p>
        </div>
    );
}
