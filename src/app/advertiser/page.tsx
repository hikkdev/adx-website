"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { PageHeading, Panel } from "@/components/workspace/page-heading";
import { btnOutline, btnPrimary, Cell, LoadingLine, ErrorPanel, Segmented, StatusChip, TablePanel, Td, Th, useAsync } from "@/components/advertiser/bits";
import {
    advertiserWorkspace,
    CAMPAIGN_CHIPS,
    campaignContinueHref,
    campaignStatusLabel,
    campaignsSummary,
    chipStatuses,
    dateRange,
    daysLabel,
    rupees,
    spacesLine,
    type CampaignDetail,
    type CampaignListPage,
    type CampaignRow,
} from "@/services/advertiser-workspace";

type Chip = (typeof CAMPAIGN_CHIPS)[number]["value"];

/**
 * DR 12 · 07 · 01 · Campaigns (5204:75477) — the workspace home: the count
 * line, the three-way pill, the book as a table, and "Explore ad spaces"
 * under it. With no campaign at all it is 03 · 04's first-campaign card
 * (5204:61913) on the same route.
 */
export default function AdvertiserHome() {
    return (
        <React.Suspense fallback={<LoadingLine>Loading your campaigns…</LoadingLine>}>
            <CampaignsPage />
        </React.Suspense>
    );
}

interface Loaded {
    page: CampaignListPage;
    /** The detail of each scheduled row, so the status column can say "Artwork in review" the way the frame does. */
    details: Record<string, CampaignDetail>;
}

async function loadCampaigns(chip: Chip): Promise<Loaded> {
    const page = await advertiserWorkspace.campaigns({ status: chipStatuses(chip), sort: "NEWEST" });
    const scheduled = page.items.filter((row) => row.status === "SCHEDULED").slice(0, 12);
    const details: Record<string, CampaignDetail> = {};
    await Promise.all(
        scheduled.map(async (row) => {
            try {
                details[row.id] = await advertiserWorkspace.campaign(row.id);
            } catch {
                /* The row's own status stands. */
            }
        })
    );
    return { page, details };
}

function CampaignsPage() {
    const router = useRouter();
    const pathname = usePathname();
    const params = useSearchParams();
    const chipParam = params.get("chip");
    const chip: Chip = CAMPAIGN_CHIPS.some((c) => c.value === chipParam) ? (chipParam as Chip) : "ALL";
    const state = useAsync(`campaigns:${chip}`, () => loadCampaigns(chip), "Could not read your campaigns.");

    const setChip = (next: Chip) => {
        router.replace(next === "ALL" ? pathname : `${pathname}?chip=${next}`);
    };

    if (state.kind === "loading") return <LoadingLine>Loading your campaigns…</LoadingLine>;
    if (state.kind === "error") {
        return (
            <>
                <PageHeading title="Campaigns" />
                <ErrorPanel title="Could not read your campaigns" message={state.message} />
            </>
        );
    }

    const { page, details } = state.value;
    const everything = Object.values(page.counts ?? {}).reduce((sum, n) => sum + n, 0);
    if (chip === "ALL" && page.items.length === 0 && everything === 0) return <FirstCampaign />;

    return (
        <>
            <PageHeading
                title="Campaigns"
                actions={
                    <Link href="/advertiser/campaigns/new" className={btnPrimary}>
                        Create campaign
                    </Link>
                }
            />
            <p className="mt-5 text-sm text-dim">{campaignsSummary(page.counts, page.total)}</p>
            <div className="mt-3">
                <Segmented value={chip} options={CAMPAIGN_CHIPS.map((c) => ({ value: c.value, label: c.label }))} onChange={setChip} />
            </div>

            <TablePanel className="mt-4">
                <thead>
                    <tr>
                        <Th>Campaign</Th>
                        <Th>Schedule</Th>
                        <Th align="right">Total paid</Th>
                        <Th>Status</Th>
                        <Th />
                    </tr>
                </thead>
                <tbody>
                    {page.items.map((row) => (
                        <CampaignLine key={row.id} row={row} detail={details[row.id]} />
                    ))}
                    {page.items.length === 0 && (
                        <tr>
                            <Td className="py-8 text-center text-dim" align="left">
                                <span className="block text-center">{chip === "ACTIVE" ? "No active campaigns right now." : "No completed campaigns yet."}</span>
                            </Td>
                            <Td />
                            <Td />
                            <Td />
                            <Td />
                        </tr>
                    )}
                </tbody>
            </TablePanel>

            <div className="mt-6 flex justify-end">
                <Link href="/spaces" className={btnOutline}>
                    Explore ad spaces
                </Link>
            </div>
        </>
    );
}

function CampaignLine({ row, detail }: { row: CampaignRow; detail?: CampaignDetail }) {
    const status = campaignStatusLabel(detail ? { status: row.status, creatives: detail.creatives, launchBlockedBy: detail.launchBlockedBy } : { status: row.status });
    const isDraft = row.status === "DRAFT" || row.status === "PENDING_PAYMENT";
    const paid = !isDraft && row.total ? rupees(row.total) : "—";
    const scheduled = row.startDate && row.endDate;
    return (
        <tr className="border-t border-line">
            <Td>
                <Cell title={<span className="font-medium">{row.name || "Untitled campaign"}</span>} line={row.status === "DRAFT" ? "Draft · Campaign brief saved" : `${row.reference} · ${spacesLine(row.spotCount, row.city)}`} />
            </Td>
            <Td>
                {scheduled ? <Cell title={dateRange(row.startDate, row.endDate)} line={daysLabel(row.startDate, row.endDate)} /> : <Cell title="Not scheduled" line="Choose dates in your brief" />}
            </Td>
            <Td align="right" className="tabular-nums">
                {paid}
            </Td>
            <Td>
                <StatusChip label={status.label} tone={status.tone} pill={false} />
            </Td>
            <Td align="right">
                <Link href={isDraft ? campaignContinueHref(row) : `/advertiser/campaigns/${row.id}`} className="whitespace-nowrap text-sm font-semibold text-ink hover:text-brand">
                    {isDraft ? "Continue draft" : "View campaign"}
                </Link>
            </Td>
        </tr>
    );
}

/** DR 12 · 03 · 04 · Advertiser · First campaign (5204:61913): the empty state, same route, same sidebar. */
function FirstCampaign() {
    return (
        <>
            <PageHeading title="Welcome to your advertiser workspace" subtitle="Your account is ready. Start by choosing ad spaces or planning a campaign." />
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
        </>
    );
}
