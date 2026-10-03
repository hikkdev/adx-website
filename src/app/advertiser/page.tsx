"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { PageHeading, Panel } from "@/components/workspace/page-heading";
import { useAdvertiser } from "@/app/advertiser/layout";
import { btnOutline, btnPrimary, ErrorPanel, LoadingLine, useAsync } from "@/components/advertiser/bits";
import { DailyColumns, StatTile } from "@/components/advertiser/analytics-parts";
import { CampaignLine, CampaignTable, campaignDetailsFor } from "@/components/advertiser/campaign-list";
import { SetupCard } from "@/components/advertiser/setup-card";
import { useAuth } from "@/lib/auth";
import { advertiserWorkspace, campaignsSummary, shortDate, type CampaignDetail, type CampaignRow, type WalletSnapshot } from "@/services/advertiser-workspace";
import { campaignsHref, campaignsService, campaignTabOf, compact, deltaLabel, formatMoney, greetingFor, greetingNameOf, pacingChip, percentLabel, type CampaignPage, type PortfolioAnalytics } from "@/services/campaigns";

/** The Overview's window: the chart's days, and the tiles' comparison against the thirty before. */
const WINDOW_DAYS = 30;
const RECENT = 5;

/**
 * The advertiser's Overview — the page the workspace lands on (28 Sep 2026,
 * the owner: "Analytics should be above campaigns … will give dashboard
 * type feeling"). Board 07 draws no dashboard, so this one is laid out on
 * the publisher's Overview (DR 12 · 10 · 01, 5204:85443): the title with its
 * action, the figures, then the table with its "View all" link. Top down:
 * the greeting and the set-up card (QR-17), the key numbers (live,
 * upcoming, spent, reach), the daily scans, campaign history and the
 * wallet, then the five most recent campaigns. With no campaign at all the
 * heading and the first-campaign card are 03 · 04's (5204:61913) and the
 * numbers stand at zero around it. Old `/advertiser?chip=…&q=…` links (the
 * list lived here until the same day) are sent to the Campaigns page.
 */
export default function AdvertiserOverview() {
    return (
        <React.Suspense fallback={<LoadingLine>Loading your overview…</LoadingLine>}>
            <Overview />
        </React.Suspense>
    );
}

interface Loaded {
    page: CampaignPage;
    details: Record<string, CampaignDetail>;
}

async function loadRecent(): Promise<Loaded> {
    const page = await campaignsService.page({ sort: "NEWEST", page: 1, pageSize: RECENT });
    return { page, details: await campaignDetailsFor(page.items as CampaignRow[]) };
}

/** The earliest start among the scheduled campaigns — the Upcoming tile's line. */
function nextStartOf(rows: { startDate: string | null }[]): string | null {
    const starts = rows.map((row) => row.startDate).filter((d): d is string => !!d);
    return starts.length ? starts.reduce((earliest, d) => (d < earliest ? d : earliest)) : null;
}

function Overview() {
    const router = useRouter();
    const params = useSearchParams();
    const advertiser = useAdvertiser();
    const { user } = useAuth();
    const legacy = params.get("chip") !== null || params.get("q") !== null;

    /* A link from before the Overview (`/advertiser?chip=ENDED`) meant the list: it goes there with its filter. */
    React.useEffect(() => {
        if (!legacy) return;
        router.replace(campaignsHref({ tab: campaignTabOf(params.get("chip")), q: params.get("q") ?? "" }));
    }, [legacy, params, router]);

    const state = useAsync(legacy ? "overview:moving" : "overview", () => (legacy ? new Promise<Loaded>(() => undefined) : loadRecent()), "Could not read your campaigns.");
    const scheduled = state.kind === "ready" ? (state.value.page.counts?.["SCHEDULED"] ?? 0) : 0;
    const figures = useFigures(advertiser?.id ?? null, scheduled);
    /* The greeting reads the person's own clock; the page draws only after its reads land, so server and browser never disagree on it. */
    const greeting = greetingFor();

    if (legacy) return <LoadingLine>Opening your campaigns…</LoadingLine>;
    if (state.kind === "loading") return <LoadingLine>Loading your overview…</LoadingLine>;
    if (state.kind === "error") {
        return (
            <>
                <PageHeading title="Overview" />
                <ErrorPanel title="Could not read your campaigns" message={state.message} />
            </>
        );
    }

    const { page, details } = state.value;
    const counts = page.counts ?? {};
    const everything = Object.values(counts).reduce((sum, n) => sum + n, 0) || page.total;
    const rows = page.items as CampaignRow[];
    const first = everything === 0 && rows.length === 0;
    /* The person, never the account: a business account is named after the business. */
    const name = greetingNameOf(user);
    const hello = greeting ? `${greeting}${name ? `, ${name}` : ""}` : null;

    return (
        <>
            {hello && <p className="mb-1 text-sm font-medium text-dim">{hello}</p>}
            {first ? (
                <PageHeading title="Welcome to your advertiser workspace" subtitle="Your account is ready. Start by choosing ad spaces or planning a campaign." />
            ) : (
                <PageHeading
                    title="Overview"
                    subtitle="How your campaigns are doing, and what is coming up."
                    actions={
                        <>
                            <Link href="/spaces" className={btnOutline}>
                                Explore ad spaces
                            </Link>
                            <Link href="/advertiser/campaigns/new" className={btnPrimary}>
                                Create campaign
                            </Link>
                        </>
                    }
                />
            )}
            {advertiser && <SetupCard advertiserId={advertiser.id} />}

            <KeyNumbers counts={counts} portfolio={figures.portfolio} nextStart={figures.nextStart} />

            {first ? (
                <FirstCampaign />
            ) : (
                <Panel className="mt-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                            <h2 className="text-base font-semibold text-ink">Performance</h2>
                            {figures.portfolio && figures.portfolio.clickRate.value !== null && <p className="mt-1 text-xs text-dim">{percentLabel(figures.portfolio.clickRate.value)} click rate · {figures.portfolio.clickRate.basis}</p>}
                        </div>
                        <Link href="/advertiser/analytics" className="text-sm font-semibold text-ink hover:text-brand">
                            See full analytics →
                        </Link>
                    </div>
                    <div className="mt-3" data-testid="overview-performance">
                        {figures.portfolio ? (
                            <DailyColumns points={figures.portfolio.series.map((point) => ({ day: point.day, value: Number(point.scans) || 0 }))} unit="scans" caption={`QR scans a day across every campaign, last ${WINDOW_DAYS} days.`} extra={(day) => {
                                const spend = figures.portfolio?.series.find((point) => point.day === day)?.spend;
                                return spend ? `${formatMoney(spend)} spent` : null;
                            }} />
                        ) : (
                            <p className="rounded-md bg-ground px-4 py-6 text-center text-sm text-dim">{figures.portfolioFailed ? "The daily figures could not be read just now." : "Reading the daily figures…"}</p>
                        )}
                    </div>
                </Panel>
            )}

            <section className="mt-10 grid gap-10 lg:grid-cols-2" aria-label="History and wallet">
                <div>
                    <div className="flex items-center justify-between gap-3">
                        <h2 className="text-base font-semibold text-ink">Campaign history</h2>
                        <Link href={campaignsHref({ tab: "COMPLETED" })} className="text-sm font-medium text-ink hover:underline">
                            View history
                        </Link>
                    </div>
                    <div className="mt-5 flex flex-wrap items-end gap-6">
                        <Figure value={counts["COMPLETED"] ?? 0} label="Completed" href={campaignsHref({ tab: "COMPLETED" })} />
                        <Figure value={counts["CANCELLED"] ?? 0} label="Cancelled" href={campaignsHref({ tab: "CANCELLED" })} />
                        <Figure value={(counts["DRAFT"] ?? 0) + (counts["PENDING_PAYMENT"] ?? 0)} label="Drafts" href={campaignsHref({ tab: "DRAFTS" })} />
                    </div>
                    <p className="mt-3 text-sm text-dim">Every campaign you have run stays here, with its delivery proofs and invoice.</p>
                </div>
                <div>
                    <div className="flex items-center justify-between gap-3">
                        <h2 className="text-base font-semibold text-ink">Wallet</h2>
                        <Link href="/advertiser/billing" className="text-sm font-medium text-ink hover:underline">
                            Wallet &amp; billing
                        </Link>
                    </div>
                    <p className="mt-5 text-2xl font-semibold text-ink" data-testid="overview-wallet">
                        {figures.wallet ? formatMoney(figures.wallet.spendable) : "—"}
                    </p>
                    <p className="mt-3 text-sm text-dim">{figures.wallet ? "Available to spend on campaigns and plans." : "What your ADX credit is, and what it pays for."}</p>
                </div>
            </section>

            <section className="mt-10" aria-labelledby="recent-heading">
                <div className="flex flex-wrap items-end justify-between gap-4">
                    <div>
                        <h2 id="recent-heading" className="text-base font-semibold text-ink">
                            Recent campaigns
                        </h2>
                        <p className="mt-1 text-sm text-dim">{first ? "Nothing yet" : campaignsSummary(page.counts, page.total)}</p>
                    </div>
                    <Link href="/advertiser/campaigns" className="text-sm font-semibold text-ink hover:text-brand">
                        View all campaigns
                    </Link>
                </div>
                <CampaignTable className="mt-4" testId="recent-rows">
                    {rows.map((row) => (
                        <CampaignLine key={row.id} row={row} detail={details[row.id]} />
                    ))}
                    {rows.length === 0 && (
                        <tr>
                            <td colSpan={5} className="px-5 py-8 text-center text-sm text-dim">
                                Your drafts and booked campaigns will appear here — live, scheduled, completed and cancelled.
                            </td>
                        </tr>
                    )}
                </CampaignTable>
            </section>
        </>
    );
}

/**
 * The reads around the list, each failing to nothing on its own: the
 * portfolio over the window (`GET /campaigns/analytics?days=30` — spend to
 * date, the reach, the daily scans), the wallet, and — only while something
 * is scheduled — the scheduled campaigns, for the next start date.
 */
function useFigures(advertiserId: string | null, scheduled: number) {
    const [portfolio, setPortfolio] = React.useState<PortfolioAnalytics | null>(null);
    const [portfolioFailed, setPortfolioFailed] = React.useState(false);
    const [wallet, setWallet] = React.useState<WalletSnapshot | null>(null);
    const [nextStart, setNextStart] = React.useState<string | null>(null);

    React.useEffect(() => {
        let cancelled = false;
        campaignsService
            .portfolio({ days: WINDOW_DAYS })
            .then((answer) => {
                if (!cancelled) setPortfolio(answer);
            })
            .catch(() => {
                if (!cancelled) setPortfolioFailed(true);
            });
        return () => {
            cancelled = true;
        };
    }, []);

    React.useEffect(() => {
        if (!advertiserId) return;
        let cancelled = false;
        advertiserWorkspace
            .wallet(advertiserId)
            .then((row) => {
                if (!cancelled) setWallet(row);
            })
            .catch(() => undefined);
        return () => {
            cancelled = true;
        };
    }, [advertiserId]);

    React.useEffect(() => {
        if (scheduled <= 0) return;
        let cancelled = false;
        campaignsService
            .page({ status: ["SCHEDULED"], sort: "ENDING_SOON", page: 1, pageSize: 50 })
            .then((answer) => {
                if (!cancelled) setNextStart(nextStartOf(answer.items));
            })
            .catch(() => undefined);
        return () => {
            cancelled = true;
        };
    }, [scheduled]);

    return { portfolio, portfolioFailed, wallet, nextStart };
}

/** The four numbers the page opens on — two off the book's own counts, two off the portfolio read. */
function KeyNumbers({ counts, portfolio, nextStart }: { counts: Record<string, number>; portfolio: PortfolioAnalytics | null; nextStart: string | null }) {
    const live = counts["LIVE"] ?? 0;
    const paused = counts["PAUSED"] ?? 0;
    const scheduled = counts["SCHEDULED"] ?? 0;
    const caption = `vs the ${WINDOW_DAYS} days before`;
    return (
        <section aria-label="Key numbers" className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatTile label="Live campaigns" value={String(live + paused)} basis={paused ? `${paused} paused` : live ? "Up on their spaces now" : "None running right now"} testId="overview-live" />
            <StatTile label="Upcoming" value={String(scheduled)} basis={nextStart ? `Next one starts ${shortDate(nextStart)}` : scheduled ? "Paid, waiting for their start date" : "Nothing scheduled yet"} testId="overview-upcoming" />
            <StatTile label="Budget spent" value={portfolio ? formatMoney(portfolio.budgetSpent.value, { paise: "never" }) : "—"} basis={portfolio ? portfolio.budgetSpent.basis : "Reading your spend…"} chip={portfolio ? pacingChip(portfolio.budgetSpent.onTrack) : null} delta={portfolio ? deltaLabel(portfolio.comparison?.budgetSpent) : null} deltaCaption={caption} testId="overview-spend" />
            <StatTile
                label="Total reach"
                value={portfolio ? (portfolio.totalReach.value === null ? "Not measured" : compact(portfolio.totalReach.value)) : "—"}
                basis={portfolio ? portfolio.totalReach.basis : "Reading your reach…"}
                provenance={portfolio?.totalReach.provenance}
                delta={portfolio ? deltaLabel(portfolio.comparison?.totalReach) : null}
                deltaCaption={caption}
                testId="overview-reach"
            />
        </section>
    );
}

/** The publisher Overview's figure: a large number with its label, opening the tab it counts. */
function Figure({ value, label, href }: { value: number; label: string; href: string }) {
    return (
        <Link href={href} className="group flex items-baseline gap-2">
            <span className="text-2xl font-semibold tabular-nums text-ink group-hover:text-brand">{value}</span>
            <span className="text-sm text-dim group-hover:text-ink">{label}</span>
        </Link>
    );
}

/** DR 12 · 03 · 04 · Advertiser · First campaign (5204:61913): the card a new account starts from. */
function FirstCampaign() {
    return (
        <Panel className="mt-6">
            <h2 className="text-base font-semibold text-ink">Create your first campaign</h2>
            <p className="mt-2 text-sm text-dim">You have no campaigns yet. Your drafts and booked campaigns will appear here.</p>
            <h3 className="mt-6 text-base font-semibold text-ink">Choose how you want to begin</h3>
            <div className="mt-4 grid gap-6 md:grid-cols-2">
                <div className="rounded-lg bg-ground p-6">
                    <p className="text-base font-semibold text-ink">I know where I want to advertise</p>
                    <p className="mt-2 text-sm text-dim">Compare spaces, choose dates, and build your campaign cart.</p>
                    <Link href="/spaces" className="mt-5 inline-flex h-12 items-center rounded-md bg-brand px-6 text-sm font-semibold text-white hover:bg-[#a51b1b]">
                        Explore ad spaces
                    </Link>
                </div>
                <div className="rounded-lg bg-ground p-6">
                    <p className="text-base font-semibold text-ink">Help me plan a campaign</p>
                    <p className="mt-2 text-sm text-dim">Start with your brand, audience, location, and budget.</p>
                    <Link href="/advertiser/campaigns/new" className="mt-5 inline-flex h-12 items-center rounded-md border border-line bg-white px-6 text-sm font-semibold text-ink hover:border-ink">
                        Plan a campaign
                    </Link>
                </div>
            </div>
        </Panel>
    );
}
