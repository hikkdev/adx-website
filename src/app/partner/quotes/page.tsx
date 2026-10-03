"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { PageHeading, Panel } from "@/components/workspace/page-heading";
import { Cell, DataTable, ErrorNote, Loading, Segmented, StatusText, TableRow, TitleCell } from "@/components/publisher/parts";
import { useLoad } from "@/components/publisher/use-load";
import { usePartnerAccount } from "@/components/partner/partner-context";
import { ApplicantGate, useNow } from "@/components/partner/parts";
import { formatMoney } from "@/services/publisher-workspace";
import { countdown, deadlinePassed, formatWhen, partnerService, readable, REQUEST_CHIPS, requestOutcome, requestRef, sortRequests, specSummary, standingQuote, type QuoteRequestStatus } from "@/services/partner";

export default function PartnerQuotesPage() {
    return (
        <React.Suspense fallback={<Loading label="Loading your quote requests…" />}>
            <QuotesView />
        </React.Suspense>
    );
}

const isStatus = (value: string | null): value is QuoteRequestStatus => !!value && REQUEST_CHIPS.some((chip) => chip.value === value && value !== "ALL");

/**
 * Quote requests — the orders ADX has asked this shop to price. Bids are
 * sealed: the list carries the request and only this shop's own quote. The
 * lowest quote is awarded unless ADX says why not.
 */
function QuotesView() {
    const router = useRouter();
    const search = useSearchParams();
    const wanted = search.get("status");
    const filter: QuoteRequestStatus | "ALL" = isStatus(wanted) ? wanted : "ALL";
    const { partner } = usePartnerAccount();
    const now = useNow();
    const { data, error, loading, reload } = useLoad(`partner-quotes:${filter}`, () => readable(partnerService.quoteRequests({ ...(filter === "ALL" ? {} : { status: [filter] }), pageSize: 100 }), "Could not read your quote requests."));

    const setFilter = (next: QuoteRequestStatus | "ALL") => router.replace(next === "ALL" ? "/partner/quotes" : `/partner/quotes?status=${next}`);
    const requests = sortRequests(data?.items ?? [], now);
    const counts = data?.counts ?? {};

    return (
        <>
            <PageHeading title="Quote requests" subtitle="Orders ADX has asked your shop to price. The lowest quote is awarded; only ADX sees the others." />
            <ApplicantGate what="Quote requests">
                <div className="mt-6">
                    <Segmented label="Request status" value={filter} onChange={setFilter} options={REQUEST_CHIPS.map((chip) => ({ value: chip.value, label: chip.label, ...(chip.value === "ALL" ? {} : { count: counts[chip.value] ?? 0 }) }))} />
                </div>
                {error && (
                    <div className="mt-4">
                        <ErrorNote message={error} onRetry={reload} />
                    </div>
                )}
                <div className="mt-4">
                    {!data && loading ? (
                        <Loading label="Loading your quote requests…" />
                    ) : requests.length === 0 ? (
                        <Panel>
                            <p className="text-sm font-medium text-ink">{filter === "ALL" ? "No requests yet" : "Nothing in this view"}</p>
                            <p className="mt-1 text-sm text-dim">
                                {filter !== "ALL" ? (
                                    "Try All to see every request."
                                ) : partner && !partner.acceptsQuoteRequests ? (
                                    <>
                                        Quote requests are switched off for your shop. Turn them on from your{" "}
                                        <Link href="/partner/profile" className="font-medium text-ink underline underline-offset-4">
                                            shop profile
                                        </Link>
                                        .
                                    </>
                                ) : (
                                    "ADX invites the shops in reach that accept quote requests. A new request appears here with its deadline."
                                )}
                            </p>
                        </Panel>
                    ) : (
                        <DataTable columns={[{ label: "Booking" }, { label: "City" }, { label: "Deadline" }, { label: "Your quote", align: "right" }, { label: "Status" }, { label: "", align: "right" }]}>
                            {requests.map((request) => {
                                const outcome = requestOutcome(request, now);
                                const live = request.status === "OPEN" && !deadlinePassed(request.deadlineAt, now);
                                const quote = standingQuote(request);
                                return (
                                    <TableRow key={request.id}>
                                        <Cell>
                                            <TitleCell title={requestRef(request)} line={specSummary(request.specs)} href={`/partner/quotes/${request.id}`} />
                                        </Cell>
                                        <Cell>
                                            <span className="text-dim">{request.city ?? "—"}</span>
                                        </Cell>
                                        <Cell>
                                            <span className={live ? "whitespace-nowrap font-medium text-warning" : "whitespace-nowrap text-dim"}>{live ? countdown(request.deadlineAt, now) : formatWhen(request.deadlineAt)}</span>
                                        </Cell>
                                        <Cell align="right">
                                            <span className="whitespace-nowrap text-ink">{quote ? formatMoney(quote.amount) : "—"}</span>
                                        </Cell>
                                        <Cell>
                                            <StatusText tone={outcome.tone} className="whitespace-nowrap">{outcome.label}</StatusText>
                                        </Cell>
                                        <Cell align="right">
                                            <Link href={`/partner/quotes/${request.id}`} className="whitespace-nowrap text-sm font-semibold text-ink hover:underline">
                                                {live && !quote ? "Send a quote" : "Open"}
                                            </Link>
                                        </Cell>
                                    </TableRow>
                                );
                            })}
                        </DataTable>
                    )}
                </div>
            </ApplicantGate>
        </>
    );
}
