"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import { messageOf } from "@/lib/api-client";
import { PageHeading } from "@/components/workspace/page-heading";
import { btnOutline, btnPrimary, ErrorPanel, LoadingLine, SelectBox, useAsync } from "@/components/advertiser/bits";
import { CampaignLine, CampaignTabBar, CampaignTable, campaignDetailsFor } from "@/components/advertiser/campaign-list";
import { campaignsSummary, type CampaignDetail, type CampaignRow } from "@/services/advertiser-workspace";
import { CAMPAIGN_SORTS, CAMPAIGN_TABS, campaignSortOf, campaignTabEmpty, campaignTabOf, campaignTabStatuses, campaignsService, type CampaignListSort, type CampaignPage, type CampaignTab } from "@/services/campaigns";

const PAGE_SIZE = 20;

/**
 * Campaigns — DR 12 · 07 · 01 (5204:75477), the whole book and its history:
 * the count line, the dark segmented tabs (every status in one of them,
 * drawn even at zero, each empty tab saying what will appear there), the
 * server's search and order, the frame's table with "Load more" past the
 * first page, and "Explore ad spaces" under it. Since 28 Sep 2026 the
 * workspace lands on the Overview and this is its second page; the old
 * `/advertiser?chip=` links are sent here by the Overview.
 */
export default function CampaignsPage() {
    return (
        <React.Suspense fallback={<LoadingLine>Loading your campaigns…</LoadingLine>}>
            <Campaigns />
        </React.Suspense>
    );
}

interface Loaded {
    page: CampaignPage;
    details: Record<string, CampaignDetail>;
}

async function loadCampaigns(tab: CampaignTab, q: string, sort: CampaignListSort, page = 1): Promise<Loaded> {
    const answer = await campaignsService.page({ status: campaignTabStatuses(tab), q, sort, page, pageSize: PAGE_SIZE });
    return { page: answer, details: await campaignDetailsFor(answer.items as CampaignRow[]) };
}

function Campaigns() {
    const router = useRouter();
    const pathname = usePathname();
    const params = useSearchParams();
    const tab = campaignTabOf(params.get("tab") ?? params.get("chip"));
    const q = (params.get("q") ?? "").trim();
    const sort = campaignSortOf(params.get("sort"));
    const [typed, setTyped] = React.useState(q);
    const key = `campaigns:${tab}:${q}:${sort}`;
    const state = useAsync(key, () => loadCampaigns(tab, q, sort), "Could not read your campaigns.");
    const [more, setMore] = React.useState<{ key: string; rows: CampaignRow[]; page: CampaignPage | null; details: Record<string, CampaignDetail>; busy: boolean; error: string | null }>({ key: "", rows: [], page: null, details: {}, busy: false, error: null });

    const replaceQuery = React.useCallback(
        (next: { tab?: CampaignTab; q?: string; sort?: CampaignListSort }) => {
            const query = new URLSearchParams();
            const t = next.tab ?? tab;
            const s = next.q ?? q;
            const o = next.sort ?? sort;
            if (t !== "ALL") query.set("tab", t);
            if (s) query.set("q", s);
            if (o !== "NEWEST") query.set("sort", o);
            const qs = query.toString();
            router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
        },
        [tab, q, sort, pathname, router]
    );

    /* The search goes to the server a beat after the last key — the book is one of many pages. */
    React.useEffect(() => {
        const next = typed.trim();
        if (next === q) return;
        const timer = setTimeout(() => replaceQuery({ q: next }), 350);
        return () => clearTimeout(timer);
    }, [typed, q, replaceQuery]);

    const extra = more.key === key ? more : null;
    const loadMore = async () => {
        if (state.kind !== "ready" || extra?.busy) return;
        const last = extra?.page ?? state.value.page;
        setMore({ key, rows: extra?.rows ?? [], page: last, details: extra?.details ?? {}, busy: true, error: null });
        try {
            const next = await loadCampaigns(tab, q, sort, last.page + 1);
            setMore((current) => ({ key, rows: [...(current.key === key ? current.rows : []), ...(next.page.items as CampaignRow[])], page: next.page, details: { ...(current.key === key ? current.details : {}), ...next.details }, busy: false, error: null }));
        } catch (caught) {
            setMore((current) => ({ ...current, key, busy: false, error: messageOf(caught, "Could not load any more.") }));
        }
    };

    const ready = state.kind === "ready" ? state.value : null;
    const counts = ready?.page.counts;
    const rows = ready ? [...(ready.page.items as CampaignRow[]), ...(extra?.rows ?? [])] : [];
    const details = ready ? { ...ready.details, ...(extra?.details ?? {}) } : {};
    const total = ready ? (extra?.page ?? ready.page).total : 0;
    const everything = counts ? Object.values(counts).reduce((sum, n) => sum + n, 0) : 0;
    const tabLabel = CAMPAIGN_TABS.find((entry) => entry.value === tab)?.label ?? "All campaigns";

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

            <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-dim" data-testid="campaigns-summary">
                    {ready ? campaignsSummary(counts, ready.page.total) : "\u00a0"}
                </p>
                <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
                    <label className="relative block w-full sm:w-[300px]">
                        <span className="sr-only">Search campaigns</span>
                        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-dim" aria-hidden />
                        <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="Search by name, brand or reference" maxLength={120} className="h-10 w-full rounded-full border border-line bg-white pl-9 pr-4 text-sm text-ink placeholder:text-dim focus:border-ink focus:outline-none" />
                    </label>
                    <SelectBox label="Sort campaigns" value={sort} onChange={(value) => replaceQuery({ sort: campaignSortOf(value) })} options={CAMPAIGN_SORTS.map((option) => ({ value: option.value, label: option.label }))} className="w-full sm:w-[180px]" />
                </div>
            </div>
            <div className="mt-3">
                <CampaignTabBar value={tab} counts={counts} onChange={(next) => replaceQuery({ tab: next })} />
            </div>

            {state.kind === "loading" && (
                <div className="mt-4">
                    <LoadingLine>Loading your campaigns…</LoadingLine>
                </div>
            )}
            {state.kind === "error" && <ErrorPanel className="mt-4" title="Could not read your campaigns" message={state.message} />}

            {ready && (
                <>
                    <CampaignTable className="mt-4" testId="campaigns-rows">
                        {rows.map((row) => (
                            <CampaignLine key={row.id} row={row} detail={details[row.id]} />
                        ))}
                        {rows.length === 0 && (
                            <tr>
                                <td colSpan={5} className="px-5 py-10 text-center">
                                    {q ? (
                                        <>
                                            <p className="text-sm text-dim">
                                                Nothing in {tab === "ALL" ? "your campaigns" : `“${tabLabel}”`} matches “{q}”. Try a wider search, or another tab.
                                            </p>
                                            <button
                                                type="button"
                                                className={`${btnOutline} mt-4`}
                                                onClick={() => {
                                                    setTyped("");
                                                    replaceQuery({ q: "" });
                                                }}
                                            >
                                                Clear the search
                                            </button>
                                        </>
                                    ) : (
                                        <>
                                            <p className="mx-auto max-w-[560px] text-sm text-dim" data-testid="campaigns-empty">
                                                {campaignTabEmpty(tab)}
                                            </p>
                                            <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                                                <Link href="/advertiser/campaigns/new" className={btnOutline}>
                                                    Plan a campaign
                                                </Link>
                                                {tab !== "ALL" && everything > 0 && (
                                                    <button type="button" className={btnOutline} onClick={() => replaceQuery({ tab: "ALL" })}>
                                                        Show all campaigns
                                                    </button>
                                                )}
                                            </div>
                                        </>
                                    )}
                                </td>
                            </tr>
                        )}
                    </CampaignTable>

                    {rows.length > 0 && (
                        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                            <p className="text-xs text-dim">
                                Showing {rows.length} of {total}
                            </p>
                            {rows.length < total && (
                                <button type="button" onClick={() => void loadMore()} disabled={extra?.busy} className={btnOutline}>
                                    {extra?.busy ? "Loading…" : "Load more"}
                                </button>
                            )}
                        </div>
                    )}
                    {extra?.error && <p className="mt-2 text-sm text-danger">{extra.error}</p>}
                </>
            )}

            <div className="mt-6 flex justify-end">
                <Link href="/spaces" className={btnOutline}>
                    Explore ad spaces
                </Link>
            </div>
        </>
    );
}
