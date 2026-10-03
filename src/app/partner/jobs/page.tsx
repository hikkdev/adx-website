"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { PageHeading, Panel } from "@/components/workspace/page-heading";
import { Cell, DataTable, ErrorNote, Loading, Segmented, StatusText, TableRow, TitleCell } from "@/components/publisher/parts";
import { useLoad } from "@/components/publisher/use-load";
import { ApplicantGate, Note } from "@/components/partner/parts";
import { formatMoney } from "@/services/publisher-workspace";
import { JOB_CHIPS, JOB_WORDS, jobRef, jobWhen, partnerService, readable, sortJobs, type PrintJobStatus } from "@/services/partner";

export default function PartnerJobsPage() {
    return (
        <React.Suspense fallback={<Loading label="Loading your jobs…" />}>
            <JobsView />
        </React.Suspense>
    );
}

const isStatus = (value: string | null): value is PrintJobStatus => !!value && JOB_CHIPS.some((chip) => chip.value === value && value !== "ALL");

/**
 * The jobs lane — every print job assigned to this shop, from request to
 * handover (`GET /print-partners/me/jobs`). A chip sends `status=` and
 * carries the server's counts; the shop's own moves sort first.
 */
function JobsView() {
    const search = useSearchParams();
    const orderId = search.get("orderId");
    return orderId ? <JobForOrder orderId={orderId} /> : <JobsList />;
}

/**
 * An ORDER notice names the booking, not the job: find this shop's job for
 * it (`GET /print-partners/me/jobs?orderId=`) and open it. When the booking
 * has no job here (reassigned, or never this shop's), say so and offer the list.
 */
function JobForOrder({ orderId }: { orderId: string }) {
    const router = useRouter();
    const { data, error, loading, reload } = useLoad(`partner-job-for:${orderId}`, () => readable(partnerService.jobForOrder(orderId), "Could not find the job for this booking."));
    React.useEffect(() => {
        if (data) router.replace(`/partner/jobs/${encodeURIComponent(data.id)}`);
    }, [data, router]);
    if (error) return <ErrorNote message={error} onRetry={reload} />;
    if (loading || data) return <Loading label="Opening the job…" />;
    return (
        <>
            <PageHeading title="Print jobs" subtitle="Every job ADX has assigned to your shop, from request to handover." />
            <Panel className="mt-6">
                <p className="text-sm font-medium text-ink">No job for this booking</p>
                <p className="mt-1 text-sm text-dim">The notice named a booking your shop has no print job for — it may have moved to another shop.</p>
                <Link href="/partner/jobs" className="mt-3 inline-block text-sm font-medium text-brand underline-offset-2 hover:underline">
                    See all your jobs
                </Link>
            </Panel>
        </>
    );
}

function JobsList() {
    const router = useRouter();
    const search = useSearchParams();
    const wanted = search.get("status");
    const filter: PrintJobStatus | "ALL" = isStatus(wanted) ? wanted : "ALL";
    const { data, error, loading, reload } = useLoad(`partner-jobs:${filter}`, () => readable(partnerService.jobs({ ...(filter === "ALL" ? {} : { status: [filter] }), pageSize: 100 }), "Could not read your jobs."));

    const setFilter = (next: PrintJobStatus | "ALL") => router.replace(next === "ALL" ? "/partner/jobs" : `/partner/jobs?status=${next}`);
    const jobs = sortJobs(data?.items ?? []);
    const counts = data?.counts ?? {};
    const ready = jobs.filter((job) => job.status === "READY").length;

    return (
        <>
            <PageHeading title="Print jobs" subtitle="Every job ADX has assigned to your shop, from request to handover." />
            <ApplicantGate what="Print jobs">
                <div className="mt-6 overflow-x-auto">
                    <Segmented label="Job status" value={filter} onChange={setFilter} options={JOB_CHIPS.map((chip) => ({ value: chip.value, label: chip.label, ...(chip.value === "ALL" ? {} : { count: counts[chip.value] ?? 0 }) }))} />
                </div>
                {error && (
                    <div className="mt-4">
                        <ErrorNote message={error} onRetry={reload} />
                    </div>
                )}
                {ready > 0 && filter !== "COLLECTED" && filter !== "CANCELLED" && (
                    <Note tone="info" className="mt-4">
                        {ready === 1 ? "One job is" : `${ready} jobs are`} awaiting pickup. When the agent arrives, open the job and enter the pickup code from their ADX app to hand it over.
                    </Note>
                )}
                <div className="mt-4">
                    {!data && loading ? (
                        <Loading label="Loading your jobs…" />
                    ) : jobs.length === 0 ? (
                        <Panel>
                            <p className="text-sm font-medium text-ink">{filter === "ALL" ? "Nothing assigned yet" : "Nothing in this view"}</p>
                            <p className="mt-1 text-sm text-dim">{filter === "ALL" ? "ADX puts a job here when it awards you a quote, or assigns a print to your shop directly." : "Try All to see every job."}</p>
                        </Panel>
                    ) : (
                        <DataTable columns={[{ label: "Job" }, { label: "When" }, { label: "Price", align: "right" }, { label: "Status" }, { label: "", align: "right" }]}>
                            {jobs.map((job) => {
                                const words = JOB_WORDS[job.status];
                                const place = [job.order?.site.address, job.order?.site.city].filter(Boolean).join(", ");
                                return (
                                    <TableRow key={job.id}>
                                        <Cell>
                                            <TitleCell title={job.order?.site.title ?? `Booking ${jobRef(job)}`} line={[jobRef(job), job.order?.site.size, job.order?.campaignName ?? place].filter(Boolean).join(" · ")} href={`/partner/jobs/${job.id}`} />
                                        </Cell>
                                        <Cell>
                                            <span className="whitespace-nowrap text-dim">{jobWhen(job)}</span>
                                        </Cell>
                                        <Cell align="right">
                                            <span className="whitespace-nowrap text-ink">{job.quotedCost ? formatMoney(job.quotedCost) : <span className="text-dim">Price to agree</span>}</span>
                                        </Cell>
                                        <Cell>
                                            <StatusText tone={words.tone} className="whitespace-nowrap">{words.label}</StatusText>
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
            </ApplicantGate>
        </>
    );
}
