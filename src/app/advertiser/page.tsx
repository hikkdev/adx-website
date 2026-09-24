"use client";

import * as React from "react";
import Link from "next/link";
import { PageHeading, Panel } from "@/components/workspace/page-heading";
import { messageOf } from "@/lib/api-client";
import { campaignsService, type CampaignSummary } from "@/services/campaigns";
import { rupees } from "@/services/browse";

type State = { kind: "loading" } | { kind: "error"; message: string } | { kind: "ready"; campaigns: CampaignSummary[] };

/**
 * DR 12 · 03 · 04 · Advertiser · First campaign (5204:61913), and board 07's
 * Campaigns list once there are any. The first-campaign card is the design's
 * empty state, not a separate page: the same route, the same sidebar.
 */
export default function AdvertiserHome() {
    const [state, setState] = React.useState<State>({ kind: "loading" });

    React.useEffect(() => {
        let cancelled = false;
        campaignsService
            .list()
            .then((page) => {
                if (!cancelled) setState({ kind: "ready", campaigns: page.items });
            })
            .catch((caught: unknown) => {
                if (!cancelled) setState({ kind: "error", message: messageOf(caught, "Could not read your campaigns.") });
            });
        return () => {
            cancelled = true;
        };
    }, []);

    if (state.kind === "loading") {
        return <p className="text-sm text-dim">Loading your campaigns…</p>;
    }
    if (state.kind === "error") {
        return (
            <>
                <PageHeading title="Campaigns" />
                <Panel className="mt-6">
                    <p className="text-sm font-medium text-ink">Could not read your campaigns</p>
                    <p className="mt-1 text-sm text-dim">{state.message}</p>
                </Panel>
            </>
        );
    }

    if (state.campaigns.length === 0) return <FirstCampaign />;

    const drafts = state.campaigns.filter((c) => c.status === "DRAFT").length;
    return (
        <>
            <PageHeading
                title="Campaigns"
                subtitle={`${state.campaigns.length} campaign${state.campaigns.length === 1 ? "" : "s"}${drafts ? ` · ${drafts} draft${drafts === 1 ? "" : "s"}` : ""}`}
                actions={
                    <Link href="/advertiser/campaigns/new" className="rounded-md bg-brand px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#a51b1b]">
                        Create campaign
                    </Link>
                }
            />
            <Panel className="mt-6 p-0">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="border-b border-line text-left text-xs font-medium text-dim">
                            <th className="px-6 py-3">Campaign</th>
                            <th className="px-6 py-3">Schedule</th>
                            <th className="px-6 py-3 text-right">Total paid</th>
                            <th className="px-6 py-3">Status</th>
                            <th className="px-6 py-3" />
                        </tr>
                    </thead>
                    <tbody>
                        {state.campaigns.map((campaign) => (
                            <tr key={campaign.id} className="border-b border-line last:border-0">
                                <td className="px-6 py-4">
                                    <p className="font-medium text-ink">{campaign.name || "Untitled campaign"}</p>
                                    <p className="text-xs text-dim">{campaign.reference}{campaign.city ? ` · ${campaign.city}` : ""}</p>
                                </td>
                                <td className="px-6 py-4 text-ink">
                                    {campaign.startDate && campaign.endDate ? (
                                        <>
                                            {new Date(campaign.startDate).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })} – {new Date(campaign.endDate).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                                        </>
                                    ) : (
                                        <span className="text-dim">Not scheduled</span>
                                    )}
                                </td>
                                <td className="px-6 py-4 text-right tabular-nums text-ink">{campaign.totalAmount ? rupees(campaign.totalAmount) : "—"}</td>
                                <td className="px-6 py-4 text-dim">{campaign.status.replace(/_/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase())}</td>
                                <td className="px-6 py-4 text-right">
                                    <Link href={`/advertiser/campaigns/${campaign.id}`} className="text-sm font-semibold text-ink hover:text-brand">
                                        {campaign.status === "DRAFT" ? "Continue draft" : "View campaign"}
                                    </Link>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </Panel>
        </>
    );
}

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
