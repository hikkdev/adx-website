"use client";

import * as React from "react";
import Link from "next/link";
import { ChevronDown, ChevronUp, Download } from "lucide-react";
import { toast } from "sonner";
import { Panel } from "@/components/workspace/page-heading";
import { CardTitle, Chip, Crumbs, ErrorNote, KeyRow, Loading, outlineButton, Segmented } from "@/components/publisher/parts";
import { useLoad } from "@/components/publisher/use-load";
import { InvoiceRow } from "@/components/publisher-money/invoice-row";
import { Switch } from "@/components/ui/switch";
import { messageOf } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { INVOICE_STATUS, monthStatements, publisherMoney, statementYears, type MonthStatement, type PublisherInvoice } from "@/services/publisher-money";
import { formatMoney, longDate, openBlob, publisherWorkspace, type Earnings, type NotificationPreference, type Statement } from "@/services/publisher-workspace";

interface Loaded {
    earnings: Earnings | null;
    earningsError: string | null;
    statements: Statement[];
    invoices: PublisherInvoice[];
    gstin: string | null;
    preferences: NotificationPreference[] | null;
}

async function readStatements(): Promise<Loaded> {
    const [earnings, statements, invoices, profile, preferences] = await Promise.allSettled([publisherWorkspace.earnings(), publisherWorkspace.statements(), publisherMoney.invoices(), publisherWorkspace.profile(), publisherWorkspace.notificationPreferences()]);
    return {
        earnings: earnings.status === "fulfilled" ? earnings.value : null,
        earningsError: earnings.status === "rejected" ? messageOf(earnings.reason, "Could not read your earnings.") : null,
        statements: statements.status === "fulfilled" && Array.isArray(statements.value) ? statements.value : [],
        invoices: invoices.status === "fulfilled" ? invoices.value : [],
        gstin: profile.status === "fulfilled" ? (profile.value?.gstin ?? null) : null,
        preferences: preferences.status === "fulfilled" && Array.isArray(preferences.value) ? preferences.value : null,
    };
}

/**
 * Statements — the app's monthly breakdown (DR 04 4199:2285) on the web:
 * a row per month under a year switch with what the spaces earned and
 * what ADX took; open a month for the tax withheld, what landed, every
 * campaign-day under it, the payment advice PDF, and — for a GST-registered
 * publisher — their own invoice to ADX with its status. The email switch is
 * the PAYOUT × EMAIL preference the monthly mail honours, drawn only when
 * the account carries that row.
 */
export default function StatementsPage() {
    const { data, error, loading, reload } = useLoad("statements", readStatements);
    const [year, setYear] = React.useState<string | null>(null);
    const [open, setOpen] = React.useState<string | null>(null);
    const [raised, setRaised] = React.useState<PublisherInvoice[]>([]);
    const [emailOverride, setEmailOverride] = React.useState<boolean | null>(null);
    const [savingEmail, setSavingEmail] = React.useState(false);
    const [downloading, setDownloading] = React.useState<string | null>(null);

    const months = React.useMemo(() => monthStatements(data?.earnings?.days ?? [], data?.statements ?? []), [data]);
    const years = statementYears(months);

    if (!data && loading) return <Loading label="Working out your earnings…" />;
    if (!data) return <ErrorNote message={error ?? "Could not read your statements."} onRetry={reload} />;

    const shownYear = year ?? String(years[years.length - 1] ?? "");
    const shown = months.filter((month) => String(month.year) === shownYear);
    const invoices = [...raised, ...data.invoices.filter((row) => !raised.some((mine) => mine.period === row.period))];
    const adviceFor = (key: string) => data.statements.find((row) => row.period === key) ?? null;
    const invoiceFor = (key: string) => invoices.find((row) => row.period === key) ?? null;
    const emailRow = data.preferences?.find((row) => row.type === "PAYOUT" && row.channel === "EMAIL") ?? null;
    const emailOn = emailOverride ?? emailRow?.enabled ?? false;
    const summary = data.earnings?.summary ?? null;

    const download = async (month: MonthStatement, advice: Statement) => {
        setDownloading(month.key);
        try {
            openBlob(await publisherWorkspace.statementPdf(advice.id), `ADX payment advice ${month.key}.pdf`);
        } catch (caught) {
            toast.error(messageOf(caught, "The download did not go through."));
        } finally {
            setDownloading(null);
        }
    };

    const setEmail = async (enabled: boolean) => {
        if (!emailRow || savingEmail) return;
        setSavingEmail(true);
        setEmailOverride(enabled);
        try {
            await publisherWorkspace.saveNotificationPreferences([{ type: "PAYOUT", channel: "EMAIL", enabled }]);
            toast.success(enabled ? "Monthly statements will be emailed" : "Monthly statements will not be emailed");
        } catch (caught) {
            setEmailOverride(null);
            toast.error(messageOf(caught, "That did not save."));
        } finally {
            setSavingEmail(false);
        }
    };

    return (
        <>
            <Crumbs items={[{ label: "Earnings", href: "/publisher/earnings" }, { label: "Statements" }]} />
            <div className="mt-6 flex flex-wrap items-end justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-semibold tracking-tight text-ink">Statements</h1>
                    <p className="mt-1 text-sm text-dim">What your spaces earned each month, what ADX and the tax authority took from it, and what landed in your wallet.</p>
                </div>
                {years.length > 1 && <Segmented label="Year" value={shownYear} onChange={setYear} options={years.map((value) => ({ value: String(value), label: String(value) }))} />}
            </div>

            {data.earningsError && (
                <div className="mt-4">
                    <ErrorNote message={data.earningsError} onRetry={reload} />
                </div>
            )}

            <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_300px]">
                <div className="grid content-start gap-4">
                    {months.length === 0 && (
                        <Panel>
                            <p className="text-sm text-dim">No campaign-days yet. A day is earned once it is over, so a campaign that started today shows its first row tomorrow.</p>
                        </Panel>
                    )}
                    {shown.map((month) => {
                        const expanded = open === month.key;
                        const advice = adviceFor(month.key);
                        const invoice = invoiceFor(month.key);
                        return (
                            <section key={month.key} className="rounded-lg border border-line bg-white">
                                <div className="flex flex-wrap items-center gap-4 px-5 py-4">
                                    <button type="button" onClick={() => setOpen(expanded ? null : month.key)} aria-expanded={expanded} className="min-w-0 flex-1 text-left">
                                        <span className="flex flex-wrap items-center gap-2">
                                            <span className="text-base font-semibold text-ink">{month.label}</span>
                                            {invoice && <Chip tone={INVOICE_STATUS[invoice.status].tone}>Invoice · {INVOICE_STATUS[invoice.status].label}</Chip>}
                                        </span>
                                        <span className="mt-2 grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-4">
                                            <Figure label="Earned" value={month.gross} />
                                            <Figure label="Commission" value={month.commission} />
                                            <Figure label="TDS" value={month.taxWithheld} />
                                            <Figure label="Credited to you" value={month.net} strong />
                                        </span>
                                    </button>
                                    {advice && (
                                        <button type="button" onClick={() => void download(month, advice)} disabled={downloading !== null} aria-label={`Payment advice for ${month.label}`} className={cn(outlineButton, "h-9 gap-2 px-3")}>
                                            <Download className="size-4" aria-hidden />
                                            {downloading === month.key ? "Opening…" : "Payment advice"}
                                        </button>
                                    )}
                                    <button type="button" onClick={() => setOpen(expanded ? null : month.key)} aria-label={expanded ? "Close the month" : "Open the month"} className="flex size-9 items-center justify-center rounded-full border border-line text-ink hover:border-ink">
                                        {expanded ? <ChevronUp className="size-4" aria-hidden /> : <ChevronDown className="size-4" aria-hidden />}
                                    </button>
                                </div>
                                {expanded && (
                                    <div className="grid gap-4 border-t border-line px-5 py-4">
                                        {data.gstin && <InvoiceRow month={month} gstin={data.gstin} invoice={invoice} onRaised={(row) => setRaised((current) => [row, ...current.filter((mine) => mine.period !== row.period)])} />}
                                        {month.days.length === 0 ? (
                                            <p className="text-sm text-dim">No campaign-days this month — the payment advice covers what else moved on your wallet.</p>
                                        ) : (
                                            <div className="overflow-x-auto rounded-lg border border-line">
                                                <table className="w-full min-w-[640px] text-sm">
                                                    <thead>
                                                        <tr className="bg-[#f5f5f3] text-left text-xs font-medium text-dim">
                                                            <th scope="col" className="h-9 px-3 font-medium">Day</th>
                                                            <th scope="col" className="h-9 px-3 text-right font-medium">Advertiser paid</th>
                                                            <th scope="col" className="h-9 px-3 text-right font-medium">ADX commission</th>
                                                            <th scope="col" className="h-9 px-3 text-right font-medium">Tax withheld</th>
                                                            <th scope="col" className="h-9 px-3 text-right font-medium">Credited to you</th>
                                                            <th scope="col" className="h-9 px-3 font-medium">Clearing</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {month.days.map((day) => (
                                                            <tr key={day.id} className="border-t border-line">
                                                                <td className="px-3 py-2.5">
                                                                    <p className="whitespace-nowrap text-ink">{longDate(day.forDate)}</p>
                                                                    <p className="max-w-[220px] truncate text-xs text-dim">{[day.listing.title, day.listing.city].filter(Boolean).join(" · ")}</p>
                                                                </td>
                                                                <td className="px-3 py-2.5 text-right tabular-nums text-ink">{formatMoney(day.gross, { paise: "always" })}</td>
                                                                <td className="px-3 py-2.5 text-right tabular-nums text-dim">{formatMoney(day.commission, { paise: "always" })}</td>
                                                                <td className="px-3 py-2.5 text-right tabular-nums text-dim">{formatMoney(day.taxWithheld, { paise: "always" })}</td>
                                                                <td className="px-3 py-2.5 text-right font-medium tabular-nums text-ink">{formatMoney(day.net, { paise: "always" })}</td>
                                                                <td className="px-3 py-2.5">{day.cleared ? <Chip tone="success">Cleared</Chip> : <Chip tone="info">Clears {longDate(day.clearsAt)}</Chip>}</td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </section>
                        );
                    })}
                </div>

                <div className="grid content-start gap-6">
                    {summary && (
                        <Panel>
                            <CardTitle>All time</CardTitle>
                            <div className="mt-2">
                                <KeyRow label="Advertisers paid" value={formatMoney(summary.grossEarned, { paise: "always" })} className="py-1.5" />
                                <KeyRow label="ADX commission" value={formatMoney(summary.commission, { paise: "always" })} className="py-1.5" />
                                <KeyRow label="Tax withheld (TDS)" value={formatMoney(summary.taxWithheld, { paise: "always" })} className="py-1.5" />
                                <div className="border-t border-line" />
                                <KeyRow label="Yours" value={formatMoney(summary.netEarned, { paise: "always" })} strong className="py-1.5" />
                            </div>
                            <p className="mt-2 text-xs text-dim">
                                Across {summary.daysEarned} campaign-{summary.daysEarned === 1 ? "day" : "days"}.{" "}
                                {summary.pendingDays > 0 ? `${formatMoney(summary.pendingClearance)} of it, over ${summary.pendingDays} ${summary.pendingDays === 1 ? "day" : "days"}, is still inside its seven-day clearing window.` : "All of it has cleared."} Tax is withheld the moment each day is credited, not at withdrawal.
                            </p>
                        </Panel>
                    )}
                    <Panel>
                        <CardTitle>Monthly statements by email</CardTitle>
                        {emailRow ? (
                            <>
                                <div className="mt-3 flex items-center justify-between gap-4">
                                    <p className="text-sm text-dim">{emailRow.mandatory ? "Always on for this account." : "The payment advice, mailed on the first of the month."}</p>
                                    <Switch checked={emailOn} disabled={!!emailRow.mandatory || savingEmail} onCheckedChange={(next) => void setEmail(next)} aria-label="Email monthly statements" />
                                </div>
                                <p className="mt-2 text-xs text-dim">A month&apos;s payment advice is written on the first of the next month and can be downloaded from its row.</p>
                            </>
                        ) : (
                            <p className="mt-2 text-sm text-dim">A month&apos;s payment advice is written on the first of the next month and can be downloaded from its row. Nothing mails it on this account; the figures are all on this page.</p>
                        )}
                    </Panel>
                    {!data.gstin && (
                        <Panel>
                            <CardTitle>GST invoices</CardTitle>
                            <p className="mt-2 text-sm text-dim">A GST-registered publisher raises their own invoice on ADX each month from here. Add your GSTIN to your business profile and the invoice appears under each month.</p>
                            <Link href="/publisher/profile" className={cn(outlineButton, "mt-4")}>
                                Business profile
                            </Link>
                        </Panel>
                    )}
                    <Link href="/publisher/earnings" className={outlineButton}>
                        Back to earnings
                    </Link>
                </div>
            </div>
        </>
    );
}

function Figure({ label, value, strong }: { label: string; value: string | null; strong?: boolean }) {
    return (
        <span className="min-w-0">
            <span className="block text-[10px] font-medium uppercase tracking-wide text-dim">{label}</span>
            <span className={cn("block text-sm tabular-nums text-ink", strong && "font-semibold")}>{formatMoney(value)}</span>
        </span>
    );
}
