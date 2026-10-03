"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PageHeading, Panel } from "@/components/workspace/page-heading";
import { brandButton, CardTitle, Cell, DataTable, ErrorNote, KeyRow, Loading, StatusText, TableRow, TitleCell } from "@/components/publisher/parts";
import { useLoad } from "@/components/publisher/use-load";
import { usePartnerAccount } from "@/components/partner/partner-context";
import { FeatureOff } from "@/components/platform/feature-off";
import { FLAG_PRINT_QUOTES, useSwitchedOff } from "@/lib/flags";
import { AgreementPanel, KycBannerPanel, Note, useNow } from "@/components/partner/parts";
import { formatMoney } from "@/services/publisher-workspace";
import { countdown, deadlinePassed, IN_HAND, isApplicant, JOB_WORDS, jobRef, jobWhen, partnerService, requestRef, sortJobs, specSummary, type PrintJob, type QuoteRequest } from "@/services/partner";

interface Floor {
    jobs: PrintJob[];
    requests: QuoteRequest[];
    /** A read that failed says so without taking the page with it. */
    failed: string[];
}

/** `quotesOn: false` — quote requests are switched off (`partners.quotes`) — leaves that read out rather than drawing its 503. */
async function readFloor(quotesOn = true): Promise<Floor> {
    const failed: string[] = [];
    const [jobs, requests] = await Promise.all([
        partnerService
            .jobs({ pageSize: 100 })
            .then((page) => page.items)
            .catch(() => {
                failed.push("jobs");
                return [] as PrintJob[];
            }),
        quotesOn
            ? partnerService
                  .quoteRequests({ status: ["OPEN"], pageSize: 50 })
                  .then((page) => page.items)
                  .catch(() => {
                      failed.push("quote requests");
                      return [] as QuoteRequest[];
                  })
            : Promise.resolve([] as QuoteRequest[]),
    ]);
    return { jobs, requests, failed };
}

/**
 * The print partner's home — the app's floor on one page: what is waiting
 * on the shop (to accept, printing, awaiting pickup, open quotes), the KYC
 * and the service agreement while they are outstanding, the jobs in hand,
 * the open quote requests with their deadlines, and the wallet.
 */
export default function PartnerHome() {
    const router = useRouter();
    const { partner, loaded, error: partnerError, reload: reloadPartner } = usePartnerAccount();
    const quotesOff = useSwitchedOff(FLAG_PRINT_QUOTES);
    const { data, error, loading, reload } = useLoad(`partner-floor${quotesOff ? ":no-quotes" : ""}`, () => readFloor(!quotesOff));
    const now = useNow();
    const applicant = !!partner && isApplicant(partner);

    React.useEffect(() => {
        if (applicant) router.replace("/partner/apply");
    }, [applicant, router]);

    if (applicant) return <Loading label="Opening your application…" />;
    if (!loaded || (!data && loading)) return <Loading label="Loading your print floor…" />;
    if (!partner) return <ErrorNote message={partnerError ?? "Could not read your shop's details."} onRetry={reloadPartner} />;

    const jobs = data?.jobs ?? [];
    const requests = data?.requests ?? [];
    const toAccept = jobs.filter((job) => job.status === "REQUESTED").length;
    const printing = jobs.filter((job) => job.status === "PRINTING").length;
    const ready = jobs.filter((job) => job.status === "READY").length;
    const inHand = sortJobs(jobs.filter((job) => IN_HAND.includes(job.status)));
    const open = requests.filter((request) => request.status === "OPEN" && !deadlinePassed(request.deadlineAt, now)).sort((a, b) => a.deadlineAt.localeCompare(b.deadlineAt));
    const unquoted = open.filter((request) => request.myQuote?.status !== "SUBMITTED").length;
    const balances = partner.balances ?? null;

    return (
        <>
            <PageHeading
                title={partner.name}
                subtitle={["Print partner", partner.displayId, partner.city].filter(Boolean).join(" · ")}
                actions={
                    <Link href="/partner/jobs" className={brandButton}>
                        All jobs
                    </Link>
                }
            />
            {error && (
                <div className="mt-4">
                    <ErrorNote message={error} onRetry={reload} />
                </div>
            )}
            {data && data.failed.length > 0 && (
                <Note tone="warning" className="mt-4">
                    Your {data.failed.join(" and ")} could not be read just now. <button type="button" onClick={reload} className="font-semibold underline underline-offset-4">Try again</button>
                </Note>
            )}

            <div className="mt-6 grid gap-4">
                {!partner.isActive && <Note tone="danger">Your shop is off ADX's roster. Jobs and quote requests stop until ADX puts it back — Help & support can tell you why.</Note>}
                <KycBannerPanel partner={partner} />
                <AgreementPanel partner={partner} next="/partner" />
            </div>

            <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Figure value={toAccept} label="To accept" href="/partner/jobs?status=REQUESTED" />
                <Figure value={printing} label="Printing" href="/partner/jobs?status=PRINTING" />
                <Figure value={ready} label="Awaiting pickup" href="/partner/jobs?status=READY" />
                {!quotesOff && <Figure value={open.length} label="Open quote requests" href="/partner/quotes?status=OPEN" />}
            </div>

            {!partner.rateCard.hasRateCard && (
                <Note tone="info" className="mt-4">
                    {partner.acceptsQuoteRequests ? (
                        <>
                            No rate card on file. <Link href="/partner/rate-card" className="font-semibold underline underline-offset-4">Add one</Link> and ADX asks you first, before a print goes out to tender.
                        </>
                    ) : (
                        <>
                            No rate card on file, and quote requests are off — ADX has no way to send you work. <Link href="/partner/rate-card" className="font-semibold underline underline-offset-4">Add a rate card</Link>, or switch quote requests on from your <Link href="/partner/profile" className="font-semibold underline underline-offset-4">shop profile</Link>.
                        </>
                    )}
                </Note>
            )}

            <section aria-labelledby="in-hand-heading" className="mt-10 min-w-0">
                <div className="flex items-end justify-between gap-4">
                    <div>
                        <h2 id="in-hand-heading" className="text-base font-semibold text-ink">
                            In hand
                        </h2>
                        <p className="mt-1 text-sm text-dim">
                            {inHand.length} job{inHand.length === 1 ? "" : "s"} waiting on you or on the agent
                        </p>
                    </div>
                    <Link href="/partner/jobs" className="text-sm font-medium text-ink hover:underline">
                        View all jobs
                    </Link>
                </div>
                <div className="mt-4">
                    {inHand.length === 0 ? (
                        <Panel>
                            <p className="text-sm font-medium text-ink">Nothing in hand</p>
                            <p className="mt-1 text-sm text-dim">A job ADX assigns or awards to you appears here, with the artwork and the agent who collects.</p>
                        </Panel>
                    ) : (
                        <DataTable columns={[{ label: "Job" }, { label: "Status" }, { label: "When" }, { label: "Price", align: "right" }, { label: "", align: "right" }]}>
                            {inHand.slice(0, 6).map((job) => {
                                const words = JOB_WORDS[job.status];
                                return (
                                    <TableRow key={job.id}>
                                        <Cell>
                                            <TitleCell title={job.order?.site.title ?? `Booking ${jobRef(job)}`} line={[jobRef(job), job.order?.campaignName].filter(Boolean).join(" · ")} href={`/partner/jobs/${job.id}`} />
                                        </Cell>
                                        <Cell>
                                            <StatusText tone={words.tone} className="whitespace-nowrap">{words.label}</StatusText>
                                        </Cell>
                                        <Cell>
                                            <span className="whitespace-nowrap text-dim">{jobWhen(job)}</span>
                                        </Cell>
                                        <Cell align="right">
                                            <span className="whitespace-nowrap text-ink">{job.quotedCost ? formatMoney(job.quotedCost) : "To agree"}</span>
                                        </Cell>
                                        <Cell align="right">
                                            <Link href={`/partner/jobs/${job.id}`} className="whitespace-nowrap text-sm font-semibold text-ink hover:underline">
                                                {job.status === "READY" ? "Hand over" : job.status === "REQUESTED" ? "Respond" : "Open job"}
                                            </Link>
                                        </Cell>
                                    </TableRow>
                                );
                            })}
                        </DataTable>
                    )}
                </div>
            </section>

            <div className="mt-10 grid gap-6 md:grid-cols-2">
                <Panel>
                    <CardTitle>Your ADX wallet</CardTitle>
                    <p className="mt-2 text-2xl font-semibold text-ink">{formatMoney(balances?.balance ?? "0.00")}</p>
                    <p className="mt-2 text-sm text-dim">{balances ? `${formatMoney(balances.withdrawable)} cleared and ready to withdraw` : "Opens with your first print charge."}</p>
                    <Link href="/partner/earnings" className="mt-4 inline-block text-sm font-semibold text-ink hover:underline">
                        View earnings
                    </Link>
                </Panel>

                {quotesOff ? (
                    <Panel>
                        <CardTitle>Quote requests</CardTitle>
                        <FeatureOff flag={FLAG_PRINT_QUOTES} className="mt-2 border-0 p-0 text-dim" />
                    </Panel>
                ) : (
                    <Panel>
                        <div className="flex items-center justify-between gap-3">
                            <CardTitle>Quote requests</CardTitle>
                            <Link href="/partner/quotes" className="text-sm font-medium text-ink hover:underline">
                                All requests
                            </Link>
                        </div>
                        {open.length === 0 ? (
                            <p className="mt-2 text-sm text-dim">{partner.acceptsQuoteRequests ? "No open requests. ADX invites you when a print in your reach goes out for quotes." : "Quote requests are switched off on your shop profile."}</p>
                        ) : (
                            <ul className="mt-3 divide-y divide-line">
                                {open.slice(0, 4).map((request) => {
                                    const quoted = request.myQuote?.status === "SUBMITTED";
                                    return (
                                        <li key={request.id} className="py-3">
                                            <Link href={`/partner/quotes/${request.id}`} className="block hover:underline">
                                                <span className="text-sm font-medium text-ink">{requestRef(request)}</span>
                                                {request.city && <span className="text-sm text-dim"> · {request.city}</span>}
                                            </Link>
                                            <p className="mt-0.5 truncate text-xs text-dim">{specSummary(request.specs)}</p>
                                            <div className="mt-1 flex items-center justify-between gap-3">
                                                <StatusText tone={quoted ? "info" : "warning"} className="text-xs">
                                                    {quoted ? `Quoted ${formatMoney(request.myQuote!.amount)}` : "Quote wanted"}
                                                </StatusText>
                                                <span className="text-xs text-dim">{countdown(request.deadlineAt, now)}</span>
                                            </div>
                                        </li>
                                    );
                                })}
                            </ul>
                        )}
                        {unquoted > 0 && (
                            <div className="mt-2 border-t border-line pt-3">
                                <KeyRow label="Still without your quote" value={`${unquoted}`} strong className="py-0" />
                            </div>
                        )}
                    </Panel>
                )}
            </div>
        </>
    );
}

function Figure({ value, label, href }: { value: number; label: string; href: string }) {
    return (
        <Link href={href} className="rounded-lg border border-line bg-white p-5 transition-colors hover:border-ink">
            <span className="block text-2xl font-semibold text-ink">{value}</span>
            <span className="mt-1 block text-sm text-dim">{label}</span>
        </Link>
    );
}
